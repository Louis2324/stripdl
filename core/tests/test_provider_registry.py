import unittest

from strip.parsers import get_parser, provider_details
from strip.parsers.asurascans import AsuraScansParser
from strip.parsers.comix import ComixParser
from strip.parsers.mangakakalot import MangaKakalotParser
from strip.parsers.webtoons import WebtoonsParser
from strip.parsers.weebcentral import WeebCentralParser


class ProviderRegistryTests(unittest.TestCase):
    CASES = (
        ("https://www.webtoons.com/en/action/sample/list?title_no=1", WebtoonsParser),
        ("https://weebcentral.com/series/sample/Sample", WeebCentralParser),
        ("https://comix.to/title/93q1r-the-summoner", ComixParser),
        ("https://asurascans.com/comics/sample-series-abc123", AsuraScansParser),
        ("https://mangakakalot.gg/manga/sample", MangaKakalotParser),
    )

    def test_every_registered_provider_is_discoverable(self):
        self.assertEqual(len(provider_details()), len(self.CASES))
        for url, parser_type in self.CASES:
            with self.subTest(url=url):
                self.assertIsInstance(get_parser(url), parser_type)

    def test_registry_rejects_unknown_or_unsafe_urls(self):
        with self.assertRaises(ValueError):
            get_parser("https://example.test/title/unknown")
        with self.assertRaises(ValueError):
            get_parser("http://comix.to/title/unsafe")


if __name__ == "__main__":
    unittest.main()
