-- Rooms: let a member change the name they go by in a room. Their seat, and
-- so their past messages and moves, stay attached to them.

create function public.room_rename(p_room uuid, p_token text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := rooms.clean_text(p_name, 20, 'Names');
  v_seat smallint := rooms.seat(p_room, p_token);
  v_old text;
begin
  if v_seat is null then
    raise exception 'Join the room first.' using errcode = 'P0001';
  end if;
  select name into v_old from rooms.members where room_id = p_room and seat = v_seat for update;
  if v_old is distinct from v_name then
    update rooms.members set name = v_name where room_id = p_room and seat = v_seat;
    perform rooms.announce(p_room, v_old || ' is now ' || v_name);
  end if;
  return rooms.room_view(p_room, v_seat, null);
end;
$$;

revoke execute on function public.room_rename(uuid, text, text) from public;
grant execute on function public.room_rename(uuid, text, text) to anon, authenticated;
