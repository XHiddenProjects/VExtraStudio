/* Vextra game editor – procedural music: composes a loopable song for a genre (deterministic from a seed) and renders songs to audio.
   compose() is pure (no audio, runs in Node for tests); renderSong() needs Web Audio (OfflineAudioContext). Song format:
     { genre, bpm, bars, key (0-11), mode, seed, tracks:[{ name, inst, vol, pan, mute, solo, notes:[{ t (beats), d (beats), m (midi), v (0-1) }] }], clips:[…], fx:{ reverb:{time,wet}, lowpass } } */
(function (root) {
  'use strict';
  const K = root.VXMusicKits || (typeof require === 'function' ? require('./music-kits.js') : null);
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], pentatonic: [0, 2, 4, 7, 9] };
  const MODES = Object.keys(SCALES);
  /* progressions are lists of scale degrees (0 = I); one chord per bar */
  const PR = { pop: [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4]], sad: [[0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 5, 4]], epic: [[0, 5, 2, 6], [0, 2, 5, 4], [5, 3, 0, 4]], jazz: [[1, 4, 0, 5], [0, 5, 1, 4], [2, 5, 1, 4]], dark: [[0, 5, 6, 5], [0, 1, 0, 6], [0, 3, 6, 5]], calm: [[0, 3, 0, 4], [0, 5, 3, 4], [0, 2, 3, 0]], rock: [[0, 3, 4, 3], [0, 6, 3, 4], [0, 4, 5, 3]] };
  /* genre profile: tempo range, modes, progression family, drum patterns (16 steps per bar, x = hit, o = soft) and how each role plays */
  const G = {
    orchestral: { bpm: [66, 96], modes: ['minor', 'major', 'dorian'], prog: 'sad', drums: { 36: 'x.......x.......', 49: 'x...............', 35: '................' }, bass: 'whole', chord: 'whole', arp: 'eighth', lead: 'long', density: 0.55 },
    rock: { bpm: [100, 150], modes: ['minor', 'mixolydian', 'major'], prog: 'rock', drums: { 36: 'x.......x.x.....', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.', 49: 'x...............' }, bass: 'eighths', chord: 'power', arp: 'eighth', lead: 'mid', density: 0.7 },
    synthwave: { bpm: [92, 118], modes: ['minor', 'dorian'], prog: 'dark', drums: { 36: 'x...x...x...x...', 38: '....x.......x...', 39: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.' }, bass: 'offbeat', chord: 'whole', arp: 'sixteenth', lead: 'mid', density: 0.7 },
    electronic: { bpm: [118, 140], modes: ['minor', 'dorian', 'phrygian'], prog: 'dark', drums: { 36: 'x...x...x...x...', 39: '....x.......x...', 42: '..x...x...x...x.', 46: '..x...........x.' }, bass: 'offbeat', chord: 'stab', arp: 'sixteenth', lead: 'mid', density: 0.75 },
    chiptune: { bpm: [110, 160], modes: ['major', 'minor', 'mixolydian'], prog: 'pop', drums: { 36: 'x.....x.x.....x.', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.' }, bass: 'eighths', chord: 'none', arp: 'sixteenth', lead: 'fast', density: 0.85 },
    ambient: { bpm: [58, 80], modes: ['lydian', 'dorian', 'pentatonic'], prog: 'calm', drums: {}, bass: 'whole', chord: 'whole', arp: 'sparse', lead: 'long', density: 0.35 },
    jazz: { bpm: [92, 140], modes: ['dorian', 'mixolydian', 'major'], prog: 'jazz', drums: { 51: 'x.xx.xx.x.xx.xx.', 36: 'x...............', 42: '....x.......x...' }, bass: 'walking', chord: 'comp', arp: 'sparse', lead: 'swing', density: 0.6, swing: 0.16 },
    lofi: { bpm: [66, 86], modes: ['dorian', 'minor', 'major'], prog: 'jazz', drums: { 36: 'x.....x..x......', 38: '....x.......x...', 42: 'x.x.x.x.x.x.x.x.' }, bass: 'whole', chord: 'comp', arp: 'sparse', lead: 'swing', density: 0.5, swing: 0.1 },
    folk: { bpm: [86, 124], modes: ['major', 'mixolydian', 'dorian'], prog: 'pop', drums: { 36: 'x.......x.......', 54: 'x.x.x.x.x.x.x.x.', 37: '....x.......x...' }, bass: 'halves', chord: 'strum', arp: 'eighth', lead: 'mid', density: 0.65 },
    horror: { bpm: [50, 78], modes: ['phrygian', 'minor'], prog: 'dark', drums: { 35: 'x...............', 41: '........x.......' }, bass: 'whole', chord: 'whole', arp: 'sparse', lead: 'sparse', density: 0.3 },
    epic: { bpm: [84, 118], modes: ['minor', 'dorian'], prog: 'epic', drums: { 36: 'x...x...x...x...', 35: 'x...............', 41: '..x...x...x...x.', 49: 'x...............' }, bass: 'eighths', chord: 'whole', arp: 'eighth', lead: 'long', density: 0.7 },
    choral: { bpm: [56, 84], modes: ['minor', 'major', 'dorian'], prog: 'sad', drums: {}, bass: 'whole', chord: 'whole', arp: 'sparse', lead: 'long', density: 0.5 },
    piano: { bpm: [60, 100], modes: ['major', 'minor', 'lydian'], prog: 'sad', drums: {}, bass: 'whole', chord: 'arpeggio', arp: 'eighth', lead: 'mid', density: 0.6 },
  };
  const ROLE = { strings: 'chord', pad: 'chord', warmpad: 'chord', supersaw: 'chord', choir: 'chord', piano: 'chord', epiano: 'chord', acguitar: 'chord', cleanguitar: 'chord', distguitar: 'chord', drone: 'drone',
    rockbass: 'bass', synthbass: 'bass', subbass: 'bass', upright: 'bass', triangle8: 'bass', pluck: 'arp', pulse25: 'arp', harp: 'arp', pizzicato: 'arp', vibes: 'arp', fmbell: 'arp', whisper: 'fx', vinyl: 'fx',
    synthlead: 'lead', flute: 'lead', clarinet: 'lead', sax: 'lead', fiddle: 'lead', whistle: 'lead', pulse50: 'lead', pulse12: 'lead', brass: 'lead', timpani: 'perc', v_soprano: 'lead', v_mezzo: 'part', v_contralto: 'part', v_countertenor: 'part', v_tenor: 'part', v_baritone: 'part', v_bass: 'part' };
  const PART = { v_mezzo: 0, v_contralto: 1, v_countertenor: 2, v_tenor: 0, v_baritone: 1, v_bass: 0 };
  const roleOf = (inst) => (/^drums-/.test(inst) ? 'drums' : ROLE[inst] || 'lead');
  const rng32 = (a) => { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** Composes the notes for one track of `song` (role chosen from its instrument). Replaces track.notes. */
  function fillTrack(song, tr, rnd) {
    const P = G[song.genre] || G.piano, scale = SCALES[song.mode] || SCALES.major, bars = song.bars, root = 48 + song.key, role = roleOf(tr.inst), inst = K && K.INSTRUMENTS[tr.inst];
    const prog = PR[P.prog][Math.floor(rnd() * PR[P.prog].length)]; const deg = (b) => prog[b % prog.length];
    const pitch = (d, oct) => { const n = scale.length, o = Math.floor(d / n), i = ((d % n) + n) % n; return root + scale[i] + 12 * (o + (oct || 0)); };
    const chord = (b) => { const d = deg(b); return [pitch(d), pitch(d + 2), pitch(d + 4)]; };
    const fit = (m) => { if (!inst) return m; while (m < inst.lo) m += 12; while (m > inst.hi) m -= 12; return m; };
    const notes = []; const add = (t, d, m, v) => { notes.push({ t: +t.toFixed(4), d: +Math.max(0.0625, d).toFixed(4), m: fit(m), v: +clamp(v, 0.1, 1).toFixed(2) }); };
    const sw = P.swing || 0;
    for (let b = 0; b < bars; b++) {
      const t0 = b * 4, c = chord(b), r0 = c[0];
      if (role === 'drums') {
        const keys = K && K.KITMAPS[tr.inst] ? Object.keys(K.KITMAPS[tr.inst]).map(Number) : null; const fill = b % 4 === 3 && P.density > 0.55;
        for (const [m, pat] of Object.entries(P.drums)) { const mm = +m; if (keys && !keys.includes(mm)) continue; for (let s = 0; s < 16; s++) { const ch = pat[s]; if (ch === 'x' || ch === 'o') { let st = s; if (fill && (mm === 38 || mm === 39) && s >= 12) { add(t0 + s / 4, 0.2, mm, 0.7); continue; } add(t0 + st / 4 + (s % 2 ? sw : 0), 0.2, mm, (ch === 'o' ? 0.5 : 0.85) - (s % 4 ? 0.1 : 0) + rnd() * 0.1); } } }
        if (b % 4 === 0 && b > 0 && keys && keys.includes(49) && !P.drums[49]) add(t0, 1, 49, 0.8);
        continue;
      }
      if (role === 'bass') {
        const lowest = (m) => { while (m > 52) m -= 12; return m; }; const r = lowest(r0 - 12 + 12);
        if (P.bass === 'whole') add(t0, 4, r, 0.85);
        else if (P.bass === 'halves') { add(t0, 2, r, 0.85); add(t0 + 2, 2, lowest(c[2]), 0.7); }
        else if (P.bass === 'eighths') for (let s = 0; s < 8; s++) add(t0 + s / 2, 0.45, s % 4 === 3 ? lowest(c[2]) : r, s % 2 ? 0.65 : 0.85);
        else if (P.bass === 'offbeat') for (let s = 0; s < 8; s++) { if (s % 2) add(t0 + s / 2, 0.4, r, 0.85); else if (s % 4 === 0) add(t0 + s / 2, 0.25, r, 0.6); }
        else if (P.bass === 'walking') { const nx = chord(b + 1)[0]; const seq = [r, lowest(c[1]), lowest(c[2]), lowest(nx) - (rnd() < 0.5 ? 1 : 2)]; seq.forEach((m, i) => add(t0 + i + (i % 2 ? sw : 0), 0.95, m, 0.8)); }
        continue;
      }
      if (role === 'drone') { add(t0, 4, root - 12, 0.7); continue; }
      if (role === 'chord') {
        const vo = [c[0] + 12, c[1] + 12, c[2] + 12]; const ct = P.chord;
        if (ct === 'whole') vo.forEach((m) => add(t0, 4, m, 0.6)); else if (ct === 'none') continue;
        else if (ct === 'power') { for (let s = 0; s < 8; s++) { if (s === 7 && b % 2) continue; add(t0 + s / 2, 0.45, c[0], s % 2 ? 0.7 : 0.9); add(t0 + s / 2, 0.45, c[0] + 7, s % 2 ? 0.7 : 0.9); } }
        else if (ct === 'stab') [0, 1.5, 3].forEach((s) => vo.forEach((m) => add(t0 + s, 0.5, m, 0.7)));
        else if (ct === 'comp') [0, 1.5, 2.5].forEach((s, i) => vo.forEach((m) => add(t0 + s + (s % 1 ? sw : 0), i === 0 ? 1.2 : 0.7, m, 0.55)));
        else if (ct === 'strum') for (let s = 0; s < 4; s++) vo.forEach((m, i) => add(t0 + s + i * 0.03, 0.9, m - 12, s % 2 ? 0.55 : 0.75));
        else if (ct === 'arpeggio') for (let s = 0; s < 8; s++) add(t0 + s / 2, 1.2, [c[0], c[1], c[2], c[1] + 12][s % 4] + (s < 4 ? 0 : 0), 0.6);
        continue;
      }
      if (role === 'arp') {
        const step = { sixteenth: 0.25, eighth: 0.5, sparse: 1 }[P.arp] || 0.5; const pool = [c[0] + 12, c[1] + 12, c[2] + 12, c[0] + 24, c[2] + 12, c[1] + 12];
        for (let s = 0, i = 0; s < 4; s += step, i++) { if (P.arp === 'sparse' && rnd() < 0.4) continue; add(t0 + s, step * 0.9, pool[i % pool.length], 0.5 + rnd() * 0.2); }
        continue;
      }
      if (role === 'lead') {
        if (rnd() > P.density + 0.25 && b % 2) continue; const cells = { long: [[0, 2], [2, 2]], mid: [[0, 1], [1, 1], [2, 1], [3, 1]], fast: [[0, .5], [.5, .5], [1, .5], [1.5, .5], [2, .5], [2.5, .5], [3, 1]], sparse: [[0, 3]], swing: [[0, 1], [1.5, .5], [2, 1], [3, 1]] }[P.lead] || [[0, 2], [2, 2]];
        let d = deg(b) + 7 + (rnd() < 0.5 ? 0 : 2); for (const [s, len] of cells) { if (rnd() > P.density + 0.2) continue; const move = [-2, -1, -1, 0, 1, 1, 2][Math.floor(rnd() * 7)]; d = clamp(d + move, deg(b) + 2, deg(b) + 11); const targ = [0, 2, 4][Math.floor(rnd() * 3)]; add(t0 + s + (s % 1 ? sw : 0), len * 0.92, pitch(rnd() < 0.35 ? deg(b) + targ + 7 : d), 0.65 + rnd() * 0.25); }
        continue;
      }
      if (role === 'part') { const m = c[PART[tr.inst] == null ? 0 : PART[tr.inst]], nx = chord(b + 1)[PART[tr.inst] || 0]; if (b % 2 === 0 && P.density < 0.6) add(t0, 4, m, 0.62); else { add(t0, 2, m, 0.6); add(t0 + 2, 2, rnd() < 0.5 ? m : nx, 0.58); } continue; }
      if (role === 'perc') { add(t0, 1.5, root - 12, 0.9); if (P.density > 0.6) add(t0 + 2, 1, root - 12 + 7, 0.7); continue; }
      if (role === 'fx') { if (tr.inst === 'vinyl') add(t0, 4, 60, 0.5); else if (rnd() < 0.5) add(t0 + rnd() * 2, 2, root + 24, 0.4); }
    }
    tr.notes = notes;
  }

  /** compose({ genre, seed, bars, bpm?, key?, mode?, tempo? (0.8–1.2 multiplier) }) → song */
  function compose(o) {
    o = o || {}; const genre = G[o.genre] ? o.genre : 'piano', P = G[genre], seed = (o.seed == null ? Math.floor(Math.random() * 1e9) : o.seed) >>> 0, rnd = rng32(seed);
    const kit = K && K.KITS[genre] || { name: genre, tracks: [], fx: {} };
    const bpm = clamp(Math.round(o.bpm || (P.bpm[0] + rnd() * (P.bpm[1] - P.bpm[0])) * (o.tempo || 1)), 40, 220);
    const mode = SCALES[o.mode] ? o.mode : P.modes[Math.floor(rnd() * P.modes.length)], key = o.key == null ? Math.floor(rnd() * 12) : ((o.key % 12) + 12) % 12;
    const bars = clamp(Math.round(o.bars || 8), 2, 64);
    const song = { genre, seed, bpm, bars, key, mode, name: kit.name, tracks: [], clips: [], fx: JSON.parse(JSON.stringify(kit.fx || {})) };
    for (const [name, inst, vol, pan, ex] of kit.tracks) { const tr = Object.assign({ name, inst, vol, pan, mute: false, solo: false, notes: [] }, ex || {}); fillTrack(song, tr, rnd); song.tracks.push(tr); }
    return song;
  }
  const regenTrack = (song, tr, seed) => fillTrack(song, tr, rng32((seed == null ? Math.floor(Math.random() * 1e9) : seed) >>> 0));

  /* ------------------------------------------------------------------ audio */
  const secPerBeat = (song) => 60 / song.bpm;
  const lengthSec = (song) => song.bars * 4 * secPerBeat(song);
  function impulse(ctx, time, seed) { const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * time)), buf = ctx.createBuffer(2, len, rate), r = rng32(seed || 7); for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / len, 2.6); } return buf; }
  const clipCache = new Map();
  async function decodeClip(ctx, data) { if (clipCache.has(data)) return clipCache.get(data); const bin = atob(data.split(',')[1] || ''), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const b = await ctx.decodeAudioData(u.buffer.slice(0)); clipCache.set(data, b); return b; }

  /** Renders the song (all non-muted tracks + audio clips) to an AudioBuffer. loop:true folds the reverb tail onto the start so the result loops without a click. */
  async function renderSong(song, opts) {
    opts = opts || {}; const rate = opts.sampleRate || 44100, ch = opts.mono ? 1 : 2, len = lengthSec(song), reverb = song.fx && song.fx.reverb && song.fx.reverb.wet > 0 && song.fx.reverb.time > 0 ? song.fx.reverb : null;
    const tail = opts.loop === false ? 0 : Math.min(6, (reverb ? reverb.time : 0) + 1.2), total = Math.ceil((len + tail) * rate);
    const ctx = new OfflineAudioContext(2, total, rate); K.seed(ctx, song.seed || 1);
    const master = ctx.createGain(); master.gain.value = 0.8; let bus = master;
    if (song.fx && song.fx.lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = song.fx.lowpass; master.connect(f); bus = f; }
    const out = ctx.createGain(); bus.connect(out); out.connect(ctx.destination);
    let rv = null; if (reverb) { const conv = ctx.createConvolver(); conv.buffer = impulse(ctx, reverb.time, song.seed); rv = ctx.createGain(); rv.gain.value = reverb.wet; master.connect(rv); rv.connect(conv); conv.connect(out); }
    const anySolo = song.tracks.some((t) => t.solo), spb = secPerBeat(song);
    for (const tr of song.tracks) {
      if (tr.mute || (anySolo && !tr.solo)) continue; const g = ctx.createGain(); g.gain.value = tr.vol == null ? 0.8 : tr.vol; let node = g; if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(tr.pan || 0, -1, 1); g.connect(p); node = p; } node.connect(master);
      const sorted = tr.notes;
      for (let ni = 0; ni < sorted.length; ni++) { const n = sorted[ni]; const t = n.t * spb; if (t >= len) continue; K.play(tr.inst, ctx, g, t, n.d * spb, n.m, n.v, K.INSTRUMENTS[tr.inst] && K.INSTRUMENTS[tr.inst].voice ? { track: tr } : undefined); }
    }
    for (const c of song.clips || []) {
      if (!c.data || c.mute) continue; let b; try { b = await decodeClip(ctx, c.data); } catch { continue; }
      const src = ctx.createBufferSource(); src.buffer = b; const g = ctx.createGain(), start = Math.max(0, c.start || 0), off = clamp(c.offset || 0, 0, b.duration - 0.01), dur = Math.min(c.dur > 0 ? c.dur : b.duration - off, b.duration - off), vol = c.gain == null ? 1 : c.gain;
      g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(vol, start + Math.min(c.fadeIn || 0.005, dur / 2)); g.gain.setValueAtTime(vol, Math.max(start, start + dur - Math.min(c.fadeOut || 0.005, dur / 2))); g.gain.linearRampToValueAtTime(0, start + dur);
      src.connect(g); g.connect(out); src.start(start, off, dur);
    }
    const r = await ctx.startRendering(); const frames = Math.round(len * rate), res = new OfflineAudioContext(ch, frames, rate).createBuffer(ch, frames, rate); let peak = 0;
    for (let c = 0; c < ch; c++) { const d = res.getChannelData(c), a = r.getChannelData(Math.min(c, 1)), b2 = ch === 1 ? r.getChannelData(1) : null; for (let i = 0; i < frames; i++) { let v = ch === 1 ? (a[i] + b2[i]) / 2 : a[i]; const ti = frames + i; if (opts.loop !== false && ti < total) v += ch === 1 ? (r.getChannelData(0)[ti] + r.getChannelData(1)[ti]) / 2 : a[ti]; d[i] = v; const q = Math.abs(v); if (q > peak) peak = q; } }
    if (peak > 0) { const k = 0.89 / peak; for (let c = 0; c < ch; c++) { const d = res.getChannelData(c); for (let i = 0; i < frames; i++) d[i] *= k; } }
    return res;
  }

  /** 16-bit PCM WAV of an AudioBuffer → data: URL (small / standard / high via opts of renderSong) */
  function toWavDataURL(buf) {
    const ch = buf.numberOfChannels, n = buf.length, rate = buf.sampleRate, data = new DataView(new ArrayBuffer(44 + n * ch * 2)); const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, rate, true); data.setUint32(28, rate * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * ch * 2, true);
    const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c)); let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = clamp(chans[c][i], -1, 1); data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
    const bytes = new Uint8Array(data.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return 'data:audio/wav;base64,' + btoa(bin);
  }
  const api = { SCALES, GENRES: Object.keys(G), PROFILES: G, MODES, SCALES, roleOf, compose, regenTrack, renderSong, toWavDataURL, lengthSec, decodeClip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.VXMusicGen = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
