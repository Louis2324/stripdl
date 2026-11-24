"""Parser for the public Comix title and chapter pages.

Comix is a JavaScript-heavy site whose endpoints and response envelopes change
frequently. This parser deliberately stays on the Comix origin and fails with a
clear error when the site requires a browser/session flow that the CLI cannot
provide. It must not silently substitute a similarly named title from another
provider.
"""

from __future__ import annotations

import json
import re
from typing import Any, Iterator, List
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from strip.parsers.base import ChapterInfo, SeriesInfo, SiteParser


_BASE_URL = "https://comix.to"
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_TIMEOUT = (10, 45)


def _make_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=4,
        connect=3,
        read=3,
        backoff_factor=0.75,
        status_forcelist={429, 500, 502, 503, 504},
        allowed_methods={"GET"},
        raise_on_status=False,
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=8)
    session.mount("https://", adapter)
    session.headers.update({
        "User-Agent": _UA,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    })
    return session


def _first(item: dict, *keys: str, default: Any = "") -> Any:
    for key in keys:
        value = item.get(key)
        if value not in (None, ""):
            return value
    return default


def _as_number(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class ComixParser(SiteParser):
    """Read metadata and pages from Comix without a cross-provider bridge."""

    def __init__(self):
        self.session = _make_session()

    @classmethod
    def supports(cls, url: str) -> bool:
        try:
            parsed = urlparse(url)
        except ValueError:
            return False
        return (
            parsed.scheme == "https"
            and parsed.hostname in {"comix.to", "www.comix.to"}
            and parsed.path.startswith("/title/")
        )

    @property
    def name(self) -> str:
        return "Comix"

    def canonicalize_url(self, url: str) -> str:
        parsed = urlparse(url)
        match = re.match(r"^/title/([^/]+)", parsed.path.rstrip("/"))
        if not match:
            return url
        return urlunparse(("https", "comix.to", f"/title/{match.group(1)}", "", "", ""))

    def _title_slug(self, url: str) -> str:
        path = urlparse(self.canonicalize_url(url)).path.strip("/").split("/")
        if len(path) != 2 or path[0] != "title":
            raise ValueError(f"Unsupported Comix title URL: {url}")
        return path[1]

    def _manga_id(self, url: str) -> str:
        return self._title_slug(url).split("-", 1)[0]

    def _get(self, url: str, *, referer: str = _BASE_URL):
        response = self.session.get(
            url,
            headers={"Referer": referer},
            timeout=_TIMEOUT,
        )
        response.raise_for_status()
        return response

    @staticmethod
    def _initial_data(soup: BeautifulSoup) -> dict:
        script = soup.find("script", id="initial-data")
        if not script:
            return {}
        try:
            value = json.loads(script.string or script.get_text())
        except (TypeError, json.JSONDecodeError):
            return {}
        return value if isinstance(value, dict) else {}

    @staticmethod
    def _payload_items(payload: Any) -> list[dict]:
        if not isinstance(payload, dict):
            return []
        for key in ("items", "chapters", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
            if isinstance(value, dict):
                nested = ComixParser._payload_items(value)
                if nested:
                    return nested
        return []

    def _json_endpoint(self, url: str, *, referer: str = _BASE_URL) -> dict:
        response = self._get(url, referer=referer)
        try:
            value = response.json()
        except ValueError as exc:
            raise RuntimeError("Comix returned a non-JSON API response") from exc
        if isinstance(value, dict) and value.get("e"):
            raise RuntimeError(
                "Comix returned protected chapter data; an interactive browser "
                "session may be required"
            )
        if not isinstance(value, dict):
            raise RuntimeError("Comix returned an invalid API response")
        return value

    def get_series_info(self, url: str) -> SeriesInfo:
        canonical = self.canonicalize_url(url)
        response = self._get(canonical)
        soup = BeautifulSoup(response.content, "html.parser")
        data = self._initial_data(soup)

        title_node = soup.find("h1") or soup.find("meta", property="og:title")
        title = (
            title_node.get("content", "")
            if title_node and title_node.name == "meta"
            else title_node.get_text(" ", strip=True) if title_node else ""
        )
        if not title:
            title = str(_first(data, "title", "name", default="Unknown"))

        description_node = soup.find("meta", property="og:description")
        description = description_node.get("content", "") if description_node else ""
        cover_node = soup.find("meta", property="og:image")
        cover = cover_node.get("content", "") if cover_node else ""
        author_node = soup.select_one("[class*='author'], [class*='artist']")
        author = author_node.get_text(" ", strip=True) if author_node else ""
        status_node = soup.select_one("[class*='status']")
        status = status_node.get_text(" ", strip=True).lower() if status_node else ""

        try:
            total = len(self.get_chapter_list(canonical))
        except RuntimeError:
            total = 0
        return SeriesInfo(
            title=title.strip() or "Unknown",
            author=author,
            description=description,
            cover_url=urljoin(_BASE_URL, cover) if cover else "",
            url=canonical,
            status=status,
            total_chapters=total,
            extra={"site": "comix.to", "manga_id": self._manga_id(canonical)},
        )

    def _chapter_items(self, url: str, page: int) -> list[dict]:
        manga_id = self._manga_id(url)
        endpoint = (
            f"{_BASE_URL}/api/v1/manga/{manga_id}/chapters"
            f"?page={page}&limit=100&order[number]=asc"
        )
        payload = self._json_endpoint(endpoint, referer=self.canonicalize_url(url))
        return self._payload_items(payload)

    def get_chapter_list(self, url: str) -> List[ChapterInfo]:
        canonical = self.canonicalize_url(url)
        chapters: list[ChapterInfo] = []
        seen: set[str] = set()
        for page in range(1, 101):
            items = self._chapter_items(canonical, page)
            if not items:
                break
            for item in items:
                number = _as_number(_first(item, "number", "chapter", default=None))
                if number is None:
                    continue
                chapter_id = str(_first(item, "id", "chapter_id", "hid", default=""))
                if chapter_id and chapter_id in seen:
                    continue
                if chapter_id:
                    seen.add(chapter_id)
                raw_url = _first(item, "url", "chapter_url", default="")
                if raw_url:
                    chapter_url = urljoin(_BASE_URL, str(raw_url))
                else:
                    slug = self._title_slug(canonical)
                    chapter_url = f"{_BASE_URL}/title/{slug}/{chapter_id}-chapter-{number:g}"
                chapters.append(ChapterInfo(
                    number=number,
                    title=str(_first(item, "title", "name", default=f"Chapter {number:g}")),
                    url=chapter_url,
                    date=str(_first(item, "created_at", "createdAt", "date", default="")),
                    thumbnail_url=str(_first(item, "thumbnail", "cover", default="")),
                    extra={"site": "comix.to", "chapter_id": chapter_id},
                ))
            if len(items) < 100:
                break
        chapters.sort(key=lambda chapter: chapter.number)
        return chapters

    def iter_chapter_list(self, url: str) -> Iterator[ChapterInfo]:
        yield from self.get_chapter_list(url)

    def get_chapter_images(self, chapter_url: str) -> List[str]:
        response = self._get(chapter_url, referer=_BASE_URL)
        soup = BeautifulSoup(response.content, "html.parser")
        urls: list[str] = []
        for image in soup.select("img[data-src], img[data-original], img[src]"):
            source = image.get("data-src") or image.get("data-original") or image.get("src")
            if source and source.startswith(("https://", "http://")):
                urls.append(source)
        if urls:
            return list(dict.fromkeys(urls))

        raise RuntimeError(
            "Comix did not expose chapter pages in the public HTML; an interactive "
            "browser/session may be required"
        )

    def get_image_headers(self) -> dict:
        return {"User-Agent": _UA, "Referer": f"{_BASE_URL}/"}
