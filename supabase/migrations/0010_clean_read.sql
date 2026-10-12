create table public.paper_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete restrict,
  paper_source_id uuid not null references public.paper_sources(id) on delete restrict,
  generation integer not null default 1 check (generation > 0),
  source_url text not null check (length(source_url) <= 2048),
  source_updated_at timestamptz not null,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  parser_version text not null,
  pipeline_version text not null,
  page_count integer not null check (page_count > 0),
  title text,
  authors jsonb not null default '[]'::jsonb,
  outline jsonb not null default '[]'::jsonb,
  validation_metadata jsonb not null default '{}'::jsonb,
  status text not null check (status in ('ready', 'ready_with_fallbacks')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, paper_source_id, source_url, source_hash, pipeline_version, generation)
);

create index paper_documents_owner_source_idx
  on public.paper_documents (user_id, paper_source_id, pipeline_version, created_at desc);
create index paper_documents_hash_idx on public.paper_documents (source_hash, pipeline_version);

create table public.clean_read_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete restrict,
  paper_source_id uuid not null references public.paper_sources(id) on delete restrict,
  pipeline_version text not null,
  reprocess boolean not null default false,
  status text not null default 'queued' check (status in ('queued', 'fetching', 'parsing', 'processing_assets', 'validating', 'ready', 'ready_with_fallbacks', 'failed')),
  progress jsonb not null default '{}'::jsonb,
  document_id uuid,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (document_id, user_id) references public.paper_documents(id, user_id) on delete set null (document_id)
);

create index clean_read_jobs_owner_source_idx on public.clean_read_jobs (user_id, paper_source_id, created_at desc);
create index clean_read_jobs_active_idx on public.clean_read_jobs (user_id, paper_source_id, pipeline_version)
  where status in ('queued', 'fetching', 'parsing', 'processing_assets', 'validating');

create function public.clean_read_job_transition()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = old.status then return new; end if;
  if not (
    (old.status = 'queued' and new.status in ('fetching', 'failed')) or
    (old.status = 'fetching' and new.status in ('parsing', 'failed')) or
    (old.status = 'parsing' and new.status in ('processing_assets', 'validating', 'ready', 'ready_with_fallbacks', 'failed')) or
    (old.status = 'processing_assets' and new.status in ('validating', 'failed')) or
    (old.status = 'validating' and new.status in ('ready', 'ready_with_fallbacks', 'failed'))
  ) then
    raise exception 'Illegal Clean Read job transition: % -> %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger clean_read_job_transition before update of status on public.clean_read_jobs
for each row execute function public.clean_read_job_transition();
create trigger clean_read_jobs_set_updated_at before update on public.clean_read_jobs
for each row execute function public.set_updated_at();
create trigger paper_documents_set_updated_at before update on public.paper_documents
for each row execute function public.set_updated_at();

create table public.paper_document_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null,
  block_key text not null,
  reading_order integer not null check (reading_order >= 0),
  block_type text not null check (block_type in ('heading', 'paragraph', 'list', 'equation', 'figure', 'table', 'code', 'footnote', 'reference', 'other')),
  section_path jsonb not null default '[]'::jsonb,
  page_number integer not null check (page_number > 0),
  page_end integer check (page_end is null or page_end >= page_number),
  bbox jsonb,
  text text,
  source_text text,
  structured_data jsonb,
  confidence real check (confidence is null or confidence between 0 and 1),
  validation_flags jsonb not null default '[]'::jsonb,
  render_mode text not null check (render_mode in ('structured', 'original')),
  asset_id uuid,
  unique (document_id, block_key),
  unique (id, user_id),
  foreign key (document_id, user_id) references public.paper_documents(id, user_id) on delete cascade
);
create index paper_document_blocks_reading_idx on public.paper_document_blocks (document_id, reading_order);

create table public.paper_document_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null,
  block_id uuid,
  asset_type text not null check (asset_type in ('figure', 'table_crop', 'equation_crop', 'block_crop', 'page_crop')),
  storage_path text not null check (storage_path like user_id::text || '/' || document_id::text || '/%'),
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  page_number integer not null check (page_number > 0),
  bbox jsonb not null,
  caption text,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  pixel_width integer not null check (pixel_width > 0),
  pixel_height integer not null check (pixel_height > 0),
  created_at timestamptz not null default now(),
  foreign key (document_id, user_id) references public.paper_documents(id, user_id) on delete cascade,
  foreign key (block_id, user_id) references public.paper_document_blocks(id, user_id) on delete set null (block_id),
  unique (document_id, checksum)
);

