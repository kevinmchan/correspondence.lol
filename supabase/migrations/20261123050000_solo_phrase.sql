-- Pass phrase becomes a solo mode like the time trial: every player solves
-- their own copy of the same board (a row in postmarks.runs) and the phrase is
-- hidden one word per board letter. games.phrase_order now maps each word of
-- the phrase to the board row whose letter holds it; finding that letter
-- reveals the word. (postmarks.phrase_mask and postmarks.check_turn's phrase
-- handling are left over from the shared version and no longer used.)

-- The phrase as one player sees it: words whose letter they have found are
-- shown, the rest have their letters and digits replaced by "_".
create function postmarks.phrase_words(p_phrase text, p_order smallint[], p_rows integer[]) returns text
language sql immutable set search_path = '' as $$
  select string_agg(
    case when p_order[t.i] = any (p_rows) then t.w else regexp_replace(t.w, '[[:alnum:]]', '_', 'g') end,
    ' ' order by t.i)
  from regexp_split_to_table(p_phrase, ' ') with ordinality as t(w, i);
$$;

-- Rows of the board whose letter has been found in these cells.
create function postmarks.found_rows(p_size integer, p_solution smallint[], p_cells smallint[]) returns integer[]
language sql immutable set search_path = '' as $$
  select array_agg(r) from generate_series(0, p_size - 1) r
  where p_cells[r * p_size + p_solution[r + 1] + 1] = 2;
$$;

revoke execute on all functions in schema postmarks from public, anon, authenticated;

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

  if g.mode = 'coop' then
    return v || jsonb_build_object(
      'regions', to_jsonb(g.regions), 'cells', to_jsonb(g.cells), 'hearts', g.hearts, 'moves', g.moves,
      'status', g.status, 'last', g.last,
      'solution', case when g.status <> 'playing' then to_jsonb(g.solution) end);
  end if;

  -- Solo modes: everyone's result, best first. A time trial ranks by time; a
  -- pass phrase by how few letters were opened, then by time.
  v := v || jsonb_build_object('runs', coalesce(
    (select jsonb_agg(jsonb_build_object(
        'seat', x.seat, 'status', x.status, 'hearts', x.hearts, 'found', x.found,
        'ms', case when x.status = 'won' then round(extract(epoch from x.took) * 1000) end)
      order by (x.status = 'won') desc, case when g.mode = 'phrase' then x.found end, x.took, x.started_at)
     from (select q.*, q.finished_at - q.started_at as took,
                  (select count(*) from unnest(q.cells) c where c = 2) as found
           from postmarks.runs q where q.game_id = g.id) x), '[]'::jsonb));
  if g.mode = 'phrase' then
    v := v || jsonb_build_object('phrase_by', g.phrase_by);
  end if;

  select * into r from postmarks.runs where game_id = g.id and seat = p_you;
  if not found then
    -- not started: the board is withheld. A phrase's author never starts and sees the answer.
    return v || jsonb_build_object('started', false, 'status', 'waiting')
      || case when g.mode = 'phrase' then jsonb_build_object(
           'phrase_mask', postmarks.phrase_words(g.phrase, g.phrase_order, null),
           'phrase', case when g.phrase_by = p_you then g.phrase end) else '{}'::jsonb end;
  end if;

  v := v || jsonb_build_object(
    'started', true, 'regions', to_jsonb(g.regions), 'cells', to_jsonb(r.cells), 'hearts', r.hearts,
    'moves', r.moves, 'status', r.status, 'last', r.last,
    'elapsed_ms', round(extract(epoch from coalesce(r.finished_at, now()) - r.started_at) * 1000),
    'solution', case when r.status <> 'playing' then to_jsonb(g.solution) end);
  if g.mode = 'phrase' then
    v := v || jsonb_build_object(
      'phrase_mask', postmarks.phrase_words(g.phrase, g.phrase_order, postmarks.found_rows(g.size, g.solution, r.cells)),
      'phrase', case when r.status <> 'playing' then g.phrase end);
  end if;
  return v;
end;
$$;

