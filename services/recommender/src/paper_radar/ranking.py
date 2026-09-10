from __future__ import annotations

from dataclasses import dataclass, field
from collections.abc import Sequence


@dataclass(frozen=True)
class CandidateFeatures:
    paper_id: str
    semantic_similarity: float
    keyword_score: float
    feed_probability: float | None = None
    global_probability: float | None = None
    zotero_similarity: float = 0.0
    freshness_impact: float = 0.0
    citation_impact: float = 0.0
    excluded: bool = False
    rejected: bool = False
    min_semantic_similarity: float = 0.35
    diversity_vector: tuple[float, ...] = ()


@dataclass(frozen=True)
class ScoredCandidate:
    paper_id: str
    final_score: float
    components: dict[str, float] = field(default_factory=dict)
    semantic_similarity: float = 0.0
    keyword_score: float = 0.0
    classifier_probability: float = 0.0
    min_semantic_similarity: float = 0.35
    diversity_vector: tuple[float, ...] = ()


def score_candidates(candidates: Sequence[CandidateFeatures]) -> list[ScoredCandidate]:
    scored = []
    for candidate in candidates:
        if candidate.excluded or candidate.rejected:
            continue
        global_probability = candidate.global_probability or 0.0
        if candidate.feed_probability is None:
            semantic_weight = 0.35 + 0.25 * (0.35 / 0.65)
            keyword_weight = 0.15 + 0.25 * (0.15 / 0.65)
            global_weight = 0.15 + 0.25 * (0.15 / 0.65)
            classifier_probability = global_probability
        else:
            semantic_weight, keyword_weight, global_weight = 0.35, 0.15, 0.15
            classifier_probability = candidate.feed_probability
        components = {
            "semantic_similarity": semantic_weight * candidate.semantic_similarity,
            "keyword_score": keyword_weight * candidate.keyword_score,
            "feed_classifier": 0.25 * classifier_probability if candidate.feed_probability is not None else 0.0,
            "global_classifier": global_weight * global_probability,
            "zotero_similarity": 0.05 * candidate.zotero_similarity,
            "freshness_impact": 0.025 * candidate.freshness_impact + 0.025 * candidate.citation_impact,
        }
        scored.append(ScoredCandidate(
            paper_id=candidate.paper_id,
            final_score=sum(components.values()),
            components=components,
            semantic_similarity=candidate.semantic_similarity,
            keyword_score=candidate.keyword_score,
            classifier_probability=classifier_probability,
            min_semantic_similarity=candidate.min_semantic_similarity,
            diversity_vector=candidate.diversity_vector,
        ))
    return sorted(scored, key=lambda item: (-item.final_score, item.paper_id))


def _in_scope(candidate: ScoredCandidate) -> bool:
    return candidate.keyword_score > 0 or candidate.semantic_similarity >= candidate.min_semantic_similarity


def _cosine(left: tuple[float, ...], right: tuple[float, ...]) -> float:
    if not left or len(left) != len(right):
        return 0.0
    left_norm = sum(value * value for value in left) ** 0.5
    right_norm = sum(value * value for value in right) ** 0.5
    return sum(a * b for a, b in zip(left, right)) / (left_norm * right_norm) if left_norm and right_norm else 0.0


def _mmr(candidates: Sequence[ScoredCandidate], slots: int) -> list[ScoredCandidate]:
    remaining = list(candidates)
    selected: list[ScoredCandidate] = []
    while remaining and len(selected) < slots:
        if not selected:
            choice = sorted(remaining, key=lambda item: (-item.final_score, item.paper_id))[0]
        else:
            choice = sorted(
                remaining,
                key=lambda item: (
                    -(0.7 * item.final_score + 0.3 * (1.0 - max(_cosine(item.diversity_vector, previous.diversity_vector) for previous in selected))),
                    item.paper_id,
                ),
            )[0]
        selected.append(choice)
        remaining.remove(choice)
    return selected


def select_with_exploration(candidates: Sequence[ScoredCandidate], slots: int, exploration_rate: float = 0.10) -> list[ScoredCandidate]:
    eligible = [candidate for candidate in candidates if _in_scope(candidate)]
    slots = max(0, slots)
    if slots == 0 or not eligible:
        return []
    exploration_slots = min(len(eligible), round(slots * max(0.0, min(1.0, exploration_rate))))
    exploitation_slots = max(0, slots - exploration_slots)
    exploitation = _mmr(eligible, exploitation_slots)
    remaining = [candidate for candidate in eligible if candidate not in exploitation]
    exploration = sorted(remaining, key=lambda item: (abs(item.classifier_probability - 0.5), -item.semantic_similarity, item.paper_id))[:exploration_slots]
    return exploitation + exploration
