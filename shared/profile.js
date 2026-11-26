import { rpc } from './api.js';
import { copyable, prettyCode } from './handoff.js';
import { load, myToken, save } from './identity.js';
import { isMusicOff, isMuted, setMusicOff, setMuted } from '/postmarks/sound.js';
import { forgetStory, storyBegun } from '/penny/penny.js';
import { ask as askFirst } from './ask.js';

// A profile is a name plus an avatar: an emoji on one of eight colours.
export const AVATARS = [
  '🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐝', '🐢', '🦁', '🐧', '🐳', '🦋',
  '🐱', '🐶', '🐰', '🦔', '🌵', '🍄', '🌙', '⭐', '🚀', '🎈', '🎲', '☕',
];
// Eight backgrounds, from the same family as the game's tiles. Any face can go
// on any of them: each face is drawn as a sticker, with a white edge and a
// little shadow, so it stands clear of whatever colour is behind it (a yellow
// bee on the marigold, a pink octopus on the orchid).
export const COLORS = ['#f08a76', '#f6c453', '#7cc46a', '#3fa79b', '#6fb6ec', '#7a74d9', '#d98ad6', '#b98a63'];
const COLOR_NAMES = ['Coral', 'Marigold', 'Leaf', 'Teal', 'Sky', 'Indigo', 'Orchid', 'Clay'];

// A face and a background for someone new: any of each.
export const randomLook = () => ({
  avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
  color: Math.floor(Math.random() * COLORS.length),
});

// The look last chosen on this device, offered again in the next room.
const LOOK_KEY = 'correspondence:look:v1';
export function savedLook() {
  const look = load(LOOK_KEY);
  return look && typeof look.avatar === 'string' && Number.isInteger(look.color) ? look : null;
}
export const saveLook = (avatar, color) => save(LOOK_KEY, { avatar, color });

// A round avatar for a person ({ avatar, color }). Decorative: the name is
// always written next to it.
export function avatar(person, extraClass = '') {
  const span = document.createElement('span');
  span.className = `avatar ${extraClass}`.trim();
  span.setAttribute('aria-hidden', 'true');
  paint(span, person);
  return span;
}

export function paint(span, person) {
  // the face sits in an element of its own, which carries the sticker's edge
  const face = span.firstElementChild ?? span.appendChild(document.createElement('span'));
  face.className = 'face';
  face.textContent = person?.avatar ?? '🙂';
  span.style.setProperty('--bg', COLORS[person?.color] ?? COLORS[4]);
}

// Patterns on the game's tiles, as well as colours: a choice kept on this device.
const PATTERNS_KEY = 'correspondence:patterns:v1';
export const patternsOn = () => load(PATTERNS_KEY) === true;
export function applyPatterns() {
  document.documentElement.classList.toggle('patterns', patternsOn());
}

