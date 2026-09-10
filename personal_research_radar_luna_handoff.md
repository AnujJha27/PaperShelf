# Personal Research Radar — Luna Handoff & Implementation Plan

> **For agentic workers:** Build this task-by-task. Use TDD for each independently testable unit, keep commits small, and do not skip verification. The product is a single-user, field-agnostic paper discovery, recommendation, reading, annotation, notes, and Zotero workflow.

## Goal

Build a $0/month personal research-reading system that discovers papers across arbitrary fields, ranks them by user-defined feeds plus learned preferences, lets the user train the recommender before automation is enabled, supports in-app PDF reading/highlighting and a synced paged handwriting+typing notebook, and integrates bidirectionally with Zotero metadata.

## Non-negotiable product rules

1. **Single-user product.**
2. **Google sign-in only.** No password auth, signup UX, teams, roles, billing, or invitations.
3. **Internet required.** No offline editing/sync in v1.
4. **Works on desktop and Android tablet as an installable PWA.**
5. **Normal operation must cost $0/month.**
6. **Do not add any dependency on paid inference APIs or billing-enabled infrastructure.**
7. **If a free quota is exhausted, functionality must stop/degrade rather than incur charges.**
8. **Do not host a corpus of PDFs.** Store metadata, sources, highlights, reading state, notebook data, embeddings, and model parameters only.
9. **Only proxy publicly accessible PDFs.** Do not bypass paywalls, authentication, DRM, signed-access controls, or institutional login.
10. **Field-agnostic pipeline.** Do not hard-wire the product around arXiv, chemistry, CS, or any one discipline.
11. **Feeds are the main topical organization layer.** A paper may belong to multiple feeds while remaining one canonical paper.
12. **Read papers leave discovery views and live in Library.**
13. **Rejected papers remain recoverable in History → Rejected and remain negative training examples until reversed.**
14. **No handwriting OCR in v1.**
15. **No team features, comments, sharing, social features, citation-manager replacement, or LLM-generated summaries in v1.**

---

# Product model

## Main navigation

- **Today** — combined fresh inbox across all feeds; filter by feed.
- **Feeds** — create/edit feeds and open feed-specific inbox/history.
- **Queue** — papers labeled `Relevant` or `Maybe`; `Relevant` ranks above `Maybe`.
- **Reading** — papers explicitly started.
- **Library** — papers marked read/completed.
- **History → Rejected** — recoverable `Not relevant` papers.
- **Training** — explicit recommender calibration workflow.
- **Settings** — Google identity display, recommender status, schedule enablement, Zotero connection state, diagnostics.

## Paper lifecycle

```text
new recommendation
      |
      +-- Relevant ----> Queue(priority=relevant)
      |
      +-- Maybe --------> Queue(priority=maybe)
      |
      +-- Not relevant -> History/Rejected
      |
      +-- Open only ----> remains in inbox until classified

Queue -- Start reading --> Reading -- Mark read --> Library

Rejected -- Undo / Relevant / Maybe --> Inbox or Queue
```

Opening a PDF alone is **not** a strong positive training event.

## Feed definition

Each feed has:

- `name`
- natural-language `description`
- `include_keywords[]`
- `exclude_keywords[]`
- optional `priority_keywords[]`
- active/inactive toggle
- per-feed recommendation threshold
- per-feed model status and label counts

Example:

```text
Name: VISTA

Description:
Formal verification of machine-learning models, scientific ML,
theorem proving, machine-checked physical constraints and
electronic-structure methods.

Include:
Lean, theorem proving, formal verification, ML verification,
scientific machine learning, DFT, electronic structure

Exclude:
education

Priority:
artifact verification, proof certificates, physics-constrained models
```

Natural language is used for semantic retrieval/ranking. Keywords are explicit scope controls and retrieval terms. No LLM is needed to transform descriptions into queries.

## Training mode

The system begins in `training`.

- No scheduled twice-daily discovery while in training mode.
- User can request training batches from the app.
- Batch size: default 25.
- Training cards show full abstract by default.
- Actions: `Relevant`, `Maybe`, `Not relevant`, `Open paper`.
- Display progress counts for positive, maybe, negative, total, and feed coverage.
- Suggested readiness threshold:
  - >= 60 explicit labels total
  - >= 15 positive (`Relevant`)
  - >= 15 negative (`Not relevant`)
  - global model cross-validated balanced accuracy >= 0.60
- `Maybe` is a weak positive for model training.
- When readiness is reached, show **Ready to enable scheduled discovery**.
- User must explicitly enable Stable Mode; do not auto-enable it.

Per-feed classifiers:
- Train only when that feed has >= 20 explicit labels with >= 5 positive and >= 5 negative examples.
- Otherwise use semantic/keyword ranking plus the global model.

## Stable mode

Once explicitly enabled:

- Scheduled job runs twice daily.
- Default cron: `03:00 UTC` and `15:00 UTC`.
- Each active feed produces up to 8 fresh recommendations per run.
- Global Today view may show up to 50 new items per run.
- Duplicate or already-classified papers are not reintroduced.

## Recommendation signals

Each candidate has:

1. feed semantic similarity
2. keyword match score
3. per-feed classifier probability when a feed model is trained
4. global classifier probability
5. weak Zotero similarity prior
6. freshness prior
7. optional citation/impact prior
8. diversity / exploration adjustment

Recommended starting blend after models exist:

```text
35% feed semantic similarity
15% keyword score
25% feed classifier
15% global classifier
 5% Zotero similarity
 5% freshness/impact
```

When a feed model is unavailable, redistribute its 25% proportionally across feed semantic similarity, keyword score, and global score.

### Constrained exploration

Exploration is **not** random cross-field noise.

