-- Postmarks game modes.
--
--   coop    everyone in the room works on one board, taking turns (as before)
--   trial   time trial: everyone solves the same board separately against the
--           clock; each player's board is a row in postmarks.runs
--   phrase  pass phrase: a co-op board where each letter found reveals part of
--           a hidden phrase, which can also be guessed outright
--
-- Also: turn-taking now only applies when more than one person can play, so a
-- lone player (or the only solver of a phrase someone else wrote) is not stuck.

alter table postmarks.games
  add column mode text not null default 'coop' check (mode in ('coop', 'trial', 'phrase')),
  add column phrase text,              -- phrase mode: the answer
  add column phrase_by smallint,       -- seat of the member who wrote it; null if it was picked at random
  add column phrase_order smallint[];  -- positions of its letters, in the order they are revealed

create table postmarks.runs (
  game_id uuid not null references postmarks.games on delete cascade,
  seat smallint not null,
  cells smallint[] not null,
  hearts smallint not null default 3,
  moves integer not null default 0,
  status text not null default 'playing' check (status in ('playing', 'won', 'lost')),
  last jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (game_id, seat)
);

alter table postmarks.runs enable row level security;
revoke all on postmarks.runs from public, anon, authenticated;

create function postmarks.random_phrase() returns text
language sql volatile set search_path = '' as $$
  select p from unnest(array[
    'a stitch in time saves nine', 'actions speak louder than words', 'the early bird catches the worm',
    'better late than never', 'every cloud has a silver lining', 'practice makes perfect',
    'two heads are better than one', 'the pen is mightier than the sword', 'no news is good news',
    'read between the lines', 'signed sealed delivered', 'return to sender', 'wish you were here',
    'message in a bottle', 'a penny for your thoughts', 'easier said than done', 'once in a blue moon',
    'burning the midnight oil', 'back to the drawing board', 'a picture is worth a thousand words',
    'the best of both worlds', 'let the cat out of the bag', 'time flies when you are having fun',
    'many hands make light work', 'look before you leap', 'fortune favours the bold',
    'slow and steady wins the race', 'great minds think alike', 'home is where the heart is',
    'good things come to those who wait', 'do not judge a book by its cover', 'honesty is the best policy',
    'kindness costs nothing', 'a friend in need is a friend indeed', 'out of sight out of mind',
    'absence makes the heart grow fonder', 'please write back soon', 'the more the merrier',
    'a watched pot never boils', 'every little helps'
  ]) as p order by random() limit 1;
$$;

-- The phrase as solvers see it: letters and digits not yet revealed become "_".
-- p_found of p_size board letters found reveals that share of the phrase.
create function postmarks.phrase_mask(p_phrase text, p_order smallint[], p_found integer, p_size integer) returns text
language sql immutable set search_path = '' as $$
  select string_agg(
    case when t.ch ~ '[[:alnum:]]'
              and not (t.i = any (p_order[1 : (array_length(p_order, 1) * p_found / p_size)]))
         then '_' else t.ch end, '' order by t.i)
  from regexp_split_to_table(p_phrase, '') with ordinality as t(ch, i);
$$;

-- Apply one board action to a set of cells (mirrors applyMove in game.js).
-- Raises if the action is not allowed.
create function postmarks.apply_move(
  p_size integer, p_regions smallint[], p_solution smallint[], p_cells smallint[], p_hearts smallint,
  p_type text, p_stroke integer[], p_me smallint,
  out cells smallint[], out hearts smallint, out status text, out last jsonb
) language plpgsql immutable set search_path = '' as $$
declare
  v_changed integer[] := '{}';
  v_from smallint;
  v_cell integer;
  v_correct boolean;
  v_crossed integer := 0;
