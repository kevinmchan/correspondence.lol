-- A move code keeps working for the app that first handed it in, so rooms
-- joined in the browser later can be brought across with the same code (the
-- app's Home Screen icon carries it and hands it in on every start). To any
-- other device it is spent. Each use renews it for another 30 days.
-- Codes handed in before this change did not record who by: the next device
-- to hand one in becomes its owner.

alter table rooms.handoffs add column claimed_by text;

create or replace function public.handoff_claim(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_new text := rooms.token_hash(p_token);
  v_code text := translate(upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')), 'OIL', '011');
  h rooms.handoffs;
  v_result jsonb;
begin
  perform rooms.check_token(p_token);
  select * into h from rooms.handoffs
    where code_hash = rooms.token_hash(v_code) and expires_at > now()
      and (used_at is null or claimed_by = v_new
        or (claimed_by is null and used_at < timestamptz '2026-11-24 00:00:00+00'))
    for update;
  if not found then
    raise exception 'That code is not valid any more.' using errcode = 'P0001';
  end if;
  if h.token_hash <> v_new then
    update rooms.members m set token_hash = v_new
      where m.token_hash = h.token_hash
        and not exists (select 1 from rooms.members mine where mine.room_id = m.room_id and mine.token_hash = v_new);
  end if;
  update rooms.handoffs
    set used_at = coalesce(used_at, now()), claimed_by = v_new, expires_at = now() + interval '30 days'
    where code_hash = h.code_hash;
  select jsonb_build_object(
    'rooms', coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by m.seen_at desc nulls last), '[]'::jsonb),
    'name', (array_agg(m.name order by m.seen_at desc nulls last))[1],
    'avatar', (array_agg(m.avatar order by m.seen_at desc nulls last))[1],
    'color', (array_agg(m.color order by m.seen_at desc nulls last))[1])
    into v_result
    from rooms.members m join rooms.rooms r on r.id = m.room_id
    where m.token_hash = v_new and m.left_at is null;
  return v_result;
end;
$$;
