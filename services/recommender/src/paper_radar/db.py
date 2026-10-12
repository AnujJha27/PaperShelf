from __future__ import annotations

import json
import math
import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError
from random import uniform
from time import sleep
from uuid import UUID

from .discovery.base import CandidateWork, FeedConfig
from .identity import normalized_identifiers
from .gates import TECHNICALITY_THRESHOLD, feed_profile_text, keyword_score, paper_text, passes_hard_gates, strong_keyword_evidence
from .technicality import predict_technicality
from .pdf_resolver import rank_oa_sources
from .model import ModelResult, model_is_compatible, predict_probability
from .ranking import CandidateFeatures
from .zotero_sync import weak_zotero_similarity


@dataclass
class ScoringContext:
    feed_embedding: list[float]
    global_model: Mapping | None
    feed_model: Mapping | None
    zotero_metadata: list[Mapping]


@dataclass
class SupabaseDB:
    url: str
    service_key: str
    user_id: str
    _scoring_contexts: dict[str, ScoringContext] = field(default_factory=dict, init=False, repr=False)

    def request(self, method: str, table: str, query: Mapping[str, str] | None = None, payload: object | None = None, *, retry_safe: bool | None = None) -> list[dict]:
        method = method.upper()
        if retry_safe is None:
            retry_safe = method in {"GET", "HEAD", "PATCH", "DELETE"}
        endpoint = f"{self.url.rstrip('/')}/rest/v1/{table}"
        if query:
            endpoint = f"{endpoint}?{urlencode(query, safe='%')}"
        headers = {"apikey": self.service_key, "Authorization": f"Bearer {self.service_key}", "Accept": "application/json", "Prefer": "return=representation,resolution=merge-duplicates"}
        data = json.dumps(payload).encode() if payload is not None else None
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = Request(endpoint, method=method, headers=headers, data=data)
        for attempt in range(4):
            try:
                with urlopen(request, timeout=30) as response:
                    raw = response.read()
                return json.loads(raw) if raw else []
            except HTTPError as error:
                detail = error.read().decode("utf-8", errors="replace").strip()
                if retry_safe and error.code in {429, 502, 503, 504} and attempt < 3:
                    delay = min(8.0, 0.5 * (2 ** attempt))
                    sleep(delay + uniform(0, delay))
                    continue
                raise RuntimeError(f"Supabase {method} {table} returned {error.code}: {detail}") from error
            except (URLError, TimeoutError, ConnectionError) as error:
                if retry_safe and attempt < 3:
                    delay = min(8.0, 0.5 * (2 ** attempt))
                    sleep(delay + uniform(0, delay))
                    continue
                raise RuntimeError(f"Supabase {method} {table} network error: {error}") from error
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
        rows = self.request("GET", "feeds", {"is_active": "eq.true", "user_id": f"eq.{self.user_id}", "select": "id,user_id,name,description,include_keywords,exclude_keywords,priority_keywords,min_semantic_similarity,min_publication_year,paper_type"})
        return [FeedConfig(id=row["id"], user_id=row["user_id"], name=row.get("name"), description=row["description"], include_keywords=row.get("include_keywords") or [], exclude_keywords=row.get("exclude_keywords") or [], min_semantic_similarity=row.get("min_semantic_similarity", 0.35), priority_keywords=row.get("priority_keywords") or [], min_publication_year=row.get("min_publication_year", 2018), paper_type=row.get("paper_type", "technical")) for row in rows]

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
        identifiers = normalized_identifiers({"doi": candidate.doi, "identifiers": candidate.identifiers})
        citation_count = candidate.metadata.get("citation_count", candidate.metadata.get("cited_by_count"))
        citation_count = int(citation_count) if citation_count is not None else None
        paper = {
            "doi": identifiers.get("doi"),
            "openalex_id": identifiers.get("openalex"),
            "title": candidate.title.strip(),
            "abstract": candidate.abstract,
            "authors": [{"name": name} for name in candidate.authors],
            "venue": candidate.venue,
            "publication_year": candidate.publication_year,
            "publication_date": candidate.publication_date,
            "work_type": candidate.metadata.get("type"),
            "canonical_url": candidate.canonical_url,
            "citation_count": citation_count,
        }
        rows = self.request("POST", "rpc/resolve_paper_candidate", {"select": "id"}, {"p_identifiers": identifiers, "p_candidate": paper}, retry_safe=True)
        if not rows or not rows[0].get("id"):
            raise RuntimeError("identity resolution returned no canonical paper")
        paper_id = str(rows[0]["id"])
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

    def reconcile_identity_conflicts(self) -> int:
        groups = self.request("POST", "rpc/scan_paper_identity_conflicts", payload={})
        merged = 0
        for group in groups:
            paper_ids = group.get("paper_ids") or []
            if len(paper_ids) > 1:
                self.request("POST", "rpc/merge_papers", payload={"p_paper_ids": paper_ids}, retry_safe=True)
                merged += 1
        return merged

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
        from .embeddings import DEFAULT_MODEL, EMBEDDING_DIMENSION, embed_texts
        feed_rows = self.request("GET", "feeds", {"id": f"eq.{feed.id}", "select": "updated_at"})
        existing = self.request("GET", "feed_embeddings", {"feed_id": f"eq.{feed.id}", "select": "feed_id,updated_at,model_name,embedding_dimension"})
        if existing and existing[0].get("model_name") == DEFAULT_MODEL and existing[0].get("embedding_dimension") == EMBEDDING_DIMENSION and (not feed_rows or existing[0].get("updated_at", "") >= feed_rows[0].get("updated_at", "")):
            return
        vector = embed_texts([feed_profile_text(feed.description, feed.priority_keywords, feed.include_keywords)])[0]
        payload = {"feed_id": feed.id, "model_name": DEFAULT_MODEL, "embedding_dimension": EMBEDDING_DIMENSION, "embedding": vector}
        if existing:
            self.request("PATCH", "feed_embeddings", {"feed_id": f"eq.{feed.id}"}, {key: value for key, value in payload.items() if key != "feed_id"})
        else:
            self.request("POST", "feed_embeddings", payload=payload)

    def ensure_paper_embedding(self, paper_id: str, candidate: CandidateWork) -> None:
        paper_rows = self.request("GET", "papers", {"id": f"eq.{paper_id}", "select": "updated_at"})
        existing = self.request("GET", "paper_embeddings", {"paper_id": f"eq.{paper_id}", "select": "paper_id,updated_at,model_name,embedding_dimension"})
        from .embeddings import DEFAULT_MODEL, EMBEDDING_DIMENSION, embed_texts
        if existing and existing[0].get("model_name") == DEFAULT_MODEL and existing[0].get("embedding_dimension") == EMBEDDING_DIMENSION and (not paper_rows or existing[0].get("updated_at", "") >= paper_rows[0].get("updated_at", "")):
            return
        vector = embed_texts([(candidate.title, candidate.abstract)])[0]
        payload = {"paper_id": paper_id, "model_name": DEFAULT_MODEL, "embedding_dimension": EMBEDDING_DIMENSION, "embedding": vector}
        if existing:
            self.request("PATCH", "paper_embeddings", {"paper_id": f"eq.{paper_id}"}, {key: value for key, value in payload.items() if key != "paper_id"})
        else:
            self.request("POST", "paper_embeddings", payload=payload)

    def candidate_features(self, candidate: CandidateWork, feed: FeedConfig) -> CandidateFeatures:
        paper_id = str(candidate.metadata.get("_paper_id") or candidate.doi or candidate.identifiers.get("openalex") or candidate.title.casefold())
        context = self._scoring_context(feed)
        self.ensure_paper_embedding(paper_id, candidate)
        paper_row = self.request("GET", "paper_embeddings", {"paper_id": f"eq.{paper_id}", "select": "embedding"})
        paper_vector = _parse_vector(paper_row[0].get("embedding")) if paper_row else []
        semantic = _cosine(paper_vector, context.feed_embedding)
        text = paper_text(candidate.title, candidate.abstract)
        keywords = tuple(dict.fromkeys((*feed.include_keywords, *feed.priority_keywords)))
        matched_keywords = keyword_score(text, keywords)
        strong = strong_keyword_evidence(text, feed.priority_keywords, feed.include_keywords)
        technicality = predict_technicality(candidate.title, candidate.abstract)
        topic_passed = passes_hard_gates(semantic, feed.min_semantic_similarity, strong, 1.0, "broad")
        technical_passed = feed.paper_type != "technical" or technicality >= TECHNICALITY_THRESHOLD
        freshness = _freshness(candidate)
        zotero_similarity = weak_zotero_similarity(paper_vector, [row.get("metadata", {}) for row in context.zotero_metadata]) if paper_vector else 0.0
        citation_count = candidate.metadata.get("citation_count", candidate.metadata.get("cited_by_count", 0))
        model_features = [*paper_vector, semantic, min(1.0, matched_keywords), freshness, min(1.0, float(citation_count or 0) / 100), zotero_similarity]
        return CandidateFeatures(
            paper_id=paper_id,
            semantic_similarity=semantic,
            keyword_score=matched_keywords,
            global_probability=_model_probability(context.global_model, model_features) if context.global_model and paper_vector else None,
            feed_probability=_model_probability(context.feed_model, model_features) if context.feed_model and paper_vector else None,
            zotero_similarity=zotero_similarity,
            freshness_impact=freshness,
            citation_impact=min(1.0, float(citation_count or 0) / 100),
            min_semantic_similarity=feed.min_semantic_similarity,
            diversity_vector=tuple(paper_vector),
            strong_keyword_evidence=strong,
            technicality_probability=technicality,
            topic_gate_passed=topic_passed,
            technical_gate_passed=technical_passed,
        )

    def _scoring_context(self, feed: FeedConfig) -> ScoringContext:
        key = str(feed.id or feed.description)
        if key not in self._scoring_contexts:
            self.ensure_feed_embedding(feed)
            feed_rows = self.request("GET", "feed_embeddings", {"feed_id": f"eq.{feed.id}", "select": "embedding"}) if feed.id else []
            model_fields = "coefficients,intercept,metrics,label_counts,model_type,feature_schema,feature_schema_version,feature_width,embedding_model,embedding_dimension"
            global_rows = self.request("GET", "recommender_models", {"user_id": f"eq.{self.user_id}", "scope": "eq.global", "feed_id": "is.null", "select": model_fields})
            feed_models = self.request("GET", "recommender_models", {"user_id": f"eq.{self.user_id}", "scope": "eq.feed", "feed_id": f"eq.{feed.id}", "select": model_fields}) if feed.id else []
            zotero_items = self.request("GET", "zotero_items", {"user_id": f"eq.{self.user_id}", "select": "metadata"})
            self._scoring_contexts[key] = ScoringContext(
                _parse_vector(feed_rows[0].get("embedding")) if feed_rows else [],
                global_rows[0] if global_rows else None,
                feed_models[0] if feed_models else None,
                zotero_items,
            )
        return self._scoring_contexts[key]


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


def _model_probability(row: Mapping, vector: list[float]) -> float | None:
    if not model_is_compatible(row, len(vector)):
        return None
    result = ModelResult([float(value) for value in row.get("coefficients", [])], float(row.get("intercept", 0)), {}, {}, str(row.get("model_type", "logistic_regression")))
    return predict_probability(result, vector)


def _freshness(candidate: CandidateWork) -> float:
    year = candidate.publication_year
    if not year:
        return 0.0
    return max(0.0, min(1.0, 1.0 - (datetime.now(timezone.utc).year - int(year)) / 10))