begin
  cells := p_cells;
  hearts := p_hearts;
  status := 'playing';
  if coalesce(array_length(p_stroke, 1), 0) < 1
     or array_length(p_stroke, 1) > p_size * p_size
     or exists (select 1 from unnest(p_stroke) c where c is null or c < 0 or c >= p_size * p_size) then
    raise exception 'That square is not on the board.' using errcode = '22023';
  end if;

  if p_type in ('mark', 'unmark') then
    v_from := case p_type when 'mark' then 0 else 1 end;
    foreach v_cell in array p_stroke loop
      if cells[v_cell + 1] = v_from then
        cells[v_cell + 1] := 1 - v_from;
        v_changed := v_changed || v_cell;
      end if;
    end loop;
    if array_length(v_changed, 1) is null then
      if p_type = 'mark' then
        raise exception 'That square is already marked.' using errcode = 'P0001';
      end if;
      raise exception 'There is no cross to remove there.' using errcode = 'P0001';
    end if;
    last := jsonb_build_object('player', p_me, 'type', p_type, 'cell', v_changed[1], 'cells', to_jsonb(v_changed));
  elsif p_type = 'guess' then
    if array_length(p_stroke, 1) <> 1 then
      raise exception 'Guess one square at a time.' using errcode = '22023';
    end if;
    v_cell := p_stroke[1];
    if cells[v_cell + 1] in (2, 3) then
      raise exception 'That square is already settled.' using errcode = 'P0001';
    end if;
    v_correct := p_solution[v_cell / p_size + 1] = v_cell % p_size;
    last := jsonb_build_object('player', p_me, 'type', p_type, 'cell', v_cell, 'correct', v_correct);
    if v_correct then
      cells[v_cell + 1] := 2;
      for i in 0 .. p_size * p_size - 1 loop
        if cells[i + 1] = 0 and (
             i / p_size = v_cell / p_size
             or i % p_size = v_cell % p_size
             or p_regions[i + 1] = p_regions[v_cell + 1]
             or (abs(i / p_size - v_cell / p_size) <= 1 and abs(i % p_size - v_cell % p_size) <= 1)) then
          cells[i + 1] := 1;
          v_crossed := v_crossed + 1;
        end if;
      end loop;
      last := last || jsonb_build_object('crossed', v_crossed);
      if (select count(*) from unnest(cells) c where c = 2) = p_size then
        status := 'won';
      end if;
    else
      cells[v_cell + 1] := 3;
      hearts := hearts - 1;
      if hearts = 0 then
        status := 'lost';
      end if;
    end if;
  else
    raise exception 'Unknown move.' using errcode = '22023';
  end if;
end;
$$;

-- May this member act in a shared (coop or phrase) game right now? Raises if not.
create function postmarks.check_turn(g postmarks.games, p_me smallint) returns void
language plpgsql stable set search_path = '' as $$
declare
  v_able integer;
begin
  if g.status <> 'playing' then
    raise exception 'The game is over.' using errcode = 'P0001';
  end if;
  if g.phrase_by is not null and g.phrase_by = p_me then
    raise exception 'You wrote this phrase, so you are watching this one.' using errcode = 'P0001';
  end if;
  select count(*) into v_able from rooms.members m
  where m.room_id = g.room_id and m.seat is distinct from g.phrase_by;
  if v_able > 1 and (g.last->>'player')::integer = p_me then
    raise exception 'You made the last move, so someone else goes next.' using errcode = 'P0001';
  end if;
end;
$$;

create function postmarks.clock(p_ms numeric) returns text
language sql immutable set search_path = '' as $$
  select (floor(p_ms / 60000))::text || ':' || lpad((floor(p_ms / 1000)::integer % 60)::text, 2, '0');
$$;

revoke execute on all functions in schema postmarks from public, anon, authenticated;

-- What a member may see of a game.
create or replace function postmarks.game_view(g postmarks.games, p_you integer) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v jsonb;
  r postmarks.runs;
