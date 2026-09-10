from __future__ import annotations

from dataclasses import dataclass, field
from collections.abc import Mapping, Sequence
from urllib.parse import urlparse
from typing import Any


@dataclass(frozen=True)
class ResolvedSource:
    source_type: str
    host: str
    landing_url: str | None
    pdf_url: str
    version_kind: str
    is_open_access: bool = True
    is_preferred: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


_VERSION_RANK = {"published": 0, "accepted_manuscript": 1, "repository": 2, "preprint": 3, "unknown": 4}


def _version_kind(location: Mapping[str, Any]) -> str:
    value = str(location.get("version_kind") or location.get("version") or "unknown").casefold()
    if value in {"published", "publishedversion", "version of record"}:
        return "published"
    if value in {"accepted", "acceptedversion", "accepted manuscript"}:
        return "accepted_manuscript"
    if value in {"submittedversion", "preprint", "submitted"}:
        return "preprint"
    if value in {"repository", "dissemination"}:
        return "repository"
    return "unknown"


def _locations(openalex_locations: Sequence[Mapping[str, Any]], unpaywall_record: Mapping[str, Any] | None) -> list[Mapping[str, Any]]:
    values = list(openalex_locations)
    if unpaywall_record:
        best = unpaywall_record.get("best_oa_location")
        if isinstance(best, Mapping):
            values.append(best)
        values.extend(item for item in unpaywall_record.get("oa_locations", []) if isinstance(item, Mapping))
    return values


def rank_oa_sources(work: Mapping[str, Any], openalex_locations: Sequence[Mapping[str, Any]], unpaywall_record: Mapping[str, Any] | None) -> list[ResolvedSource]:
    del work
    found: dict[str, ResolvedSource] = {}
    for location in _locations(openalex_locations, unpaywall_record):
        pdf_url = location.get("pdf_url") or location.get("url_for_pdf")
        if not location.get("is_oa", True) or not isinstance(pdf_url, str) or urlparse(pdf_url).scheme != "https" or not urlparse(pdf_url).netloc:
            continue
        kind = _version_kind(location)
        source = ResolvedSource(
            source_type=str(location.get("source_type") or location.get("host_type") or "repository"),
            host=urlparse(pdf_url).netloc,
            landing_url=location.get("landing_url") or location.get("url"),
            pdf_url=pdf_url,
            version_kind=kind,
            metadata=dict(location),
        )
        previous = found.get(pdf_url)
        if previous is None or _VERSION_RANK[source.version_kind] < _VERSION_RANK[previous.version_kind]:
            found[pdf_url] = source
    ranked = sorted(found.values(), key=lambda source: (_VERSION_RANK[source.version_kind], source.host, source.pdf_url))
    return [ResolvedSource(**{**source.__dict__, "is_preferred": index == 0}) for index, source in enumerate(ranked)]
