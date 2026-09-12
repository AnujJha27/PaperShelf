alter table public.paper_embeddings
  add column embedding_dimension int not null default 384
  check (embedding_dimension > 0);

alter table public.feed_embeddings
  add column embedding_dimension int not null default 384
  check (embedding_dimension > 0);

alter table public.recommender_models
  add column feature_schema text,
  add column feature_schema_version int,
  add column feature_width int,
  add column embedding_model text,
  add column embedding_dimension int;
