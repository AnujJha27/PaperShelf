import unittest
from io import BytesIO
from urllib.error import HTTPError
from unittest.mock import patch
from uuid import UUID

from paper_radar.db import SupabaseDB
from paper_radar.discovery.base import CandidateWork, FeedConfig


class RunLifecycleTests(unittest.TestCase):
    def test_supabase_conflict_identifies_the_request(self):
        db = SupabaseDB("https://supabase.test", "key", "user")
        error = HTTPError("https://supabase.test/rest/v1/papers", 409, "Conflict", {}, BytesIO(b'{"message":"duplicate key"}'))
        with patch("paper_radar.db.urlopen", side_effect=error):
            with self.assertRaisesRegex(RuntimeError, r"Supabase POST papers returned 409: .*duplicate key"):
                db.request("POST", "papers", payload={"title": "Paper"})

    def test_create_run_promotes_existing_queued_request(self):
        run_id = "00000000-0000-0000-0000-000000000001"
        calls = []
        db = SupabaseDB("https://supabase.test", "key", "user")

        def request(method, table, query=None, payload=None):
            calls.append((method, table, query, payload))
            return [{"id": run_id}] if method == "GET" else []

        db.request = request
        self.assertEqual(db.create_run(UUID("00000000-0000-0000-0000-000000000002"), "training"), UUID(run_id))
        self.assertEqual(calls[0][0:2], ("GET", "ingestion_runs"))
        self.assertEqual(calls[1][0:2], ("PATCH", "ingestion_runs"))
        self.assertEqual(calls[1][3]["status"], "running")

    def test_recommendation_refreshes_feed_link_score_and_seen_time(self):
        calls = []
        db = SupabaseDB("https://supabase.test", "key", "user")
        db.request = lambda method, table, query=None, payload=None: calls.append((method, table, query, payload)) or []
        db.add_recommendation(UUID("00000000-0000-0000-0000-000000000001"), "paper", FeedConfig("topic", id="feed", user_id="user"), 0.75)
        link = next(call for call in calls if call[1] == "paper_feed_links")
        self.assertEqual(link[3]["best_score"], 0.75)
        self.assertIn("last_seen_at", link[3])

    def test_upsert_reuses_exact_identifier_from_paper_identifiers(self):
        db = SupabaseDB("https://supabase.test", "key", "user")
        calls = []

        def request(method, table, query=None, payload=None):
            calls.append((method, table, query, payload))
            if method == "GET" and table == "paper_identifiers":
                return [{"paper_id": "paper-id"}]
            if method == "GET" and table == "papers":
                return [{"id": "paper-id", "abstract": None, "authors": [], "venue": None, "canonical_url": None, "citation_count": None}]
            return []

        db.request = request
        paper_id = db.upsert_candidate(CandidateWork("Paper", identifiers={"arxiv": "1234.5678"}))
        self.assertEqual(paper_id, "paper-id")
        self.assertEqual(calls[0][1], "paper_identifiers")

    def test_upsert_uses_normalized_title_fallback_candidates(self):
        db = SupabaseDB("https://supabase.test", "key", "user")
        calls = []
        existing = {"id": "paper-id", "title": "A useful study!", "authors": [{"name": "A"}], "publication_year": 2024, "abstract": None, "venue": None, "canonical_url": None, "citation_count": None}

        def request(method, table, query=None, payload=None):
            calls.append((method, table, query, payload))
            if method == "GET" and table == "papers" and str((query or {}).get("title", "")).startswith("ilike."):
                return [existing]
            return []

        db.request = request
        paper_id = db.upsert_candidate(CandidateWork("A useful study", authors=["A"], publication_year=2024))
        self.assertEqual(paper_id, "paper-id")
        self.assertTrue(str(calls[0][2]["title"]).startswith("ilike."))

    def test_stale_feed_embedding_is_updated_in_place(self):
        calls = []
        db = SupabaseDB("https://supabase.test", "key", "user")

        def request(method, table, query=None, payload=None):
            calls.append((method, table, query, payload))
            if method == "GET" and table == "feeds":
                return [{"updated_at": "2026-09-08T00:00:00+00:00"}]
            if method == "GET" and table == "feed_embeddings":
                return [{"feed_id": "feed", "updated_at": "2026-09-07T00:00:00+00:00"}]
            return []

        db.request = request
        with patch("paper_radar.embeddings.embed_texts", return_value=[[0.1] * 384]):
            db.ensure_feed_embedding(FeedConfig("topic", id="feed", user_id="user"))

        self.assertEqual([call[0:2] for call in calls if call[1] == "feed_embeddings"], [("GET", "feed_embeddings"), ("PATCH", "feed_embeddings")])

    def test_stale_paper_embedding_is_updated_in_place(self):
        calls = []
        db = SupabaseDB("https://supabase.test", "key", "user")

        def request(method, table, query=None, payload=None):
            calls.append((method, table, query, payload))
            if method == "GET" and table == "papers":
                return [{"updated_at": "2026-09-08T00:00:00+00:00"}]
            if method == "GET" and table == "paper_embeddings":
                return [{"paper_id": "paper", "updated_at": "2026-09-07T00:00:00+00:00"}]
            return []

        db.request = request
        with patch("paper_radar.embeddings.embed_texts", return_value=[[0.1] * 384]):
            db.ensure_paper_embedding("paper", CandidateWork("Changed title"))

        self.assertEqual([call[0:2] for call in calls if call[1] == "paper_embeddings"], [("GET", "paper_embeddings"), ("PATCH", "paper_embeddings")])
