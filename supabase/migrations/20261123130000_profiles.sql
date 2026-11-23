-- Global profiles. Until now a person was a device: each browser's secret was
-- its own identity, with a name and look per room. Now a person is a profile,
-- and a device is only a way in to one.
--
--   * A guest profile needs no sign-in. A new device is a guest by itself.
--     Another device can join the same guest profile with a temporary code.
--   * An account is a profile tied to a sign-in (an email address, proved with
--     a code sent to it). A guest profile can be converted into an account at
--     any time and keeps everything. From then on the only way in is to sign
--     in: its other devices are signed out, and no codes are given for it.
--   * Signing in to an existing account from a guest profile merges the
--     guest's rooms into the account.
--
-- rooms.members.token_hash keeps its name but now holds the profile's id. For
-- everyone who was here before, that id is the hash of their device's secret,
-- so no existing row changes: a device with no row in rooms.devices simply is
-- the guest profile of the same id.

create table rooms.profiles (
  id text primary key,
  name text,
  avatar text check (char_length(avatar) between 1 and 8),
  color smallint check (color between 0 and 7),
  user_id uuid unique,             -- the sign-in it belongs to, once converted
  email text,
  created_at timestamptz not null default now(),
  converted_at timestamptz
);

create table rooms.devices (
  token_hash text primary key,
  profile_id text,                 -- null: signed out, waiting to sign in or start afresh
  linked_at timestamptz not null default now()
);

alter table rooms.profiles enable row level security;
alter table rooms.devices enable row level security;
create index devices_by_profile on rooms.devices (profile_id);

-- Which profile a device (by the hash of its secret) is in. Null: signed out.
create function rooms.profile_of(p_hash text) returns text
language sql stable set search_path = '' as $$
  select case when exists (select 1 from rooms.devices d where d.token_hash = p_hash)
    then (select d.profile_id from rooms.devices d where d.token_hash = p_hash)
    else p_hash end;
$$;

-- The same from the secret itself, refusing a device that is signed out.
create function rooms.who(p_token text) returns text
language plpgsql stable set search_path = '' as $$
declare
  v_profile text;
begin
  perform rooms.check_token(p_token);
  v_profile := rooms.profile_of(rooms.token_hash(p_token));
  if v_profile is null then
    raise exception 'You are signed out on this device.' using errcode = 'P0001';
  end if;
  return v_profile;
end;
$$;

create function rooms.is_account(p_profile text) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from rooms.profiles p where p.id = p_profile and p.user_id is not null);
$$;

create function rooms.point_device(p_hash text, p_profile text) returns void
language sql set search_path = '' as $$
  insert into rooms.devices (token_hash, profile_id) values (p_hash, p_profile)
  on conflict (token_hash) do update set profile_id = excluded.profile_id, linked_at = now();
$$;

-- One profile takes in another: its places in rooms (where the first has none
-- already) and, when the first is a guest profile, its devices. Devices of a
-- profile taken in by an account are signed out instead, except p_keep.
create function rooms.absorb(p_from text, p_into text, p_keep text) returns void
language plpgsql set search_path = '' as $$
declare
  v_others text := case when rooms.is_account(p_into) then null else p_into end;
begin
  if p_from is null or p_from = p_into then
    return;
  end if;
  update rooms.members m set token_hash = p_into
    where m.token_hash = p_from
      and not exists (select 1 from rooms.members mine where mine.room_id = m.room_id and mine.token_hash = p_into);
  update rooms.devices set profile_id = v_others, linked_at = now()
    where profile_id = p_from and token_hash <> p_keep;
  if p_from <> p_keep and not exists (select 1 from rooms.devices where token_hash = p_from) then
    perform rooms.point_device(p_from, v_others); -- the device the profile began on
  end if;
  update rooms.profiles into_p
    set name = coalesce(into_p.name, from_p.name), avatar = coalesce(into_p.avatar, from_p.avatar),
        color = coalesce(into_p.color, from_p.color)
    from rooms.profiles from_p where into_p.id = p_into and from_p.id = p_from;
end;
$$;

