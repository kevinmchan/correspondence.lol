-- Rooms: the place players gather. A room has members, a chat, and games.
--
-- As before there are no accounts and no table is exposed to the API. Knowing
-- a room's id lets you see its name and member names and join it; chat and
-- games are for members only. Each device proves who it is with a random token
-- it generated itself, of which only a hash is stored.
--
-- Postmarks games now belong to a room and are open to all of its members
-- (anyone may move except whoever moved last), replacing per-game seats.

create schema if not exists rooms;
revoke all on schema rooms from public, anon, authenticated;

create table rooms.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table rooms.members (
  room_id uuid not null references rooms.rooms on delete cascade,
  seat smallint not null,               -- 0-based, in joining order; never reused
  name text not null,
  token_hash text not null,
  joined_at timestamptz not null default now(),
  primary key (room_id, seat),
  unique (room_id, token_hash)
);

create table rooms.messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references rooms.rooms on delete cascade,
  seat smallint,                        -- who said it; null for announcements
  body text not null check (char_length(body) between 1 and 500),
  game_kind text,                       -- announcements about a game point at it
  game_id uuid,
  created_at timestamptz not null default now()
);

create index messages_room_idx on rooms.messages (room_id, id);

alter table rooms.rooms enable row level security;
alter table rooms.members enable row level security;
alter table rooms.messages enable row level security;
revoke all on all tables in schema rooms from public, anon, authenticated;

-- Postmarks games move into rooms. (No games existed when this was written.)
alter table postmarks.games
  drop column players,
  drop column seats,
  add column room_id uuid not null references rooms.rooms on delete cascade;

create index games_room_idx on postmarks.games (room_id, created_at desc);

drop function public.postmarks_create(integer, integer, integer[], integer[], text, text);
drop function public.postmarks_join(uuid, text, text);
drop function postmarks.seat(jsonb, text);
drop function postmarks.token_hash(text);
drop function postmarks.clean_name(text);
drop function postmarks.check_token(text);

