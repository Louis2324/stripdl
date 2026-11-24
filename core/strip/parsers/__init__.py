# strip/parsers/__init__.py
# Parser registry – automatically maps URL patterns to the correct parser class.

from strip.parsers.webtoons import WebtoonsParser
from strip.parsers.weebcentral import WeebCentralParser
from strip.parsers.comix import ComixParser
from strip.parsers.asurascans import AsuraScansParser
from strip.parsers.mangakakalot import MangaKakalotParser

PARSERS = [
    WebtoonsParser,
    WeebCentralParser,
    ComixParser,
    AsuraScansParser,
    MangaKakalotParser,
]

PROVIDER_DETAILS = (
    {"name": "Webtoon", "domains": "webtoons.com", "pattern": "https://www.webtoons.com/...", "notes": "Direct parser"},
    {"name": "WeebCentral", "domains": "weebcentral.com", "pattern": "https://weebcentral.com/...", "notes": "Direct parser"},
    {"name": "Comix", "domains": "comix.to", "pattern": "https://comix.to/title/...", "notes": "Native parser; protected API may need a browser session"},
    {"name": "Asura Scans", "domains": "asurascans.com", "pattern": "https://asurascans.com/comics/...", "notes": "Direct parser"},
    {"name": "MangaKakalot", "domains": "mangakakalot.gg", "pattern": "https://www.mangakakalot.gg/manga/...", "notes": "Direct parser"},
)


def provider_details():
    """Return stable provider metadata for CLI and desktop discovery."""
    return [
        {key: item[key] for key in ("name", "domains", "pattern", "notes")}
        for item in PROVIDER_DETAILS
    ]


def get_parser(url: str):
    """Return an instantiated parser that supports *url*, or raise ValueError."""
    for cls in PARSERS:
        if cls.supports(url):
            return cls()
    raise ValueError(
        f"No parser found for URL: {url}\n"
        "Supported sites: webtoons.com, weebcentral.com, comix.to, asurascans.com, mangakakalot.gg"
    )
