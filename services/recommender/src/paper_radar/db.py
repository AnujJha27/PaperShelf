from __future__ import annotations

import json
import math
import os
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from time import sleep
from uuid import UUID

from .discovery.base import CandidateWork, FeedConfig
from .identity import canonicalize_doi, choose_existing_paper, normalize_title
from .pdf_resolver import rank_oa_sources
from .model import ModelResult, predict_probability
from .ranking import CandidateFeatures
from .zotero_sync import weak_zotero_similarity


@dataclass
class SupabaseDB:
    url: str
    service_key: str
    user_id: str

    def request(self, method: str, table: str, query: Mapping[str, str] | None = None, payload: object | None = None) -> list[dict]:
        endpoint = f"{self.url.rstrip('/')}/rest/v1/{table}"
        if query:
            endpoint = f"{endpoint}?{urlencode(query, safe='%')}"
        headers = {"apikey": self.service_key, "Authorization": f"Bearer {self.service_key}", "Accept": "application/json", "Prefer": "return=representation,resolution=merge-duplicates"}
        data = json.dumps(payload).encode() if payload is not None else None
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = Request(endpoint, method=method, headers=headers, data=data)
        for attempt in range(3):
            try:
                with urlopen(request, timeout=30) as response:
                    raw = response.read()
                return json.loads(raw) if raw else []
            except HTTPError as error:
                detail = error.read().decode("utf-8", errors="replace").strip()
                if method == "GET" and error.code in {502, 503, 504} and attempt < 2:
                    sleep(2 ** attempt)
                    continue
                raise RuntimeError(f"Supabase {method} {table} returned {error.code}: {detail}") from error
        raise RuntimeError(f"Supabase {method} {table} request exhausted retries")

    @classmethod
    def from_env(cls) -> "SupabaseDB":
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        feeds = cls(url, key, "").request("GET", "feeds", {"is_active": "eq.true", "select": "id,user_id"})
        if not feeds:
            raise RuntimeError("no active feeds found")
        return cls(url, key, str(feeds[0]["user_id"]))

    def active_feeds(self) -> list[FeedConfig]:
        rows = self.request("GET", "feeds", {"is_active": "eq.true", "user_id": f"eq.{self.user_id}", "select": "id,user_id,name,description,include_keywords,exclude_keywords,priority_keywords,min_semantic_similarity,min_publication_year"})
        return [FeedConfig(id=row["id"], user_id=row["user_id"], name=row.get("name"), description=row["description"], include_keywords=row.get("include_keywords") or [], exclude_keywords=row.get("exclude_keywords") or [], min_semantic_similarity=row.get("min_semantic_similarity", 0.35), priority_keywords=row.get("priority_keywords") or [], min_publication_year=row.get("min_publication_year", 2018)) for row in rows]

    def settings(self) -> dict:
        rows = self.request("GET", "app_settings", {"user_id": f"eq.{self.user_id}", "select": "recommender_mode,schedule_enabled,exploration_rate,training_batch_size,max_feed_recommendations,max_today_recommendations"})
        return rows[0] if rows else {"recommender_mode": "training", "schedule_enabled": False}

    def create_run(self, request_id: UUID, mode: str) -> UUID:
        existing = self.request("GET", "ingestion_runs", {"user_id": f"eq.{self.user_id}", "request_id": f"eq.{request_id}", "select": "id"})
        started_at = datetime.now(timezone.utc).isoformat()
        if existing:
            run_id = UUID(existing[0]["id"])
            self.request("PATCH", "ingestion_runs", {"id": f"eq.{run_id}"}, {"status": "running", "started_at": started_at, "error": None})
            return run_id
        row = self.request("POST", "ingestion_runs", payload={"user_id": self.user_id, "request_id": str(request_id), "mode": mode, "status": "running", "started_at": started_at})[0]
        return UUID(row["id"])

    def finish_run(self, run_id: UUID, status: str, stats: dict[str, int], error: str | None = None) -> None:
        self.request("PATCH", "ingestion_runs", {"id": f"eq.{run_id}"}, {"status": status, "stats": stats, "error": error, "finished_at": datetime.now(timezone.utc).isoformat()})

    def upsert_candidate(self, candidate: CandidateWork) -> str:
        doi = canonicalize_doi(candidate.doi)
        citation_count = candidate.metadata.get("citation_count", candidate.metadata.get("cited_by_count"))
        citation_count = int(citation_count) if citation_count is not None else None
        query = {"select": "id,doi,openalex_id,title,authors,publication_year"}
        identifier_match = None
        for kind, value in candidate.identifiers.items():
            matches = self.request("GET", "paper_identifiers", {"kind": f"eq.{quote(str(kind), safe='')}", "value": f"eq.{quote(str(value), safe='')}", "select": "paper_id", "limit": "1"})
            if matches:
                identifier_match = str(matches[0]["paper_id"])
                break
        if identifier_match:
            query["id"] = f"eq.{quote(identifier_match, safe='')}"
        elif doi:
            query["doi"] = f"eq.{quote(doi, safe='')}"
        elif candidate.identifiers.get("openalex"):
            query["openalex_id"] = f"eq.{quote(candidate.identifiers['openalex'], safe='')}"
        else:
            words = normalize_title(candidate.title).split()
            pattern = "*" + "*".join(words) + "*" if len(normalize_title(candidate.title)) >= 12 else candidate.title
            query["title"] = f"ilike.{quote(pattern, safe='*')}"
        existing = self.request("GET", "papers", query)
        existing_match = identifier_match or (choose_existing_paper({**candidate.__dict__, "identifiers": candidate.identifiers}, existing) if existing else None)
        if existing_match:
            paper_id = str(existing_match)
            old = next(row for row in existing if str(row["id"]) == paper_id)
            updates = {"abstract": candidate.abstract, "authors": [{"name": name} for name in candidate.authors], "venue": candidate.venue, "canonical_url": candidate.canonical_url, "citation_count": citation_count}
            if any(old.get(key) != value for key, value in updates.items()):
                self.request("PATCH", "papers", {"id": f"eq.{paper_id}"}, updates)
        else:
            rows = self.request("POST", "papers", payload={"doi": doi, "openalex_id": candidate.identifiers.get("openalex"), "title": candidate.title, "abstract": candidate.abstract, "authors": [{"name": name} for name in candidate.authors], "venue": candidate.venue, "publication_year": candidate.publication_year, "publication_date": candidate.publication_date, "canonical_url": candidate.canonical_url, "citation_count": citation_count})
            paper_id = str(rows[0]["id"])
        for kind, value in {**candidate.identifiers, **({"doi": doi} if doi else {})}.items():
            self.request("POST", "paper_identifiers", {"on_conflict": "paper_id,kind"}, {"paper_id": paper_id, "kind": kind, "value": value})
        locations = list(candidate.metadata.get("locations")) if isinstance(candidate.metadata.get("locations"), list) else []
        s2 = candidate.metadata.get("semantic_scholar")
        if isinstance(s2, dict) and isinstance(s2.get("openAccessPdf"), dict):
            locations.append({"pdf_url": s2["openAccessPdf"].get("url"), "url": s2["openAccessPdf"].get("url"), "version_kind": "unknown", "source_type": "semantic_scholar"})
        unpaywall = candidate.metadata.get("unpaywall") if isinstance(candidate.metadata.get("unpaywall"), dict) else None
        for source in rank_oa_sources(candidate.metadata, locations, unpaywall):
            existing_sources = self.request("GET", "paper_sources", {"paper_id": f"eq.{paper_id}", "pdf_url": f"eq.{quote(source.pdf_url, safe='')}", "select": "id"})
            payload = {"paper_id": paper_id, "source_type": source.source_type, "host": source.host, "landing_url": source.landing_url, "pdf_url": source.pdf_url, "version_kind": source.version_kind, "is_open_access": source.is_open_access, "is_preferred": source.is_preferred, "metadata": source.metadata}
            if existing_sources:
                self.request("PATCH", "paper_sources", {"id": f"eq.{existing_sources[0]['id']}"}, payload)
            else:
                self.request("POST", "paper_sources", payload=payload)
        return paper_id

    def is_eligible(self, paper_id: str, feed_id: str | None = None) -> bool:
        rows = self.request("GET", "paper_state", {"user_id": f"eq.{self.user_id}", "paper_id": f"eq.{paper_id}", "select": "status"})
        if rows and rows[0]["status"] in {"queue", "reading", "read", "rejected"}:
            return False
        if feed_id and self.request("GET", "recommendations", {"user_id": f"eq.{self.user_id}", "paper_id": f"eq.{paper_id}", "feed_id": f"eq.{feed_id}", "select": "id", "limit": "1"}):
            return False
        return not self.request("GET", "zotero_items", {"user_id": f"eq.{self.user_id}", "paper_id": f"eq.{paper_id}", "select": "id"})

    def add_recommendation(self, run_id: UUID, paper_id: str, feed: FeedConfig, score: float = 0, components: dict[str, float] | None = None, reason: str = "Discovered from feed scope") -> None:
        if not feed.id or not feed.user_id:
            raise ValueError("Supabase feeds require id and user_id")
        self.request("POST", "paper_feed_links", {"on_conflict": "user_id,paper_id,feed_id"}, {"user_id": self.user_id, "paper_id": paper_id, "feed_id": feed.id, "last_seen_at": datetime.now(timezone.utc).isoformat(), "best_score": score})
        self.request("POST", "recommendations", payload={"run_id": str(run_id), "user_id": self.user_id, "paper_id": paper_id, "feed_id": feed.id, "final_score": score, "components": components or {}, "reason_text": reason})

    def save_model(self, model: dict) -> None:
        query = {"user_id": f"eq.{self.user_id}", "scope": f"eq.{model['scope']}", "select": "id"}
        if model["scope"] == "feed":
            query["feed_id"] = f"eq.{model['feed_id']}"
        else:
            query["feed_id"] = "is.null"
        existing = self.request("GET", "recommender_models", query)
        if existing:
            self.request("PATCH", "recommender_models", {"id": f"eq.{existing[0]['id']}"}, model)
        else:
            self.request("POST", "recommender_models", payload=model)

    def ensure_feed_embedding(self, feed: FeedConfig) -> None:
        if not feed.id:
            return
        feed_rows = self.request("GET", "feeds", {"id": f"eq.{feed.id}", "select": "updated_at"})
        existing = self.request("GET", "feed_embeddings", {"feed_id": f"eq.{feed.id}", "select": "feed_id,updated_at"})
        if existing and (not feed_rows or existing[0].get("updated_at", "") >= feed_rows[0].get("updated_at", "")):
            return
        from .embeddings import DEFAULT_MODEL, embed_texts
        vector = embed_texts([feed.description])[0]
        payload = {"feed_id": feed.id, "model_name": DEFAULT_MODEL, "embedding": vector}
        if existing:
            self.request("PATCH", "feed_embeddings", {"feed_id": f"eq.{feed.id}"}, {key: value for key, value in payload.items() if key != "feed_id"})
        else:
            self.request("POST", "feed_embeddings", payload=payload)

    def ensure_paper_embedding(self, paper_id: str, candidate: CandidateWork) -> None:
        paper_rows = self.request("GET", "papers", {"id": f"eq.{paper_id}", "select": "updated_at"})
        existing = self.request("GET", "paper_embeddings", {"paper_id": f"eq.{paper_id}", "select": "paper_id,updated_at"})
        if existing and (not paper_rows or existing[0].get("updated_at", "") >= paper_rows[0].get("updated_at", "")):
            return
        from .embeddings import DEFAULT_MODEL, embed_texts
        vector = embed_texts([(candidate.title, candidate.abstract)])[0]
        payload = {"paper_id": paper_id, "model_name": DEFAULT_MODEL, "embedding": vector}
        if existing:
            self.request("PATCH", "paper_embeddings", {"paper_id": f"eq.{paper_id}"}, {key: value for key, value in payload.items() if key != "paper_id"})
        else:
            self.request("POST", "paper_embeddings", payload=payload)

    def candidate_features(self, candidate: CandidateWork, feed: FeedConfig) -> CandidateFeatures:
        paper_id = str(candidate.metadata.get("_paper_id") or candidate.doi or candidate.identifiers.get("openalex") or candidate.title.casefold())
        self.ensure_feed_embedding(feed)
        self.ensure_paper_embedding(paper_id, candidate)
        paper_row = self.request("GET", "paper_embeddings", {"paper_id": f"eq.{paper_id}", "select": "embedding"})
        feed_row = self.request("GET", "feed_embeddings", {"feed_id": f"eq.{feed.id}", "select": "embedding"}) if feed.id else []
        paper_vector = _parse_vector(paper_row[0].get("embedding")) if paper_row else []
        feed_vector = _parse_vector(feed_row[0].get("embedding")) if feed_row else []
        semantic = _cosine(paper_vector, feed_vector)
        text = " ".join((candidate.title, candidate.abstract or "", str(candidate.metadata))).casefold()
        keywords = tuple(dict.fromkeys((*feed.include_keywords, *feed.priority_keywords)))
        keyword_score = sum(keyword.casefold() in text for keyword in keywords) / len(keywords) if keywords else 0.0
        global_row = self.request("GET", "recommender_models", {"user_id": f"eq.{self.user_id}", "scope": "eq.global", "feed_id": "is.null", "select": "coefficients,intercept,metrics,label_counts,model_type"})
        feed_row_model = self.request("GET", "recommender_models", {"user_id": f"eq.{self.user_id}", "scope": "eq.feed", "feed_id": f"eq.{feed.id}", "select": "coefficients,intercept,metrics,label_counts,model_type"}) if feed.id else []
        freshness = _freshness(candidate)
        zotero_items = self.request("GET", "zotero_items", {"user_id": f"eq.{self.user_id}", "select": "metadata"})
        zotero_similarity = weak_zotero_similarity(paper_vector, [row.get("metadata", {}) for row in zotero_items]) if paper_vector else 0.0
        citation_count = candidate.metadata.get("citation_count", candidate.metadata.get("cited_by_count", 0))
        model_features = [*paper_vector, semantic, min(1.0, keyword_score), freshness, min(1.0, float(citation_count or 0) / 100), zotero_similarity]
        return CandidateFeatures(
            paper_id=paper_id,
            semantic_similarity=semantic,
            keyword_score=keyword_score,
            global_probability=_model_probability(global_row[0], model_features) if global_row and paper_vector else None,
            feed_probability=_model_probability(feed_row_model[0], model_features) if feed_row_model and paper_vector else None,
            zotero_similarity=zotero_similarity,
            freshness_impact=freshness,
            citation_impact=min(1.0, float(citation_count or 0) / 100),
            min_semantic_similarity=feed.min_semantic_similarity,
            diversity_vector=tuple(paper_vector),
        )


def _parse_vector(value: object) -> list[float]:
    if isinstance(value, list):
        return [float(item) for item in value]
    if isinstance(value, str):
        try:
            return [float(item) for item in value.strip("[]()").split(",") if item.strip()]
        except ValueError:
            return []
    return []


def _cosine(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right):
        return 0.0
    denominator = math.sqrt(sum(value * value for value in left) * sum(value * value for value in right))
    return sum(a * b for a, b in zip(left, right)) / denominator if denominator else 0.0


def _model_probability(row: Mapping, vector: list[float]) -> float:
    result = ModelResult([float(value) for value in row.get("coefficients", [])], float(row.get("intercept", 0)), {}, {}, str(row.get("model_type", "logistic_regression")))
    return predict_probability(result, vector)


def _freshness(candidate: CandidateWork) -> float:
    year = candidate.publication_year
    if not year:
        return 0.0
    return max(0.0, min(1.0, 1.0 - (datetime.now(timezone.utc).year - int(year)) / 10))
