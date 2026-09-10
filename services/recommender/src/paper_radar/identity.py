from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence
from typing import Any
from uuid import UUID

_DOI_RE = re.compile(r"^10\.\d{4,9}/\S+$")


def canonicalize_doi(raw: str | None) -> str | None:
    if not raw:
        return None
    value = raw.strip().lower()
    for prefix in ("https://doi.org/", "http://doi.org/", "doi:"):
        if value.startswith(prefix):
            value = value[len(prefix):]
            break
    value = value.rstrip(".,;)")
    return value if _DOI_RE.fullmatch(value) else None


def normalize_title(title: str | None) -> str:
    value = unicodedata.normalize("NFKC", title or "").casefold()
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", value)).strip()


def _first_author(value: Any) -> str:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)) or not value:
        return ""
    first = value[0]
    if isinstance(first, Mapping):
        return str(first.get("orcid") or first.get("display_name") or first.get("name") or "").casefold()
    return str(first).casefold().strip()


def _identifier(candidate: Mapping[str, Any], kind: str) -> str | None:
    identifiers = candidate.get("identifiers")
    if isinstance(identifiers, Mapping):
        value = identifiers.get(kind)
        if value:
            return str(value).strip().casefold()
    value = candidate.get(f"{kind}_id")
    return str(value).strip().casefold() if value else None


def choose_existing_paper(candidate: Mapping[str, Any], existing: Sequence[Mapping[str, Any]]) -> UUID | None:
    candidate_doi = canonicalize_doi(candidate.get("doi"))
    if candidate_doi:
        for paper in existing:
            if canonicalize_doi(paper.get("doi")) == candidate_doi:
                return paper["id"]

    for kind in ("openalex", "arxiv", "pmid", "pmcid", "mag"):
        value = _identifier(candidate, kind)
        if not value:
            continue
        for paper in existing:
            if _identifier(paper, kind) == value:
                return paper["id"]

    title = normalize_title(candidate.get("title"))
    if len(title) < 12:
        return None
    author = _first_author(candidate.get("authors"))
    year = candidate.get("publication_year")
    if not author or not year:
        return None
    for paper in existing:
        if normalize_title(paper.get("title")) == title and _first_author(paper.get("authors")) == author and paper.get("publication_year") == year:
            return paper["id"]
    return None
