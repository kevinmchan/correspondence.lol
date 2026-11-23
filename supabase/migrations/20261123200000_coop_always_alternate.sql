-- Postmarks, Together: a move always passes the turn on, even when you are the
-- only one in the room. Whoever made the last move waits until someone else
-- has moved. (Before, turns only alternated with more than one member.)
create or replace function postmarks.check_turn(g postmarks.games, p_me smallint) returns void
language plpgsql stable set search_path = '' as $$
begin
  if g.status <> 'playing' then
    raise exception 'The game is over.' using errcode = 'P0001';
  end if;
  if (g.last->>'player')::integer = p_me then
    raise exception 'You made the last move, so someone else goes next.' using errcode = 'P0001';
  end if;
end;
$$;
