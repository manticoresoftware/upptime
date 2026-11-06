"""Tests for the Upptime summary presentation adjustment."""

import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from show_monitored_urls import show_urls


class ReadmeUrlTests(unittest.TestCase):
    def test_shows_full_url_and_preserves_other_columns(self):
        url = "https://catalog.manticoresearch.com/?q=Tigris&limit=20&page=1"
        row = (
            '| <img alt="" src="icon.ico" height="13"> '
            f'[Catalog Search]({url}) | 🟩 Up | [catalog.yml](history) | 20ms | 100% |\n'
        )
        text = "Intro\n<!--start: status pages-->\n" + row + "<!--end: status pages-->\nOutro\n"
        result = show_urls(text)
        self.assertIn(f'[{url}]({url})<br><sub>Catalog Search</sub> | 🟩 Up', result)
        self.assertIn('| [catalog.yml](history) | 20ms | 100% |', result)
        self.assertTrue(result.startswith('Intro\n'))
        self.assertTrue(result.endswith('Outro\n'))
        self.assertEqual(show_urls(result), result)

    def test_handles_plain_links_and_private_endpoints(self):
        text = (
            '<!--start: status pages-->\n'
            '| [Manual (dev)](https://manual.manticoresearch.com/dev/) | 🟩 Up | history |\n'
            '| Secret Site | 🟩 Up | history |\n'
            '<!--end: status pages-->\n'
        )
        result = show_urls(text)
        self.assertIn('[https://manual.manticoresearch.com/dev/](https://manual.manticoresearch.com/dev/)<br><sub>Manual (dev)</sub>', result)
        self.assertIn('| Secret Site | 🟩 Up | history |', result)

    def test_rejects_missing_or_unexpected_summary(self):
        with self.assertRaises(ValueError):
            show_urls('No summary here')
        with self.assertRaises(ValueError):
            show_urls('<!--start: status pages-->\nNothing\n<!--end: status pages-->')


if __name__ == '__main__':
    unittest.main()
