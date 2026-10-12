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


def normalize_identifier(kind: str, raw: Any) -> str | None:
    if raw is None:
        return None
    kind = kind.strip().casefold()
    value = str(raw).strip().casefold()
    if not value:
        return None
    if kind == "doi":
        return canonicalize_doi(value)
    if kind == "openalex":
        value = re.sub(r"^https?://openalex\.org/", "", value)
        return value.upper() if re.fullmatch(r"w\d+", value, re.I) else value
    if kind == "arxiv":
        value = re.sub(r"^https?://arxiv\.org/(abs|pdf)/", "", value)
        value = re.sub(r"\.pdf$", "", value)
        return re.sub(r"v\d+$", "", value)
    if kind == "pmid":
        value = re.sub(r"^https?://pubmed\.ncbi\.nlm\.nih\.gov/", "", value)
        return re.sub(r"/+$", "", value)
    if kind == "pmcid":
        value = re.sub(r"^https?://(?:www\.)?ncbi\.nlm\.nih\.gov/pmc/articles/", "", value)
        return value.upper().removesuffix("/")
    return value


def normalized_identifiers(candidate: Mapping[str, Any]) -> dict[str, str]:
    identifiers = candidate.get("identifiers")
    values = dict(identifiers) if isinstance(identifiers, Mapping) else {}
    for kind in ("doi", "openalex", "arxiv", "pmid", "pmcid", "mag", "semantic_scholar"):
        value = candidate.get(f"{kind}_id")
        if value and kind not in values:
            values[kind] = value
    if candidate.get("doi"):
        values["doi"] = candidate["doi"]
    normalized = {
        str(kind).strip().casefold(): value
        for kind, raw in values.items()
        if (value := normalize_identifier(str(kind), raw)) is not None
    }
    return dict(sorted(normalized.items()))


def _metadata_score(paper: Mapping[str, Any]) -> tuple[int, str]:
    authors = paper.get("authors")
    author_count = len(authors) if isinstance(authors, (list, tuple)) else int(bool(authors))
    title_length = len(str(paper.get("title") or "").strip())
    abstract_length = len(str(paper.get("abstract") or "").strip())
    score = (
        min(title_length, 200) // 20
        + min(abstract_length, 4000) // 250
        + min(author_count, 8)
        + 2 * bool(paper.get("venue"))
        + bool(paper.get("publication_date"))
        + bool(paper.get("publication_year"))
        + bool(paper.get("canonical_url"))
        + bool(paper.get("doi"))
        + bool(paper.get("openalex_id"))
        + bool(paper.get("work_type"))
    )
    return score, str(paper.get("id") or "")


def choose_existing_paper(candidate: Mapping[str, Any], existing: Sequence[Mapping[str, Any]]) -> UUID | None:
    candidate_ids = normalized_identifiers(candidate)
    matches: dict[str, Mapping[str, Any]] = {}
    for paper in existing:
        paper_ids = normalized_identifiers(paper)
        if any(paper_ids.get(kind) == value for kind, value in candidate_ids.items()):
            matches[str(paper["id"])] = paper

    if matches:
        return matches[sorted(matches, key=lambda key: (-_metadata_score(matches[key])[0], key))[0]]["id"]

    return None
