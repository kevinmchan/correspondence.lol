-- Pass phrase: whoever wrote the phrase can try their own board. Their run is
-- marked as practice: it is not on the leaderboard, not counted among those
-- who have finished, and not announced in the room's chat.

alter table postmarks.runs add column practice boolean not null default false;

-- postmarks_trial_start no longer turns the author away: it starts them a
-- practice run (practice = the game has an author and it is this player).
-- postmarks.announce_run returns at once for a practice run.
-- postmarks.game_view leaves practice runs out of 'runs' and tells a player
--   whether their own run is one ('practice').
-- rooms.room_view leaves practice runs out of each game's 'finished' count
--   and 'mine' status.
-- (Each is otherwise unchanged; see the functions as applied.)