-- What a device is told about its profile.
create function rooms.profile_view(p_profile text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'signed_in', coalesce(p.user_id is not null, false),
    'email', p.email,
    'name', coalesce(p.name, (select m.name from rooms.members m where m.token_hash = p_profile
                              order by m.seen_at desc nulls last, m.joined_at desc limit 1)),
    'avatar', coalesce(p.avatar, (select m.avatar from rooms.members m where m.token_hash = p_profile and m.avatar is not null
                              order by m.seen_at desc nulls last, m.joined_at desc limit 1)),
    'color', coalesce(p.color, (select m.color from rooms.members m where m.token_hash = p_profile and m.color is not null
                              order by m.seen_at desc nulls last, m.joined_at desc limit 1)),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name,
                              'at', floor(extract(epoch from coalesce(m.seen_at, m.joined_at)) * 1000))
                              order by coalesce(m.seen_at, m.joined_at) desc)
                       from rooms.members m join rooms.rooms r on r.id = m.room_id
                       where m.token_hash = p_profile and m.left_at is null), '[]'::jsonb))
  from (select 1) one left join rooms.profiles p on p.id = p_profile;
$$;

-- Name and look belong to the profile and show the same in every room.
create function rooms.save_profile(p_profile text, p_name text, p_avatar text, p_color integer) returns void
language plpgsql set search_path = '' as $$
declare
  v_name text := rooms.clean_text(p_name, 20, 'Names');
  v_avatar text := btrim(coalesce(p_avatar, ''));
  m record;
begin
  if char_length(v_avatar) < 1 or char_length(v_avatar) > 8 then
    raise exception 'Pick an avatar.' using errcode = '22023';
  end if;
  if p_color is null or p_color < 0 or p_color > 7 then
    raise exception 'Pick a colour.' using errcode = '22023';
  end if;
  insert into rooms.profiles (id, name, avatar, color) values (p_profile, v_name, v_avatar, p_color)
  on conflict (id) do update set name = excluded.name, avatar = excluded.avatar, color = excluded.color;
  for m in select room_id, seat, name from rooms.members
           where token_hash = p_profile and left_at is null for update loop
    update rooms.members set name = v_name, avatar = v_avatar, color = p_color
      where room_id = m.room_id and seat = m.seat;
    if m.name is distinct from v_name then
      perform rooms.announce(m.room_id, m.name || ' is now ' || v_name);
    else
      perform realtime.send('{}'::jsonb, 'changed', 'room:' || m.room_id::text, false);
    end if;
  end loop;
end;
$$;

revoke execute on function rooms.profile_of(text), rooms.who(text), rooms.is_account(text),
  rooms.point_device(text, text), rooms.absorb(text, text, text), rooms.profile_view(text),
  rooms.save_profile(text, text, text, integer) from public, anon, authenticated;

-- --- Rooms now go by profile -------------------------------------------------

create or replace function rooms.seat(p_room uuid, p_token text) returns smallint
language sql stable set search_path = '' as $$
  select m.seat from rooms.members m
  where p_token is not null and m.room_id = p_room
    and m.token_hash = rooms.profile_of(rooms.token_hash(p_token))
    and m.left_at is null;
$$;

create or replace function public.room_seen(p_room uuid, p_token text, p_here boolean default true) returns void
language sql security definer set search_path = '' as $$
  update rooms.members
  set seen_at = case when p_here then now() end
  where room_id = p_room and token_hash = rooms.profile_of(rooms.token_hash(p_token));
$$;

