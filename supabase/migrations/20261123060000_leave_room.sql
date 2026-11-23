-- Leaving a room. A member who leaves keeps their row (so their name still
-- shows on old messages and results, and seats stay stable) but is marked as
-- having left: their device no longer has access, they are not notified, and
-- they no longer count towards turn-taking. Joining again from the same device
-- gives them their old seat back. Rooms are not cleaned up when empty.

alter table rooms.members add column left_at timestamptz;

-- Seat of the current member holding this token, or null.
create or replace function rooms.seat(p_room uuid, p_token text) returns smallint
language sql stable set search_path = '' as $$
  select m.seat from rooms.members m
  where p_token is not null and m.room_id = p_room and m.token_hash = rooms.token_hash(p_token)
    and m.left_at is null;
$$;

-- Everyone who has ever been in the room, by seat, with whether they have left.
create or replace function rooms.people(p_room uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', m.name,
      'avatar', coalesce(m.avatar,
        (array['🦊','🐼','🐸','🦉','🐙','🦄','🐝','🐢','🦁','🐧','🐳','🦋'])[m.seat % 12 + 1]),
      'color', coalesce(m.color, m.seat % 8),
      'left', m.left_at is not null
    ) order by m.seat), '[]'::jsonb)
  from rooms.members m where m.room_id = p_room;
$$;

create or replace function rooms.notify(p_room uuid, p_actor smallint, p_body text, p_url text, p_tag text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_subs jsonb;
begin
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
  into v_subs
  from rooms.members m
  join rooms.push_subscriptions s on s.token_hash = m.token_hash and s.gone_at is null
  where m.room_id = p_room
    and m.left_at is null
    and m.seat is distinct from p_actor
    and (m.seen_at is null or m.seen_at < now() - interval '45 seconds');
  if v_subs is null or rooms.setting('vapid_private') is null then
    return;
  end if;
  perform net.http_post(
    url := rooms.setting('push_url'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', rooms.setting('push_secret')),
    body := jsonb_build_object(
      'vapid', jsonb_build_object(
        'public', rooms.setting('vapid_public'),
        'private', rooms.setting('vapid_private'),
        'subject', 'https://correspondence.lol'),
      'subscriptions', v_subs,
      'payload', jsonb_build_object(
        'title', (select name from rooms.rooms where id = p_room),
        'body', p_body, 'url', p_url, 'tag', p_tag)));
exception when others then
  null;
end;
$$;

-- Turns alternate only among members who are still in the room.
create or replace function postmarks.check_turn(g postmarks.games, p_me smallint) returns void
language plpgsql stable set search_path = '' as $$
declare
  v_able integer;
begin
  if g.status <> 'playing' then
    raise exception 'The game is over.' using errcode = 'P0001';
  end if;
  select count(*) into v_able from rooms.members m
  where m.room_id = g.room_id and m.left_at is null;
  if v_able > 1 and (g.last->>'player')::integer = p_me then
    raise exception 'You made the last move, so someone else goes next.' using errcode = 'P0001';
  end if;
end;
$$;

-- Join a room, or come back to one you left (keeping your seat). Joining again
-- while still a member is harmless.
create or replace function public.room_join(p_room uuid, p_name text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := rooms.clean_text(p_name, 20, 'Names');
  v_seat smallint;
  v_left timestamptz;
begin
  perform rooms.check_token(p_token);
  perform 1 from rooms.rooms where id = p_room for update;
  if not found then
    raise exception 'Room not found.' using errcode = 'P0002';
  end if;
  select m.seat, m.left_at into v_seat, v_left from rooms.members m
  where m.room_id = p_room and m.token_hash = rooms.token_hash(p_token);
  if v_seat is not null and v_left is null then
    return rooms.room_view(p_room, v_seat, null);
  end if;
  if (select count(*) from rooms.members where room_id = p_room and left_at is null) >= 12 then
    raise exception 'This room is full.' using errcode = 'P0001';
  end if;
  if v_seat is null then
    select count(*) into v_seat from rooms.members where room_id = p_room;
    insert into rooms.members (room_id, seat, name, token_hash)
    values (p_room, v_seat, v_name, rooms.token_hash(p_token));
    perform rooms.announce(p_room, v_name || ' joined the room');
  else
    update rooms.members set left_at = null, name = v_name where room_id = p_room and seat = v_seat;
    perform rooms.announce(p_room, v_name || ' rejoined the room');
  end if;
  return rooms.room_view(p_room, v_seat, null);
end;
$$;

create function public.room_leave(p_room uuid, p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_seat smallint := rooms.seat(p_room, p_token);
  v_name text;
begin
  if v_seat is null then
    return; -- not in the room: nothing to do
  end if;
  update rooms.members set left_at = now(), seen_at = null
  where room_id = p_room and seat = v_seat
  returning name into v_name;
  perform rooms.announce(p_room, v_name || ' left the room');
end;
$$;

revoke execute on all functions in schema rooms from public, anon, authenticated;
revoke execute on all functions in schema postmarks from public, anon, authenticated;
revoke execute on function public.room_leave(uuid, text) from public;
grant execute on function public.room_leave(uuid, text) to anon, authenticated;
