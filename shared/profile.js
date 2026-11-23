import { rpc } from './api.js';
import { copyable, prettyCode } from './handoff.js';
import { load, myToken, save } from './identity.js';
import { isMusicOff, isMuted, setMusicOff, setMuted } from '/postmarks/sound.js';

// A profile is a name plus an avatar: an emoji on one of eight colours.
export const AVATARS = [
  '🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐝', '🐢', '🦁', '🐧', '🐳', '🦋',
  '🐱', '🐶', '🐰', '🦔', '🌵', '🍄', '🌙', '⭐', '🚀', '🎈', '🎲', '☕',
];
// Eight soft backgrounds: light enough that any of the faces stands out on them.
export const COLORS = ['#fbd3c5', '#fbe7a1', '#cdeab5', '#bde7da', '#c6e3fa', '#d9d5fa', '#f8d3ef', '#ecdcc3'];
//                       0 peach    1 butter   2 mint     3 aqua     4 sky      5 lavender 6 pink     7 sand

// Which backgrounds suit which face, best first. A face never sits on its own
// colour (a yellow bee on butter, a pink octopus on pink): each gets
// backgrounds that set it off. The picker offers only these, and a face shown
// with any other colour (an older choice, or the server's default) is drawn on
// its best one instead.
const SUITS = {
  '🦊': [4, 3, 5], '🐼': [2, 6, 1, 4], '🐸': [6, 0, 1], '🦉': [3, 4, 1], '🐙': [4, 3, 1], '🦄': [5, 4, 3],
  '🐝': [4, 5, 2], '🐢': [1, 0, 6], '🦁': [3, 4, 5], '🐧': [4, 1, 6], '🐳': [1, 0, 6], '🦋': [2, 1, 6],
  '🐱': [5, 4, 3], '🐶': [4, 2, 5], '🐰': [6, 5, 2], '🦔': [2, 3, 1], '🌵': [0, 7, 1], '🍄': [2, 3, 4],
  '🌙': [5, 4, 6], '⭐': [5, 4, 3], '🚀': [5, 1, 3], '🎈': [4, 2, 1], '🎲': [3, 5, 0], '☕': [7, 0, 2],
};
const ANY = [4, 2, 5];
export const suits = (face) => SUITS[face] ?? ANY;
// The colour to draw a face on: the one asked for if it suits, else the face's best.
export const suited = (face, color) => (suits(face).includes(color) ? color : suits(face)[0]);
// A face and a background that go together, for someone new.
export function randomLook() {
  const face = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  const good = suits(face);
  return { avatar: face, color: good[Math.floor(Math.random() * good.length)] };
}

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
  span.textContent = person?.avatar ?? '🙂';
  span.style.setProperty('--bg', COLORS[suited(person?.avatar, person?.color)]);
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#161d24' : '#f6f1e7');
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
  const choice = { avatar: person.avatar, color: suited(person.avatar, person.color) };

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

  // The backgrounds on offer are the ones that suit the face chosen, so they
  // are laid out afresh each time the face changes.
  const colours = document.createElement('div');
  colours.className = 'picker colours';
  colours.setAttribute('role', 'radiogroup');
  colours.setAttribute('aria-label', 'Background');
  const NAMES = ['Peach', 'Butter', 'Mint', 'Aqua', 'Sky', 'Lavender', 'Pink', 'Sand'];
  const offerColours = () => {
    choice.color = suited(choice.avatar, choice.color);
    colours.replaceChildren(...suits(choice.avatar).map((index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(choice.color === index));
      button.setAttribute('aria-label', NAMES[index]);
      button.title = NAMES[index];
      button.style.setProperty('--bg', COLORS[index]);
      button.addEventListener('click', () => {
        choice.color = index;
        for (const other of colours.children) other.setAttribute('aria-checked', String(other === button));
        paint(preview, choice);
      });
      return button;
    }));
  };
  const avatars = picker('Avatar', 'avatars', AVATARS, () => choice.avatar,
    (button, emoji) => { button.textContent = emoji; button.setAttribute('aria-label', emoji); },
    (emoji) => {
      choice.avatar = emoji;
      offerColours(); // keeps the colour if it still suits, else moves to this face's best
    });
  offerColours();

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

  dialog.append(preview, form, settings, sync);
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
