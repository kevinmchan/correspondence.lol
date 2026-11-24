-- Saved beats follow the profile. Until now the music maker (/jam/) kept its
-- saved beats on the device alone. Now they are kept here as well, by profile,
-- so that every device in the same profile (a guest's linked devices, or an
-- account signed in anywhere) has the same list.
--
-- A beat is its code: the 39 characters that also go in a shared link, with
-- the whole beat written into them (jam/beat.js). The server keeps the code
-- and the name it was given, and understands neither.

create table rooms.beats (
  profile_id text not null,
  code text not null check (code ~ '^[A-Za-z0-9_-]{39}$'),
  name text not null check (char_length(name) between 1 and 30),
  saved_at timestamptz not null default now(),
  primary key (profile_id, code)
);
alter table rooms.beats enable row level security; -- no policies: reached only through the functions below

-- A profile's beats, newest first: [{ code, name, at }], `at` in milliseconds.
create function rooms.beats_view(p_profile text) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', b.code, 'name', b.name,
           'at', floor(extract(epoch from b.saved_at) * 1000)) order by b.saved_at desc, b.code), '[]'::jsonb)
  from rooms.beats b where b.profile_id = p_profile;
$$;

create function public.beats_get(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return rooms.beats_view(rooms.who(p_token));
end;
$$;

-- Save a beat, or rename one already saved. A profile keeps its 30 most
-- recent: saving a thirty-first lets the oldest go.
create function public.beats_put(p_token text, p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_profile text := rooms.who(p_token);
  v_name text := rooms.clean_text(p_name, 30, 'Names');
begin
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{39}$' then
    raise exception 'That is not a beat.' using errcode = '22023';
  end if;
  insert into rooms.beats (profile_id, code, name) values (v_profile, p_code, v_name)
  on conflict (profile_id, code) do update set name = excluded.name, saved_at = now();
  delete from rooms.beats b
    where b.profile_id = v_profile
      and b.code in (select o.code from rooms.beats o where o.profile_id = v_profile
                     order by o.saved_at desc, o.code offset 30);
  return rooms.beats_view(v_profile);
end;
$$;

create function public.beats_drop(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_profile text := rooms.who(p_token);
begin
  delete from rooms.beats where profile_id = v_profile and code = p_code;
  return rooms.beats_view(v_profile);
end;
$$;

revoke execute on function rooms.beats_view(text) from public, anon, authenticated;
revoke execute on function public.beats_get(text), public.beats_put(text, text, text), public.beats_drop(text, text) from public;
grant execute on function public.beats_get(text), public.beats_put(text, text, text), public.beats_drop(text, text) to anon, authenticated;
