from __future__ import annotations

from collections.abc import Mapping

from .http import RequestBudget, get_json


class UnpaywallAdapter:
    def __init__(self, email: str, request_budget: RequestBudget | None = None):
        if not email:
            raise ValueError("Unpaywall requires a contact email")
        self.email = email
        self.request_budget = request_budget

    def lookup(self, doi: str) -> Mapping[str, object] | None:
        try:
            payload = get_json(f"https://api.unpaywall.org/v2/{doi}", {"email": self.email}, budget=self.request_budget)
        except (OSError, RuntimeError):
            return None
        return payload if isinstance(payload, Mapping) else None
