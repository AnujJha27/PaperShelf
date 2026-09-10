import unittest
from uuid import UUID

from paper_radar.model import TrainingExample, model_record, predict_probability, train_feed_model, train_global_model


def examples(count: int = 20):
    return [
        TrainingExample(UUID(int=index + 1), (1.0, 0.0) if index % 2 == 0 else (0.0, 1.0), 1 if index % 2 == 0 else 0, 1.0)
        for index in range(count)
    ]


class ModelTests(unittest.TestCase):
    def test_global_model_serializes_coefficients_and_metrics(self):
        result = train_global_model(examples())
        self.assertEqual(len(result.coefficients), 2)
        self.assertIn("balanced_accuracy", result.metrics)

    def test_feed_model_waits_for_minimum_label_counts(self):
        self.assertIsNone(train_feed_model(UUID(int=1), examples(8)))

    def test_model_record_is_json_ready_and_predicts_probability(self):
        result = train_global_model(examples())
        record = model_record(result, "user", "global")
        self.assertEqual(record["model_type"], "logistic_regression")
        self.assertGreaterEqual(predict_probability(result, (1.0, 0.0)), 0.5)

    def test_training_is_reproducible(self):
        first = train_global_model(examples())
        second = train_global_model(examples())
        self.assertEqual(first.coefficients, second.coefficients)
        self.assertEqual(first.intercept, second.intercept)
