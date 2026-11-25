import { ask, choose, tell } from '/shared/ask.js';
import { go } from '/shared/nav.js';
import {
  CROSS, EMPTY, LETTER, MISS, START_HEARTS,
  applyMove, canMove, isLetterCell, lettersFound, newGame, randomSize,
} from './game.js';
import { rpc } from '/shared/api.js';
import { createChat } from '/shared/chat.js';
import { UUID, gameUrl, load, myToken, roomUrl, save, setMyName } from '/shared/identity.js';
import { pollDelay, watchRoom } from '/shared/live.js';
import { openHowTo, openTogether } from './howto.js';
import { COLOUR_NAMES, findHint } from './hint.js';
import { openFeedback, openFinale } from './finale.js';
import { applyPatterns } from '/shared/profile.js';
import { isMusicOff, isMuted, play as sfx, setMusicOff, setMuted } from './sound.js';
import { avatar, openProfile } from '/shared/profile.js';
import { ENERGY_KEY, earnedOn, finish, held, most, played, read as readEnergy } from '/shared/energy.js';
import { watchPresence } from '/shared/push.js';
import { claim as callPal } from '/penny/pal.js';
import { hide as hideTag } from '/penny/tags.js';
import { ASK, GASP, LONGING, OOPS, SAG, THIS_WAY, TRILL, WONDER, YES, hasDot } from '/penny/penny.js';

