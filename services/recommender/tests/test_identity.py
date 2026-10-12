import unittest
from uuid import UUID

from paper_radar.identity import canonicalize_doi, choose_existing_paper, normalize_identifier, normalized_identifiers


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

    def test_title_match_without_a_durable_identifier_does_not_choose_a_canonical_paper(self):
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
        self.assertIsNone(choose_existing_paper(candidate, existing))

    def test_does_not_merge_short_similar_titles(self):
        candidate = {"title": "Methods", "authors": ["A"], "publication_year": 2024}
        existing = [{"id": UUID("00000000-0000-0000-0000-000000000003"), "title": "Methods", "authors": ["B"], "publication_year": 2024}]
        self.assertIsNone(choose_existing_paper(candidate, existing))

    def test_normalizes_all_durable_ids_before_matching(self):
        self.assertEqual(normalize_identifier("arxiv", "https://arxiv.org/abs/2401.12345v2"), "2401.12345")
        self.assertEqual(normalized_identifiers({"doi": "https://doi.org/10.1000/ABC", "identifiers": {"openalex": "https://openalex.org/W123"}}), {"doi": "10.1000/abc", "openalex": "W123"})

    def test_multiple_matching_ids_choose_richer_record_not_mapping_order(self):
        candidate = {"doi": "10.1000/test", "identifiers": {"openalex": "W2"}, "title": "A paper"}
        sparse = {"id": UUID("00000000-0000-0000-0000-000000000002"), "doi": "10.1000/test", "title": "A paper"}
        rich = {"id": UUID("00000000-0000-0000-0000-000000000001"), "openalex_id": "W2", "title": "A detailed research paper", "abstract": "A" * 1000, "authors": [{"name": "A"}], "venue": "Venue", "publication_year": 2024}
        self.assertEqual(choose_existing_paper(candidate, [sparse, rich]), rich["id"])
        self.assertEqual(choose_existing_paper(candidate, [rich, sparse]), rich["id"])
