from __future__ import annotations

from collections.abc import Sequence

TECHNICALITY_THRESHOLD = 0.62


def paper_text(title: str, abstract: str | None) -> str:
    return f"{title.strip()}\n{abstract or ''}".casefold()


def feed_profile_text(description: str, priority: Sequence[str], include: Sequence[str]) -> str:
    return "\n".join((description.strip(), "Priority concepts: " + "; ".join(priority), "Include concepts: " + "; ".join(include)))


def keyword_score(text: str, keywords: Sequence[str]) -> float:
    concepts = tuple(dict.fromkeys(item.casefold().strip() for item in keywords if item.strip()))
    return sum(concept in text for concept in concepts) / len(concepts) if concepts else 0.0


def strong_keyword_evidence(text: str, priority: Sequence[str], include: Sequence[str]) -> bool:
    concepts = tuple(dict.fromkeys(item.casefold().strip() for item in (*priority, *include) if item.strip()))
    matched = [concept for concept in concepts if concept in text]
    return len(matched) >= 2 or any(len(concept.split()) >= 2 for concept in matched)


def topic_gate(semantic: float, threshold: float, strong_evidence: bool) -> bool:
    rescue_floor = max(0.0, threshold - 0.12)
    return semantic >= threshold or (strong_evidence and semantic >= rescue_floor)


def passes_hard_gates(semantic: float, threshold: float, strong_evidence: bool, technicality: float, paper_type: str) -> bool:
    return topic_gate(semantic, threshold, strong_evidence) and (paper_type != "technical" or technicality >= TECHNICALITY_THRESHOLD)