Default exploration rate: `0.10`.

A paper may enter exploration only if it passes the feed scope gate:

```text
not excluded
AND (
  keyword_score > 0
  OR semantic_similarity >= feed.min_semantic_similarity
)
```

Then:
- ~90% of slots use exploitation score.
- ~10% are selected from eligible uncertain/diverse papers.
- Prefer uncertainty near classifier probability 0.5 and semantic diversity.
- Use MMR or equivalent diversity selection.
- Explicitly rejected canonical papers never reappear unless rejection is reversed.

The objective is “adjacent novelty,” not unrelated entropy.

## Feedback weights

Store all user feedback as events.

Suggested model interpretation:

```text
Relevant       positive, weight 1.00
Maybe          positive, weight 0.35
Not relevant   negative, weight 1.00
Start reading  positive, weight 0.20
Mark read      positive, weight 0.40
Add to Zotero  positive, weight 0.30
Open PDF       do not train from this event
```

Explicit labels dominate behavioral signals.

## Zotero policy

Zotero is the long-term reference/citation store, not the primary reading UI.

Read:
- existing Zotero item metadata
- DOI/title/authors/abstract/tags where available

Use existing Zotero library for:
- deduplication
- `In Zotero` badge
- weak preference prior only

Write:
- one-click **Add to Zotero**
- metadata only by default: title, authors, DOI, abstract, venue, date, URL, tags

Do not automatically push:
- PDF files
- handwriting notebook
- PDF highlights

Keep Zotero credentials server-side.

---

# Architecture

```text
                 React + Vite + TypeScript PWA
                 desktop + Android tablet
                           |
                  Supabase Auth/Postgres
             Google OAuth + RLS + pgvector
                           |
          +----------------+------------------+
          |                                   |
 Cloudflare Worker                     GitHub Actions
 auth'd gateway                        Python recommender
 - public PDF proxy                    - discovery
 - Zotero API bridge                   - dedupe
 - GitHub dispatch                     - embeddings
                                       - ranking/model
                                       - Zotero sync
          |                                   |
       OA PDFs          OpenAlex / Crossref / Unpaywall
                       Semantic Scholar (optional enrich)
```

### Core technologies

Frontend:
- React
- TypeScript
- Vite
- React Router
- TanStack Query
- Supabase JS client
- PDF.js (`pdfjs-dist`)
- PWA manifest/service worker
- Pointer Events for stylus input
- `perfect-freehand` or equivalent open-source stroke smoothing library

Backend/data:
- Supabase Postgres
- pgvector
- Supabase Auth with Google
- PostgreSQL RLS
- Cloudflare Worker for authenticated gateway/proxy

ML/discovery:
- Python
- `sentence-transformers`
- `BAAI/bge-small-en-v1.5` (384 dimensions) or another 384-d open embedding model if compatibility requires it
- scikit-learn logistic regression
- OpenAlex primary discovery
- Crossref DOI/metadata repair
- Unpaywall OA resolution
- Semantic Scholar optional enrichment only

Automation:
- private GitHub repository
- GitHub Actions
- `workflow_dispatch` for manual training batches
- cron for stable-mode discovery

Testing:
- Vitest
- React Testing Library
- Playwright
- Pytest
- Supabase local/pgTAP or SQL policy tests
- Worker tests with Vitest/Cloudflare worker test runtime

---

# Proposed repository structure

```text
paper-radar/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   │   ├── App.tsx
│       │   │   ├── router.tsx
│       │   │   └── queryClient.ts
│       │   ├── auth/
│       │   │   ├── AuthGate.tsx
│       │   │   └── useSession.ts
│       │   ├── lib/
│       │   │   ├── supabase.ts
│       │   │   └── api.ts
│       │   ├── features/
│       │   │   ├── feeds/
│       │   │   ├── inbox/
│       │   │   ├── queue/
│       │   │   ├── reading/
│       │   │   ├── library/
│       │   │   ├── history/
│       │   │   ├── training/
│       │   │   ├── reader/
│       │   │   ├── notebook/
│       │   │   ├── zotero/
│       │   │   └── settings/
│       │   └── styles/
│       ├── public/
│       │   └── manifest.webmanifest
│       ├── vite.config.ts
│       └── package.json
├── packages/
│   └── shared/
│       └── src/
│           ├── api.ts
│           └── domain.ts
├── workers/
│   └── gateway/
│       ├── src/
│       │   ├── index.ts
│       │   ├── auth.ts
│       │   ├── pdfProxy.ts
│       │   ├── zotero.ts
│       │   └── githubDispatch.ts
│       ├── wrangler.toml
│       └── package.json
├── services/
│   └── recommender/
│       ├── src/paper_radar/
│       │   ├── cli.py
│       │   ├── config.py
│       │   ├── db.py
│       │   ├── identity.py
│       │   ├── embeddings.py
│       │   ├── model.py
│       │   ├── ranking.py
│       │   ├── pdf_resolver.py
│       │   ├── pipeline.py
│       │   ├── zotero_sync.py
│       │   └── discovery/
│       │       ├── base.py
│       │       ├── openalex.py
│       │       ├── crossref.py
│       │       └── semantic_scholar.py
│       ├── tests/
│       ├── pyproject.toml
│       └── uv.lock
├── supabase/
│   ├── migrations/
│   ├── tests/
│   └── seed.sql
├── .github/
│   └── workflows/
│       ├── web-ci.yml
│       └── recommender.yml
├── docs/
│   ├── architecture.md
│   └── setup.md
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

# Database model

Use UUID primary keys. User-owned tables must carry `user_id uuid references auth.users(id)` and be protected by RLS.

## `feeds`

```text
id uuid pk
user_id uuid not null
name text not null
description text not null
include_keywords text[] not null default '{}'
exclude_keywords text[] not null default '{}'
priority_keywords text[] not null default '{}'
min_semantic_similarity real not null default 0.35
is_active boolean not null default true
created_at timestamptz
updated_at timestamptz
```

## `papers`

Canonical scholarly work.

```text
id uuid pk
openalex_id text unique null
doi text unique null
title text not null
abstract text null
authors jsonb not null default '[]'
venue text null
publication_date date null
publication_year int null
work_type text null
citation_count int null
canonical_url text null
created_at timestamptz
updated_at timestamptz
```

Normalize DOI to lowercase and strip `https://doi.org/`.

