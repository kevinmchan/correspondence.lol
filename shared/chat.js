import { rpc } from './api.js';
import { gameUrl, myToken } from './identity.js';
import { oops } from './place.js';
import { avatar, paint } from './profile.js';

// A room's chat: a message log and a box to write in. The page feeds it
// messages it has fetched with add(); sending is handled here.
//
// `calm` is the room's own chat (room/room.css), which says as little as it
// can: a name and a time only where somebody starts to speak, no words on the
// box or its button, and what the room itself says as a quiet line (the whole
// line leading to its game, where it has one). At rest at its foot it shows
// whole notes only (see fit). (The game's chat is the plain one: postmarks/ui.js.)
const PLANE = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 3.5L10 14M20.5 3.5l-6.3 17-4.2-6.5-6.5-4.2z"/></svg>';
const RUN = 10 * 60 * 1000; // notes this close together, from one person, are one run of them
// What the room says when a game is started: the table shows that already. The whole line, as the server words it
// (rooms.announce in supabase/migrations), now and before: a name (twenty letters at most), then "started a game of
// Postmarks", "started a 5 × 5 game of Postmarks", "started a Postmarks time trial", "started a Postmarks pass phrase" or
// "wrote a Postmarks pass phrase to solve". Never what is said when a pass phrase is solved, or goes unsolved: those
// lines begin with the phrase's own words, which could be anything. (Its first part is who started it; its second, what.)
export const STARTED = /^(?!Pass phrase solved: |A pass phrase went unsolved: )([^\n]{1,20}) (started a (?:\d+ × \d+ )?game of Postmarks|started a Postmarks (?:time trial|pass phrase)|wrote a Postmarks pass phrase to solve)$/u;

