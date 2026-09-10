from __future__ import annotations

import ast
from collections import defaultdict
from collections.abc import Mapping
from datetime import datetime, timezone

from .model import TrainingExample, model_record, train_feed_model, train_global_model

_EXPLICIT_LABELS = {"relevant", "maybe", "not_relevant"}
_BEHAVIOR_LABELS = {"start_reading", "mark_read", "add_to_zotero"}


def _embedding(value: object) -> tuple[float, ...] | None:
    if isinstance(value, str):
        try:
            value = ast.literal_eval(value)
        except (SyntaxError, ValueError):
            return None
    if not isinstance(value, list) or not value:
        return None
    try:
        return tuple(float(item) for item in value)
    except (TypeError, ValueError):
        return None


def examples_from_rows(
    feedback: list[Mapping],
    embeddings: Mapping[str, object],
    papers: Mapping[str, Mapping] | None = None,
    explicit_only: bool = False,
) -> list[TrainingExample]:
    papers = papers or {}
    examples = []
    latest: dict[str, Mapping] = {}
    loose: list[Mapping] = []
    behavior: dict[str, Mapping] = {}
    ordered = sorted(feedback, key=lambda row: str(row.get("created_at") or ""))
    for row in ordered:
        label = str(row.get("label") or row.get("event_type") or "")
        paper_id = str(row.get("paper_id") or "")
        if label in _EXPLICIT_LABELS:
            if paper_id:
                latest[paper_id] = row
            else:
                loose.append(row)
        elif label == "undo_rejection" and paper_id:
            latest.pop(paper_id, None)
        elif not explicit_only and label in _BEHAVIOR_LABELS and paper_id:
            behavior[paper_id] = row
    behavioral_rows = [] if explicit_only else [row for paper_id, row in behavior.items() if paper_id not in latest]
    for row in [*loose, *latest.values(), *behavioral_rows]:
        label = str(row.get("label") or row.get("event_type") or "")
        if label in {"relevant", "maybe", "start_reading", "mark_read", "add_to_zotero"}:
            target = 1
        elif label in {"not_relevant"}:
            target = 0
        else:
            continue
        vector = _embedding(embeddings.get(str(row.get("paper_id"))))
        if vector is None:
            continue
        paper = papers.get(str(row.get("paper_id")), {})
        if papers:
            year = int(paper.get("publication_year") or 0)
            freshness = max(0.0, min(1.0, 1.0 - (datetime.now(timezone.utc).year - year) / 10)) if year else 0.0
            citation = max(0.0, min(1.0, float(paper.get("citation_count") or 0) / 100))
            features = (*vector, 0.0, 0.0, freshness, citation, 0.0)
        else:
            features = vector
        examples.append(TrainingExample(row["paper_id"], features, target, float(row.get("weight") or 1)))
    return examples


def train_and_store_models(db) -> dict[str, int]:
    feedback = db.request("GET", "feedback_events", {"user_id": f"eq.{db.user_id}", "select": "paper_id,feed_id,event_type,label,weight,created_at", "order": "created_at.asc"})
    rows = db.request("GET", "paper_embeddings", {"select": "paper_id,embedding"})
    papers_rows = db.request("GET", "papers", {"select": "id,publication_year,citation_count"})
    embeddings = {str(row["paper_id"]): row["embedding"] for row in rows}
    papers = {str(row["id"]): row for row in papers_rows}
    examples = examples_from_rows(feedback, embeddings, papers)
    labels = {example.label for example in examples}
    if not examples or labels != {0, 1}:
        return {"examples": len(examples), "models": 0}
    result = train_global_model(examples)
    db.save_model(model_record(result, db.user_id, "global"))
    models = 1
    by_feed = defaultdict(list)
    for row in feedback:
        if row.get("feed_id"):
            by_feed[row["feed_id"]].append(row)
    for feed_id, feed_rows in by_feed.items():
        feed_examples = examples_from_rows(feed_rows, embeddings, papers, explicit_only=True)
        result = train_feed_model(feed_id, feed_examples)
        if result:
            db.save_model(model_record(result, db.user_id, "feed", str(feed_id)))
            models += 1
    return {"examples": len(examples), "models": models}
