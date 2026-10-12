create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions;
select plan(25);

select has_table('public', 'paper_documents', 'Clean Read documents exist');
select has_table('public', 'paper_document_blocks', 'Clean Read blocks exist');
select has_table('public', 'paper_document_assets', 'Clean Read assets exist');
select has_table('public', 'paper_document_references', 'Clean Read references exist');
select has_table('public', 'clean_read_jobs', 'Clean Read jobs exist');
select policies_are('public', 'paper_documents', ARRAY['users read own Clean Read documents'], 'documents are owner scoped');
select policies_are('public', 'clean_read_jobs', ARRAY['users read own Clean Read jobs'], 'jobs are owner scoped');
select ok(has_function_privilege('authenticated', 'public.request_clean_read(uuid,uuid,text,boolean)', 'execute'), 'authenticated users can request extraction');
select ok(not has_function_privilege('authenticated', 'public.commit_clean_read_document(uuid,jsonb,jsonb,jsonb,jsonb)', 'execute'), 'users cannot commit worker output');

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'clean-a@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'clean-b@example.test');
insert into public.papers (id, title) values ('10000000-0000-4000-8000-000000000010', 'Clean Read paper');
insert into public.paper_sources (id, paper_id, source_type, host, pdf_url, is_open_access)
values ('10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000010', 'repository', 'arxiv.org', 'https://arxiv.org/pdf/1234.5678.pdf', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is(public.request_clean_read('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000011', 'docling-pymupdf-v1')->>'status', 'queued', 'first Clean Read click creates a queued job');
select is((select count(*) from public.clean_read_jobs where user_id = '10000000-0000-4000-8000-000000000001'), 1::bigint, 'one active job exists');
select is((public.request_clean_read('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000011', 'docling-pymupdf-v1')->>'created'), 'false', 'repeated click reuses the active job');
select is((public.request_clean_read('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000011', 'docling-pymupdf-v1', true)->>'created'), 'true', 'reprocess starts separately while a normal job is active');
select is((select count(*) from public.clean_read_jobs where user_id = '10000000-0000-4000-8000-000000000001' and reprocess), 1::bigint, 'reprocess intent is persisted');
select is((public.request_clean_read('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000011', 'docling-pymupdf-v1', true)->>'created'), 'false', 'repeated reprocess click reuses its active job');
select is((select count(*) from public.clean_read_jobs where user_id = '10000000-0000-4000-8000-000000000001'), 2::bigint, 'normal and reprocess jobs remain separate');
update public.clean_read_jobs set status = 'ready' where user_id = '10000000-0000-4000-8000-000000000001' and not reprocess;
select is((select status from public.clean_read_jobs where user_id = '10000000-0000-4000-8000-000000000001' and not reprocess), 'queued', 'browser cannot mutate worker job status');

set local role service_role;
insert into public.paper_documents (id, user_id, paper_id, paper_source_id, source_url, source_updated_at, source_hash,
  parser_version, pipeline_version, page_count, status)
values ('10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000011', 'https://arxiv.org/pdf/1234.5678.pdf', now(), repeat('a', 64), 'test-parser',
  'docling-pymupdf-v1', 1, 'ready');
update public.clean_read_jobs set status = 'fetching' where user_id = '10000000-0000-4000-8000-000000000001' and not reprocess;
update public.clean_read_jobs set status = 'parsing' where user_id = '10000000-0000-4000-8000-000000000001' and not reprocess;
update public.clean_read_jobs set status = 'validating' where user_id = '10000000-0000-4000-8000-000000000001' and not reprocess;
update public.clean_read_jobs set status = 'ready', document_id = '10000000-0000-4000-8000-000000000020' where user_id = '10000000-0000-4000-8000-000000000001' and not reprocess;
insert into public.paper_document_blocks (id, user_id, document_id, block_key, reading_order, block_type, page_number, text, render_mode)
values ('10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000020', 'b1', 0, 'paragraph', 1, 'A source paragraph.', 'structured');
insert into storage.objects (bucket_id, name)
values ('clean-read-assets', '10000000-0000-4000-8000-000000000001/10000000-0000-4000-8000-000000000020/crop.webp');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.paper_documents), 1::bigint, 'owner can read own document');
select is((select count(*) from public.paper_document_blocks), 1::bigint, 'owner can read own blocks');
select is((select count(*) from storage.objects where bucket_id = 'clean-read-assets'), 1::bigint, 'owner can access own private source asset');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.paper_documents), 0::bigint, 'another user cannot read document');
select is((select count(*) from public.clean_read_jobs), 0::bigint, 'another user cannot read job');
select is((select count(*) from storage.objects where bucket_id = 'clean-read-assets'), 0::bigint, 'another user cannot access private source asset');
set local role anon;
select is((select count(*) from public.paper_documents), 0::bigint, 'anonymous user cannot read document');
select is((select count(*) from storage.objects where bucket_id = 'clean-read-assets'), 0::bigint, 'anonymous user cannot access private source asset');

select * from finish();
rollback;
