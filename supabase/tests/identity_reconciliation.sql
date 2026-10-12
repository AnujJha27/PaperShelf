create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions;
select plan(18);

select has_function('public', 'resolve_paper_candidate', ARRAY['jsonb', 'jsonb'], 'candidate identity is resolved in one database transaction');
select has_function('public', 'merge_papers', ARRAY['uuid[]'], 'paper merge is transactional');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000101', 'identity@example.test');
insert into public.feeds (id, user_id, name, description)
values ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000101', 'Identity test', 'formal verification');
select is((select paper_type from public.feeds where id = '00000000-0000-0000-0000-000000000102'), 'technical', 'new feeds default to technical research');
insert into public.papers (id, doi, title, authors, publication_year)
values ('00000000-0000-0000-0000-000000000103', '10.5555/identity-a', 'Short paper', '[]', 2023);
insert into public.papers (id, openalex_id, title, abstract, authors, venue, publication_year, work_type, citation_count)
values ('00000000-0000-0000-0000-000000000104', 'W900001', 'A detailed technical paper about verified reasoning', 'A complete abstract describing formal methods and proof search.', '[{"name":"Ada Author"}]', 'Journal of Testing', 2024, 'article', 20);
insert into public.paper_identifiers (paper_id, kind, value) values
  ('00000000-0000-0000-0000-000000000103', 'doi', '10.5555/identity-a'),
  ('00000000-0000-0000-0000-000000000104', 'openalex', 'W900001');
insert into public.paper_sources (paper_id, source_type, host, pdf_url, is_open_access) values
  ('00000000-0000-0000-0000-000000000103', 'repository', 'one.test', 'https://one.test/paper.pdf', true),
  ('00000000-0000-0000-0000-000000000104', 'repository', 'two.test', 'https://two.test/paper.pdf', true);
insert into public.paper_embeddings (paper_id, model_name, embedding) values
  ('00000000-0000-0000-0000-000000000103', 'test', array_fill(0.1::real, ARRAY[384])::extensions.vector),
  ('00000000-0000-0000-0000-000000000104', 'test', array_fill(0.2::real, ARRAY[384])::extensions.vector);
insert into public.ingestion_runs (id, user_id, request_id, mode, status)
values ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000106', 'manual', 'completed');
insert into public.paper_feed_links (user_id, paper_id, feed_id, first_seen_at, last_seen_at, best_score) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000102', '2024-01-01', '2024-02-01', 0.3),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000102', '2024-01-02', '2024-03-01', 0.8);
insert into public.recommendations (run_id, user_id, paper_id, feed_id, final_score, reason_text) values
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000102', 0.3, 'first'),
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000102', 0.8, 'second');
insert into public.paper_state (user_id, paper_id, status, queue_priority, completed_at) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103', 'queue', 'maybe', null),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000104', 'read', null, now());
insert into public.feedback_events (user_id, paper_id, event_type, label, weight) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103', 'relevant', 'relevant', 1),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000104', 'not_relevant', 'not_relevant', 1);
insert into public.reader_state (user_id, paper_id, page_number, updated_at) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103', 2, '2024-01-01'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000104', 9, '2025-01-01');
insert into public.pdf_highlights (user_id, paper_id, page_number, rects, selected_text) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103', 1, '[]', 'one'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000104', 2, '[]', 'two');
insert into public.notebook_pages (user_id, paper_id, page_index, objects, search_text) values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000103', 0, '[{"type":"text","text":"one"}]', 'one'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000104', 0, '[{"type":"text","text":"two"}]', 'two');
insert into public.zotero_items (user_id, zotero_key, paper_id, title)
values ('00000000-0000-0000-0000-000000000101', 'ZOTERO1', '00000000-0000-0000-0000-000000000104', 'Zotero link');

set local role service_role;
select is(
  (select id from public.resolve_paper_candidate(
    '{"doi":"https://doi.org/10.5555/IDENTITY-A","openalex":"https://openalex.org/w900001"}'::jsonb,
    '{"title":"A detailed technical paper about verified reasoning","abstract":"A complete abstract describing formal methods and proof search."}'::jsonb
  )),
  '00000000-0000-0000-0000-000000000104'::uuid,
  'identifiers resolving to different papers select the richer canonical row'
);
select is((select count(*) from public.papers where id in ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000104')), 1::bigint, 'duplicate canonical paper is removed');
select is((select count(*) from public.paper_identifiers where paper_id = '00000000-0000-0000-0000-000000000104' and kind in ('doi', 'openalex')), 2::bigint, 'all durable identifiers move to canonical paper');
select is((select count(*) from public.paper_sources where paper_id = '00000000-0000-0000-0000-000000000104'), 2::bigint, 'sources are retained');
select is((select count(*) from public.paper_embeddings where paper_id = '00000000-0000-0000-0000-000000000104'), 1::bigint, 'embedding uniqueness is reconciled');
select is((select count(*) from public.paper_feed_links where paper_id = '00000000-0000-0000-0000-000000000104'), 1::bigint, 'feed links merge across uniqueness collision');
select is((select count(*) from public.recommendations where paper_id = '00000000-0000-0000-0000-000000000104'), 1::bigint, 'recommendations merge across uniqueness collision');
select is((select status from public.paper_state where paper_id = '00000000-0000-0000-0000-000000000104'), 'read', 'strongest user paper state survives');
select is((select count(*) from public.feedback_events where paper_id = '00000000-0000-0000-0000-000000000104'), 2::bigint, 'feedback events are retained');
select is((select page_number from public.reader_state where paper_id = '00000000-0000-0000-0000-000000000104'), 9, 'latest reader position survives');
select is((select count(*) from public.pdf_highlights where paper_id = '00000000-0000-0000-0000-000000000104'), 2::bigint, 'highlights are retained');
select is((select jsonb_array_length(objects) from public.notebook_pages where paper_id = '00000000-0000-0000-0000-000000000104'), 2, 'notebook blocks merge without loss');
select is((select paper_id from public.zotero_items where zotero_key = 'ZOTERO1'), '00000000-0000-0000-0000-000000000104'::uuid, 'Zotero item remains linked');
select is(
  (select id from public.resolve_paper_candidate(
    '{"doi":"10.5555/identity-a","openalex":"W900001"}'::jsonb,
    '{"title":"A detailed technical paper about verified reasoning"}'::jsonb
  )),
  '00000000-0000-0000-0000-000000000104'::uuid,
  'retrying an identity upsert is idempotent'
);
select is((select count(*) from public.scan_paper_identity_conflicts()), 0::bigint, 'maintenance scan reports no remaining split identities');

select * from finish();
rollback;
