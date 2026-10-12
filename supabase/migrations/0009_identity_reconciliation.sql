alter table public.ingestion_runs drop constraint ingestion_runs_status_check;
alter table public.ingestion_runs add constraint ingestion_runs_status_check
  check (status in ('queued', 'running', 'completed', 'completed_with_warnings', 'failed'));

alter table public.feeds add column paper_type text not null default 'technical'
  check (paper_type in ('technical', 'broad'));
update public.feeds set paper_type = 'technical'
where lower(coalesce(name, '')) in (
  'theorem proving & lean', 'automated reasoning & proof search', 'formal methods & verification',
  'ai for mathematics & proofs', 'type theory & programming languages', 'frontier ml & llms',
  'multimodal & agentic ml', 'generative models & representation learning',
  'mathematics, probability & statistics', 'multi-agent & federated learning',
  'machine learning for finance'
);

alter table public.paper_identifiers drop constraint paper_identifiers_pkey;
alter table public.paper_identifiers add primary key (paper_id, kind, value);

create or replace function public.normalize_paper_identifier(p_kind text, p_value text)
returns text language plpgsql immutable strict set search_path = public as $$
declare
  v_kind text := lower(btrim(p_kind));
  v_value text := lower(btrim(p_value));
begin
  if v_value = '' then return null; end if;
  if v_kind = 'doi' then
    v_value := regexp_replace(v_value, '^https?://(dx\.)?doi\.org/', '');
    v_value := regexp_replace(v_value, '^doi:\s*', '');
    return regexp_replace(v_value, '[.,;)]+$', '');
  elsif v_kind = 'openalex' then
    v_value := regexp_replace(v_value, '^https?://openalex\.org/', '');
    return upper(v_value);
  elsif v_kind = 'arxiv' then
    v_value := regexp_replace(v_value, '^https?://arxiv\.org/(abs|pdf)/', '');
    v_value := regexp_replace(v_value, '\.pdf$', '');
    return regexp_replace(v_value, 'v[0-9]+$', '');
  elsif v_kind = 'pmid' then
    v_value := regexp_replace(v_value, '^https?://pubmed\.ncbi\.nlm\.nih\.gov/', '');
    return regexp_replace(v_value, '/+$', '');
  elsif v_kind = 'pmcid' then
    v_value := regexp_replace(v_value, '^https?://(www\.)?ncbi\.nlm\.nih\.gov/pmc/articles/', '');
    return upper(regexp_replace(v_value, '/+$', ''));
  end if;
  return v_value;
end;
$$;

create or replace function public.paper_identity_aliases()
returns table (paper_id uuid, kind text, value text)
language sql stable set search_path = public as $$
  select i.paper_id, lower(i.kind), public.normalize_paper_identifier(i.kind, i.value)
  from public.paper_identifiers i
  union
  select p.id, 'doi', public.normalize_paper_identifier('doi', p.doi)
  from public.papers p where nullif(btrim(p.doi), '') is not null
  union
  select p.id, 'openalex', public.normalize_paper_identifier('openalex', p.openalex_id)
  from public.papers p where nullif(btrim(p.openalex_id), '') is not null
$$;

