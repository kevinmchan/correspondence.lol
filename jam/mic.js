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
// One sound for each instrument, by its place among them. Where the browser
// will not keep them (a private window), they last as long as the page.
const base = () => new Promise((resolve) => {
  try {
    const opening = indexedDB.open('jam', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('sounds');
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
const sound = (one) => (one && one.pcm instanceof Float32Array && one.pcm.length && one.rate > 0 ? { rate: one.rate, pcm: one.pcm, hz: one.hz > 0 ? one.hz : null } : null);

// The sounds kept, for `count` instruments: each a sound, or null.
export async function sounds(count) {
  const db = await base();
  const all = [];
  for (let index = 0; index < count; index++) all.push(db ? sound(await done(db.transaction('sounds').objectStore('sounds').get(index))) : null);
  db?.close();
  return all;
}

// Keep a sound for an instrument, or (null) forget the one it had.
export async function keepSound(index, one) {
  const db = await base();
  if (!db) return;
  const store = db.transaction('sounds', 'readwrite').objectStore('sounds');
  await done(one ? store.put(one, index) : store.delete(index));
  db.close();
}
