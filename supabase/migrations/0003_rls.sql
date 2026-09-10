alter table public.feeds enable row level security;
alter table public.papers enable row level security;
alter table public.paper_identifiers enable row level security;
alter table public.paper_sources enable row level security;
alter table public.paper_embeddings enable row level security;
alter table public.feed_embeddings enable row level security;
alter table public.paper_feed_links enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.recommendations enable row level security;
alter table public.paper_state enable row level security;
alter table public.feedback_events enable row level security;
alter table public.reader_state enable row level security;
alter table public.pdf_highlights enable row level security;
alter table public.notebook_pages enable row level security;
alter table public.recommender_models enable row level security;
alter table public.zotero_items enable row level security;
alter table public.app_settings enable row level security;

create policy "users manage own feeds" on public.feeds
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "authenticated read papers" on public.papers
  for select to authenticated using (true);
create policy "authenticated read paper identifiers" on public.paper_identifiers
  for select to authenticated using (true);
create policy "authenticated read paper sources" on public.paper_sources
  for select to authenticated using (true);

create policy "users read own paper feed links" on public.paper_feed_links
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own paper feed links" on public.paper_feed_links
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own paper feed links" on public.paper_feed_links
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own paper feed links" on public.paper_feed_links
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "users manage own ingestion runs" on public.ingestion_runs
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users read own recommendations" on public.recommendations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "users manage own paper state" on public.paper_state
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own feedback" on public.feedback_events
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own reader state" on public.reader_state
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own highlights" on public.pdf_highlights
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own notebook pages" on public.notebook_pages
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own recommender models" on public.recommender_models
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own zotero items" on public.zotero_items
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own settings" on public.app_settings
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
