from __future__ import annotations

import argparse
import os
from uuid import UUID, uuid4

from .discovery.base import FeedConfig
from .discovery.crossref import CrossrefAdapter
from .discovery.openalex import OpenAlexAdapter
from .discovery.semantic_scholar import SemanticScholarAdapter
from .discovery.unpaywall import UnpaywallAdapter
from .discovery.http import RequestBudget
from .db import SupabaseDB
from .pipeline import InMemoryDB, PipelineSettings, run_pipeline
from .zotero_sync import sync_zotero_metadata
from .training import train_and_store_models


def main() -> None:
    parser = argparse.ArgumentParser(prog="paper-radar")
    subparsers = parser.add_subparsers(dest="command", required=True)
    run = subparsers.add_parser("run")
    run.add_argument("--mode", choices=("training", "scheduled", "manual", "zotero_sync", "zotero-sync"), required=True)
    run.add_argument("--request-id", type=_optional_uuid)
    run.add_argument("--feed-id")
    run.add_argument("--batch-size", type=_batch_size, default=25)
    args = parser.parse_args()
    if args.command == "run":
        mode = "zotero_sync" if args.mode == "zotero-sync" else args.mode
        if os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
            db = SupabaseDB.from_env()
            if mode == "zotero_sync":
                request_id = args.request_id or uuid4()
                run_id = db.create_run(request_id, "zotero_sync")
                try:
                    stats = sync_zotero_metadata(db, os.environ["ZOTERO_API_KEY"], os.environ["ZOTERO_USER_ID"])
                    db.finish_run(run_id, "completed", stats)
                    result = {"status": "completed", "request_id": str(request_id), "stats": stats, "error": None}
                except Exception as error:
                    db.finish_run(run_id, "failed", {}, str(error))
                    result = {"status": "failed", "request_id": str(request_id), "stats": {}, "error": str(error)}
                print(result)
                return
            feeds = db.active_feeds()
            if args.feed_id:
                feeds = [feed for feed in feeds if str(feed.id) == args.feed_id]
            configured = db.settings()
            settings = PipelineSettings(
                recommender_mode=configured.get("recommender_mode", "training"),
                schedule_enabled=configured.get("schedule_enabled", False),
                training_batch_size=min(args.batch_size, configured.get("training_batch_size", args.batch_size)),
                max_feed_recommendations=configured.get("max_feed_recommendations", 8),
                max_today_recommendations=configured.get("max_today_recommendations", 50),
                exploration_rate=configured.get("exploration_rate", 0.10),
            )
            discovery_budget = RequestBudget(20)
            adapter = EnrichedAdapter(
                OpenAlexAdapter(os.getenv("OPENALEX_API_KEY"), os.getenv("OPENALEX_MAILTO") or os.getenv("CROSSREF_MAILTO"), discovery_budget),
                CrossrefAdapter(os.getenv("CROSSREF_MAILTO"), RequestBudget(20)),
                SemanticScholarAdapter(os.getenv("SEMANTIC_SCHOLAR_API_KEY"), RequestBudget(20)),
                UnpaywallAdapter(os.environ["UNPAYWALL_EMAIL"], RequestBudget(20)) if os.getenv("UNPAYWALL_EMAIL") else None,
            )
            result = run_pipeline(mode, feeds, settings, db, adapter, args.request_id)
            if result.status == "completed" and mode in {"training", "manual", "scheduled"}:
                result.stats.update(train_and_store_models(db))
        else:
            result = run_pipeline(
                mode,
                [],
                PipelineSettings(training_batch_size=args.batch_size),
                InMemoryDB(),
                _empty_adapter(),
                args.request_id,
            )
        print({"status": result.status, "request_id": str(result.request_id), "stats": result.stats, "error": result.error})


class _empty_adapter:
    def search(self, feed: FeedConfig, limit: int):
        return []


def _optional_uuid(value: str) -> UUID | None:
    return UUID(value) if value.strip() else None


def _batch_size(value: str) -> int:
    size = int(value)
    if not 1 <= size <= 100:
        raise argparse.ArgumentTypeError("batch size must be between 1 and 100")
    return size


class EnrichedAdapter:
    def __init__(self, discovery, crossref, semantic_scholar, unpaywall):
        self.discovery = discovery
        self.crossref = crossref
        self.semantic_scholar = semantic_scholar
        self.unpaywall = unpaywall

    def search(self, feed: FeedConfig, limit: int):
        candidates = self.discovery.search(feed, limit)
        for candidate in candidates:
            try:
                candidate = self.crossref.repair(candidate)
            except (OSError, RuntimeError):
                pass
            candidate = self.semantic_scholar.enrich(candidate)
            if candidate.doi and self.unpaywall:
                try:
                    record = self.unpaywall.lookup(candidate.doi)
                except (OSError, RuntimeError):
                    record = None
                if record:
                    candidate.metadata["unpaywall"] = dict(record)
        return candidates


if __name__ == "__main__":
    main()
