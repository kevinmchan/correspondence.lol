import { rpc } from '/shared/api.js';
import { go } from '/shared/nav.js';
import { play as sfx } from '/postmarks/sound.js';
import { myName, myToken, recentRooms, rememberRoom, roomUrl, setMyName } from '/shared/identity.js';
import { asCode, claim, codeInAddress, giveUpOn } from '/shared/handoff.js';
import { AVATARS, COLORS, avatar, openProfile, savedLook } from '/shared/profile.js';
import { cachedProfile, fetchProfile, saveProfile, startAfresh } from '/shared/account.js';

// The home screen. mount() puts it to work in `root`, a fresh copy of its
// template; everything it starts ends with `life` (see shared/screen.js).
export function mount(root, life) {
  const $ = (id) => root.querySelector(`#${id}`);
  const { setTimeout } = life; // timers that stop when the screen leaves
  document.title = 'correspondence.lol';
  window.homeBanner?.(root); // the install banner belongs to this screen

  const form = $('create-room');
  const nameInput = $('my-name');
  const roomInput = $('room-name');
  const error = $('create-error');
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
  const nameField = $('my-name-field');
  const joinForm = $('join-room');
  // The lobby: big buttons, and a sheet for each thing that needs a word typed in.
  const menu = $('menu');
  const sheets = { open: $('open-dialog'), join: $('join-dialog') };
  for (const [name, sheet] of Object.entries(sheets)) {
    $(`menu-${name}`).addEventListener('click', () => {
      sheet.querySelector('.message').textContent = '';
      sheet.showModal();
      sheet.querySelector('input:not([hidden])')?.focus();
    });
    sheet.addEventListener('click', (event) => {
      if (event.target === sheet || event.target.closest('[data-close]')) sheet.close();
    });
  }
  const joinCode = $('join-code');
  const joinError = $('join-error');
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
    // the name is asked for when opening a first room, and lives on the profile after that
    nameField.hidden = Boolean(name);
    nameInput.required = !name;
    nameInput.value = name;
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
      const started = savedLook() ?? { avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)], color: Math.floor(Math.random() * COLORS.length) };
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

  // --- Joining a room with its code -----------------------------------------------
  joinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = joinCode.value.replace(/[^0-9a-z]/gi, '');
    joinError.textContent = '';
    if (code.length !== 6) {
      joinError.textContent = 'A room code is six letters and digits, like ABC-123.';
      return;
    }
    const button = joinForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const room = await rpc('room_join_code', { p_code: code, p_name: myName(), p_token: myToken() });
      rememberRoom(room.id, room.name);
      go(roomUrl(room.id));
    } catch (failure) {
      joinError.textContent = failure.message;
      button.disabled = false;
    }
  });

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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = myName() || nameInput.value.trim();
    if (!name) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    error.textContent = '';
    try {
      const room = await rpc('room_create', {
        p_room_name: roomInput.value.trim() || `${name}’s room`.slice(0, 40),
        p_name: name,
        p_token: myToken(),
      });
      setMyName(name);
      rememberRoom(room.id, room.name);
      go(roomUrl(room.id));
    } catch (failure) {
      error.textContent = failure.message;
      button.disabled = false;
    }
  });

  // The version, small and out of the way at the bottom of the page.
  $('version').textContent = self.APP_VERSION ?? '';

  // --- Penny and Dot --------------------------------------------------------------
  // The two in the bottom corner mostly just breathe and blink (that is all CSS).
  // Every so often one of them does something small, they glance toward wherever
  // the page was last touched, and a tap on either gets a hop and a heart.
  const critters = $('critters');
  if (critters && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const penny = critters.querySelector('.penny');
    const dot = critters.querySelector('.dot');
    const once = (who, name) => {
      who.classList.remove('hop', 'wiggle', 'glow');
      void who.getBoundingClientRect(); // so the same move can play twice running
      who.classList.add(name);
      who.addEventListener('animationend', () => who.classList.remove(name), { once: true });
    };
    const heart = (who) => {
      const box = who.getBoundingClientRect();
      const home = critters.getBoundingClientRect();
      const span = document.createElement('span');
      span.className = 'heart';
      span.textContent = '♥';
      span.style.left = `${box.left - home.left + box.width / 2 - 5}px`;
      span.style.top = `${box.top - home.top - 6}px`;
      critters.append(span);
      setTimeout(() => span.remove(), 1400);
    };
    const idle = () => {
      if (document.visibilityState === 'visible') {
        const roll = Math.random();
        if (roll < 0.3) once(penny, 'wiggle');
        else if (roll < 0.5) once(dot, 'hop');
        else if (roll < 0.7) once(penny, 'glow');
        else if (roll < 0.85) once(dot, 'wiggle');
        else { once(penny, 'hop'); setTimeout(() => once(dot, 'hop'), 180); } // one sets the other off
      }
      setTimeout(idle, 7000 + Math.random() * 9000);
    };
    setTimeout(idle, 5000);
    for (const who of [penny, dot]) {
      who.addEventListener('click', () => {
        once(who, 'hop');
        heart(who);
      });
    }
    // a glance toward the last touch: the eyes shift a pixel or two that way
    life.on(window, 'pointerdown', (event) => {
      const home = critters.getBoundingClientRect();
      const dx = event.clientX - (home.left + home.width / 2);
      const dy = event.clientY - (home.top + home.height / 2);
      const far = Math.hypot(dx, dy) || 1;
      for (const eyes of critters.querySelectorAll('.eyes')) eyes.style.translate = `${(dx / far) * 1.6}px ${(dy / far) * 1.2}px`;
    }, { passive: true });
  }

  // --- The mark and the background ----------------------------------------------------
  // Quieter than Penny and Dot, in that order: the mark stirs every twenty
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
      if (event.target.closest('button, a, input, textarea, label, form, section, li, nav, svg, .critters, .install-banner, h1')) return;
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
