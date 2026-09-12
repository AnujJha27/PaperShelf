import unittest
from uuid import UUID

from paper_radar.discovery.base import CandidateWork, FeedConfig
from paper_radar.pipeline import InMemoryDB, PipelineSettings, run_pipeline
from paper_radar.ranking import CandidateFeatures


class FakeAdapter:
    def __init__(self, count=3):
        self.count = count
        self.limits = []

    def search(self, feed, limit):
        self.limits.append(limit)
        return [CandidateWork(f"Paper {index}", identifiers={"openalex": f"W{index}"}, metadata={"semantic_similarity": 1.0}) for index in range(self.count)]


class PipelineTests(unittest.TestCase):
    def test_scheduled_mode_stops_before_discovery_when_not_stable(self):
        adapter = FakeAdapter()
        result = run_pipeline("scheduled", [FeedConfig("topic")], PipelineSettings(), InMemoryDB(), adapter)
        self.assertEqual(result.status, "skipped")
        self.assertEqual(adapter.limits, [])

    def test_training_mode_caps_batch_and_completes_run(self):
        adapter = FakeAdapter(4)
        result = run_pipeline("training", [FeedConfig("topic")], PipelineSettings(training_batch_size=2), InMemoryDB(), adapter)
        self.assertEqual(result.status, "completed")
        self.assertEqual(adapter.limits, [2])
        self.assertEqual(result.stats["candidates"], 4)

    def test_excluded_candidates_are_not_persisted(self):
        class Adapter(FakeAdapter):
            def search(self, feed, limit):
                return [CandidateWork("Good", abstract="formal methods", metadata={"semantic_similarity": 0.8}), CandidateWork("Education", abstract="education", metadata={"semantic_similarity": 0.8})]

        adapter = Adapter()
        db = InMemoryDB()
        result = run_pipeline("training", [FeedConfig("formal methods", exclude_keywords=["education"])], PipelineSettings(), db, adapter)
        self.assertEqual(result.stats["recommendations"], 1)
        self.assertNotIn("education", " ".join(db.papers))

    def test_keywordless_feeds_still_require_semantic_scope(self):
        class Adapter:
            def search(self, feed, limit):
                return [
                    CandidateWork("Relevant", metadata={"semantic_similarity": 0.8}),
                    CandidateWork("Noise", metadata={"semantic_similarity": 0.1}),
                ]

        db = InMemoryDB()
        result = run_pipeline("training", [FeedConfig("topic", min_semantic_similarity=0.35)], PipelineSettings(), db, Adapter())
        self.assertEqual(result.stats["recommendations"], 1)

    def test_scope_gate_requires_real_similarity_or_keyword_evidence(self):
        class Adapter:
            def search(self, feed, limit):
                return [
                    CandidateWork("Poor description hit", metadata={"semantic_similarity": 0.1}),
                    CandidateWork("Strong semantic result", metadata={"semantic_similarity": 0.8}),
                    CandidateWork("Graph theory result", metadata={"semantic_similarity": 0.1}),
                    CandidateWork("Graph theory benchmark", metadata={"semantic_similarity": 0.99}),
                    CandidateWork("Unknown year result", publication_year=None, metadata={"semantic_similarity": 0.8}),
                ]

        db = InMemoryDB()
        result = run_pipeline("training", [FeedConfig("topic", include_keywords=["graph theory"], exclude_keywords=["benchmark"], min_semantic_similarity=0.5)], PipelineSettings(), db, Adapter())
        self.assertEqual(result.stats["recommendations"], 3)
        self.assertEqual(result.stats["candidates_in_scope"], 3)

    def test_degraded_feed_is_reported_without_failing_run(self):
        class Adapter(FakeAdapter):
            warnings = [{"provider": "OpenAlex", "category": "rate_limited", "message": "provider rate limited request"}]

        result = run_pipeline("training", [FeedConfig("topic")], PipelineSettings(), InMemoryDB(), Adapter(1))
        self.assertEqual(result.status, "completed")
        self.assertEqual(result.stats["feeds_degraded"], 1)
        self.assertEqual(result.stats["warnings"][0]["provider"], "OpenAlex")

    def test_old_candidates_are_outside_a_feed_cutoff(self):
        class Adapter:
            def search(self, feed, limit):
                return [CandidateWork("Known classic", publication_year=2017, metadata={"semantic_retrieval": True})]

        result = run_pipeline("training", [FeedConfig("topic", min_publication_year=2020)], PipelineSettings(), InMemoryDB(), Adapter())
        self.assertEqual(result.stats["recommendations"], 0)

    def test_manual_mode_uses_persisted_model_features_for_ranked_slots(self):
        class RankedDB(InMemoryDB):
            def candidate_features(self, candidate, feed):
                return CandidateFeatures(candidate.title, 0.8, 0.0, global_probability=1.0 if candidate.title == "ZBest" else 0.0)

        class Adapter(FakeAdapter):
            def search(self, feed, limit):
                return [CandidateWork("AOther", metadata={"semantic_retrieval": True}), CandidateWork("ZBest", metadata={"semantic_retrieval": True})]

        db = RankedDB()
        result = run_pipeline("manual", [FeedConfig("topic")], PipelineSettings(max_feed_recommendations=1), db, Adapter())
        self.assertEqual(result.stats["recommendations"], 1)
        self.assertEqual(db.recommendations[0][1], "zbest")

    def test_discovery_respects_global_today_cap(self):
        db = InMemoryDB()
        result = run_pipeline(
            "scheduled",
            [FeedConfig("one", min_semantic_similarity=0), FeedConfig("two", min_semantic_similarity=0)],
            PipelineSettings(recommender_mode="stable", schedule_enabled=True, max_feed_recommendations=8, max_today_recommendations=1),
            db,
            FakeAdapter(3),
        )
        self.assertEqual(result.stats["recommendations"], 1)

    def test_existing_inbox_recommendations_are_not_reintroduced_per_feed(self):
        class Adapter(FakeAdapter):
            def search(self, feed, limit):
                return [CandidateWork("Same paper", identifiers={"openalex": "W1"})]

        db = InMemoryDB()
        settings = PipelineSettings(max_feed_recommendations=1, max_today_recommendations=10)
        feeds = [FeedConfig("one", id="feed-1", user_id="user", min_semantic_similarity=0), FeedConfig("two", id="feed-2", user_id="user", min_semantic_similarity=0)]
        first = run_pipeline("manual", feeds, settings, db, Adapter())
        second = run_pipeline("manual", feeds, settings, db, Adapter())
        self.assertEqual(first.stats["recommendations"], 2)
        self.assertEqual(second.stats["recommendations"], 0)
