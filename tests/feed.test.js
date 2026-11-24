import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedOf, wordsFor } from '../shared/feed.js';

const people = [{ name: 'Sam', avatar: '🦊', color: 1 }, { name: 'Ada', avatar: '🐼', color: 2 }];
const game = (over) => ({ id: 'g', kind: 'postmarks', mode: 'coop', size: 5, status: 'playing', hearts: 3, moves: 0, found: 0, last_player: null, phrase_by: null, finished: 0, mine: null, updated_at: '2026-11-24T10:00:00Z', ...over });
const room = (games, you = 0) => ({ id: 'r', name: 'Book club', you, people, games });

test('a game together is in the feed when it is your move, and only then', () => {
  assert.equal(feedOf([room([game({ last_player: 1 })])]).length, 1, 'someone else moved last');
  assert.equal(feedOf([room([game({ last_player: null })])]).length, 1, 'nobody has moved yet');
  assert.equal(feedOf([room([game({ last_player: 0 })])]).length, 0, 'you moved last');
  assert.equal(feedOf([room([game({ last_player: 1, status: 'won' })])]).length, 0, 'it is over');
  const [item] = feedOf([room([game({ last_player: 1, found: 2, hearts: 2 })])]);
  assert.equal(item.kind, 'move');
  assert.equal(item.who.name, 'Ada');
  assert.deepEqual(wordsFor(item), { tag: 'Your move', title: 'Ada played', detail: '2/5 posts · ♥♥♡' });
});

test('a time trial or a pass phrase is an invitation until you have finished it', () => {
  const kinds = (over) => feedOf([room([game({ mode: 'trial', ...over })])]).map((item) => item.kind);
  assert.deepEqual(kinds({ mine: null }), ['invite']);
  assert.deepEqual(kinds({ mine: 'playing' }), ['running']);
  assert.deepEqual(kinds({ mine: 'won' }), []);
  assert.deepEqual(kinds({ mine: 'lost' }), []);
  assert.deepEqual(feedOf([room([game({ mode: 'phrase', phrase_by: 0 })])]), [], 'a phrase you wrote yourself');
  assert.equal(wordsFor(feedOf([room([game({ mode: 'phrase', finished: 1 })])])[0]).detail, 'A phrase to uncover · 1 finished');
});

test('moves come first, then what you have begun, then what is new; and rooms you are not in are left out', () => {
  const games = [
    game({ id: 'new', mode: 'trial', updated_at: '2026-11-24T12:00:00Z' }),
    game({ id: 'old-move', last_player: 1, updated_at: '2026-11-24T08:00:00Z' }),
    game({ id: 'begun', mode: 'phrase', mine: 'playing' }),
    game({ id: 'move', last_player: 1, updated_at: '2026-11-24T11:00:00Z' }),
  ];
  assert.deepEqual(feedOf([room(games)]).map((item) => item.id), ['move', 'old-move', 'begun', 'new']);
  assert.deepEqual(feedOf([room(games, null), null, { id: 'x', name: 'x', you: 0, games: null }]), []);
});
