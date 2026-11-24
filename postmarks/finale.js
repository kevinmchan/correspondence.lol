// The screen at the end of a game, and the feedback form it carries. The form
// is optional: a note, or nothing at all. It can also be opened on its own from
// the how-to screen.

import { rpc } from '/shared/api.js';
import { myToken } from '/shared/identity.js';
import { avatar } from '/shared/profile.js';

const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#envelope"/></svg>';

const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

// about: { game, mode, outcome } — what the feedback is filed under.
// leave: the label of the button that goes without sending. done() runs once
// the form is finished with, whether something was sent or not.
function feedbackForm({ about, leave, done }) {
  const form = make('form', 'feedback');
  form.noValidate = true;
  const note = make('textarea');
  note.rows = 3;
  note.maxLength = 2000;
  note.placeholder = 'Tell us anything (optional)';
  note.setAttribute('aria-label', 'Your feedback (optional)');
  note.addEventListener('input', () => update());

  const problem = make('p', 'error');
  problem.hidden = true;
  problem.setAttribute('role', 'alert');

  const skip = make('button', 'quiet', leave);
  skip.type = 'button';
  skip.addEventListener('click', done);
  const send = make('button', 'go', 'Send');
  send.type = 'submit';
  const buttons = make('div', 'buttons');
  buttons.append(skip, send);

  function update() {
    send.disabled = note.value.trim() === '';
  }
  update();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (send.disabled) return;
    send.disabled = true;
    skip.disabled = true;
    problem.hidden = true;
    try {
      await rpc('feedback_send', {
        p_token: myToken(), p_message: note.value.trim(),
        p_game: about.game ?? null, p_mode: about.mode ?? null, p_outcome: about.outcome ?? null,
        p_version: self.APP_VERSION ?? null,
      });
      form.replaceChildren(make('p', 'thanks', 'Thank you!'));
      setTimeout(done, 900);
    } catch (error) {
      problem.textContent = error.message;
      problem.hidden = false;
      skip.disabled = false;
      update();
    }
  });

  form.append(make('p', 'ask', 'How was it?'), note, problem, buttons);
  return form;
}

// A dialog that runs `after` exactly once when it goes away, however it goes:
// a button, the Escape key, or a tap outside it.
function sheet(className, label, after) {
  const dialog = make('dialog', className);
  dialog.setAttribute('aria-label', label);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    after?.();
  }, { once: true });
  document.body.append(dialog);
  return dialog;
}

// The feedback form on its own.
export function openFeedback(about) {
  const dialog = sheet('finale plain', 'Feedback');
  dialog.append(feedbackForm({ about, leave: 'Cancel', done: () => dialog.close() }));
  dialog.showModal();
}

// The end of a game.
//   won, mode: 'solo' | 'coop' | 'trial' | 'phrase'
//   title, detail: the headline and the line under it
//   time: a time trial's finishing time; phrase: the solved phrase
//   people: who played together; hearts: how many were left
//   leave: label for leaving without feedback; onDone: where to go afterwards
//   retry: { label, run } offers the same board again, in place of onDone
export function openFinale({ won, mode, title, detail, time, phrase, people, hearts, about, leave, onDone, celebrate, retry }) {
  let next = onDone; // what happens when the screen goes away
  const dialog = sheet(`finale ${won ? 'won' : 'lost'} ${mode}`, title, () => next?.());
  const stage = make('div', 'stage');
  stage.setAttribute('aria-hidden', 'true');

  if (!won) {
    // out of hearts: the three of them, spent
    stage.classList.add('spent');
    for (let i = 0; i < 3; i++) stage.append(make('span', 'heart', '♥'));
  } else if (mode === 'trial') {
    // a stopwatch face with the time across it
    const watch = make('div', 'watch');
    watch.append(make('i', 'hand'), make('strong', null, time));
    stage.append(watch);
  } else if (mode === 'phrase') {
    // the envelope opens and the phrase comes out of it
    const opened = make('div', 'opened');
    opened.innerHTML = ENVELOPE;
    stage.append(opened, make('q', null, phrase));
  } else if (mode === 'coop') {
    // everyone who played, side by side
    const team = make('div', 'team');
    people.forEach((person, i) => {
      const face = avatar(person);
      face.style.setProperty('--i', i);
      team.append(face);
    });
    stage.append(team);
  } else {
    // a delivered post, stamped, with the hearts kept
    const stamped = make('div', 'stamped');
    stamped.innerHTML = ENVELOPE;
    stamped.append(make('i', 'stamp'));
    const kept = make('div', 'kept');
    for (let i = 0; i < hearts; i++) {
      const heart = make('span', 'heart', '♥');
      heart.style.setProperty('--i', i); // (its place in the row: they hop one after another)
      kept.append(heart);
    }
    stage.append(stamped, kept);
  }

  dialog.append(stage, make('h2', null, title));
  if (detail) dialog.append(make('p', 'detail', detail));
  if (retry) {
    const again = make('button', 'again', retry.label);
    again.type = 'button';
    again.addEventListener('click', () => {
      next = retry.run;
      dialog.close();
    });
    dialog.append(again);
  }
  dialog.append(feedbackForm({ about, leave, done: () => dialog.close() }));
  dialog.showModal();
  if (won) celebrate?.(dialog);
  dialog.querySelector('.buttons .quiet').focus({ preventScroll: true });
}
