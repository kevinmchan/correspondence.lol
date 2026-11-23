-- Pass phrase: a phrase is now always split into exactly as many tokens as the
-- board has letters, so every letter unlocks one token. With too few words the
-- longest tokens are split in half; with too many, neighbouring ones are
-- joined. The tokens are stored on the game (games.phrase_tokens) and
-- games.phrase_order maps each token to the board row whose letter holds it.
-- postmarks.tokenize mirrors tokenize() in postmarks/game.js, which draws the
-- preview while a phrase is being written.

alter table postmarks.games add column phrase_tokens jsonb; -- [{ "t": text, "gap": is it followed by a space }]

create function postmarks.tokenize(p_phrase text, p_n integer) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  t text[] := regexp_split_to_array(p_phrase, ' ');
  gap boolean[];
  n integer := array_length(t, 1);
  best integer;
  best_len integer;
  len integer;
  s text;
  seen integer;
  cut integer;
begin
  gap := array_fill(true, array[n]);
  gap[n] := false;

  -- too few: split the token with the most letters into two halves
  while n < p_n loop
    best := null;
    best_len := 1;
    for i in 1 .. n loop
      len := char_length(regexp_replace(t[i], '[^A-Za-z0-9]', '', 'g'));
      if len > best_len then
        best := i;
        best_len := len;
      end if;
    end loop;
    exit when best is null; -- nothing left with two letters to split
    s := t[best];
    seen := 0;
    cut := 0;
    for j in 1 .. char_length(s) loop
      if substr(s, j, 1) ~ '[A-Za-z0-9]' then
        seen := seen + 1;
      end if;
      if seen = (best_len + 1) / 2 then
        cut := j;
        exit;
      end if;
    end loop;
    t := t[1 : best - 1] || array[left(s, cut), substr(s, cut + 1)] || t[best + 1 : n];
    gap := gap[1 : best - 1] || array[false, gap[best]] || gap[best + 1 : n];
    n := n + 1;
  end loop;

  -- too many: join the neighbouring pair that makes the shortest token
  while n > p_n loop
    best := 1;
    best_len := null;
    for i in 1 .. n - 1 loop
      len := char_length(t[i]) + char_length(t[i + 1]);
      if best_len is null or len < best_len then
        best := i;
        best_len := len;
      end if;
    end loop;
    t := t[1 : best - 1] || array[t[best] || case when gap[best] then ' ' else '' end || t[best + 1]] || t[best + 2 : n];
    gap := gap[1 : best - 1] || array[gap[best + 1]] || gap[best + 2 : n];
    n := n - 1;
  end loop;

  return (select jsonb_agg(jsonb_build_object('t', t[x], 'gap', gap[x]) order by x) from generate_series(1, n) x);
end;
$$;

revoke execute on function postmarks.tokenize(text, integer) from public, anon, authenticated;

create or replace function postmarks.game_view(g postmarks.games, p_you integer) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v jsonb;
  r postmarks.runs;
  v_rows integer[];  -- board rows whose letter this player has found
  v_all boolean;     -- show every token (the author, or a finished run)
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

  v := v || jsonb_build_object('runs', coalesce(
    (select jsonb_agg(jsonb_build_object(
        'seat', x.seat, 'status', x.status, 'hearts', x.hearts, 'found', x.found,
        'ms', case when x.status = 'won' then round(extract(epoch from x.took) * 1000) end)
      order by (x.status = 'won') desc, case when g.mode = 'phrase' then x.found end, x.took, x.started_at)
     from (select q.*, q.finished_at - q.started_at as took,
                  (select count(*) from unnest(q.cells) c where c = 2) as found
           from postmarks.runs q where q.game_id = g.id) x), '[]'::jsonb));

  select * into r from postmarks.runs where game_id = g.id and seat = p_you;
  if found then
    v := v || jsonb_build_object(
      'started', true, 'regions', to_jsonb(g.regions), 'cells', to_jsonb(r.cells), 'hearts', r.hearts,
      'moves', r.moves, 'status', r.status, 'last', r.last,
      'elapsed_ms', round(extract(epoch from coalesce(r.finished_at, now()) - r.started_at) * 1000),
      'solution', case when r.status <> 'playing' then to_jsonb(g.solution) end);
    v_rows := postmarks.found_rows(g.size, g.solution, r.cells);
    v_all := r.status <> 'playing';
  else
    -- not started: the board is withheld. A phrase's author never starts and sees the answer.
    v := v || jsonb_build_object('started', false, 'status', 'waiting');
    v_all := g.phrase_by is not null and g.phrase_by = p_you;
  end if;

  if g.mode = 'phrase' then
    v := v || jsonb_build_object(
      'phrase_by', g.phrase_by,
      'phrase', case when v_all then g.phrase end,
      -- one entry per token: its length, whether a space follows, and its text once unlocked
      'tokens', (select jsonb_agg(jsonb_build_object(
          'len', char_length(e.tok->>'t'), 'gap', (e.tok->>'gap')::boolean,
          't', case when v_all or g.phrase_order[e.i] = any (v_rows) then e.tok->>'t' end) order by e.i)
        from jsonb_array_elements(g.phrase_tokens) with ordinality as e(tok, i)),
      -- for games made before tokens, and pages still on the previous version
      'phrase_mask', postmarks.phrase_words(g.phrase, g.phrase_order, case when v_all then null else v_rows end));
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
  v_tokens jsonb;
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
      v_phrase := postmarks.random_phrase();
    else
      if char_length(v_phrase) > 60 or v_phrase !~ '^[A-Za-z0-9 .,!?''-]+$' then
        raise exception 'A phrase is up to 60 characters: letters, numbers, spaces and simple punctuation.' using errcode = '22023';
      end if;
      -- every letter of the board must unlock something, so there have to be enough letters to go round
      if char_length(regexp_replace(v_phrase, '[^A-Za-z0-9]', '', 'g')) < p_size then
        raise exception 'That phrase is too short: it needs at least % letters.', p_size using errcode = '22023';
      end if;
      v_by := v_seat;
    end if;
    v_tokens := postmarks.tokenize(v_phrase, p_size);
    -- each token goes inside a different letter of the board
    v_rows := array(select r::smallint from generate_series(0, p_size - 1) r order by random());
  else
    v_phrase := null;
  end if;

  insert into postmarks.games (room_id, mode, size, regions, solution, cells, phrase, phrase_by, phrase_tokens, phrase_order)
  values (p_room, p_mode, p_size, p_regions::smallint[], p_solution::smallint[],
          array_fill(0::smallint, array[p_size * p_size]), v_phrase, v_by, v_tokens,
          (select array_agg(v_rows[((e.i - 1) % p_size) + 1] order by e.i)
           from jsonb_array_elements(v_tokens) with ordinality as e(tok, i)))
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
