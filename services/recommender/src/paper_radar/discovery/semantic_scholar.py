from __future__ import annotations

from collections.abc import Mapping

from .base import CandidateWork
from .http import RequestBudget, get_json


class SemanticScholarAdapter:
    def __init__(self, api_key: str | None = None, request_budget: RequestBudget | None = None):
        self.api_key = api_key
        self.request_budget = request_budget

    def enrich(self, paper: CandidateWork) -> CandidateWork:
        identifier = paper.doi or paper.identifiers.get("openalex")
        if not identifier:
            return paper
        headers = {"x-api-key": self.api_key} if self.api_key else None
        try:
            payload = get_json(
                f"https://api.semanticscholar.org/graph/v1/paper/{identifier}",
                {"fields": "title,abstract,citationCount,openAccessPdf"},
                headers,
                self.request_budget,
            )
        except (OSError, RuntimeError):
            return paper
        if not isinstance(payload, Mapping):
            return paper
        paper.metadata["semantic_scholar"] = dict(payload)
        if not paper.abstract and payload.get("abstract"):
            paper.abstract = str(payload["abstract"])
        if payload.get("citationCount") is not None:
            paper.metadata["citation_count"] = payload["citationCount"]
        return paper
