from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .base import CandidateWork
from .http import RequestBudget, get_json
from ..identity import canonicalize_doi, normalize_title


def candidate_from_crossref(item: Mapping[str, Any]) -> CandidateWork:
    authors = []
    for author in item.get("author", []):
        if isinstance(author, Mapping):
            name = " ".join(str(author.get(key, "")).strip() for key in ("given", "family") if author.get(key)).strip()
            if name:
                authors.append(name)
    published = item.get("published") or item.get("published-print") or {}
    date_parts = published.get("date-parts", [[]])[0] if isinstance(published, Mapping) else []
    return CandidateWork(
        title=str((item.get("title") or [""])[0]).strip(),
        abstract=str(item.get("abstract") or "") or None,
        authors=authors,
        publication_year=date_parts[0] if date_parts else None,
        doi=canonicalize_doi(item.get("DOI")),
        identifiers={"doi": canonicalize_doi(item.get("DOI"))} if canonicalize_doi(item.get("DOI")) else {},
        venue=str((item.get("container-title") or [""])[0]).strip() or None,
        canonical_url=item.get("URL"),
        metadata=dict(item),
    )


class CrossrefAdapter:
    def __init__(self, mailto: str | None = None, request_budget: RequestBudget | None = None):
        self.mailto = mailto
        self.request_budget = request_budget

    def lookup(self, doi: str) -> CandidateWork | None:
        params = {"mailto": self.mailto} if self.mailto else None
        payload = get_json(f"https://api.crossref.org/works/{doi}", params, budget=self.request_budget)
        item = payload.get("message") if isinstance(payload, Mapping) else None
        return candidate_from_crossref(item) if isinstance(item, Mapping) else None

    def repair(self, candidate: CandidateWork) -> CandidateWork:
        if candidate.doi:
            return candidate
        payload = get_json("https://api.crossref.org/works", {"query.bibliographic": candidate.title, "rows": "5", **({"mailto": self.mailto} if self.mailto else {})}, budget=self.request_budget)
        items = payload.get("message", {}).get("items", []) if isinstance(payload, Mapping) else []
        match = next((item for item in items if isinstance(item, Mapping) and normalize_title(str((item.get("title") or [""])[0])) == normalize_title(candidate.title)), None)
        if not isinstance(match, Mapping):
            return candidate
        repaired = candidate_from_crossref(match)
        candidate.doi = repaired.doi
        candidate.identifiers.update(repaired.identifiers)
        candidate.metadata["crossref"] = dict(match)
        if not candidate.abstract:
            candidate.abstract = repaired.abstract
        if not candidate.authors:
            candidate.authors = repaired.authors
        if not candidate.venue:
            candidate.venue = repaired.venue
        if not candidate.canonical_url:
            candidate.canonical_url = repaired.canonical_url
        return candidate
