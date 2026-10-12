from __future__ import annotations

from dataclasses import dataclass, field
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import UUID, uuid4

from .discovery.base import CandidateWork, DiscoveryAdapter, FeedConfig
from .ranking import CandidateFeatures, score_candidates, select_with_exploration
from .gates import TECHNICALITY_THRESHOLD, keyword_score, paper_text, passes_hard_gates, strong_keyword_evidence
from .identity import normalized_identifiers
from .technicality import predict_technicality


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
    text = paper_text(candidate.title, candidate.abstract)
    if any(keyword.casefold() in text for keyword in feed.exclude_keywords):
        return False
    return bool(candidate.title.strip())


def _features_in_scope(features: CandidateFeatures, feed: FeedConfig) -> bool:
    return features.topic_gate_passed and features.technical_gate_passed and passes_hard_gates(features.semantic_similarity, feed.min_semantic_similarity, features.strong_keyword_evidence, features.technicality_probability, feed.paper_type)


def _candidate_features(candidate: CandidateWork, feed: FeedConfig) -> CandidateFeatures:
    text = paper_text(candidate.title, candidate.abstract)
    keywords = tuple(dict.fromkeys((*feed.include_keywords, *getattr(feed, "priority_keywords", []))))
    score = keyword_score(text, keywords)
    strong = strong_keyword_evidence(text, feed.priority_keywords, feed.include_keywords)
    technicality = predict_technicality(candidate.title, candidate.abstract)
    topic_passed = passes_hard_gates(float(candidate.metadata.get("semantic_similarity", 0)), feed.min_semantic_similarity, strong, 1.0, "broad")
    technical_passed = feed.paper_type != "technical" or technicality >= TECHNICALITY_THRESHOLD
    citation_count = candidate.metadata.get("citation_count", candidate.metadata.get("cited_by_count", 0))
    return CandidateFeatures(
        paper_id=candidate.doi or candidate.identifiers.get("openalex") or candidate.title.casefold(),
        semantic_similarity=float(candidate.metadata.get("semantic_similarity", 0)),
        keyword_score=score,
        feed_probability=_optional_float(candidate.metadata.get("feed_probability")),
        global_probability=_optional_float(candidate.metadata.get("global_probability")),
        zotero_similarity=float(candidate.metadata.get("zotero_similarity", 0)),
        freshness_impact=float(candidate.metadata.get("freshness_impact", 0)),
        citation_impact=max(0.0, min(1.0, float(citation_count or 0) / 100)),
        min_semantic_similarity=feed.min_semantic_similarity,
        strong_keyword_evidence=strong,
        technicality_probability=technicality,
        topic_gate_passed=topic_passed,
        technical_gate_passed=technical_passed,
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
                stats["warnings"].extend({"feed_id": feed.id, "feed": feed.name or feed.description, "provider": warning.get("provider"), "candidate_identifiers": warning.get("candidate_identifiers", {}), "stage": warning.get("stage", "provider_enrichment"), "error_category": warning.get("category", "provider"), "message": warning.get("message", "provider enrichment failed")} for warning in feed_warnings)
            else:
                stats["feeds_succeeded"] += 1
            stats["candidates_discovered"] += len(discovered)
            provider = getattr(db, "candidate_features", None)
            scoped: list[tuple[CandidateWork, CandidateFeatures, str | None]] = []
            for candidate in discovered:
                if not _candidate_in_scope(candidate, feed):
                    continue
                stats["candidates"] += 1
                paper_id: str | None = None
                try:
                    if mode != "training" or provider:
                        paper_id = db.upsert_candidate(candidate)
                        candidate.metadata["_paper_id"] = paper_id
                        if not provider and hasattr(db, "ensure_paper_embedding"):
                            db.ensure_paper_embedding(paper_id, candidate)
                    features = provider(candidate, feed) if provider else _candidate_features(candidate, feed)
                    if _features_in_scope(features, feed):
                        scoped.append((candidate, features, paper_id))
                except Exception as error:
                    category = _candidate_error_category(error)
                    if category is None:
                        raise
                    stats["warnings"].append(_candidate_warning(feed, candidate, "feature_or_persistence", category, error))
            stats["candidates_in_scope"] += len(scoped)
            if mode == "training":
                selected = [(candidate, None, paper_id) for candidate, _, paper_id in scoped[:feed_limit]]
            else:
                scored = score_candidates([feature for _, feature, _ in scoped])
                chosen = select_with_exploration(scored, feed_limit, settings.exploration_rate)
                by_id = {feature.paper_id: (candidate, paper_id) for (candidate, feature, paper_id) in scoped}
                selected = [(by_id[item.paper_id][0], item, by_id[item.paper_id][1]) for item in chosen if item.paper_id in by_id]
            for candidate, scored, prepared_id in selected:
                try:
                    paper_id = prepared_id or db.upsert_candidate(candidate)
                    if prepared_id is None and hasattr(db, "ensure_paper_embedding"):
                        db.ensure_paper_embedding(paper_id, candidate)
                    if hasattr(db, "is_eligible") and not db.is_eligible(paper_id, feed.id):
                        continue
                    db.add_recommendation(run_id, paper_id, feed, scored.final_score if scored else 0, scored.components if scored else None, "Matches feed scope" if scored else "Training batch candidate")
                    stats["recommendations"] += 1
                    stats["recommendations_created"] += 1
                except Exception as error:
                    category = _candidate_error_category(error)
                    if category is None:
                        raise
                    stats["warnings"].append(_candidate_warning(feed, candidate, "recommendation_persistence", category, error))
        status = "completed_with_warnings" if stats["warnings"] else "completed"
        db.finish_run(run_id, status, stats)
        return PipelineResult(status, request_id, stats)
    except Exception as error:
        db.finish_run(run_id, "failed", stats, str(error))
        return PipelineResult("failed", request_id, stats, str(error))


def _candidate_error_category(error: Exception) -> str | None:
    message = str(error)
    if "network error" in message.lower() or "returned 5" in message or "returned 429" in message:
        return None
    if "returned 409" in message or "duplicate key" in message.lower():
        return "identity_conflict"
    if "returned 4" in message or isinstance(error, (ValueError, KeyError, TypeError)):
        return "candidate_data"
    return None


def _candidate_warning(feed: FeedConfig, candidate: CandidateWork, stage: str, category: str, error: Exception) -> dict[str, Any]:
    return {
        "feed_id": feed.id,
        "feed": feed.name or feed.description,
        "candidate_identifiers": normalized_identifiers({"doi": candidate.doi, "identifiers": candidate.identifiers}),
        "stage": stage,
        "error_category": category,
        "message": " ".join(str(error).split())[:240],
    }
