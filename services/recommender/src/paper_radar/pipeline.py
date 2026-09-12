from __future__ import annotations

from dataclasses import dataclass, field
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import UUID, uuid4

from .discovery.base import CandidateWork, DiscoveryAdapter, FeedConfig
from .ranking import CandidateFeatures, score_candidates, select_with_exploration


@dataclass(frozen=True)
class PipelineSettings:
    recommender_mode: str = "training"
    schedule_enabled: bool = False
    training_batch_size: int = 25
    max_feed_recommendations: int = 8
    max_today_recommendations: int = 50
    exploration_rate: float = 0.10


@dataclass(frozen=True)
class PipelineResult:
    status: str
    request_id: UUID
    stats: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


class PipelineDB(Protocol):
    def create_run(self, request_id: UUID, mode: str) -> UUID: ...
    def finish_run(self, run_id: UUID, status: str, stats: dict[str, Any], error: str | None = None) -> None: ...
    def upsert_candidate(self, candidate: CandidateWork) -> str: ...
    def add_recommendation(self, run_id: UUID, paper_id: str, feed: FeedConfig, score: float = 0, components: dict[str, float] | None = None, reason: str = "Discovered from feed scope") -> None: ...


class InMemoryDB:
    def __init__(self):
        self.runs: dict[UUID, dict[str, Any]] = {}
        self.papers: dict[str, CandidateWork] = {}
        self.recommendations: list[tuple[UUID, str, FeedConfig]] = []
        self.states: dict[str, str] = {}

    def create_run(self, request_id: UUID, mode: str) -> UUID:
        run_id = uuid4()
        self.runs[run_id] = {"request_id": request_id, "mode": mode, "status": "running"}
        return run_id

    def finish_run(self, run_id: UUID, status: str, stats: dict[str, Any], error: str | None = None) -> None:
        self.runs[run_id].update({"status": status, "stats": stats, "error": error, "finished_at": datetime.now(timezone.utc)})

    def upsert_candidate(self, candidate: CandidateWork) -> str:
        paper_id = candidate.doi or candidate.identifiers.get("openalex") or candidate.title.casefold()
        self.papers[paper_id] = candidate
        return paper_id

    def add_recommendation(self, run_id: UUID, paper_id: str, feed: FeedConfig, score: float = 0, components: dict[str, float] | None = None, reason: str = "Discovered from feed scope") -> None:
        del score, components, reason
        self.recommendations.append((run_id, paper_id, feed))

    def is_eligible(self, paper_id: str, feed_id: str | None = None) -> bool:
        if self.states.get(paper_id, "inbox") in {"queue", "reading", "read", "rejected"}:
            return False
        return not feed_id or not any(existing_paper == paper_id and feed.id == feed_id for _, existing_paper, feed in self.recommendations)

    def ensure_feed_embedding(self, feed: FeedConfig) -> None:
        del feed

    def ensure_paper_embedding(self, paper_id: str, candidate: CandidateWork) -> None:
        del paper_id, candidate


def _schedule_allowed(settings: PipelineSettings) -> bool:
    return settings.recommender_mode == "stable" and settings.schedule_enabled


def _candidate_in_scope(candidate: CandidateWork, feed: FeedConfig) -> bool:
    # Unknown publication years remain eligible: providers sometimes omit dates, while
    # OpenAlex already applies the server-side cutoff for dated retrieval results.
    if candidate.publication_year is not None and candidate.publication_year < feed.min_publication_year:
        return False
    text = " ".join([candidate.title, candidate.abstract or "", json_text(candidate.metadata)]).casefold()
    if any(keyword.casefold() in text for keyword in feed.exclude_keywords):
        return False
    return bool(candidate.title.strip())


def _features_in_scope(features: CandidateFeatures, feed: FeedConfig) -> bool:
    return features.keyword_score > 0 or features.semantic_similarity >= feed.min_semantic_similarity


def json_text(value: object) -> str:
    if isinstance(value, dict):
        return " ".join(f"{key} {json_text(item)}" for key, item in value.items())
    if isinstance(value, (list, tuple, set)):
        return " ".join(json_text(item) for item in value)
    return str(value)


def _candidate_features(candidate: CandidateWork, feed: FeedConfig) -> CandidateFeatures:
    text = " ".join((candidate.title, candidate.abstract or "", json_text(candidate.metadata))).casefold()
    keywords = tuple(dict.fromkeys((*feed.include_keywords, *getattr(feed, "priority_keywords", []))))
    keyword_score = sum(keyword.casefold() in text for keyword in keywords) / len(keywords) if keywords else 0.0
    citation_count = candidate.metadata.get("citation_count", candidate.metadata.get("cited_by_count", 0))
    return CandidateFeatures(
        paper_id=candidate.doi or candidate.identifiers.get("openalex") or candidate.title.casefold(),
        semantic_similarity=float(candidate.metadata.get("semantic_similarity", 0)),
        keyword_score=float(keyword_score),
        feed_probability=_optional_float(candidate.metadata.get("feed_probability")),
        global_probability=_optional_float(candidate.metadata.get("global_probability")),
        zotero_similarity=float(candidate.metadata.get("zotero_similarity", 0)),
        freshness_impact=float(candidate.metadata.get("freshness_impact", 0)),
        citation_impact=max(0.0, min(1.0, float(citation_count or 0) / 100)),
        min_semantic_similarity=feed.min_semantic_similarity,
    )


