import { rpc } from './api.js';
import { gameUrl, myToken } from './identity.js';

// A room's chat: a message log and a box to write in. The page feeds it
// messages it has fetched with add(); sending is handled here.
export function createChat(root, { roomId, you, members }) {
  let names = members;
  let lastId = 0;
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
  input.placeholder = 'Say something…';
  input.setAttribute('aria-label', 'Message');
  const send = document.createElement('button');
  send.type = 'submit';
  send.textContent = 'Send';
  form.append(input, send);

  const error = document.createElement('p');
  error.className = 'message bad';
  error.setAttribute('role', 'alert');
  root.replaceChildren(log, form, error);

  const clock = (at) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  // Returns how many of the new messages were written by other people.
  function add(messages) {
    const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    let fromOthers = 0;
    for (const message of messages || []) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      lastId = Math.max(lastId, message.id);
      const li = document.createElement('li');
      if (message.seat === null) {
        li.className = 'note';
        li.append(message.body);
        const url = message.game_id && gameUrl(message.game_kind, message.game_id);
        if (url) {
          const link = document.createElement('a');
          link.href = url;
          link.textContent = 'Open';
          li.append(' · ', link);
        }
      } else {
        if (message.seat === you) li.className = 'mine';
        else fromOthers++;
        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = message.seat === you ? 'You' : names[message.seat] ?? 'Someone';
        const time = document.createElement('time');
        time.dateTime = message.at;
        time.textContent = clock(message.at);
        const body = document.createElement('p');
        body.textContent = message.body; // textContent: messages are never treated as HTML
        li.append(who, ' ', time, body);
      }
      log.append(li);
    }
    if (stick) log.scrollTop = log.scrollHeight;
    return fromOthers;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body || send.disabled) return;
    send.disabled = true;
    error.textContent = '';
    try {
      const message = await rpc('room_say', { p_room: roomId, p_token: myToken(), p_body: body });
      input.value = '';
      add([message]);
      log.scrollTop = log.scrollHeight;
    } catch (failure) {
      error.textContent = failure.message;
    } finally {
      send.disabled = false;
      input.focus();
    }
  });

  return {
    add,
    setMembers(next) { names = next; },
    get lastId() { return lastId; },
  };
}
