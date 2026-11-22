-- Notify the rest of the room when someone says something in the chat.
-- Announcements (seat is null) are not chat and do not notify; game starts and
-- turns have their own notifications.

create function rooms.notify_chat() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.seat is not null then
    perform rooms.notify(
      new.room_id, new.seat,
      coalesce((select name from rooms.members where room_id = new.room_id and seat = new.seat), 'Someone')
        || ': ' || case when char_length(new.body) > 140 then left(new.body, 139) || '…' else new.body end,
      '/room/?id=' || new.room_id, 'chat:' || new.room_id);
  end if;
  return null;
end;
$$;

revoke execute on function rooms.notify_chat() from public, anon, authenticated;

create trigger notify_chat after insert on rooms.messages
  for each row execute function rooms.notify_chat();