begin
  v := jsonb_build_object(
    'id', g.id, 'mode', g.mode, 'room', g.room_id,
    'room_name', (select name from rooms.rooms where id = g.room_id),
    'size', g.size,
    'players', coalesce(
      (select jsonb_agg(m.name order by m.seat) from rooms.members m where m.room_id = g.room_id), '[]'::jsonb),
    'people', rooms.people(g.room_id),
    'you', p_you);

  if g.mode = 'trial' then
    -- everyone's result, best first; each player's board is their own
    v := v || jsonb_build_object('runs', coalesce(
      (select jsonb_agg(jsonb_build_object(
          'seat', x.seat, 'status', x.status, 'hearts', x.hearts,
          'ms', case when x.status = 'won' then round(extract(epoch from x.finished_at - x.started_at) * 1000) end)
        order by (x.status = 'won') desc, x.finished_at - x.started_at, x.started_at)
       from postmarks.runs x where x.game_id = g.id), '[]'::jsonb));
    select * into r from postmarks.runs where game_id = g.id and seat = p_you;
    if not found then
      return v || jsonb_build_object('started', false, 'status', 'waiting');
    end if;
    return v || jsonb_build_object(
      'started', true, 'regions', to_jsonb(g.regions), 'cells', to_jsonb(r.cells), 'hearts', r.hearts,
      'moves', r.moves, 'status', r.status, 'last', r.last,
      'elapsed_ms', round(extract(epoch from coalesce(r.finished_at, now()) - r.started_at) * 1000),
      'solution', case when r.status <> 'playing' then to_jsonb(g.solution) end);
  end if;

  v := v || jsonb_build_object(
    'regions', to_jsonb(g.regions), 'cells', to_jsonb(g.cells), 'hearts', g.hearts, 'moves', g.moves,
    'status', g.status, 'last', g.last,
    'solution', case when g.status <> 'playing' then to_jsonb(g.solution) end);
  if g.mode = 'phrase' then
    v := v || jsonb_build_object(
      'phrase_by', g.phrase_by,
      'phrase_mask', postmarks.phrase_mask(
        g.phrase, g.phrase_order, (select count(*)::integer from unnest(g.cells) c where c = 2), g.size),
      'phrase', case when g.status <> 'playing' or g.phrase_by = p_you then g.phrase end);
  end if;
  return v;
end;
$$;

-- The room's list of games now says what kind each is.
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
           'id', g.id, 'kind', 'postmarks', 'mode', g.mode, 'size', g.size, 'status', g.status,
           'hearts', g.hearts, 'moves', g.moves,
           'found', (select count(*) from unnest(g.cells) c where c = 2),
           'last_player', (g.last->>'player')::integer, 'phrase_by', g.phrase_by,
           'finished', (select count(*) from postmarks.runs x where x.game_id = g.id and x.status <> 'playing'),
           'mine', (select x.status from postmarks.runs x where x.game_id = g.id and x.seat = p_you),
           'updated_at', g.updated_at) as j
         from postmarks.games g
         where g.room_id = r.id
         order by g.created_at desc limit 50) x), '[]'::jsonb) end
  )
  from rooms.rooms r where r.id = p_room;
$$;

-- ---------------------------------------------------------------------------
-- Public API
-- ---------------------------------------------------------------------------