// Light or dark. 'auto' follows the device; the others hold whatever it says.
const THEME_KEY = 'correspondence:theme:v1';
const systemDark = matchMedia('(prefers-color-scheme: dark)');
export const themeChoice = () => {
  const kept = load(THEME_KEY);
  return kept === 'light' || kept === 'dark' ? kept : 'auto';
};
export function applyTheme() {
  const choice = themeChoice();
  const dark = choice === 'dark' || (choice === 'auto' && systemDark.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  tintBars();
}

// The browser's own bars (Safari's, round the page) are the colour of the ground the screen that is up stands on: the
// page's paper; and in the dark, on a room's screens, the warm evening a room stands in (room/room.css), not the page's
// blue-black. shared/nav.js says which screen is up, before it is put to work (so that a screen with bars of its own,
// the night or a room's drama, takes them from there, and puts them back).
const EVENING = ['room', 'open', 'join'];
let up = null;
function tintBars() {
  const dark = document.documentElement.dataset.theme === 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', !dark ? '#f6f1e7' : EVENING.includes(up) ? '#1d1918' : '#161d24');
}
export function screenUp(name) {
  up = name;
  tintBars();
}
systemDark.addEventListener('change', applyTheme); // on 'auto', follow the device as it changes

let dialog = null;

// Open the profile editor. onSave({ name, avatar, color }) should return a
// promise; if it rejects, its message is shown and the editor stays open.
export function openProfile({ person, onSave }) {
  dialog?.remove();
  dialog = document.createElement('dialog');
  dialog.className = 'profile';
  dialog.setAttribute('aria-label', 'Your profile');
  const choice = { avatar: person.avatar, color: person.color };

  const preview = avatar(choice, 'big');

  const form = document.createElement('form');
  form.method = 'dialog';
  form.className = 'card';

  const nameField = document.createElement('label');
  nameField.className = 'field';
  const nameLabel = document.createElement('span');
  nameLabel.textContent = 'Name';
  const name = document.createElement('input');
  name.type = 'text';
  name.maxLength = 20;
  name.required = true;
  name.autocomplete = 'off';
  name.value = person.name;
  nameField.append(nameLabel, name);

  // A row of options where exactly one is chosen.
  const picker = (label, className, options, current, draw, choose) => {
    const group = document.createElement('div');
    group.className = `picker ${className}`;
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', label);
    options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(current() === (className === 'colours' ? index : option)));
      draw(button, option, index);
      button.addEventListener('click', () => {
        choose(option, index);
        for (const other of group.children) other.setAttribute('aria-checked', String(other === button));
        paint(preview, choice);
      });
      group.append(button);
    });
    return group;
  };

  const avatars = picker('Avatar', 'avatars', AVATARS, () => choice.avatar,
    (button, emoji) => { button.textContent = emoji; button.setAttribute('aria-label', emoji); },
    (emoji) => { choice.avatar = emoji; });
  const colours = picker('Background', 'colours', COLORS, () => choice.color,
    (button, colour, index) => { button.style.setProperty('--bg', colour); button.setAttribute('aria-label', COLOR_NAMES[index]); button.title = COLOR_NAMES[index]; },
    (_, index) => { choice.color = index; });

  const error = document.createElement('p');
  error.className = 'message bad';
  error.setAttribute('role', 'alert');

  const buttons = document.createElement('div');
  buttons.className = 'row end';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'quiet';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => dialog.close());
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Save';
  buttons.append(cancel, submit);

  form.append(nameField, avatars, colours, error, buttons);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = name.value.trim();
    if (!value) return;
    submit.disabled = true;
    error.textContent = '';
    try {
      await onSave({ name: value, avatar: choice.avatar, color: choice.color });
      saveLook(choice.avatar, choice.color);
      dialog.close();
    } catch (failure) {
      error.textContent = failure.message;
      submit.disabled = false;
    }
  });

  // Settings kept on this device. They take effect at once, without Save.
  const settings = document.createElement('div');
  settings.className = 'settings';
  const toggle = (text, on, change) => {
    const row = document.createElement('label');
    row.className = 'setting';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.checked = on;
    input.addEventListener('change', () => change(input.checked));
    const label = document.createElement('span');
    label.textContent = text;
    row.append(label, input);
    return row;
  };
  // light, dark, or as the device has it
  const theme = document.createElement('div');
  theme.className = 'setting choice';
  const themeLabel = document.createElement('span');
  themeLabel.textContent = 'Appearance';
  const segments = document.createElement('div');
  segments.className = 'segments';
  segments.setAttribute('role', 'radiogroup');
  segments.setAttribute('aria-label', 'Appearance');
  for (const [value, text] of [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]) {
    const option = document.createElement('button');
    option.type = 'button';
    option.textContent = text;
    option.setAttribute('role', 'radio');
    option.setAttribute('aria-checked', String(themeChoice() === value));
    option.addEventListener('click', () => {
      save(THEME_KEY, value === 'auto' ? null : value);
      applyTheme();
      for (const other of segments.children) other.setAttribute('aria-checked', String(other === option));
    });
    segments.append(option);
  }
  theme.append(themeLabel, segments);

  settings.append(
    theme,
    toggle('Music', !isMusicOff(), (on) => {
      setMusicOff(!on);
      document.dispatchEvent(new Event('soundchange'));
    }),
    toggle('Sound effects', !isMuted(), (on) => {
      setMuted(!on);
      document.dispatchEvent(new Event('soundchange'));
    }),
    toggle('Patterns on tiles', patternsOn(), (on) => {
      save(PATTERNS_KEY, on ? true : null);
      applyPatterns();
    }),
  );

  // The way on to another device: a link that makes a temporary account code.
  const sync = document.createElement('div');
  sync.className = 'sync';
  const ask = document.createElement('button');
  ask.type = 'button';
  ask.className = 'link';
  ask.textContent = 'Get account code';
  const code = document.createElement('button');
  code.type = 'button';
  code.className = 'code';
  code.hidden = true;
  const note = document.createElement('p');
  note.textContent = 'To use this account on another device.';
  ask.addEventListener('click', async () => {
    ask.disabled = true;
    try {
      copyable(code, prettyCode(await rpc('profile_code', { p_token: myToken() })));
      code.hidden = false;
      ask.textContent = 'Get a new code';
      note.textContent = 'Enter it on the other device under “Sync account”. It works once, for ten minutes. Tap to copy.';
    } catch (failure) {
      note.textContent = failure.message;
    }
    ask.disabled = false;
  });
  sync.append(ask, code, note);

  // Starting the story over: Penny's story from its beginning, and every
  // walkthrough with it (penny/penny.js says what is forgotten, and what
  // stays). Asked first, since it cannot be undone; then the app is opened
  // afresh, so that nothing on screen remembers what was forgotten.
  const again = document.createElement('div');
  again.className = 'sync story-again';
  again.hidden = !storyBegun();
  const restart = document.createElement('button');
  restart.type = 'button';
  restart.className = 'link';
  restart.id = 'story-again';
  restart.textContent = 'Start the story over';
  restart.addEventListener('click', async () => {
    const sure = await askFirst('Start the story over?', {
      detail: 'Penny’s story, its walkthroughs and your energy begin again. Your games, rooms and beats stay.',
      yes: 'Start over',
      no: 'Keep it',
      danger: true,
    });
    if (!sure) return;
    forgetStory();
    dialog.close();
    location.reload();
  });
  again.append(restart);

  dialog.append(preview, form, settings, sync, again);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  // Opening a dialog puts the cursor in its first field, which on a phone
  // brings the keyboard up over everything. The name is edited by choice, not
  // by default: hold the focus on the dialog itself instead.
  dialog.tabIndex = -1;
  dialog.showModal();
  dialog.focus({ preventScroll: true });
  dialog.scrollTop = 0;
}
