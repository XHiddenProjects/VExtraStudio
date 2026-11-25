/* Vextra game editor – music kits: procedurally synthesized preset instruments (no samples, nothing downloaded).
   Every instrument is a function (ctx, out, t, dur, midi, vel) that schedules Web Audio nodes on any BaseAudioContext
   (OfflineAudioContext for rendering, AudioContext for auditioning). All randomness comes from a seeded generator, so a
   given song renders to the same samples every time. Node can require() this file to read the catalog (no audio needed). */
(function (root) {
  'use strict';
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

  /* ------------------------------------------------------------------ catalog (metadata only) */
  const INSTRUMENTS = {};
  const def = (id, name, group, type, lo, hi, extra) => { INSTRUMENTS[id] = Object.assign({ id, name, group, type, lo, hi }, extra || {}); };
  // melodic
  def('strings', 'Strings ensemble', 'Orchestral', 'tone', 36, 88); def('pizzicato', 'Pizzicato strings', 'Orchestral', 'tone', 36, 88);
  def('brass', 'Brass section', 'Orchestral', 'tone', 36, 84); def('flute', 'Flute', 'Orchestral', 'tone', 60, 96);
  def('clarinet', 'Clarinet', 'Orchestral', 'tone', 50, 90); def('harp', 'Harp', 'Orchestral', 'tone', 36, 96);
  def('timpani', 'Timpani (pitched)', 'Orchestral', 'tone', 36, 60); def('choir', 'Choir “ah”', 'Orchestral', 'tone', 48, 84);
  def('piano', 'Grand piano', 'Keys', 'tone', 28, 96); def('epiano', 'Electric piano', 'Keys', 'tone', 36, 90);
  def('fmbell', 'FM bell', 'Keys', 'tone', 48, 108); def('vibes', 'Vibraphone', 'Keys', 'tone', 48, 96);
  def('distguitar', 'Distorted guitar', 'Rock', 'tone', 28, 84); def('cleanguitar', 'Clean guitar', 'Rock', 'tone', 40, 88);
  def('rockbass', 'Rock bass', 'Rock', 'tone', 24, 60);
  def('synthlead', 'Synth lead', 'Electronic', 'tone', 48, 96); def('supersaw', 'Super-saw', 'Electronic', 'tone', 36, 90);
  def('pad', 'Synth pad', 'Electronic', 'tone', 36, 84); def('synthbass', 'Synth bass', 'Electronic', 'tone', 24, 60);
  def('subbass', 'Sub bass', 'Electronic', 'tone', 24, 55); def('pluck', 'Synth pluck', 'Electronic', 'tone', 48, 96);
  def('pulse12', 'Pulse 12.5%', 'Chiptune', 'tone', 36, 96); def('pulse25', 'Pulse 25%', 'Chiptune', 'tone', 36, 96);
  def('pulse50', 'Pulse 50%', 'Chiptune', 'tone', 36, 96); def('triangle8', 'Triangle', 'Chiptune', 'tone', 24, 84);
  def('warmpad', 'Warm pad', 'Ambient', 'tone', 36, 84); def('drone', 'Drone', 'Ambient', 'tone', 24, 60);
  def('whisper', 'Whisper / wind', 'Horror', 'tone', 36, 96); def('vinyl', 'Vinyl crackle', 'Lo-fi', 'tone', 60, 60);
  def('upright', 'Upright bass', 'Jazz', 'tone', 28, 60); def('sax', 'Saxophone', 'Jazz', 'tone', 55, 92);
  def('acguitar', 'Acoustic guitar', 'Folk', 'tone', 40, 88); def('fiddle', 'Fiddle', 'Folk', 'tone', 55, 96); def('whistle', 'Tin whistle', 'Folk', 'tone', 72, 100);
  // drum kits: midi → [voice, options, gain]
  const ROW_NAMES = { 35: 'Deep hit', 36: 'Kick', 37: 'Rim', 38: 'Snare', 39: 'Clap', 41: 'Tom low', 42: 'Hi-hat', 45: 'Tom mid', 46: 'Open hat', 47: 'Tom high', 49: 'Crash', 50: 'Tom 2', 51: 'Ride', 54: 'Tambourine', 70: 'Shaker' };
  const ROW_ORDER = [49, 51, 46, 42, 54, 70, 50, 47, 45, 41, 39, 37, 38, 36, 35];
  const KITMAPS = {
    'drums-rock': { 36: ['kick', { f0: 140, f1: 50, dec: 0.3 }, 1], 37: ['rim', {}, 0.7], 38: ['snare', { tone: 200, dec: 0.2, nv: 0.7 }, 1], 39: ['clap', {}, 0.8], 42: ['hat', { dec: 0.045 }, 0.8], 46: ['hat', { dec: 0.3, hp: 6500 }, 0.8], 49: ['crash', { dec: 1.6 }, 0.9], 41: ['tom', { f: 90, dec: 0.4 }, 1], 45: ['tom', { f: 118, dec: 0.36 }, 1], 47: ['tom', { f: 150, dec: 0.32 }, 1], 50: ['tom', { f: 185, dec: 0.3 }, 1], 51: ['ride', { dec: 0.6 }, 0.8] },
    'drums-electro': { 36: ['kick', { f0: 120, f1: 40, dec: 0.5, click: 0.15 }, 1.1], 37: ['rim', {}, 0.6], 38: ['snare', { tone: 230, dec: 0.22, nv: 0.55, hp: 1800 }, 0.9], 39: ['clap', {}, 1], 42: ['hat', { dec: 0.035, hp: 8500 }, 0.7], 46: ['hat', { dec: 0.22, hp: 8000 }, 0.7], 49: ['crash', { dec: 1.8 }, 0.7], 41: ['tom', { f: 80, dec: 0.5 }, 0.9], 45: ['tom', { f: 110, dec: 0.45 }, 0.9], 47: ['tom', { f: 150, dec: 0.4 }, 0.9], 50: ['tom', { f: 190, dec: 0.35 }, 0.9], 51: ['ride', { dec: 0.4 }, 0.6], 70: ['shaker', {}, 0.7], 54: ['tamb', {}, 0.7] },
    'drums-chip': { 36: ['kick', { f0: 180, f1: 45, dec: 0.12, wave: 'square', click: 0 }, 0.8], 38: ['snare', { chip: 1, dec: 0.12, nv: 1, hp: 800 }, 0.7], 39: ['snare', { chip: 1, dec: 0.2, nv: 1, hp: 500 }, 0.7], 37: ['rim', {}, 0.5], 42: ['hat', { chip: 1, dec: 0.025, hp: 6000 }, 0.55], 46: ['hat', { chip: 1, dec: 0.12, hp: 5000 }, 0.55], 49: ['crash', { chip: 1, dec: 0.8, hp: 3000 }, 0.5], 41: ['tom', { f: 90, dec: 0.15, wave: 'square' }, 0.7], 45: ['tom', { f: 130, dec: 0.14, wave: 'square' }, 0.7], 47: ['tom', { f: 180, dec: 0.13, wave: 'square' }, 0.7], 50: ['tom', { f: 240, dec: 0.12, wave: 'square' }, 0.7] },
    'drums-orch': { 36: ['kick', { f0: 85, f1: 38, dec: 0.9, click: 0.05 }, 0.9], 38: ['snare', { tone: 220, dec: 0.14, nv: 0.8, hp: 2200 }, 0.8], 35: ['boom', {}, 1], 41: ['tom', { f: 70, dec: 1.3, timp: 1 }, 1.1], 45: ['tom', { f: 98, dec: 1.2, timp: 1 }, 1.1], 47: ['tom', { f: 117, dec: 1.1, timp: 1 }, 1.1], 50: ['tom', { f: 147, dec: 1, timp: 1 }, 1.1], 49: ['crash', { dec: 2.8, hp: 3500 }, 0.8], 54: ['tamb', {}, 0.6], 42: ['shaker', {}, 0.5] },
    'drums-jazz': { 36: ['kick', { f0: 105, f1: 55, dec: 0.25, click: 0.05 }, 0.65], 37: ['rim', {}, 0.7], 38: ['brush', {}, 0.9], 42: ['hat', { dec: 0.05, hp: 6000 }, 0.45], 46: ['hat', { dec: 0.25, hp: 6000 }, 0.5], 51: ['ride', { dec: 0.9, jazz: 1 }, 0.9], 49: ['crash', { dec: 2, hp: 5500 }, 0.5], 41: ['tom', { f: 95, dec: 0.4 }, 0.7], 45: ['tom', { f: 125, dec: 0.35 }, 0.7], 47: ['tom', { f: 160, dec: 0.3 }, 0.7] },
    'drums-lofi': { 36: ['kick', { f0: 100, f1: 48, dec: 0.28, click: 0.05, lp: 1800 }, 1], 37: ['rim', {}, 0.5], 38: ['snare', { tone: 180, dec: 0.2, nv: 0.5, hp: 1200, lp: 4500 }, 0.9], 39: ['clap', {}, 0.7], 42: ['hat', { dec: 0.04, hp: 6500, lp: 9000 }, 0.6], 46: ['hat', { dec: 0.18, hp: 6000, lp: 9000 }, 0.55], 51: ['ride', { dec: 0.4 }, 0.4], 70: ['shaker', {}, 0.5] },
    'drums-folk': { 36: ['kick', { f0: 95, f1: 55, dec: 0.22, click: 0.05, lp: 1200 }, 1], 37: ['rim', {}, 0.6], 38: ['tom', { f: 165, dec: 0.2, frame: 1 }, 1], 39: ['clap', {}, 0.7], 41: ['tom', { f: 100, dec: 0.3, frame: 1 }, 1], 45: ['tom', { f: 130, dec: 0.26, frame: 1 }, 1], 54: ['tamb', {}, 0.9], 70: ['shaker', {}, 0.9], 42: ['hat', { dec: 0.04 }, 0.4] },
    'drums-epic': { 35: ['boom', {}, 1], 36: ['kick', { f0: 90, f1: 30, dec: 1.1, click: 0.1 }, 1], 38: ['snare', { tone: 180, dec: 0.45, nv: 0.9, hp: 1400 }, 1], 41: ['tom', { f: 62, dec: 0.9, taiko: 1 }, 1.1], 45: ['tom', { f: 82, dec: 0.8, taiko: 1 }, 1.1], 47: ['tom', { f: 105, dec: 0.7, taiko: 1 }, 1.1], 50: ['tom', { f: 130, dec: 0.6, taiko: 1 }, 1.1], 49: ['crash', { dec: 3.2, hp: 3500 }, 0.8], 54: ['tamb', {}, 0.5], 39: ['clap', {}, 0.8] },
    'drums-horror': { 35: ['thump', { f: 75 }, 1.1], 36: ['thump', { f: 90 }, 1], 38: ['snare', { tone: 150, dec: 0.3, nv: 0.4, hp: 900, lp: 3000 }, 0.5], 49: ['metal', {}, 0.8], 70: ['rattle', {}, 0.7], 41: ['tom', { f: 60, dec: 1, timp: 1 }, 1], 45: ['tom', { f: 80, dec: 0.9, timp: 1 }, 1] },
  };
  const DRUM_LABEL = { 'drums-rock': 'Rock drum kit', 'drums-electro': 'Drum machine', 'drums-chip': '8-bit drums', 'drums-orch': 'Orchestral percussion', 'drums-jazz': 'Jazz brush kit', 'drums-lofi': 'Dusty lo-fi kit', 'drums-folk': 'Folk percussion', 'drums-epic': 'Epic taiko kit', 'drums-horror': 'Horror percussion' };
  for (const id of Object.keys(KITMAPS)) {
    const keys = Object.keys(KITMAPS[id]).map(Number);
    def(id, DRUM_LABEL[id], 'Drums', 'drum', 35, 70, { rows: ROW_ORDER.filter((m) => keys.includes(m)).map((m) => [m, ROW_NAMES[m]]) });
  }

  /* kits per genre: default tracks for the studio ([name, instrument, volume, pan]) + effects */
  const KITS = {
    orchestral: { name: 'Orchestral', fx: { reverb: { time: 2.6, wet: 0.3 } }, tracks: [['Strings', 'strings', 0.8, -0.15], ['Brass', 'brass', 0.6, -0.3], ['Flute', 'flute', 0.7, 0.25], ['Clarinet', 'clarinet', 0.6, -0.25], ['Harp', 'harp', 0.7, 0.35], ['Pizzicato', 'pizzicato', 0.6, 0.2], ['Timpani', 'timpani', 0.8, 0], ['Percussion', 'drums-orch', 0.7, 0]] },
    rock: { name: 'Rock', fx: { reverb: { time: 0.9, wet: 0.12 } }, tracks: [['Distorted guitar', 'distguitar', 0.7, -0.4], ['Lead guitar', 'distguitar', 0.6, 0.35], ['Clean guitar', 'cleanguitar', 0.5, 0.4], ['Bass', 'rockbass', 0.85, 0], ['Drums', 'drums-rock', 0.9, 0]] },
    synthwave: { name: 'Synthwave', fx: { reverb: { time: 1.8, wet: 0.3 } }, tracks: [['Synth lead', 'synthlead', 0.6, 0.2], ['Arp', 'pluck', 0.55, -0.25], ['Pad', 'pad', 0.55, 0], ['Bass', 'synthbass', 0.85, 0], ['Super-saw', 'supersaw', 0.45, 0.3], ['Drum machine', 'drums-electro', 0.9, 0]] },
    electronic: { name: 'Electronic', fx: { reverb: { time: 1.2, wet: 0.2 } }, tracks: [['Synth lead', 'synthlead', 0.6, 0.15], ['Chords', 'supersaw', 0.5, -0.2], ['Pluck', 'pluck', 0.55, 0.25], ['Pad', 'pad', 0.45, 0], ['Bass', 'synthbass', 0.9, 0], ['Sub', 'subbass', 0.7, 0], ['Drum machine', 'drums-electro', 0.9, 0]] },
    chiptune: { name: 'Chiptune (8-bit)', fx: { reverb: { time: 0, wet: 0 } }, tracks: [['Pulse lead', 'pulse50', 0.6, 0], ['Pulse arp', 'pulse25', 0.5, -0.15], ['Pulse harmony', 'pulse12', 0.4, 0.15], ['Triangle bass', 'triangle8', 0.9, 0], ['Noise drums', 'drums-chip', 0.8, 0]] },
    ambient: { name: 'Ambient', fx: { reverb: { time: 5, wet: 0.55 } }, tracks: [['Warm pad', 'warmpad', 0.7, 0], ['Drone', 'drone', 0.6, 0], ['Bells', 'fmbell', 0.45, 0.3], ['Choir', 'choir', 0.4, -0.3], ['Pluck', 'harp', 0.4, 0.2]] },
    jazz: { name: 'Jazz', fx: { reverb: { time: 1.1, wet: 0.15 } }, tracks: [['Piano', 'piano', 0.7, -0.2], ['Upright bass', 'upright', 0.9, 0.05], ['Saxophone', 'sax', 0.6, 0.25], ['Vibraphone', 'vibes', 0.5, 0.3], ['Brush kit', 'drums-jazz', 0.8, 0]] },
    lofi: { name: 'Lo-fi', fx: { reverb: { time: 1.4, wet: 0.25 }, lowpass: 6000 }, tracks: [['Keys', 'epiano', 0.7, -0.1], ['Melody', 'vibes', 0.45, 0.25], ['Bass', 'subbass', 0.85, 0], ['Dusty drums', 'drums-lofi', 0.85, 0], ['Vinyl', 'vinyl', 0.5, 0]] },
    folk: { name: 'Folk', fx: { reverb: { time: 1.2, wet: 0.16 } }, tracks: [['Acoustic guitar', 'acguitar', 0.8, -0.25], ['Fiddle', 'fiddle', 0.6, 0.25], ['Tin whistle', 'whistle', 0.45, 0.35], ['Bass', 'upright', 0.75, 0], ['Hand percussion', 'drums-folk', 0.7, 0]] },
    horror: { name: 'Horror', fx: { reverb: { time: 4, wet: 0.5 } }, tracks: [['Drone', 'drone', 0.8, 0], ['Strings', 'strings', 0.5, -0.3], ['Bell', 'fmbell', 0.4, 0.35], ['Piano', 'piano', 0.45, -0.1], ['Whispers', 'whisper', 0.45, 0.2], ['Heartbeat', 'drums-horror', 0.8, 0]] },
    epic: { name: 'Epic / Cinematic', fx: { reverb: { time: 3.2, wet: 0.35 } }, tracks: [['Strings', 'strings', 0.7, -0.2], ['Brass', 'brass', 0.7, 0.2], ['Choir', 'choir', 0.5, 0], ['Piano', 'piano', 0.4, -0.3], ['Sub bass', 'subbass', 0.8, 0], ['Taiko & percussion', 'drums-epic', 0.9, 0]] },
    piano: { name: 'Piano', fx: { reverb: { time: 2.2, wet: 0.3 } }, tracks: [['Piano', 'piano', 0.8, -0.1], ['Piano melody', 'piano', 0.7, 0.1], ['Pad', 'warmpad', 0.4, 0], ['Strings', 'strings', 0.35, 0.2]] },
  };

  /* ------------------------------------------------------------------ synthesis helpers */
  const state = new WeakMap();
  const S = (c) => { let s = state.get(c); if (!s) { s = { rng: mulberry32(1), noise: null, cache: {} }; state.set(c, s); } return s; };
  function seed(c, n) { S(c).rng = mulberry32(n >>> 0); }
  const rnd = (c) => S(c).rng();
  function noiseBuf(c) {
    const s = S(c); if (!s.noise) { const r = mulberry32(0xC0FFEE), n = Math.floor(c.sampleRate * 2), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = r() * 2 - 1; s.noise = b; }
    return s.noise;
  }
  function NS(c, t, end) { const src = c.createBufferSource(); src.buffer = noiseBuf(c); src.loop = true; src.start(t, rnd(c) * 1.5); src.stop(end + 0.03); return src; }
  function O(c, type, f, t, end, det) { const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (det) o.detune.value = det; o.start(t); o.stop(end + 0.05); return o; }
  function OW(c, wave, f, t, end, det) { const o = c.createOscillator(); o.setPeriodicWave(wave); o.frequency.setValueAtTime(f, t); if (det) o.detune.value = det; o.start(t); o.stop(end + 0.05); return o; }
  const F = (c, type, f, q) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = Math.min(f, c.sampleRate * 0.45); if (q !== undefined) n.Q.value = q; return n; };
  const G = (c, v) => { const g = c.createGain(); g.gain.value = v === undefined ? 1 : v; return g; };
  /** gate-style envelope (attack / decay / sustain / release); returns the gain node and the time everything has faded out */
  function ADSR(c, t, dur, peak, a, d, s, r) {
    const g = c.createGain(), p = g.gain; a = Math.max(0.003, a); d = Math.max(0.005, d); peak = Math.max(peak, 0.0002);
    const off = t + Math.max(dur, a + 0.004);
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a);
    if (off > t + a + d) { p.linearRampToValueAtTime(peak * s, t + a + d); p.setValueAtTime(peak * s, off); }
    else p.linearRampToValueAtTime(peak * (1 - (1 - s) * Math.max(0, (off - t - a) / d)), off);
    p.linearRampToValueAtTime(0, off + Math.max(0.01, r));
    return { g, end: off + Math.max(0.01, r) };
  }
  /** percussive envelope: instant attack, exponential decay to silence in `dec` seconds */
  function PERC(c, t, peak, atk, dec) {
    const g = c.createGain(), p = g.gain; atk = Math.max(0.002, atk); peak = Math.max(peak, 0.0002);
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + atk); p.exponentialRampToValueAtTime(0.0002, t + atk + dec); p.setValueAtTime(0, t + atk + dec + 0.002);
    return { g, end: t + atk + dec };
  }
  /** decaying envelope that is damped when the key is released (piano, mallets, plucks): T = seconds to fall 60 dB */
  function PD(c, t, dur, peak, atk, T, rel) {
    const g = c.createGain(), p = g.gain; atk = Math.max(0.002, atk); peak = Math.max(peak, 0.0004);
    const off = t + Math.max(dur, atk + 0.02), lvl = Math.max(0.0002, peak * Math.pow(0.001, (off - t - atk) / T));
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + atk); p.exponentialRampToValueAtTime(lvl, off); p.linearRampToValueAtTime(0, off + rel);
    return { g, end: off + rel };
  }
  function vib(c, t, end, targets, rate, cents, delay) {
    const l = O(c, 'sine', rate, t, end), lg = c.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + delay); lg.gain.linearRampToValueAtTime(cents, t + delay + 0.35); l.connect(lg);
    for (const o of targets) lg.connect(o.detune);
  }
  function pulseWave(c, duty) {
    const s = S(c), k = 'pw' + duty; if (s.cache[k]) return s.cache[k];
    const N = 48, re = new Float32Array(N + 1), im = new Float32Array(N + 1); for (let n = 1; n <= N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    return (s.cache[k] = c.createPeriodicWave(re, im));
  }
  function driveCurve(c, k) {
    const s = S(c), key = 'dc' + k; if (s.cache[key]) return s.cache[key];
    const n = 1024, a = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; a[i] = Math.tanh(x * k) / Math.tanh(k); } return (s.cache[key] = a);
  }
  /** Karplus-Strong plucked string rendered into a buffer; T = seconds to fall 60 dB, bright = 0..1 */
  function KS(c, out, t, midi, len, vel, T, bright, peak) {
    const f = mtof(midi), sr = c.sampleRate, N = Math.max(2, Math.round(sr / (f * 1)) - 0), fo = sr / (N + 0.5), rate = f / fo;
    len = Math.min(len, T * 1.3, 4); const n = Math.max(64, Math.ceil(len * sr)), buf = c.createBuffer(1, n, sr), d = buf.getChannelData(0), r = S(c).rng;
    let prev = 0; for (let i = 0; i < N && i < n; i++) { prev += ((r() * 2 - 1) - prev) * bright; d[i] = prev * (1 + (1 - bright) * 2); }
    const k = 0.5 * Math.pow(0.001, N / (sr * T)) * 2 * 0.5 + 0.0; const damp = Math.min(0.9995, Math.pow(0.001, N / (sr * T)));
    for (let i = N; i < n; i++) d[i] = damp * 0.5 * (d[i - N] + (i - N - 1 >= 0 ? d[i - N - 1] : d[i - N])) + 0 * k;
    let pk = 0; for (let i = 0; i < Math.min(n, N * 2); i++) pk = Math.max(pk, Math.abs(d[i])); if (pk > 0) for (let i = 0; i < n; i++) d[i] /= pk;
    const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = c.createGain(), end = t + n / sr / rate; g.gain.setValueAtTime(peak * vel, t); g.gain.setValueAtTime(peak * vel, Math.max(t, end - 0.04)); g.gain.linearRampToValueAtTime(0, end);
    src.connect(g); g.connect(out); src.start(t); src.stop(end + 0.02); return { g, end };
  }
  const tone = (c, out, node, end) => { node.connect(out); return end; };
  void tone;

  /* ------------------------------------------------------------------ melodic instruments */
  const I = {};
  I.strings = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.2, 0.28, 0.2, 0.85, 0.45), lp = F(c, 'lowpass', Math.min(8000, f * 5 + 800), 0.5); lp.connect(g); g.connect(o);
    const os = [-9, 0, 9].map((dt) => O(c, 'sawtooth', f, t, end, dt)); os.forEach((x) => x.connect(lp)); vib(c, t, end, os, 5.3 + rnd(c) * 0.6, 12, 0.3);
  };
  I.pizzicato = (c, o, t, dur, m, v) => { KS(c, o, t, m, Math.min(dur + 0.2, 0.9), v, 0.35, 0.7, 0.5); };
  I.brass = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.2, 0.06, 0.15, 0.8, 0.15), lp = F(c, 'lowpass', f * 1.5, 1.2);
    lp.frequency.setValueAtTime(f * 1.5, t); lp.frequency.linearRampToValueAtTime(Math.min(f * 6, 5500), t + 0.12); lp.frequency.linearRampToValueAtTime(Math.min(f * 4, 4000), t + 0.4); lp.connect(g); g.connect(o);
    [-5, 5].forEach((dt) => O(c, 'sawtooth', f, t, end, dt).connect(lp));
  };
  I.flute = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.3, 0.08, 0.1, 0.85, 0.2); g.connect(o);
    const a = O(c, 'sine', f, t, end), b = O(c, 'triangle', f * 2, t, end), bg = G(c, 0.12); a.connect(g); b.connect(bg); bg.connect(g);
    const nz = NS(c, t, end), bp = F(c, 'bandpass', f * 2, 3), ng = G(c, 0.08); nz.connect(bp); bp.connect(ng); ng.connect(g); vib(c, t, end, [a, b], 5, 14, 0.25);
  };
  I.clarinet = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.22, 0.06, 0.1, 0.8, 0.15), lp = F(c, 'lowpass', Math.min(f * 3, 2600), 0.7); lp.connect(g); g.connect(o);
    const a = O(c, 'square', f, t, end); a.connect(lp); vib(c, t, end, [a], 5, 8, 0.3);
  };
  I.harp = (c, o, t, dur, m, v) => { KS(c, o, t, m, Math.max(dur, 1.6), v, 2.2, 0.45, 0.6); };
  I.timpani = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = PD(c, t, 0.05, v * 0.9, 0.004, 1.1, 0.5); g.connect(o);
    const os = O(c, 'sine', f * 1.5, t, end); os.frequency.exponentialRampToValueAtTime(f, t + 0.08); os.connect(g);
    const nz = NS(c, t, t + 0.06), lp = F(c, 'lowpass', 500, 0.5), pg = PERC(c, t, v * 0.4, 0.002, 0.05); nz.connect(lp); lp.connect(pg.g); pg.g.connect(o);
  };
  I.choir = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.16, 0.4, 0.2, 0.9, 0.6); g.connect(o);
    const os = [-8, 8].map((dt) => O(c, 'sawtooth', f, t, end, dt));
    [[700, 1], [1220, 0.5], [2600, 0.25]].forEach(([fq, gn]) => { const bp = F(c, 'bandpass', fq, 7), bg = G(c, gn); os.forEach((x) => x.connect(bp)); bp.connect(bg); bg.connect(g); });
    vib(c, t, end, os, 5.2, 16, 0.4);
  };
  I.piano = (c, o, t, dur, m, v) => {
    const f = mtof(m), T = 3.2 - Math.min(2.2, Math.max(0, (m - 36) / 36) * 2.2), { g, end } = PD(c, t, dur, v * 0.34, 0.003, T, 0.18), lp = F(c, 'lowpass', Math.min(9000, 1200 + v * 4500 + f * 2), 0.4);
    lp.connect(g); g.connect(o);
    [[1, 1, 'sine'], [2, 0.5, 'triangle'], [3, 0.24, 'sine'], [4, 0.12, 'sine'], [5, 0.06, 'sine']].forEach(([k, a, ty]) => { const x = O(c, ty, f * k * (1 + 0.0004 * k * k), t, end), xg = G(c, a); x.connect(xg); xg.connect(lp); });
    const nz = NS(c, t, t + 0.03), nb = F(c, 'bandpass', 2500, 1), ng = PERC(c, t, v * 0.04, 0.001, 0.02); nz.connect(nb); nb.connect(ng.g); ng.g.connect(o);
  };
  I.epiano = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = PD(c, t, dur, v * 0.3, 0.004, 2.2, 0.2); g.connect(o);
    const car = O(c, 'sine', f, t, end), mod = O(c, 'sine', f, t, end), mg = c.createGain(); mg.gain.setValueAtTime(f * (0.8 + v * 1.6), t); mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.5); mod.connect(mg); mg.connect(car.frequency); car.connect(g);
    const tn = O(c, 'sine', f * 14, t, t + 0.12), tg = PERC(c, t, v * 0.025, 0.001, 0.08); tn.connect(tg.g); tg.g.connect(o);
  };
  I.fmbell = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = PD(c, t, Math.max(dur, 0.6), v * 0.26, 0.002, 3.2, 0.8); g.connect(o);
    const car = O(c, 'sine', f, t, end), mod = O(c, 'sine', f * 3.5, t, end), mg = c.createGain(); mg.gain.setValueAtTime(f * 3.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.1, t + 2); mod.connect(mg); mg.connect(car.frequency); car.connect(g);
    const c2 = O(c, 'sine', f * 2.01, t, end), g2 = G(c, 0.25); c2.connect(g2); g2.connect(g);
  };
  I.vibes = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = PD(c, t, Math.max(dur, 0.4), v * 0.3, 0.003, 2.2, 0.5), tr = G(c, 1); g.connect(tr); tr.connect(o);
    const car = O(c, 'sine', f, t, end), mod = O(c, 'sine', f * 4, t, end), mg = c.createGain(); mg.gain.setValueAtTime(f * 1.6, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.4); mod.connect(mg); mg.connect(car.frequency); car.connect(g);
    const l = O(c, 'sine', 5, t, end), lg = G(c, 0.15); l.connect(lg); lg.connect(tr.gain);
  };
  I.distguitar = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.1, 0.006, 0.06, 0.85, 0.07), pre = G(c, 5), ws = c.createWaveShaper(); ws.curve = driveCurve(c, 4); ws.oversample = '2x';
    const hp = F(c, 'highpass', 90, 0.7), lp = F(c, 'lowpass', 3300, 0.8); pre.connect(ws); ws.connect(hp); hp.connect(lp); lp.connect(g); g.connect(o);
    [-6, 6].forEach((dt) => O(c, 'sawtooth', f, t, end, dt).connect(pre));
  };
  I.cleanguitar = (c, o, t, dur, m, v) => { const lp = F(c, 'lowpass', 4200, 0.5); lp.connect(o); KS(c, lp, t, m, Math.max(dur, 0.8), v, 1.8, 0.55, 0.55); };
  I.acguitar = (c, o, t, dur, m, v) => { const lp = F(c, 'lowpass', 3000, 0.6); lp.connect(o); KS(c, lp, t, m, Math.max(dur, 0.7), v, 1.5, 0.4, 0.6); };
  I.rockbass = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.34, 0.005, 0.1, 0.8, 0.06), ws = c.createWaveShaper(), lp = F(c, 'lowpass', 900, 0.8); ws.curve = driveCurve(c, 1.6);
    const a = O(c, 'sawtooth', f, t, end), b = O(c, 'sine', f, t, end), bg = G(c, 0.8); a.connect(ws); ws.connect(lp); lp.connect(g); b.connect(bg); bg.connect(g); g.connect(o);
  };
  I.synthlead = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.17, 0.01, 0.12, 0.7, 0.12), lp = F(c, 'lowpass', 3200, 1.5); lp.connect(g); g.connect(o);
    const a = O(c, 'sawtooth', f, t, end, 6), b = O(c, 'square', f, t, end, -6), bg = G(c, 0.5); a.connect(lp); b.connect(bg); bg.connect(lp); vib(c, t, end, [a, b], 5.5, 10, 0.25);
  };
  I.supersaw = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.09, 0.01, 0.2, 0.6, 0.2), lp = F(c, 'lowpass', Math.min(5200, f * 6 + 800), 0.6); lp.connect(g); g.connect(o);
    [-18, -9, 0, 9, 18].forEach((dt) => O(c, 'sawtooth', f, t, end, dt).connect(lp));
  };
  I.pad = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.14, 0.5, 0.5, 0.8, 0.9), lp = F(c, 'lowpass', 500, 0.5);
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(Math.min(f * 3 + 300, 2200), t + 0.9); lp.connect(g); g.connect(o);
    [-7, 7].forEach((dt) => O(c, 'sawtooth', f, t, end, dt).connect(lp)); const s = O(c, 'square', f / 2, t, end), sg = G(c, 0.3); s.connect(sg); sg.connect(lp);
  };
  I.warmpad = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.2, 1.4, 0.6, 0.85, 1.8), lp = F(c, 'lowpass', 1500, 0.4); lp.connect(g); g.connect(o);
    O(c, 'sine', f, t, end).connect(lp); O(c, 'triangle', f * 1.003, t, end).connect(lp); const h2 = O(c, 'sine', f * 2, t, end), hg = G(c, 0.3); h2.connect(hg); hg.connect(lp);
  };
  I.drone = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.2, 1.5, 0.5, 0.9, 2), lp = F(c, 'lowpass', 300, 1.5); lp.connect(g); g.connect(o);
    O(c, 'sawtooth', f, t, end).connect(lp); O(c, 'sawtooth', f * 1.005, t, end).connect(lp); const sb = O(c, 'sine', f / 2, t, end), sg = G(c, 0.8); sb.connect(sg); sg.connect(g);
    const l = O(c, 'sine', 0.06 + rnd(c) * 0.04, t, end), lg = G(c, 250); l.connect(lg); lg.connect(lp.frequency);
  };
  I.synthbass = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.34, 0.005, 0.12, 0.6, 0.08), lp = F(c, 'lowpass', Math.min(f * 8, 4000), 3);
    lp.frequency.setValueAtTime(Math.min(f * 8, 4000), t); lp.frequency.exponentialRampToValueAtTime(Math.max(120, f * 2), t + 0.15); lp.connect(g); g.connect(o);
    O(c, 'sawtooth', f, t, end).connect(lp); const sb = O(c, 'sine', f, t, end), sg = G(c, 0.9); sb.connect(sg); sg.connect(g);
  };
  I.subbass = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.42, 0.01, 0.1, 0.9, 0.1); g.connect(o);
    O(c, 'sine', f, t, end).connect(g); const h = O(c, 'triangle', f * 2, t, end), hg = G(c, 0.12); h.connect(hg); hg.connect(g);
  };
  I.pluck = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = PD(c, t, Math.min(dur, 0.35), v * 0.22, 0.003, 0.45, 0.06), lp = F(c, 'lowpass', 4500, 2);
    lp.frequency.setValueAtTime(4500, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.25); lp.connect(g); g.connect(o);
    O(c, 'sawtooth', f, t, end, 4).connect(lp); O(c, 'square', f, t, end, -4).connect(lp);
  };
  const chipVoice = (duty, peak) => (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * peak, 0.004, 0.08, 0.65, 0.04); g.connect(o); OW(c, pulseWave(c, duty), f, t, end).connect(g);
  };
  I.pulse12 = chipVoice(0.125, 0.14); I.pulse25 = chipVoice(0.25, 0.15); I.pulse50 = chipVoice(0.5, 0.15);
  I.triangle8 = (c, o, t, dur, m, v) => { const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.34, 0.004, 0.02, 1, 0.03); g.connect(o); O(c, 'triangle', f, t, end).connect(g); };
  I.whisper = (c, o, t, dur, m, v) => {
    const end = t + dur + 0.5, g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.28, t + dur * 0.5); g.gain.linearRampToValueAtTime(0, t + dur + 0.5);
    const nz = NS(c, t, end), bp = F(c, 'bandpass', mtof(m) * 2, 6); bp.frequency.setValueAtTime(mtof(m) * 2, t); bp.frequency.linearRampToValueAtTime(mtof(m) * 2.6, t + dur); nz.connect(bp); bp.connect(g); g.connect(o);
  };
  I.vinyl = (c, o, t, dur, m, v) => {
    const sr = c.sampleRate, n = Math.max(8, Math.floor(dur * sr)), buf = c.createBuffer(1, n, sr), d = buf.getChannelData(0), r = S(c).rng;
    let lp = 0; for (let i = 0; i < n; i++) { lp += ((r() * 2 - 1) - lp) * 0.3; d[i] = lp * 0.02; }
    const pops = Math.floor(dur * 4); for (let k = 0; k < pops; k++) { const at = Math.floor(r() * (n - 60)), a = (0.1 + r() * 0.35) * (r() < 0.5 ? -1 : 1), L = 8 + Math.floor(r() * 40); for (let i = 0; i < L; i++) d[at + i] += a * Math.exp(-i / (L / 4)) * (1 - i / L); }
    const src = c.createBufferSource(); src.buffer = buf; const g = G(c, v * 0.5); src.connect(g); g.connect(o); src.start(t); src.stop(t + dur + 0.01);
  };
  I.upright = (c, o, t, dur, m, v) => {
    const lp = F(c, 'lowpass', 800, 0.7); lp.connect(o); KS(c, lp, t, m, Math.max(dur, 0.5), v, 0.9, 0.2, 0.85);
    const f = mtof(m), { g, end } = PD(c, t, dur, v * 0.18, 0.01, 0.6, 0.1); g.connect(o); O(c, 'sine', f, t, end).connect(g);
  };
  I.sax = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.22, 0.04, 0.1, 0.8, 0.1), lp = F(c, 'lowpass', Math.min(f * 4 + 400, 3200), 2); lp.connect(g); g.connect(o);
    const a = O(c, 'sawtooth', f, t, end), b = O(c, 'triangle', f, t, end, 3); a.connect(lp); b.connect(lp); vib(c, t, end, [a, b], 5.2, 18, 0.3);
    const nz = NS(c, t, end), bp = F(c, 'bandpass', 2400, 1.2), ng = G(c, 0.05); nz.connect(bp); bp.connect(ng); ng.connect(g);
  };
  I.fiddle = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.2, 0.07, 0.1, 0.85, 0.12), lp = F(c, 'lowpass', Math.min(f * 5, 5000), 1), hp = F(c, 'highpass', 220, 0.5); lp.connect(hp); hp.connect(g); g.connect(o);
    const a = O(c, 'sawtooth', f, t, end, 4), b = O(c, 'sawtooth', f, t, end, -4); a.connect(lp); b.connect(lp); vib(c, t, end, [a, b], 6, 22, 0.15);
    const nz = NS(c, t, end), nh = F(c, 'highpass', 4000, 0.5), ng = G(c, 0.025); nz.connect(nh); nh.connect(ng); ng.connect(g);
  };
  I.whistle = (c, o, t, dur, m, v) => {
    const f = mtof(m), { g, end } = ADSR(c, t, dur, v * 0.3, 0.06, 0.1, 0.9, 0.15); g.connect(o);
    const a = O(c, 'sine', f, t, end); a.connect(g); vib(c, t, end, [a], 5.5, 15, 0.2);
    const nz = NS(c, t, end), bp = F(c, 'bandpass', 3200, 2), ng = G(c, 0.03); nz.connect(bp); bp.connect(ng); ng.connect(g);
  };

  /* ------------------------------------------------------------------ drum voices */
  const nz = (c, t, len, type, f, q) => { const n = NS(c, t, t + len), fl = F(c, type, f, q); n.connect(fl); return fl; };
  const D = {
    kick(c, o, t, v, p) {
      const { g } = PERC(c, t, v * 0.9, 0.002, p.dec || 0.3), os = O(c, p.wave || 'sine', p.f0 || 140, t, t + (p.dec || 0.3) + 0.05); os.frequency.exponentialRampToValueAtTime(p.f1 || 48, t + 0.07);
      let out = o; if (p.lp) { const lp = F(c, 'lowpass', p.lp, 0.5); lp.connect(o); out = lp; } os.connect(g); g.connect(out);
      const ck = p.click === undefined ? 0.3 : p.click; if (ck > 0) { const hp = nz(c, t, 0.02, 'highpass', 1800, 0.5), pg = PERC(c, t, v * ck, 0.001, 0.012); hp.connect(pg.g); pg.g.connect(out); }
    },
    snare(c, o, t, v, p) {
      const dec = p.dec || 0.18; let out = o; if (p.lp) { const lp = F(c, 'lowpass', p.lp, 0.5); lp.connect(o); out = lp; }
      const hp = nz(c, t, dec + 0.05, 'highpass', p.hp || 1500, 0.6), pg = PERC(c, t, v * (p.nv || 0.55) * 0.7, 0.001, dec); hp.connect(pg.g); pg.g.connect(out);
      if (!p.chip) { const to = O(c, 'triangle', p.tone || 190, t, t + 0.15), tg = PERC(c, t, v * 0.35, 0.001, dec * 0.55); to.frequency.setValueAtTime((p.tone || 190) * 1.5, t); to.frequency.exponentialRampToValueAtTime(p.tone || 190, t + 0.03); to.connect(tg.g); tg.g.connect(out); }
    },
    rim(c, o, t, v) { const os = O(c, 'square', 1750, t, t + 0.05), pg = PERC(c, t, v * 0.18, 0.001, 0.025); os.connect(pg.g); pg.g.connect(o); const hp = nz(c, t, 0.03, 'highpass', 3000, 0.5), g2 = PERC(c, t, v * 0.12, 0.001, 0.015); hp.connect(g2.g); g2.g.connect(o); },
    hat(c, o, t, v, p) { const dec = p.dec || 0.05, hp = nz(c, t, dec + 0.05, 'highpass', p.hp || 7000, 0.6), pg = PERC(c, t, v * 0.3, 0.001, dec); let out = o; if (p.lp) { const lp = F(c, 'lowpass', p.lp, 0.5); lp.connect(o); out = lp; } hp.connect(pg.g); pg.g.connect(out); },
    clap(c, o, t, v) { for (let i = 0; i < 3; i++) { const bp = nz(c, t + i * 0.011, 0.05, 'bandpass', 1300, 1.4), pg = PERC(c, t + i * 0.011, v * 0.38, 0.001, 0.014); bp.connect(pg.g); pg.g.connect(o); } const bp = nz(c, t + 0.033, 0.2, 'bandpass', 1200, 1.2), pg = PERC(c, t + 0.033, v * 0.3, 0.001, 0.14); bp.connect(pg.g); pg.g.connect(o); },
    tom(c, o, t, v, p) {
      const f = p.f || 120, dec = p.dec || 0.3, { g } = PERC(c, t, v * 0.8, 0.002, dec), os = O(c, p.wave || 'sine', f * (p.timp ? 1.25 : 1.6), t, t + dec + 0.05); os.frequency.exponentialRampToValueAtTime(f, t + (p.taiko ? 0.12 : 0.07)); os.connect(g); g.connect(o);
      const lp = nz(c, t, 0.05, p.frame || p.taiko ? 'lowpass' : 'bandpass', p.frame ? 3000 : 900, 0.7), pg = PERC(c, t, v * (p.frame ? 0.5 : 0.3), 0.001, 0.04); lp.connect(pg.g); pg.g.connect(o);
    },
    crash(c, o, t, v, p) { const dec = p.dec || 1.6, hp = nz(c, t, dec + 0.05, 'highpass', p.hp || 4500, 0.5), pg = PERC(c, t, v * (p.chip ? 0.22 : 0.3), 0.003, dec); hp.connect(pg.g); pg.g.connect(o); },
    ride(c, o, t, v, p) {
      const dec = p.dec || 0.6, bp = nz(c, t, dec + 0.05, 'bandpass', p.jazz ? 6500 : 8000, 1.5), pg = PERC(c, t, v * 0.18, 0.002, dec); bp.connect(pg.g); pg.g.connect(o);
      [4500, 6300].forEach((fq) => { const os = O(c, 'sine', fq, t, t + dec), g = PERC(c, t, v * 0.05, 0.001, dec * 0.7); os.connect(g.g); g.g.connect(o); });
    },
    shaker(c, o, t, v) { const bp = nz(c, t, 0.12, 'bandpass', 7000, 1), g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.25, t + 0.018); g.gain.linearRampToValueAtTime(0, t + 0.07); bp.connect(g); g.connect(o); },
    tamb(c, o, t, v) { for (let i = 0; i < 3; i++) { const hp = nz(c, t + i * 0.012, 0.1, 'highpass', 6500, 0.5), pg = PERC(c, t + i * 0.012, v * 0.2, 0.001, 0.08); hp.connect(pg.g); pg.g.connect(o); } const bp = nz(c, t, 0.2, 'bandpass', 9500, 2), g = PERC(c, t, v * 0.12, 0.001, 0.16); bp.connect(g.g); g.g.connect(o); },
    boom(c, o, t, v) { const os = O(c, 'sine', 65, t, t + 1.6), { g } = PERC(c, t, v, 0.004, 1.5); os.frequency.exponentialRampToValueAtTime(26, t + 0.6); os.connect(g); g.connect(o); const lp = nz(c, t, 0.4, 'lowpass', 300, 0.5), pg = PERC(c, t, v * 0.35, 0.002, 0.3); lp.connect(pg.g); pg.g.connect(o); },
    thump(c, o, t, v, p) { const f = p.f || 80, os = O(c, 'sine', f, t, t + 0.4), { g } = PERC(c, t, v * 0.95, 0.004, 0.3), lp = F(c, 'lowpass', 220, 0.5); os.frequency.exponentialRampToValueAtTime(38, t + 0.2); os.connect(g); g.connect(lp); lp.connect(o); },
    brush(c, o, t, v) { const bp = nz(c, t, 0.4, 'bandpass', 3200, 0.7), g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.22, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0003, t + 0.26); bp.connect(g); g.connect(o); },
    metal(c, o, t, v) { const f = 330 + rnd(c) * 120, os = O(c, 'sine', f, t, t + 3), md = O(c, 'sine', f * 1.41, t, t + 3), mg = G(c, f * 2), { g } = PERC(c, t, v * 0.3, 0.002, 2.6); md.connect(mg); mg.connect(os.frequency); os.connect(g); g.connect(o); },
    rattle(c, o, t, v) { const bp = nz(c, t, 0.7, 'bandpass', 5200, 3), g = c.createGain(), l = O(c, 'square', 16, t, t + 0.7), lg = G(c, 0.5); g.gain.setValueAtTime(0.5 * v * 0.25, t); g.gain.linearRampToValueAtTime(0, t + 0.65); l.connect(lg); lg.connect(g.gain); bp.connect(g); g.connect(o); },
  };
  function drumPlay(kit) {
    return (c, o, t, dur, midi, vel) => { const e = KITMAPS[kit][midi]; if (!e) return; const g = G(c, e[2]); g.connect(o); D[e[0]](c, g, t, Math.max(0.05, Math.min(1, vel)), e[1]); };
  }
  for (const k of Object.keys(KITMAPS)) I[k] = drumPlay(k);

  /** Schedules one note (or drum hit) of instrument `id` on `ctx`, connected to `out`. t / dur in seconds. */
  function play(id, ctx, out, t, dur, midi, vel) {
    const fn = I[id]; if (!fn) return false;
    fn(ctx, out, t, Math.max(0.03, dur), midi, Math.max(0.05, Math.min(1, vel === undefined ? 0.8 : vel)));
    return true;
  }
  const api = { INSTRUMENTS, KITS, KITMAPS, ROW_NAMES, play, seed, mtof, mulberry32, noteName, NOTE_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.VXMusicKits = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
