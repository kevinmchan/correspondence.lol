// The microphone, and where what it heard is kept.
//
// listen() hears for a few seconds (or until told to stop) and gives back the
// sound, made ready (jam/sample.js). The sounds are kept on this device only,
// one for each instrument, in the browser's own database: they are too big
// for a link or for the list of beats, and a voice is not a thing to send
// anywhere without being asked.

import { MOST_HEARD, prepare } from './sample.js';

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
// pcm, hz }. Where the browser will not keep them (a private window), they
// last as long as the page.
const base = () => new Promise((resolve) => {
  try {
    const opening = indexedDB.open('jam', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('sounds', { keyPath: 'id', autoIncrement: true });
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
const whole = (one) => one && one.pcm instanceof Float32Array && one.pcm.length && one.rate > 0;
// A thing done to the kept sounds: what `work(store)` asks for, or undefined where nothing can be kept.
async function among(mode, work) {
  const db = await base();
  if (!db) return undefined;
  const answer = await done(work(db.transaction('sounds', mode).objectStore('sounds')));
  db.close();
  return answer;
}

// The sounds kept, oldest first.
export async function sounds() {
  const all = (await among('readonly', (store) => store.getAll())) ?? [];
  return all.filter(whole).map((one) => ({ id: one.id, name: String(one.name ?? '').slice(0, MOST_NAME) || 'Sound', rate: one.rate, pcm: one.pcm, hz: one.hz > 0 ? one.hz : null }));
}
export const MOST_NAME = 12; // letters in a sound's name: what an instrument's button has room for

// Keep a new sound ({ name, rate, pcm, hz }). Resolves to it, with the id it now has.
let unkept = 0;
export async function addSound(one) {
  const id = await among('readwrite', (store) => store.add(one));
  return { ...one, id: id ?? (unkept -= 1) }; // (not kept: a number no kept one has, for as long as the page lasts)
}

// Give a kept sound another name.
export const renameSound = (one, name) => among('readwrite', (store) => store.put({ ...one, name }));

// Forget a sound.
export const dropSound = (id) => among('readwrite', (store) => store.delete(id));
