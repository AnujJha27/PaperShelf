create or replace function public.classify_paper(
  p_paper_id uuid,
  p_action text,
  p_feed_id uuid,
  p_priority text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_status text := 'inbox';
  current_priority text;
  current_started timestamptz;
  current_completed timestamptz;
  current_rejected timestamptz;
  next_status text := 'inbox';
  next_priority text;
  next_started timestamptz;
  next_completed timestamptz;
  next_rejected timestamptz;
  event_label text;
  event_weight real := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select status, queue_priority, started_reading_at, completed_at, rejected_at
    into current_status, current_priority, current_started, current_completed, current_rejected
  from public.paper_state
  where user_id = auth.uid() and paper_id = p_paper_id
  for update;

  next_status := current_status;
  next_priority := current_priority;
  next_started := current_started;
  next_completed := current_completed;
  next_rejected := current_rejected;

  case p_action
    when 'relevant' then
      next_status := 'queue'; next_priority := 'relevant';
    when 'maybe' then
      next_status := 'queue'; next_priority := 'maybe';
    when 'not_relevant' then
      next_status := 'rejected'; next_priority := null;
    when 'start_reading' then
      if current_status in ('queue', 'inbox') then
        next_status := 'reading'; next_priority := null;
      end if;
    when 'mark_read' then
      if current_status = 'reading' then
        next_status := 'read'; next_priority := null;
      end if;
    when 'undo_rejection' then
      if current_status = 'rejected' then
        next_status := 'inbox'; next_priority := null;
      end if;
    when 'reclassify' then
      if p_priority not in ('relevant', 'maybe') then
        raise exception 'invalid reclassification priority' using errcode = '22023';
      end if;
      if current_status = 'rejected' then
        next_status := 'queue'; next_priority := p_priority;
      end if;
    else
      raise exception 'unsupported paper action' using errcode = '22023';
  end case;

  next_started := case when next_status in ('reading', 'read') then coalesce(current_started, now()) else null end;
  next_completed := case when next_status = 'read' then coalesce(current_completed, now()) else null end;
  next_rejected := case when next_status = 'rejected' then coalesce(current_rejected, now()) else null end;

  insert into public.paper_state (user_id, paper_id, status, queue_priority, started_reading_at, completed_at, rejected_at, updated_at)
  values (auth.uid(), p_paper_id, next_status, next_priority, next_started, next_completed, next_rejected, now())
  on conflict (user_id, paper_id) do update set
    status = excluded.status,
    queue_priority = excluded.queue_priority,
    started_reading_at = excluded.started_reading_at,
    completed_at = excluded.completed_at,
    rejected_at = excluded.rejected_at,
    updated_at = excluded.updated_at;

  event_label := case when p_action = 'reclassify' then p_priority when p_action = 'undo_rejection' then null else p_action end;
  event_weight := case p_action
    when 'relevant' then 1
    when 'maybe' then 0.35
    when 'not_relevant' then 1
    when 'start_reading' then 0.2
    when 'mark_read' then 0.4
    when 'reclassify' then case when p_priority = 'maybe' then 0.35 else 1 end
    else 0
  end;

  if event_weight > 0 or p_action = 'undo_rejection' then
    insert into public.feedback_events (user_id, paper_id, feed_id, event_type, label, weight)
    values (auth.uid(), p_paper_id, p_feed_id, case when p_action = 'reclassify' then p_priority else p_action end, event_label, event_weight);
  end if;

  return jsonb_build_object(
    'status', next_status,
    'queue_priority', next_priority,
    'started_reading_at', next_started,
    'completed_at', next_completed,
    'rejected_at', next_rejected
  );
end;
$$;

grant execute on function public.classify_paper(uuid, text, uuid, text) to authenticated;
