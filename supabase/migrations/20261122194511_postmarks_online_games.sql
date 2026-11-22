-- Postmarks: cross-device games.
--
-- Game rows live in a schema the API does not expose. Browsers can only reach
-- them through the public.postmarks_* functions below, which check whose turn
-- it is and apply the rules (mirroring postmarks/game.js).
--
-- There are no accounts. Knowing a game's id lets you view or join it; each
-- device proves which player it is with a random token it generated itself,
-- of which only a hash is stored.

create schema if not exists postmarks;
revoke all on schema postmarks from public, anon, authenticated;

create table postmarks.games (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  size smallint not null check (size between 5 and 9),
  seats smallint not null check (seats between 2 and 4),
  regions smallint[] not null,
  solution smallint[] not null,
  cells smallint[] not null,            -- 0 empty, 1 cross, 2 letter, 3 wrong guess
  players jsonb not null default '[]',  -- [{ "name": text, "token_hash": text }] in seat order
  turn smallint not null default 0,     -- seat whose turn it is
  hearts smallint not null default 3,
  moves integer not null default 0,
  status text not null default 'playing' check (status in ('playing', 'won', 'lost')),
  last jsonb
);

alter table postmarks.games enable row level security;
revoke all on postmarks.games from public, anon, authenticated;

create function postmarks.token_hash(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- Seat index (0-based) of the player holding this token, or null.
create function postmarks.seat(p_players jsonb, p_token text) returns integer
language sql immutable set search_path = '' as $$
  select (t.ord - 1)::integer
  from jsonb_array_elements(p_players) with ordinality as t(p, ord)
  where p_token is not null and t.p->>'token_hash' = postmarks.token_hash(p_token)
  limit 1;
$$;

-- What a browser is allowed to see. The solution is withheld until the game ends.
create function postmarks.game_view(g postmarks.games, p_you integer) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', g.id,
    'size', g.size,
    'seats', g.seats,
    'regions', to_jsonb(g.regions),
    'cells', to_jsonb(g.cells),
    'players', coalesce(
      (select jsonb_agg(t.p->>'name' order by t.ord)
       from jsonb_array_elements(g.players) with ordinality as t(p, ord)),
      '[]'::jsonb),
    'turn', g.turn,
    'hearts', g.hearts,
    'moves', g.moves,
    'status', g.status,
    'last', g.last,
    'you', p_you,
    'solution', case when g.status in ('won', 'lost') then to_jsonb(g.solution) end
  );
$$;

create function postmarks.clean_name(p_name text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) < 1 or char_length(v_name) > 20 then
    raise exception 'Names must be 1 to 20 characters.' using errcode = '22023';
  end if;
  return v_name;
end;
$$;

create function postmarks.check_token(p_token text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_token is null or char_length(p_token) < 20 or char_length(p_token) > 100 then
    raise exception 'Invalid player token.' using errcode = '22023';
  end if;
end;
$$;

-- Start a game. The creator takes seat 0 and has the first turn.
create function public.postmarks_create(
  p_size integer, p_seats integer, p_regions integer[], p_solution integer[], p_name text, p_token text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := postmarks.clean_name(p_name);
  g postmarks.games;
begin
  perform postmarks.check_token(p_token);
  if p_size is null or p_size < 5 or p_size > 9 then
    raise exception 'Grid size must be 5 to 9.' using errcode = '22023';
  end if;
  if p_seats is null or p_seats < 2 or p_seats > 4 then
    raise exception 'A game needs 2 to 4 players.' using errcode = '22023';
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

  insert into postmarks.games (size, seats, regions, solution, cells, players)
  values (
    p_size, p_seats, p_regions::smallint[], p_solution::smallint[],
    array_fill(0::smallint, array[p_size * p_size]),
    jsonb_build_array(jsonb_build_object('name', v_name, 'token_hash', postmarks.token_hash(p_token)))
  )
  returning * into g;
  return postmarks.game_view(g, 0);
end;
$$;

-- Read a game. p_token is optional; without a seat you are a spectator.
create function public.postmarks_get(p_game uuid, p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  g postmarks.games;
begin
  select * into g from postmarks.games where id = p_game;
  if not found then
    raise exception 'Game not found.' using errcode = 'P0002';
  end if;
  return postmarks.game_view(g, postmarks.seat(g.players, p_token));
end;
$$;

-- Take the next free seat. Joining again with the same token is harmless.
create function public.postmarks_join(p_game uuid, p_name text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := postmarks.clean_name(p_name);
  v_seat integer;
  g postmarks.games;
begin
  perform postmarks.check_token(p_token);
  select * into g from postmarks.games where id = p_game for update;
  if not found then
    raise exception 'Game not found.' using errcode = 'P0002';
  end if;
  v_seat := postmarks.seat(g.players, p_token);
  if v_seat is not null then
    return postmarks.game_view(g, v_seat);
  end if;
  if jsonb_array_length(g.players) >= g.seats then
    raise exception 'This game is full.' using errcode = 'P0001';
  end if;

  update postmarks.games
  set players = players || jsonb_build_array(
        jsonb_build_object('name', v_name, 'token_hash', postmarks.token_hash(p_token))),
      updated_at = now()
  where id = p_game
  returning * into g;
  return postmarks.game_view(g, jsonb_array_length(g.players) - 1);
end;
$$;

-- Take a turn: 'mark' a cross, 'unmark' a cross, or 'guess' a letter.
create function public.postmarks_move(p_game uuid, p_token text, p_type text, p_cell integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g postmarks.games;
  v_me integer;
  v_current smallint;
  v_correct boolean;
  v_last jsonb;
begin
  select * into g from postmarks.games where id = p_game for update;
  if not found then
    raise exception 'Game not found.' using errcode = 'P0002';
  end if;
  v_me := postmarks.seat(g.players, p_token);
  if v_me is null then
    raise exception 'You are not a player in this game.' using errcode = 'P0001';
  end if;
  if g.status <> 'playing' then
    raise exception 'The game is over.' using errcode = 'P0001';
  end if;
  if v_me <> g.turn then
    raise exception 'It is not your turn.' using errcode = 'P0001';
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
      turn = (turn + 1) % seats,
      updated_at = now()
  where id = p_game
  returning * into g;
  return postmarks.game_view(g, v_me);
end;
$$;

revoke execute on all functions in schema postmarks from public, anon, authenticated;
revoke execute on function public.postmarks_create(integer, integer, integer[], integer[], text, text) from public;
revoke execute on function public.postmarks_get(uuid, text) from public;
revoke execute on function public.postmarks_join(uuid, text, text) from public;
revoke execute on function public.postmarks_move(uuid, text, text, integer) from public;
grant execute on function public.postmarks_create(integer, integer, integer[], integer[], text, text) to anon, authenticated;
grant execute on function public.postmarks_get(uuid, text) to anon, authenticated;
grant execute on function public.postmarks_join(uuid, text, text) to anon, authenticated;
grant execute on function public.postmarks_move(uuid, text, text, integer) to anon, authenticated;
