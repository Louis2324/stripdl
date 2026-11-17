import json
import unittest
from urllib.parse import urlparse

from strip.parsers import get_parser
from strip.parsers.comix import ComixParser


SERIES_URL = "https://comix.to/title/93q1r-the-summoner"
CHAPTER_URL = f"{SERIES_URL}/123-chapter-2"


class FakeResponse:
    def __init__(self, body, *, json_data=None):
        self.content = body.encode("utf-8") if isinstance(body, str) else body
        self._json_data = json_data

    def raise_for_status(self):
        return None

    def json(self):
        if self._json_data is None:
            return json.loads(self.content)
        return self._json_data


class FakeSession:
    def __init__(self, pages):
        self.pages = pages
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        page = self.pages[url]
        return page if isinstance(page, FakeResponse) else FakeResponse(page)


class ComixParserTests(unittest.TestCase):
    def setUp(self):
        self.parser = ComixParser()
        self.parser.session = FakeSession({
            SERIES_URL: FakeResponse(
                """
                <html><head>
                  <meta property="og:title" content="The Summoner">
                  <meta property="og:description" content="A description">
                  <meta property="og:image" content="/covers/summoner.jpg">
                </head><body><h1>The Summoner</h1>
                <span class="author">Sample Author</span>
                <span class="status">Ongoing</span></body></html>
                """
            ),
            "https://comix.to/api/v1/manga/93q1r/chapters?page=1&limit=100&order[number]=asc": FakeResponse(
                "",
                json_data={
                    "items": [
                        {"id": "123", "number": "2", "title": "Two", "created_at": "2026-01-02"},
                        {"id": "122", "number": "1.5", "title": "Interlude"},
                    ]
                },
            ),
            "https://comix.to/api/v1/manga/93q1r/chapters?page=2&limit=100&order[number]=asc": FakeResponse(
                "", json_data={"items": []}
            ),
            CHAPTER_URL: FakeResponse(
                """
                <img data-src="https://img.example/1.jpg">
                <img src="https://img.example/2.jpg">
                <img src="https://img.example/2.jpg">
                """
            ),
        })

    def test_supports_only_https_title_urls(self):
        self.assertTrue(ComixParser.supports(SERIES_URL))
        self.assertFalse(ComixParser.supports("http://comix.to/title/abc"))
        self.assertFalse(ComixParser.supports("https://comix.to/browse"))
        self.assertFalse(ComixParser.supports("https://comix.to.evil.test/title/abc"))

    def test_canonicalizes_chapter_url(self):
        self.assertEqual(self.parser.canonicalize_url(CHAPTER_URL), SERIES_URL)

    def test_reads_metadata_from_comix_origin(self):
        info = self.parser.get_series_info(SERIES_URL)
        self.assertEqual(info.title, "The Summoner")
        self.assertEqual(info.author, "Sample Author")
        self.assertEqual(info.cover_url, "https://comix.to/covers/summoner.jpg")
        self.assertEqual(info.total_chapters, 2)
        self.assertEqual(info.extra["manga_id"], "93q1r")

    def test_reads_fractional_chapters_and_pages(self):
        chapters = self.parser.get_chapter_list(SERIES_URL)
        self.assertEqual([chapter.number for chapter in chapters], [1.5, 2.0])
        self.assertTrue(all("weebcentral" not in chapter.url for chapter in chapters))
        self.assertEqual(
            self.parser.get_chapter_images(CHAPTER_URL),
            ["https://img.example/1.jpg", "https://img.example/2.jpg"],
        )
        self.assertEqual(self.parser.get_image_headers()["Referer"], "https://comix.to/")

    def test_protected_api_response_is_actionable(self):
        endpoint = "https://comix.to/api/v1/manga/93q1r/chapters?page=1&limit=100&order[number]=asc"
        self.parser.session = FakeSession({endpoint: FakeResponse("", json_data={"e": "encrypted"})})
        with self.assertRaisesRegex(RuntimeError, "interactive browser session"):
            self.parser.get_chapter_list(SERIES_URL)

    def test_registry_uses_native_comix_parser(self):
        self.assertIsInstance(get_parser(SERIES_URL), ComixParser)


if __name__ == "__main__":
    unittest.main()
