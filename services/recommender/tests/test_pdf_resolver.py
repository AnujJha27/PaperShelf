import unittest

from paper_radar.pdf_resolver import rank_oa_sources


class PdfResolverTests(unittest.TestCase):
    def test_prefers_published_then_accepted_repository_and_preprint(self):
        locations = [
            {"pdf_url": "https://preprint.example/p.pdf", "version": "submittedVersion", "is_oa": True},
            {"pdf_url": "https://repo.example/a.pdf", "version": "acceptedVersion", "is_oa": True},
            {"pdf_url": "https://journal.example/a.pdf", "version": "publishedVersion", "is_oa": True},
        ]
        sources = rank_oa_sources({}, locations, None)
        self.assertEqual([source.version_kind for source in sources], ["published", "accepted_manuscript", "preprint"])

    def test_rejects_non_https_and_non_oa_sources(self):
        sources = rank_oa_sources({}, [{"pdf_url": "http://unsafe.example/a.pdf", "is_oa": True}, {"pdf_url": "https://paid.example/a.pdf", "is_oa": False}], None)
        self.assertEqual(sources, [])
