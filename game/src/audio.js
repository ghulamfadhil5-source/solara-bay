// Solara Bay — synthesized sound, no audio files.
// One clear job: every sound (engine, siren, gunshot, chime, UI) is made
// with WebAudio oscillators and filtered noise, so the game ships silent
// files and still sounds alive.

let ctx = null;
let master = null;
let engineOsc = null;
let engineGain = null;
let engineFilter = null;
let sirenOsc = null;
let sirenGain = null;
let sirenTimer = 0;
let sirenHigh = false;
let muted = false;

export function initAudio() {
  if (ctx) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // Engine: a sawtooth through a lowpass, pitch follows speed.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    // Siren: a sine that alternates two tones.
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 660;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
  } catch (e) {
    ctx = null;
  }
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

export function updateEngine(speed, maxSpeed, inCar) {
  if (!ctx || !engineOsc) return;
  const t = ctx.currentTime;
  const target = inCar ? 0.05 + (Math.abs(speed) / maxSpeed) * 0.075 : 0;
  engineGain.gain.setTargetAtTime(target, t, 0.1);
  engineOsc.frequency.setTargetAtTime(52 + (Math.abs(speed) / maxSpeed) * 130, t, 0.08);
}

export function updateSiren(dt, active) {
  if (!ctx || !sirenOsc) return;
  if (!active) {
    sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    return;
  }
  sirenTimer += dt;
  if (sirenTimer > 0.42) {
    sirenTimer = 0;
    sirenHigh = !sirenHigh;
    sirenOsc.frequency.setTargetAtTime(sirenHigh ? 880 : 660, ctx.currentTime, 0.02);
  }
  sirenGain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.1);
}

function noiseBurst(duration, filterFreq, gainValue) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.value = gainValue;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start();
}

function tone(freq, duration, type, gainValue, slideTo) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainValue, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.02);
}

export function playGunshot() {
  noiseBurst(0.14, 2400, 0.5);
  tone(160, 0.08, 'square', 0.18, 60);
}

export function playCrash() {
  noiseBurst(0.3, 700, 0.6);
  tone(90, 0.25, 'sine', 0.4, 40);
}

export function playChime() {
  tone(660, 0.12, 'sine', 0.22);
  setTimeout(() => tone(880, 0.16, 'sine', 0.22), 110);
  setTimeout(() => tone(1320, 0.22, 'sine', 0.18), 220);
}

export function playClick() {
  tone(520, 0.06, 'square', 0.1);
}

export function playBusted() {
  tone(440, 0.3, 'sawtooth', 0.2, 220);
  setTimeout(() => tone(330, 0.4, 'sawtooth', 0.2, 165), 280);
}

export function playPickup() {
  tone(990, 0.1, 'sine', 0.2, 1320);
}
