// The app's own "are you sure?" and "just so you know", in place of the
// browser's grey boxes. Each returns a promise: ask() resolves true or false,
// tell() resolves when it has been read.

function sheet({ title, detail, yes, no, danger }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'ask';
    dialog.setAttribute('role', 'alertdialog');
    const heading = document.createElement('h2');
    heading.textContent = title;
    dialog.setAttribute('aria-label', title);
    dialog.append(heading);
    if (detail) {
      const more = document.createElement('p');
      more.textContent = detail;
      dialog.append(more);
    }
    const buttons = document.createElement('div');
    buttons.className = 'buttons';
    let answer = false;
    const add = (text, value, className) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.className = className;
      button.addEventListener('click', () => {
        answer = value;
        dialog.close();
      });
      buttons.append(button);
      return button;
    };
    if (no) add(no, false, 'quiet');
    const go = add(yes, true, danger ? 'yes danger' : 'yes');
    dialog.append(buttons);
    // a tap outside, or Escape, is a no
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
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
export const ask = (title, { detail = '', yes = 'OK', no = 'Cancel', danger = false } = {}) =>
  sheet({ title, detail, yes, no, danger });

// Something to be told, with one button to put it away.
export const tell = (title, { detail = '', ok = 'OK' } = {}) => sheet({ title, detail, yes: ok, no: null, danger: false });
