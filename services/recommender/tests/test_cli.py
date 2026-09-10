import sys
import unittest
from unittest.mock import patch

from paper_radar.cli import EnrichedAdapter, main
from paper_radar.discovery.base import CandidateWork, FeedConfig


class CliTests(unittest.TestCase):
    def test_empty_workflow_request_id_is_treated_as_missing(self):
        with patch.object(sys, "argv", ["paper-radar", "run", "--mode", "training", "--request-id", ""]):
            main()

    def test_optional_enrichment_budget_failure_keeps_candidate(self):
        class Discovery:
            def search(self, feed, limit):
                return [CandidateWork("Paper", doi="10.1000/test")]

        class FailingCrossref:
            def repair(self, candidate):
                raise RuntimeError("budget exhausted")

        class SemanticScholar:
            def enrich(self, candidate):
                return candidate

        class Unpaywall:
            def lookup(self, doi):
                raise RuntimeError("budget exhausted")

        result = EnrichedAdapter(Discovery(), FailingCrossref(), SemanticScholar(), Unpaywall()).search(FeedConfig("topic"), 1)
        self.assertEqual(result[0].title, "Paper")
