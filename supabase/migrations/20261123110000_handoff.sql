-- Moving to the installed app. On some phones the installed app starts with
-- empty storage, so it is a stranger to the rooms its owner joined in the
-- browser. The browser asks for a one-time code; the app hands the code in and
-- the browser's places in its rooms become the app's. Only a hash of the code
-- is kept, it works once, and it stops working after 30 days.

create table rooms.handoffs (
  code_hash text primary key,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz
);

alter table rooms.handoffs enable row level security;
create index handoffs_by_device on rooms.handoffs (token_hash, created_at);

-- Eight characters from an alphabet without look-alikes (no I, L, O or U).
create function public.handoff_start(p_token text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := rooms.token_hash(p_token);
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bits bigint;
  v_code text := '';
begin
  perform rooms.check_token(p_token);
  if (select count(*) from rooms.handoffs h where h.token_hash = v_hash and h.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many codes for one day. Try again tomorrow.' using errcode = 'P0001';
  end if;
  v_bits := ('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))::bit(40)::bigint;
  for i in 1..8 loop
    v_code := v_code || substr(v_alphabet, (v_bits & 31)::int + 1, 1);
    v_bits := v_bits >> 5;
  end loop;
  insert into rooms.handoffs (code_hash, token_hash) values (rooms.token_hash(v_code), v_hash);
  return v_code;
end;
$$;

-- Hand a code in: the places it stands for now belong to this device. Returns
-- those rooms, and the name and look to carry on with.
create function public.handoff_claim(p_code text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_new text := rooms.token_hash(p_token);
  v_code text := translate(upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')), 'OIL', '011');
  h rooms.handoffs;
  v_result jsonb;
begin
  perform rooms.check_token(p_token);
  select * into h from rooms.handoffs
    where code_hash = rooms.token_hash(v_code) and used_at is null and expires_at > now() for update;
  if not found then
    raise exception 'That code is not valid any more.' using errcode = 'P0001';
  end if;
  if h.token_hash <> v_new then
    update rooms.members m set token_hash = v_new
      where m.token_hash = h.token_hash
        and not exists (select 1 from rooms.members mine where mine.room_id = m.room_id and mine.token_hash = v_new);
  end if;
  update rooms.handoffs set used_at = now() where code_hash = h.code_hash;
  select jsonb_build_object(
    'rooms', coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by m.seen_at desc nulls last), '[]'::jsonb),
    'name', (array_agg(m.name order by m.seen_at desc nulls last))[1],
    'avatar', (array_agg(m.avatar order by m.seen_at desc nulls last))[1],
    'color', (array_agg(m.color order by m.seen_at desc nulls last))[1])
    into v_result
    from rooms.members m join rooms.rooms r on r.id = m.room_id
    where m.token_hash = v_new and m.left_at is null;
  return v_result;
end;
$$;

revoke execute on function public.handoff_start(text) from public;
grant execute on function public.handoff_start(text) to anon, authenticated;
revoke execute on function public.handoff_claim(text, text) from public;
grant execute on function public.handoff_claim(text, text) to anon, authenticated;
