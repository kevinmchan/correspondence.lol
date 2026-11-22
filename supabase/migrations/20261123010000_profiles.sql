-- Profiles: each room member has an avatar (a short emoji) on one of eight
-- background colours, alongside their name. Members who have not chosen get a
-- default worked out from their seat. Views gain a `people` list of
-- { name, avatar, color }; the plain name lists stay for older pages.

alter table rooms.members
  add column avatar text check (char_length(avatar) between 1 and 8),
  add column color smallint check (color between 0 and 7);

create function rooms.people(p_room uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', m.name,
      'avatar', coalesce(m.avatar,
        (array['🦊','🐼','🐸','🦉','🐙','🦄','🐝','🐢','🦁','🐧','🐳','🦋'])[m.seat % 12 + 1]),
      'color', coalesce(m.color, m.seat % 8)
    ) order by m.seat), '[]'::jsonb)
  from rooms.members m where m.room_id = p_room;
$$;

revoke execute on function rooms.people(uuid) from public, anon, authenticated;

create or replace function rooms.room_view(p_room uuid, p_you smallint, p_after bigint) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'you', p_you,
    'members', coalesce(
      (select jsonb_agg(m.name order by m.seat) from rooms.members m where m.room_id = r.id), '[]'::jsonb),
    'people', rooms.people(r.id),
    'messages', case when p_you is null then null else coalesce(
      (select jsonb_agg(x.j order by x.id) from (
         select mm.id, jsonb_build_object(
           'id', mm.id, 'seat', mm.seat, 'body', mm.body, 'at', mm.created_at,
           'game_kind', mm.game_kind, 'game_id', mm.game_id) as j
         from rooms.messages mm
         where mm.room_id = r.id and (p_after is null or mm.id > p_after)
         order by mm.id desc limit 200) x), '[]'::jsonb) end,
    'games', case when p_you is null then null else coalesce(
      (select jsonb_agg(x.j order by x.created_at desc) from (
         select g.created_at, jsonb_build_object(
           'id', g.id, 'kind', 'postmarks', 'size', g.size, 'status', g.status, 'hearts', g.hearts,
           'moves', g.moves, 'found', (select count(*) from unnest(g.cells) c where c = 2),
           'last_player', (g.last->>'player')::integer, 'updated_at', g.updated_at) as j
         from postmarks.games g
         where g.room_id = r.id
         order by g.created_at desc limit 50) x), '[]'::jsonb) end
  )
  from rooms.rooms r where r.id = p_room;
$$;

create or replace function postmarks.game_view(g postmarks.games, p_you integer) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', g.id,
    'room', g.room_id,
    'room_name', (select r.name from rooms.rooms r where r.id = g.room_id),
    'size', g.size,
    'regions', to_jsonb(g.regions),
    'cells', to_jsonb(g.cells),
    'players', coalesce(
      (select jsonb_agg(m.name order by m.seat) from rooms.members m where m.room_id = g.room_id), '[]'::jsonb),
    'people', rooms.people(g.room_id),
    'hearts', g.hearts,
    'moves', g.moves,
    'status', g.status,
    'last', g.last,
    'you', p_you,
    'solution', case when g.status in ('won', 'lost') then to_jsonb(g.solution) end
  );
$$;

-- Set your name, avatar and colour in a room. Your seat, and so your past
-- messages and moves, stay attached to you.
create function public.room_profile(p_room uuid, p_token text, p_name text, p_avatar text, p_color integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := rooms.clean_text(p_name, 20, 'Names');
  v_avatar text := btrim(coalesce(p_avatar, ''));
  v_seat smallint := rooms.seat(p_room, p_token);
  v_old text;
begin
  if v_seat is null then
    raise exception 'Join the room first.' using errcode = 'P0001';
  end if;
  if char_length(v_avatar) < 1 or char_length(v_avatar) > 8 then
    raise exception 'Pick an avatar.' using errcode = '22023';
  end if;
  if p_color is null or p_color < 0 or p_color > 7 then
    raise exception 'Pick a colour.' using errcode = '22023';
  end if;
  select name into v_old from rooms.members where room_id = p_room and seat = v_seat for update;
  update rooms.members set name = v_name, avatar = v_avatar, color = p_color
  where room_id = p_room and seat = v_seat;
  if v_old is distinct from v_name then
    perform rooms.announce(p_room, v_old || ' is now ' || v_name);
  else
    -- no notice for an avatar change, but open pages should still refresh
    perform realtime.send('{}'::jsonb, 'changed', 'room:' || p_room::text, false);
  end if;
  return rooms.room_view(p_room, v_seat, null);
end;
$$;

revoke execute on function public.room_profile(uuid, text, text, text, integer) from public;
grant execute on function public.room_profile(uuid, text, text, text, integer) to anon, authenticated;