## `paper_identifiers`

```text
paper_id uuid
kind text
value text
unique(kind, value)
```

Kinds can include `doi`, `openalex`, `arxiv`, `pmid`, `pmcid`, `mag`, or future source identifiers.

## `paper_sources`

```text
id uuid pk
paper_id uuid not null
source_type text not null
host text not null
landing_url text null
pdf_url text null
version_kind text null
is_open_access boolean not null default false
is_preferred boolean not null default false
metadata jsonb not null default '{}'
created_at timestamptz
updated_at timestamptz
```

`version_kind`: `published`, `accepted_manuscript`, `repository`, `preprint`, `unknown`.

## `paper_embeddings`

```text
paper_id uuid pk
model_name text not null
embedding vector(384) not null
updated_at timestamptz
```

## `feed_embeddings`

```text
feed_id uuid pk
model_name text not null
embedding vector(384) not null
updated_at timestamptz
```

## `paper_feed_links`

Persistent association so Library can still filter by feeds after papers leave discovery.

```text
user_id uuid
paper_id uuid
feed_id uuid
first_seen_at timestamptz
last_seen_at timestamptz
best_score real
unique(user_id, paper_id, feed_id)
```

## `ingestion_runs`

```text
id uuid pk
user_id uuid not null
request_id uuid unique not null
mode text not null         -- training | scheduled | manual
requested_feed_id uuid null
status text not null       -- queued | running | completed | failed
started_at timestamptz null
finished_at timestamptz null
stats jsonb not null default '{}'
error text null
created_at timestamptz
```

## `recommendations`

Immutable recommendation history.

```text
id uuid pk
run_id uuid not null
user_id uuid not null
paper_id uuid not null
feed_id uuid not null
final_score real not null
components jsonb not null
reason_text text not null
created_at timestamptz
unique(run_id, paper_id, feed_id)
```

## `paper_state`

One canonical state per user/paper.

```text
user_id uuid
paper_id uuid
status text not null        -- inbox | queue | reading | read | rejected
queue_priority text null    -- relevant | maybe
started_reading_at timestamptz null
completed_at timestamptz null
rejected_at timestamptz null
updated_at timestamptz
primary key(user_id, paper_id)
```

## `feedback_events`

```text
id uuid pk
user_id uuid not null
paper_id uuid not null
feed_id uuid null
event_type text not null
label text null
weight real not null
created_at timestamptz
metadata jsonb not null default '{}'
```

Event types include:
`relevant`, `maybe`, `not_relevant`, `undo_rejection`, `start_reading`, `mark_read`, `add_to_zotero`.

## `reader_state`

```text
user_id uuid
paper_id uuid
source_id uuid null
page_number int not null default 1
zoom real not null default 1
scroll_offset real not null default 0
updated_at timestamptz
primary key(user_id, paper_id)
```

## `pdf_highlights`

```text
id uuid pk
user_id uuid not null
paper_id uuid not null
source_id uuid null
page_number int not null
rects jsonb not null
selected_text text null
created_at timestamptz
updated_at timestamptz
```

Store highlight rectangles normalized to page width/height so they survive zoom changes.

## `notebook_pages`

One JSON document per notebook page.

```text
id uuid pk
user_id uuid not null
paper_id uuid not null
page_index int not null
objects jsonb not null default '[]'
search_text text not null default ''
version int not null default 1
updated_at timestamptz
unique(user_id, paper_id, page_index)
```

Notebook object schemas:

```json
{
  "type": "stroke",
  "id": "uuid",
  "points": [[0.12, 0.30, 0.42], [0.13, 0.31, 0.51]],
  "width": 2.2
}
```

Coordinates are normalized. Third value is pressure.

```json
{
  "type": "text",
  "id": "uuid",
  "x": 0.15,
  "y": 0.22,
  "w": 0.45,
  "h": 0.15,
  "text": "Typed note",
  "fontSize": 16
}
```

`search_text` is derived from typed objects only. Handwriting is intentionally not OCR'd.

## `recommender_models`

Do not store Python pickle blobs.

```text
id uuid pk
user_id uuid not null
scope text not null         -- global | feed
feed_id uuid null
model_type text not null    -- logistic_regression
model_name text not null
coefficients jsonb not null
intercept real not null
metrics jsonb not null
label_counts jsonb not null
trained_at timestamptz
```

## `zotero_items`

```text
id uuid pk
user_id uuid not null
zotero_key text not null
paper_id uuid null
doi text null
title text not null
metadata jsonb not null
synced_at timestamptz
unique(user_id, zotero_key)
```

## `app_settings`

```text
user_id uuid pk
recommender_mode text not null default 'training'
schedule_enabled boolean not null default false
exploration_rate real not null default 0.10
training_batch_size int not null default 25
max_feed_recommendations int not null default 8
max_today_recommendations int not null default 50
updated_at timestamptz
```

---

# Security model

1. Google OAuth through Supabase.
2. All user-owned rows use RLS: `user_id = auth.uid()`.
3. Browser gets only Supabase anon key.
4. GitHub Actions receives Supabase service-role key through GitHub Secrets.
5. Cloudflare Worker validates the Supabase JWT before:
   - PDF proxy requests
   - Zotero operations
   - GitHub Action dispatch