-- Start a game of any mode. For 'phrase', p_phrase is the answer; leave it
-- empty to have one picked at random (then the starter can play too).
create function public.postmarks_start(
  p_room uuid, p_token text, p_mode text, p_size integer, p_regions integer[], p_solution integer[],
  p_phrase text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_seat smallint := rooms.seat(p_room, p_token);
  v_name text;
  v_phrase text := nullif(regexp_replace(btrim(coalesce(p_phrase, '')), '\s+', ' ', 'g'), '');
  v_by smallint;
  v_what text;
  g postmarks.games;
begin
  if v_seat is null then
    raise exception 'Join the room to start a game.' using errcode = 'P0001';
  end if;
  if p_mode is null or p_mode not in ('coop', 'trial', 'phrase') then
    raise exception 'Unknown kind of game.' using errcode = '22023';
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

  if p_mode = 'phrase' then
    if v_phrase is null then
      v_phrase := postmarks.random_phrase();
    else
      if char_length(v_phrase) > 60 or v_phrase !~ '^[[:alnum:] .,!?''-]+$'
         or char_length(regexp_replace(v_phrase, '[^[:alnum:]]', '', 'g')) < 3 then
        raise exception 'A phrase is 3 to 60 letters, with spaces and simple punctuation.' using errcode = '22023';
      end if;
      v_by := v_seat;
    end if;
  else
    v_phrase := null;
  end if;

  insert into postmarks.games (room_id, mode, size, regions, solution, cells, phrase, phrase_by, phrase_order)
  values (p_room, p_mode, p_size, p_regions::smallint[], p_solution::smallint[],
          array_fill(0::smallint, array[p_size * p_size]), v_phrase, v_by,
          (select array_agg(t.i::smallint order by random())
           from regexp_split_to_table(v_phrase, '') with ordinality as t(ch, i) where t.ch ~ '[[:alnum:]]'))
  returning * into g;

  select m.name into v_name from rooms.members m where m.room_id = p_room and m.seat = v_seat;
  v_what := case p_mode
    when 'trial' then ' started a Postmarks time trial'
    when 'phrase' then case when v_by is null then ' started a Postmarks pass phrase' else ' wrote a Postmarks pass phrase to solve' end
    else ' started a game of Postmarks' end;
  perform rooms.announce(p_room, v_name || v_what, 'postmarks', g.id);
  perform rooms.notify(p_room, v_seat, v_name || v_what, '/postmarks/?game=' || g.id, 'game:' || g.id);
  return postmarks.game_view(g, v_seat);
end;
$$;

-- The original call starts a co-op game.
create or replace function public.postmarks_create(
  p_room uuid, p_token text, p_size integer, p_regions integer[], p_solution integer[]
) returns jsonb
language sql security definer set search_path = '' as $$
  select public.postmarks_start(p_room, p_token, 'coop', p_size, p_regions, p_solution, null);
$$;

-- Time trial: start your clock and get your own copy of the board.
create function public.postmarks_trial_start(p_game uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g postmarks.games;
  v_me smallint;
begin
  select * into g from postmarks.games where id = p_game;
  if not found then
    raise exception 'Game not found.' using errcode = 'P0002';
  end if;
  v_me := rooms.seat(g.room_id, p_token);
  if v_me is null then
    raise exception 'Join the room to play.' using errcode = 'P0001';
  end if;
  if g.mode <> 'trial' then
    raise exception 'This game is not a time trial.' using errcode = 'P0001';
  end if;
  insert into postmarks.runs (game_id, seat, cells)
  values (g.id, v_me, array_fill(0::smallint, array[g.size * g.size]))
  on conflict (game_id, seat) do nothing;
  return postmarks.game_view(g, v_me);
end;
$$;

-- Take a board action: 'mark' crosses, 'unmark' crosses, or 'guess' a letter.
create or replace function public.postmarks_play(p_game uuid, p_token text, p_type text, p_cells integer[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g postmarks.games;
  r postmarks.runs;
  v_me smallint;
  m record;
begin
  select * into g from postmarks.games where id = p_game for update;
  if not found then
    raise exception 'Game not found.' using errcode = 'P0002';
  end if;
  v_me := rooms.seat(g.room_id, p_token);
  if v_me is null then
    raise exception 'Join the room to play.' using errcode = 'P0001';
  end if;

  if g.mode = 'trial' then
    select * into r from postmarks.runs where game_id = g.id and seat = v_me for update;
    if not found then
      raise exception 'Start the time trial first.' using errcode = 'P0001';
    end if;
    if r.status <> 'playing' then
      raise exception 'You have finished this time trial.' using errcode = 'P0001';
    end if;
    m := postmarks.apply_move(g.size, g.regions, g.solution, r.cells, r.hearts, p_type, p_cells, v_me);
    update postmarks.runs
    set cells = m.cells, hearts = m.hearts, status = m.status, last = m.last, moves = moves + 1,
        finished_at = case when m.status <> 'playing' then now() end
    where game_id = g.id and seat = v_me
    returning * into r;
    if r.status <> 'playing' then
      perform rooms.announce(g.room_id,
        (select name from rooms.members where room_id = g.room_id and seat = v_me)
          || case r.status
               when 'won' then ' finished the time trial in '
                 || postmarks.clock(extract(epoch from r.finished_at - r.started_at) * 1000)
               else ' ran out of hearts in the time trial' end,
        'postmarks', g.id);
    end if;
    return postmarks.game_view(g, v_me);
  end if;

  perform postmarks.check_turn(g, v_me);
  m := postmarks.apply_move(g.size, g.regions, g.solution, g.cells, g.hearts, p_type, p_cells, v_me);
  update postmarks.games
  set cells = m.cells, hearts = m.hearts, status = m.status, last = m.last, moves = moves + 1, updated_at = now()
  where id = p_game
  returning * into g;

  if g.status = 'won' then
    perform rooms.announce(g.room_id,
      case when g.mode = 'phrase' then 'Pass phrase solved: ' || g.phrase
           else 'Postmarks solved in ' || g.moves || ' turns with ' || g.hearts || ' of 3 hearts left' end,
      'postmarks', g.id);
  elsif g.status = 'lost' then
    perform rooms.announce(g.room_id, 'A game of Postmarks ran out of hearts', 'postmarks', g.id);
  end if;
  return postmarks.game_view(g, v_me);
end;
$$;

-- Pass phrase: use your turn to guess the whole phrase.
create function public.postmarks_guess_phrase(p_game uuid, p_token text, p_phrase text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g postmarks.games;
  v_me smallint;
  v_guess text := left(regexp_replace(btrim(coalesce(p_phrase, '')), '\s+', ' ', 'g'), 60);
  v_correct boolean;
begin
  select * into g from postmarks.games where id = p_game for update;
  if not found then
    raise exception 'Game not found.' using errcode = 'P0002';
  end if;
  v_me := rooms.seat(g.room_id, p_token);
  if v_me is null then
    raise exception 'Join the room to play.' using errcode = 'P0001';
  end if;
  if g.mode <> 'phrase' then
    raise exception 'This game has no phrase to guess.' using errcode = 'P0001';
  end if;
  perform postmarks.check_turn(g, v_me);
  if char_length(regexp_replace(v_guess, '[^[:alnum:]]', '', 'g')) < 1 then
    raise exception 'Type your guess at the phrase.' using errcode = '22023';
  end if;

  -- letters and digits only, any case: spacing and punctuation do not matter
  v_correct := lower(regexp_replace(v_guess, '[^[:alnum:]]', '', 'g'))
             = lower(regexp_replace(g.phrase, '[^[:alnum:]]', '', 'g'));
  update postmarks.games
  set hearts = hearts - (not v_correct)::integer,
      status = case when v_correct then 'won' when hearts - 1 = 0 then 'lost' else 'playing' end,
      last = jsonb_build_object('player', v_me, 'type', 'phrase', 'correct', v_correct, 'guess', v_guess),
      moves = moves + 1,
      updated_at = now()
  where id = p_game
  returning * into g;

  if g.status = 'won' then
    perform rooms.announce(g.room_id, 'Pass phrase solved: ' || g.phrase, 'postmarks', g.id);
  elsif g.status = 'lost' then
    perform rooms.announce(g.room_id, 'A pass phrase went unsolved: ' || g.phrase, 'postmarks', g.id);
  end if;
  return postmarks.game_view(g, v_me);
end;
$$;

-- Leaderboards refresh on open pages when someone starts or finishes a run.
create function postmarks.poke_run() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    begin
      perform realtime.send('{}'::jsonb, 'changed',
        'room:' || (select room_id from postmarks.games where id = new.game_id)::text, false);
    exception when others then
      null;
    end;
  end if;
  return null;
end;
$$;

create trigger poke_run after insert or update on postmarks.runs
  for each row execute function postmarks.poke_run();

revoke execute on all functions in schema postmarks from public, anon, authenticated;
revoke execute on function public.postmarks_start(uuid, text, text, integer, integer[], integer[], text) from public;
revoke execute on function public.postmarks_trial_start(uuid, text) from public;
revoke execute on function public.postmarks_guess_phrase(uuid, text, text) from public;
grant execute on function public.postmarks_start(uuid, text, text, integer, integer[], integer[], text) to anon, authenticated;
grant execute on function public.postmarks_trial_start(uuid, text) to anon, authenticated;
grant execute on function public.postmarks_guess_phrase(uuid, text, text) to anon, authenticated;
