create or replace function public.add_paper_from_url(p_url text, p_title text default null)
returns public.papers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := btrim(p_url);
  v_host text;
  v_path text;
  v_title text;
  v_pdf_url text;
  v_paper public.papers;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if length(v_url) = 0 or length(v_url) > 2048 or v_url !~* '^https://[^/]+(/[^[:space:]]*)?$' then
    raise exception 'Paper link must be a valid HTTPS URL' using errcode = '22023';
  end if;

  v_host := lower(split_part(split_part(regexp_replace(v_url, '^https://', '', 'i'), '/', 1), '?', 1));
  if v_host = '' or position('@' in v_host) > 0 then
    raise exception 'Paper link must be a valid HTTPS URL' using errcode = '22023';
  end if;
  v_path := split_part(split_part(v_url, '?', 1), '#', 1);
  v_title := nullif(left(btrim(p_title), 240), '');
  if v_title is null then
    v_title := nullif(initcap(regexp_replace(split_part(v_path, '/', -1), '[-_]+', ' ', 'g')), '');
  end if;
  v_title := coalesce(v_title, 'Paper from ' || v_host);

  select * into v_paper from public.papers where canonical_url = v_url limit 1;
  if not found then
    insert into public.papers (title, canonical_url)
    values (v_title, v_url)
    returning * into v_paper;
  end if;

  insert into public.paper_state (user_id, paper_id, status, queue_priority)
  values (auth.uid(), v_paper.id, 'queue', 'maybe')
  on conflict (user_id, paper_id) do nothing;

  if v_host in ('arxiv.org', 'www.arxiv.org') and v_path ~ '^/abs/[^/]+$' then
    v_pdf_url := 'https://arxiv.org/pdf/' || substring(v_path from 6) || '.pdf';
  elsif v_path ~* '\.pdf$' then
    v_pdf_url := v_url;
  end if;
  if not exists (select 1 from public.paper_sources where paper_id = v_paper.id and landing_url = v_url) then
    insert into public.paper_sources (paper_id, source_type, host, landing_url, pdf_url, version_kind, is_open_access, is_preferred)
    values (
      v_paper.id,
      case when v_host in ('arxiv.org', 'www.arxiv.org') then 'repository' else 'manual' end,
      v_host,
      v_url,
      v_pdf_url,
      case when v_pdf_url is not null then 'repository' else 'unknown' end,
      v_pdf_url is not null,
      true
    );
  end if;
  return v_paper;
end;
$$;

grant execute on function public.add_paper_from_url(text, text) to authenticated;