6. Zotero API key is a Cloudflare Worker secret and GitHub Secret, never shipped to browser.
7. GitHub fine-grained token is a Worker secret and may only trigger Actions in this repository.
8. Optional `ALLOWED_EMAIL` Worker secret/front-end guard may reject other Google identities, but **RLS is the actual security boundary**.
9. Worker PDF proxy accepts a `paper_source_id`, not an arbitrary URL.
10. Worker loads the source row from Supabase using the caller's JWT, validates `is_open_access=true`, and then fetches the stored `pdf_url`.
11. Only `https:` PDF origins are allowed.
12. Never send cookies or browser credentials to third-party PDF origins.
13. Forward byte-range headers for PDF.js.
14. No paywall/session-cookie bypass logic.

---

# API contracts

## Worker

### `POST /api/jobs/training-batch`

Auth: Supabase Bearer JWT.

Body:

```json
{
  "feedId": "uuid-or-null",
  "batchSize": 25
}
```

Response:

```json
{
  "requestId": "uuid",
  "status": "queued"
}
```

Behavior:
- validate user
- create `ingestion_runs` row with `status=queued`
- dispatch GitHub Actions `workflow_dispatch` with `mode=training`, `request_id`, optional `feed_id`, `batch_size`

### `GET /api/pdf/:sourceId`

Auth: Supabase Bearer JWT.

Behavior:
- fetch source row with caller JWT
- require OA source and `pdf_url`
- forward `Range`, `If-None-Match`, `If-Modified-Since`
- stream response
- preserve `Content-Type`, `Content-Length`, `Content-Range`, `Accept-Ranges`, `ETag`, `Last-Modified`
- never persist full PDF

### `POST /api/zotero/add`

Body:

```json
{
  "paperId": "uuid"
}
```

Response:

```json
{
  "status": "created-or-existing",
  "zoteroKey": "ABC123"
}
```

Worker reads canonical metadata from Supabase and talks to Zotero using server-side credentials.

### `POST /api/zotero/sync`

Triggers GitHub Action with `mode=zotero_sync`.

---

# Discovery pipeline

## Candidate retrieval per active feed

For each run/feed:

1. Run OpenAlex semantic search from feed description.
2. Run OpenAlex keyword search using include/priority keywords.
3. Merge candidate IDs.
4. Apply exclude-keyword rules against title + abstract + concepts/metadata.
5. Fetch/normalize work metadata.
6. Canonicalize DOI and identifiers.
7. Deduplicate against local DB:
   - exact DOI
   - exact known identifier
   - normalized title + first author + year fallback
8. Enrich missing DOI/metadata with Crossref.
9. Optionally enrich citation/open-PDF information with Semantic Scholar.
10. Resolve all legitimate OA sources with OpenAlex locations + Unpaywall.
11. Compute/store embeddings for new papers.
12. Compute feed embedding when feed description changes.
13. Score.
14. Remove papers already in `queue`, `reading`, `read`, or `rejected`.
15. Apply constrained exploration and diversity.
16. Insert immutable `recommendations` rows.
17. Upsert `paper_feed_links`.
18. Mark ingestion run complete.

Do not make Semantic Scholar failure fatal.

## Canonical identity

Priority:
1. DOI
2. exact source identifier
3. arXiv/PMID/PMCID identifiers
4. fallback fuzzy normalized title + first author + year

Fuzzy title matching must be conservative. Never merge two works solely because titles are short/similar.

---

# PDF resolution

Build a ranked candidate list from:

1. OpenAlex OA locations
2. Unpaywall `best_oa_location` and all OA locations
3. Semantic Scholar open-access PDF if present
4. known preprint/repository URLs already attached to the work

Preferred order:

```text
published OA PDF
accepted manuscript
repository copy
preprint
unknown OA copy
```

But preserve every candidate so the user can manually switch versions.

Reader behavior:

```text
try direct PDF.js URL
    |
    +-- works -> use direct
    |
    +-- fails -> use authenticated Worker proxy
                      |
                      +-- fails -> try next OA source
                                      |
                                      +-- none -> show external links
```

---

# Model implementation

## Embeddings

Use the same fixed 384-dimensional embedding model for:
- feed descriptions
- title + abstract
- Zotero items

Embedding text:

```text
TITLE: <title>

ABSTRACT:
<abstract or empty string>
```

For Zotero records without abstract, embed title only.

## Training matrix

Inputs:
- paper embedding (384 dims)
- semantic score
- keyword score
- freshness feature
- citation percentile feature
- weak Zotero similarity feature

Explicit labels:
- Relevant -> class 1, sample weight 1.00
- Maybe -> class 1, sample weight 0.35
- Not relevant -> class 0, sample weight 1.00

Behavioral positives may be appended with the lower weights specified earlier.

Use:
- StandardScaler for scalar metadata features if needed
- LogisticRegression with class balancing
- stratified cross-validation for readiness metric
- deterministic random seed

Store model coefficients/intercept in JSON, not pickled objects.

---

# UI requirements

## Today

Paper card must show:
- title
- authors
- venue/year
- feed badges
- full or generous abstract preview
- why recommended
- recommendation score details behind an expandable disclosure
- `Relevant`
- `Maybe`
- `Not relevant`
- `Open paper`
- Zotero badge/action

Filters:
- all feeds
- individual feeds
- Recommended
- Newest

When classified:
- animate/remove from Today
- update destination view immediately
- persist optimistic update, roll back on API failure

## Training

Use the same paper-list presentation, with **full abstract shown by default**.

