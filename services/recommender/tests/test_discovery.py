import unittest
from unittest.mock import patch

from paper_radar.discovery.base import CandidateWork, FeedConfig
from paper_radar.discovery.crossref import CrossrefAdapter, candidate_from_crossref
from paper_radar.discovery.http import RequestBudget
from paper_radar.discovery.openalex import OpenAlexAdapter, candidate_from_openalex, openalex_queries
from paper_radar.discovery.semantic_scholar import SemanticScholarAdapter


class DiscoveryTests(unittest.TestCase):
    def test_openalex_mapping_reconstructs_abstract_and_queries(self):
        work = {
            "id": "https://openalex.org/W1",
            "title": "A paper",
            "publication_year": 2024,
            "authorships": [{"author": {"display_name": "A"}}],
            "abstract_inverted_index": {"abstract": [0], "text": [1]},
        }
        candidate = candidate_from_openalex(work)
        self.assertEqual(candidate.identifiers["openalex"], "W1")
        self.assertEqual(candidate.abstract, "abstract text")
        self.assertEqual(openalex_queries(FeedConfig(description="formal methods", include_keywords=["Lean"]), 10), ["formal methods", "Lean"])

    def test_openalex_queries_include_priority_keywords_without_duplicates(self):
        self.assertEqual(openalex_queries(FeedConfig(description="topic", include_keywords=["Lean"], priority_keywords=["Lean", "proof certificates"]), 10), ["topic", "Lean", "proof certificates"])

    def test_openalex_search_applies_feed_publication_cutoff(self):
        with patch("paper_radar.discovery.openalex.get_json", return_value={}) as get_json:
            OpenAlexAdapter(request_budget=RequestBudget(1)).search(FeedConfig("topic", min_publication_year=2020), 5)
        self.assertEqual(get_json.call_args.args[1]["filter"], "from_publication_date:2020-01-01")

    def test_crossref_mapping_repairs_doi(self):
        candidate = candidate_from_crossref({"DOI": "10.1000/ABC", "title": ["A paper"], "author": [{"given": "A", "family": "Researcher"}]})
        self.assertEqual(candidate.doi, "10.1000/abc")
        self.assertEqual(candidate.authors, ["A Researcher"])

    def test_crossref_repairs_missing_doi_by_title(self):
        with patch("paper_radar.discovery.crossref.get_json", return_value={"message": {"items": [{"DOI": "10.1000/found", "title": ["A paper"]}]}}):
            repaired = CrossrefAdapter().repair(CandidateWork("A paper"))
        self.assertEqual(repaired.doi, "10.1000/found")

    def test_request_budget_stops_after_limit(self):
        budget = RequestBudget(1)
        budget.consume()
        with self.assertRaises(RuntimeError):
            budget.consume()

    def test_semantic_scholar_budget_failure_does_not_break_candidate(self):
        with patch("paper_radar.discovery.semantic_scholar.get_json", side_effect=RuntimeError("budget")):
            candidate = SemanticScholarAdapter().enrich(CandidateWork("Paper", doi="10.1000/test"))
        self.assertEqual(candidate.title, "Paper")

    def test_semantic_scholar_enrichment_fills_missing_metadata(self):
        with patch("paper_radar.discovery.semantic_scholar.get_json", return_value={"abstract": "A summary", "citationCount": 12, "openAccessPdf": {"url": "https://repo.test/paper.pdf"}}):
            candidate = SemanticScholarAdapter().enrich(CandidateWork("Paper", doi="10.1000/test"))
        self.assertEqual(candidate.abstract, "A summary")
        self.assertEqual(candidate.metadata["citation_count"], 12)
