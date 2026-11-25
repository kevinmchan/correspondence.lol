import { ask, tell } from '/shared/ask.js';
import { rpc } from '/shared/api.js';
import { go } from '/shared/nav.js';
import { createChat } from '/shared/chat.js';
import { pollDelay, watchRoom } from '/shared/live.js';
import { avatar, openProfile, savedLook } from '/shared/profile.js';
import { enablePush, pushState, syncPush, watchPresence } from '/shared/push.js';
import { copyable } from '/shared/handoff.js';
import { UUID, forgetRoom, gameUrl, myName, myToken, rememberRoom, setMyName } from '/shared/identity.js';
import { generatePuzzle, phraseBoardSize, phraseProblem, randomSize, tidyPhrase, tokenize } from '/postmarks/game.js';
import { door, miniBoard, oops, roof, roomClass } from '/shared/place.js';
import { twoWorlds } from '/room/worlds.js';

// A room's screen. mount() puts it to work in `root`, a fresh copy of its
// template; everything it starts ends with `life` (see shared/screen.js).
//
// A room is drawn as a building on the map, seen from above (room/room.css):
// with its roof off for the people in it, and with its roof on for anybody
// else. What is made here is what goes in it: the tokens of the people at its
// table, and the games laid on the table as small boards.
//
// It is a quiet room, and one thing in it is loud: what is waiting on you. A
// game that is yours to play lies nearest, its board bright and lifted under
// a lamp, its seal breathing; the rest lie further off, small and dim, and the
// finished ones dimmer still. Nothing on the table is written: where a game
// stands is said by its board, and in words to screen readers.
export function mount(root, life) {

  const $ = (id) => root.querySelector(`#${id}`);
  const { setTimeout } = life; // timers that stop when the screen leaves
  const el = {
    name: $('room-name'), nameError: $('name-error'), loading: $('loading'), roomError: $('room-error'),
    join: $('join'), joinText: $('join-text'), joinForm: $('join-form'), joinName: $('join-name'), joinError: $('join-error'),
    house: $('house'), room: $('room'), members: $('members'), profile: $('profile'), joinFaces: $('join-faces'),
    notify: $('notify'), notifyText: $('notify-text'), notifyButton: $('notify-button'), notifyError: $('notify-error'),
    roomCode: $('room-code'), shareButton: $('share-button'),
    games: $('games'), noGames: $('no-games'), tidy: $('tidy'), table: root.querySelector('.table'),
    modes: $('modes'), modeNote: $('mode-note'), compose: $('compose'), phraseForm: $('phrase-form'), phraseText: $('phrase-text'),
    phraseError: $('phrase-error'), phraseBack: $('phrase-back'), tokens: $('tokens'), tokenNote: $('token-note'), gameError: $('game-error'),
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
  let composing = false; // the write-a-phrase screen is showing in place of the room
  let present = false; // telling the server this room is on screen

  // The building keeps one of the game's colours, by its id: its walls here, its roof on the home page.
  if (roomId) root.classList.add(roomClass(roomId));
  // A portal in the top bar, for a member: the way into the room's other world, and back (room/worlds.js).
  const worlds = twoWorlds(root, life, $('worlds'));
  el.joinFaces.before(roof({ kind: 0, wide: 330, high: 150, bare: true }));

  // A link that leads nowhere (or a room that could not be reached the first time): the empty plot, with the mark in
  // the middle of it, pressed for its words; the arrow at the top is the way home. (The name over it is said to screen
  // readers only, as the room's; and the room is looked for again, unless it is not there.)
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
    if (room.you === null) {
      el.name.textContent = room.name;
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rename';
    button.textContent = room.name;
    button.setAttribute('aria-label', `${room.name}. Rename the room`);
    button.addEventListener('click', editName);
    // (and beside it, while it stands, the mark that it could not be changed)
    const mark = el.name.querySelector(':scope > .oops-mark');
    el.name.replaceChildren(button, ...(mark ? [mark] : []));
  }

  function editName() {
    renaming = true;
    oops(el.nameError, ''); // (tried again: what went wrong the last time is not still said)
    const form = document.createElement('form');
    form.className = 'rename';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 40;
    input.required = true;
    input.autocomplete = 'off';
    input.enterKeyHint = 'done';
    input.value = room.name;
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
          // said where it was tried: the name, back as it was (below), shakes, and the mark comes beside it
          oops(el.nameError, failure.message, { shake: el.name, place: (mark) => el.name.append(mark) });
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
      $('join-sign-in').href = `/?next=${encodeURIComponent(location.pathname + location.search)}`;
      // whoever is in shows at the skylight (as many as it has room for)
      el.joinFaces.replaceChildren(...room.people.filter((person) => !person.left).slice(0, 5).map((person) => avatar(person)));
      el.joinFaces.hidden = n === 0;
      // A device signed out of its profile cannot join as itself: home offers the ways back in.
      rpc('profile_get', { p_token: myToken() }).then((profile) => {
        if (profile.signed_out) go('/', { replace: true });
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

    // each game a small board lying on the table: the nearest are yours to play
    const laid = room.games.map((game) => ({ game, status: gameStatus(game) }))
      .sort((a, b) => NEAR[a.status.state] - NEAR[b.status.state]);
    // (who started each, as its line in the chat says: that line is put away while the game is on the table, so its
    // board says it to screen readers instead)
    const by = (game) => {
      const line = chat.starter(game.id);
      return line ? `, ${line.wrote ? 'written' : 'started'} by ${line.who}` : '';
    };
    // (laid again only when something on it has changed: a seal's slow breath is not cut short by every look at the server)
    const table = JSON.stringify(laid.map(({ game, status }) => [game.id, game.mode, game.size, game.found, status.state, status.said, by(game)]));
    if (el.games.dataset.laid !== table) el.games.replaceChildren(...laid.map(({ game, status }) => {
      const li = document.createElement('li');
      li.dataset.state = status.state;
      const name = `${MODE_NAMES[game.mode] ?? 'Together'} ${game.size} × ${game.size}`;
      const board = miniBoard(game, status.state);
      const kind = modeIcon(game.mode ?? 'coop');
      if (kind) {
        kind.setAttribute('class', 'kind');
        board.append(kind);
      }
      // the board is what is seen; over it, the way into the game, or (tidying) the way to put it away
      const a = document.createElement('a');
      a.className = 'game';
      a.href = gameUrl(game.kind, game.id);
      a.setAttribute('aria-label', `${name}${by(game)}: ${status.said.join(', ')}`);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete';
      remove.dataset.game = game.id;
      remove.dataset.name = name;
      remove.setAttribute('aria-label', `Delete ${name}`);
      remove.innerHTML = CROSS;
      li.append(board, a, remove);
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
      // bring along the look chosen in an earlier room, if any
      const look = savedLook();
      if (look) await saveProfile({ name, ...look }).catch(() => {});
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
  const moreMenu = (open) => {
    el.moreMenu.hidden = !open;
    el.more.setAttribute('aria-expanded', String(open));
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

  // Leaving is asked in a sheet, and tried there: refused, the sheet shakes and the mark comes in it (shared/ask.js).
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

  // The sheet that asks shows the board that was pressed, not its name; putting it away is tried there, and refused,
  // the sheet shakes and the mark comes in it (shared/ask.js).
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
  // One tile per kind of game, with no words on it: the picture is the kind.
  // A game started tells the whole room, so Together and Time trial take two
  // taps: the first lifts the tile and shows a play mark on it, the second
  // starts. (A tap anywhere else, or a while left alone, sets it down again.)
  // Pass phrase goes to a desk for writing the phrase first, which tells
  // nobody (left empty, a random one is used and its starter can play too).
  let armed = null;
  let settle = null;
  function arm(tile) {
    disarm();
    oops(el.gameError, ''); // (a game that could not be started is not still said, once another is begun)
    armed = tile;
    tile.dataset.armed = '';
    el.modeNote.textContent = 'Press again to start. Everyone in the room is told.';
    settle = setTimeout(disarm, 9000);
  }
  function disarm() {
    clearTimeout(settle);
    if (!armed) return;
    delete armed.dataset.armed;
    armed = null;
    el.modeNote.textContent = '';
  }
  life.on(document, 'pointerdown', (event) => {
    if (armed && !event.target.closest('#modes')) disarm();
    if (!event.target.closest('#phrase-form .start-phrase')) liftDie(false);
  });

  // At the desk, while the box is empty, the start is a die (a phrase picked at random), and that game tells the whole
  // room too: so, as a tile does, it takes two taps. The first lifts it and brings the play mark beside the die; the
  // second starts. (Typing, a tap anywhere else, or a while left alone, sets it down again.)
  let rolled = null;
  function liftDie(on) {
    const start = el.phraseForm.querySelector('button[type="submit"]');
    clearTimeout(rolled);
    if (on) {
      start.dataset.armed = '';
      el.tokenNote.textContent = 'Press again to start. Everyone in the room is told.';
      rolled = setTimeout(() => liftDie(false), 9000);
    } else if (start.hasAttribute('data-armed')) {
      delete start.dataset.armed;
      el.tokenNote.textContent = '';
    }
  }

  async function startGame(mode, phrase = null) {
    if (el.modes.dataset.busy) return;
    if (phrase !== null) phrase = tidyPhrase(phrase);
    if (phrase !== null && phraseProblem(phrase)) return; // already marked at the box
    el.modes.dataset.busy = 'true';
    oops(el.gameError, '');
    try {
      // A written phrase gets a board with one post per word where it can; the
      // server then splits the phrase into exactly one token per post.
      const written = (phrase ?? '').trim();
      const size = mode !== 'phrase' ? randomSize() : written ? phraseBoardSize(written) : 5 + Math.floor(Math.random() * 3);
      const puzzle = generatePuzzle(size, crypto.getRandomValues(new Uint32Array(1))[0]);
      const game = await rpc('postmarks_start', {
        p_room: roomId, p_token: myToken(), p_mode: mode, p_size: size,
        p_regions: puzzle.regions, p_solution: puzzle.solution, p_phrase: mode === 'phrase' ? phrase : null,
      });
      watcher?.poke();
      go(gameUrl('postmarks', game.id));
    } catch (error) {
      oops(composing ? el.phraseError : el.gameError, error.message, { shake: composing ? el.phraseForm : el.modes });
      delete el.modes.dataset.busy;
    }
  }

  // Show the tokens the phrase turns into, as it is typed: exactly one for each
  // post on its board. Anything wrong with the phrase is said at once, the box
  // is marked and Start is held back until it is put right. While the box is
  // empty, Start is a die: a phrase is picked at random.
  function previewTokens() {
    liftDie(false);
    const phrase = tidyPhrase(el.phraseText.value);
    const problem = phraseProblem(phrase);
    oops(el.phraseError, problem ?? '');
    el.phraseText.setAttribute('aria-invalid', String(Boolean(problem)));
    const start = el.phraseForm.querySelector('button[type="submit"]');
    start.disabled = Boolean(problem);
    const random = !phrase.trim();
    start.classList.toggle('random', random);
    start.setAttribute('aria-label', random ? 'Start game with a random phrase' : 'Start game');
    const size = phraseBoardSize(phrase);
    const tokens = tokenize(phrase, size);
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

  // Pass phrase has a screen of its own for writing the phrase. It is a step in
  // the browser's history, so Back returns to the room.
  function showCompose(show) {
    composing = show;
    if (room?.you !== null) render();
    if (show) {
      previewTokens();
      el.phraseText.focus();
    }
    else window.scrollTo(0, 0);
  }

  life.on(window, 'popstate', () => showCompose(location.hash === '#phrase'));
  el.phraseBack.addEventListener('click', () => history.back());

  el.modes.addEventListener('click', (event) => {
    const tile = event.target.closest('[data-mode]');
    if (!tile) return;
    if (tile.dataset.mode !== 'phrase') {
      if (tile !== armed) {
        arm(tile);
        return;
      }
      disarm();
      startGame(tile.dataset.mode);
      return;
    }
    disarm();
    oops(el.gameError, '');
    history.pushState(null, '', '#phrase');
    showCompose(true);
  });

  el.phraseForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const start = el.phraseForm.querySelector('button[type="submit"]');
    if (start.classList.contains('random') && !start.hasAttribute('data-armed')) {
      liftDie(true);
      return;
    }
    liftDie(false);
    startGame('phrase', el.phraseText.value);
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


  if (location.hash === '#phrase') history.replaceState(null, '', location.pathname + location.search);
  if (roomId) refresh();
  else fail('That room link doesn’t look right.');
}
