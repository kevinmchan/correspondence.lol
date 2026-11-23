// The screen at the end of a game, and the feedback form it carries. The form
// is optional: a rating out of five, a note, or nothing at all. It can also be
// opened on its own from the how-to screen.

import { rpc } from '/shared/api.js';
import { myToken } from '/shared/identity.js';
import { avatar } from '/shared/profile.js';

const ENVELOPE = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#envelope"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17.1 6.6 20l1.1-6.1-4.5-4.3 6.1-.8z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';

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
  let rating = null;

  const stars = make('div', 'stars');
  stars.setAttribute('role', 'radiogroup');
  stars.setAttribute('aria-label', 'Your rating, out of five');
  for (let n = 1; n <= 5; n++) {
    const star = make('button');
    star.type = 'button';
    star.setAttribute('role', 'radio');
    star.setAttribute('aria-label', n === 1 ? '1 star' : `${n} stars`);
    star.innerHTML = STAR;
    star.addEventListener('click', () => {
      rating = rating === n ? null : n; // a second tap takes it back
      update();
    });
    stars.append(star);
  }

  const note = make('textarea');
  note.rows = 2;
  note.maxLength = 2000;
  note.placeholder = 'Anything you’d change? (optional)';
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
    [...stars.children].forEach((star, i) => {
      star.setAttribute('aria-checked', String(rating === i + 1));
      star.classList.toggle('on', rating !== null && i < rating);
    });
    send.disabled = rating === null && note.value.trim() === '';
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
        p_token: myToken(), p_rating: rating, p_message: note.value.trim() || null,
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

  form.append(make('p', 'ask', 'How was it?'), stars, note, problem, buttons);
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
export function openFinale({ won, mode, title, detail, time, phrase, people, hearts, about, leave, onDone, celebrate }) {
  const dialog = sheet(`finale ${won ? 'won' : 'lost'} ${mode}`, title, onDone);
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
    for (let i = 0; i < hearts; i++) kept.append(make('span', 'heart', '♥'));
    stage.append(stamped, kept);
  }

  dialog.append(stage, make('h2', null, title));
  if (detail) dialog.append(make('p', 'detail', detail));
  dialog.append(feedbackForm({ about, leave, done: () => dialog.close() }));
  dialog.showModal();
  if (won) celebrate?.(dialog);
  dialog.querySelector('.buttons .quiet').focus({ preventScroll: true });
}
