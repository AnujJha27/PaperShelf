import unittest

from paper_radar.ranking import CandidateFeatures, score_candidates, select_with_exploration


class RankingTests(unittest.TestCase):
    def test_rejected_and_excluded_candidates_never_survive(self):
        candidates = [
            CandidateFeatures("good", 0.8, 1.0),
            CandidateFeatures("rejected", 0.9, 1.0, rejected=True),
            CandidateFeatures("excluded", 0.9, 1.0, excluded=True),
        ]
        self.assertEqual([item.paper_id for item in score_candidates(candidates)], ["good"])

    def test_exploration_stays_inside_feed_scope_gate(self):
        candidates = score_candidates([
            CandidateFeatures("keyword", 0.1, 1.0, global_probability=0.5),
            CandidateFeatures("semantic", 0.8, 0.0, global_probability=0.5, min_semantic_similarity=0.35),
            CandidateFeatures("noise", 0.1, 0.0, global_probability=0.5, min_semantic_similarity=0.35),
        ])
        selected = select_with_exploration(candidates, 3, exploration_rate=1.0)
        self.assertNotIn("noise", [item.paper_id for item in selected])

    def test_missing_feed_model_redistributes_its_weight(self):
        result = score_candidates([CandidateFeatures("paper", 1.0, 0.0, global_probability=0.0)])[0]
        self.assertAlmostEqual(result.final_score, 0.35 + (0.25 * (0.35 / 0.65)))

    def test_exploitation_uses_diversity_when_scores_are_close(self):
        scored = score_candidates([
            CandidateFeatures("A", 1.0, 0.0, global_probability=1.0, diversity_vector=(1.0, 0.0)),
            CandidateFeatures("B", 0.98, 0.0, global_probability=1.0, diversity_vector=(1.0, 0.0)),
            CandidateFeatures("C", 0.7, 0.0, global_probability=1.0, diversity_vector=(0.0, 1.0)),
        ])
        self.assertEqual([item.paper_id for item in select_with_exploration(scored, 2, 0)], ["A", "C"])
