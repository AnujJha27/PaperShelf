create index recommendations_current_idx
  on public.recommendations (user_id, paper_id, created_at desc);

create index paper_state_current_idx
  on public.paper_state (user_id, paper_id, status);

create or replace function public.list_current_recommendations(
  p_feed_id uuid default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  run_id uuid,
  user_id uuid,
  paper_id uuid,
  feed_id uuid,
  final_score real,
  components jsonb,
  reason_text text,
  created_at timestamptz,
  paper jsonb,
  feed jsonb,
  feed_labels text[]
)
language sql
stable
security invoker
set search_path = public
as $$
with eligible as (
  select
    r.*,
    p.title,
    p.abstract,
    p.authors,
    p.venue,
    p.publication_year,
    p.canonical_url,
    f.name as feed_name
  from public.recommendations r
  join public.papers p on p.id = r.paper_id
  join public.feeds f on f.id = r.feed_id
  where r.user_id = (select auth.uid())
    and (p_feed_id is null or r.feed_id = p_feed_id)
    and not exists (
      select 1
      from public.paper_state s
      where s.user_id = r.user_id
        and s.paper_id = r.paper_id
        and s.status <> 'inbox'
    )
), best as (
  select distinct on (paper_id) *
  from eligible
  order by paper_id, final_score desc, created_at desc
)
select
  b.id,
  b.run_id,
  b.user_id,
  b.paper_id,
  b.feed_id,
  b.final_score,
  b.components,
  b.reason_text,
  b.created_at,
  jsonb_build_object(
    'id', b.paper_id,
    'title', b.title,
    'abstract', b.abstract,
    'authors', b.authors,
    'venue', b.venue,
    'publication_year', b.publication_year,
    'canonical_url', b.canonical_url
  ),
  jsonb_build_object('id', b.feed_id, 'name', b.feed_name),
  (
    select array_agg(distinct all_rows.feed_name order by all_rows.feed_name)
    from eligible all_rows
    where all_rows.paper_id = b.paper_id
  )
from best b
order by b.final_score desc, b.created_at desc
limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

grant execute on function public.list_current_recommendations(uuid, integer) to authenticated;