create or replace function public.postmarks_start(
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
  v_rows smallint[];
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
      -- a random phrase with no more words than the board has letters, so each gets its own
      for i in 1 .. 30 loop
        v_phrase := postmarks.random_phrase();
        exit when array_length(regexp_split_to_array(v_phrase, ' '), 1) <= p_size;
      end loop;
    else
      if char_length(v_phrase) > 60 or v_phrase !~ '^[[:alnum:] .,!?''-]+$'
         or char_length(regexp_replace(v_phrase, '[^[:alnum:]]', '', 'g')) < 3 then
        raise exception 'A phrase is 3 to 60 letters, with spaces and simple punctuation.' using errcode = '22023';
      end if;
      v_by := v_seat;
    end if;
    -- hide each word inside a different letter of the board (sharing only if there are more words than letters)
    v_rows := array(select r::smallint from generate_series(0, p_size - 1) r order by random());
  else
    v_phrase := null;
  end if;

  insert into postmarks.games (room_id, mode, size, regions, solution, cells, phrase, phrase_by, phrase_order)
  values (p_room, p_mode, p_size, p_regions::smallint[], p_solution::smallint[],
          array_fill(0::smallint, array[p_size * p_size]), v_phrase, v_by,
          (select array_agg(v_rows[((t.i - 1) % p_size) + 1] order by t.i)
           from regexp_split_to_table(v_phrase, ' ') with ordinality as t(w, i)))
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

-- Solo modes: get your own copy of the board (and, in a time trial, start your clock).
create or replace function public.postmarks_trial_start(p_game uuid, p_token text) returns jsonb
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
  if g.mode = 'coop' then
    raise exception 'This game is played together.' using errcode = 'P0001';
  end if;
  if g.phrase_by is not null and g.phrase_by = v_me then
    raise exception 'You wrote this phrase, so you are watching this one.' using errcode = 'P0001';
  end if;
  insert into postmarks.runs (game_id, seat, cells)
  values (g.id, v_me, array_fill(0::smallint, array[g.size * g.size]))
  on conflict (game_id, seat) do nothing;
  return postmarks.game_view(g, v_me);
end;
$$;

-- A solo run ended: tell the room.
create function postmarks.announce_run(g postmarks.games, r postmarks.runs) returns void
language plpgsql set search_path = '' as $$
declare
  v_name text := (select name from rooms.members where room_id = g.room_id and seat = r.seat);
  v_found integer := (select count(*) from unnest(r.cells) c where c = 2);
begin
  perform rooms.announce(g.room_id, v_name || case
    when g.mode = 'trial' and r.status = 'won' then
      ' finished the time trial in ' || postmarks.clock(extract(epoch from r.finished_at - r.started_at) * 1000)
    when g.mode = 'trial' then ' ran out of hearts in the time trial'
    when r.status = 'won' then ' solved the pass phrase after opening ' || v_found || ' of ' || g.size || ' letters'
    else ' ran out of hearts on the pass phrase' end,
    'postmarks', g.id);
end;
$$;

revoke execute on function postmarks.announce_run(postmarks.games, postmarks.runs) from public, anon, authenticated;

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

  if g.mode <> 'coop' then
    select * into r from postmarks.runs where game_id = g.id and seat = v_me for update;
    if not found then
      raise exception 'Start the game first.' using errcode = 'P0001';
    end if;
    if r.status <> 'playing' then
      raise exception 'You have finished this game.' using errcode = 'P0001';
    end if;
    m := postmarks.apply_move(g.size, g.regions, g.solution, r.cells, r.hearts, p_type, p_cells, v_me);
    update postmarks.runs
    set cells = m.cells, hearts = m.hearts, status = m.status, last = m.last, moves = moves + 1,
        finished_at = case when m.status <> 'playing' then now() end
    where game_id = g.id and seat = v_me
    returning * into r;
    if r.status <> 'playing' then
      perform postmarks.announce_run(g, r);
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
      'Postmarks solved in ' || g.moves || ' turns with ' || g.hearts || ' of 3 hearts left', 'postmarks', g.id);
  elsif g.status = 'lost' then
    perform rooms.announce(g.room_id, 'A game of Postmarks ran out of hearts', 'postmarks', g.id);
  end if;
  return postmarks.game_view(g, v_me);
end;
$$;

-- Pass phrase: guess the whole phrase. Right wins your run; wrong costs you a heart.
create or replace function public.postmarks_guess_phrase(p_game uuid, p_token text, p_phrase text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g postmarks.games;
  r postmarks.runs;
  v_me smallint;
  v_guess text := left(regexp_replace(btrim(coalesce(p_phrase, '')), '\s+', ' ', 'g'), 60);
  v_correct boolean;
begin
  select * into g from postmarks.games where id = p_game;
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
  select * into r from postmarks.runs where game_id = g.id and seat = v_me for update;
  if not found then
    raise exception 'Start the game first.' using errcode = 'P0001';
  end if;
  if r.status <> 'playing' then
    raise exception 'You have finished this game.' using errcode = 'P0001';
  end if;
  if char_length(regexp_replace(v_guess, '[^[:alnum:]]', '', 'g')) < 1 then
    raise exception 'Type your guess at the phrase.' using errcode = '22023';
  end if;

  -- letters and digits only, any case: spacing and punctuation do not matter
  v_correct := lower(regexp_replace(v_guess, '[^[:alnum:]]', '', 'g'))
             = lower(regexp_replace(g.phrase, '[^[:alnum:]]', '', 'g'));
  update postmarks.runs
  set hearts = hearts - (not v_correct)::integer,
      status = case when v_correct then 'won' when hearts - 1 = 0 then 'lost' else 'playing' end,
      last = jsonb_build_object('player', v_me, 'type', 'phrase', 'correct', v_correct, 'guess', v_guess),
      moves = moves + 1,
      finished_at = case when v_correct or hearts - 1 = 0 then now() end
  where game_id = g.id and seat = v_me
  returning * into r;
  if r.status <> 'playing' then
    perform postmarks.announce_run(g, r);
  end if;
  return postmarks.game_view(g, v_me);
end;
$$;
