import { rpc } from './api.js';
import { copyable, prettyCode } from './handoff.js';
import { load, myToken, save } from './identity.js';
import { isMusicOff, isMuted, setMusicOff, setMuted } from '/postmarks/sound.js';

// A profile is a name plus an avatar: an emoji on one of eight colours.
export const AVATARS = [
  '🦊', '🐼', '🐸', '🦉', '🐙', '🦄', '🐝', '🐢', '🦁', '🐧', '🐳', '🦋',
  '🐱', '🐶', '🐰', '🦔', '🌵', '🍄', '🌙', '⭐', '🚀', '🎈', '🎲', '☕',
];
export const COLORS = ['#f2a391', '#f5cf6e', '#bcdc8a', '#7fd0b8', '#8ec9ef', '#a9a7ee', '#e2a3e3', '#cfae8a'];

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
  span.style.setProperty('--bg', COLORS[person?.color] ?? COLORS[0]);
}

// Patterns on the game's tiles, as well as colours: a choice kept on this device.
const PATTERNS_KEY = 'correspondence:patterns:v1';
export const patternsOn = () => load(PATTERNS_KEY) === true;
export function applyPatterns() {
  document.documentElement.classList.toggle('patterns', patternsOn());
}

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
  const colours = picker('Colour', 'colours', COLORS, () => choice.color,
    (button, colour, index) => { button.style.setProperty('--bg', colour); button.setAttribute('aria-label', `Colour ${index + 1}`); },
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
  settings.append(
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
  dialog.showModal();
}