create table public.paper_document_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null,
  block_id uuid,
  reference_key text not null,
  title text,
  authors jsonb not null default '[]'::jsonb,
  year integer,
  venue text,
  doi text,
  arxiv_id text,
  canonical_url text,
  raw_text text not null,
  page_number integer not null check (page_number > 0),
  bbox jsonb,
  unique (document_id, reference_key),
  foreign key (document_id, user_id) references public.paper_documents(id, user_id) on delete cascade,
  foreign key (block_id, user_id) references public.paper_document_blocks(id, user_id) on delete set null (block_id)
);
create index paper_document_references_search_idx on public.paper_document_references using gin (to_tsvector('simple', coalesce(title, '') || ' ' || raw_text));

alter table public.paper_document_blocks add constraint paper_document_blocks_asset_fk
  foreign key (asset_id) references public.paper_document_assets(id) on delete set null;

alter table public.pdf_highlights add column document_id uuid;
alter table public.pdf_highlights add column block_id uuid;
alter table public.pdf_highlights add column source_hash text;
alter table public.pdf_highlights add column start_offset integer;
alter table public.pdf_highlights add column end_offset integer;
alter table public.pdf_highlights add column text_fingerprint text;
alter table public.pdf_highlights add column source_context text;
alter table public.pdf_highlights add constraint pdf_highlights_document_owner_fk
  foreign key (document_id, user_id) references public.paper_documents(id, user_id) on delete set null (document_id);
alter table public.pdf_highlights add constraint pdf_highlights_block_fk
  foreign key (block_id, user_id) references public.paper_document_blocks(id, user_id) on delete set null (block_id);