export function createChat(root, { roomId, you, people, onSent, calm = false }) {
  let everyone = people; // [{ name, avatar, color }] by seat
  let lastId = 0;
  let last = null; // the last message shown: { seat, at }
  const seen = new Set();

  root.classList.add('chat');
  const log = document.createElement('ol');
  log.className = 'chat-log';
  log.setAttribute('role', 'log');
  log.setAttribute('aria-label', 'Messages');
  log.tabIndex = 0;

  const form = document.createElement('form');
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 500;
  input.autocomplete = 'off';
  input.placeholder = calm ? 'message…' : 'Say something…';
  input.setAttribute('aria-label', 'Message');
  const send = document.createElement('button');
  send.type = 'submit';
  if (calm) {
    send.className = 'send';
    send.setAttribute('aria-label', 'Send');
    send.innerHTML = PLANE;
  } else {
    send.textContent = 'Send';
  }
  form.append(input, send);

  const error = document.createElement('p');
  error.className = 'message bad';
  error.setAttribute('role', 'alert');
  root.replaceChildren(log, form, error);
  // (in the calm chat, what went wrong is a short line of its words under the box, which shakes as they come; and it is
  // not still said once what was typed is changed)
  const say = (text) => (calm ? oops(error, text, { shake: form }) : (error.textContent = text));
  if (calm) input.addEventListener('input', () => say(''));

  const clock = (at) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  const atTheFoot = () => log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  let resting = true; // at its foot, as it was last left
  log.addEventListener('scroll', () => {
    resting = atTheFoot();
  }, { passive: true });
  // (a change of width, the phone turned, wraps the notes again: fitted again, if it was resting at its foot. While it
  // is hidden (the room at its desk) it has no width, and nothing in it can be measured: it is fitted again when it is
  // shown again, as it was left.)
  if (calm && window.ResizeObserver) {
    let wide = 0;
    let seen = false; // (it has been shown, and fitted, once: the first fitting is add's)
    let left = true; // whether it was resting at its foot when it was hidden
    new ResizeObserver(([one]) => {
      const now = Math.round(one.contentRect.width);
      if (now === wide) return;
      if (now === 0) {
        if (wide > 0) left = resting;
        wide = 0;
        return;
      }
      const back = wide === 0;
      wide = now;
      if (seen && (back ? left : resting)) foot();
      seen = true;
    }).observe(root);
  }

  // Returns how many of the new messages were written by other people.
  function add(messages) {
    const stick = resting || atTheFoot();
    const before = seen.size;
    let fromOthers = 0;
    for (const message of messages || []) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      lastId = Math.max(lastId, message.id);
      const li = document.createElement('li');
      const at = new Date(message.at).getTime();
      if (message.seat === null) {
        li.className = 'note';
        const url = message.game_id && gameUrl(message.game_kind, message.game_id);
        if (url && calm) {
          // the whole line leads to its game
          li.className = 'note game';
          li.dataset.game = message.game_id;
          const started = message.body.match(STARTED);
          if (started) {
            li.dataset.started = '';
            li.dataset.who = started[1];
            if (started[2].startsWith('wrote')) li.dataset.wrote = '';
          }
          const link = document.createElement('a');
          link.href = url;
          link.textContent = message.body;
          li.append(link);
        } else {
          li.append(message.body);
          if (url) {
            li.className = 'note game'; // it leads somewhere: a ticket, not just a line
            const link = document.createElement('a');
            link.href = url;
            link.textContent = 'Open';
            li.append(' · ', link);
          }
        }
      } else {
        if (message.seat === you) li.className = 'mine';
        else fromOthers++;
        // (in the calm chat, a run of notes from one person shows who and when once, at its start)
        const more = calm && last && last.seat === message.seat && at - last.at < RUN;
        const who = document.createElement('span');
        who.className = calm && (more || message.seat === you) ? 'who sr-only' : 'who';
        who.dataset.seat = message.seat;
        who.textContent = message.seat === you ? 'You' : everyone[message.seat]?.name ?? 'Someone';
        const time = document.createElement('time');
        time.dateTime = message.at;
        time.textContent = clock(message.at);
        if (calm && more) time.className = 'sr-only';
        const body = document.createElement('p');
        body.textContent = message.body; // textContent: messages are never treated as HTML
        if (message.seat !== you) li.append(avatar(everyone[message.seat]), ' ');
        li.append(who, ' ', time, body);
        if (more) li.classList.add('more');
      }
      last = { seat: message.seat, at };
      log.append(li);
    }
    if (stick && seen.size > before) foot();
    return fromOthers;
  }

  // To the foot of the log, where the newest note is. The calm log is then fitted: as tall as the notes that fit in it
  // whole, up to as tall as it may be, so that its top edge falls in the space between two notes and never cuts one
  // across (the fade at its top lies over that space; a half line of letters fading there is a ghost, not a note); and
  // where it can, so that the first note in sight is where somebody starts to speak, or a line of the room's.
  // (Worked out from where the notes are, without first letting it out to its full height: the page is watched for
  // what changes in it (room/worlds.js), and a fitting that comes to the same height changes nothing.)
  function foot() {
    if (calm) {
      const style = getComputedStyle(log);
      const most = parseFloat(style.maxHeight); // as tall as it may be
      const origin = log.getBoundingClientRect().top - log.scrollTop; // where what it holds begins
      const boxes = [...log.children].filter((li) => li.getClientRects().length).map((li) => {
        const box = li.getBoundingClientRect();
        return { top: box.top - origin, bottom: box.bottom - origin, more: li.classList.contains('more') };
      });
      let height = '';
      const all = boxes.length ? boxes.at(-1).bottom + (parseFloat(style.paddingBottom) || 0) : 0; // how tall all of it is
      if (most > 0 && all > most + 1) {
        // how tall it is from just past each note to the foot (the next one first in sight): the tallest that fits
        const fits = boxes.slice(1).map((box, i) => ({ tall: all - boxes[i].bottom, more: box.more })).filter((one) => one.tall <= most);
        const pick = fits.find((one) => !one.more) ?? fits[0];
        if (pick) height = `${Math.floor(pick.tall)}px`;
      }
      if (log.style.height !== height) log.style.height = height;
    }
    log.scrollTop = log.scrollHeight;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body || send.disabled) return;
    send.disabled = true;
    say('');
    try {
      const message = await rpc('room_say', { p_room: roomId, p_token: myToken(), p_body: body });
      input.value = '';
      add([message]);
      foot();
      onSent?.();
    } catch (failure) {
      say(failure.message);
    } finally {
      send.disabled = false;
      input.focus();
    }
  });

  return {
    add,
    // Names and avatars can change; relabel what is already on screen to match.
    setPeople(next) {
      everyone = next;
      for (const who of log.querySelectorAll('.who')) {
        const seat = Number(who.dataset.seat);
        if (seat === you) continue;
        who.textContent = everyone[seat]?.name ?? 'Someone';
        const face = who.parentElement.querySelector('.avatar');
        if (face) paint(face, everyone[seat]);
      }
    },
    // The lines that say a game was started, put away while that game is on
    // the table: the table says so already. (A game since deleted has its line back.)
    onTable(ids) {
      let changed = false;
      for (const line of log.querySelectorAll('li[data-started]')) {
        if (line.hidden === ids.has(line.dataset.game)) continue;
        line.hidden = ids.has(line.dataset.game);
        changed = true;
      }
      if (changed && resting) foot();
    },
    // Who started a game, as its line here says: { who, wrote } (wrote: a pass phrase, written), or null.
    starter(id) {
      const line = [...log.querySelectorAll('li[data-started]')].find((one) => one.dataset.game === id);
      return line ? { who: line.dataset.who, wrote: line.hasAttribute('data-wrote') } : null;
    },
    get lastId() { return lastId; },
  };
}
