-- Pass phrase: emoji may be written in a phrase. They count as characters but
-- not as letters: a guess is still compared on letters and numbers alone, so
-- nobody has to type the emoji to solve it. postmarks.tokenize is unchanged
-- (an emoji is a token of its own, or part of one, and is never split). A
-- phrase is long enough when it splits into a token for every post; before,
-- it needed that many letters, which refused phrases with emoji for words.
-- Also, a curly apostrophe is taken as a plain one. phraseProblem() in
-- postmarks/game.js checks the same rules while a phrase is typed.

-- The characters emoji are made of, as the inside of a regex bracket: the
-- pictograph, symbol, arrow and dingbat blocks, plus the joiners and modifiers
-- that build sequences (flags, skin tones, families, keycaps).
create function postmarks.emoji_class() returns text
language sql immutable set search_path = '' as $$
  select '\u00A9\u00AE\u200D\u203C\u2049\u20E3\u2122\u2139\u2190-\u21FF\u2300-\u23FF\u24C2\u25A0-\u27BF'
      || '\u2900-\u297F\u2B00-\u2BFF\u3030\u303D\u3297\u3299\uFE0F\U0001F000-\U0001FAFF\U000E0020-\U000E007F';
$$;

revoke execute on function postmarks.emoji_class() from public, anon, authenticated;

create or replace function public.postmarks_start(
  p_room uuid, p_token text, p_mode text, p_size integer, p_regions integer[], p_solution integer[],
  p_phrase text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_seat smallint := rooms.seat(p_room, p_token);
  v_name text;
  -- spaces are tidied, and a phone's curly apostrophe is taken as a plain one
  v_phrase text := nullif(regexp_replace(btrim(translate(coalesce(p_phrase, ''), '‘’', '''''')), '\s+', ' ', 'g'), '');
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
      if char_length(v_phrase) > 60 or v_phrase !~ ('^[A-Za-z0-9 .,!?''' || postmarks.emoji_class() || '-]+$') then
        raise exception 'A phrase is up to 60 characters: letters, numbers, emoji, spaces and simple punctuation.' using errcode = '22023';
      end if;
      -- a guess is compared on letters and numbers, so there has to be one
      if v_phrase !~ '[A-Za-z0-9]' then
        raise exception 'A phrase needs at least one letter or number, so that it can be guessed.' using errcode = '22023';
      end if;
      -- every post of the board must unlock a token. Words are split to make more,
      -- but only between letters, so a short phrase can run out.
      if jsonb_array_length(postmarks.tokenize(v_phrase, p_size)) <> p_size then
        raise exception 'That phrase is too short: it has to fill % posts.', p_size using errcode = '22023';
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
