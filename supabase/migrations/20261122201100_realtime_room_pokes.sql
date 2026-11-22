-- Real-time: whenever something changes in a room (a chat message or notice,
-- or a move in one of its games), broadcast a content-free "changed" event on
-- the public channel room:<id>. Browsers listening on it refetch through the
-- usual member-checked functions, so the channel itself reveals nothing.

create function rooms.poke() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send('{}'::jsonb, 'changed', 'room:' || new.room_id::text, false);
  exception when others then
    null; -- real-time is best effort; never fail the change itself
  end;
  return null;
end;
$$;

revoke execute on function rooms.poke() from public, anon, authenticated;

create trigger poke_room after insert on rooms.messages
  for each row execute function rooms.poke();

create trigger poke_room after update on postmarks.games
  for each row execute function rooms.poke();
