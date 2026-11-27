import { rpc } from '/shared/api.js';
import { go } from '/shared/nav.js';
import { play as sfx } from '/postmarks/sound.js';
import { gameUrl, myName, myToken, recentRooms, roomUrl } from '/shared/identity.js';
import { feedOf, wordsFor } from '/shared/feed.js';
import { asCode, claim, codeInAddress, giveUpOn } from '/shared/handoff.js';
import { avatar, openProfile, randomLook, savedLook } from '/shared/profile.js';
import { roomLook } from '/shared/place.js';
import { cachedProfile, fetchProfile, saveProfile, startAfresh } from '/shared/account.js';
import { load, save } from '/shared/identity.js';
import { BAR, ENERGY_KEY, held, read as readEnergy, reelFound } from '/shared/energy.js';
import { poster as marcusPoster } from '/penny/marcus.js';
import { earned as meadowOwned, wear, wearing } from '/shared/meadow.js';
import { ASK, BEGINNING, HELLO, PLEASE, SIGH, THIS_WAY, TRILL, hasDot, hasWalked, placeReached, playAt } from '/penny/penny.js';
import { claim as callPal } from '/penny/pal.js';
import { playMail, remembered } from '/penny/mail.js';
import { showKept } from '/penny/tags.js';

// How Penny's asking has gone this visit. It is kept here, outside the screen,
// because the screen is made afresh every time the home page is come back to:
// three asks for the app to be installed is three for the visit, not three for
// each return from a room.
const visit = { pleas: 0, gap: 20000, notBefore: 0, remembered: false };