Top panel:
- total labels
- Relevant count
- Maybe count
- Not relevant count
- model metric
- status: `Cold start`, `Training`, `Calibrating`, `Ready`, or `Stable`

Button:
- `Fetch 25 more`

When ready:
- `Enable twice-daily discovery`

## Queue

Sections/sort:
1. Relevant
2. Maybe

Actions:
- Start reading
- Change priority
- Reject
- Add to Zotero

## Reading

Shows papers with `status=reading`, last-opened first.

## Library

Only completed/read papers by default.

Search:
- title
- authors
- abstract
- typed notebook `search_text`

Filters:
- feed
- year
- Zotero status

## Rejected history

Show:
- rejected date
- originating feeds
- recommendation reason/score at the time
- `Undo rejection`
- `Move to Queue as Maybe`
- `Move to Queue as Relevant`

## Paper reader

Desktop:
- PDF pane + notebook pane side by side
- resizable divider

Tablet:
- tabs or split view depending viewport width
- large stylus-friendly controls

Reader toolbar:
- source/version selector
- page
- zoom
- text-highlight mode
- notebook toggle
- Start reading / Mark read
- Add to Zotero

Persist reading position.

## PDF highlights

v1 supports text-layer selection highlights:
- select text
- tap/click highlight
- save normalized rectangles + selected text
- render at any zoom
- delete highlight
- highlights sync across devices

No freehand drawing directly on the PDF in v1.

## Notebook

Each paper has a paged notebook.

Each page is a single mixed surface:
- pen strokes
- typed text blocks
- selection/move
- eraser
- undo/redo
- add/delete/reorder pages

Page coordinate system:
- fixed logical page size
- normalized coordinates in persistence
- responsive visual scale

Stylus:
- use Pointer Events
- prefer `pointerType === "pen"` for ink
- store pressure where available
- finger defaults to pan/select on touch devices unless draw mode is explicitly active

Autosave:
- debounce ~750 ms after edits
- optimistic concurrency with page `version`
- update only if expected version matches
- on conflict, stop overwrite, fetch latest, show a conflict banner with `Reload latest` and `Keep my copy as new page`

Because the app is single-user and online-only, do not implement CRDT/OT in v1.

---

# IMPLEMENTATION PLAN

## Task 1 — Repository, toolchain, CI, and app skeleton

**Files**
- Create root workspace files.
- Create `apps/web`.
- Create `workers/gateway`.
- Create `services/recommender`.
- Create `.github/workflows/web-ci.yml`.

**Interfaces produced**
- `pnpm test`, `pnpm lint`, `pnpm build`
- `uv run pytest`
- basic React route rendering
- basic Worker health route
- basic Python package import

**Steps**
- [ ] Scaffold pnpm workspace and Vite React TypeScript app.
- [ ] Add Vitest, React Testing Library, ESLint, TypeScript checks, Playwright.
- [ ] Scaffold Worker package and health endpoint.
- [ ] Scaffold Python package with pytest.
- [ ] Write failing smoke tests for web, worker, and Python package.
- [ ] Run each smoke test and verify failure.
- [ ] Implement minimum skeletons.
- [ ] Run all smoke tests and verify pass.
- [ ] Add CI workflow for TS lint/test/build plus Python tests.
- [ ] Commit: `chore: scaffold paper radar workspace`

**Acceptance**
- Clean checkout can run all tests/builds.
- No Supabase/API credentials required for unit tests.

---

## Task 2 — Supabase schema, enums/checks, indexes, and RLS

**Files**
- `supabase/migrations/0001_extensions.sql`
- `supabase/migrations/0002_schema.sql`
- `supabase/migrations/0003_rls.sql`
- `supabase/tests/rls.sql`

**Interfaces produced**
- all tables described in this plan
- pgvector extension
- RLS policies for user-owned tables
- authenticated read-only paper metadata policy

**Steps**
- [ ] Write SQL tests proving user A cannot read/write user B's state/notes/feed rows.
- [ ] Run against local Supabase and verify tests fail before policies exist.
- [ ] Add extensions, tables, constraints, indexes, updated-at triggers.
- [ ] Add RLS policies.
- [ ] Add indexes for DOI, OpenAlex ID, status, feed membership, and vector similarity.
- [ ] Re-run SQL tests and verify pass.
- [ ] Commit: `feat: add database schema and row level security`

**Acceptance**
- User-owned data is isolated by `auth.uid()`.
- Browser cannot insert/update canonical `papers` or `paper_sources`.
- Service-role pipeline can perform ingestion writes.

---

## Task 3 — Google auth, PWA shell, and navigation

**Files**
- `apps/web/src/auth/AuthGate.tsx`
- `apps/web/src/auth/useSession.ts`
- `apps/web/src/lib/supabase.ts`
- `apps/web/src/app/router.tsx`
- `apps/web/public/manifest.webmanifest`
- `apps/web/vite.config.ts`

**Interfaces produced**
- `useSession()`
- protected route tree
- Google sign-in/out
- Today/Feeds/Queue/Reading/Library/History/Training/Settings routes

**Steps**
- [ ] Write route/auth tests for signed-out and signed-in states.
- [ ] Verify they fail.
- [ ] Configure Supabase client.
- [ ] Implement Google OAuth button and session restore.
- [ ] Add optional allowed-email UI guard.
- [ ] Add responsive app shell and navigation.
- [ ] Add installable PWA manifest and service worker that caches app shell only; API/data remain network-first.
- [ ] Run tests.
- [ ] Commit: `feat: add google auth and pwa shell`

**Acceptance**
- App installs on Android.
- Signed-out user sees Google login.
- Signed-in user reaches Today.
- App does not pretend to support offline editing.

---

## Task 4 — Feed CRUD and Settings