create or replace function public.room_create(p_room_name text, p_name text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room_name text := rooms.clean_text(p_room_name, 40, 'Room names');
  v_me text := rooms.who(p_token);
  v_name text;
  v_room uuid;
begin
  select name into v_name from rooms.profiles where id = v_me;
  v_name := coalesce(v_name, rooms.clean_text(p_name, 20, 'Names'));
  insert into rooms.profiles (id, name) values (v_me, v_name)
  on conflict (id) do update set name = coalesce(rooms.profiles.name, excluded.name);
  insert into rooms.rooms (name) values (v_room_name) returning id into v_room;
  insert into rooms.members (room_id, seat, name, token_hash, avatar, color)
  select v_room, 0, v_name, v_me, p.avatar, p.color from rooms.profiles p where p.id = v_me;
  perform rooms.announce(v_room, v_name || ' opened the room');
  return rooms.room_view(v_room, 0::smallint, null);
end;
$$;

create or replace function public.room_join(p_room uuid, p_name text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me text := rooms.who(p_token);
  v_name text;
  v_seat smallint;
  v_left timestamptz;
begin
  perform 1 from rooms.rooms where id = p_room for update;
  if not found then
    raise exception 'Room not found.' using errcode = 'P0002';
  end if;
  select m.seat, m.left_at into v_seat, v_left from rooms.members m
  where m.room_id = p_room and m.token_hash = v_me;
  if v_seat is not null and v_left is null then
    return rooms.room_view(p_room, v_seat, null);
  end if;
  if (select count(*) from rooms.members where room_id = p_room and left_at is null) >= 12 then
    raise exception 'This room is full.' using errcode = 'P0001';
  end if;
  select name into v_name from rooms.profiles where id = v_me;
  v_name := coalesce(v_name, rooms.clean_text(p_name, 20, 'Names'));
  insert into rooms.profiles (id, name) values (v_me, v_name)
  on conflict (id) do update set name = coalesce(rooms.profiles.name, excluded.name);
  if v_seat is null then
    select count(*) into v_seat from rooms.members where room_id = p_room;
    insert into rooms.members (room_id, seat, name, token_hash, avatar, color)
    select p_room, v_seat, v_name, v_me, p.avatar, p.color from rooms.profiles p where p.id = v_me;
    perform rooms.announce(p_room, v_name || ' joined the room');
  else
    update rooms.members m set left_at = null, name = v_name,
        avatar = coalesce(p.avatar, m.avatar), color = coalesce(p.color, m.color)
      from rooms.profiles p where p.id = v_me and m.room_id = p_room and m.seat = v_seat;
    perform rooms.announce(p_room, v_name || ' rejoined the room');
  end if;
  return rooms.room_view(p_room, v_seat, null);
end;
$$;

-- Changing your profile from inside a room changes it everywhere.
create or replace function public.room_profile(p_room uuid, p_token text, p_name text, p_avatar text, p_color integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_seat smallint := rooms.seat(p_room, p_token);
begin
  if v_seat is null then
    raise exception 'Join the room first.' using errcode = 'P0001';
  end if;
  perform rooms.save_profile(rooms.who(p_token), p_name, p_avatar, p_color);
  return rooms.room_view(p_room, v_seat, null);
end;
$$;

-- Notifications reach every device of a member's profile.
create or replace function rooms.notify(p_room uuid, p_actor smallint, p_body text, p_url text, p_tag text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_subs jsonb;
begin
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
  into v_subs
  from rooms.members m
  join rooms.push_subscriptions s on rooms.profile_of(s.token_hash) = m.token_hash and s.gone_at is null
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

-- --- The profile itself ------------------------------------------------------

create function public.profile_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me text;
begin
  perform rooms.check_token(p_token);
  v_me := rooms.profile_of(rooms.token_hash(p_token));
  if v_me is null then
    return jsonb_build_object('signed_out', true);
  end if;
  return rooms.profile_view(v_me);
end;
$$;

create function public.profile_save(p_token text, p_name text, p_avatar text, p_color integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me text := rooms.who(p_token);
begin
  perform rooms.save_profile(v_me, p_name, p_avatar, p_color);
  return rooms.profile_view(v_me);
end;
$$;

-- A temporary code that lets another device into this guest profile: eight
-- characters, good for ten minutes. (The install guide's code, from
-- handoff_start, is the same thing with a longer life.)
create function rooms.new_code(p_profile_device text, p_life interval) returns text
language plpgsql set search_path = '' as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bits bigint;
  v_code text := '';
begin
  if rooms.profile_of(p_profile_device) is null then
    raise exception 'You are signed out on this device.' using errcode = 'P0001';
  end if;
  if rooms.is_account(rooms.profile_of(p_profile_device)) then
    raise exception 'This profile is signed in: sign in on the other device instead.' using errcode = 'P0001';
  end if;
  if (select count(*) from rooms.handoffs h where h.token_hash = p_profile_device and h.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many codes for one day. Try again tomorrow.' using errcode = 'P0001';
  end if;
  v_bits := ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))::bit(40)::bigint;
  for i in 1..8 loop
    v_code := v_code || substr(v_alphabet, (v_bits & 31)::int + 1, 1);
    v_bits := v_bits >> 5;
  end loop;
  insert into rooms.handoffs (code_hash, token_hash, expires_at)
  values (rooms.token_hash(v_code), p_profile_device, now() + p_life);
  return v_code;
end;
$$;

revoke execute on function rooms.new_code(text, interval) from public, anon, authenticated;

create function public.profile_code(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform rooms.check_token(p_token);
  return rooms.new_code(rooms.token_hash(p_token), interval '10 minutes');
end;
$$;

create or replace function public.handoff_start(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform rooms.check_token(p_token);
  return rooms.new_code(rooms.token_hash(p_token), interval '30 days');
end;
$$;

-- Hand a code in: this device joins the guest profile the code came from. If
-- it was a guest with rooms of its own, they come along. The device that
-- first uses a code may use it again; to any other it is spent.
create or replace function public.handoff_claim(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_device text := rooms.token_hash(p_token);
  v_code text := translate(upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')), 'OIL', '011');
  h rooms.handoffs;
  v_mine text;
  v_theirs text;
begin
  perform rooms.check_token(p_token);
  select * into h from rooms.handoffs
    where code_hash = rooms.token_hash(v_code) and expires_at > now()
      and (used_at is null or claimed_by = v_device
        or (claimed_by is null and used_at < timestamptz '2026-11-24 00:00:00+00'))
    for update;
  if not found then
    raise exception 'That code is not valid any more.' using errcode = 'P0001';
  end if;
  v_theirs := rooms.profile_of(h.token_hash);
  v_mine := rooms.profile_of(v_device);
  if v_theirs is null or rooms.is_account(v_theirs) then
    raise exception 'That profile now needs signing in.' using errcode = 'P0001';
  end if;
  if v_mine is distinct from v_theirs then
    if rooms.is_account(v_mine) then
      raise exception 'Sign out first.' using errcode = 'P0001';
    end if;
    perform rooms.absorb(v_mine, v_theirs, v_device);
    perform rooms.point_device(v_device, v_theirs);
  end if;
  update rooms.handoffs
    set used_at = coalesce(used_at, now()), claimed_by = v_device,
        expires_at = greatest(expires_at, now() + interval '30 days')
    where code_hash = h.code_hash;
  return rooms.profile_view(v_theirs);
end;
$$;

-- After proving an email address (the request carries the sign-in), tie this
-- device to that account. The first time, the device's guest profile becomes
-- the account. After that, the device joins the account and brings its guest
-- rooms with it.
create function public.profile_sign_in(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_device text := rooms.token_hash(p_token);
  v_mine text;
  v_account text;
begin
  perform rooms.check_token(p_token);
  if v_user is null then
    raise exception 'Sign in first.' using errcode = 'P0001';
  end if;
  v_mine := rooms.profile_of(v_device);
  select id into v_account from rooms.profiles where user_id = v_user for update;
  if v_account is null and v_mine is not null and not rooms.is_account(v_mine) then
    -- convert: this guest profile is the account from now on
    v_account := v_mine;
    insert into rooms.profiles (id, user_id, email, converted_at) values (v_account, v_user, v_email, now())
    on conflict (id) do update set user_id = excluded.user_id, email = excluded.email, converted_at = now();
    update rooms.devices set profile_id = null, linked_at = now()
      where profile_id = v_account and token_hash <> v_device;
    if v_account <> v_device and not exists (select 1 from rooms.devices where token_hash = v_account) then
      perform rooms.point_device(v_account, null);
    end if;
  elsif v_account is null then
    -- nothing to convert (signed out, or on another account): a new, empty account
    v_account := 'account:' || v_user::text;
    insert into rooms.profiles (id, user_id, email, converted_at) values (v_account, v_user, v_email, now());
  else
    update rooms.profiles set email = v_email where id = v_account;
    if v_mine is not null and v_mine <> v_account and not rooms.is_account(v_mine) then
      perform rooms.absorb(v_mine, v_account, v_device);
    end if;
  end if;
  perform rooms.point_device(v_device, v_account);
  return rooms.profile_view(v_account);
end;
$$;

-- Leave the profile on this device. The device then signs in again or starts
-- afresh as a new guest (with a new secret).
create function public.profile_sign_out(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform rooms.check_token(p_token);
  perform rooms.point_device(rooms.token_hash(p_token), null);
end;
$$;

revoke execute on function public.profile_get(text), public.profile_save(text, text, text, integer),
  public.profile_code(text), public.profile_sign_in(text), public.profile_sign_out(text) from public;
grant execute on function public.profile_get(text), public.profile_save(text, text, text, integer),
  public.profile_code(text), public.profile_sign_in(text), public.profile_sign_out(text) to anon, authenticated;
