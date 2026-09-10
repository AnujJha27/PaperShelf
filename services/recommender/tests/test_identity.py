import unittest
from uuid import UUID

from paper_radar.identity import canonicalize_doi, choose_existing_paper


class IdentityTests(unittest.TestCase):
    def test_canonicalizes_doi_urls_and_case(self):
        self.assertEqual(canonicalize_doi("https://doi.org/10.1000/ABC"), "10.1000/abc")
        self.assertIsNone(canonicalize_doi("not-a-doi"))

    def test_prefers_exact_doi_or_source_identifier(self):
        candidate = {
            "doi": "10.1000/test",
            "identifiers": {"openalex": "W1"},
            "title": "A paper",
            "authors": ["A"],
            "publication_year": 2024,
        }
        existing = [{"id": UUID("00000000-0000-0000-0000-000000000001"), "doi": "10.1000/test"}]
        self.assertEqual(choose_existing_paper(candidate, existing), existing[0]["id"])

    def test_uses_conservative_title_fallback(self):
        candidate = {
            "title": "A useful study",
            "authors": ["A"],
            "publication_year": 2024,
        }
        existing = [{
            "id": UUID("00000000-0000-0000-0000-000000000002"),
            "title": "A useful study",
            "authors": ["A"],
            "publication_year": 2024,
        }]
        self.assertEqual(choose_existing_paper(candidate, existing), existing[0]["id"])

    def test_does_not_merge_short_similar_titles(self):
        candidate = {"title": "Methods", "authors": ["A"], "publication_year": 2024}
        existing = [{"id": UUID("00000000-0000-0000-0000-000000000003"), "title": "Methods", "authors": ["B"], "publication_year": 2024}]
        self.assertIsNone(choose_existing_paper(candidate, existing))