// A game's screen. mount() puts it to work in `root`, a fresh copy of its
// template; everything it starts ends with `life` (see shared/screen.js).
export function mount(root, life) {

  // A game is either a solo game (saved on this device only) or belongs to a
  // room (?game=<id>, stored on the server and open to everyone in that room).

  const GAME_KEY = 'postmarks:solo:v1';
  const HOWTO_KEY = 'postmarks:howto:v1'; // the last room game this device showed the how-to for
  const SOLO_HOWTO_KEY = 'postmarks:howto-solo:v1'; // set once the how-to has been shown in solo play
  const DISTRICTS = COLOUR_NAMES;
  const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#envelope"/></svg>';

  const $ = (id) => root.querySelector(`#${id}`);
  const { setTimeout, setInterval } = life; // timers that stop when the screen leaves

  // --- Penny, and the map ---------------------------------------------------------
  // The game looks the way the walk with Penny does (penny/walk.js): the board
  // is a few lit districts of a much larger map, faint all round, and Penny
  // stands at the bottom edge of the window, with Dot once Dot has been
  // found. Penny has no part in the play here and gives nothing away: it is
  // glad when a post is found, flinches at a miss, and feels how the game
  // ends. A race it takes as play: it is all for the start, as glad of a
  // finish that comes last as of one that comes first, pleased when a hint is
  // asked for, and not cast down when the hearts run out. It keeps low, out of the way of everything there is to press.
  const pal = callPal(life, { x: 0.74, height: 'low', mood: 'calm', dot: hasDot(), colours: true });
  let calming = null;
  const calm = (after) => {
    clearTimeout(calming);
    calming = setTimeout(() => pal.mood('calm').look(null).settle('peek'), after);
  };
  calm(600);
  // A pass phrase is the one place here where the story is: a letter somebody
  // wrote, face down, and Penny cannot read. So it does there what you do for
  // it on the walk, the other way round: you cannot hear what is in a post,
  // and it listens for you; it cannot read what is on a card, and you read
  // for it. It looks the cards over when they are first put down. Each time
  // one turns, it looks at the word and then at you: what does it say? And
  // when the whole of it is out, and the envelope is about to open, it is not
  // a cheer it gives. It is a letter too, and has never been opened.
  let met = false; // it has looked the cards over
  const meetPhrase = (cards) => {
    if (met) return;
    met = true;
    const look = () => {
      if (game?.status !== 'playing') return;
      if (document.querySelector('dialog[open]')) { // something is in front of it: once that has gone
        setTimeout(look, 700);
        return;
      }
      clearTimeout(calming);
      pal.rise().mood('curious').look(cards);
      pal.sing(WONDER, 0.5);
      calm(2400);
    };
    setTimeout(look, 1100);
  };
  const askWhatItSays = (card) => {
    setTimeout(() => { // once it has been glad of the post
      if (game?.status !== 'playing') return;
      clearTimeout(calming);
      pal.rise().mood('curious').look(card);
      pal.sing(WONDER, 0.5);
    }, 1000);
    setTimeout(() => {
      if (game?.status !== 'playing') return;
      clearTimeout(calming);
      pal.mood('hopeful').look(null); // at you
      pal.sing(ASK, 0.55);
      calm(1800);
    }, 2100);
  };
  const map = root.querySelector('.game-map');
  // line the faint squares of the map up with the lit ones of the board
  function layMap() {
    const board = root.querySelector('#board');
    const first = board?.firstElementChild;
    if (!first || !first.offsetWidth) return;
    const frame = map.parentElement.getBoundingClientRect();
    const box = board.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(board).columnGap) || 0;
    map.style.setProperty('--pitch', `${first.offsetWidth + gap}px`);
    map.style.setProperty('--map-x', `${box.left - frame.left - gap / 2}px`);
    map.style.setProperty('--map-y', `${box.top - frame.top - gap / 2}px`);
    map.style.setProperty('--lit-x', `${box.left - frame.left + box.width / 2}px`);
    map.style.setProperty('--lit-y', `${box.top - frame.top + box.height / 2}px`);
    map.hidden = false;
    hidden.place();
  }
  life.on(window, 'resize', layMap);
  // One of the map's faint squares, away from the board, is not like the rest:
  // a tag, hidden, for whoever notices it (penny/tags.js). Which square changes
  // from game to game. It is not there while a race is being run.
  const hidden = hideTag(life, {
    main: map.parentElement,
    map,
    board: () => root.querySelector('#board'),
    seed: () => String(online ? online.id : game?.seed),
    allowed: () => Boolean(game) && !el.play.hidden && !(online?.mode === 'trial' && game.status === 'playing'),
  });
  const el = {
    back: $('back'), profile: $('profile'), loading: $('loading'),
    play: $('play'), turn: $('turn'), energy: $('energy'), hearts: $('hearts'), found: $('found'), board: $('board'),
    roster: $('roster'), tools: $('tools'), submit: $('submit'), help: $('help'),
    narration: $('narration'), message: $('message'), newGame: $('new-game'), restart: $('restart'), lostChoice: $('lost-choice'), retryRun: $('retry-run'), revealRun: $('reveal-run'), hint: $('hint'), hintNote: $('hint-note'),
    chatBox: $('chat-box'), chat: $('chat'), chatUnread: $('chat-unread'), chatToggle: $('chat-toggle'), chatCount: $('chat-count'),
    trial: $('trial'), trialTitle: $('trial-title'), trialHint: $('trial-hint'), trialPhrase: $('trial-phrase'),
    trialRuns: $('trial-runs'), trialStart: $('trial-start'), trialShare: $('trial-share'), trialError: $('trial-error'),
    runs: $('runs'), phrase: $('phrase'), phraseNote: $('phrase-note'), phraseEntry: $('phrase-entry'), phraseInput: $('phrase-input'),
    shareGame: $('share-game'), sound: $('sound'), soundMenu: $('sound-menu'), soundFx: $('sound-fx'), soundMusic: $('sound-music'),
  };

  // --- State ----------------------------------------------------------------
  const requested = new URLSearchParams(location.search).get('game');
  const onlineId = requested && UUID.test(requested) ? requested.toLowerCase() : null;

  let game = null; // the game being shown, in the shape game.js uses
  let online = null; // { id, you, room, roomName } for a room game; you is this device's seat
  let busy = false; // a move is on its way to the server
  let pending = 0; // solo-mode crosses sent to the server but not yet confirmed
  const outbox = []; // strokes of crosses shown but not yet sent
  let guessing = null; // the square being opened, while the server is asked what is in it
  let sending = Promise.resolve(); // they go one after another, in order
  let resync = false; // the board shown may be ahead of the server: take its word next time
  // The move being put together, shown on the board but not yet played:
  // { type: 'mark' | 'unmark' | 'guess', cells: [] }. Nothing counts until Submit.
  let draft = null;
  let dragging = false; // a drag is in progress, adding the squares it passes to the draft
  let tool = 'mark';
  let builtFor = null;
  let fresh = true; // the board has just been put on screen: show it as it is, without effects
  const seen = { hearts: null, status: null, mine: null, found: null }; // what was last shown, to spot changes
  let pollTimer = null;
  let chat = null;
  let watcher = null; // live updates for the game's room
  let unread = 0;

  if (!onlineId) {
    game = load(GAME_KEY);
    if (!game || game.v !== 1 || game.players?.length !== 1) game = null;
  }

  // Adopt the server's view of a room game. Its mode is 'coop' (one board for
  // the room, taking turns) or one of the solo modes, where everyone solves
  // their own copy of the same board and results are listed in `runs`:
  // 'trial' (against the clock) and 'phrase' (each post found reveals a token
  // of a hidden phrase, which can also be guessed outright).
  function accept(view) {
    const mode = view.mode ?? 'coop';
    const started = view.started !== false; // a time trial keeps its board back until you start
    game = {
      v: 1, size: view.size, regions: view.regions ?? [], solution: view.solution ?? null, players: view.players,
      cells: view.cells ?? [], hearts: view.hearts ?? START_HEARTS, moves: view.moves ?? 0,
      status: started ? view.status : 'waiting', last: view.last ?? null,
      free: mode !== 'coop', shared: mode === 'coop',
      absent: view.people.flatMap((person, seat) => (person.left ? [seat] : [])), // they left the room
    };
    online = {
      id: view.id, you: view.you, room: view.room, roomName: view.room_name, people: view.people,
      mode, started, runs: view.runs ?? [], author: view.phrase_by ?? null, // who wrote the phrase, if anyone
      // tokens: [{ len, gap, t }] with t null until unlocked (games from before tokens have only `shown`)
      // a pass phrase lost but not yet given up on: the player may still try it again
      revealed: view.revealed !== false, tries: view.tries ?? 1,
      practice: Boolean(view.practice), // the author trying their own board: not ranked
      phrase: mode === 'phrase' ? { tokens: view.tokens ?? null, shown: view.phrase ?? view.phrase_mask, known: Boolean(view.phrase) } : null,
      // the clock: how long it had run when this view was made, and when that was
      clock: view.elapsed_ms == null ? null : { ms: Number(view.elapsed_ms), at: performance.now() },
    };
  }

  // Moves need Submit only when a board is shared; in the solo modes you play alone.
  const immediate = () => !online || online.mode !== 'coop';
  const iCanMove = () => Boolean(online) && canMove(game, online.you);
  const clockText = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  const elapsed = () => (game.status === 'playing' ? online.clock.ms + performance.now() - online.clock.at : online.clock.ms);
  const nameOf = (seat) => (online && seat === online.you ? 'You' : game.players[seat]);

  // --- Solo games -----------------------------------------------------------
  // A new solo puzzle, or (given one to repeat) the same board again from the
  // start: a board is made from its size and seed, so those two bring it back.
  function startSolo(again = null) {
    const seed = again ? again.seed : crypto.getRandomValues(new Uint32Array(1))[0];
    game = newGame({ size: again ? again.size : randomSize(), seed, players: ['You'] });
    hint = null;
    tool = 'mark';
    draft = null;
    builtFor = null;
    save(GAME_KEY, game);
    say('');
    el.narration.textContent = '';
  }

  // --- Keeping in step with the server (room games) -------------------------
  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!online || document.hidden) return;
    pollTimer = setTimeout(poll, pollDelay(watcher, game.status === 'playing' ? 3000 : 6000));
  }

  async function poll() {
    clearTimeout(pollTimer);
    if (!online) return;
    try {
      const [view, room] = await Promise.all([
        // a finished time trial still has a leaderboard to keep up with
        game.status === 'playing' || online.mode !== 'coop' ? rpc('postmarks_get', { p_game: online.id, p_token: myToken() }) : null,
        rpc('room_get', { p_room: online.room, p_token: myToken(), p_after: chat ? chat.lastId : null }),
      ]);
      if (life.over) return; // the screen was left while this was on its way
      // also picks up people joining the room or changing their name
      if (view && !busy && !pending && (resync || (view.moves ?? 0) > game.moves || JSON.stringify(view.people) !== JSON.stringify(online.people)
          || JSON.stringify(view.runs ?? []) !== JSON.stringify(online.runs))) {
        const moved = !resync && (view.moves ?? 0) > game.moves; // after a rejected move, keep its notice on screen
        resync = false;
        accept(view);
        if (moved) announceLast();
        render();
      }
      feedChat(room);
    } catch (error) {
      // Someone deleted the game while it was open here: back to the room.
      if (/game not found/i.test(error.message)) {
        await tell('This game was deleted', { ok: 'Back to the room' });
        if (!life.over) go(roomUrl(online.room), { replace: true });
        return;
      }
      /* otherwise offline or a blip: keep showing what we have and try again */
    }
    if (life.over) return;
    schedulePoll();
  }

  function feedChat(room) {
    if (!room || room.you === null) return;
    const history = !chat; // the first batch is old messages, not news
    if (!chat) {
      chat = createChat(el.chat, {
        roomId: room.id, you: room.you, people: room.people, onSent: () => watcher?.poke(),
      });
    }
    chat.setPeople(room.people);
    const fromOthers = chat.add(room.messages);
    if (!history && fromOthers && (!el.chatBox.open || document.hidden)) unread += fromOthers;
    el.chatBox.hidden = false;
    el.chatToggle.hidden = false;
    showUnread();
  }
  // The chat is opened and shut by a button in the row under the board; how
  // many messages are waiting shows on the button.
  function showUnread() {
    el.chatUnread.textContent = unread ? `· ${unread} new` : '';
    el.chatCount.textContent = unread || '';
    el.chatCount.hidden = !unread;
    el.chatToggle.setAttribute('aria-label', unread ? `Room chat, ${unread} new` : 'Room chat');
  }
  el.chatToggle.addEventListener('click', () => { el.chatBox.open = !el.chatBox.open; });

  el.chatBox.addEventListener('toggle', () => {
    el.chatToggle.setAttribute('aria-expanded', String(el.chatBox.open));
    if (!el.chatBox.open) return;
    unread = 0;
    showUnread();
    el.chatBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const log = el.chat.querySelector('.chat-log');
    if (log) log.scrollTop = log.scrollHeight;
  });

  life.on(document, 'visibilitychange', () => {
    if (!document.hidden && online) poll();
  });
  life.on(window, 'online', () => {
    if (online) poll();
  });

  // --- Board ----------------------------------------------------------------
  function buildBoard(key) {
    const { size, regions } = game;
    el.board.style.setProperty('--n', size);
    el.board.replaceChildren();
    for (let cell = 0; cell < size * size; cell++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.cell = cell;
      button.className = `cell d${regions[cell]}`;
      el.board.append(button);
    }
    builtFor = key;
    fresh = true;
    requestAnimationFrame(layMap);
    setTimeout(layMap, 400); // (and once whatever else is on the page has found its place)
  }

  const where = (cell) => `row ${Math.floor(cell / game.size) + 1}, column ${(cell % game.size) + 1}`;

  function describeLast() {
    const { last } = game;
    if (!last) return '';
    const who = nameOf(last.player);
    const many = last.cells?.length > 1 ? `${last.cells.length} squares` : null;
    if (last.type === 'phrase') return `${who} guessed the phrase “${last.guess}”: ${last.correct ? 'right!' : 'wrong. A heart lost.'}`;
    if (last.type === 'mark') return `${who} crossed out ${many ?? where(last.cell)}.`;
    if (last.type === 'unmark') return `${who} removed the ${many ? `crosses on ${many}` : `cross at ${where(last.cell)}`}.`;
    return last.correct
      ? `${who} found a post at ${where(last.cell)}.${last.crossed ? ` ${last.crossed} more ${last.crossed === 1 ? 'square' : 'squares'} crossed out.` : ''}`
      : `${who} guessed ${where(last.cell)} — no post there. A heart lost.`;
  }

  // The board shows the latest move by itself; this describes it for screen
  // readers only.
  function announceLast() {
    el.narration.textContent = describeLast();
    say('');
  }

  // A visible notice, used only when a tap could not be carried out.
  function say(text) {
    el.message.textContent = text;
  }

  function show(section) {
    for (const candidate of [el.loading, el.trial, el.play]) candidate.hidden = candidate !== section;
  }

  // A time trial's results, best first: finished times, then those still playing
  // or out of hearts.
  function leaderboard(list) {
    // rebuilt only when something in it changed, so rows do not re-animate on every refresh
    const key = JSON.stringify([online.runs, online.people, online.you]);
    list.hidden = online.runs.length === 0;
    if (list.dataset.key === key) return;
    list.dataset.key = key;
    list.replaceChildren(...online.runs.map((run) => {
      const li = document.createElement('li');
      const who = document.createElement('span');
      who.className = 'who';
      who.append(avatar(online.people[run.seat]), online.people[run.seat].name + (run.seat === online.you ? ' (you)' : ''));
      const result = document.createElement('span');
      result.className = `result ${run.status}`;
      result.textContent = run.status === 'lost' ? 'out of hearts' : run.status !== 'won' ? 'playing…'
        : online.mode === 'trial' ? clockText(run.ms)
        : `${run.found} of ${game.size} posts opened${run.tries > 1 ? ` · ${ordinal(run.tries)} try` : ''}`;
      li.append(who, result);
      return li;
    }));
    list.hidden = online.runs.length === 0;
  }

  // The pass phrase as a row of cards, one per token: each letter on the board
  // holds exactly one. A card stays face down, showing only how long its token
  // is, until that letter is found. Tokens that are parts of one word sit
  // joined together.
  function renderPhrase(target) {
    const tokens = online.phrase.tokens
      // games from before tokens: one card per word
      ?? online.phrase.shown.split(' ').map((word) => ({ len: word.length, gap: true, t: word.includes('_') ? null : word }));
    // Cards are updated in place, so one turning over animates once and the
    // rest stay still when the page refreshes.
    while (target.children.length > tokens.length) target.lastElementChild.remove();
    let turned = 0;
    let last = null; // the card that has just turned over
    tokens.forEach((token, i) => {
      const card = target.children[i] ?? target.appendChild(document.createElement('span'));
      const text = token.t === null ? '•'.repeat(token.len) : token.t.toUpperCase();
      if (card.textContent !== text) card.textContent = text;
      const className = ['word', token.t === null && 'hidden', i > 0 && !tokens[i - 1].gap && 'join', !token.gap && i < tokens.length - 1 && 'cont']
        .filter(Boolean).join(' ');
      if (card.className !== className) {
        if (card.classList.contains('hidden') && token.t !== null) {
          turned++;
          last = card;
        }
        card.className = className;
      }
    });
    if (turned) sfx('token', { delay: 300 }); // just after the post that held it opens
    const left = tokens.filter((token) => token.t === null).length;
    if (target === el.phrase && game?.status === 'playing') {
      if (turned && left > 0) askWhatItSays(last);
      else if (!turned && left > 0) meetPhrase(target);
    }
    target.setAttribute('aria-label', left === 0
      ? `The phrase: ${online.phrase.shown}`
      : `The phrase, ${tokens.length} tokens, ${left} still hidden: ${tokens.map((token) => (token.t ?? 'hidden') + (token.gap ? ',' : '')).join(' ')}`);
    target.hidden = false;
  }

  // --- Effects: what each change on the board looks and sounds like ----------------
  const FX = ['fx-post', 'fx-cross', 'fx-clear', 'fx-miss', 'fx-pick', 'fx-reveal'];

  // Restart a one-shot animation class on an element.
  // --- Energy, playing alone ---------------------------------------------------------
  // Every post found is energy at once, and finishing the board entirely earns
  // as much again (shared/energy.js). The meter is this board: how much of all
  // it can earn has been earned; there is no number (the owner's choice), and
  // all that is held is said only to screen readers. A post found sends a spark
  // from it to the end of the bar, which takes it in as it lands; a board
  // finished sends a shower of them.
  let energy = readEnergy(load(ENERGY_KEY));
  const meter = { board: null, count: 0, fill: 0 }; // what the meter shows now
  let landing = Promise.resolve(); // sparks land one after another
  function showMeter(count, fill, gain) {
    meter.count = count;
    meter.fill = fill;
    el.energy.querySelector('.bar i').style.setProperty('--fill', String(fill));
    el.energy.classList.toggle('empty', fill === 0);
    el.energy.setAttribute('aria-label', `Energy ${count}`); // (all that is held, for screen readers: no number on the screen)
    if (gain) replay(el.energy, 'gain');
  }
  // A spark from a square of the board to the meter; resolves as it lands.
  function spark(from, delay = 0) {
    return new Promise((done) => {
      const start = from.getBoundingClientRect();
      const bar = el.energy.querySelector('.bar').getBoundingClientRect();
      const end = { left: bar.left + bar.width * meter.fill, top: bar.top, width: 0, height: bar.height }; // the end the current has reached
      const bit = document.createElement('i');
      bit.className = 'energy-spark';
      bit.setAttribute('aria-hidden', 'true');
      const x0 = start.left + start.width / 2, y0 = start.top + start.height / 2;
      const dx = end.left + end.width / 2 - x0, dy = end.top + end.height / 2 - y0;
      bit.style.left = `${x0}px`;
      bit.style.top = `${y0}px`;
      document.body.append(bit);
      const flight = bit.animate([
        { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 1, offset: 0.18 },
        { transform: `translate(calc(-50% + ${dx * 0.45}px), calc(-50% + ${dy * 0.45 - 60}px)) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.55)`, opacity: 0.9 },
      ], { duration: 720, delay, easing: 'cubic-bezier(0.45, 0, 0.55, 1)', fill: 'both' });
      const landed = () => { bit.remove(); glints(end.left, end.top + end.height / 2); done(); };
      flight.onfinish = landed;
      flight.oncancel = landed;
    });
  }
  // Sparkles thrown off where a spark lands.
  function glints(x, y) {
    for (let i = 0; i < 6; i++) {
      const bit = document.createElement('i');
      bit.className = 'energy-glint';
      bit.setAttribute('aria-hidden', 'true');
      bit.style.left = `${x}px`;
      bit.style.top = `${y}px`;
      document.body.append(bit);
      const angle = -Math.PI / 2 + (i - 2.5) * 0.55 + (Math.random() - 0.5) * 0.4;
      const far = 16 + Math.random() * 18;
      const flight = bit.animate([
        { transform: 'translate(-50%, -50%) scale(0.3) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * far}px), calc(-50% + ${Math.sin(angle) * far}px)) scale(1) rotate(90deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * far * 1.3}px), calc(-50% + ${Math.sin(angle) * far * 1.3 + 8}px)) scale(0.2) rotate(160deg)`, opacity: 0 },
      ], { duration: 520 + Math.random() * 200, easing: 'ease-out', fill: 'both' });
      flight.onfinish = () => bit.remove();
      flight.oncancel = () => bit.remove();
    }
  }
  // The bar taking in what has landed.
  function fillTo(count, fill) {
    showMeter(count, fill, true);
    return new Promise((done) => setTimeout(done, 650));
  }
  // `newly`: the squares just opened as posts, as buttons; `quiet`: a board just put on screen.
  // In a room: a board played together earns for every post found on it, by anyone, and for its finish; a time trial
  // or a pass phrase, for your own run. Not a phrase's author's test run, which counts for nothing.
  const earning = () => Boolean(game) && game.status !== 'waiting' && !(online && (online.practice || online.author === online.you));
  function tallyEnergy(newly, quiet) {
    el.energy.hidden = !earning();
    el.turn.hidden = !online; // (playing alone, the meter is in its place; in a room, beside the words of the turn)
    if (!earning()) return;
    const seed = online ? online.id : game.seed;
    const board = `${game.size}:${seed}`;
    const now = played(energy, { size: game.size, seed, status: game.status, found: lettersFound(game) });
    if (now.gained) {
      energy = now.state;
      save(ENERGY_KEY, energy);
    }
    const count = held(energy);
    const fill = earnedOn(energy, { size: game.size, seed }).energy / most(game.size);
    const still = quiet || meter.board !== board || matchMedia('(prefers-reduced-motion: reduce)').matches || !now.gained;
    meter.board = board;
    if (still) {
      landing = Promise.resolve();
      showMeter(count, fill, false);
      return;
    }
    const before = count - now.gained;
    const postsFill = (earnedOn(energy, { size: game.size, seed }).energy - (now.won ? finish(game.size) : 0)) / most(game.size);
    const sources = newly.length ? newly : [...el.board.querySelectorAll('.cell[data-state="letter"]')].slice(-now.posts);
    landing = landing.then(async () => {
      if (now.posts) {
        await Promise.all(sources.slice(0, now.posts).map((cell, i) => spark(cell, 260 + i * 120)));
        if (life.over) return;
        await fillTo(before + now.posts, postsFill);
      }
      if (now.won) {
        // the whole board, finished: a shower from every post on it, after the board's own moment
        const posts = [...el.board.querySelectorAll('.cell[data-state="letter"]')];
        await Promise.all(posts.map((cell, i) => spark(cell, 450 + i * 90)));
        if (life.over) return;
        await fillTo(count, fill);
        replay(el.energy, 'full');
      }
    });
  }

  function replay(node, name) {
    node.classList.remove(name);
    void node.offsetWidth;
    node.classList.add(name);
  }

  // Given the squares that changed, returns the effect for each (its animation
  // and when it starts) and plays the sounds to match.
  function boardEffects(changes) {
    const effects = new Map();
    const { size } = game;
    const post = changes.find((c) => c.name === 'letter');
    const crossed = changes.filter((c) => c.name === 'cross');

    if (post) {
      // A post is found: it bursts open, and the crosses it brings ripple outwards
      // from it, the nearest first.
      effects.set(post.cell, { name: 'fx-post', delay: 0 });
      const [row, col] = [Math.floor(post.cell / size), post.cell % size];
      const delays = [];
      for (const c of crossed) {
        const distance = Math.hypot(Math.floor(c.cell / size) - row, (c.cell % size) - col);
        const delay = Math.round(280 + distance * 70);
        effects.set(c.cell, { name: 'fx-cross', delay });
        delays.push(delay);
      }
      ripple(post.cell);
      sfx('post');
      sfx('cascade', { delays: delays.sort((x, y) => x - y) });
      pal.rise().mood('thrilled').look(el.board.children[post.cell]).gesture('jump');
      pal.sing(YES, 0.7);
      calm(1700);
    } else if (crossed.length) {
      crossed.forEach((c, i) => effects.set(c.cell, { name: 'fx-cross', delay: i * 35 }));
      sfx('cross', { count: crossed.length });
    }

    const cleared = changes.filter((c) => c.name === 'empty' && c.from === 'cross');
    cleared.forEach((c, i) => effects.set(c.cell, { name: 'fx-clear', delay: i * 35 }));
    if (cleared.length && !post) sfx('clear');

    for (const c of changes) {
      if (c.name === 'miss') {
        effects.set(c.cell, { name: 'fx-miss', delay: 0 });
        sfx('miss');
        pal.rise().mood('sad').look(el.board.children[c.cell]).gesture('sink');
        pal.sing(OOPS, 0.6);
        calm(1500);
      } else if (c.name === 'guess') {
        effects.set(c.cell, { name: 'fx-pick', delay: 0 });
        sfx('pick');
      } else if (c.name === 'reveal') {
        effects.set(c.cell, { name: 'fx-reveal', delay: 500 + effects.size * 90 });
      }
    }
    return effects;
  }

  // A ring that spreads across the whole board from a post just found.
  function ripple(cell) {
    const tile = el.board.children[cell];
    const ring = document.createElement('i');
    ring.className = 'ripple';
    ring.style.left = `${tile.offsetLeft + tile.offsetWidth / 2}px`;
    ring.style.top = `${tile.offsetTop + tile.offsetHeight / 2}px`;
    ring.style.setProperty('--reach', `${el.board.offsetWidth * 2.4}px`);
    el.board.append(ring);
    setTimeout(() => ring.remove(), 1200);
  }

  // Paper confetti for a win.
  function confetti(over = document.body) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colours = ['#f08a76', '#f8d95a', '#7cc46a', '#2aa198', '#9ad3f7', '#5a55c8', '#f3b3e6', '#c8442e'];
    const layer = document.createElement('div');
    layer.className = 'confetti';
    layer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 70; i++) {
      const bit = document.createElement('i');
      bit.style.setProperty('--x', `${Math.random() * 100}vw`);
      bit.style.setProperty('--drift', `${(Math.random() - 0.5) * 30}vw`);
      bit.style.setProperty('--spin', `${(Math.random() - 0.5) * 1400}deg`);
      bit.style.setProperty('--time', `${1.6 + Math.random() * 1.6}s`);
      bit.style.setProperty('--wait', `${Math.random() * 0.5}s`);
      bit.style.background = colours[i % colours.length];
      if (i % 3 === 0) bit.style.borderRadius = '50%';
      layer.append(bit);
    }
    over.append(layer);
    setTimeout(() => layer.remove(), 4200);
  }

  // What feedback sent from this page is filed under.
  const about = () => ({
    game: online?.id ?? null, mode: online?.mode ?? 'solo',
    outcome: game && ['won', 'lost'].includes(game.status) ? game.status : null,
  });
  const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

  // Another go at the same board, where that makes sense: after losing a solo
  // game, or a shared one (which starts a new game in the room on the same
  // board, for everyone). Not in the modes where people are ranked against each
  // other on a board: a second attempt there would not be a fair one.
  function retryOffer(won) {
    if (won) return null;
    if (!online) {
      const again = { size: game.size, seed: game.seed };
      return { label: 'Try this board again', run: () => { if (!life.over) { startSolo(again); render(); } } };
    }
    if (online.mode !== 'coop' || !game.solution) return null;
    const board = { room: online.room, size: game.size, regions: game.regions, solution: game.solution };
    return {
      label: 'Try this board again',
      run: async () => {
        try {
          const fresh = await rpc('postmarks_start', {
            p_room: board.room, p_token: myToken(), p_mode: 'coop', p_size: board.size,
            p_regions: board.regions, p_solution: board.solution, p_phrase: null,
          });
          watcher?.poke();
          if (!life.over) go(gameUrl('postmarks', fresh.id), { replace: true });
        } catch (failure) {
          await tell('Couldn’t start it again', { detail: failure.message });
          if (!life.over) go(roomUrl(board.room));
        }
      },
    };
  }

  // The screen at the end of a game: a send-off that suits the mode, and a
  // chance to say how it went. Leaving it goes back to the room, or, playing
  // alone, on to a new puzzle.
  // --- Pass phrase, out of hearts: try again, or see the phrase ---------------------
  // Losing a pass phrase is not the end until the player says so. While they
  // have not, the phrase and the posts stay hidden, and they may start the
  // board again as often as they like. Choosing to see the phrase ends it.
  const undecided = () => online?.mode === 'phrase' && game?.status === 'lost' && !online.revealed;
  let deciding = false;

  async function decide(choice) {
    if (!undecided() || deciding) return;
    deciding = true;
    say('');
    try {
      const view = await rpc(choice === 'retry' ? 'postmarks_retry' : 'postmarks_reveal', { p_game: online.id, p_token: myToken() });
      if (life.over) return;
      accept(view);
      hint = null;
      draft = null;
      tool = 'mark';
      fresh = true; // show the board as it now is, without playing every change as an effect
      watcher?.poke();
    } catch (failure) {
      say(failure.message);
    }
    deciding = false;
    render();
  }

  async function offerChoice() {
    if (!undecided() || document.querySelector('dialog.ask')) return;
    const choice = await choose('Out of hearts', {
      detail: 'Try the board again, or see the phrase? Once you have seen it, this one is finished.',
      options: [{ label: 'Reveal', value: 'reveal' }, { label: 'Try again', value: 'retry', primary: true }],
    });
    if (choice && !life.over) decide(choice);
  }

  function finale() {
    if (!game || !['won', 'lost'].includes(game.status)) return;
    if (undecided()) {
      offerChoice();
      return;
    }
    if (document.querySelector('dialog.finale')) return;
    const won = game.status === 'won';
    const mode = online?.mode ?? 'solo';
    const found = game.cells.filter((mark) => mark === LETTER).length;
    const spare = game.hearts === START_HEARTS ? 'Not a heart lost.' : `${game.hearts} ${game.hearts === 1 ? 'heart' : 'hearts'} to spare.`;
    const finished = online ? online.runs.filter((run) => run.status === 'won') : [];
    const place = finished.findIndex((run) => run.seat === online?.you) + 1;
    const standing = place === 0 ? '' : finished.length === 1 ? 'First to finish.' : `${ordinal(place)} of ${finished.length} so far.`;
    let title = 'Out of hearts';
    let detail = `${found} of ${game.size} posts delivered.`;
    if (won && mode === 'trial') {
      title = place === 1 && finished.length > 1 ? 'Fastest so far!' : 'Delivered!';
      detail = standing;
    } else if (won && mode === 'phrase') {
      title = 'Phrase solved!';
      detail = `${found === game.size ? 'Every post opened.' : `Only ${found} of ${game.size} posts opened.`} ${online.practice ? 'A test run, so it isn’t ranked.' : standing}`.trim();
    } else if (won && mode === 'coop') {
      title = 'Delivered together!';
      detail = spare;
    } else if (won) {
      title = 'All delivered!';
      detail = spare;
    }
    for (const open of document.querySelectorAll('dialog[open]')) open.close(); // nothing else in the way
    openFinale({
      won, mode, title, detail,
      time: online?.clock ? clockText(elapsed()) : null,
      phrase: online?.phrase?.known ? online.phrase.shown : null,
      people: online ? online.people.filter((person) => !person.left) : [],
      hearts: game.hearts,
      about: about(),
      leave: online ? 'Back to the room' : won ? 'Play again' : 'New puzzle',
      celebrate: confetti,
      retry: retryOffer(won),
      onDone: () => {
        if (online) {
          go(roomUrl(online.room));
        } else if (!life.over) {
          // playing alone there is no room to go back to: straight into the next puzzle
          startSolo();
          render();
        }
      },
    });
  }

  // Effects run once: clear them off a square when they finish.
  el.board.addEventListener('animationend', (event) => {
    if (event.pseudoElement || !event.target.classList?.contains('cell')) return;
    event.target.classList.remove(...FX);
  });

  // --- Hints ------------------------------------------------------------------------
  // The lightbulb points at the next squares that can be crossed out and says
  // why (see hint.js). The pointing stays until those squares are dealt with.
  let hint = null;

  function settleHint() {
    if (!hint) return;
    const waiting = hint.kind === 'uncross' ? CROSS : EMPTY; // what a square looks like while the hint still applies to it
    if (!game || game.status !== 'playing' || hint.cells.every((cell) => game.cells[cell] !== waiting)) hint = null;
  }

  el.hint.addEventListener('click', () => {
    if (!game || game.status !== 'playing') return;
    hint = findHint(game) ?? { kind: 'none', cells: [], because: [], text: 'Nothing left to work out.' };
    sfx('pick');
    if (online?.mode === 'trial') { // asking for help in a race: Penny thinks that is a fine idea
      pal.rise().mood('glad').look(null).gesture('nod');
      pal.sing(YES, 0.5);
      calm(1600);
    }
    render();
    el.hintNote.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  function render() {
    settleHint();
    document.title = `${game && iCanMove() ? '● Your move · ' : ''}Postmarks · correspondence.lol`;

    if (!game) {
      show(el.loading);
      return;
    }

    if (online) {
      el.back.href = roomUrl(online.room);
      el.back.textContent = `← ${online.roomName}`;
      el.profile.hidden = false;
      el.profile.replaceChildren(avatar(online.people[online.you]));
    }
    if (online && online.mode !== 'coop' && !online.started) {
      const wrote = online.author === online.you;
      if (online.mode === 'phrase' && !wrote) {
        startRun(); // nothing to wait for: straight to your own board
        show(el.loading);
        return;
      }
      // A time trial waits for Start. A phrase's author watches the results, and
      // may try the board for themselves: a test run, which is not ranked.
      el.trialTitle.textContent = online.mode === 'trial' ? 'Time trial' : 'Pass phrase';
      el.trialHint.textContent = online.mode === 'trial'
        ? 'A friendly race. Everyone solves the same board on their own and the quickest comes first, but it’s only for fun: take a hint whenever you like. Three wrong guesses put you out. Your clock starts when you press Start.'
        : 'You wrote this one. Everyone else solves the board on their own, and each post they find shows them one token. You can test the board yourself: it won’t count.';
      el.trialStart.hidden = false;
      el.trialStart.lastChild.textContent = wrote ? 'Test your board' : 'Start';
      if (online.phrase) renderPhrase(el.trialPhrase);
      else el.trialPhrase.hidden = true;
      leaderboard(el.trialRuns);
      show(el.trial);
      return;
    }

    show(el.play);
    const boardKey = `${online ? online.id : game.seed}:${game.size}`;
    if (builtFor !== boardKey) buildBoard(boardKey);

    pruneDraft();
    const over = game.status !== 'playing';
    const found = lettersFound(game);

    // Squares: work out what each should show, then apply it, animating what changed
    const quiet = fresh; // a board arriving on screen does so without fanfare
    fresh = false;
    const squares = [...el.board.querySelectorAll('.cell')].map((button) => {
      const cell = Number(button.dataset.cell);
      // squares in the draft are shown as they would be once submitted
      const drafted = Boolean(draft?.cells.includes(cell));
      const mark = drafted && draft.type !== 'guess' ? (draft.type === 'mark' ? CROSS : EMPTY) : game.cells[cell];
      let name = 'empty';
      let content = '';
      let label = 'empty';
      if (mark === CROSS) [name, content, label] = ['cross', '×', 'crossed out'];
      else if (mark === MISS) [name, content, label] = ['miss', '×', 'wrong guess'];
      else if (mark === LETTER) [name, content, label] = ['letter', ENVELOPE, 'post found'];
      if (drafted && draft.type === 'guess') [name, content, label] = ['guess', ENVELOPE, 'your guess, not yet submitted'];
      else if (drafted) label += ', not yet submitted';
      if (game.status === 'lost' && game.solution && mark !== LETTER && isLetterCell(game, cell)) {
        [name, content, label] = ['reveal', ENVELOPE, 'a post was here'];
      }
      return { button, cell, drafted, name, content, label, from: button.dataset.state };
    });
    const effects = quiet ? new Map() : boardEffects(squares.filter((s) => s.from !== s.name));
    const opened = squares.filter((s) => s.name === 'letter' && s.from !== 'letter' && s.from !== undefined).map((s) => s.button);
    for (const { button, cell, drafted, name, content, label, from } of squares) {
      if (from !== name) {
        button.dataset.state = name;
        button.innerHTML = content;
        button.classList.remove(...FX);
        const effect = effects.get(cell);
        if (effect) {
          button.style.setProperty('--d', `${effect.delay}ms`);
          void button.offsetWidth; // so the same effect can play again on a square
          button.classList.add(effect.name);
        }
      }
      // the outline marks the last submitted move on a shared board, whoever made it;
      // playing alone it would only be clutter
      const shown = online?.mode === 'coop' && game.last;
      button.classList.toggle('last', Boolean(shown) && !draft && (game.last.cells ?? [game.last.cell]).includes(cell));
      button.classList.toggle('drawing', drafted);
      button.classList.toggle('guessing', guessing === cell);
      button.classList.toggle('hinted', Boolean(hint) && hint.cells.includes(cell));
      button.classList.toggle('why', Boolean(hint) && hint.because.includes(cell));
      button.setAttribute('aria-label', `${where(cell)}, ${DISTRICTS[game.regions[cell]]} district, ${label}`);
    }
    el.board.setAttribute('aria-disabled', String(over || (Boolean(online) && !iCanMove())));
    el.board.classList.toggle('busy', busy);

    // Heads-up display
    if (seen.hearts !== game.hearts) {
      const lost = !quiet && seen.hearts !== null && game.hearts < seen.hearts;
      el.hearts.replaceChildren(...Array.from({ length: START_HEARTS }, (_, i) => {
        const heart = document.createElement('span');
        heart.textContent = i < game.hearts ? '♥' : '♡';
        if (lost && i >= game.hearts && i < seen.hearts) heart.className = 'break'; // the one just lost
        return heart;
      }));
      if (lost) sfx('heart');
      seen.hearts = game.hearts;
    }
    el.hearts.setAttribute('aria-label', `${game.hearts} of ${START_HEARTS} hearts left`);
    tallyEnergy(opened, quiet);
    el.found.textContent = `${found}/${game.size} posts`;
    if (seen.found !== found) {
      if (!quiet && seen.found !== null && found > seen.found) replay(el.found, 'bump');
      seen.found = found;
    }

    // The end of the game, and (in a shared game) the move coming round to you
    if (seen.status !== game.status) {
      const settle = effects.size ? 750 : 0; // let the last move's own effects land first
      if (!quiet && seen.status === 'playing' && game.status === 'won') {
        sfx('win', { delay: settle });
        setTimeout(confetti, settle);
        const letter = online?.mode === 'phrase'; // somebody's letter, read: it takes that in before it is glad
        setTimeout(() => {
          clearTimeout(calming);
          if (letter) {
            pal.rise().mood('surprised').look(el.phrase);
            pal.sing(GASP, 0.6);
          } else {
            pal.rise().mood('glad').look(null).gesture('jump').hearts(3);
            pal.sing(TRILL, 0.9);
          }
        }, settle + 200);
        if (letter) {
          setTimeout(() => {
            pal.mood('listening');
            pal.sing(LONGING, 0.75);
          }, settle + 900);
          setTimeout(() => pal.mood('glad').look(null).hearts(3), settle + 2100);
        }
        // the board has its moment first; and playing alone, its energy has landed on the meter
        const moment = new Promise((done) => setTimeout(done, settle + (letter ? 2600 : 1700)));
        Promise.all([moment, landing.then(() => new Promise((done) => setTimeout(done, 500)))]).then(() => { if (!life.over) finale(); });
      } else if (!quiet && seen.status === 'playing' && game.status === 'lost') {
        sfx('lose', { delay: 450 });
        setTimeout(finale, 1900);
        setTimeout(() => {
          clearTimeout(calming);
          if (online?.mode === 'trial') { // out of a race: an oops, and no more than that
            pal.rise().mood('unsure').look(null).gesture('wiggle');
            pal.sing(OOPS, 0.6);
            setTimeout(() => pal.mood('glad').hearts(1), 1100);
            return;
          }
          pal.rise().mood('sad').look(null).gesture('sink');
          pal.sing(SAG, 0.6);
        }, 500);
      }
      el.board.classList.toggle('won', game.status === 'won');
      el.board.classList.toggle('lost', game.status === 'lost');
      seen.status = game.status;
    }
    const mine = Boolean(online) && online.mode === 'coop' && iCanMove();
    if (seen.mine !== mine) {
      if (!quiet && mine && seen.mine === false) {
        sfx('turn', { delay: effects.size ? 500 : 0 });
        replay(el.turn, 'bump');
      }
      seen.mine = mine;
    }

    el.turn.replaceChildren();
    if (online?.mode === 'trial') {
      el.turn.textContent = game.status === 'won' ? `Finished in ${clockText(elapsed())}`
        : game.status === 'lost' ? 'Out of hearts.' : clockText(elapsed());
    } else if (online?.mode === 'phrase') {
      el.turn.textContent = game.status === 'won' ? 'Phrase solved!' : game.status === 'lost' ? 'Out of hearts.' : '';
    } else if (game.status === 'won') {
      el.turn.textContent = 'All delivered — you win!';
    } else if (game.status === 'lost') {
      el.turn.textContent = 'Out of hearts.';
    } else if (!online) {
      el.turn.textContent = ''; // playing alone: it is always your move
    } else if (iCanMove()) {
      const strong = document.createElement('strong');
      strong.textContent = 'Your';
      el.turn.append(strong, ' move');
    } else {
      const others = game.players.filter((_, seat) => seat !== online.you && !game.absent.includes(seat));
      el.turn.textContent = others.length === 0 ? 'Waiting for someone to join'
        : others.length === 1 ? `Waiting for ${others[0]}`
        : 'Waiting for someone else to move';
    }

    // A shared game lists everyone in the room, with those who may move next
    // standing out. The solo modes show results instead.
    const solo = Boolean(online) && online.mode !== 'coop';
    el.roster.hidden = !online || solo;
    if (online && !solo) {
      el.roster.replaceChildren(...online.people.flatMap((person, seat) => {
        if (person.left) return []; // no longer in the room
        const li = document.createElement('li');
        li.append(avatar(person), person.name + (seat === online.you ? ' (you)' : ''));
        if (canMove(game, seat)) li.className = 'now';
        return [li];
      }));
    }
    el.runs.hidden = !solo;
    if (solo) leaderboard(el.runs);

    // Pass phrase: the phrase so far, and who wrote it
    const phrase = online?.phrase;
    el.phrase.hidden = !phrase;
    el.phraseNote.hidden = !(phrase && online.author !== null);
    if (phrase) {
      renderPhrase(el.phrase);
      el.phraseNote.textContent = online.practice ? 'You wrote this phrase.'
        : `${online.people[online.author]?.name ?? 'Someone'} wrote this phrase.`;
    }
    el.shareGame.hidden = !online;

    // Tools, and the buttons that play or discard the draft
    // Submit belongs to shared room games, and only while the move is yours
    el.submit.hidden = over || immediate() || !iCanMove();
    el.submit.disabled = !draft || busy;
    el.phraseEntry.hidden = !(phrase && tool === 'phrase' && !over);
    el.tools.querySelector('[data-tool="phrase"]').hidden = !phrase;
    el.tools.hidden = over;
    // (a hint is there in a race as well: the race is for fun)
    el.hint.hidden = over;
    el.hintNote.hidden = !hint || over;
    if (hint) el.hintNote.textContent = hint.text;
    for (const button of el.tools.children) {
      button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    }
    // Room games go back to the room with the arrow at the top; only a solo
    // game needs a way to start over.
    el.lostChoice.hidden = !undecided();
    el.retryRun.disabled = el.revealRun.disabled = deciding;
    el.newGame.hidden = Boolean(online);
    el.restart.hidden = !game || (Boolean(online) && !online.practice) || (game.moves === 0 && !over); // nothing to start over yet
    el.newGame.title = over ? 'Play again' : 'New game';
    el.newGame.setAttribute('aria-label', el.newGame.title);
  }

  // --- Taking a turn --------------------------------------------------------
  // May the person at this device act right now? Says why not if they can't.
  function ready() {
    if (!game || game.status !== 'playing' || busy) return false;
    if (online && !iCanMove()) {
      say('You made the last move, so someone else goes next.');
      return false;
    }
    return true;
  }

  // Take a turn: one stroke of crosses, one stroke clearing crosses, or a guess.
  async function play(type, cells, text) {
    if (!ready()) return;
    const move = { player: online ? online.you : 0, type, cells };
    // Crosses can be worked out here, so they appear at once; a guess in a room
    // game has to wait for the server, which is the only one who knows the answer.
    const local = (type === 'guess' || type === 'phrase') && online ? null : applyMove(game, move);
    if (local && !local.ok) {
      say(local.error);
      return;
    }

    if (!online) {
      game = local.state;
      tool = 'mark'; // each turn starts on the safe tool, so a stray tap never costs a heart
      save(GAME_KEY, game);
      announceLast();
      render();
      return;
    }

    // Playing alone, crosses are shown at once and sent in the background, so the
    // next tap never waits on the last one.
    if (online.mode !== 'coop' && local) {
      game = local.state;
      render();
      pending++;
      // Held back for a moment before it is sent: if this tap turns out to be
      // the first half of a double tap, the guess that follows makes it moot,
      // and sending it would only make the guess wait its turn.
      const queued = { type, cells, sent: false, dropped: false };
      outbox.push(queued);
      setTimeout(() => send(queued), DOUBLE_TAP_MS + 30);
      return;
    }

    busy = true;
    if (local) game = local.state; // show the crosses now; the server confirms below
    if (type === 'guess' && online.mode !== 'coop') {
      // a cross of this same square still waiting to go is the tap before this one: forget it
      for (const queued of outbox) {
        if (!queued.sent && queued.cells.length === 1 && queued.cells[0] === cells[0]) {
          queued.dropped = true;
          pending--;
        }
      }
      guessing = cells[0]; // the square shows it is being opened while the server answers
    }
    for (const queued of [...outbox]) send(queued); // anything else waiting goes now, ahead of the guess
    render();
    try {
      await sending; // any crosses still on their way go first
      accept(type === 'phrase'
        ? await rpc('postmarks_guess_phrase', { p_game: online.id, p_token: myToken(), p_phrase: text })
        : await rpc('postmarks_play', { p_game: online.id, p_token: myToken(), p_type: type, p_cells: cells }));
      if (type === 'phrase') el.phraseInput.value = '';
      tool = 'mark';
      announceLast();
      watcher?.poke();
    } catch (error) {
      say(error.message);
      resync = true; // undo anything shown early by taking the server's board
    } finally {
      busy = false;
      guessing = null;
      render();
      poll();
    }
  }

  // leaving the screen with crosses still held back: send them on the way out
  life.onEnd(() => { for (const queued of [...outbox]) send(queued); });

  // Send one held-back stroke of crosses (see play). They go one after another, in order.
  function send(queued) {
    const at = outbox.indexOf(queued);
    if (at >= 0) outbox.splice(at, 1);
    if (queued.sent || queued.dropped) return;
    queued.sent = true;
    sending = sending
      .then(() => rpc('postmarks_play', { p_game: online.id, p_token: myToken(), p_type: queued.type, p_cells: queued.cells }))
      .then((view) => {
        pending--;
        if (!pending && !busy && !life.over) {
          accept(view);
          render();
        }
      }, (error) => {
        pending = 0;
        say(error.message);
        resync = true; // take the server's board back
        poll();
      });
  }

  // --- Putting a move together -------------------------------------------------
  // Tapping and dragging only edit the draft. A draft is either crosses to add,
  // crosses to remove, or one guess; Submit plays it and ends the turn.

  // Drop anything from the draft that the board no longer allows (for instance
  // because another player moved while it was being put together).
  function pruneDraft() {
    if (!draft) return;
    const fits = (cell) => {
      const mark = game.cells[cell];
      if (draft.type === 'mark') return mark === EMPTY;
      if (draft.type === 'unmark') return mark === CROSS;
      return mark === EMPTY || mark === CROSS;
    };
    const allowed = game.status === 'playing' && (!online || iCanMove());
    draft.cells = allowed ? draft.cells.filter(fits) : [];
    if (!draft.cells.length) draft = null;
  }

  // Add a square to a draft of crosses, starting one if need be. Returns whether
  // the square went in.
  function draftCross(cell) {
    const mark = game.cells[cell];
    const type = mark === EMPTY ? 'mark' : mark === CROSS ? 'unmark' : null;
    if (!type) return false;
    if (draft?.type === 'guess') draft = null; // crosses replace a drafted guess
    if (draft && draft.type !== type) return false; // one kind of change per turn
    draft ??= { type, cells: [] };
    if (!draft.cells.includes(cell)) draft.cells.push(cell);
    return true;
  }

  function undraft(cell) {
    draft.cells = draft.cells.filter((c) => c !== cell);
    if (!draft.cells.length) draft = null;
  }

  const cellAt = (x, y) => {
    const button = document.elementFromPoint(x, y)?.closest?.('.cell');
    return button && el.board.contains(button) ? Number(button.dataset.cell) : null;
  };

  // Each new press starts the move over: a tap drafts one square, a drag drafts
  // every square it passes, and whatever was drafted before is discarded.
  // A second tap on the same square, soon after the first, guesses a post there.
  // (The first tap will have crossed the square, or cleared its cross; a guess
  // is allowed either way.)
  let lastTap = { cell: null, at: 0 };
  const DOUBLE_TAP_MS = 350;

  function guessAt(cell) {
    if (!ready()) return;
    say('');
    if (game.cells[cell] === LETTER || game.cells[cell] === MISS) {
      say('That square is already settled.');
    } else if (immediate()) {
      draft = null;
      play('guess', [cell]);
      return;
    } else {
      draft = { type: 'guess', cells: [cell] }; // a guess replaces whatever was drafted
    }
    render();
  }

  el.board.addEventListener('pointerdown', (event) => {
    if (tool !== 'mark' || !event.isPrimary || event.button !== 0) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (cell === null) return;
    const again = cell === lastTap.cell && event.timeStamp - lastTap.at < DOUBLE_TAP_MS;
    lastTap = again ? { cell: null, at: 0 } : { cell, at: event.timeStamp };
    if (again) {
      dragging = false;
      guessAt(cell);
      return;
    }
    if (!ready()) return;
    say('');
    draft = null;
    if (draftCross(cell)) dragging = true;
    else say('That square is already settled.');
    render();
  });

  life.on(window, 'pointermove', (event) => {
    if (!dragging || !event.isPrimary) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (cell !== null && !draft.cells.includes(cell) && draftCross(cell)) render();
  });

  // Play the draft. In a room this is what Submit does. Alone there is no turn
  // to end, so every move is played as soon as it is made and there is no Submit.
  function submitDraft() {
    if (!draft) return;
    const { type, cells, text } = draft;
    draft = null;
    play(type, cells, text);
  }

  // Pass phrase: guess the whole phrase. Played at once, like every solo move.
  el.phraseEntry.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = el.phraseInput.value.trim();
    if (text) play('phrase', [], text);
  });

  life.on(window, 'pointerup', () => {
    if (dragging && immediate()) submitDraft();
    dragging = false;
  });

  life.on(window, 'pointercancel', () => {
    dragging = false;
  });

  // Clicks cover what the pointer handlers above do not: guesses, and crosses
  // made from the keyboard (a keyboard "click" has detail 0). The keyboard has
  // no drag, so there each press adds a square to the draft or takes it back.
  el.board.addEventListener('click', (event) => {
    const button = event.target.closest('.cell');
    if (!button) return;
    const cell = Number(button.dataset.cell);
    if (tool !== 'guess' && event.detail !== 0) return;
    if (tool === 'guess' && event.detail > 1) return; // the second click of a double tap: already guessed
    if (!ready()) return;
    say('');
    const settled = game.cells[cell] === LETTER || game.cells[cell] === MISS;
    if (settled) {
      say('That square is already settled.');
    } else if (tool === 'guess') {
      const same = draft?.type === 'guess' && draft.cells[0] === cell;
      draft = same ? null : { type: 'guess', cells: [cell] }; // a guess replaces whatever was drafted
    } else if (draft?.type !== 'guess' && draft?.cells.includes(cell)) {
      undraft(cell);
    } else {
      draftCross(cell);
    }
    if (immediate()) submitDraft();
    else render();
  });

  // From the keyboard, where there is no double tap: Enter opens the square in
  // focus. (Space crosses it, as a click does.)
  el.board.addEventListener('keydown', (event) => {
    const button = event.target.closest?.('.cell');
    if (!button || event.key !== 'Enter' || event.repeat) return;
    event.preventDefault();
    guessAt(Number(button.dataset.cell));
  });

  el.submit.addEventListener('click', submitDraft);

  // Arrow keys move between squares.
  el.board.addEventListener('keydown', (event) => {
    const button = event.target.closest('.cell');
    if (!button || !game) return;
    const { size } = game;
    const cell = Number(button.dataset.cell);
    const row = Math.floor(cell / size);
    const col = cell % size;
    let next = null;
    if (event.key === 'ArrowUp' && row > 0) next = cell - size;
    else if (event.key === 'ArrowDown' && row < size - 1) next = cell + size;
    else if (event.key === 'ArrowLeft' && col > 0) next = cell - 1;
    else if (event.key === 'ArrowRight' && col < size - 1) next = cell + 1;
    if (next === null) return;
    event.preventDefault();
    el.board.children[next].focus();
  });

  el.tools.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tool]');
    if (!button) return;
    tool = tool === button.dataset.tool ? 'mark' : button.dataset.tool; // pressed again, it is put away
    render();
    if (tool === 'phrase') el.phraseInput.focus();
  });

  // --- Solo modes: your own copy of the board ---------------------------------
  // A time trial starts when its Start button is pressed; a pass phrase starts
  // as soon as it is opened.
  let starting = false;

  async function startRun() {
    if (starting) return;
    starting = true;
    el.trialStart.disabled = true;
    el.trialError.textContent = '';
    try {
      accept(await rpc('postmarks_trial_start', { p_game: online.id, p_token: myToken() }));
      if (online.mode === 'trial') {
        sfx('start');
        // a race, and Penny is all for it: this is a game, not a hurry
        pal.rise().mood('thrilled').look(null).gesture('wiggle');
        pal.sing(THIS_WAY, 0.6);
        calm(1500);
      }
      render();
      greet();
      watcher?.poke();
    } catch (error) {
      el.trialError.textContent = error.message;
      el.loading.textContent = error.message;
    } finally {
      starting = false;
      el.trialStart.disabled = false;
    }
  }

  el.trialStart.addEventListener('click', startRun);

  // The clock ticks on screen between updates from the server.
  setInterval(() => {
    if (online?.mode === 'trial' && online.started && game.status === 'playing') el.turn.textContent = clockText(elapsed());
  }, 500);

  // --- Sharing this game --------------------------------------------------------
  // The link opens the game for room members; anyone else is taken through
  // joining the room first and then brought here.
  async function shareGame(button) {
    const url = location.origin + gameUrl('postmarks', online.id);
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      button.title = 'Link copied';
      if (button === el.shareGame) say('Link to this game copied.');
      else button.textContent = 'Link copied';
    } catch (error) {
      if (error?.name !== 'AbortError') prompt('Copy this link to share the game', url);
    }
  }

  el.shareGame.addEventListener('click', () => shareGame(el.shareGame));
  el.trialShare.addEventListener('click', () => shareGame(el.trialShare));

  // The animated how-to opens the first time this device shows a given room
  // game. Playing alone it opens once, the first time ever: after that a new
  // puzzle just starts. (It is always there under the question mark.)
  function greet() {
    if (online?.mode === 'trial') return; // the clock is running: no interruptions
    if (!online) {
      if (load(SOLO_HOWTO_KEY)) return;
      save(SOLO_HOWTO_KEY, true);
    } else {
      if (load(HOWTO_KEY) === online.id) return;
      save(HOWTO_KEY, online.id);
    }
    if (game.status !== 'playing') return;
    if (online?.mode === 'coop') openTogether(); // (a board for the whole room: what is particular to that)
    else openHowTo(giveFeedback);
  }

  const giveFeedback = () => openFeedback(about());
  el.help.addEventListener('click', () => openHowTo(giveFeedback));

  // Sound: a small menu with effects and music switched on or off separately,
  // each remembered on this device.
  function showSound() {
    el.soundFx.checked = !isMuted();
    el.soundMusic.checked = !isMusicOff();
    const silent = isMuted() && isMusicOff();
    el.sound.title = silent ? 'Sound is off' : 'Sound';
    el.sound.classList.toggle('off', silent);
  }

  function soundMenu(open) {
    el.soundMenu.hidden = !open;
    el.sound.setAttribute('aria-expanded', String(open));
  }

  el.sound.addEventListener('click', () => soundMenu(el.soundMenu.hidden));
  el.soundFx.addEventListener('change', () => {
    setMuted(!el.soundFx.checked);
    showSound();
    sfx('cross'); // a taste of what was just switched on
  });
  el.soundMusic.addEventListener('change', () => {
    setMusicOff(!el.soundMusic.checked);
    showSound();
  });
  // a tap anywhere else, or Escape, puts the menu away
  life.on(document, 'pointerdown', (event) => {
    if (!el.soundMenu.hidden && !event.target.closest('.sound-wrap')) soundMenu(false);
  });
  life.on(document, 'keydown', (event) => {
    if (event.key === 'Escape' && !el.soundMenu.hidden) {
      soundMenu(false);
      el.sound.focus();
    }
  });
  life.on(document, 'soundchange', showSound); // switched from the profile menu
  showSound();

  el.profile.addEventListener('click', () => {
    openProfile({
      person: online.people[online.you],
      onSave: async ({ name, avatar: face, color }) => {
        await rpc('room_profile', { p_room: online.room, p_token: myToken(), p_name: name, p_avatar: face, p_color: color });
        setMyName(name);
        resync = true; // take the server's view, which now has the new profile
        watcher?.poke();
        await poll();
      },
    });
  });

  el.retryRun.addEventListener('click', () => decide('retry'));
  el.revealRun.addEventListener('click', () => decide('reveal'));

  // Start this same board over.
  let resetting = false;
  el.restart.addEventListener('click', async () => {
    if (!game || resetting || (online && !online.practice)) return;
    if (game.status === 'playing' && !(await ask('Start this board over?', { detail: 'Your marks and hearts go back to the start.', yes: 'Start over', no: 'Keep playing' }))) return;
    if (life.over) return;
    if (!online) {
      startSolo({ size: game.size, seed: game.seed });
      render();
      return;
    }
    // The author's test run of their own pass phrase board.
    resetting = true;
    say('');
    try {
      const view = await rpc('postmarks_retry', { p_game: online.id, p_token: myToken() });
      if (life.over) return;
      accept(view);
      hint = null;
      draft = null;
      tool = 'mark';
      fresh = true;
      watcher?.poke();
    } catch (failure) {
      say(failure.message);
    }
    resetting = false;
    render();
  });

  el.newGame.addEventListener('click', async () => {
    if (game?.status === 'playing' && game.moves > 0
      && !(await ask('Start a new game?', { detail: 'This one will be left unfinished.', yes: 'New game', no: 'Keep playing' }))) return;
    if (life.over) return;
    startSolo();
    render();
    greet();
  });

  applyPatterns(); // the choice made in the profile menu

  // --- Start ----------------------------------------------------------------
  render();
  if (onlineId) {
    rpc('postmarks_get', { p_game: onlineId, p_token: myToken() })
      .then((view) => {
        if (life.over) return;
        if (view.you === null) {
          // games are for room members: join first, then come straight back here
          go(`${roomUrl(view.room)}&game=${view.id}`, { replace: true });
          return;
        }
        accept(view);
        watcher = watchRoom(view.room, poll);
        life.onEnd(() => watcher.stop());
        life.onEnd(watchPresence(view.room)); // no notifications about a game that is on screen
        announceLast();
        render();
        greet();
        poll();
      })
      .catch((error) => {
        if (life.over) return;
        el.loading.textContent = `${error.message} `;
        const home = document.createElement('a');
        home.href = '/';
        home.textContent = 'Back to the start';
        el.loading.append(home);
      });
  } else if (game) {
    announceLast();
  } else {
    startSolo(); // nothing to set up: opening the page starts a puzzle
    render();
    greet();
  }
}