// The home screen. mount() puts it to work in `root`, a fresh copy of its
// template; everything it starts ends with `life` (see shared/screen.js).
export function mount(root, life) {
  const $ = (id) => root.querySelector(`#${id}`);
  const { setTimeout } = life; // timers that stop when the screen leaves
  document.title = 'correspondence.lol';
  window.homeBanner?.(root); // the install banner belongs to this screen

  const rooms = $('rooms');

  // --- Who this device is -------------------------------------------------------
  // An account (the server calls it a profile), or (after signing out, or after the profile
  // became an account on another device) nobody yet.
  const me = {
    card: $('me'), edit: $('me-edit'),
    name: $('me-name'), kind: $('me-kind'),
  };
  // With no account on the device, the page is only the two ways to get one:
  // create one, or sync one with a code from another device.
  const welcome = {
    section: $('welcome'), note: $('welcome-note'),
    form: $('welcome-new'), name: $('welcome-name'),
    error: $('welcome-new-error'),
    codeForm: $('welcome-code'), code: $('welcome-code-text'),
    codeNote: $('welcome-code-note'),
  };
  // No profile: signed out, or a device that has never had a name, a room or a sign-in.
  const noProfile = () => {
    const profile = cachedProfile();
    return Boolean(profile.signed_out) || (!profile.signed_in && !myName() && recentRooms().length === 0);
  };
  // The lobby: big tiles. Opening and joining a room each have a screen of their own (rooms.js).
  const menu = $('menu');
  const play = $('play'); // the one wide button: a board of your own, at once
  // But everybody goes through the story once first: the introduction
  // (penny/hello.js), the film, and the first places (penny/walk.js), where
  // the rules are shown one at a time. Until those have been walked, play goes
  // on with the story from wherever it was left (penny/penny.js, playAt); the
  // first time, that is the beginning. After that play is a board, and the
  // story is the portal's, at the foot of the page, which always goes back to
  // its beginning.
  // Under it, energy: one bar for everything earned in every game, and the meadow at its end (shared/meadow.js).
  const energyRow = $('home-energy');
  const meadowMark = $('meadow');
  function showEnergy() {
    const state = readEnergy(load(ENERGY_KEY));
    const mine = meadowOwned();
    const fill = (state.earned % BAR) / BAR;
    const bar = $('home-bar');
    bar.querySelector('.bar i').style.setProperty('--fill', String(fill));
    bar.classList.toggle('empty', fill === 0);
    bar.setAttribute('aria-label', mine ? `Energy ${held(state)}` : `Energy ${held(state)}; the meadow at ${BAR}`);
    meadowMark.disabled = !mine;
    meadowMark.setAttribute('aria-pressed', String(mine && wearing()));
    meadowMark.setAttribute('aria-label', mine ? 'The meadow, in rooms' : 'The meadow, when the bar is full');
  }
  meadowMark.addEventListener('click', () => {
    if (meadowMark.disabled) return;
    wear(!wearing());
    showEnergy();
    if (wearing()) {
      meadowMark.classList.remove('bloom');
      void meadowMark.offsetWidth;
      meadowMark.classList.add('bloom');
    }
  });
  const look = () => savedLook() ?? { avatar: '🙂', color: 0 };
  // Sent here from a room's join screen to sync an account first: go back after.
  const next = new URLSearchParams(location.search).get('next');
  const onward = () => (next && /^\/(room|postmarks)\/\?[\w=&-]+$/.test(next) ? next : null);

  function showMe() {
    const profile = cachedProfile();
    const none = noProfile();
    welcome.section.hidden = !none;
    welcome.note.hidden = !profile.signed_out;
    me.card.hidden = none;
    menu.hidden = none;
    play.hidden = none;
    play.setAttribute('href', playAt());
    energyRow.hidden = none;
    if (!none) showEnergy();
    showTabs();
    if (none) {
      rooms.hidden = true;
      return;
    }
    const name = myName();
    me.edit.replaceChildren(avatar(look()));
    me.name.textContent = name || 'You';
    const n = recentRooms().length;
    me.kind.textContent = n === 0 ? 'No rooms yet' : n === 1 ? '1 room' : `${n} rooms`;
  }

  async function refresh() {
    try {
      await fetchProfile();
    } catch {
      /* offline: what was remembered stays on screen */
    }
    showMe();
    if (!noProfile()) {
      showRooms();
      loadFeed();
    }
  }

  // --- The two tabs: the feed, and everything else ------------------------------------
  // The feed is what is waiting on you in your rooms: games played together
  // in which it is your move, and time trials and pass phrases you have been
  // asked to (shared/feed.js). The lobby is the rest of the page. Which was
  // up last is remembered; someone with rooms starts on the feed.
  const TAB_KEY = 'home:tab:v1';
  const FEED_KEY = 'home:feed:v1'; // the feed as it last was, to show at once
  const tabs = { bar: $('tabs'), feed: $('tab-feed'), lobby: $('tab-lobby'), feedPanel: $('panel-feed'), lobbyPanel: $('panel-lobby'), count: $('feed-count') };
  const feed = { list: $('feed'), empty: $('feed-empty'), note: $('feed-empty-note'), reels: $('feed-reels') };
  const MODE_TILES = { move: '#f08a76', running: '#7cc46a', invite: '#9ad3f7' };
  const modeIcon = (mode) => document.getElementById('screen-room').content.querySelector(`.mode[data-mode="${mode}"] svg`)?.cloneNode(true) ?? document.createElement('span');
  let tab = null;
  let items = Array.isArray(load(FEED_KEY)) ? load(FEED_KEY) : [];
  let loaded = false; // the server has answered at least once this visit

  function showTabs() {
    const none = noProfile();
    tabs.bar.hidden = none;
    if (none) {
      tabs.feedPanel.hidden = true;
      tabs.lobbyPanel.hidden = false; // the way in is on it
      return;
    }
    tab ??= ['feed', 'lobby'].includes(load(TAB_KEY)) ? load(TAB_KEY) : recentRooms().length ? 'feed' : 'lobby';
    for (const name of ['feed', 'lobby']) {
      tabs[name].setAttribute('aria-selected', String(tab === name));
      tabs[name].tabIndex = tab === name ? 0 : -1;
      tabs[`${name}Panel`].hidden = tab !== name;
    }
    showFeed();
  }
  function pick(name, { focus = false } = {}) {
    tab = name;
    save(TAB_KEY, name);
    showTabs();
    if (focus) tabs[name].focus();
    if (name === 'feed') loadFeed();
  }
  tabs.feed.addEventListener('click', () => pick('feed'));
  tabs.lobby.addEventListener('click', () => pick('lobby'));
  tabs.bar.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') pick(tab === 'feed' ? 'lobby' : 'feed', { focus: true });
  });

  function showFeed() {
    tabs.count.hidden = items.length === 0;
    tabs.count.textContent = items.length > 9 ? '9+' : String(items.length);
    tabs.feed.setAttribute('aria-label', items.length ? `Feed, ${items.length} waiting` : 'Feed');
    feed.list.replaceChildren(...items.map((item) => {
      const words = wordsFor(item);
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.className = 'feed-item';
      a.href = gameUrl('postmarks', item.id);
      a.dataset.kind = item.kind;
      a.style.setProperty('--tile', MODE_TILES[item.kind]);
      const tile = document.createElement('span');
      tile.className = 'tile';
      tile.setAttribute('aria-hidden', 'true');
      tile.append(item.who ? avatar(item.who) : modeIcon(item.mode));
      const text = document.createElement('span');
      text.className = 'words';
      const tag = document.createElement('em');
      tag.textContent = words.tag;
      const title = document.createElement('strong');
      title.textContent = words.title;
      const detail = document.createElement('span');
      detail.textContent = `${item.room.name} · ${words.detail}`;
      text.append(tag, title, detail);
      const playTile = document.createElement('span');
      playTile.className = 'play';
      playTile.setAttribute('aria-hidden', 'true');
      playTile.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5.2v13.6l11-6.8z" fill="currentColor"/></svg>';
      a.append(tile, text, playTile);
      li.append(a);
      return li;
    }));
    lightRooms();
    // Marcus Pell's reel, once half a bar of energy is earned: under what is waiting, and not counted with it.
    const reel = reelFound(readEnergy(load(ENERGY_KEY)));
    feed.reels.hidden = !reel;
    if (!reel) feed.reels.replaceChildren();
    else if (!feed.reels.firstChild) {
      feed.reels.innerHTML = `<li><a href="/?reel" class="feed-item feed-reel"><span class="poster" aria-hidden="true">${marcusPoster()}</span>`
        + '<span class="words"><em>Reel</em><strong>marcus.pell</strong><span>Real talk about who gets to climb 🪜</span></span>'
        + '<span class="play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.2v13.6l11-6.8z" fill="currentColor"/></svg></span></a></li>';
    }
    feed.empty.hidden = items.length > 0;
    feed.note.textContent = recentRooms().length === 0 ? 'Open or join a room in the lobby to play with friends.'
      : loaded ? 'Nothing is waiting on you. Start a game in one of your rooms.' : 'Looking in your rooms…';
  }

  // Ask each room what is in it. (The most recent dozen: the rest are a tap away in the lobby.)
  let fetchingFeed = false;
  async function loadFeed() {
    if (fetchingFeed || noProfile() || document.hidden) return;
    const recent = recentRooms().slice(0, 12);
    if (recent.length === 0) {
      items = [];
      loaded = true;
      showFeed();
      return;
    }
    fetchingFeed = true;
    // (no chat is wanted, so it asks for none: only messages after one that does not exist)
    const answers = await Promise.all(recent.map((room) => rpc('room_get', { p_room: room.id, p_token: myToken(), p_after: 9007199254740991 }).catch(() => undefined)));
    fetchingFeed = false;
    if (life.over) return;
    if (answers.every((answer) => answer === undefined)) { // offline: what was remembered stays
      showFeed();
      return;
    }
    items = feedOf(answers);
    loaded = true;
    save(FEED_KEY, items);
    showFeed();
  }
  life.setInterval(loadFeed, 30000);
  life.on(document, 'visibilitychange', loadFeed);

  me.edit.addEventListener('click', () => {
    openProfile({ person: { name: myName(), ...look() }, onSave: async (person) => { await saveProfile(person); showMe(); } });
  });
  // Create an account, with a look to start with (it can be changed).
  welcome.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = welcome.name.value.trim();
    if (!name) return;
    const button = welcome.form.querySelector('button');
    button.disabled = true;
    welcome.error.textContent = '';
    try {
      if (cachedProfile().signed_out) startAfresh(); // leave the old profile's device behind
      const started = savedLook() ?? randomLook();
      await saveProfile({ name, avatar: started.avatar, color: started.color });
      welcome.name.value = '';
      const to = onward();
      if (to) go(to);
      else {
        showMe();
        showRooms();
        loadFeed();
      }
    } catch (failure) {
      welcome.error.textContent = failure.message;
    }
    button.disabled = false;
  });

  // Sync an account from another device: this device joins it.
  welcome.codeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = asCode(welcome.code.value);
    welcome.codeNote.textContent = '';
    if (!code) {
      welcome.codeNote.textContent = 'A code is eight letters and digits, like K7M2-QP4X.';
      return;
    }
    const button = welcome.codeForm.querySelector('button');
    button.disabled = true;
    try {
      await claim(code);
      welcome.code.value = '';
      await refresh();
      const to = onward();
      if (to) go(to);
    } catch (failure) {
      welcome.codeNote.textContent = failure.message;
    }
    button.disabled = false;
  });

  // A building with something waiting on you in it has its light on. (The
  // feed is what says so, in words; this is the same thing seen from outside.)
  function lightRooms() {
    const waiting = new Set(items.map((item) => item.room?.id));
    for (const lot of rooms.querySelectorAll('.lot-link')) {
      lot.classList.toggle('lit', waiting.has(lot.dataset.room));
      lot.querySelector('.waiting').hidden = !waiting.has(lot.dataset.room);
    }
  }

  function showRooms() {
    const recent = recentRooms();
    rooms.hidden = recent.length === 0;
    // Each is a building on the street, seen from in front: a little shop in
    // the colour the room keeps, and the board over its window carries its name
    // (two lines of it at most; room/room.css). Its kind is where its door is.
    rooms.querySelector('ul').replaceChildren(...recent.map((room) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      const look = roomLook(room.id);
      a.className = `lot-link r${look.colour} k${look.kind}`;
      a.dataset.room = room.id;
      a.href = roomUrl(room.id);
      const name = document.createElement('strong');
      name.textContent = room.name;
      // (the street is in the order they were last opened: the date is said only to screen readers)
      const when = document.createElement('span');
      when.className = 'sr-only';
      when.textContent = `, last opened ${new Date(room.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
      const waiting = document.createElement('span');
      waiting.className = 'sr-only waiting';
      waiting.textContent = ', something is waiting on you';
      waiting.hidden = true;
      const top = document.createElement('span');
      top.className = 'shop-roof';
      const front = document.createElement('span');
      front.className = 'shop-front';
      front.setAttribute('aria-hidden', 'true');
      front.innerHTML = '<i class="shop-glass"></i><i class="shop-door"></i>';
      a.append(top, name, when, waiting, front);
      li.append(a);
      return li;
    }));
    lightRooms();
  }
  showMe();
  if (!noProfile()) showRooms();
  // (the feed is asked for by refresh(), below, once the list of rooms is the server's own)

  // --- Arriving from the Home Screen icon ---------------------------------------
  async function bringAcross(code) {
    try {
      await claim(code);
      await refresh();
      return true;
    } catch (failure) {
      if (!failure.message.startsWith('Can’t reach')) giveUpOn(code); // expired or another device's: stop trying on every start
      return false;
    }
  }

  // The installed app, opened from an icon that carries a code: hand it in.
  // After that the two share a profile, and the server's list of rooms is enough.
  const carried = codeInAddress();
  if (carried) {
    history.replaceState(null, '', location.pathname + location.search);
    bringAcross(carried).then((ok) => { if (!ok) refresh(); });
  } else {
    refresh();
  }

  // The version, small and out of the way at the bottom of the page.
  $('version').textContent = self.APP_VERSION ?? '';

  // --- Penny ----------------------------------------------------------------------
  // Penny is not on the page. Penny stands at the bottom edge of the window
  // (penny/pal.js), life size, and looks up at this page the way one looks at
  // a map; once Dot has been found, Dot stands beside it. Mostly Penny just
  // watches, eyes over the edge, ducked right down wherever something of the
  // page's is under it. But there are two things Penny wants, and since it
  // cannot say so, it comes up and shows them:
  //
  //   The portal, at the foot of the page: a place on the map Penny wants to take you to,
  //   the story from its beginning (penny/hello.js). Until the first places have been walked Penny keeps
  //   coming back to it: calls, walks along the edge to stand beside the
  //   portal, looks at it and back at you. The first time in a visit, and
  //   sometimes after, Penny stops to remember the sound it is looking for,
  //   and the sound can be heard, far off.
  //
  //   The app installed. Once you have been through a portal with Penny, it
  //   stands under the Install button and pleads: three times in a visit at
  //   most, twice as long apart each time, and not at all once the browser's
  //   prompt has been turned down. Nothing waits on it.
  //
  // A tap on Penny while it is asking for the app to be installed is a yes to
  // that. Any other tap goes through the portal with it: the story, from the beginning.
  // Those moves are made without the usual sound, so the next thing heard is
  // Penny.
  const portal = $('portal');
  const pal = callPal(life, { x: 0.7, height: 'peek', mood: 'calm', dot: hasDot() }); // it is alone until Dot is found, a quarter of the way through (penny/walk.js)
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const quiet = () => document.visibilityState !== 'visible' || Boolean(document.querySelector('dialog[open], #splash'));
  const installButton = () => root.querySelector('.install-banner [data-act="install"]');
  const canInstall = () => ['ready', 'guide'].includes(window.installState?.()) && Boolean(installButton());
  const SAID_NO_KEY = 'penny:install-no'; // for this visit only
  const saidNo = () => { try { return sessionStorage.getItem(SAID_NO_KEY) === '1'; } catch { return false; } };
  let asking = null; // what it is doing just now: showing the 'portal', asking for the 'install', being 'glad'; or nothing
  let turn = 0; // which of its wants is being shown: so that one does not start while another is going on

  portal.classList.toggle('calm', hasWalked());
  // Where Penny stands to show the portal: just clear of it, on its right.
  const beside = () => {
    const at = portal.getBoundingClientRect();
    const wide = pal.penny.getBoundingClientRect().width;
    return (at.right + wide / 2 + 10) / window.innerWidth;
  };
  showKept(root); // tags that have been found in the game are kept on this map (penny/tags.js)
  // The page is the map from far up: line its squares up with the dots behind
  // the page, and note where the portal is, for the way through it (walk.css).
  const map = root.querySelector('.home-map');
  const lineUp = () => {
    const main = map.parentElement.getBoundingClientRect();
    const pitch = 0.875 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    const top = main.top + window.scrollY;
    map.parentElement.style.setProperty('--map-y', `${-(top % pitch)}px`);
    const at = portal.getBoundingClientRect();
    const frame = root.getBoundingClientRect();
    document.documentElement.style.setProperty('--portal-x', `${at.left + at.width / 2 - frame.left}px`);
    document.documentElement.style.setProperty('--portal-y', `${at.top + at.height / 2 - frame.top}px`);
  };
  lineUp();
  setTimeout(lineUp, 400); // once the banner and whatever else has settled
  life.on(window, 'resize', lineUp);
  const flare = (what, name) => {
    if (!what) return;
    what.classList.remove(name);
    void what.getBoundingClientRect();
    what.classList.add(name);
  };
  // Back to waiting: its eyes over the edge, or ducked right down where
  // something of the page's is under it.
  const settle = () => {
    asking = null;
    pal.mood('calm').goTo(0.7).look(null).settle('peek');
  };
  setTimeout(() => { if (asking === null) pal.settle('peek'); }, 500);
  // The page moving under it, or being pressed, while it is up over part of
  // it: it gets out of the way at once.
  let scrolled = null;
  const mind = () => {
    if (asking !== null && pal.inTheWay) {
      turn += 1;
      settle();
    } else if (asking === null) {
      pal.settle('peek');
    }
  };
  life.on(window, 'scroll', () => {
    clearTimeout(scrolled);
    scrolled = setTimeout(mind, 140);
  }, { passive: true });
  life.on(window, 'resize', mind);

  // What it is looking for: a sound, a long way off. It shuts its eyes to
  // remember it, and for a moment it is there.
  async function remember(mine) {
    pal.mood('sleepy').look(null);
    pal.look(pal.penny, 'dot');
    await wait(500);
    if (mine !== turn) return;
    await playMail(life, remembered(0.92), () => { if (mine === turn) pal.glow(0.9); });
    if (mine !== turn) return; // something else has come up meanwhile: it is not put back to hoping over that
    pal.mood('hopeful').look(null, 'dot');
    await wait(500);
  }

  async function showPortal(mine) {
    asking = 'portal';
    pal.rise().mood('hopeful').look(null).gesture('hop');
    pal.sing(HELLO, 0.85);
    await wait(1300);
    if (mine !== turn) return;
    // the first time in a visit, and sometimes after, it stops to remember what it is looking for
    if (!visit.remembered || Math.random() < 0.4) {
      visit.remembered = true;
      await remember(mine);
    }
    if (mine !== turn) return;
    pal.mood('hopeful').goTo(beside()); // (not under it: the portal is down where Penny stands, and Penny would cover it)
    setTimeout(() => { if (mine === turn) pal.look(portal); }, 350);
    await wait(1500);
    if (mine !== turn) return;
    flare(portal, 'called');
    pal.sing(ASK, 0.85);
    await wait(1700);
    if (mine !== turn) return;
    pal.look(null).mood('warm').gesture('hop');
    pal.sing(THIS_WAY, 0.85);
    await wait(2400);
    if (mine !== turn) return;
    pal.look(portal);
    await wait(2200);
    if (mine === turn) settle();
  }

  async function plead(mine) {
    const button = installButton();
    if (!button) return;
    asking = 'install';
    visit.pleas += 1;
    pal.rise().mood('pleading').pointAt(button);
    await wait(1300);
    if (mine !== turn) return;
    flare(button, 'wanted');
    pal.sing(PLEASE, 0.85);
    await wait(1900);
    if (mine !== turn) return;
    pal.look(null).gesture('hop');
    await wait(1700);
    if (mine !== turn) return;
    pal.look(button).gesture('hop');
    flare(button, 'wanted');
    await wait(2400);
    if (mine === turn) settle();
  }

  // Being let in. It is as glad as it gets.
  async function celebrate() {
    const mine = ++turn;
    asking = 'glad'; // (not nothing: nothing is what lets its other wants take a turn)
    pal.rise().goTo(0.6).mood('thrilled').look(null).gesture('jump').hearts(3);
    pal.sing(TRILL, 1);
    await wait(700);
    pal.gesture('hop', 'dot').hearts(1, 'dot');
    await wait(900);
    if (mine !== turn) return;
    pal.gesture('jump');
    pal.sing(THIS_WAY, 1);
    await wait(2600);
    if (mine !== turn) return;
    asking = null;
    pal.mood('glad').goTo(0.7).settle('peek');
  }

  life.on(window, 'install', (event) => {
    const what = event.detail?.what;
    if (what === 'installed') {
      celebrate();
    } else if (what === 'asked') {
      // you pressed it: it can hardly look
      const mine = ++turn;
      asking = 'install';
      pal.rise().mood('thrilled').gesture('jump');
      // (should no answer ever come back from the browser, Penny does not wait on tiptoe for ever)
      setTimeout(() => { if (mine === turn) settle(); }, 45000);
    } else if (what === 'declined') {
      // a no is a no: it feels it, and lets it be
      turn += 1;
      try { sessionStorage.setItem(SAID_NO_KEY, '1'); } catch { /* it will simply ask once more next time */ }
      pal.mood('sad').gesture('sink');
      pal.sing(SIGH, 0.6);
      setTimeout(settle, 2600);
    } else if (what === 'closed') {
      // the steps have been read: it waits, hoping
      turn += 1;
      visit.pleas = 3;
      pal.mood('hopeful').look(null);
      setTimeout(settle, 3000);
    }
  });

  // The first time the app is opened as an app.
  const HOME_KEY = 'penny:at-home:v1';
  if (window.installState?.() === 'installed' && load(HOME_KEY) !== true) {
    setTimeout(() => {
      if (quiet()) return; // not now: the next time the app is opened, then
      save(HOME_KEY, true);
      celebrate();
    }, 2600);
  }

  // Its wants, one at a time, with long rests between.
  (async () => {
    await wait(3200);
    let since = 0; // portal showings since it last pleaded
    while (!life.over) {
      if (!quiet() && asking === null) {
        const been = hasWalked() || placeReached() > 0;
        const mayPlead = canInstall() && !saidNo() && visit.pleas < 3 && been && performance.now() >= visit.notBefore;
        const mine = ++turn;
        if (mayPlead && (hasWalked() || since >= 1 || visit.pleas === 0)) {
          since = 0;
          await plead(mine);
          visit.notBefore = performance.now() + visit.gap; // and twice as long before the next
          visit.gap *= 2;
        } else if (!hasWalked()) {
          since += 1;
          await showPortal(mine);
        } else if (canInstall() && !saidNo() && Math.random() < 0.3) {
          // at rest, a glance up at it now and then
          pal.mood('hopeful').look(installButton());
          await wait(1400);
          if (mine === turn) pal.mood('calm').look(null);
        } else {
          // nothing wanted: the small life of two creatures waiting
          const roll = Math.random();
          if (roll < 0.35) pal.gesture('wiggle');
          else if (roll < 0.6) pal.gesture('hop', 'dot');
          else if (roll < 0.8) { pal.glow(0.8); setTimeout(() => { if (mine === turn) pal.mood('calm'); }, 900); }
          else { pal.gesture('hop'); setTimeout(() => pal.gesture('hop', 'dot'), 180); } // one sets the other off
        }
      }
      await wait(6000 + Math.random() * 5000);
    }
  })();

  pal.onTap(() => {
    turn += 1;
    pal.gesture('hop');
    if (asking === 'install') {
      window.requestInstall?.();
      return;
    }
    if (!hasWalked()) pal.sing(HELLO, 0.9);
    setTimeout(() => go(BEGINNING, { quiet: true }), 300); // through the portal with it: the story from the beginning
  });
  pal.onTap(() => pal.gesture('hop', 'dot').hearts(1, 'dot'), 'dot');
  // they glance toward wherever the page was last touched
  life.on(window, 'pointerdown', (event) => {
    if (event.target.closest?.('.pal')) return;
    if (asking !== null && pal.inTheWay) {
      turn += 1;
      settle();
    }
    const at = { x: event.clientX, y: event.clientY };
    pal.look(at, 'dot');
    if (asking === null) pal.look(at);
  }, { passive: true });

  // --- The mark and the background ----------------------------------------------------
  // Quieter than Penny and Dot (who are not on the page at all), in that order: the mark stirs every twenty
  // seconds or so and opens its flap when tapped; the background shows a faint
  // tile where it is tapped, and one somewhere by itself only rarely.
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const mark = root.querySelector('svg.mark');
    const act = (name) => {
      mark.classList.remove('stir', 'open');
      void mark.getBoundingClientRect();
      mark.classList.add(name);
      setTimeout(() => mark.classList.remove(name), 1300);
    };
    mark.addEventListener('click', () => {
      act('open');
      sfx('token'); // paper, then two bells: a letter opened
    });
    const stir = () => {
      if (document.visibilityState === 'visible' && !mark.classList.contains('open')) act('stir');
      setTimeout(stir, 18000 + Math.random() * 12000);
    };
    setTimeout(stir, 11000);

    const TILES = ['#f08a76', '#f8d95a', '#7cc46a', '#2aa198', '#9ad3f7', '#736dd0', '#f3b3e6', '#9c6f4b', '#cdd6dd'];
    // The dots behind the page are 1.75rem apart: a tile sits on that grid, two dots wide.
    const pitch = 1.75 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    const ghost = (pageX, pageY, faint) => {
      const tile = document.createElement('div');
      tile.className = faint ? 'ghost-tile faint' : 'ghost-tile';
      const size = pitch * 2 - 6;
      tile.style.width = tile.style.height = `${size}px`;
      tile.style.left = `${Math.floor(pageX / (pitch * 2)) * pitch * 2 + pitch / 2 + 3}px`;
      tile.style.top = `${Math.floor(pageY / (pitch * 2)) * pitch * 2 + pitch / 2 + 3}px`;
      tile.style.setProperty('--tile', TILES[Math.floor(Math.random() * TILES.length)]);
      document.body.append(tile);
      setTimeout(() => tile.remove(), faint ? 2700 : 1600);
    };
    // a tap that lands on nothing in particular
    life.on(document, 'pointerdown', (event) => {
      if (!event.isPrimary || document.querySelector('dialog[open], #splash')) return;
      if (event.target.closest('button, a, input, textarea, label, form, section, li, nav, svg, .pal, .install-banner, h1')) return;
      ghost(event.pageX, event.pageY, false);
      sfx('pick');
    });
    const drift = () => {
      if (document.visibilityState === 'visible' && !document.querySelector('dialog[open], #splash')) {
        ghost(Math.random() * innerWidth, scrollY + Math.random() * innerHeight, true);
      }
      setTimeout(drift, 30000 + Math.random() * 20000);
    };
    setTimeout(drift, 22000);
  }
}
