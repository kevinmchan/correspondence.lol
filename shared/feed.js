// What is waiting on you, across your rooms: the feed on the home page.
//
// There are two kinds of thing in it. A game played together in which it is
// your move (anyone's but whoever moved last); and an invitation: a time trial
// or a pass phrase that somebody has started and you have not finished. Games
// that are over, games you are waiting on someone else in, and phrases you
// wrote yourself are not in it.
//
// It is worked out here, from what each room already tells its own page
// (room_get), so the server needs to know nothing new.

// views: what room_get returned for each room. Returns the feed, most pressing
// first: moves, then what you have begun, then what is new; newest first in each.
//   { id, room: { id, name }, mode, kind: 'move' | 'running' | 'invite', who, found, size, hearts, finished, at }
// `who` is whoever moved last in a game played together ({ name, avatar, color }), if anyone has.
export function feedOf(views) {
  const items = [];
  for (const view of views) {
    if (!view || view.you === null || view.you === undefined || !Array.isArray(view.games)) continue; // not a member: nothing of yours here
    for (const game of view.games) {
      const item = {
        id: game.id, room: { id: view.id, name: view.name }, mode: game.mode, who: null,
        found: game.found, size: game.size, hearts: game.hearts, finished: game.finished ?? 0,
        at: Date.parse(game.updated_at) || 0,
      };
      if (game.mode === 'trial' || game.mode === 'phrase') {
        if (game.phrase_by === view.you) continue; // you wrote it: nothing to solve
        if (game.mine === 'won' || game.mine === 'lost') continue;
        items.push({ ...item, kind: game.mine === 'playing' ? 'running' : 'invite' });
      } else if (game.status === 'playing' && game.last_player !== view.you) {
        const who = Number.isInteger(game.last_player) ? view.people?.[game.last_player] : null;
        items.push({ ...item, kind: 'move', who: who ? { name: who.name, avatar: who.avatar, color: who.color } : null });
      }
    }
  }
  const order = { move: 0, running: 1, invite: 2 };
  return items.sort((a, b) => order[a.kind] - order[b.kind] || b.at - a.at);
}

// How an item reads: a short tag, a title, and a line under it.
export function wordsFor(item) {
  const hearts = '♥'.repeat(Math.max(0, item.hearts ?? 0)) + '♡'.repeat(Math.max(0, 3 - (item.hearts ?? 0)));
  const done = item.finished === 1 ? '1 finished' : `${item.finished} finished`;
  if (item.kind === 'move') {
    return {
      tag: 'Your move',
      title: item.who ? `${item.who.name} played` : 'A new game together',
      detail: `${item.found}/${item.size} posts · ${hearts}`,
    };
  }
  const name = item.mode === 'trial' ? 'Time trial' : 'Pass phrase';
  if (item.kind === 'running') {
    return { tag: 'In progress', title: name, detail: item.mode === 'trial' ? `Your clock is running · ${done}` : `You have started · ${done}` };
  }
  return { tag: 'New', title: name, detail: item.mode === 'trial' ? `A friendly race · ${done}` : `A phrase to uncover · ${done}` };
}
