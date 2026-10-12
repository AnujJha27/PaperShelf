import unittest
import json
from pathlib import Path

from paper_radar.discovery.base import CandidateWork, FeedConfig
from paper_radar.gates import keyword_score, paper_text, passes_hard_gates, strong_keyword_evidence, topic_gate
from paper_radar.pipeline import _candidate_features
from paper_radar.technicality import THRESHOLD, bootstrap_metrics, predict_technicality


class RecommenderGateTests(unittest.TestCase):
    def test_arbitrary_provider_metadata_is_not_candidate_prose(self):
        text = paper_text("A study of markets", "We analyze prices.")
        self.assertEqual(keyword_score(text, ["benchmark", "machine learning"]), 0)
        features = _candidate_features(CandidateWork("A study of markets", metadata={"provider_note": "machine learning benchmark"}), FeedConfig("finance", include_keywords=["machine learning"]))
        self.assertEqual(features.keyword_score, 0)

    def test_single_keyword_does_not_bypass_semantic_scope(self):
        self.assertFalse(topic_gate(0.12, 0.4, False))
        self.assertFalse(strong_keyword_evidence("ai", [], ["ai"]))
        self.assertFalse(passes_hard_gates(0.12, 0.4, False, 0.99, "broad"))

    def test_specific_phrase_can_rescue_only_a_bounded_semantic_near_miss(self):
        self.assertTrue(topic_gate(0.31, 0.4, True))
        self.assertFalse(topic_gate(0.27, 0.4, True))

    def test_technicality_gate_is_independent_of_topic_relevance(self):
        self.assertFalse(passes_hard_gates(0.9, 0.4, False, 0.3, "technical"))
        self.assertTrue(passes_hard_gates(0.9, 0.4, False, 0.8, "technical"))
        self.assertTrue(passes_hard_gates(0.9, 0.4, False, 0.1, "broad"))

    def test_contextual_ai_papers_and_technical_methods_separate(self):
        student = predict_technicality("University students' perceptions of large language models", "Interviews describe trust, motivation, and academic integrity.")
        governance = predict_technicality("Ethical governance of autonomous AI agents", "A policy analysis discusses accountability and public oversight.")
        inference = predict_technicality("Verifier-guided inference-time search for language models", "A search algorithm uses proof feedback and benchmark evaluation.")
        formal = predict_technicality("Formal semantics for tool-using language-model agents", "We define typed action traces and prove verifier soundness.")
        mathematics = predict_technicality("A theorem on spectral gaps of random graphs", "We prove a bound using concentration inequalities.")
        incidental = predict_technicality("Federated gradient compression evaluated on education data", "We prove convergence and report benchmark results.")
        self.assertLess(student, THRESHOLD)
        self.assertLess(governance, THRESHOLD)
        self.assertGreater(inference, THRESHOLD)
        self.assertGreater(formal, THRESHOLD)
        self.assertGreater(mathematics, THRESHOLD)
        self.assertGreater(incidental, THRESHOLD)

    def test_bootstrap_metrics_are_held_out_and_above_chance(self):
        metrics = bootstrap_metrics()
        self.assertEqual(metrics["held_out_examples"], 32)
        self.assertGreater(metrics["balanced_accuracy"], 0.5)
        stored = json.loads((Path(__file__).parents[1] / "src/paper_radar/technicality_metrics.json").read_text())
        self.assertEqual(stored["held_out_examples"], metrics["held_out_examples"])
        self.assertEqual(stored["balanced_accuracy"], metrics["balanced_accuracy"])