**Files**
- `apps/web/src/features/feeds/*`
- `apps/web/src/features/settings/*`
- `packages/shared/src/domain.ts`

**Interfaces produced**
- `Feed` type
- feed create/update/archive methods
- app settings read/update methods

**Steps**
- [ ] Write tests for feed validation: name required, description required, keyword normalization, duplicate keyword removal.
- [ ] Verify fail.
- [ ] Implement feed list/create/edit UI.
- [ ] Implement include/exclude/priority keyword controls.
- [ ] Implement semantic-threshold slider with safe default.
- [ ] Implement app settings panel showing Training/Stable state.
- [ ] Run tests.
- [ ] Commit: `feat: add custom feed management`

**Acceptance**
- User can create arbitrary field-agnostic feeds.
- Feed description and keywords persist and sync.

---

## Task 5 — Discovery adapters, identity, and deduplication

**Files**
- `services/recommender/src/paper_radar/discovery/base.py`
- `openalex.py`
- `crossref.py`
- `semantic_scholar.py`
- `identity.py`
- tests for all above

**Interfaces produced**

```python
class CandidateWork: ...
class DiscoveryAdapter(Protocol):
    def search(self, feed: FeedConfig, limit: int) -> list[CandidateWork]: ...

def canonicalize_doi(raw: str | None) -> str | None: ...
def choose_existing_paper(candidate: CandidateWork, existing: list[Paper]) -> UUID | None: ...
```

**Steps**
- [ ] Write fixture-based tests for DOI normalization, exact-ID match, conservative title fallback, and non-merge cases.
- [ ] Verify fail.
- [ ] Implement OpenAlex semantic + keyword retrieval.
- [ ] Implement Crossref repair lookup.
- [ ] Implement optional Semantic Scholar enrichment behind failure-tolerant adapter.
- [ ] Implement canonical identity/dedupe.
- [ ] Add request budgets and retry/backoff; exhaustion must stop the run, not use a paid path.
- [ ] Run tests.
- [ ] Commit: `feat: add scholarly discovery and deduplication`

**Acceptance**
- Same DOI never becomes two canonical papers.
- Similar short titles are not aggressively merged.
- S2 outage does not break core ingestion.

---

## Task 6 — OA source resolver and PDF gateway

**Files**
- `services/recommender/src/paper_radar/pdf_resolver.py`
- `workers/gateway/src/auth.ts`
- `workers/gateway/src/pdfProxy.ts`
- Worker tests

**Interfaces produced**

```python
def rank_oa_sources(work: CandidateWork, openalex_locations, unpaywall_record) -> list[ResolvedSource]
```

Worker:
`GET /api/pdf/:sourceId`

**Steps**
- [ ] Write resolver tests for published OA > accepted > repository > preprint.
- [ ] Write Worker tests rejecting unauthenticated calls and non-OA source IDs.
- [ ] Verify fail.
- [ ] Implement Unpaywall lookup and source normalization.
- [ ] Preserve multiple versions.
- [ ] Implement JWT validation and source-ID lookup in Worker.
- [ ] Implement byte-range streaming.
- [ ] Explicitly do not forward third-party cookies/auth headers.
- [ ] Run tests.
- [ ] Commit: `feat: resolve and proxy public paper pdfs`

**Acceptance**
- Public PDFs blocked by embedding/CORS can be rendered through gateway when origin allows server fetch.
- Paywalled/authenticated sources are not bypassed.

---

## Task 7 — Embeddings, classifier, ranking, and constrained exploration

**Files**
- `embeddings.py`
- `model.py`
- `ranking.py`
- tests

**Interfaces produced**

```python
def embed_texts(texts: list[str]) -> np.ndarray: ...
def train_global_model(examples: list[TrainingExample]) -> ModelResult: ...
def train_feed_model(feed_id: UUID, examples: list[TrainingExample]) -> ModelResult | None: ...
def score_candidates(... ) -> list[ScoredCandidate]: ...
def select_with_exploration(candidates, slots: int, exploration_rate: float) -> list[ScoredCandidate]: ...
```

**Steps**
- [ ] Add deterministic fixture embeddings/mock embedder for unit tests.
- [ ] Write tests proving excluded candidates never survive.
- [ ] Write tests proving exploration candidates still satisfy feed scope gate.
- [ ] Write test that rejected canonical papers are filtered.
- [ ] Write tests for feed-model fallback when label counts are insufficient.
- [ ] Verify fail.
- [ ] Implement BGE embedding wrapper.
- [ ] Implement logistic regression training and CV readiness metrics.
- [ ] Implement weighted labels.
- [ ] Implement final score blend and MMR-style diversity.
- [ ] Serialize coefficients/metrics as JSON.
- [ ] Run tests.
- [ ] Commit: `feat: add personalized paper recommender`

**Acceptance**
- Exploration cannot inject unrelated papers that fail scope.
- Global and per-feed models coexist.
- Models are reproducible.

---

## Task 8 — Pipeline orchestration, manual training batches, and GitHub Actions

**Files**
- `pipeline.py`
- `cli.py`
- `workers/gateway/src/githubDispatch.ts`
- `.github/workflows/recommender.yml`
- tests

**Interfaces produced**
- CLI:
  - `paper-radar run --mode training --request-id ...`
  - `paper-radar run --mode scheduled`
  - `paper-radar run --mode zotero-sync`
- Worker:
  - `POST /api/jobs/training-batch`

