create table public.feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text not null check (length(trim(description)) > 0),
  include_keywords text[] not null default '{}',
  exclude_keywords text[] not null default '{}',
  priority_keywords text[] not null default '{}',
  min_semantic_similarity real not null default 0.35 check (min_semantic_similarity between 0 and 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.papers (
  id uuid primary key default gen_random_uuid(),
  openalex_id text unique,
  doi text unique,
  title text not null check (length(trim(title)) > 0),
  abstract text,
  authors jsonb not null default '[]'::jsonb,
  venue text,
  publication_date date,
  publication_year int,
  work_type text,
  citation_count int check (citation_count is null or citation_count >= 0),
  canonical_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.paper_identifiers (
  paper_id uuid not null references public.papers(id) on delete cascade,
  kind text not null,
  value text not null,
  primary key (paper_id, kind),
  unique (kind, value)
);

create table public.paper_sources (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers(id) on delete cascade,
  source_type text not null,
  host text not null,
  landing_url text,
  pdf_url text,
  version_kind text check (version_kind in ('published', 'accepted_manuscript', 'repository', 'preprint', 'unknown')),
  is_open_access boolean not null default false,
  is_preferred boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.paper_embeddings (
  paper_id uuid primary key references public.papers(id) on delete cascade,
  model_name text not null,
  embedding extensions.vector(384) not null,
  updated_at timestamptz not null default now()
);

create table public.feed_embeddings (
  feed_id uuid primary key references public.feeds(id) on delete cascade,
  model_name text not null,
  embedding extensions.vector(384) not null,
  updated_at timestamptz not null default now()
);

create table public.paper_feed_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  feed_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  best_score real,
  primary key (user_id, paper_id, feed_id),
  foreign key (feed_id, user_id) references public.feeds(id, user_id) on delete cascade
);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null unique,
  mode text not null check (mode in ('training', 'scheduled', 'manual', 'zotero_sync')),
  requested_feed_id uuid,
  status text not null check (status in ('queued', 'running', 'completed', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  foreign key (requested_feed_id, user_id) references public.feeds(id, user_id) on delete set null
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ingestion_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  feed_id uuid not null,
  final_score real not null,
  components jsonb not null default '{}'::jsonb,
  reason_text text not null,
  created_at timestamptz not null default now(),
  unique (run_id, paper_id, feed_id),
  foreign key (feed_id, user_id) references public.feeds(id, user_id) on delete cascade
);

create table public.paper_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  status text not null check (status in ('inbox', 'queue', 'reading', 'read', 'rejected')),
  queue_priority text check (queue_priority in ('relevant', 'maybe')),
  started_reading_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, paper_id),
  check (status = 'queue' or queue_priority is null),
  check (status <> 'read' or completed_at is not null)
);

create table public.feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  feed_id uuid,
  event_type text not null check (event_type in ('relevant', 'maybe', 'not_relevant', 'undo_rejection', 'start_reading', 'mark_read', 'add_to_zotero')),
  label text,
  weight real not null check (weight >= 0),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  foreign key (feed_id, user_id) references public.feeds(id, user_id) on delete set null
);

create table public.reader_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  source_id uuid references public.paper_sources(id) on delete set null,
  page_number int not null default 1 check (page_number >= 1),
  zoom real not null default 1 check (zoom > 0),
  scroll_offset real not null default 0 check (scroll_offset >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, paper_id)
);

create table public.pdf_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  source_id uuid references public.paper_sources(id) on delete set null,
  page_number int not null check (page_number >= 1),
  rects jsonb not null,
  selected_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notebook_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  page_index int not null check (page_index >= 0),
  objects jsonb not null default '[]'::jsonb,
  search_text text not null default '',
  version int not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  unique (user_id, paper_id, page_index)
);

create table public.recommender_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('global', 'feed')),
  feed_id uuid references public.feeds(id) on delete cascade,
  model_type text not null check (model_type = 'logistic_regression'),
  model_name text not null,
  coefficients jsonb not null,
  intercept real not null,
  metrics jsonb not null default '{}'::jsonb,
  label_counts jsonb not null default '{}'::jsonb,
  trained_at timestamptz not null default now(),
  check ((scope = 'global' and feed_id is null) or (scope = 'feed' and feed_id is not null)),
  foreign key (feed_id, user_id) references public.feeds(id, user_id) on delete cascade
);

create table public.zotero_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  zotero_key text not null,
  paper_id uuid references public.papers(id) on delete set null,
  doi text,
  title text not null,
  metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (user_id, zotero_key)
);

create table public.app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recommender_mode text not null default 'training' check (recommender_mode in ('training', 'stable')),
  schedule_enabled boolean not null default false,
  exploration_rate real not null default 0.10 check (exploration_rate between 0 and 1),
  training_batch_size int not null default 25 check (training_batch_size between 1 and 100),
  max_feed_recommendations int not null default 8 check (max_feed_recommendations between 1 and 100),
  max_today_recommendations int not null default 50 check (max_today_recommendations between 1 and 500),
  updated_at timestamptz not null default now()
);

create function public.create_default_app_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger auth_user_default_settings
after insert on auth.users
for each row execute function public.create_default_app_settings();

create index papers_doi_idx on public.papers (doi);
create index papers_openalex_id_idx on public.papers (openalex_id);
create index paper_sources_paper_id_idx on public.paper_sources (paper_id);
create index paper_feed_links_user_feed_idx on public.paper_feed_links (user_id, feed_id);
create index paper_state_user_status_idx on public.paper_state (user_id, status);
create index recommendations_user_created_idx on public.recommendations (user_id, created_at desc);
create index notebook_pages_search_text_idx on public.notebook_pages using gin (to_tsvector('simple', search_text));
create index paper_embeddings_embedding_idx on public.paper_embeddings using hnsw (embedding extensions.vector_cosine_ops);
create index feed_embeddings_embedding_idx on public.feed_embeddings using hnsw (embedding extensions.vector_cosine_ops);
create unique index recommender_models_global_idx on public.recommender_models (user_id) where scope = 'global';
create unique index recommender_models_feed_idx on public.recommender_models (user_id, feed_id) where scope = 'feed';

create trigger feeds_set_updated_at before update on public.feeds for each row execute function public.set_updated_at();
create trigger papers_set_updated_at before update on public.papers for each row execute function public.set_updated_at();
create trigger paper_sources_set_updated_at before update on public.paper_sources for each row execute function public.set_updated_at();
create trigger paper_embeddings_set_updated_at before update on public.paper_embeddings for each row execute function public.set_updated_at();
create trigger feed_embeddings_set_updated_at before update on public.feed_embeddings for each row execute function public.set_updated_at();
create trigger paper_state_set_updated_at before update on public.paper_state for each row execute function public.set_updated_at();
create trigger reader_state_set_updated_at before update on public.reader_state for each row execute function public.set_updated_at();
create trigger pdf_highlights_set_updated_at before update on public.pdf_highlights for each row execute function public.set_updated_at();
create trigger notebook_pages_set_updated_at before update on public.notebook_pages for each row execute function public.set_updated_at();
create trigger app_settings_set_updated_at before update on public.app_settings for each row execute function public.set_updated_at();
