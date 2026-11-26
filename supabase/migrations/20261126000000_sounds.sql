-- Recorded sounds follow the profile. The music maker (/jam/) lets a sound be
-- recorded from the microphone, named, and played in an instrument's place.
-- They are kept here, by profile, so that every device in the same profile (a
-- guest's linked devices, or an account signed in anywhere) has the same
-- drawer of them.
--
-- A sound is what was heard, as the device made it ready (jam/sample.js): one
-- channel of 16-bit samples, a second and a half at most, how many of them
-- there are to a second, and the note that was found in it, if any. The device
-- gives each an id of its own, so that one recorded offline can be sent later.
-- The server keeps them and understands none of it.

create table rooms.sounds (
  profile_id text not null,
  id uuid not null,
  name text not null check (char_length(name) between 1 and 12),
  rate integer not null check (rate between 8000 and 96000),
  hz real check (hz > 0),
  pcm bytea not null check (octet_length(pcm) between 2 and 300000),
  made_at timestamptz not null default now(),
  primary key (profile_id, id)
);
alter table rooms.sounds enable row level security; -- no policies: reached only through the functions below

-- A profile's sounds, oldest first, without what they sound like: [{ id, name, at }], `at` in milliseconds.
create function rooms.sounds_view(p_profile text) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name,
           'at', floor(extract(epoch from s.made_at) * 1000)) order by s.made_at, s.id), '[]'::jsonb)
  from rooms.sounds s where s.profile_id = p_profile;
$$;

create function public.sounds_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return rooms.sounds_view(rooms.who(p_token));
end;
$$;

-- One sound, whole: { id, name, rate, hz, pcm }, pcm in base64. Null if the profile has no such sound.
create function public.sounds_fetch(p_token text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_profile text := rooms.who(p_token);
begin
  return (select jsonb_build_object('id', s.id, 'name', s.name, 'rate', s.rate, 'hz', s.hz,
                                    'pcm', translate(encode(s.pcm, 'base64'), E'\n', ''))
          from rooms.sounds s where s.profile_id = v_profile and s.id = p_id);
end;
$$;

-- Keep a sound, or rename one already kept (p_pcm, p_rate and p_hz are then
-- left out, and what it sounds like stays as it is). A profile keeps 24.
create function public.sounds_put(p_token text, p_id uuid, p_name text, p_rate integer default null, p_hz real default null, p_pcm text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_profile text := rooms.who(p_token);
  v_name text := rooms.clean_text(p_name, 12, 'Names');
  v_pcm bytea;
begin
  if p_id is null then
    raise exception 'That is not a sound.' using errcode = '22023';
  end if;
  if p_pcm is null then
    update rooms.sounds set name = v_name where profile_id = v_profile and id = p_id;
    return rooms.sounds_view(v_profile);
  end if;
  begin
    v_pcm := decode(p_pcm, 'base64');
  exception when others then
    raise exception 'That is not a sound.' using errcode = '22023';
  end;
  if p_rate is null or p_rate not between 8000 and 96000 or octet_length(v_pcm) not between 2 and 300000
     or octet_length(v_pcm) % 2 <> 0 or p_hz <= 0 then
    raise exception 'That is not a sound.' using errcode = '22023';
  end if;
  if not exists (select 1 from rooms.sounds where profile_id = v_profile and id = p_id)
     and (select count(*) from rooms.sounds where profile_id = v_profile) >= 24 then
    raise exception 'The drawer is full.' using errcode = '22023';
  end if;
  insert into rooms.sounds (profile_id, id, name, rate, hz, pcm) values (v_profile, p_id, v_name, p_rate, p_hz, v_pcm)
  on conflict (profile_id, id) do update set name = excluded.name, rate = excluded.rate, hz = excluded.hz, pcm = excluded.pcm;
  return rooms.sounds_view(v_profile);
end;
$$;

create function public.sounds_drop(p_token text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_profile text := rooms.who(p_token);
begin
  delete from rooms.sounds where profile_id = v_profile and id = p_id;
  return rooms.sounds_view(v_profile);
end;
$$;

revoke execute on function rooms.sounds_view(text) from public, anon, authenticated;
revoke execute on function public.sounds_get(text), public.sounds_fetch(text, uuid), public.sounds_put(text, uuid, text, integer, real, text), public.sounds_drop(text, uuid) from public;
grant execute on function public.sounds_get(text), public.sounds_fetch(text, uuid), public.sounds_put(text, uuid, text, integer, real, text), public.sounds_drop(text, uuid) to anon, authenticated;