**Steps**
- [ ] Write orchestration tests using fake adapters and fake DB.
- [ ] Write Worker dispatch auth/input tests.
- [ ] Verify fail.
- [ ] Implement ingestion-run status transitions.
- [ ] Implement `workflow_dispatch`.
- [ ] Implement scheduled cron at `03:00 UTC` and `15:00 UTC`.
- [ ] Scheduled mode must exit immediately when `schedule_enabled=false` or `recommender_mode!='stable'`.
- [ ] Implement training batch cap.
- [ ] Run tests.
- [ ] Commit: `feat: orchestrate training and scheduled discovery`

**Acceptance**
- Training batches can be requested from the app.
- Twice-daily workflow exists but performs no discovery until Stable Mode is explicitly enabled.

---

## Task 9 — Today, Training, Queue, Reading, Library, and Rejected views

**Files**
- `apps/web/src/features/inbox/*`
- `training/*`
- `queue/*`
- `reading/*`
- `library/*`
- `history/*`

**Interfaces produced**
- paper classification mutations
- status transition functions

**Steps**
- [ ] Write reducer/domain tests for every allowed state transition.
- [ ] Write component tests for classification and undo.
- [ ] Verify fail.
- [ ] Implement Today list with feed filters and abstract-first cards.
- [ ] Implement `Relevant`, `Maybe`, `Not relevant`.
- [ ] Implement optimistic removal and rollback.
- [ ] Implement Training progress and Fetch Batch button.
- [ ] Implement Stable-mode enable CTA only after readiness.
- [ ] Implement Queue grouped by relevant/maybe.
- [ ] Implement Reading and Library.
- [ ] Implement Rejected History with undo/reclassify.
- [ ] Run tests.
- [ ] Commit: `feat: add paper workflow views`

**Acceptance**
- Feed stays clean as papers are classified.
- Read papers do not pollute Today/feed inboxes.
- Rejections are fully recoverable.

---

## Task 10 — PDF reader, source switching, progress, and highlights

**Files**
- `apps/web/src/features/reader/PaperReader.tsx`
- `PdfDocument.tsx`
- `SourcePicker.tsx`
- `HighlightLayer.tsx`
- reader tests

**Interfaces produced**
- `saveReaderState`
- `createHighlight`
- `deleteHighlight`
- source fallback logic

**Steps**
- [ ] Write tests for normalized highlight coordinate conversion.
- [ ] Write tests for source fallback order.
- [ ] Verify fail.
- [ ] Integrate PDF.js.
- [ ] Attempt direct OA URL then Worker proxy then next source.
- [ ] Persist page/zoom/scroll.
- [ ] Implement text-layer selection highlight creation.
- [ ] Render synced highlights at arbitrary zoom.
- [ ] Add Start reading / Mark read controls.
- [ ] Run tests.
- [ ] Commit: `feat: add synced pdf reader and highlights`

**Acceptance**
- Reader resumes on another device at saved position.
- Highlights survive zoom and device changes.
- User can switch between preprint/published/repository copies.

---

## Task 11 — Mixed handwriting + typed paged notebook

**Files**
- `apps/web/src/features/notebook/Notebook.tsx`
- `NotebookPage.tsx`
- `InkLayer.tsx`
- `TextObject.tsx`
- `notebookModel.ts`
- notebook tests

**Interfaces produced**

```ts
type NotebookObject = StrokeObject | TextObject;

type StrokeObject = {
  type: "stroke";
  id: string;
  points: Array<[number, number, number]>;
  width: number;
};

type TextObject = {
  type: "text";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontSize: number;
};
```

**Steps**
- [ ] Write pure model tests for coordinate normalization, stroke simplification, page reorder, object move, and derived `search_text`.
- [ ] Verify fail.
- [ ] Implement fixed logical page coordinate system.
- [ ] Implement pen drawing with Pointer Events and pressure.
- [ ] Smooth strokes with `perfect-freehand` or equivalent.
- [ ] Implement eraser, selection/move, undo/redo.
- [ ] Implement draggable/resizable typed text blocks on the same surface.
- [ ] Add multiple pages, add/delete/reorder.
- [ ] Add 750 ms debounced save.
- [ ] Add version-based optimistic concurrency.
- [ ] Add conflict banner behavior.
- [ ] Run tests.
- [ ] Commit: `feat: add synced paged research notebook`

**Acceptance**
- User can type and handwrite on the same page.
- Notebook works with Android stylus and mouse.
- No OCR.
- No CRDT.

---

## Task 12 — Zotero sync, dedup prior, and Add to Zotero

**Files**
- `zotero_sync.py`
- `workers/gateway/src/zotero.ts`
- `apps/web/src/features/zotero/*`
- tests

**Interfaces produced**
- scheduled/manual metadata sync
- `POST /api/zotero/add`
- local Zotero similarity feature

**Steps**
- [ ] Write fixture tests for Zotero DOI/title matching.
- [ ] Write Worker tests for authenticated add and duplicate detection.
- [ ] Verify fail.
- [ ] Implement Zotero metadata pull into `zotero_items`.
- [ ] Link existing canonical papers.
- [ ] Embed Zotero title/abstract and compute weak similarity prior.
- [ ] Implement Add to Zotero without PDF upload.
- [ ] Log `add_to_zotero` feedback event.
- [ ] Run tests.
- [ ] Commit: `feat: integrate zotero metadata workflow`

**Acceptance**
- Existing Zotero items prevent duplicate recommendations.
- Zotero only weakly influences ranking.
- One-click add does not expose Zotero API key.

---

## Task 13 — Search, diagnostics, end-to-end testing, and deployment

**Files**
- Library search components
- Settings diagnostics
- `tests/e2e/*`
- `docs/setup.md`
- `docs/architecture.md`
- deployment config

