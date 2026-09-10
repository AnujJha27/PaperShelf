import unittest
from uuid import UUID

from paper_radar.zotero_sync import match_zotero_item, weak_zotero_similarity


class ZoteroSyncTests(unittest.TestCase):
    def test_matches_by_doi_before_title(self):
        paper_id = UUID("00000000-0000-0000-0000-000000000010")
        self.assertEqual(match_zotero_item({"DOI": "10.1000/ABC", "title": "Different"}, [{"id": paper_id, "doi": "10.1000/abc", "title": "Paper"}]), paper_id)

    def test_matches_conservatively_by_title(self):
        paper_id = UUID("00000000-0000-0000-0000-000000000011")
        self.assertEqual(match_zotero_item({"title": "A useful study"}, [{"id": paper_id, "title": "A useful study"}]), paper_id)

    def test_zotero_similarity_is_a_capped_weak_prior(self):
        self.assertAlmostEqual(weak_zotero_similarity([1, 0], [{"embedding": [1, 0]}]), 0.2)
