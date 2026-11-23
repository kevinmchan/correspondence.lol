-- Rooms are joined with a code. Every room has its own: six characters from
-- an alphabet without look-alikes. Members see it in the room and pass it on;
-- anyone with an account types it on the home page to join.

create function rooms.new_room_code() returns text
language plpgsql set search_path = '' as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bits bigint;
  v_code text;
begin
  loop
    v_bits := ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint;
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, (v_bits & 31)::int + 1, 1);
      v_bits := v_bits >> 5;
    end loop;
    exit when not exists (select 1 from rooms.rooms where code = v_code);
  end loop;
  return v_code;
end;
$$;

revoke execute on function rooms.new_room_code() from public, anon, authenticated;

alter table rooms.rooms add column code text unique;

-- rooms from before codes each get one
do $$
declare
  r record;
begin
  for r in select id from rooms.rooms where code is null loop
    execute 'update rooms.rooms set code = rooms.new_room_code() where id = $1' using r.id;
  end loop;
end $$;

alter table rooms.rooms alter column code set default rooms.new_room_code();
alter table rooms.rooms alter column code set not null;

create function public.room_join_code(p_code text, p_name text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := translate(upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')), 'OIL', '011');
  v_room uuid;
begin
  perform rooms.check_token(p_token);
  select id into v_room from rooms.rooms where code = v_code;
  if v_room is null then
    raise exception 'No room has that code.' using errcode = 'P0001';
  end if;
  return public.room_join(v_room, p_name, p_token);
end;
$$;

revoke execute on function public.room_join_code(text, text, text) from public;
grant execute on function public.room_join_code(text, text, text) to anon, authenticated;

-- rooms.room_view gains 'code', shown to members only: see the function as
-- applied (it is otherwise unchanged from the delete_games migration).
