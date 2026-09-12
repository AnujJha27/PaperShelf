import sys
import unittest
from unittest.mock import patch

from paper_radar.cli import EnrichedAdapter, _exit_if_failed, main
from paper_radar.discovery.base import CandidateWork, FeedConfig


class CliTests(unittest.TestCase):
    def test_failed_result_returns_a_failed_process(self):
        with self.assertRaises(SystemExit) as error:
            _exit_if_failed("failed")
        self.assertEqual(error.exception.code, 1)

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

    def test_discovery_rate_limit_skips_feed_without_failing_batch(self):
        class RateLimitedDiscovery:
            def search(self, feed, limit):
                raise OSError("HTTP Error 429: Too Many Requests")

        result = EnrichedAdapter(RateLimitedDiscovery(), object(), object(), None).search(FeedConfig("topic"), 25)
        self.assertEqual(result, [])
