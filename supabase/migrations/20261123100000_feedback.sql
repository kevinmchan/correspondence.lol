-- Feedback from players: an optional rating out of five and an optional note,
-- sent from the screen at the end of a game or from the how-to screen. Read it
-- in the dashboard (table rooms.feedback); the app itself never reads it back.

create table rooms.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  token_hash text not null,          -- which device, to limit floods; not a name
  game_id uuid,                      -- the room game it was about, if any
  mode text,                         -- solo, coop, trial or phrase
  outcome text,                      -- won or lost, when sent at the end of a game
  rating smallint check (rating between 1 and 5),
  message text check (char_length(message) <= 2000),
  app_version text,
  check (rating is not null or message is not null)
);

alter table rooms.feedback enable row level security;
create index feedback_by_device on rooms.feedback (token_hash, created_at);

create function public.feedback_send(
  p_token text, p_rating smallint default null, p_message text default null,
  p_game uuid default null, p_mode text default null, p_outcome text default null, p_version text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text := rooms.token_hash(p_token);
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  perform rooms.check_token(p_token);
  if p_rating is null and v_message is null then
    raise exception 'Pick a rating or write a note first.' using errcode = 'P0001';
  end if;
  if p_rating is not null and p_rating not between 1 and 5 then
    raise exception 'A rating is from 1 to 5.' using errcode = 'P0001';
  end if;
  if char_length(v_message) > 2000 then
    raise exception 'That note is too long (2000 characters at most).' using errcode = 'P0001';
  end if;
  if (select count(*) from rooms.feedback f where f.token_hash = v_hash and f.created_at > now() - interval '1 day') >= 30 then
    raise exception 'Thank you — that is plenty of feedback for one day.' using errcode = 'P0001';
  end if;
  insert into rooms.feedback (token_hash, game_id, mode, outcome, rating, message, app_version)
  values (
    v_hash, p_game,
    case when p_mode in ('solo', 'coop', 'trial', 'phrase') then p_mode end,
    case when p_outcome in ('won', 'lost') then p_outcome end,
    p_rating, v_message, left(p_version, 16)
  );
end;
$$;

revoke execute on function public.feedback_send(text, smallint, text, uuid, text, text, text) from public;
grant execute on function public.feedback_send(text, smallint, text, uuid, text, text, text) to anon, authenticated;
