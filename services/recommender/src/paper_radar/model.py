from __future__ import annotations

import math
from dataclasses import dataclass
from collections.abc import Sequence
from uuid import UUID

from sklearn.linear_model import LogisticRegression
from sklearn.metrics import balanced_accuracy_score
from sklearn.model_selection import StratifiedKFold, cross_val_score


@dataclass(frozen=True)
class TrainingExample:
    paper_id: UUID
    features: tuple[float, ...]
    label: int
    weight: float = 1.0


@dataclass(frozen=True)
class ModelResult:
    coefficients: list[float]
    intercept: float
    metrics: dict[str, float]
    label_counts: dict[str, int]
    model_type: str = "logistic_regression"


def _counts(examples: Sequence[TrainingExample]) -> dict[str, int]:
    return {"positive": sum(e.label == 1 for e in examples), "negative": sum(e.label == 0 for e in examples), "total": len(examples)}


def _validate(examples: Sequence[TrainingExample]) -> tuple[int, dict[str, int]]:
    if not examples or any(e.label not in (0, 1) or e.weight <= 0 for e in examples):
        raise ValueError("training requires binary labels and positive weights")
    width = len(examples[0].features)
    if not width or any(len(e.features) != width for e in examples):
        raise ValueError("training features must have one consistent non-empty width")
    counts = _counts(examples)
    if not counts["positive"] or not counts["negative"]:
        raise ValueError("training requires positive and negative examples")
    return width, counts


def _classifier() -> LogisticRegression:
    return LogisticRegression(class_weight="balanced", max_iter=1000, random_state=0, solver="liblinear")


def _fit(examples: Sequence[TrainingExample]) -> LogisticRegression:
    model = _classifier()
    model.fit([e.features for e in examples], [e.label for e in examples], sample_weight=[e.weight for e in examples])
    return model


def _metrics(model: LogisticRegression, examples: Sequence[TrainingExample]) -> dict[str, float]:
    counts = _counts(examples)
    folds = min(5, counts["positive"], counts["negative"])
    if folds < 2:
        return {"balanced_accuracy": 0.0}
    split = StratifiedKFold(n_splits=folds, shuffle=True, random_state=0)
    scores = cross_val_score(_classifier(), [e.features for e in examples], [e.label for e in examples], cv=split, scoring="balanced_accuracy", params={"sample_weight": [e.weight for e in examples]})
    return {"balanced_accuracy": float(scores.mean()), "training_balanced_accuracy": float(balanced_accuracy_score([e.label for e in examples], model.predict([e.features for e in examples])))}


def train_global_model(examples: Sequence[TrainingExample]) -> ModelResult:
    _, counts = _validate(examples)
    model = _fit(examples)
    return ModelResult(model.coef_[0].tolist(), float(model.intercept_[0]), _metrics(model, examples), counts)


def train_feed_model(feed_id: UUID, examples: Sequence[TrainingExample]) -> ModelResult | None:
    del feed_id
    counts = _counts(examples)
    if counts["total"] < 20 or counts["positive"] < 5 or counts["negative"] < 5:
        return None
    return train_global_model(examples)


def predict_probability(result: ModelResult, features: Sequence[float]) -> float:
    value = result.intercept + sum(weight * feature for weight, feature in zip(result.coefficients, features))
    return 1.0 / (1.0 + math.exp(-max(-60.0, min(60.0, value))))


def model_record(result: ModelResult, user_id: str, scope: str, feed_id: str | None = None, model_name: str = "bge-logistic") -> dict:
    return {"user_id": user_id, "scope": scope, "feed_id": feed_id, "model_name": model_name, "model_type": result.model_type, "coefficients": result.coefficients, "intercept": result.intercept, "metrics": result.metrics, "label_counts": result.label_counts}


def ready_for_stable(result: ModelResult) -> bool:
    return result.label_counts["total"] >= 60 and result.label_counts["positive"] >= 15 and result.label_counts["negative"] >= 15 and result.metrics["balanced_accuracy"] >= 0.60