create or replace function public.connected_paper_ids(p_seed uuid[], p_identifiers jsonb default '{}'::jsonb)
returns uuid[] language sql stable set search_path = public as $$
  with recursive aliases as materialized (
    select a.paper_id, a.kind, a.value from public.paper_identity_aliases() a where a.value is not null
  ), incoming as (
    select lower(key) as kind, public.normalize_paper_identifier(key, value #>> '{}') as value
    from jsonb_each(coalesce(p_identifiers, '{}'::jsonb))
    where jsonb_typeof(value) in ('string', 'number')
  ), reached(paper_id) as (
    select p.id from public.papers p where p.id = any(coalesce(p_seed, '{}'::uuid[]))
    union
    select a.paper_id from aliases a join incoming i using (kind, value)
    union
    select next.paper_id
    from reached r
    join aliases current_alias on current_alias.paper_id = r.paper_id
    join aliases next on next.kind = current_alias.kind and next.value = current_alias.value
  )
  select coalesce(array_agg(distinct paper_id order by paper_id), '{}'::uuid[]) from reached
$$;

create or replace function public.paper_metadata_score(p public.papers)
returns integer language sql immutable set search_path = public as $$
  select least(length(btrim(coalesce(p.title, ''))), 200) / 20
       + least(length(coalesce(p.abstract, '')), 4000) / 250
       + least(case when jsonb_typeof(p.authors) = 'array' then jsonb_array_length(p.authors) else 0 end, 8)
       + (case when nullif(btrim(p.venue), '') is null then 0 else 2 end)
       + (p.publication_date is not null)::int
       + (p.publication_year is not null)::int
       + (nullif(btrim(p.canonical_url), '') is not null)::int
       + (nullif(btrim(p.doi), '') is not null)::int
       + (nullif(btrim(p.openalex_id), '') is not null)::int
       + (nullif(btrim(p.work_type), '') is not null)::int
$$;

create or replace function public.merge_papers(p_paper_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_keeper uuid;
  v_paper public.papers;
  v_title text;
  v_abstract text;
  v_authors jsonb;
  v_venue text;
  v_publication_date date;
  v_publication_year integer;
  v_work_type text;
  v_citation_count integer;
  v_canonical_url text;
  v_doi text;
  v_openalex text;
  v_key record;
begin
  v_ids := public.connected_paper_ids(p_paper_ids);
  if cardinality(v_ids) = 0 then raise exception 'No matching papers to merge' using errcode = '22023'; end if;
  for v_key in select distinct kind, value from public.paper_identity_aliases() where paper_id = any(v_ids) order by kind, value loop
    perform pg_advisory_xact_lock(hashtextextended(v_key.kind || ':' || v_key.value, 0));
  end loop;
  perform 1 from public.papers where id = any(v_ids) order by id for update;
  v_ids := public.connected_paper_ids(v_ids);
  select p.id into v_keeper from public.papers p where p.id = any(v_ids)
  order by public.paper_metadata_score(p) desc, p.updated_at desc, p.id limit 1;
  if v_keeper is null then raise exception 'No matching papers to merge' using errcode = '22023'; end if;

  select coalesce((array_agg(nullif(btrim(p.title), '') order by public.paper_metadata_score(p) desc, length(btrim(p.title)) desc, p.id))[1], 'Untitled paper') into v_title
  from public.papers p where p.id = any(v_ids);
  select (array_agg(p.abstract order by public.paper_metadata_score(p) desc, length(p.abstract) desc, p.id) filter (where nullif(btrim(p.abstract), '') is not null))[1] into v_abstract from public.papers p where p.id = any(v_ids);
  select (array_agg(p.authors order by public.paper_metadata_score(p) desc, case when jsonb_typeof(p.authors) = 'array' then jsonb_array_length(p.authors) else 0 end desc, p.id) filter (where jsonb_typeof(p.authors) = 'array' and jsonb_array_length(p.authors) > 0))[1] into v_authors from public.papers p where p.id = any(v_ids);
  select (array_agg(p.venue order by public.paper_metadata_score(p) desc, p.id) filter (where nullif(btrim(p.venue), '') is not null))[1] into v_venue from public.papers p where p.id = any(v_ids);
  select (array_agg(p.publication_date order by public.paper_metadata_score(p) desc, p.id) filter (where p.publication_date is not null))[1] into v_publication_date from public.papers p where p.id = any(v_ids);
  select (array_agg(p.publication_year order by public.paper_metadata_score(p) desc, p.id) filter (where p.publication_year is not null))[1] into v_publication_year from public.papers p where p.id = any(v_ids);
  select (array_agg(p.work_type order by public.paper_metadata_score(p) desc, p.id) filter (where nullif(btrim(p.work_type), '') is not null))[1] into v_work_type from public.papers p where p.id = any(v_ids);
  select max(p.citation_count) into v_citation_count from public.papers p where p.id = any(v_ids);
  select (array_agg(p.canonical_url order by public.paper_metadata_score(p) desc, p.id) filter (where nullif(btrim(p.canonical_url), '') is not null))[1] into v_canonical_url from public.papers p where p.id = any(v_ids);
  select (array_agg(public.normalize_paper_identifier('doi', p.doi) order by public.paper_metadata_score(p) desc, p.id) filter (where nullif(btrim(p.doi), '') is not null))[1] into v_doi from public.papers p where p.id = any(v_ids);
  select (array_agg(public.normalize_paper_identifier('openalex', p.openalex_id) order by public.paper_metadata_score(p) desc, p.id) filter (where nullif(btrim(p.openalex_id), '') is not null))[1] into v_openalex from public.papers p where p.id = any(v_ids);

  delete from public.paper_identifiers i using (
    select kind, value from public.paper_identifiers where paper_id = any(v_ids)
    group by kind, value having count(distinct paper_id) > 1
  ) collision where i.kind = collision.kind and i.value = collision.value and i.paper_id <> v_keeper;
  update public.paper_identifiers set paper_id = v_keeper where paper_id = any(v_ids) and paper_id <> v_keeper;
  insert into public.paper_identifiers (paper_id, kind, value)
  select v_keeper, a.kind, a.value from public.paper_identity_aliases() a
  where a.paper_id = any(v_ids) and not exists (
    select 1 from public.paper_identifiers i where i.kind = a.kind and i.value = a.value
  ) group by a.kind, a.value order by a.kind, a.value;

  insert into public.paper_embeddings (paper_id, model_name, embedding, updated_at)
  select v_keeper, model_name, embedding, updated_at from public.paper_embeddings where paper_id = any(v_ids)
  order by updated_at desc limit 1
  on conflict (paper_id) do update set model_name = excluded.model_name, embedding = excluded.embedding, updated_at = excluded.updated_at
  where excluded.updated_at > public.paper_embeddings.updated_at;
  delete from public.paper_embeddings where paper_id = any(v_ids) and paper_id <> v_keeper;

  insert into public.paper_feed_links (user_id, paper_id, feed_id, first_seen_at, last_seen_at, best_score)
  select user_id, v_keeper, feed_id, min(first_seen_at), max(last_seen_at), max(best_score)
  from public.paper_feed_links where paper_id = any(v_ids) group by user_id, feed_id
  on conflict (user_id, paper_id, feed_id) do update set
    first_seen_at = least(public.paper_feed_links.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.paper_feed_links.last_seen_at, excluded.last_seen_at),
    best_score = greatest(public.paper_feed_links.best_score, excluded.best_score);
  delete from public.paper_feed_links where paper_id = any(v_ids) and paper_id <> v_keeper;

  insert into public.recommendations (run_id, user_id, paper_id, feed_id, final_score, components, reason_text, created_at)
  select distinct on (run_id, feed_id) run_id, user_id, v_keeper, feed_id, final_score, components, reason_text, created_at
  from public.recommendations where paper_id = any(v_ids) order by run_id, feed_id, created_at desc, id desc
  on conflict (run_id, paper_id, feed_id) do update set
    final_score = greatest(public.recommendations.final_score, excluded.final_score),
    components = public.recommendations.components || excluded.components,
    reason_text = case when excluded.created_at >= public.recommendations.created_at then excluded.reason_text else public.recommendations.reason_text end,
    created_at = greatest(public.recommendations.created_at, excluded.created_at);
  delete from public.recommendations where paper_id = any(v_ids) and paper_id <> v_keeper;

  insert into public.paper_state (user_id, paper_id, status, queue_priority, started_reading_at, completed_at, rejected_at, updated_at)
  select user_id, v_keeper,
    (array_agg(status order by case status when 'read' then 5 when 'reading' then 4 when 'rejected' then 3 when 'queue' then 2 else 1 end desc, updated_at desc))[1],
    case when bool_or(status = 'read') or bool_or(status = 'reading') or bool_or(status = 'rejected') then null
         when bool_or(status = 'queue' and queue_priority = 'relevant') then 'relevant'
         when bool_or(status = 'queue' and queue_priority = 'maybe') then 'maybe' else null end,
    max(started_reading_at), max(completed_at), max(rejected_at), max(updated_at)
  from public.paper_state where paper_id = any(v_ids) group by user_id
  on conflict (user_id, paper_id) do update set
    status = excluded.status, queue_priority = excluded.queue_priority,
    started_reading_at = greatest(public.paper_state.started_reading_at, excluded.started_reading_at),
    completed_at = greatest(public.paper_state.completed_at, excluded.completed_at),
    rejected_at = greatest(public.paper_state.rejected_at, excluded.rejected_at),
    updated_at = greatest(public.paper_state.updated_at, excluded.updated_at);
  delete from public.paper_state where paper_id = any(v_ids) and paper_id <> v_keeper;

  insert into public.reader_state (user_id, paper_id, source_id, page_number, zoom, scroll_offset, updated_at)
  select distinct on (user_id) user_id, v_keeper, source_id, page_number, zoom, scroll_offset, updated_at
  from public.reader_state where paper_id = any(v_ids) order by user_id, updated_at desc
  on conflict (user_id, paper_id) do update set source_id = excluded.source_id, page_number = excluded.page_number,
    zoom = excluded.zoom, scroll_offset = excluded.scroll_offset, updated_at = excluded.updated_at
  where excluded.updated_at > public.reader_state.updated_at;
  delete from public.reader_state where paper_id = any(v_ids) and paper_id <> v_keeper;

  insert into public.notebook_pages (user_id, paper_id, page_index, objects, search_text, version, updated_at)
  select n.user_id, v_keeper, n.page_index,
    coalesce((select jsonb_agg(item.object order by page.updated_at, item.ordinality) from public.notebook_pages page
      cross join lateral jsonb_array_elements(page.objects) with ordinality item(object, ordinality)
      where page.user_id = n.user_id and page.page_index = n.page_index and page.paper_id = any(v_ids)), '[]'::jsonb),
    coalesce((select string_agg(distinct page.search_text, E'\n' order by page.search_text) from public.notebook_pages page
      where page.user_id = n.user_id and page.page_index = n.page_index and page.paper_id = any(v_ids)), ''),
    max(n.version), max(n.updated_at)
  from public.notebook_pages n where n.paper_id = any(v_ids) group by n.user_id, n.page_index
  on conflict (user_id, paper_id, page_index) do update set
    objects = excluded.objects,
    search_text = excluded.search_text,
    version = greatest(public.notebook_pages.version, excluded.version), updated_at = greatest(public.notebook_pages.updated_at, excluded.updated_at);
  delete from public.notebook_pages where paper_id = any(v_ids) and paper_id <> v_keeper;

  update public.paper_sources set paper_id = v_keeper where paper_id = any(v_ids) and paper_id <> v_keeper;
  update public.feedback_events set paper_id = v_keeper where paper_id = any(v_ids) and paper_id <> v_keeper;
  update public.pdf_highlights set paper_id = v_keeper where paper_id = any(v_ids) and paper_id <> v_keeper;
  update public.zotero_items set paper_id = v_keeper where paper_id = any(v_ids) and paper_id <> v_keeper;

  update public.papers set doi = null, openalex_id = null where id = any(v_ids) and id <> v_keeper;
  update public.papers set title = v_title, abstract = v_abstract, authors = coalesce(v_authors, '[]'::jsonb),
    venue = v_venue, publication_date = v_publication_date, publication_year = v_publication_year,
    work_type = v_work_type, citation_count = v_citation_count, canonical_url = v_canonical_url,
    doi = v_doi, openalex_id = v_openalex where id = v_keeper returning * into v_paper;
  delete from public.papers where id = any(v_ids) and id <> v_keeper;
  return v_keeper;
end;
$$;

create or replace function public.resolve_paper_candidate(p_identifiers jsonb, p_candidate jsonb)
returns table(id uuid) language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_paper_id uuid;
  v_identifier record;
  v_key record;
begin
  if jsonb_typeof(coalesce(p_identifiers, '{}'::jsonb)) <> 'object' then
    raise exception 'Identifiers must be an object' using errcode = '22023';
  end if;
  if nullif(btrim(p_candidate->>'title'), '') is null then
    raise exception 'Paper title is required' using errcode = '22023';
  end if;
  v_ids := public.connected_paper_ids('{}'::uuid[], p_identifiers);
  for v_key in
    select distinct keys.kind, keys.value from (
      select lower(key) as kind, public.normalize_paper_identifier(key, value #>> '{}') as value
      from jsonb_each(coalesce(p_identifiers, '{}'::jsonb)) where jsonb_typeof(value) = 'string'
      union
      select kind, value from public.paper_identity_aliases() where paper_id = any(v_ids)
    ) keys where keys.value is not null order by keys.kind, keys.value
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_key.kind || ':' || v_key.value, 0));
  end loop;
  v_ids := public.connected_paper_ids(v_ids, p_identifiers);
  if cardinality(v_ids) = 0 then
    insert into public.papers (doi, openalex_id, title, abstract, authors, venue, publication_date, publication_year, work_type, citation_count, canonical_url)
    values (
      public.normalize_paper_identifier('doi', p_candidate->>'doi'),
      public.normalize_paper_identifier('openalex', p_candidate->>'openalex_id'),
      btrim(p_candidate->>'title'), nullif(p_candidate->>'abstract', ''), coalesce(p_candidate->'authors', '[]'::jsonb),
      nullif(p_candidate->>'venue', ''), nullif(p_candidate->>'publication_date', '')::date,
      nullif(p_candidate->>'publication_year', '')::integer, nullif(p_candidate->>'work_type', ''),
      nullif(p_candidate->>'citation_count', '')::integer, nullif(p_candidate->>'canonical_url', '')
    ) returning papers.id into v_paper_id;
  else
    v_paper_id := public.merge_papers(v_ids);
    update public.papers p set
      title = case when length(btrim(coalesce(p_candidate->>'title', ''))) > length(p.title) then btrim(p_candidate->>'title') else p.title end,
      abstract = case when length(coalesce(p_candidate->>'abstract', '')) > length(coalesce(p.abstract, '')) then nullif(p_candidate->>'abstract', '') else p.abstract end,
      authors = case when jsonb_typeof(p_candidate->'authors') = 'array' and jsonb_array_length(p_candidate->'authors') > case when jsonb_typeof(p.authors) = 'array' then jsonb_array_length(p.authors) else 0 end then p_candidate->'authors' else p.authors end,
      venue = coalesce(p.venue, nullif(p_candidate->>'venue', '')),
      publication_date = coalesce(p.publication_date, nullif(p_candidate->>'publication_date', '')::date),
      publication_year = coalesce(p.publication_year, nullif(p_candidate->>'publication_year', '')::integer),
      work_type = coalesce(p.work_type, nullif(p_candidate->>'work_type', '')),
      citation_count = greatest(p.citation_count, nullif(p_candidate->>'citation_count', '')::integer),
      canonical_url = coalesce(p.canonical_url, nullif(p_candidate->>'canonical_url', '')),
      doi = coalesce(p.doi, public.normalize_paper_identifier('doi', p_candidate->>'doi')),
      openalex_id = coalesce(p.openalex_id, public.normalize_paper_identifier('openalex', p_candidate->>'openalex_id'))
    where p.id = v_paper_id;
  end if;
  for v_identifier in
    select lower(key) as kind, public.normalize_paper_identifier(key, value #>> '{}') as value
    from jsonb_each(coalesce(p_identifiers, '{}'::jsonb)) where jsonb_typeof(value) = 'string'
    order by lower(key), public.normalize_paper_identifier(key, value #>> '{}')
  loop
    if v_identifier.value is not null and not exists (
      select 1 from public.paper_identifiers where kind = v_identifier.kind and value = v_identifier.value
    ) then
      insert into public.paper_identifiers (paper_id, kind, value) values (v_paper_id, v_identifier.kind, v_identifier.value);
    end if;
  end loop;
  return query select v_paper_id;
end;
$$;

create or replace function public.scan_paper_identity_conflicts()
returns table (paper_ids uuid[], identifiers jsonb)
language sql stable security definer set search_path = public as $$
  with aliases as (
    select distinct paper_id, kind, value from public.paper_identity_aliases() where value is not null
  ), conflicts as (
    select kind, value, array_agg(distinct paper_id order by paper_id) as ids
    from aliases group by kind, value having count(distinct paper_id) > 1
  )
  select ids, jsonb_build_object(kind, value) from conflicts order by kind, value
$$;

revoke all on function public.merge_papers(uuid[]) from public, anon, authenticated;
revoke all on function public.resolve_paper_candidate(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.scan_paper_identity_conflicts() from public, anon, authenticated;
grant execute on function public.merge_papers(uuid[]) to service_role;
grant execute on function public.resolve_paper_candidate(jsonb, jsonb) to service_role;
grant execute on function public.scan_paper_identity_conflicts() to service_role;
