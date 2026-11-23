-- Any member can rename the room. The change is noted in the room's chat.

create function public.room_title(p_room uuid, p_token text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := rooms.clean_text(p_name, 40, 'Room names');
  v_seat smallint := rooms.seat(p_room, p_token);
  v_old text;
begin
  if v_seat is null then
    raise exception 'Join the room first.' using errcode = 'P0001';
  end if;
  select name into v_old from rooms.rooms where id = p_room for update;
  if v_old is distinct from v_name then
    update rooms.rooms set name = v_name where id = p_room;
    perform rooms.announce(p_room,
      (select name from rooms.members where room_id = p_room and seat = v_seat)
        || ' renamed the room to ' || v_name);
  end if;
  return rooms.room_view(p_room, v_seat, null);
end;
$$;

revoke execute on function public.room_title(uuid, text, text) from public;
grant execute on function public.room_title(uuid, text, text) to anon, authenticated;
