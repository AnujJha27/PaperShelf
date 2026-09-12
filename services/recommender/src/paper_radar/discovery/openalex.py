from __future__ import annotations

from collections.abc import Mapping, Sequence
from math import ceil
from typing import Any

from .base import CandidateWork, DiscoveryAdapter, FeedConfig
from .http import RequestBudget, get_json
from ..identity import canonicalize_doi


def openalex_queries(feed: FeedConfig, limit: int) -> list[str]:
    del limit
    queries = [feed.description]
    priority = list(dict.fromkeys(feed.priority_keywords))
    if priority:
        queries.append(" ".join(priority))
    keywords = [keyword for keyword in dict.fromkeys(feed.include_keywords) if keyword not in priority]
    group_size = ceil(len(keywords) / 2) if keywords else 0
    if group_size:
        queries.extend(" ".join(keywords[index:index + group_size]) for index in range(0, len(keywords), group_size))
    return list(dict.fromkeys(query.strip() for query in queries if query.strip()))


def _abstract(work: Mapping[str, Any]) -> str | None:
    inverted = work.get("abstract_inverted_index")
    if not isinstance(inverted, Mapping):
        return None
    words: list[tuple[int, str]] = []
    for word, positions in inverted.items():
        if isinstance(positions, Sequence):
            words.extend((int(position), str(word)) for position in positions)
    return " ".join(word for _, word in sorted(words)) or None


def candidate_from_openalex(work: Mapping[str, Any]) -> CandidateWork:
    raw_id = str(work.get("id") or "")
    openalex_id = raw_id.rsplit("/", 1)[-1] if raw_id else ""
    authors = [
        str(author.get("author", {}).get("display_name"))
        for author in work.get("authorships", [])
        if isinstance(author, Mapping) and isinstance(author.get("author"), Mapping) and author.get("author", {}).get("display_name")
    ]
    doi = canonicalize_doi(work.get("doi"))
    return CandidateWork(
        title=str(work.get("title") or "").strip(),
        abstract=_abstract(work),
        authors=authors,
        publication_year=work.get("publication_year"),
        publication_date=work.get("publication_date"),
        doi=doi,
        identifiers={"openalex": openalex_id} if openalex_id else {},
        venue=((work.get("primary_location") or {}).get("source") or {}).get("display_name") if isinstance(work.get("primary_location"), Mapping) else None,
        canonical_url=work.get("doi") or work.get("id"),
        metadata=dict(work),
    )


class OpenAlexAdapter:
    def __init__(self, api_key: str | None = None, mailto: str | None = None, request_budget: RequestBudget | None = None):
        self.api_key = api_key
        self.mailto = mailto
        self.request_budget = request_budget or RequestBudget(20)

    def search(self, feed: FeedConfig, limit: int) -> list[CandidateWork]:
        results: dict[str, CandidateWork] = {}
        for query in openalex_queries(feed, limit):
            params = {"search": query, "per-page": str(min(100, max(10, limit * 2)))}
            params["filter"] = f"from_publication_date:{feed.min_publication_year}-01-01"
            if self.api_key:
                params["api_key"] = self.api_key
            if self.mailto:
                params["mailto"] = self.mailto
            payload = get_json("https://api.openalex.org/works", params, budget=self.request_budget)
            for raw in payload.get("results", []) if isinstance(payload, Mapping) else []:
                candidate = candidate_from_openalex(raw)
                if candidate.identifiers.get("openalex"):
                    candidate.metadata.setdefault("retrieval_queries", []).append(query)
                    candidate.metadata["semantic_retrieval"] = candidate.metadata.get("semantic_retrieval", False) or query == feed.description
                    results[candidate.identifiers["openalex"]] = candidate
        return list(results.values())[:limit]
