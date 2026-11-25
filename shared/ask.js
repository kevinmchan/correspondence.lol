// The app's own "are you sure?" and "just so you know", in place of the
// browser's grey boxes. Each returns a promise: ask() resolves true or false,
// tell() resolves when it has been read.

import { oops } from './place.js';

// `picture`: something to show in place of the title's words (the title is then
// said to screen readers only). `attempt`: what the yes does, tried with the
// sheet still open; if it is refused, the sheet shakes and a mark comes under
// the question, pressed for the words (oops() in shared/place.js), and the yes
// can be tried again, or the question put away.
function sheet({ title, detail, yes, no, danger, picture = null, attempt = null }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'ask';
    dialog.setAttribute('role', 'alertdialog');
    const heading = document.createElement('h2');
    heading.textContent = title;
    dialog.setAttribute('aria-label', title);
    if (picture) {
      const shown = document.createElement('div');
      shown.className = 'picture';
      shown.setAttribute('aria-hidden', 'true');
      shown.append(picture);
      heading.className = 'sr-only';
      dialog.append(shown);
    }
    dialog.append(heading);
    if (detail) {
      const more = document.createElement('p');
      more.textContent = detail;
      dialog.append(more);
    }
    const refused = document.createElement('p');
    refused.className = 'message bad';
    refused.setAttribute('role', 'alert');
    if (attempt) dialog.append(refused);
    const buttons = document.createElement('div');
    buttons.className = 'buttons';
    let answer = false;
    let trying = false;
    const add = (text, value, className) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.className = className;
      button.addEventListener('click', async () => {
        if (trying) return;
        if (value && attempt) {
          trying = true;
          button.disabled = true;
          oops(refused, '');
          try {
            await attempt();
            answer = true;
            dialog.close();
          } catch (failure) {
            if (dialog.open) oops(refused, failure.message, { shake: dialog });
          } finally {
            trying = false;
            button.disabled = false;
          }
          return;
        }
        answer = value;
        dialog.close();
      });
      buttons.append(button);
      return button;
    };
    if (no) add(no, false, 'quiet');
    const go = add(yes, true, danger ? 'yes danger' : 'yes');
    dialog.append(buttons);
    // a tap outside, or Escape, is a no (but not while the yes is being tried)
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog && !trying) dialog.close();
    });
    dialog.addEventListener('cancel', (event) => {
      if (trying) event.preventDefault();
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(answer);
    });
    document.body.append(dialog);
    dialog.showModal();
    go.focus({ preventScroll: true });
  });
}

// A question with two answers. `danger` paints the yes in the warning colour.
// (`picture` and `attempt`: see sheet.)
export const ask = (title, { detail = '', yes = 'OK', no = 'Cancel', danger = false, picture = null, attempt = null } = {}) =>
  sheet({ title, detail, yes, no, danger, picture, attempt });

// Something to be told, with one button to put it away.
export const tell = (title, { detail = '', ok = 'OK' } = {}) => sheet({ title, detail, yes: ok, no: null, danger: false });

// A choice between named things, where putting the question away (Escape, a
// tap outside) chooses none of them. options: [{ label, value, primary, danger }].
// Resolves the chosen value, or null.
export function choose(title, { detail = '', options }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'ask';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-label', title);
    const heading = document.createElement('h2');
    heading.textContent = title;
    dialog.append(heading);
    if (detail) {
      const more = document.createElement('p');
      more.textContent = detail;
      dialog.append(more);
    }
    const buttons = document.createElement('div');
    buttons.className = 'buttons';
    let answer = null;
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.className = option.primary ? (option.danger ? 'yes danger' : 'yes') : 'quiet';
      button.addEventListener('click', () => {
        answer = option.value;
        dialog.close();
      });
      buttons.append(button);
    }
    dialog.append(buttons);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(answer);
    });
    document.body.append(dialog);
    dialog.showModal();
    buttons.querySelector('.yes')?.focus({ preventScroll: true });
  });
}
