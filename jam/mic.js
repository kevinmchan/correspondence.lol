// The microphone, and where what it heard is kept.
//
// listen() hears for a few seconds (or until told to stop) and gives back the
// sound, made ready (jam/sample.js). The sounds are kept in the browser's own
// database (they are too big for anywhere else on the device), and on the
// server, by profile, so that every device of the profile has the same ones.

import { MOST_HEARD, pack, prepare, unpack } from './sample.js';
import { load, myToken, save } from '/shared/identity.js';
import { rpc } from '/shared/api.js';

// What went wrong, in the words shown beside the microphone.
const REFUSED = 'The microphone is not allowed.';
const NONE = 'No microphone here.';
export const SILENT = 'Nothing was heard.';

// Start hearing. Resolves, once it is hearing, to { stop(), heard }: stop()
// ends it early, and `heard` resolves to the sound ({ rate, pcm, hz }), or to
// null if there was nothing in it. Rejects with the words for it if there is
// no microphone or it is not allowed.
export async function listen() {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !Offline) throw new Error(NONE);
  let stream;
  try {
    // (as it is: what makes a call clearer makes a note duller)
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
  } catch (error) {
    throw new Error(error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError' ? NONE : REFUSED);
  }
  const recorder = new MediaRecorder(stream);
  const parts = [];
  recorder.addEventListener('dataavailable', (event) => { if (event.data.size) parts.push(event.data); });
  const heard = new Promise((resolve) => {
    recorder.addEventListener('stop', async () => {
      for (const track of stream.getTracks()) track.stop(); // the microphone is let go of at once
      try {
        const bytes = await new Blob(parts, { type: recorder.mimeType }).arrayBuffer();
        const rate = 44100;
        const decoded = await new Promise((done, failed) => {
          const answer = new Offline(1, 1, rate).decodeAudioData(bytes, done, failed); // (older Safaris only call back)
          answer?.then?.(done, failed);
        });
        resolve(prepare(decoded.getChannelData(0), decoded.sampleRate));
      } catch {
        resolve(null);
      }
    });
  });
  recorder.start();
  const timer = setTimeout(() => stop(), MOST_HEARD * 1000);
  function stop() {
    clearTimeout(timer);
    if (recorder.state !== 'inactive') recorder.stop();
  }
  return { stop, heard };
}

// --- Keeping them ----------------------------------------------------------------------
// Every sound recorded is kept, with the name it is given: { id, name, rate,
// pcm, hz, at }, and whether the server has it (`sent`) as it is here
// (`synced`). Where the browser will not keep them (a private window), they
// last as long as the page.
export const MOST_NAME = 12; // letters in a sound's name: what an instrument's button has room for
const GONE_KEY = 'jam:sounds:gone:v1'; // sounds deleted here that the server has still to be told of
const base = () => new Promise((resolve) => {
  try {
    const opening = indexedDB.open('jam', 2);
    opening.onupgradeneeded = () => {
      if (opening.result.objectStoreNames.contains('sounds')) opening.result.deleteObjectStore('sounds');
      opening.result.createObjectStore('sounds', { keyPath: 'id' });
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => resolve(null);
  } catch {
    resolve(null);
  }
});
const done = (request) => new Promise((resolve) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => resolve(undefined);
});
const whole = (one) => one && typeof one.id === 'string' && one.pcm instanceof Float32Array && one.pcm.length && one.rate > 0;
// A thing done to the kept sounds: what `work(store)` asks for, or undefined where nothing can be kept.
async function among(mode, work) {
  const db = await base();
  if (!db) return undefined;
  const answer = await done(work(db.transaction('sounds', mode).objectStore('sounds')));
  db.close();
  return answer;
}
const put = (one) => among('readwrite', (store) => store.put(one));

// The sounds kept, oldest first.
export async function sounds() {
  const all = (await among('readonly', (store) => store.getAll())) ?? [];
  return all.filter(whole).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
}

// Keep a new sound ({ name, rate, pcm, hz }). Resolves to it, as it is kept.
// (`id`: the one it already has, for a sound that came with a shared beat.)
export async function addSound(one, id = crypto.randomUUID()) {
  const kept = { ...one, id, at: Date.now(), sent: false, synced: false };
  await put(kept);
  return kept;
}

// Give a kept sound another name.
export async function renameSound(one, name) {
  Object.assign(one, { name, synced: false });
  await put(one);
}

// Forget a sound.
export async function dropSound(one) {
  if (one.sent) save(GONE_KEY, [...new Set([...(load(GONE_KEY) ?? []), one.id])].slice(-50));
  await among('readwrite', (store) => store.delete(one.id));
}

// --- The same drawer on every device of the profile -------------------------------------
// The sounds follow the profile, as saved beats do (sounds_get, sounds_fetch,
// sounds_put, sounds_drop, in supabase/migrations/20261126000000_sounds.sql).
// The device's copy is brought into line with the server's: a sound the server
// has not got as it is here is sent (the whole of it the first time, only its
// name after that); one the server had and has no longer was deleted on
// another device, and goes from this one too; and one the server has that
// this device has not is fetched. Resolves to the sounds as they then are, or
// to null if the server could not be reached (the device's own copy stands).
export async function syncSounds() {
  try {
    const args = { p_token: myToken() };
    for (const id of load(GONE_KEY) ?? []) {
      await rpc('sounds_drop', { ...args, p_id: id });
      save(GONE_KEY, (load(GONE_KEY) ?? []).filter((one) => one !== id));
    }
    let theirs = await rpc('sounds_get', args);
    if (!Array.isArray(theirs)) return null;
    const mine = await sounds();
    for (const one of mine) {
      if (one.synced) continue;
      try {
        theirs = await rpc('sounds_put', { ...args, p_id: one.id, p_name: one.name, ...(one.sent ? {} : { p_rate: one.rate, p_hz: one.hz, p_pcm: pack(one.pcm) }) });
        await put(Object.assign(one, { sent: true, synced: true }));
      } catch {
        /* refused, or out of reach: it stays as it is here, to be tried the next time */
      }
    }
    const there = new Map(theirs.map((one) => [one.id, one]));
    for (const one of mine) {
      if (!one.synced) continue;
      const same = there.get(one.id);
      if (!same) await among('readwrite', (store) => store.delete(one.id));
      else if (same.name !== one.name) await put(Object.assign(one, { name: String(same.name).slice(0, MOST_NAME) }));
    }
    const gone = new Set(load(GONE_KEY) ?? []);
    for (const one of theirs) {
      if (gone.has(one.id) || mine.some((each) => each.id === one.id)) continue;
      const all = await rpc('sounds_fetch', { ...args, p_id: one.id });
      const pcm = all && unpack(all.pcm);
      if (pcm) await put({ id: all.id, name: String(all.name).slice(0, MOST_NAME), rate: all.rate, hz: all.hz > 0 ? all.hz : null, pcm, at: Number(one.at) || Date.now(), sent: true, synced: true });
    }
    return await sounds();
  } catch {
    return null;
  }
}
