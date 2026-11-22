-- Postmarks: drop strict turn order. Any seated player may take the next turn
-- except the one who took the last turn (recorded in games.last->'player').

create or replace function postmarks.game_view(g postmarks.games, p_you integer) returns jsonb
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
    'hearts', g.hearts,
    'moves', g.moves,
    'status', g.status,
    'last', g.last,
    'you', p_you,
    'solution', case when g.status in ('won', 'lost') then to_jsonb(g.solution) end
  );
$$;

-- Take a turn: 'mark' a cross, 'unmark' a cross, or 'guess' a letter.
create or replace function public.postmarks_move(p_game uuid, p_token text, p_type text, p_cell integer) returns jsonb
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
  return postmarks.game_view(g, v_me);
end;
$$;

alter table postmarks.games drop column turn;
