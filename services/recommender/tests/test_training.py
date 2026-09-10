import unittest

from paper_radar.training import examples_from_rows, train_and_store_models


class TrainingTests(unittest.TestCase):
    def test_feedback_labels_join_to_persisted_embeddings(self):
        rows = [
            {"paper_id": "a", "label": "relevant", "weight": 1},
            {"paper_id": "b", "label": "not_relevant", "weight": 1},
            {"paper_id": "missing", "label": "relevant", "weight": 1},
        ]
        examples = examples_from_rows(rows, {"a": [1, 0], "b": [0, 1]})
        self.assertEqual([(item.label, item.features) for item in examples], [(1, (1.0, 0.0)), (0, (0.0, 1.0))])

    def test_training_features_append_metadata_signals_to_embeddings(self):
        rows = [{"paper_id": "a", "label": "relevant", "weight": 1}]
        examples = examples_from_rows(rows, {"a": [1, 0]}, {"a": {"publication_year": 2026, "citation_count": 50}})
        self.assertEqual(examples[0].features, (1.0, 0.0, 0.0, 0.0, 1.0, 0.5, 0.0))

    def test_training_waits_for_both_classes(self):
        class DB:
            user_id = "user"
            def request(self, method, table, query):
                return [{"paper_id": "a", "label": "relevant", "weight": 1}] if table == "feedback_events" else ([{"paper_id": "a", "embedding": [1, 0]}] if table == "paper_embeddings" else [{"id": "a"}])
            def save_model(self, model):
                raise AssertionError("cold start should not save a model")
        self.assertEqual(train_and_store_models(DB()), {"examples": 1, "models": 0})

    def test_feed_training_ignores_behavioral_events_for_explicit_label_threshold(self):
        rows = [
            {"paper_id": "a", "event_type": "start_reading", "weight": 0.2},
            {"paper_id": "b", "label": "relevant", "weight": 1},
        ]
        examples = examples_from_rows(rows, {"a": [1, 0], "b": [0, 1]}, explicit_only=True)
        self.assertEqual([item.paper_id for item in examples], ["b"])

    def test_explicit_label_dominates_behavioral_events_for_same_paper(self):
        rows = [
            {"paper_id": "a", "label": "not_relevant", "created_at": "2026-01-01", "weight": 1},
            {"paper_id": "a", "event_type": "start_reading", "created_at": "2026-01-02", "weight": 0.2},
            {"paper_id": "b", "event_type": "mark_read", "created_at": "2026-01-03", "weight": 0.4},
        ]
        examples = examples_from_rows(rows, {"a": [1, 0], "b": [0, 1]})
        self.assertEqual([(item.paper_id, item.label) for item in examples], [("a", 0), ("b", 1)])

    def test_reversed_explicit_labels_use_the_latest_state(self):
        rows = [
            {"paper_id": "a", "label": "not_relevant", "created_at": "2026-01-01", "weight": 1},
            {"paper_id": "a", "event_type": "undo_rejection", "created_at": "2026-01-02", "weight": 0},
            {"paper_id": "a", "label": "relevant", "created_at": "2026-01-03", "weight": 1},
        ]
        examples = examples_from_rows(rows, {"a": [1, 0]}, explicit_only=True)
        self.assertEqual([(item.paper_id, item.label) for item in examples], [("a", 1)])

    def test_feed_training_uses_latest_labels_before_thresholding(self):
        rows = [
            {"paper_id": "p0", "feed_id": "feed", "label": "not_relevant", "created_at": "2026-01-01", "weight": 1},
            {"paper_id": "p0", "feed_id": "feed", "event_type": "undo_rejection", "created_at": "2026-01-02", "weight": 0},
            *({"paper_id": f"p{index}", "feed_id": "feed", "label": "relevant", "created_at": f"2026-02-{index:02d}", "weight": 1} for index in range(1, 11)),
            *({"paper_id": f"p{index}", "feed_id": "feed", "label": "not_relevant", "created_at": f"2026-03-{index:02d}", "weight": 1} for index in range(11, 20)),
        ]

        class DB:
            user_id = "user"
            saved = []
            def request(self, method, table, query):
                if table == "feedback_events": return rows
                if table == "paper_embeddings": return [{"paper_id": row["paper_id"], "embedding": [1, 0]} for row in rows if row.get("label")]
                if table == "papers": return [{"id": row["paper_id"]} for row in rows if row.get("label")]
                return []
            def save_model(self, model): self.saved.append(model["scope"])

        db = DB()
        self.assertEqual(train_and_store_models(db), {"examples": 19, "models": 1})
        self.assertEqual(db.saved, ["global"])
