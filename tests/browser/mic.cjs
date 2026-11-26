// A microphone for the checks: there is none on the machines they run on, and
// nobody to say yes to it. `how` is what it hears: 'hum' (a steady note of 220
// hertz), 'silent' (nothing at all), or 'refused' (it may not be used).
// Run in the page before it loads: page.addInitScript(fakeMic, 'hum').
function fakeMic(how) {
  const hear = async () => {
    if (how === 'refused') throw new DOMException('Permission denied', 'NotAllowedError');
    const ctx = new AudioContext();
    const out = ctx.createMediaStreamDestination();
    if (how === 'hum') {
      const voice = ctx.createOscillator();
      voice.frequency.value = 220;
      const level = ctx.createGain();
      level.gain.value = 0.3;
      voice.connect(level).connect(out);
      voice.start();
    }
    return out.stream;
  };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, get: () => ({ getUserMedia: hear }) });
}

module.exports = { fakeMic };