-- The current merger moves sources before deleting duplicate papers. Rehome Clean Read
-- rows from those source identities inside that same transaction.
create function public.rehome_clean_read_before_paper_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.paper_documents d set paper_id = s.paper_id
    from public.paper_sources s
    where d.paper_id = old.id and d.paper_source_id = s.id and s.paper_id <> old.id;
  update public.clean_read_jobs j set paper_id = s.paper_id
    from public.paper_sources s
    where j.paper_id = old.id and j.paper_source_id = s.id and s.paper_id <> old.id;
  update public.notebook_pages n set objects = (
    select coalesce(jsonb_agg(case
      when item.object #>> '{paperAnchor,paperId}' = old.id::text and s.paper_id is not null
        then jsonb_set(item.object, '{paperAnchor,paperId}', to_jsonb(s.paper_id::text), true)
      else item.object end order by item.ordinality), '[]'::jsonb)
    from jsonb_array_elements(n.objects) with ordinality item(object, ordinality)
    left join lateral (select paper_id from public.paper_sources where id::text = item.object #>> '{paperAnchor,sourceId}' limit 1) s on true
  ) where exists (
    select 1 from jsonb_array_elements(n.objects) item(object)
    where item.object #>> '{paperAnchor,paperId}' = old.id::text
  );
  return old;
end;
$$;
create trigger papers_rehome_clean_read before delete on public.papers
for each row execute function public.rehome_clean_read_before_paper_delete();

alter table public.paper_documents enable row level security;
alter table public.clean_read_jobs enable row level security;
alter table public.paper_document_blocks enable row level security;
alter table public.paper_document_assets enable row level security;
alter table public.paper_document_references enable row level security;

create policy "users read own Clean Read documents" on public.paper_documents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users read own Clean Read jobs" on public.clean_read_jobs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users read own Clean Read blocks" on public.paper_document_blocks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users read own Clean Read assets" on public.paper_document_assets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users read own Clean Read references" on public.paper_document_references
  for select to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clean-read-assets', 'clean-read-assets', false, 20971520, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "users read own Clean Read source assets" on storage.objects
  for select to authenticated using (
    bucket_id = 'clean-read-assets' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create function public.request_clean_read(p_paper_id uuid, p_paper_source_id uuid, p_pipeline_version text, p_reprocess boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_source public.paper_sources;
  v_document public.paper_documents;
  v_job public.clean_read_jobs;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_pipeline_version is null or p_pipeline_version !~ '^[a-zA-Z0-9._-]{1,80}$' then
    raise exception 'Invalid extraction pipeline version' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_paper_source_id::text || ':' || p_pipeline_version, 0));
  select * into v_source from public.paper_sources
    where id = p_paper_source_id and paper_id = p_paper_id and is_open_access and pdf_url is not null for share;
  if not found or v_source.pdf_url !~* '^https://[^/@[:space:]]+(/|$)' or lower(split_part(split_part(v_source.pdf_url, '://', 2), '/', 1)) in ('localhost', '127.0.0.1', '::1') then
    raise exception 'Public open-access HTTPS PDF source required' using errcode = '42501';
  end if;
  if not p_reprocess then
    select * into v_document from public.paper_documents d
      where d.user_id = v_user_id and d.paper_source_id = p_paper_source_id
        and d.source_url = v_source.pdf_url and d.source_updated_at = v_source.updated_at
        and d.pipeline_version = p_pipeline_version
      order by d.created_at desc limit 1;
    if found then return jsonb_build_object('status', v_document.status, 'document_id', v_document.id, 'job_id', null, 'created', false); end if;
  end if;
  select * into v_job from public.clean_read_jobs j
    where j.user_id = v_user_id and j.paper_source_id = p_paper_source_id and j.pipeline_version = p_pipeline_version
      and j.reprocess = p_reprocess
      and j.status in ('queued', 'fetching', 'parsing', 'processing_assets', 'validating')
    order by j.created_at desc limit 1;
  if found then
    if v_job.updated_at >= now() - interval '30 minutes' then
      return jsonb_build_object('status', v_job.status, 'job_id', v_job.id, 'document_id', v_job.document_id, 'created', false);
    end if;
    update public.clean_read_jobs set status = 'failed', error = 'Extraction worker timed out', progress = progress || jsonb_build_object('stage', 'failed') where id = v_job.id;
  end if;
  insert into public.clean_read_jobs (user_id, paper_id, paper_source_id, pipeline_version, reprocess)
    values (v_user_id, p_paper_id, p_paper_source_id, p_pipeline_version, p_reprocess) returning * into v_job;
  return jsonb_build_object('status', v_job.status, 'job_id', v_job.id, 'document_id', null, 'created', true);
end;
$$;

create function public.commit_clean_read_document(p_job_id uuid, p_document jsonb, p_blocks jsonb, p_assets jsonb, p_references jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_job public.clean_read_jobs;
  v_document_id uuid;
  v_document_status text;
  v_generation integer;
  v_block jsonb;
  v_asset jsonb;
  v_reference jsonb;
  v_block_id uuid;
  v_asset_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  select * into v_job from public.clean_read_jobs where id = p_job_id for update;
  if not found then raise exception 'Unknown Clean Read job' using errcode = 'P0002'; end if;
  if v_job.status in ('ready', 'ready_with_fallbacks') then
    return jsonb_build_object('document_id', v_job.document_id, 'status', v_job.status, 'reused', true);
  end if;
  if v_job.status = 'failed' then raise exception 'Cannot complete a failed Clean Read job' using errcode = '23514'; end if;
  if jsonb_typeof(p_document) <> 'object' or jsonb_typeof(p_blocks) <> 'array' or jsonb_typeof(p_assets) <> 'array' or jsonb_typeof(p_references) <> 'array' then
    raise exception 'Invalid Clean Read package' using errcode = '22023';
  end if;
  if not v_job.reprocess then
    select id, status into v_document_id, v_document_status from public.paper_documents
      where user_id = v_job.user_id and paper_id = v_job.paper_id and paper_source_id = v_job.paper_source_id
        and source_url = p_document->>'source_url' and source_hash = p_document->>'source_hash' and pipeline_version = v_job.pipeline_version
      order by generation desc limit 1;
  end if;
  if v_document_id is null then
    if v_job.reprocess then
      perform pg_advisory_xact_lock(hashtextextended(v_job.user_id::text || ':' || v_job.paper_source_id::text || ':' || (p_document->>'source_hash') || ':' || v_job.pipeline_version, 0));
      select coalesce(max(generation), 0) + 1 into v_generation from public.paper_documents
        where user_id = v_job.user_id and paper_source_id = v_job.paper_source_id
          and source_url = p_document->>'source_url' and source_hash = p_document->>'source_hash' and pipeline_version = v_job.pipeline_version;
    else
      v_generation := 1;
    end if;
    v_document_id := coalesce(nullif(p_document->>'id', '')::uuid, gen_random_uuid());
    v_document_status := p_document->>'status';
    insert into public.paper_documents (id, user_id, paper_id, paper_source_id, generation, source_url, source_updated_at, source_hash,
      parser_version, pipeline_version, page_count, title, authors, outline, validation_metadata, status)
    values (v_document_id, v_job.user_id, v_job.paper_id, v_job.paper_source_id, v_generation, p_document->>'source_url',
      (p_document->>'source_updated_at')::timestamptz, p_document->>'source_hash', p_document->>'parser_version',
      v_job.pipeline_version, (p_document->>'page_count')::integer, p_document->>'title', coalesce(p_document->'authors', '[]'::jsonb),
      coalesce(p_document->'outline', '[]'::jsonb), coalesce(p_document->'validation_metadata', '{}'::jsonb), v_document_status)
    on conflict (user_id, paper_source_id, source_url, source_hash, pipeline_version, generation) do nothing;
    if not found then
      select id, status into v_document_id, v_document_status from public.paper_documents
        where user_id = v_job.user_id and paper_source_id = v_job.paper_source_id
          and source_url = p_document->>'source_url' and source_hash = p_document->>'source_hash'
          and pipeline_version = v_job.pipeline_version and generation = v_generation;
    else
      for v_block in select value from jsonb_array_elements(p_blocks) loop
        v_block_id := coalesce(nullif(v_block->>'id', '')::uuid, gen_random_uuid());
        insert into public.paper_document_blocks (id, user_id, document_id, block_key, reading_order, block_type, section_path,
          page_number, page_end, bbox, text, source_text, structured_data, confidence, validation_flags, render_mode)
        values (v_block_id, v_job.user_id, v_document_id, v_block->>'block_key', (v_block->>'reading_order')::integer,
          v_block->>'block_type', coalesce(v_block->'section_path', '[]'::jsonb), (v_block->>'page_number')::integer,
          nullif(v_block->>'page_end', '')::integer, v_block->'bbox', v_block->>'text', v_block->>'source_text',
          v_block->'structured_data', nullif(v_block->>'confidence', '')::real, coalesce(v_block->'validation_flags', '[]'::jsonb),
          v_block->>'render_mode');
      end loop;
      for v_asset in select value from jsonb_array_elements(p_assets) loop
        select id into v_block_id from public.paper_document_blocks
          where document_id = v_document_id and block_key = nullif(v_asset->>'block_key', '');
        v_asset_id := null;
        insert into public.paper_document_assets (id, user_id, document_id, block_id, asset_type, storage_path, checksum,
          page_number, bbox, caption, mime_type, pixel_width, pixel_height)
        values (coalesce(nullif(v_asset->>'id', '')::uuid, gen_random_uuid()), v_job.user_id, v_document_id, v_block_id, v_asset->>'asset_type', v_asset->>'storage_path',
          v_asset->>'checksum', (v_asset->>'page_number')::integer, v_asset->'bbox', v_asset->>'caption', v_asset->>'mime_type',
          (v_asset->>'pixel_width')::integer, (v_asset->>'pixel_height')::integer)
        on conflict (document_id, checksum) do nothing returning id into v_asset_id;
        if v_asset_id is null then
          select id into v_asset_id from public.paper_document_assets where document_id = v_document_id and checksum = v_asset->>'checksum';
        end if;
        update public.paper_document_blocks set asset_id = coalesce(asset_id, v_asset_id)
          where document_id = v_document_id and block_key = nullif(v_asset->>'block_key', '');
      end loop;
      for v_reference in select value from jsonb_array_elements(p_references) loop
        select id into v_block_id from public.paper_document_blocks
          where document_id = v_document_id and block_key = nullif(v_reference->>'block_key', '');
        insert into public.paper_document_references (user_id, document_id, block_id, reference_key, title, authors, year,
          venue, doi, arxiv_id, canonical_url, raw_text, page_number, bbox)
        values (v_job.user_id, v_document_id, v_block_id, v_reference->>'reference_key', v_reference->>'title',
          coalesce(v_reference->'authors', '[]'::jsonb), nullif(v_reference->>'year', '')::integer,
          v_reference->>'venue', v_reference->>'doi', v_reference->>'arxiv_id', v_reference->>'canonical_url',
          v_reference->>'raw_text', (v_reference->>'page_number')::integer, v_reference->'bbox');
      end loop;
    end if;
  end if;
  update public.paper_documents set source_updated_at = (p_document->>'source_updated_at')::timestamptz
    where id = v_document_id and p_document ? 'source_updated_at';
  update public.clean_read_jobs set document_id = v_document_id, status = v_document_status,
    progress = progress || jsonb_build_object('stage', 'ready') where id = v_job.id;
  return jsonb_build_object('document_id', v_document_id, 'status', v_document_status, 'reused', false);
end;
$$;

create function public.fail_clean_read_dispatch(p_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.clean_read_jobs set status = 'failed', error = 'Could not start extraction workflow'
    where id = p_job_id and user_id = auth.uid() and status = 'queued';
end;
$$;
revoke all on function public.request_clean_read(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.request_clean_read(uuid, uuid, text, boolean) to authenticated;
revoke all on function public.commit_clean_read_document(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_clean_read_document(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;
revoke all on function public.fail_clean_read_dispatch(uuid) from public, anon;
grant execute on function public.fail_clean_read_dispatch(uuid) to authenticated;

revoke all on function public.rehome_clean_read_before_paper_delete() from public, anon, authenticated;