def _optional_float(value: object) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def run_pipeline(
    mode: str,
    feeds: Sequence[FeedConfig],
    settings: PipelineSettings,
    db: PipelineDB,
    adapter: DiscoveryAdapter,
    request_id: UUID | None = None,
) -> PipelineResult:
    request_id = request_id or uuid4()
    if mode == "scheduled" and not _schedule_allowed(settings):
        return PipelineResult("skipped", request_id)
    if mode not in {"training", "scheduled", "manual", "zotero_sync"}:
        return PipelineResult("failed", request_id, error=f"unsupported mode: {mode}")

    run_id = db.create_run(request_id, mode)
    limit = settings.training_batch_size if mode == "training" else settings.max_feed_recommendations
    stats: dict[str, Any] = {
        "feeds": 0,
        "candidates": 0,
        "recommendations": 0,
        "feeds_attempted": 0,
        "feeds_succeeded": 0,
        "feeds_degraded": 0,
        "candidates_discovered": 0,
        "candidates_in_scope": 0,
        "recommendations_created": 0,
        "warnings": [],
    }
    try:
        for feed in feeds:
            if mode != "training" and stats["recommendations"] >= settings.max_today_recommendations:
                break
            stats["feeds"] += 1
            stats["feeds_attempted"] += 1
            feed_limit = limit if mode == "training" else min(settings.max_feed_recommendations, settings.max_today_recommendations - stats["recommendations"])
            discovered = adapter.search(feed, min(feed_limit, settings.max_today_recommendations))
            feed_warnings = getattr(adapter, "warnings", [])
            if feed_warnings:
                stats["feeds_degraded"] += 1
                stats["warnings"].extend({**warning, "feed_id": feed.id, "feed_name": feed.name or feed.description} for warning in feed_warnings)
            else:
                stats["feeds_succeeded"] += 1
            stats["candidates_discovered"] += len(discovered)
            candidates = [candidate for candidate in discovered if _candidate_in_scope(candidate, feed)]
            stats["candidates"] += len(candidates)
            provider = getattr(db, "candidate_features", None)
            prepared = []
            if mode != "training" or provider:
                for candidate in candidates:
                    paper_id = db.upsert_candidate(candidate)
                    candidate.metadata["_paper_id"] = paper_id
                    if not provider and hasattr(db, "ensure_paper_embedding"):
                        db.ensure_paper_embedding(paper_id, candidate)
                    prepared.append((candidate, paper_id))
            else:
                prepared = [(candidate, None) for candidate in candidates]
            features = [provider(candidate, feed) if provider else _candidate_features(candidate, feed) for candidate in candidates]
            scoped = [(candidate, features[index], prepared[index][1]) for index, candidate in enumerate(candidates) if _features_in_scope(features[index], feed)]
            stats["candidates_in_scope"] += len(scoped)
            if mode == "training":
                selected = [(candidate, None, paper_id) for candidate, _, paper_id in scoped[:feed_limit]]
            else:
                scored = score_candidates([feature for _, feature, _ in scoped])
                chosen = select_with_exploration(scored, feed_limit, settings.exploration_rate)
                by_id = {feature.paper_id: (candidate, paper_id) for (candidate, feature, paper_id) in scoped}
                selected = [(by_id[item.paper_id][0], item, by_id[item.paper_id][1]) for item in chosen if item.paper_id in by_id]
            for candidate, scored, prepared_id in selected:
                paper_id = prepared_id or db.upsert_candidate(candidate)
                if prepared_id is None and hasattr(db, "ensure_paper_embedding"):
                    db.ensure_paper_embedding(paper_id, candidate)
                if hasattr(db, "is_eligible") and not db.is_eligible(paper_id, feed.id):
                    continue
                db.add_recommendation(run_id, paper_id, feed, scored.final_score if scored else 0, scored.components if scored else None, "Matches feed scope" if scored else "Training batch candidate")
                stats["recommendations"] += 1
                stats["recommendations_created"] += 1
        db.finish_run(run_id, "completed", stats)
        return PipelineResult("completed", request_id, stats)
    except Exception as error:
        db.finish_run(run_id, "failed", stats, str(error))
        return PipelineResult("failed", request_id, stats, str(error))
