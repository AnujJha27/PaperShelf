from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, brier_score_loss, precision_score, recall_score, roc_auc_score
from .gates import TECHNICALITY_THRESHOLD

_BOOTSTRAP = Path(__file__).with_name("technicality_bootstrap.jsonl")
THRESHOLD = TECHNICALITY_THRESHOLD


def _load_rows():
    return [json.loads(line) for line in _BOOTSTRAP.read_text().splitlines() if line.strip()]


@lru_cache(maxsize=1)
def _model():
    rows = _load_rows()
    train = [row for row in rows if row["split"] == "train"]
    test = [row for row in rows if row["split"] == "test"]
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True, strip_accents="unicode")
    train_vectors = vectorizer.fit_transform([row["text"] for row in train])
    classifier = CalibratedClassifierCV(
        estimator=LogisticRegression(C=1.0, class_weight="balanced", max_iter=1000, random_state=17),
        method="sigmoid",
        cv=4,
    )
    classifier.fit(train_vectors, [row["label"] for row in train])
    test_vectors = vectorizer.transform([row["text"] for row in test])
    probabilities = classifier.predict_proba(test_vectors)[:, 1]
    truth = [row["label"] for row in test]
    predictions = [int(value >= THRESHOLD) for value in probabilities]
    metrics = {
        "dataset": "PaperShelf authored technicality bootstrap v1",
        "provenance": "Hand-authored title and abstract descriptions; no third-party paper text",
        "license": "Project-authored text",
        "train_examples": len(train),
        "held_out_examples": len(test),
        "threshold": THRESHOLD,
        "calibration": "4-fold sigmoid (Platt) calibration",
        "accuracy": accuracy_score(truth, predictions),
        "balanced_accuracy": balanced_accuracy_score(truth, predictions),
        "precision": precision_score(truth, predictions, zero_division=0),
        "recall": recall_score(truth, predictions, zero_division=0),
        "roc_auc": roc_auc_score(truth, probabilities),
        "brier_score": brier_score_loss(truth, probabilities),
        "errors": [
            {"text": test[index]["text"], "expected": truth[index], "probability": float(probabilities[index])}
            for index, predicted in enumerate(predictions) if predicted != truth[index]
        ],
    }
    return vectorizer, classifier, metrics


def predict_technicality(title: str, abstract: str | None) -> float:
    vectorizer, classifier, _ = _model()
    text = f"{title.strip()}\n{abstract or ''}"
    return float(classifier.predict_proba(vectorizer.transform([text]))[0, 1])


def bootstrap_metrics() -> dict:
    return dict(_model()[2])


if __name__ == "__main__":
    print(json.dumps(bootstrap_metrics(), indent=2))
