from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class FeedConfig:
    description: str
    id: str | None = None
    user_id: str | None = None
    name: str | None = None
    include_keywords: list[str] = field(default_factory=list)
    exclude_keywords: list[str] = field(default_factory=list)
    min_semantic_similarity: float = 0.35
    priority_keywords: list[str] = field(default_factory=list)


@dataclass
class CandidateWork:
    title: str
    abstract: str | None = None
    authors: list[str] = field(default_factory=list)
    publication_year: int | None = None
    publication_date: str | None = None
    doi: str | None = None
    identifiers: dict[str, str] = field(default_factory=dict)
    venue: str | None = None
    canonical_url: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class DiscoveryAdapter(Protocol):
    def search(self, feed: FeedConfig, limit: int) -> list[CandidateWork]: ...
