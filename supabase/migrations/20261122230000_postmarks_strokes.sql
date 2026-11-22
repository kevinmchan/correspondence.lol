-- Postmarks: a turn's cross action may cover several squares (one drag stroke),
-- and finding a letter also crosses out the squares touching it diagonally.
-- Mirrors postmarks/game.js.
--
-- The stroke-aware function is new (postmarks_play); postmarks_move stays for
-- pages still running the previous version and simply forwards to it.

create function public.postmarks_play(p_game uuid, p_token text, p_type text, p_cells integer[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g postmarks.games;
  v_me smallint;
  v_stroke integer[];
  v_changed integer[] := '{}';
  v_from smallint;
  v_cell integer;
  v_correct boolean;
  v_crossed integer := 0;
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

  v_stroke := p_cells;
  if coalesce(array_length(v_stroke, 1), 0) < 1
     or array_length(v_stroke, 1) > g.size * g.size
     or exists (select 1 from unnest(v_stroke) c where c is null or c < 0 or c >= g.size * g.size) then
    raise exception 'That square is not on the board.' using errcode = '22023';
  end if;

  if p_type in ('mark', 'unmark') then
    v_from := case p_type when 'mark' then 0 else 1 end;
    foreach v_cell in array v_stroke loop
      if g.cells[v_cell + 1] = v_from then
        g.cells[v_cell + 1] := 1 - v_from;
        v_changed := v_changed || v_cell;
      end if;
    end loop;
    if array_length(v_changed, 1) is null then
      if p_type = 'mark' then
        raise exception 'That square is already marked.' using errcode = 'P0001';
      end if;
      raise exception 'There is no cross to remove there.' using errcode = 'P0001';
    end if;
    v_last := jsonb_build_object('player', v_me, 'type', p_type, 'cell', v_changed[1], 'cells', to_jsonb(v_changed));
  elsif p_type = 'guess' then
    if array_length(v_stroke, 1) <> 1 then
      raise exception 'Guess one square at a time.' using errcode = '22023';
    end if;
    v_cell := v_stroke[1];
    if g.cells[v_cell + 1] in (2, 3) then
      raise exception 'That square is already settled.' using errcode = 'P0001';
    end if;
    v_correct := g.solution[v_cell / g.size + 1] = v_cell % g.size;
    v_last := jsonb_build_object('player', v_me, 'type', p_type, 'cell', v_cell, 'correct', v_correct);
    if v_correct then
      g.cells[v_cell + 1] := 2;
      for i in 0 .. g.size * g.size - 1 loop
        if g.cells[i + 1] = 0 and (
             i / g.size = v_cell / g.size
             or i % g.size = v_cell % g.size
             or g.regions[i + 1] = g.regions[v_cell + 1]
             or (abs(i / g.size - v_cell / g.size) <= 1 and abs(i % g.size - v_cell % g.size) <= 1)) then
          g.cells[i + 1] := 1;
          v_crossed := v_crossed + 1;
        end if;
      end loop;
      v_last := v_last || jsonb_build_object('crossed', v_crossed);
      if (select count(*) from unnest(g.cells) c where c = 2) = g.size then
        g.status := 'won';
      end if;
    else
      g.cells[v_cell + 1] := 3;
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

revoke execute on function public.postmarks_play(uuid, text, text, integer[]) from public;
grant execute on function public.postmarks_play(uuid, text, text, integer[]) to anon, authenticated;

create or replace function public.postmarks_move(p_game uuid, p_token text, p_type text, p_cell integer) returns jsonb
language sql security definer set search_path = '' as $$
  select public.postmarks_play(p_game, p_token, p_type, array[p_cell]);
$$;
