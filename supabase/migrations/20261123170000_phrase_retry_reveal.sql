-- Pass phrase: out of hearts is no longer the end. The player chooses between
-- trying the board again and having the phrase revealed. Until they choose to
-- reveal it, a lost run keeps its secrets (the phrase and where the posts
-- were), so a second try is a fair one. Each run counts its tries.

alter table postmarks.runs
  add column revealed_at timestamptz,
  add column tries smallint not null default 1;

-- postmarks.game_view: as before, except that
--   * a lost pass-phrase run shows the solution, the phrase and all its tokens
--     only once revealed_at is set;
--   * your own run carries 'tries' and 'revealed', and each run in 'runs'
--     carries 'tries'.
-- (The function is otherwise unchanged from the phrase_tokens migration; see
-- it as applied.)

create function public.postmarks_reveal(p_game uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g postmarks.games;
  v_me smallint;
begin
  select * into g from postmarks.games where id = p_game and deleted_at is null;
  if not found then
    raise exception 'Game not found.' using errcode = 'P0002';
  end if;
  v_me := rooms.seat(g.room_id, p_token);
  if v_me is null then
    raise exception 'Join the room first.' using errcode = 'P0001';
  end if;
  update postmarks.runs set revealed_at = coalesce(revealed_at, now())
    where game_id = p_game and seat = v_me and status = 'lost';
  return postmarks.game_view(g, v_me);
end;
$$;

create function public.postmarks_retry(p_game uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g postmarks.games;
  r postmarks.runs;
  v_me smallint;
begin
  select * into g from postmarks.games where id = p_game and deleted_at is null;
  if not found then
    raise exception 'Game not found.' using errcode = 'P0002';
  end if;
  v_me := rooms.seat(g.room_id, p_token);
  if v_me is null then
    raise exception 'Join the room first.' using errcode = 'P0001';
  end if;
  if g.mode <> 'phrase' then
    raise exception 'Only a pass phrase can be tried again.' using errcode = 'P0001';
  end if;
  select * into r from postmarks.runs where game_id = p_game and seat = v_me for update;
  if not found or r.status <> 'lost' then
    raise exception 'There is nothing to try again.' using errcode = 'P0001';
  end if;
  if r.revealed_at is not null then
    raise exception 'You have seen the phrase, so this one is finished.' using errcode = 'P0001';
  end if;
  update postmarks.runs
    set cells = array_fill(0::smallint, array[g.size * g.size]), hearts = 3, moves = 0, status = 'playing',
        last = null, started_at = now(), finished_at = null, tries = r.tries + 1
    where game_id = p_game and seat = v_me;
  return postmarks.game_view(g, v_me);
end;
$$;

revoke execute on function public.postmarks_reveal(uuid, text), public.postmarks_retry(uuid, text) from public;
grant execute on function public.postmarks_reveal(uuid, text), public.postmarks_retry(uuid, text) to anon, authenticated;
