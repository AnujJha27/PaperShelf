from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID
import json
import os
import math
from urllib.request import Request, urlopen

from .identity import canonicalize_doi, normalize_title


def _zotero_title(item: Mapping[str, Any]) -> str:
    return str(item.get("title") or item.get("data", {}).get("title") or "")


def match_zotero_item(item: Mapping[str, Any], papers: Sequence[Mapping[str, Any]]) -> UUID | None:
    doi = canonicalize_doi(item.get("DOI") or item.get("doi") or item.get("data", {}).get("DOI"))
    if doi:
        for paper in papers:
            if canonicalize_doi(paper.get("doi")) == doi:
                return paper["id"]
    title = normalize_title(_zotero_title(item))
    if len(title) < 12:
        return None
    for paper in papers:
        if normalize_title(paper.get("title")) == title:
            return paper["id"]
    return None


def weak_zotero_similarity(vector: Sequence[float], items: Sequence[Mapping[str, Any]]) -> float:
    best = 0.0
    norm = math.sqrt(sum(float(value) ** 2 for value in vector))
    if not norm:
        return 0.0
    for item in items:
        other = item.get("embedding")
        if not isinstance(other, Sequence) or len(other) != len(vector):
            continue
        denominator = norm * math.sqrt(sum(float(value) ** 2 for value in other))
        if denominator:
            best = max(best, sum(float(a) * float(b) for a, b in zip(vector, other)) / denominator)
    return min(0.2, max(0.0, best * 0.2))


def sync_zotero_metadata(db: Any, api_key: str, zotero_user_id: str) -> dict[str, int]:
    """Pull metadata only; PDFs and attachments never enter the app database."""
    items = []
    start = 0
    while True:
        request = Request(f"https://api.zotero.org/users/{zotero_user_id}/items?format=json&itemType=-attachment&limit=100&start={start}", headers={"Zotero-API-Key": api_key, "Zotero-API-Version": "3"})
        with urlopen(request, timeout=30) as response:
            batch = json.loads(response.read())
            total = int(response.headers.get("Total-Results", len(batch)))
        if not isinstance(batch, list):
            break
        items.extend(batch)
        start += len(batch)
        if not batch or start >= total:
            break
    papers = db.request("GET", "papers", {"select": "id,doi,title"})
    synced = 0
    linked = 0
    for item in items if isinstance(items, list) else []:
        data = item.get("data", {}) if isinstance(item, Mapping) else {}
        match = match_zotero_item(data, papers)
        metadata = dict(data)
        try:
            from .embeddings import embed_texts
            metadata["embedding"] = embed_texts([(_zotero_title(data), data.get("abstractNote"))])[0]
        except (ImportError, RuntimeError):
            pass
        db.request("POST", "zotero_items", {"on_conflict": "user_id,zotero_key"}, {"user_id": db.user_id, "zotero_key": item.get("key"), "paper_id": str(match) if match else None, "doi": canonicalize_doi(data.get("DOI")), "title": _zotero_title(data), "metadata": metadata})
        synced += 1
        linked += bool(match)
    return {"items": synced, "linked": linked}
