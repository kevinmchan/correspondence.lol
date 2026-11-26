import { folk as meadowFolk, wearing } from '/shared/meadow.js';
import { troupe } from '/room/folk.js';
import { roam } from '/room/roam.js';
import { ask, tell } from '/shared/ask.js';
import { rpc } from '/shared/api.js';
import { go } from '/shared/nav.js';
import { createChat } from '/shared/chat.js';
import { pollDelay, watchRoom } from '/shared/live.js';
import { avatar, openProfile, paint, randomLook, saveLook, savedLook } from '/shared/profile.js';
import { enablePush, pushState, syncPush, watchPresence } from '/shared/push.js';
import { copyable } from '/shared/handoff.js';
import { UUID, forgetRoom, gameUrl, myName, myToken, rememberRoom, save, setMyName } from '/shared/identity.js';
import { generatePuzzle, phraseBoardSize, phraseProblem, randomSize, tidyPhrase, tokenize } from '/postmarks/game.js';
import { boardPreview, door, miniBoard, oops, roomClass } from '/shared/place.js';
import { HOWTO_KEY, modeCards } from '/postmarks/howto.js';
import { twoWorlds } from '/room/worlds.js';

// A room's screen. mount() puts it to work in `root`, a fresh copy of its
// template; everything it starts ends with `life` (see shared/screen.js).
//
// A room is drawn as a building on the map, seen from above (room/room.css):
// with its roof off for the people in it, and with its roof on for anybody
// else. What is made here is what goes in it: the tokens of the people at its
// table, and the games on the table as a shelf of cards, each the way into
// its game, with a round button at its end that carries the kind of game.
//
// It is a quiet room, and one thing in it is loud: what is waiting on you. The
// first game that is yours to play comes first, its card lit under a lamp, its
// board in full colour and its button the seal's colour, breathing; any
// others yours to play follow, their boards in full colour and their buttons
// seal-tinted but still; the rest lie below, quieter, and the finished ones
// quieter still. Nothing on the table is written: where a game stands is said
// by its card, and in words to screen readers.
export function mount(root, life) {

  const $ = (id) => root.querySelector(`#${id}`);
  const { setTimeout } = life; // timers that stop when the screen leaves
  const el = {
    name: $('room-name'), nameError: $('name-error'), loading: $('loading'), roomError: $('room-error'),
    join: $('join'), joinText: $('join-text'), joinForm: $('join-form'), joinName: $('join-name'), joinError: $('join-error'),
    house: $('house'), room: $('room'), members: $('members'), profile: $('profile'), joinFaces: $('join-faces'), joinTable: $('join-table'), joinYou: $('join-you'),
    notify: $('notify'), notifyText: $('notify-text'), notifyButton: $('notify-button'), notifyError: $('notify-error'),
    roomCode: $('room-code'), shareButton: $('share-button'),
    games: $('games'), noGames: $('no-games'), tidy: $('tidy'), table: root.querySelector('.table'),
    modes: $('modes'), modeNote: $('mode-note'), compose: $('compose'), phraseForm: $('phrase-form'), phraseText: $('phrase-text'),
    phraseError: $('phrase-error'), phraseBack: $('phrase-back'), tokens: $('tokens'), tokenNote: $('token-note'), gameError: $('game-error'),
    deskIcon: $('desk-icon'), deskName: $('desk-name'), phraseAsk: $('phrase-ask'), phraseField: $('phrase-field'), previewBoard: $('preview-board'), redraw: $('redraw'),
    deskHow: $('desk-how'), deskBoard: $('desk-board'), modeCards: $('mode-cards'), deskNext: $('desk-next'), randomPhrase: $('random-phrase'),
    chat: $('chat'), leave: $('leave'), more: $('more'), moreMenu: $('more-menu'), rename: $('rename'),
  };

  const requested = new URLSearchParams(location.search).get('id');
  const roomId = requested && UUID.test(requested) ? requested.toLowerCase() : null;

  // Arriving from a shared game link: once in the room, go on to that game.
  const wantedGame = new URLSearchParams(location.search).get('game');
  const nextGame = wantedGame && UUID.test(wantedGame) ? wantedGame.toLowerCase() : null;

  let room = null; // the server's latest view of the room
  let chat = null;
  let unread = 0;
  let timer = null;
  let watcher = null; // live updates, once we are a member
  let composing = false; // a desk is showing in place of the room, to set up a game
  let deskMode = null; // which kind of game the desk is setting up
  let puzzle = null; // the board drawn for it: { size, seed, regions, solution }
  let present = false; // telling the server this room is on screen

  // The building keeps one of the game's colours, by its id: its walls here, its roof on the home page.
  if (roomId) root.classList.add(roomClass(roomId));
  // The meadow, once the first bar of energy has earned it, unless it has been taken off (shared/meadow.js, room/meadow.css).
  root.classList.toggle('meadow', wearing());
  // A portal in the top bar, for a member: the way into the room's other world, and back (room/worlds.js).
  const worlds = twoWorlds(root, life, $('worlds'));
  // Whoever has come to the door, as they will go in: the look their profile has, or the one last chosen on this device, or
  // for somebody new one picked now (which is then theirs: see the door, below).
  let myLook = savedLook();
  const picked = !myLook; // (nobody's choice yet: it may be picked again, so as not to be a face already in the room)
  paint(el.joinYou, myLook ??= randomLook());

  // The meadow's folk (room/folk.js, shared/meadow.js). In the meadow of the first bar the things of a room are things.
  // With the second bar filled it is found that energy runs through all of them and that they were alive all along,
  // asleep: a tile that starts a game is a flower, the code a hedgehog, the bell a bluebell, a note a butterfly, the
  // send button a bird, the people's tokens have feet, a game's board is a little cartoon with gloves and big shoes,
  // and the name is held up by a field mouse; a current goes through them, one after another. The third bar wakes
  // them. They are drawn on the page itself and only while it is the meadow that is seen: not in the night through
  // the portal, nor while a passage is under way (room/worlds.js copies the page then, and would copy every blink).
  const meadow = meadowFolk();
  if (meadow.kinds.length) {
    const here = ':scope > main ';
    const CAST = [
      ['board', `${here}#games > li`, { face: (li) => li.querySelector('.mini'), key: (li) => `board:${li.querySelector('a.game')?.getAttribute('href')}` }],
      ['tile', `${here}.house .mode`, { key: (tile) => `tile:${tile.dataset.mode}` }],
      ['send', `${here}.rug .chat form button[type="submit"]`, { key: () => 'send' }],
      ['code', `${here}.house .share .code`, { key: () => 'code' }],
      ['bell', `${here}.house .notify:not([hidden])`, { face: (notify) => notify.querySelector('.bell'), key: () => 'bell' }],
      ['sign', ':scope > header h1.sign:not(.sr-only), :scope > main h1.sign:not(.sr-only)', { key: () => 'sign' }],
      ['portal', ':scope > header #worlds:not([hidden])', { key: () => 'portal' }],
      ['note', `${here}.rug .chat-log li:not(.note) > p`],
      ['token', `${here}#members .seat`, { face: (seat) => seat.querySelector('.avatar'), key: (seat) => `seat:${seat.dataset.seat}` }],
    ].filter(([kind]) => meadow.kinds.includes(kind));
    const typing = () => Boolean(document.activeElement?.matches?.('input:not([type="checkbox"]):not([type="radio"]), textarea'));
    const meadowSeen = () => root.dataset.world === 'playful' && !root.querySelector(':scope > .worlds-copy');
    const folk = troupe({ root, life, calm: typing, ...(meadow.awake ? {} : { still: true }), sights: () => [...root.querySelectorAll(`${here}#members .seat .avatar`)] });
    // (awake, and with motion allowed: the people walk about the lawn, room/roam.js; and what is pressed sways, room/folk.css)
    const lively = meadow.awake && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const people = lively ? roam({ root, life, calm: typing }) : null;
    if (lively) root.setAttribute('data-ff-awake', '');
    let due = false;
    const recast = () => {
      due = false;
      if (life.over || !meadowSeen()) return;
      folk.scan(CAST);
      people?.measure();
      // (not yet awake: every one of them asleep, eyes shut, where it is)
      if (!meadow.awake) {
        // (and the current that goes through them takes them in the order they stand on the page: room/folk.css)
        [...root.querySelectorAll(':scope > :is(header, main) [data-ff]')].forEach((face, i) => {
          face.dataset.ffMood = 'sleep';
          face.style.setProperty('--ff-i', i);
        });
      }
    };
    // (whenever the room draws something afresh; the folk's own layers going in and out do not count)
    const own = (node) => node.nodeType === 1 && node.classList.contains('ff');
    const drawn = new MutationObserver((changes) => {
      if (due || changes.every((change) => [...change.addedNodes, ...change.removedNodes].every(own))) return;
      due = true;
      requestAnimationFrame(recast);
    });
    drawn.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'data-world'] });
    life.onEnd(() => drawn.disconnect());
    if (people) life.on(window, 'resize', () => people.measure());
    const beat = (now) => {
      if (life.over) return;
      if (meadowSeen()) {
        folk.tick(now);
        people?.step(now);
      }
      requestAnimationFrame(beat);
    };
    if (meadow.awake) requestAnimationFrame(beat);
    else root.setAttribute('data-ff-current', '');
    recast();
  }

  // A link that leads nowhere (or a room that could not be reached the first time): the empty plot, with what went wrong
  // in a short line of words in the middle of it; the arrow at the top is the way home. (The name over it is said to
  // screen readers only, as the room's; and the room is looked for again, unless it is not there.)
  function fail(text) {
    el.loading.hidden = true;
    el.name.textContent = 'Room';
    el.name.classList.add('sr-only');
    el.name.removeAttribute('aria-busy');
    oops(el.roomError, text);
  }

  function list(names) {
    if (names.length < 2) return names.join('');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }

  const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M7.5 7.5l9 9M16.5 7.5l-9 9"/></svg>';

  const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.8v12.4l9.8-6.2z" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';

  // Who is in a game, as far as the room can tell: who wrote or started it, who played last, and you once you have
  // played it; a game together is everybody's at the table.
  function players(game) {
    const seats = [];
    const add = (seat) => { if (Number.isInteger(seat) && room.people[seat] && !room.people[seat].left && !seats.includes(seat)) seats.push(seat); };
    add(game.phrase_by);
    const line = chat?.starter(game.id);
    if (line) add(room.people.findIndex((person) => person.name === line.who));
    add(game.last_player);
    if (game.mine) add(room.you);
    if ((game.mode ?? 'coop') === 'coop') room.people.forEach((_, seat) => add(seat));
    return seats;
  }

  // A few names as they are said: "Sam", "Sam and Ada", "Sam, Ada and you".
  const listed = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

  const MODE_NAMES = { coop: 'Together', trial: 'Time trial', phrase: 'Pass phrase' };

  // Where a game stands for whoever is looking: as a state its board on the
  // table shows ('go': theirs to play; 'wait'; 'won'; 'lost'), and in words
  // for screen readers (`said`), which is the only place they are written.
  function gameStatus(game) {
    if (game.mode === 'trial' || game.mode === 'phrase') {
      // the solo modes: where you stand, and how many have finished
      const done = `${game.finished} finished`;
      if (game.phrase_by === room.you) return { said: ['you wrote this one', done], state: 'wait' };
      if (game.mine === 'won') return { said: [game.mode === 'trial' ? 'you finished' : 'you solved it', done], state: 'won' };
      if (game.mine === 'lost') return { said: ['you ran out of hearts', done], state: 'lost' };
      if (game.mode === 'phrase') return { said: [game.mine === 'playing' ? 'in progress' : 'not started', done], state: 'go' };
      return { said: [game.mine === 'playing' ? 'your clock is running' : 'not started', done], state: 'go' };
    }
    const hearts = `${game.hearts} ${game.hearts === 1 ? 'heart' : 'hearts'} left`;
    const found = `${game.found} of ${game.size} posts found`;
    if (game.status === 'won') return { said: [`solved in ${game.moves} turns`, hearts], state: 'won' };
    if (game.status === 'lost') return { said: ['out of hearts', found], state: 'lost' };
    if (game.last_player === room.you) return { said: ['waiting for someone else', found, hearts], state: 'wait' };
    return { said: ['your move', found, hearts], state: 'go' };
  }
  // nearest first: what is yours to play, then what others are playing, then what is over
  const NEAR = { go: 0, wait: 1, won: 2, lost: 2 };

  // The picture a kind of game goes by: the one on the tile that starts it.
  const modeIcon = (mode) => el.modes.querySelector(`[data-mode="${mode}"] svg`)?.cloneNode(true) ?? null;

  // The room's name. For a member it is a button: a tap turns it into a field,
  // Enter (or leaving the field) saves, Escape puts it back.
  let renaming = false;

  function showName() {
    if (renaming) return; // do not pull the field out from under someone typing
    // (Only when it is not there already as it should be. The poll comes round every few seconds with the same room:
    // were the name's button made again each time, whoever had the keyboard on it would lose their place, and a
    // finger pressing it when the poll came would let go of another button, which is no tap at all.)
    const there = el.name.firstElementChild;
    if (room.you === null) {
      if (there || el.name.textContent !== room.name) el.name.textContent = room.name;
      return;
    }
    if (el.name.childNodes.length === 1 && there?.matches('button.rename') && there.textContent === room.name) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rename';
    button.textContent = room.name;
    button.setAttribute('aria-label', `${room.name}. Rename the room`);
    button.addEventListener('click', editName);
    el.name.replaceChildren(button);
  }

  function editName() {
    renaming = true;
    oops(el.nameError, ''); // (tried again: what went wrong the last time is not still said)
    const form = document.createElement('form');
    form.className = 'rename';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 24;
    input.required = true;
    input.autocomplete = 'off';
    input.enterKeyHint = 'done';
    input.value = room.name;
    input.placeholder = 'room name…';
    input.setAttribute('aria-label', 'Room name');
    form.append(input);
    el.name.replaceChildren(form);
    input.focus();
    input.select();

    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      if (save && name && name !== room.name) {
        input.disabled = true;
        try {
          const view = await rpc('room_title', { p_room: roomId, p_token: myToken(), p_name: name });
          room = { ...view, messages: view.messages.filter((message) => !chat || message.id > chat.lastId) };
          rememberRoom(room.id, room.name);
          watcher?.poke();
          renaming = false;
          render();
          return;
        } catch (failure) {
          // said where it was tried: the name, back as it was (below), shakes, and the words come under it
          oops(el.nameError, failure.message, { shake: el.name });
        }
      }
      renaming = false;
      showName();
      el.name.querySelector('button')?.focus();
    };
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      finish(true);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') finish(false);
    });
  }

  function render() {
    el.name.classList.remove('sr-only');
    showName();
    setTitle();
    el.name.removeAttribute('aria-busy');
    el.loading.hidden = true;
    oops(el.roomError, ''); // (found after all)

    if (room.you === null) {
      // people still in the room (those who left keep their place in the list, marked)
      const here = room.people.filter((person) => !person.left).map((person) => person.name);
      const n = here.length;
      el.joinText.textContent = nextGame
        ? 'You’ve been invited to a game here. Join the room to play.'
        : n === 0 ? 'Nobody is here at the moment. Join to play and chat.'
          : `${list(here)} ${n === 1 ? 'is' : 'are'} here. Join to play and chat.`;
      if (!el.joinName.value) {
        el.joinName.value = myName();
        joining(false); // (the door: a name is there now)
      }
      // The room as it is inside: whoever is in at the head of its table, each with their name, and on the table a board
      // (the game somebody was asked to, under a lamp; or else one at rest, which is what the room is for).
      // (Laid again only when who is there has changed: the door is looked at every few seconds.)
      const taken = room.people.filter((person) => !person.left).map((person) => person.avatar);
      if (picked && taken.includes(myLook.avatar)) {
        for (let tries = 0; tries < 40 && taken.includes(myLook.avatar); tries++) myLook = randomLook();
        paint(el.joinYou, myLook);
      }
      const round = room.people.filter((person) => !person.left);
      const laid = JSON.stringify(round.map((person) => [person.name, person.avatar, person.color]));
      if (el.joinFaces.dataset.laid !== laid) {
        el.joinFaces.dataset.laid = laid;
        const seats = round.map((person) => {
          const seat = document.createElement('span');
          seat.className = 'seat';
          const name = document.createElement('span');
          name.className = 'name';
          name.textContent = person.name;
          seat.append(avatar(person), name);
          return seat;
        });
        el.joinFaces.replaceChildren(...seats);
        el.joinTable.replaceChildren(nextGame ? miniBoard({ id: nextGame, size: 6 }, 'go') : miniBoard({ id: roomId, size: 6, found: 2 }, 'wait'));
        el.joinTable.classList.toggle('lit', Boolean(nextGame));
      }
      // A device signed out of its profile cannot join as itself: home offers the ways back in.
      rpc('profile_get', { p_token: myToken() }).then((profile) => {
        if (profile.signed_out) go('/', { replace: true });
        else if (profile.avatar && Number.isInteger(profile.color)) paint(el.joinYou, myLook = { avatar: profile.avatar, color: profile.color });
      }).catch(() => {});
      worlds.member(false);
      el.join.hidden = false;
      el.house.hidden = true;
      el.room.hidden = true;
      el.compose.hidden = true;
      el.profile.hidden = true;
      return;
    }

    if (nextGame) {
      go(gameUrl('postmarks', nextGame), { replace: true }); // already a member: straight to the shared game
      return;
    }
    el.join.hidden = true;
    el.house.hidden = false;
    el.house.classList.toggle('writing', composing); // (at the desk the door is shut)
    el.room.hidden = composing;
    el.compose.hidden = !composing;
    // each person a token at the head of the table, with their name over it
    el.members.replaceChildren(...room.people.flatMap((person, seat) => {
      if (person.left) return [];
      const li = document.createElement('li');
      li.className = seat === room.you ? 'seat you' : 'seat';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = person.name;
      if (seat === room.you) {
        // (yours is the face at the top of the screen as well: it is not said here but to screen readers)
        const you = document.createElement('span');
        you.className = 'sr-only';
        you.textContent = ' (you)';
        name.append(you);
      }
      li.append(avatar(person), name);
      return [li];
    }));
    el.profile.hidden = false;
    el.more.hidden = false;
    worlds.member(true);
    el.profile.replaceChildren(avatar(room.people[room.you]));
    const code = `${room.code.slice(0, 3)}-${room.code.slice(3)}`;
    if (el.roomCode.dataset.code !== code) {
      el.roomCode.dataset.code = code;
      copyable(el.roomCode, code);
    }

    if (!watcher) {
      watcher = watchRoom(room.id, refresh);
      life.onEnd(() => watcher.stop());
    }
    if (!present) {
      present = true;
      life.onEnd(watchPresence(room.id));
      syncPush().catch(() => {}); // re-register this device if notifications are already on
      renderNotify();
    }
    if (!chat) {
      chat = createChat(el.chat, {
        roomId: room.id, you: room.you, people: room.people, onSent: () => watcher.poke(),
        calm: true,
      });
    }
    chat.setPeople(room.people);
    const fromOthers = chat.add(room.messages);
    chat.onTable(new Set(room.games.map((game) => game.id)));

    // each game a card on the shelf of the table, the whole of it the way in: its board, the faces of who is in it, its
    // kind, on the round button at its end. What is yours to play comes first and is lit; the rest below, quieter.
    const laid = room.games.map((game) => ({ game, status: gameStatus(game), seats: players(game) }))
      .sort((a, b) => NEAR[a.status.state] - NEAR[b.status.state]);
    // (who started each, as its line in the chat says: that line is put away while the game is on the table, so its
    // card says it to screen readers instead)
    const by = (game) => {
      const line = chat.starter(game.id);
      return line ? `, ${line.wrote ? 'written' : 'started'} by ${line.who}` : '';
    };
    // (laid again only when something on it has changed: a slow breath is not cut short by every look at the server)
    const table = JSON.stringify(laid.map(({ game, status, seats }) => [game.id, game.mode, game.size, game.found, status.state, status.said, by(game),
      seats.map((seat) => [room.people[seat].avatar, room.people[seat].color])]));
    // (only the first game waiting on you is lit, its button breathing: the others waiting on you are as plainly yours,
    // their buttons the seal's colour, but still, so that a full table is never several breaths at once)
    const lit = laid.find(({ status }) => status.state === 'go')?.game;
    // (who is in it, said in words where the chat's line has not said who started it)
    const whoName = (seat) => (seat === room.you ? 'you' : room.people[seat].name);
    const who = (game, seats) => (by(game) || !seats.length ? by(game) : `, with ${listed(seats.map(whoName))}`);
    if (el.games.dataset.laid !== table) el.games.replaceChildren(...laid.map(({ game, status, seats }) => {
      const li = document.createElement('li');
      li.dataset.state = status.state;
      if (game === lit) li.dataset.lit = '';
      const name = `${MODE_NAMES[game.mode] ?? 'Together'} ${game.size} × ${game.size}`;
      const board = miniBoard(game, status.state);
      // between the board and the button: who is in it, and what kind of game it is
      const about = document.createElement('span');
      about.className = 'about';
      about.setAttribute('aria-hidden', 'true');
      const faces = document.createElement('span');
      faces.className = 'faces';
      faces.append(...seats.slice(0, 3).map((seat) => avatar(room.people[seat])));
      about.append(faces);
      // the round button at its end carries the kind of game: the way in, and what it is
      const play = document.createElement('span');
      play.className = 'play';
      play.setAttribute('aria-hidden', 'true');
      const kind = modeIcon(game.mode ?? 'coop');
      if (kind) {
        kind.setAttribute('class', 'kind');
        play.append(kind);
      } else play.innerHTML = PLAY;
      // the card is the way into the game; tidying, the way to put it away lies there instead
      const a = document.createElement('a');
      a.className = 'game';
      a.href = gameUrl(game.kind, game.id);
      a.setAttribute('aria-label', `${name}${who(game, seats)}: ${status.said.join(', ')}`);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete';
      remove.dataset.game = game.id;
      remove.dataset.name = name;
      remove.setAttribute('aria-label', `Delete ${name}`);
      remove.innerHTML = CROSS;
      li.append(board, about, play, a, remove);
      return li;
    }));
    el.games.dataset.laid = table;
    el.noGames.hidden = room.games.length > 0;
    el.tidy.hidden = room.games.length === 0;
    if (!room.games.length) tidying(false);

    if (document.hidden && fromOthers) {
      unread += fromOthers;
      setTitle();
    }
  }

  function setTitle() {
    document.title = `${unread ? `(${unread}) ` : ''}${room ? room.name : 'Room'} · correspondence.lol`;
  }

  async function refresh() {
    clearTimeout(timer);
    try {
      const view = await rpc('room_get', { p_room: roomId, p_token: myToken(), p_after: chat ? chat.lastId : null });
      if (life.over) return; // the screen was left while this was on its way
      room = view;
      if (room.you !== null) rememberRoom(room.id, room.name);
      render();
    } catch (error) {
      if (!room) {
        fail(error.message);
        if (/not found/i.test(error.message)) return;
      }
    }
    if (life.over) return;
    if (!document.hidden) timer = setTimeout(refresh, pollDelay(watcher));
  }

  life.on(document, 'visibilitychange', () => {
    if (document.hidden) return;
    unread = 0;
    if (room) setTitle();
    refresh();
  });
  life.on(window, 'online', refresh);

  // At the door: in, under a name (the door is held back until there is one).
  const joining = door(el.joinForm, el.joinName, el.joinError, (value) => value.trim().length > 0);
  el.joinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = el.joinName.value.trim();
    if (!name || el.joinForm.querySelector('button[type="submit"]').disabled) return;
    oops(el.joinError, '');
    joining(true);
    try {
      room = await rpc('room_join', { p_room: roomId, p_name: name, p_token: myToken() });
      setMyName(name);
      // in with the face that stood on the mat: the look chosen in an earlier room, or for somebody new the one picked at
      // the door, kept from now on
      await saveProfile({ name, ...myLook }).then(() => saveLook(myLook.avatar, myLook.color)).catch(() => {});
      rememberRoom(room.id, room.name);
      if (nextGame) {
        go(gameUrl('postmarks', nextGame), { replace: true }); // the game they were invited to
        return;
      }
      joining(false);
      render();
      refresh(); // restart polling at the live pace
    } catch (error) {
      oops(el.joinError, error.message, { shake: el.joinForm });
      joining(false);
    }
  });

  // --- Notifications ------------------------------------------------------------
  // A bell by the mat, while they are not on: a tap turns them on (the
  // browser asks its own question, in its own words). Where the app has to be
  // installed first, the tap opens the guide to that. Where they have been
  // blocked, the bell is struck through, and a tap says where to allow them,
  // the one thing here that only words can say.
  const BLOCKED = 'Notifications are blocked for this site. You can allow them in your browser or system settings.';
  function renderNotify() {
    const state = pushState();
    el.notify.hidden = state === 'granted' || state === 'unsupported';
    el.notify.dataset.state = state;
    const said = {
      default: ['Turn on notifications', 'Get a notification when a game starts, it’s your turn, or someone messages the room.'],
      'install-first': ['Show me how to install the app', 'Install the app to get a notification when a game starts, it’s your turn, or someone messages the room.'],
      denied: ['Notifications are blocked', BLOCKED],
    }[state];
    if (!said) return;
    el.notifyButton.setAttribute('aria-label', said[0]);
    el.notifyText.textContent = said[1];
  }

  el.notifyButton.addEventListener('click', async () => {
    const state = pushState();
    if (state === 'install-first') {
      window.openInstallGuide?.();
      return;
    }
    if (state === 'denied') {
      tell('Notifications are blocked', { detail: 'You can allow them in your browser or system settings.' });
      return;
    }
    el.notifyButton.disabled = true;
    oops(el.notifyError, '');
    try {
      await enablePush();
    } catch (error) {
      oops(el.notifyError, `Couldn’t turn on notifications: ${error.message}`, { shake: el.notifyButton });
      el.notifyButton.disabled = false;
      return;
    }
    el.notifyButton.disabled = false;
    renderNotify();
  });

  // --- Leaving ----------------------------------------------------------------------
  // The room's options, tucked behind the three dots at the top: things done
  // rarely (renaming) or not to be done by accident (leaving).
  // While it is open, the room under it is out of reach (inert): it lies over the room's name, and a tap anywhere else
  // only puts it away.
  const moreMenu = (open) => {
    el.moreMenu.hidden = !open;
    el.more.setAttribute('aria-expanded', String(open));
    root.querySelector('main').inert = open;
  };
  el.more.addEventListener('click', () => moreMenu(el.moreMenu.hidden));
  life.on(document, 'pointerdown', (event) => {
    if (!el.moreMenu.hidden && !event.target.closest('.more-wrap')) moreMenu(false);
  });
  life.on(document, 'keydown', (event) => {
    if (event.key === 'Escape' && !el.moreMenu.hidden) {
      moreMenu(false);
      el.more.focus();
    }
  });
  el.rename.addEventListener('click', () => {
    moreMenu(false);
    editName();
  });

  // Leaving is asked in a sheet, and tried there: refused, the sheet shakes and the words come in it (shared/ask.js).
  el.leave.addEventListener('click', () => {
    moreMenu(false);
    ask(`Leave ${room.name}?`, {
      yes: 'Leave room', no: 'Stay', danger: true,
      attempt: async () => {
        if (life.over) return;
        await rpc('room_leave', { p_room: roomId, p_token: myToken() });
        watcher?.poke();
        forgetRoom(roomId); // off this device's list of rooms
        go('/');
      },
    });
  });

  // --- Your profile: name and avatar --------------------------------------------
  async function saveProfile({ name, avatar: face, color }) {
    const view = await rpc('room_profile', {
      p_room: roomId, p_token: myToken(), p_name: name, p_avatar: face, p_color: color,
    });
    // The reply carries the whole chat; keep only what this page has not shown yet.
    room = { ...view, messages: view.messages.filter((message) => !chat || message.id > chat.lastId) };
    setMyName(name); // also the default the next time a room is opened or joined
    render();
    watcher?.poke();
  }

  el.profile.addEventListener('click', () => {
    openProfile({ person: room.people[room.you], onSave: saveProfile });
  });

  // --- Deleting a game ---------------------------------------------------------------
  // Any member can delete any game in the room. It disappears for everyone.
  // There is one way to it for the whole table, not one on every game: the
  // table is tidied (the bin at its corner), and then a tap on a board puts it
  // away, once that is agreed to.
  function tidying(on) {
    el.table.classList.toggle('tidy', on);
    el.tidy.setAttribute('aria-pressed', String(on));
    el.tidy.setAttribute('aria-label', on ? 'Done putting games away' : 'Put games away');
  }
  el.tidy.addEventListener('click', () => tidying(!el.table.classList.contains('tidy')));
  life.on(document, 'keydown', (event) => {
    // (an Escape that closes the question sheet is for the sheet, not the table)
    if (event.key === 'Escape' && el.table.classList.contains('tidy') && !document.querySelector('dialog[open]')) tidying(false);
  });

  // A card pressed goes down into the table under the finger, and stays down long enough to be seen, however quick
  // the tap (room/room.css). On a touch screen it waits a moment first: a finger that has come to scroll the page, not
  // to press, leaves the shelf where it is.
  let pressed = null;
  const lift = () => {
    if (!pressed) return;
    const { li, at, wait } = pressed;
    pressed = null;
    clearTimeout(wait);
    if (!at) li.dataset.pressed = ''; // (a quick tap, before it had begun to go down: it goes down all the same)
    setTimeout(() => delete li.dataset.pressed, Math.max(0, 160 - (at ? performance.now() - at : 0)));
  };
  life.on(el.games, 'pointerdown', (event) => {
    const li = event.target.closest(':is(a.game, .delete)')?.closest('li');
    if (!li || event.button > 0) return;
    lift();
    const press = { li, at: 0, wait: 0 };
    const sink = () => { li.dataset.pressed = ''; press.at = performance.now(); };
    pressed = press;
    if (event.pointerType === 'touch') press.wait = setTimeout(sink, 70);
    else sink();
  });
  life.on(document, 'pointerup', lift);
  life.on(document, 'pointercancel', () => {
    if (!pressed) return;
    clearTimeout(pressed.wait);
    delete pressed.li.dataset.pressed;
    pressed = null;
  });

  // The sheet that asks shows the board that was pressed, not its name; putting it away is tried there, and refused,
  // the sheet shakes and the words come in it (shared/ask.js).
  el.games.addEventListener('click', (event) => {
    const button = event.target.closest('.delete');
    if (!button) return;
    ask(`Delete ${button.dataset.name}?`, {
      picture: likeness(button.closest('li').querySelector('.mini')), yes: 'Delete', no: 'Keep it', danger: true,
      attempt: async () => {
        if (life.over) return;
        await rpc('postmarks_delete', { p_game: button.dataset.game, p_token: myToken() });
        watcher?.poke();
        await refresh();
      },
    });
  });
  // A board as it lies on the table, to be shown in a sheet: the sheet is not in the room, so its colours are fixed
  // as they are here (in full, as it is pressed: not resting).
  function likeness(board) {
    const svg = board.querySelector('svg').cloneNode(true);
    const drawn = [...board.querySelectorAll('svg *')];
    [...svg.querySelectorAll('*')].forEach((one, i) => {
      const style = getComputedStyle(drawn[i]);
      one.setAttribute('fill', style.fill);
      if (style.stroke !== 'none') one.setAttribute('stroke', style.stroke);
      one.removeAttribute('class');
    });
    const frame = document.createElement('span');
    frame.className = 'likeness';
    frame.style.background = getComputedStyle(el.games).getPropertyValue('--slab');
    frame.append(svg);
    return frame;
  }

  // --- Starting a game ----------------------------------------------------------------
  // One tile per kind of game, with no words on it: the picture is the kind. One tap on a tile goes to its desk,
  // which tells nobody, and which has the same two steps for every kind of game. First, how it is played: a few
  // cards, and the way on. Then the board it will be played on, drawn ahead, to be drawn again or taken; for a pass
  // phrase, with the message above it, or the die lit for one picked at random (kept secret from its starter too, who
  // can then play). The play mark starts the game, and then the whole room is told. Each step is a step in the
  // browser's history: Back goes back a step, and from the first, to the room.
  const MODES = ['coop', 'trial', 'phrase'];
  const seedOf = () => crypto.getRandomValues(new Uint32Array(1))[0];
  // the size a board is drawn at: a random one for Together and Time trial; for a pass phrase, the size its words
  // need, or (left empty for a random phrase) one of the smaller sizes, kept until the die is thrown
  let emptySize = null;
  function sizeFor(mode) {
    if (mode !== 'phrase') return randomSize();
    const written = tidyPhrase(el.phraseText.value).trim();
    if (written) return phraseBoardSize(written);
    emptySize ??= 5 + Math.floor(Math.random() * 3);
    return emptySize;
  }
  function draw(size) {
    const seed = seedOf();
    const made = generatePuzzle(size, seed);
    puzzle = { size, seed, regions: made.regions, solution: made.solution };
    el.previewBoard.replaceWith(el.previewBoard = Object.assign(boardPreview(size, made.regions), { id: 'preview-board' }));
    el.previewBoard.dataset.size = String(size);
  }
  el.redraw.addEventListener('click', () => {
    draw(sizeFor(deskMode));
    oops(el.phraseError, ''); // (a game that could not be started is not still said, once another board is drawn)
    if (deskMode === 'phrase') previewTokens(); // (...though anything wrong with the phrase still is)
  });

  async function startGame(mode, phrase = null) {
    if (el.modes.dataset.busy) return;
    if (phrase !== null) phrase = tidyPhrase(phrase);
    if (phrase !== null && phraseProblem(phrase)) return; // already marked at the box
    if (!puzzle) draw(sizeFor(mode));
    el.modes.dataset.busy = 'true';
    oops(el.gameError, '');
    oops(el.phraseError, '');
    try {
      const game = await rpc('postmarks_start', {
        p_room: roomId, p_token: myToken(), p_mode: mode, p_size: puzzle.size,
        p_regions: puzzle.regions, p_solution: puzzle.solution, p_phrase: mode === 'phrase' ? phrase : null,
      });
      watcher?.poke();
      if (mode === 'coop') save(HOWTO_KEY, game.id); // (its cards were the desk's first step: the game does not show them again)
      go(gameUrl('postmarks', game.id));
    } catch (error) {
      oops(composing ? el.phraseError : el.gameError, error.message, { shake: composing ? el.phraseForm : el.modes });
      delete el.modes.dataset.busy;
    }
  }

  // Show the tokens the phrase turns into, as it is typed: exactly one for each
  // post on its board. Anything wrong with the phrase is said at once, the box
  // is marked and Start is held back until it is put right. The board drawn
  // ahead is drawn again only when the phrase needs another size.
  function previewTokens() {
    const phrase = tidyPhrase(el.phraseText.value);
    const problem = phraseProblem(phrase);
    oops(el.phraseError, problem ?? '');
    el.phraseText.setAttribute('aria-invalid', String(Boolean(problem)));
    const start = el.phraseForm.querySelector('button[type="submit"]');
    start.disabled = Boolean(problem);
    const random = !phrase.trim();
    start.setAttribute('aria-label', random ? 'Start game with a random phrase' : 'Start game');
    el.randomPhrase.setAttribute('aria-pressed', String(random)); // (the die is lit while a random phrase is what will be used)
    el.phraseForm.classList.toggle('random', random);
    const size = sizeFor('phrase');
    if (puzzle?.size !== size) draw(size);
    const tokens = random ? [] : tokenize(phrase, size);
    // Cards are updated in place so that typing only animates what changed.
    while (el.tokens.children.length > tokens.length) el.tokens.lastElementChild.remove();
    tokens.forEach((token, i) => {
      const card = el.tokens.children[i] ?? el.tokens.appendChild(document.createElement('span'));
      const text = token.t.toUpperCase();
      if (card.textContent !== text) card.textContent = text;
      const className = ['word', i > 0 && !tokens[i - 1].gap && 'join', !token.gap && i < tokens.length - 1 && 'cont']
        .filter(Boolean).join(' ');
      if (card.className !== className) card.className = className;
    });
    el.tokenNote.textContent = tokens.length === 0 || problem ? ''
      : `${size} tokens, one in each post of a ${size} × ${size} board`;
  }

  el.phraseText.addEventListener('input', previewTokens);
  // The die beside the box: a phrase picked at random. The box is emptied for it, and its board drawn again at one of
  // the smaller sizes (a random phrase is short).
  el.randomPhrase.addEventListener('click', () => {
    el.phraseText.value = '';
    emptySize = null;
    puzzle = null;
    previewTokens();
  });

  // The desk for a kind of game at one of its steps ('how' or 'board'), or (no mode) the room again.
  function openDesk(mode, step = 'how') {
    const was = deskMode;
    deskMode = MODES.includes(mode) ? mode : null;
    composing = Boolean(deskMode);
    if (room?.you !== null) render();
    if (!deskMode) {
      puzzle = null;
      window.scrollTo(0, 0);
      return;
    }
    el.compose.dataset.mode = deskMode;
    el.compose.dataset.step = step;
    el.deskIcon.replaceChildren(modeIcon(deskMode) ?? '');
    el.deskName.textContent = MODE_NAMES[deskMode];
    el.deskHow.hidden = step !== 'how';
    el.deskBoard.hidden = step !== 'board';
    el.phraseBack.setAttribute('aria-label', step === 'how' ? 'Back to the room' : 'Back to how it is played');
    if (step === 'how') {
      modeCards(deskMode, el.modeCards);
      if (was !== deskMode) { // (another kind of game: its board is drawn afresh, and no message is left over)
        puzzle = null;
        el.phraseText.value = '';
        emptySize = null;
      }
      window.scrollTo(0, 0);
      el.deskNext.focus({ preventScroll: true });
      return;
    }
    const phrase = deskMode === 'phrase';
    el.phraseAsk.hidden = !phrase;
    el.phraseField.hidden = !phrase;
    el.tokens.hidden = !phrase;
    oops(el.phraseError, '');
    const start = el.phraseForm.querySelector('button[type="submit"]');
    start.disabled = false;
    start.setAttribute('aria-label', 'Start game');
    if (phrase) {
      previewTokens();
      el.phraseText.focus();
    } else if (!puzzle) draw(sizeFor(deskMode));
  }
  // where the desk is, in the address: #coop, #coop-board, and so on
  const deskInAddress = () => {
    const [mode, step] = location.hash.slice(1).split('-');
    return MODES.includes(mode) ? { mode, step: step === 'board' ? 'board' : 'how' } : { mode: null, step: 'how' };
  };

  el.deskNext.addEventListener('click', () => {
    history.pushState(null, '', `#${deskMode}-board`);
    openDesk(deskMode, 'board');
  });

  life.on(window, 'popstate', () => { const at = deskInAddress(); openDesk(at.mode, at.step); });
  el.phraseBack.addEventListener('click', () => history.back());

  el.modes.addEventListener('click', (event) => {
    const tile = event.target.closest('[data-mode]');
    if (!tile) return;
    oops(el.gameError, '');
    history.pushState(null, '', `#${tile.dataset.mode}`);
    openDesk(tile.dataset.mode);
  });

  el.phraseForm.addEventListener('submit', (event) => {
    event.preventDefault();
    startGame(deskMode, deskMode === 'phrase' ? el.phraseText.value : null);
  });

  // Share hands the code to the device's share sheet, with a line saying what
  // it is for. (Tapping the code itself copies it.)
  if (navigator.share) {
    el.shareButton.hidden = false;
    el.shareButton.addEventListener('click', async () => {
      try {
        await navigator.share({ text: `Join my room “${room.name}” on correspondence.lol with the code ${el.roomCode.dataset.code}` });
      } catch {
        /* share sheet dismissed or unavailable: the code can still be copied */
      }
    });
  }


  if (deskInAddress().mode) history.replaceState(null, '', location.pathname + location.search); // (every visit starts in the room)
  if (roomId) refresh();
  else fail('That room link doesn’t look right.');
}
