// A reel (/?reel=inflection): a minute of somebody else's feed, played, on a
// network of the app's world called Ladder. It plays by itself; a touch
// anywhere pauses it, and the button in the corner says so.
//
// Its people speak as Dot does (jam/taste.js): the whole line goes into a
// bubble at once, for screen readers, and is shown a few words at a time, a
// bell for each, falling. Each speaker has bells of their own (reels/inflection.js).
// Penny cannot speak, and in the sponsored clip at the end only hums.
//
// Everything is worked out from the time, so it can be paused, started part
// way (`&at=44`, for the sponsored clip; `&hold` to start it paused) and played again.

import { audio, holdMusic, isMuted, noise, tone } from '/postmarks/sound.js';
import { HELLO, createVoice, playAt } from '/penny/penny.js';
import * as INFLECTION from './inflection.js';

const REELS = { inflection: INFLECTION };
const still = matchMedia('(prefers-reduced-motion: reduce)');
const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13M16 5.5v13" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6l11-6.8z" fill="currentColor"/></svg>';

export function mount(root, life) {
  const url = new URL(location.href);
  const reel = REELS[url.searchParams.get('reel')] ?? INFLECTION;
  const main = root.querySelector('main.reel');
  const $ = (selector) => main.querySelector(selector);
  const [frame, stage, bar, bubble, said, pause, again, cta, adWords, comments] =
    ['.reel-frame', '.reel-stage', '.reel-bar i', '.reel-bubble', '.reel-said', '.reel-pause', '.reel-again', '.reel-cta', '.reel-ad-words', '.reel-comments'].map($);
  $('.reel-told').textContent = reel.TOLD;
  cta.href = playAt();

  // The shots, each a drawing in the frame.
  const shots = reel.SHOTS.map((shot) => {
    const el = document.createElement('div');
    el.className = `reel-shot shot-${shot.name}`;
    if (reel.DRAWINGS[shot.name]) el.innerHTML = reel.DRAWINGS[shot.name];
    frame.insertBefore(el, bubble);
    return { ...shot, el, key: null };
  });
  const shotOf = (name) => shots.find((shot) => shot.name === name).el;
  shotOf('comments').append(comments);
  shotOf('ad').append(adWords);
  comments.replaceChildren(...reel.COMMENTS.map((one) => {
    const item = document.createElement('div');
    item.className = `reel-comment${one.reply ? ' reply' : ''} by-${one.who}`;
    item.innerHTML = '<span class="face"></span><span class="words"><b></b><span></span></span>';
    item.querySelector('.face').textContent = one.face;
    item.querySelector('b').textContent = one.creator ? `${one.name} · creator` : one.name;
    item.querySelector('.words > span').textContent = one.text;
    return item;
  }));
  adWords.replaceChildren(...reel.AD_WORDS.map((one) => {
    const line = document.createElement('p');
    line.className = one.big ? 'big' : '';
    line.textContent = one.text;
    return line;
  }));
  const views = $('.reel-insights .views');
  const insights = $('.reel-insights');
  const timecode = $('.timecode');
  const seal = $('.seal-glow');

  // --- Sound -----------------------------------------------------------------------------
  // One bus for the reel, so that a pause hushes it; an echo beside it; and
  // two beds under Marcy's part: rain, and a clock.
  holdMusic(true);
  let bus = null;
  let echo = null;
  let rain = null;
  let drone = null;
  function engine() {
    if (isMuted()) return null;
    const live = audio();
    if (!live) return null;
    if (!bus) {
      const { ctx } = live;
      bus = ctx.createGain();
      bus.gain.value = playing ? 1 : 0;
      bus.connect(live.mix);
      echo = ctx.createGain();
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.42;
      const back = ctx.createGain();
      back.gain.value = 0.45;
      const dull = ctx.createBiquadFilter();
      dull.type = 'lowpass';
      dull.frequency.value = 1600;
      echo.connect(delay).connect(dull).connect(back).connect(delay);
      dull.connect(bus);
      // the rain: a loop of noise, high and soft
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 2600;
      band.Q.value = 0.5;
      rain = ctx.createGain();
      rain.gain.value = 0;
      src.connect(band).connect(rain).connect(bus);
      src.start();
      life.onEnd(() => src.stop());
    }
    return live.ctx;
  }
  life.onEnd(() => {
    holdMusic(false);
    const live = audio();
    if (bus && live) bus.gain.setTargetAtTime(0, live.ctx.currentTime, 0.08);
  });
  const voice = createVoice(life, { onNote: () => { seal?.classList.remove('lit'); void seal?.getBBox(); seal?.classList.add('lit'); } });

  function bell(who, index, count) {
    if (!engine()) return;
    const v = reel.VOICES[who];
    const freq = v.notes[Math.min(index, v.notes.length - 1)];
    const dur = index === count - 1 ? v.dur * 1.7 : v.dur;
    tone({ freq, dur, type: v.type, gain: v.gain, attack: v.echo ? 0.03 : 0.005, into: bus });
    if (v.echo) tone({ freq, dur, type: v.type, gain: v.gain * 0.8, attack: 0.03, into: echo });
  }
  // A whole line at once, as a comment comes in.
  const ring = (who, count = 3) => { for (let i = 0; i < count; i++) life.setTimeout(() => bell(who, i, count), i * reel.VOICES[who].gap * 1000); };

  const SOUNDS = {
    rise: () => tone({ freq: 196, to: 783.99, dur: 7.5, type: 'sine', gain: 0.025, attack: 1.2, into: bus }),
    run: () => [0, 0.12, 0.24, 0.36].forEach((at) => tone({ at, freq: 2093, dur: 0.03, type: 'square', gain: 0.02, into: bus })),
    turn: () => tone({ freq: 523.25, to: 392, dur: 0.9, type: 'sine', gain: 0.05, attack: 0.08, into: echo }),
    count: () => { for (let i = 0; i < 40; i++) tone({ at: i * 0.08, freq: 523.25 * 2 ** (i / 20), dur: 0.03, type: 'square', gain: 0.012, into: bus }); },
    zip: () => noise({ dur: 0.35, from: 1200, to: 5200, q: 2, gain: 0.08, into: bus }),
    drone: () => {
      const ctx = engine();
      if (!ctx || drone) return;
      drone = ctx.createGain();
      drone.gain.setValueAtTime(0.0001, ctx.currentTime);
      drone.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 4);
      drone.connect(bus);
      drone.connect(echo);
      for (const freq of [65.41, 98, 130.81]) { // C, G, C: no third, so it is neither glad nor sad
        const osc = ctx.createOscillator();
        osc.frequency.value = freq;
        osc.connect(drone);
        osc.start();
        life.onEnd(() => osc.stop());
      }
    },
    window: () => { tone({ freq: 261.63, dur: 2.4, gain: 0.08, attack: 0.05, into: bus }); tone({ freq: 261.63, dur: 2.4, gain: 0.07, attack: 0.05, into: echo }); },
    hum: () => voice.sing(HELLO, 0.7),
  };

  // --- Time -----------------------------------------------------------------------------
  let t = Math.min(Math.max(0, Number(url.searchParams.get('at')) || 0), reel.LENGTH);
  let playing = t < reel.LENGTH && !url.searchParams.has('hold'); // (`&hold`: start it paused, there)
  let last = null;
  let lineShown = null;
  let saidCount = 0;
  let cue = reel.CUES.findIndex((one) => one.at >= t);
  let commentsIn = reel.COMMENTS.filter((one) => one.at <= t).length;
  let nextTick = t;
  let begin = t; // (cues before where it was started are not played)

  function setPlaying(on) {
    playing = on && t < reel.LENGTH;
    main.classList.toggle('paused', !playing && t < reel.LENGTH);
    pause.innerHTML = playing ? PAUSE : PLAY;
    pause.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    const live = audio();
    if (bus && live) bus.gain.setTargetAtTime(playing ? 1 : 0, live.ctx.currentTime, 0.05);
  }

  // A shot comes up from its start; or, when the reel is started part way through it, as it would be by then.
  function restart(el, into) {
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    if (into > 0.05) for (const one of el.getAnimations({ subtree: true })) one.currentTime = (one.currentTime ?? 0) + into * 1000;
  }

  function draw(advancing) {
    // the shots
    for (const shot of shots) {
      const range = shot.ranges.find(([a, b]) => t >= a && (t < b || (b === reel.LENGTH && t <= b)));
      const key = range ? range[0] : null;
      if (key !== null && shot.key !== key) restart(shot.el, t - key);
      if (key === null && shot.key !== null) shot.el.classList.remove('on');
      shot.key = key;
    }
    // who is speaking, and how much of it has been said
    const line = reel.LINES.find((one) => t >= one.at && t < one.end) ?? null;
    if (line !== lineShown) {
      lineShown = line;
      saidCount = 0;
      const over = line && shots.find((shot) => shot.ranges.some(([a, b]) => line.at >= a && line.at < b));
      bubble.className = `reel-bubble${line ? ` on at-${line.where} in-${over?.name} by-${line.who}` : ''}`;
      bubble.replaceChildren(...(line ? line.said.flatMap((part, i) => { const span = document.createElement('span'); span.textContent = part; return i ? [' ', span] : [span]; }) : []));
      // (the whole line is said to screen readers once, as it comes)
      if (line) said.textContent = `${line.who === 'aside' ? 'Marcy, under her breath' : 'Marcy'}: ${line.said.join(' ')}`;
    }
    if (line) {
      const gap = reel.VOICES[line.who].gap;
      const count = still.matches ? line.said.length : Math.min(line.said.length, Math.floor((t - line.at) / gap) + 1);
      const spans = bubble.children;
      for (let i = saidCount; i < count; i++) {
        spans[i].classList.add('said');
        if (advancing) bell(line.who, i, line.said.length);
      }
      saidCount = Math.max(saidCount, count);
      main.classList.toggle('talking', line.where === 'face' && t < line.at + gap * line.said.length + 0.25);
    } else main.classList.remove('talking');

    // the comments, each with its bells
    const shown = reel.COMMENTS.filter((one) => one.at <= t).length;
    [...comments.children].forEach((item, i) => item.classList.toggle('in', i < shown));
    if (advancing) for (let i = commentsIn; i < shown; i++) {
      ring(reel.COMMENTS[i].who);
      said.textContent = `${reel.COMMENTS[i].name}: ${reel.COMMENTS[i].text}`;
    }
    commentsIn = shown;

    // the sponsored clip
    const ad = t >= reel.AD_AT;
    main.classList.toggle('is-ad', ad);
    [...adWords.children].forEach((p, i) => p.classList.toggle('in', t >= reel.AD_WORDS[i].at));
    cta.hidden = t < reel.CTA_AT;
    main.classList.toggle('offered', t >= reel.CTA_AT);
    main.classList.toggle('disclosed', t >= reel.DISCLOSE_AT);
    if (advancing && ad && !main.dataset.toldAd) { main.dataset.toldAd = '1'; said.textContent = `Sponsored: ${reel.AD_WORDS.map((one) => one.text).join(' ')}`; }

    // the views, going up
    const { COUNT } = reel;
    insights.classList.toggle('show', t >= COUNT.shown[0] && t < COUNT.shown[1]);
    const k = Math.min(1, Math.max(0, (t - COUNT.from) / (COUNT.to - COUNT.from)));
    views.textContent = Math.round(COUNT.start + (1 - (1 - k) ** 3) * (COUNT.end - COUNT.start)).toLocaleString('en-US');
    timecode.textContent = `00:00:${String(14 + Math.floor(Math.max(0, t - 27))).padStart(2, '0')}`;
    bar.style.transform = `scaleX(${t / reel.LENGTH})`;

    // sounds that are not speech
    if (advancing) {
      while (cue >= 0 && cue < reel.CUES.length && reel.CUES[cue].at <= t) {
        if (reel.CUES[cue].at >= begin && engine()) SOUNDS[reel.CUES[cue].sound]();
        cue++;
      }
      // the clock, quicker as it goes; and the rain; both stop at the cut
      if (t < reel.AD_AT && t >= nextTick) {
        if (engine()) tone({ freq: 2093, dur: 0.02, type: 'square', gain: 0.012, into: bus });
        nextTick = t + 0.55 - 0.3 * (t / reel.AD_AT);
      }
    }
    const live = audio();
    if (rain && live) rain.gain.setTargetAtTime(playing && t < reel.AD_AT ? 0.05 : 0, live.ctx.currentTime, t >= reel.AD_AT ? 0.02 : 0.3);
  }

  function frameLoop(now) {
    if (life.over) return;
    // (it waits for the splash, when the app opens on it, and for the app to be looked at)
    const advancing = last !== null && playing && !document.hidden && !document.querySelector('#splash');
    if (advancing) t = Math.min(reel.LENGTH, t + Math.min(0.1, (now - last) / 1000));
    last = now;
    engine(); // (sound starts as soon as it may)
    draw(advancing);
    if (t >= reel.LENGTH && playing) {
      setPlaying(false);
      again.hidden = false;
      pause.hidden = true;
    }
    requestAnimationFrame(frameLoop);
  }

  // A touch anywhere on the picture pauses it, or goes on.
  const toggle = () => { if (t < reel.LENGTH) setPlaying(!playing); };
  stage.addEventListener('click', toggle);
  pause.addEventListener('click', toggle);
  life.on(document, 'keydown', (event) => {
    if (event.key === ' ' && event.target === document.body) { event.preventDefault(); toggle(); }
  });
  again.addEventListener('click', () => {
    t = 0;
    begin = 0;
    cue = 0;
    commentsIn = 0;
    nextTick = 0;
    lineShown = null;
    delete main.dataset.toldAd;
    for (const shot of shots) { shot.el.classList.remove('on'); shot.key = null; }
    again.hidden = true;
    pause.hidden = false;
    setPlaying(true);
    pause.focus();
  });

  setPlaying(playing);
  if (t >= reel.LENGTH) { again.hidden = false; pause.hidden = true; }
  draw(false);
  requestAnimationFrame(frameLoop);
}
