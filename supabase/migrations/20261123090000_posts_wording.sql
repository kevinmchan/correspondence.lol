-- The envelopes on the board are now called posts, so that "letters" only ever
-- means the letters of a phrase.
create or replace function postmarks.announce_run(g postmarks.games, r postmarks.runs) returns void
language plpgsql set search_path = '' as $$
declare
  v_name text := (select name from rooms.members where room_id = g.room_id and seat = r.seat);
  v_found integer := (select count(*) from unnest(r.cells) c where c = 2);
begin
  perform rooms.announce(g.room_id, v_name || case
    when g.mode = 'trial' and r.status = 'won' then
      ' finished the time trial in ' || postmarks.clock(extract(epoch from r.finished_at - r.started_at) * 1000)
    when g.mode = 'trial' then ' ran out of hearts in the time trial'
    when r.status = 'won' then ' solved the pass phrase after opening ' || v_found || ' of ' || g.size || ' posts'
    else ' ran out of hearts on the pass phrase' end,
    'postmarks', g.id);
end;
$$;
