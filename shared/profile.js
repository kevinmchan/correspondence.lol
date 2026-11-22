import { load, save } from './identity.js';

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

  dialog.append(preview, form);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  dialog.showModal();
}