create function rooms.token_hash(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

create function rooms.check_token(p_token text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_token is null or char_length(p_token) < 20 or char_length(p_token) > 100 then
    raise exception 'Invalid player token.' using errcode = '22023';
  end if;
end;
$$;

-- Trim a piece of user text and insist on 1 to p_max characters.
create function rooms.clean_text(p_text text, p_max integer, p_what text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
begin
  if char_length(v_text) < 1 or char_length(v_text) > p_max then
    raise exception '% must be 1 to % characters.', p_what, p_max using errcode = '22023';
  end if;
  return v_text;
end;
$$;

-- Seat of the member holding this token, or null.
create function rooms.seat(p_room uuid, p_token text) returns smallint
language sql stable set search_path = '' as $$
  select m.seat from rooms.members m
  where p_token is not null and m.room_id = p_room and m.token_hash = rooms.token_hash(p_token);
$$;

create function rooms.announce(p_room uuid, p_body text, p_game_kind text default null, p_game_id uuid default null)
returns void
language sql set search_path = '' as $$
  insert into rooms.messages (room_id, body, game_kind, game_id) values (p_room, p_body, p_game_kind, p_game_id);
$$;

-- What a browser may see of a room. Non-members get the name and member names
-- only. p_after limits messages to those newer than a message id.
create function rooms.room_view(p_room uuid, p_you smallint, p_after bigint) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'you', p_you,
    'members', coalesce(
      (select jsonb_agg(m.name order by m.seat) from rooms.members m where m.room_id = r.id), '[]'::jsonb),
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

-- ---------------------------------------------------------------------------
-- Public API: rooms
-- ---------------------------------------------------------------------------

create function public.room_create(p_room_name text, p_name text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room_name text := rooms.clean_text(p_room_name, 40, 'Room names');
  v_name text := rooms.clean_text(p_name, 20, 'Names');
  v_room uuid;
begin
  perform rooms.check_token(p_token);
  insert into rooms.rooms (name) values (v_room_name) returning id into v_room;
  insert into rooms.members (room_id, seat, name, token_hash)
  values (v_room, 0, v_name, rooms.token_hash(p_token));
  perform rooms.announce(v_room, v_name || ' opened the room');
  return rooms.room_view(v_room, 0::smallint, null);
end;
$$;

create function public.room_get(p_room uuid, p_token text default null, p_after bigint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_view jsonb := rooms.room_view(p_room, rooms.seat(p_room, p_token), p_after);
begin
  if v_view is null then
    raise exception 'Room not found.' using errcode = 'P0002';
  end if;
  return v_view;
end;
$$;

-- Join a room. Joining again from the same device is harmless.
create function public.room_join(p_room uuid, p_name text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := rooms.clean_text(p_name, 20, 'Names');
  v_seat smallint;
  v_count integer;
begin
  perform rooms.check_token(p_token);
  perform 1 from rooms.rooms where id = p_room for update;
  if not found then
    raise exception 'Room not found.' using errcode = 'P0002';
  end if;
  v_seat := rooms.seat(p_room, p_token);
  if v_seat is null then
    select count(*) into v_count from rooms.members where room_id = p_room;
    if v_count >= 12 then
      raise exception 'This room is full.' using errcode = 'P0001';
    end if;
    v_seat := v_count;
    insert into rooms.members (room_id, seat, name, token_hash)
    values (p_room, v_seat, v_name, rooms.token_hash(p_token));
    perform rooms.announce(p_room, v_name || ' joined the room');
  end if;
  return rooms.room_view(p_room, v_seat, null);
end;
$$;

-- Say something in the room's chat. Returns the stored message.
create function public.room_say(p_room uuid, p_token text, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_body text := rooms.clean_text(p_body, 500, 'Messages');
  v_seat smallint := rooms.seat(p_room, p_token);
  m rooms.messages;
begin
  if v_seat is null then
    raise exception 'Join the room to chat.' using errcode = 'P0001';
  end if;
  insert into rooms.messages (room_id, seat, body) values (p_room, v_seat, v_body) returning * into m;
  return jsonb_build_object('id', m.id, 'seat', m.seat, 'body', m.body, 'at', m.created_at,
                            'game_kind', null, 'game_id', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Public API: Postmarks games inside a room
-- ---------------------------------------------------------------------------

-- What a member may see of a game. The solution is withheld until it ends.
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
    'hearts', g.hearts,
    'moves', g.moves,
    'status', g.status,
    'last', g.last,
    'you', p_you,
    'solution', case when g.status in ('won', 'lost') then to_jsonb(g.solution) end
  );
$$;

-- Start a game in a room. Any member may; every member may then play.
create function public.postmarks_create(
  p_room uuid, p_token text, p_size integer, p_regions integer[], p_solution integer[]
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_seat smallint := rooms.seat(p_room, p_token);
  g postmarks.games;
begin
  if v_seat is null then
    raise exception 'Join the room to start a game.' using errcode = 'P0001';
  end if;
  if p_size is null or p_size < 5 or p_size > 9 then
    raise exception 'Grid size must be 5 to 9.' using errcode = '22023';
  end if;
  if coalesce(array_length(p_regions, 1), 0) <> p_size * p_size
     or coalesce(array_length(p_solution, 1), 0) <> p_size
     or exists (select 1 from unnest(p_regions) r where r is null or r < 0 or r >= p_size)
     or exists (select 1 from unnest(p_solution) s where s is null or s < 0 or s >= p_size)
     or (select count(distinct s) from unnest(p_solution) s) <> p_size
     or (select count(distinct p_regions[(t.ord - 1) * p_size + t.col + 1])
         from unnest(p_solution) with ordinality as t(col, ord)) <> p_size then
    raise exception 'That is not a valid puzzle.' using errcode = '22023';
  end if;

  insert into postmarks.games (room_id, size, regions, solution, cells)
  values (p_room, p_size, p_regions::smallint[], p_solution::smallint[],
          array_fill(0::smallint, array[p_size * p_size]))
  returning * into g;
  perform rooms.announce(
    p_room,
    (select m.name from rooms.members m where m.room_id = p_room and m.seat = v_seat)
      || ' started a ' || p_size || ' × ' || p_size || ' game of Postmarks',
    'postmarks', g.id);
  return postmarks.game_view(g, v_seat);
end;
$$;

-- Read a game. Non-members learn only which room to join.
create or replace function public.postmarks_get(p_game uuid, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  g postmarks.games;
  v_seat smallint;
begin
  select * into g from postmarks.games where id = p_game;
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

-- Take a turn: 'mark' a cross, 'unmark' a cross, or 'guess' a letter.
-- Any member of the room may move except whoever moved last.
create or replace function public.postmarks_move(p_game uuid, p_token text, p_type text, p_cell integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g postmarks.games;
  v_me smallint;
  v_current smallint;
  v_correct boolean;
  v_last jsonb;
begin
  select * into g from postmarks.games where id = p_game for update;
  if not found then
    raise exception 'Game not found.' using errcode = 'P0002';
  end if;
  v_me := rooms.seat(g.room_id, p_token);
  if v_me is null then
    raise exception 'Join the room to play.' using errcode = 'P0001';
  end if;
  if g.status <> 'playing' then
    raise exception 'The game is over.' using errcode = 'P0001';
  end if;
  if (g.last->>'player')::integer = v_me then
    raise exception 'You made the last move, so someone else goes next.' using errcode = 'P0001';
  end if;
  if p_cell is null or p_cell < 0 or p_cell >= g.size * g.size then
    raise exception 'That square is not on the board.' using errcode = '22023';
  end if;

  v_current := g.cells[p_cell + 1];
  v_last := jsonb_build_object('player', v_me, 'type', p_type, 'cell', p_cell);

  if p_type = 'mark' then
    if v_current <> 0 then
      raise exception 'That square is already marked.' using errcode = 'P0001';
    end if;
    g.cells[p_cell + 1] := 1;
  elsif p_type = 'unmark' then
    if v_current <> 1 then
      raise exception 'There is no cross to remove there.' using errcode = 'P0001';
    end if;
    g.cells[p_cell + 1] := 0;
  elsif p_type = 'guess' then
    if v_current in (2, 3) then
      raise exception 'That square is already settled.' using errcode = 'P0001';
    end if;
    v_correct := g.solution[p_cell / g.size + 1] = p_cell % g.size;
    v_last := v_last || jsonb_build_object('correct', v_correct);
    if v_correct then
      g.cells[p_cell + 1] := 2;
      if (select count(*) from unnest(g.cells) c where c = 2) = g.size then
        g.status := 'won';
      end if;
    else
      g.cells[p_cell + 1] := 3;
      g.hearts := g.hearts - 1;
      if g.hearts = 0 then
        g.status := 'lost';
      end if;
    end if;
  else
    raise exception 'Unknown move.' using errcode = '22023';
  end if;

  update postmarks.games
  set cells = g.cells,
      hearts = g.hearts,
      status = g.status,
      last = v_last,
      moves = moves + 1,
      updated_at = now()
  where id = p_game
  returning * into g;

  if g.status = 'won' then
    perform rooms.announce(g.room_id,
      'Postmarks solved in ' || g.moves || ' turns with ' || g.hearts || ' of 3 hearts left', 'postmarks', g.id);
  elsif g.status = 'lost' then
    perform rooms.announce(g.room_id, 'A game of Postmarks ran out of hearts', 'postmarks', g.id);
  end if;
  return postmarks.game_view(g, v_me);
end;
$$;

revoke execute on all functions in schema rooms from public, anon, authenticated;
revoke execute on all functions in schema postmarks from public, anon, authenticated;
revoke execute on function public.room_create(text, text, text) from public;
revoke execute on function public.room_get(uuid, text, bigint) from public;
revoke execute on function public.room_join(uuid, text, text) from public;
revoke execute on function public.room_say(uuid, text, text) from public;
revoke execute on function public.postmarks_create(uuid, text, integer, integer[], integer[]) from public;
revoke execute on function public.postmarks_get(uuid, text) from public;
revoke execute on function public.postmarks_move(uuid, text, text, integer) from public;
grant execute on function public.room_create(text, text, text) to anon, authenticated;
grant execute on function public.room_get(uuid, text, bigint) to anon, authenticated;
grant execute on function public.room_join(uuid, text, text) to anon, authenticated;
grant execute on function public.room_say(uuid, text, text) to anon, authenticated;
grant execute on function public.postmarks_create(uuid, text, integer, integer[], integer[]) to anon, authenticated;
grant execute on function public.postmarks_get(uuid, text) to anon, authenticated;
grant execute on function public.postmarks_move(uuid, text, text, integer) to anon, authenticated;
