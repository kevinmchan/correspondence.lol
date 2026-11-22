-- Postmarks: when a letter is found, cross out every empty square that shares
-- its row, column or district (mirrors postmarks/game.js).

create or replace function public.postmarks_move(p_game uuid, p_token text, p_type text, p_cell integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g postmarks.games;
  v_me smallint;
  v_current smallint;
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
    if v_correct then
      g.cells[p_cell + 1] := 2;
      for i in 0 .. g.size * g.size - 1 loop
        if g.cells[i + 1] = 0 and (
             i / g.size = p_cell / g.size
             or i % g.size = p_cell % g.size
             or g.regions[i + 1] = g.regions[p_cell + 1]) then
          g.cells[i + 1] := 1;
          v_crossed := v_crossed + 1;
        end if;
      end loop;
      v_last := v_last || jsonb_build_object('correct', true, 'crossed', v_crossed);
      if (select count(*) from unnest(g.cells) c where c = 2) = g.size then
        g.status := 'won';
      end if;
    else
      v_last := v_last || jsonb_build_object('correct', false);
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
