import { rpc } from '/shared/api.js';
import { go } from '/shared/nav.js';
import { play as sfx } from '/postmarks/sound.js';
import { myName, recentRooms, roomUrl } from '/shared/identity.js';
import { asCode, claim, codeInAddress, giveUpOn } from '/shared/handoff.js';
import { avatar, openProfile, randomLook, savedLook } from '/shared/profile.js';
import { cachedProfile, fetchProfile, saveProfile, startAfresh } from '/shared/account.js';
import { load, save } from '/shared/identity.js';
import { ASK, HELLO, PLEASE, SIGH, THIS_WAY, TRILL, hasWalked, placeReached } from '/penny/penny.js';
import { claim as callPal } from '/penny/pal.js';
import { notesHeard, playMail, remembered } from '/penny/mail.js';

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
    if (!noProfile()) showRooms();
  }

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

  function showRooms() {
    const recent = recentRooms();
    rooms.hidden = recent.length === 0;
    rooms.querySelector('ul').replaceChildren(...recent.map((room) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = roomUrl(room.id);
      const name = document.createElement('strong');
      name.textContent = room.name;
      const when = document.createElement('span');
      when.textContent = `Last opened ${new Date(room.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
      a.append(name, when);
      li.append(a);
      return li;
    }));
  }
  showMe();
  if (!noProfile()) showRooms();

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

  // --- Penny and Dot --------------------------------------------------------------
  // They are not on the page. Penny stands at the bottom edge of the window
  // (penny/pal.js), life size, with Dot beside her, and looks up at this page
  // the way one looks at a map. Mostly she just watches, her eyes over the
  // edge. But there are things she wants, and since she cannot say so, she
  // comes up and shows it:
  //
  //   The portal, top left: a place on the map she wants to take you to
  //   (penny/walk.js). Until the first places have been walked she keeps
  //   coming back to it: she calls, walks along the edge to stand under it,
  //   looks up at it and back at you. Now and then she stops to remember the
  //   sound she is looking for, and it can be heard, far off.
  //
  //   The app installed. Once you have been through a portal with her, she
  //   stands under the Install button and pleads. It is asked a few times, at
  //   longer and longer intervals, then left alone; a no is taken as a no for
  //   the rest of the visit. Nothing waits on it.
  //
  // A tap on her does whatever she is asking for at that moment; with nothing
  // asked, it opens her story (penny/story.js). Those moves are made without
  // the usual sound, so the next thing heard is her.
  const portal = $('portal');
  const pal = callPal(life, { x: 0.7, height: 'peek', mood: 'calm' });
  const wait = (ms) => new Promise((done) => setTimeout(done, ms));
  const quiet = () => document.visibilityState !== 'visible' || Boolean(document.querySelector('dialog[open], #splash'));
  const installButton = () => root.querySelector('.install-banner [data-act="install"]');
  const canInstall = () => ['ready', 'guide'].includes(window.installState?.()) && Boolean(installButton());
  const SAID_NO_KEY = 'penny:install-no'; // for this visit only
  const saidNo = () => { try { return sessionStorage.getItem(SAID_NO_KEY) === '1'; } catch { return false; } };
  let asking = null; // what she is showing you just now: 'portal' | 'install' | null
  let pleas = 0;
  let turn = 0; // which of her wants is being shown: so that one does not start while another is going on

  portal.classList.toggle('calm', hasWalked());
  const flare = (what, name) => {
    if (!what) return;
    what.classList.remove(name);
    void what.getBoundingClientRect();
    what.classList.add(name);
  };
  const settle = () => {
    asking = null;
    pal.mood('calm').height('peek').goTo(0.7).look(null);
  };

  // What she is looking for: a sound, a long way off. She shuts her eyes to
  // remember it, and for a moment it is there.
  async function remember() {
    pal.mood('sleepy').look(null);
    pal.look(pal.penny, 'dot');
    await wait(500);
    await playMail(life, remembered(0.92), () => pal.glow(0.9));
    pal.mood('hopeful').look(null, 'dot');
    await wait(500);
  }

  async function showPortal(mine) {
    asking = 'portal';
    pal.rise().mood('hopeful').look(null).gesture('hop');
    pal.sing(HELLO, 0.85);
    await wait(1300);
    if (mine !== turn) return;
    if (notesHeard() === 0 || Math.random() < 0.4) await remember();
    if (mine !== turn) return;
    pal.mood('hopeful').pointAt(portal);
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
    pleas += 1;
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
    pal.look(button).gesture('hop2');
    flare(button, 'wanted');
    await wait(2400);
    if (mine === turn) settle();
  }

  // Being let in. She is as glad as she gets.
  async function celebrate() {
    const mine = ++turn;
    asking = null;
    pal.rise().goTo(0.6).mood('thrilled').look(null).gesture('jump').hearts(3);
    pal.sing(TRILL, 1);
    await wait(700);
    pal.gesture('hop', 'dot').hearts(1, 'dot');
    await wait(900);
    if (mine !== turn) return;
    pal.gesture('jump');
    pal.sing(THIS_WAY, 1);
    await wait(2600);
    if (mine === turn) pal.mood('glad').height('peek').goTo(0.7);
  }

  life.on(window, 'install', (event) => {
    const what = event.detail?.what;
    if (what === 'installed') {
      celebrate();
    } else if (what === 'asked') {
      // you pressed it: she can hardly look
      turn += 1;
      asking = 'install';
      pal.rise().mood('thrilled').gesture('jump');
    } else if (what === 'declined') {
      // a no is a no: she feels it, and lets it be
      turn += 1;
      try { sessionStorage.setItem(SAID_NO_KEY, '1'); } catch { /* she will simply ask once more next time */ }
      pal.mood('sad').gesture('sink');
      pal.sing(SIGH, 0.6);
      setTimeout(settle, 2600);
    } else if (what === 'closed') {
      // the steps have been read: she waits, hoping
      turn += 1;
      pleas = 3;
      pal.mood('hopeful').look(null);
      setTimeout(settle, 3000);
    }
  });

  // The first time the app is opened as an app.
  const HOME_KEY = 'penny:at-home:v1';
  if (window.installState?.() === 'installed' && load(HOME_KEY) !== true) {
    save(HOME_KEY, true);
    setTimeout(() => { if (!quiet()) celebrate(); }, 2600);
  }

  // Her wants, one at a time, with long rests between.
  (async () => {
    await wait(3200);
    let since = 0; // portal showings since she last pleaded
    let gap = 20000; // how long she leaves it before pleading again: twice as long each time
    let notBefore = 0;
    for (;;) {
      if (!quiet() && asking === null) {
        const been = hasWalked() || placeReached() > 0;
        const mayPlead = canInstall() && !saidNo() && pleas < 3 && been && performance.now() >= notBefore;
        const mine = ++turn;
        if (mayPlead && (hasWalked() || since >= 1 || pleas === 0)) {
          since = 0;
          await plead(mine);
          notBefore = performance.now() + gap;
          gap *= 2;
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
    if (asking === 'install' || (hasWalked() && canInstall() && !saidNo())) {
      window.requestInstall?.();
      return;
    }
    if (!hasWalked()) pal.sing(HELLO, 0.9);
    setTimeout(() => go(hasWalked() ? '/?penny' : '/?walk', { quiet: true }), 300);
  });
  pal.onTap(() => pal.gesture('hop', 'dot').hearts(1, 'dot'), 'dot');
  // they glance toward wherever the page was last touched
  life.on(window, 'pointerdown', (event) => {
    if (event.target.closest?.('.pal')) return;
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
