-- A shared beat brings its sounds with it. The music maker's deck can hold
-- recorded sounds (rooms.sounds) beside its instruments, and somebody who is
-- sent a beat should hear it as it was made. A beat is still its code, written
-- into the link; what a share adds is a copy of the sounds that were on the
-- deck when it was shared, kept here under an id that goes in the link too.
-- Whoever opens the link is given them. The copy is the sharer's sounds as
-- they were: deleting or renaming one afterwards changes nothing shared.
--
-- And a beat's code may now be the longer one (76 characters: jam/beat.js),
-- for a beat with notes for the sounds beside the instruments.

alter table rooms.beats drop constraint beats_code_check;
alter table rooms.beats add constraint beats_code_check check (code ~ '^([A-Za-z0-9_-]{39}|[A-Za-z0-9_-]{76})$');

create or replace function public.beats_put(p_token text, p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_profile text := rooms.who(p_token);
  v_name text := rooms.clean_text(p_name, 30, 'Names');
begin
  if p_code is null or p_code !~ '^([A-Za-z0-9_-]{39}|[A-Za-z0-9_-]{76})$' then
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

create table rooms.shares (
  id text primary key check (id ~ '^[0-9a-f]{20}$'),
  profile_id text not null,
  made_at timestamptz not null default now()
);
create index shares_by_profile on rooms.shares (profile_id, made_at desc);
-- The sounds of a share: which place on the deck each was in (0 to 7), and the sound itself.
create table rooms.share_sounds (
  share_id text not null references rooms.shares (id) on delete cascade,
  slot smallint not null check (slot between 0 and 7),
  sound_id uuid not null,
  name text not null,
  rate integer not null,
  hz real,
  pcm bytea not null,
  primary key (share_id, slot)
);
alter table rooms.shares enable row level security; -- no policies: reached only through the functions below
alter table rooms.share_sounds enable row level security;

-- Share the sounds on a deck: p_slots is the eight places of the deck in
-- order, each the id of one of the caller's sounds or null. Returns the id
-- that goes in the link, or null if none of them is a sound of theirs. A
-- profile's twenty most recent shares are kept: a link older than that still
-- has its beat in it, and is played by the instruments.
create function public.share_put(p_token text, p_slots uuid[]) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_profile text := rooms.who(p_token);
  v_id text := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
  v_found integer;
begin
  if p_slots is null or coalesce(array_length(p_slots, 1), 0) > 8 then
    raise exception 'That is not a deck.' using errcode = '22023';
  end if;
  insert into rooms.shares (id, profile_id) values (v_id, v_profile);
  insert into rooms.share_sounds (share_id, slot, sound_id, name, rate, hz, pcm)
    select v_id, (t.place - 1)::smallint, s.id, s.name, s.rate, s.hz, s.pcm
    from unnest(p_slots) with ordinality as t(sound, place)
    join rooms.sounds s on s.profile_id = v_profile and s.id = t.sound;
  get diagnostics v_found = row_count;
  if v_found = 0 then
    delete from rooms.shares where id = v_id;
    return null;
  end if;
  delete from rooms.shares h
    where h.profile_id = v_profile
      and h.id in (select o.id from rooms.shares o where o.profile_id = v_profile order by o.made_at desc, o.id offset 20);
  return v_id;
end;
$$;

-- The sounds of a share, for whoever has its link: [{ slot, id, name, rate, hz, pcm }], pcm in base64. Empty if there is no such share.
create function public.share_get(p_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slot', s.slot, 'id', s.sound_id, 'name', s.name, 'rate', s.rate, 'hz', s.hz,
           'pcm', translate(encode(s.pcm, 'base64'), E'\n', '')) order by s.slot), '[]'::jsonb)
  from rooms.share_sounds s where s.share_id = p_id;
$$;

revoke execute on function public.share_put(text, uuid[]), public.share_get(text) from public;
grant execute on function public.share_put(text, uuid[]), public.share_get(text) to anon, authenticated;
