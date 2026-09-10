create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions;

select plan(24);

select has_table('public', 'feeds', 'feeds table exists');
select has_table('public', 'papers', 'papers table exists');
select has_table('public', 'paper_state', 'paper state table exists');
select has_table('public', 'notebook_pages', 'notebook pages table exists');
select has_table('public', 'app_settings', 'app settings table exists');
select policies_are('public', 'feeds', ARRAY['users manage own feeds'], 'feed ownership policy exists');
select policies_are('public', 'papers', ARRAY['authenticated read papers'], 'paper read policy exists');
select policies_are('public', 'paper_state', ARRAY['users manage own paper state'], 'paper state ownership policy exists');
select policies_are('public', 'notebook_pages', ARRAY['users manage own notebook pages'], 'notebook ownership policy exists');
select policies_are('public', 'app_settings', ARRAY['users manage own settings'], 'settings ownership policy exists');

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000001', 'a@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'b@example.test');
insert into public.papers (id, title)
values ('00000000-0000-0000-0000-000000000010', 'Shared paper');
insert into public.paper_sources (id, paper_id, source_type, host, pdf_url, is_open_access)
values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000010', 'repository', 'example.test', 'https://example.test/paper.pdf', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
insert into public.feeds (user_id, name, description)
values ('00000000-0000-0000-0000-000000000001', 'A feed', 'A description');
insert into public.paper_state (user_id, paper_id, status)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'inbox');
insert into public.notebook_pages (user_id, paper_id, page_index)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 0);
select is((select count(*) from public.feeds), 1::bigint, 'user A sees own feed');
select is((select count(*) from public.paper_state), 1::bigint, 'user A sees own paper state');
select is((select count(*) from public.notebook_pages), 1::bigint, 'user A sees own notebook page');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.feeds), 0::bigint, 'user B cannot read user A feed');
select is((select count(*) from public.paper_state), 0::bigint, 'user B cannot read user A paper state');
select is((select count(*) from public.notebook_pages), 0::bigint, 'user B cannot read user A notebook page');
select throws_ok(
  $$insert into public.feeds (user_id, name, description)
    values ('00000000-0000-0000-0000-000000000001', 'bad', 'bad')$$,
  '42501',
  'new row violates row-level security policy for table "feeds"',
  'user B cannot write user A feed'
);
select throws_ok(
  $$insert into public.app_settings (user_id)
    values ('00000000-0000-0000-0000-000000000001')$$,
  '42501',
  'new row violates row-level security policy for table "app_settings"',
  'user B cannot write user A settings'
);
select throws_ok(
  $$insert into public.papers (title)
    values ('browser must not create canonical paper')$$,
  '42501',
  'new row violates row-level security policy for table "papers"',
  'authenticated browser cannot insert canonical papers'
);
select throws_ok(
  $$insert into public.paper_sources (paper_id, source_type, host)
    values ('00000000-0000-0000-0000-000000000010', 'repository', 'example.test')$$,
  '42501',
  'new row violates row-level security policy for table "paper_sources"',
  'authenticated browser cannot insert paper sources'
);
select throws_ok(
  $$update public.papers set title = 'browser must not update canonical paper'
    where id = '00000000-0000-0000-0000-000000000010'$$,
  '42501',
  'new row violates row-level security policy for table "papers"',
  'authenticated browser cannot update canonical papers'
);
select throws_ok(
  $$update public.paper_sources set host = 'attacker.example'
    where id = '00000000-0000-0000-0000-000000000011'$$,
  '42501',
  'new row violates row-level security policy for table "paper_sources"',
  'authenticated browser cannot update paper sources'
);
select throws_ok(
  $$insert into public.paper_state (user_id, paper_id, status)
    values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'read')$$,
  '42501',
  'new row violates row-level security policy for table "paper_state"',
  'user B cannot write user A paper state'
);
select throws_ok(
  $$insert into public.notebook_pages (user_id, paper_id, page_index)
    values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 1)$$,
  '42501',
  'new row violates row-level security policy for table "notebook_pages"',
  'user B cannot write user A notebook page'
);

select * from finish();
rollback;
