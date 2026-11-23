-- Deleting games. Any member of a room may delete any of its games. A deleted
-- game is kept but marked, and from then on it is gone as far as the app is
-- concerned: off the room's list, not found when opened, and closed to moves.

alter table postmarks.games
  add column deleted_at timestamptz,
  add column deleted_by smallint;

create function public.postmarks_delete(p_game uuid, p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  g postmarks.games;
  v_me smallint;
begin
  select * into g from postmarks.games where id = p_game and deleted_at is null for update;
  if not found then
    return; -- already gone
  end if;
  v_me := rooms.seat(g.room_id, p_token);
  if v_me is null then
    raise exception 'Join the room first.' using errcode = 'P0001';
  end if;
  update postmarks.games set deleted_at = now(), deleted_by = v_me, updated_at = now() where id = p_game;
  perform rooms.announce(g.room_id,
    (select name from rooms.members where room_id = g.room_id and seat = v_me) || ' deleted a '
      || case g.mode when 'trial' then 'time trial' when 'phrase' then 'pass phrase' else 'game of Postmarks' end);
end;
$$;

revoke execute on function public.postmarks_delete(uuid, text) from public;
grant execute on function public.postmarks_delete(uuid, text) to anon, authenticated;

-- No more moves in a deleted game, whether on its shared board or in a solo run.
create function postmarks.refuse_deleted() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'games' then
    if old.deleted_at is not null then
      raise exception 'This game was deleted.' using errcode = 'P0002';
    end if;
  elsif exists (select 1 from postmarks.games g where g.id = new.game_id and g.deleted_at is not null) then
    raise exception 'This game was deleted.' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

revoke execute on function postmarks.refuse_deleted() from public, anon, authenticated;

create trigger refuse_deleted before update on postmarks.games
  for each row execute function postmarks.refuse_deleted();
create trigger refuse_deleted before insert or update on postmarks.runs
  for each row execute function postmarks.refuse_deleted();

-- Opening a deleted game says it cannot be found.
create or replace function public.postmarks_get(p_game uuid, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  g postmarks.games;
  v_seat smallint;
begin
  select * into g from postmarks.games where id = p_game and deleted_at is null;
  if not found then
    raise exception 'Game not found.' using errcode = 'P0002';
  end if;
  v_seat := rooms.seat(g.room_id, p_token);
  if v_seat is null then
    return jsonb_build_object('id', g.id, 'room', g.room_id, 'you', null);
  end if;
  return postmarks.game_view(g, v_seat);
end;
$$;

-- The room's list leaves deleted games out, and chat notices about them lose their link.
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
           'game_kind', mm.game_kind,
           'game_id', (select g.id from postmarks.games g where g.id = mm.game_id and g.deleted_at is null)) as j
         from rooms.messages mm
         where mm.room_id = r.id and (p_after is null or mm.id > p_after)
         order by mm.id desc limit 200) x), '[]'::jsonb) end,
    'games', case when p_you is null then null else coalesce(
      (select jsonb_agg(x.j order by x.created_at desc) from (
         select g.created_at, jsonb_build_object(
           'id', g.id, 'kind', 'postmarks', 'mode', g.mode, 'size', g.size, 'status', g.status,
           'hearts', g.hearts, 'moves', g.moves,
           'found', (select count(*) from unnest(g.cells) c where c = 2),
           'last_player', (g.last->>'player')::integer, 'phrase_by', g.phrase_by,
           'finished', (select count(*) from postmarks.runs x where x.game_id = g.id and x.status <> 'playing'),
           'mine', (select x.status from postmarks.runs x where x.game_id = g.id and x.seat = p_you),
           'updated_at', g.updated_at) as j
         from postmarks.games g
         where g.room_id = r.id and g.deleted_at is null
         order by g.created_at desc limit 50) x), '[]'::jsonb) end
  )
  from rooms.rooms r where r.id = p_room;
$$;