**Steps**
- [ ] Add search across paper metadata and typed notebook `search_text`.
- [ ] Add diagnostics: last discovery run, last Zotero sync, model state, API errors, current free-mode guardrail settings.
- [ ] Add Playwright flow:
  1. sign in using test auth fixture
  2. create feed
  3. load seeded recommendation
  4. mark Maybe
  5. see it in Queue
  6. Start reading
  7. open PDF fixture
  8. create highlight
  9. add notebook stroke/text
  10. mark read
  11. see paper in Library
  12. reject another paper and undo it
- [ ] Add pipeline integration test with mocked external APIs.
- [ ] Verify all tests pass.
- [ ] Document required environment variables and secret placement.
- [ ] Document Supabase Google OAuth setup.
- [ ] Document Cloudflare Pages/Worker deployment.
- [ ] Document GitHub Actions secrets.
- [ ] Document Zotero API-key creation.
- [ ] Add quota behavior notes: no paid fallback.
- [ ] Commit: `test: verify end to end research workflow`

**Acceptance**
- Fresh user can follow setup docs without paid service.
- End-to-end lifecycle works.
- No secret is bundled in web assets.

---

# Required secrets and environment values

## Web (`apps/web`)

Public:
```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_GATEWAY_URL
VITE_ALLOWED_EMAIL   # optional UI guard, not a security secret
```

## Cloudflare Worker

Secrets:
```text
SUPABASE_URL
SUPABASE_ANON_KEY
ALLOWED_EMAIL
ZOTERO_API_KEY
ZOTERO_USER_ID
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
```

`GITHUB_TOKEN` must be fine-grained and limited to triggering Actions for this repo.

## GitHub Actions

Secrets:
```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENALEX_API_KEY
UNPAYWALL_EMAIL
CROSSREF_MAILTO
SEMANTIC_SCHOLAR_API_KEY   # optional
ZOTERO_API_KEY
ZOTERO_USER_ID
```

No payment/billing secrets should exist.

---

# Free-tier guardrails to implement in code

1. Cap OpenAlex searches per run.
2. Cap candidates per feed before enrichment.
3. Cache metadata and embeddings; never re-embed unchanged papers.
4. Do not use OpenAlex paid PDF/content download paths.
5. Stop enrichment when optional APIs rate-limit.
6. Never automatically upgrade infrastructure or call a paid provider.
7. Do not upload PDFs to Supabase/Zotero.
8. Store notebook strokes as compact vector JSON.
9. Compress/simplify stylus paths before persistence.
10. Keep scheduled job small and deterministic.
11. Expose last-run stats so quota drift is visible.

---

# UX acceptance checklist

The app is not done until all are true:

- [ ] Creating a feed requires both a natural-language description and supports keyword controls.
- [ ] Today combines feeds and can filter by feed.
- [ ] Full abstracts are easily visible during training.
- [ ] Training can happen before any scheduled recommendation runs.
- [ ] Recommender readiness is visible and Stable Mode requires explicit opt-in.
- [ ] Exploration never ignores feed relevance gates.
- [ ] Relevant and Maybe both move papers to Queue.
- [ ] Read papers live in Library, not feed inboxes.
- [ ] Rejected papers are searchable/recoverable.
- [ ] A canonical paper can belong to multiple feeds without duplicate notes/state.
- [ ] Reader can use multiple OA versions and a public-PDF proxy.
- [ ] PDF highlights sync.
- [ ] Notebook supports handwriting and typed text on the same paged surface.
- [ ] Notebook works with Android stylus.
- [ ] Google sign-in protects synced private data.
- [ ] Zotero can be read for weak prior/dedup and written with one click.
- [ ] No paid LLM/API is needed.
- [ ] Normal use remains inside free infrastructure.

---

# Build order / milestones

## Milestone 1 — Usable paper inbox
Tasks 1–5 and Task 9 subset:
- auth
- feeds
- database
- discovery
- canonical papers
- Today
- basic classification

At this point the user can already discover and triage papers.

## Milestone 2 — Personalized recommender
Tasks 7–8:
- embeddings
- global/feed models
- training mode
- manual batches
- constrained exploration
- Stable Mode
- twice-daily scheduler

## Milestone 3 — Reading system
Tasks 6, 10, 11:
- OA source resolver
- PDF proxy
- PDF reader/highlights
- mixed paged notebook

## Milestone 4 — Reference workflow and hardening
Tasks 12–13:
- Zotero
- search
- diagnostics
- complete E2E coverage
- deployment docs

Do not begin Milestone 3 by inventing a full PDF editor. v1 needs read, source switching, highlight, page state, and notebook.

---

# Instructions to Luna

1. Treat this document as the product spec and implementation plan.
2. Do not silently change architecture or introduce paid services.
3. Before coding, inspect the current repository. If it is empty, scaffold according to the proposed structure. If files already exist, preserve sensible existing conventions.
4. Implement tasks in order unless a dependency forces a small reorder.
5. For every task:
   - write failing tests first,
   - run them and confirm failure,
   - implement the smallest correct unit,
   - run focused tests,
   - run relevant broader tests,
   - commit.
6. Never claim a milestone is complete without running its tests/builds.
7. Keep the recommender deterministic under a fixed seed.
8. Do not use an LLM to paper-summary/rank/classify in v1.
9. Do not add auth complexity beyond Google OAuth + RLS.
10. Do not add offline sync.
11. Do not store PDF binaries.
12. Do not add handwriting OCR.
13. If an external API lacks required metadata, degrade gracefully and keep the paper if enough identity/title metadata exists.
14. If a publisher blocks direct embedding, use the public-PDF proxy only for legitimately public URLs; otherwise show external access links.
15. Keep the frontend tablet-first enough that all primary controls are comfortably usable with a stylus.

At the end of each milestone, provide:
- tests executed and results,
- screenshots of the main flow,
- schema/API changes,
- any free-tier usage concerns,
- next milestone risks.
