/* Vextra game editor – Music studio workspace (a small DAW): transport with live meter, track strips with mixer, piano roll with ruler,
   piano keys, zoom, drag / resize / box-select, velocity lane, undo / redo, audio-clip timeline with waveforms, recording, vocals from text.
   VX.musicDaw.mount(host, env) → { destroy() }. env comes from music-studio.js (song state, helpers, project assets). */
(function () {
  const { h } = VX;
  const COLORS = ['#6c8cff', '#4ade80', '#f59e0b', '#f472b6', '#22d3ee', '#a78bfa', '#fb7185', '#facc15'];
  const ENS = [[1, 'Solo'], [2, '2 singers'], [3, 'Small choir (3)'], [4, 'Choir (4)'], [6, 'Large choir (6)']];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtTime = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(1).padStart(4, '0'); };

  function mount(host, env) {
    const { S, A, gen, kits, QUALITY, say, audio } = env, NOTE = env.NOTE, nm = env.nm, uid = env.uid;
    const song = () => S.song, curTrack = () => S.song.tracks[Math.min(S.sel, S.song.tracks.length - 1)], spb = () => 60 / song().bpm;
    const D = { Z: 36, snap: 0.5, rev: 1, buf: null, bufRev: 0, rendering: false, play: null, sel: new Set(), clipSel: null, drag: null, hist: [], redo: [], peaks: new Map(), dataById: new Map(), rec: null, hover: null };
    S.pos = S.pos || 0; if (!song().clips) song().clips = []; for (const c of song().clips) D.dataById.set(c.id, c.data);
    const root = h('div', { class: 'daw', tabindex: -1 });
    const css = (v, d) => (getComputedStyle(document.body).getPropertyValue(v) || '').trim() || d;
    const colorOf = (i) => COLORS[i % COLORS.length];
    const isDrum = (t) => kits.INSTRUMENTS[t.inst] && kits.INSTRUMENTS[t.inst].type === 'drum';
    const isVoice = (t) => !!(kits.INSTRUMENTS[t.inst] && kits.INSTRUMENTS[t.inst].voice);

    /* ---------------- history ---------------- */
    const snapshot = () => JSON.stringify({ bpm: song().bpm, bars: song().bars, key: song().key, mode: song().mode, tracks: song().tracks, clips: song().clips.map((c) => Object.assign({}, c, { data: undefined })), sel: S.sel });
    const restore = (str) => { const o = JSON.parse(str), s = song(); Object.assign(s, { bpm: o.bpm, bars: o.bars, key: o.key, mode: o.mode, tracks: o.tracks }); s.clips = o.clips.map((c) => Object.assign(c, { data: D.dataById.get(c.id) })); S.sel = clamp(o.sel || 0, 0, s.tracks.length - 1); D.sel.clear(); D.clipSel = null; D.rev++; rebuildAll(); };
    const commit = () => { const s = snapshot(); if (D.hist[D.hist.length - 1] !== s) { D.hist.push(s); if (D.hist.length > 60) D.hist.shift(); D.redo = []; } D.rev++; sizeNote(); updHist(); };
    const undo = () => { if (D.hist.length < 2) return; D.redo.push(D.hist.pop()); restore(D.hist[D.hist.length - 1]); updHist(); };
    const redo = () => { if (!D.redo.length) return; const s = D.redo.pop(); D.hist.push(s); restore(s); updHist(); };
    D.hist.push(snapshot());

    /* ---------------- transport ---------------- */
    const playBtn = h('button', { class: 'btn primary daw-play', title: 'Play / stop (Space)', onclick: () => toggle() }, '▶ Play');
    const timeEl = h('span', { class: 'daw-time', 'aria-live': 'off' }, '1.1 · 0:00.0'), meter = h('canvas', { class: 'daw-meter', width: 90, height: 10, 'aria-label': 'Output level' });
    const renderEl = h('span', { class: 'daw-render', hidden: true }, h('i', {}), ' Rendering…');
    const undoBtn = h('button', { class: 'btn sm', title: 'Undo (Ctrl+Z)', onclick: undo }, '↶'), redoBtn = h('button', { class: 'btn sm', title: 'Redo (Ctrl+Y)', onclick: redo }, '↷');
    const updHist = () => { undoBtn.disabled = D.hist.length < 2; redoBtn.disabled = !D.redo.length; };
    const num = (label, get, set, min, max, step, w) => h('label', { class: 'daw-f' }, label, h('input', { type: 'number', min, max, step: step || 1, value: get(), style: w ? 'width:' + w + 'px' : '', 'aria-label': label, onchange: (e) => { const v = +e.target.value; if (!isFinite(v) || v < min || v > max) { e.target.value = get(); say(label + ' must be between ' + min + ' and ' + max, true); return; } say(''); set(v); commit(); } }));
    const saved = Object.values(A.music);
    const top = h('div', { class: 'daw-top' },
      h('div', { class: 'daw-grp' }, h('button', { class: 'btn sm', title: 'Back to the start (Home)', onclick: () => { stop(); S.pos = 0; drawAll(); } }, '⏮'), playBtn, h('label', { class: 'chk', title: 'Loop the song' }, h('input', { type: 'checkbox', checked: S.loop, onchange: (e) => { S.loop = e.target.checked; const p = D.play; if (p) { const c = audio(); p.off = (((c.currentTime - p.t0 + p.off) % p.len) + p.len) % p.len; p.t0 = c.currentTime; p.src.loop = S.loop; } } }), ' Loop'), timeEl, meter, renderEl),
      h('div', { class: 'daw-grp' }, num('BPM', () => song().bpm, (v) => { song().bpm = v; drawAll(); }, 40, 220, 1, 62), num('Bars', () => song().bars, (v) => { song().bars = v; rebuildAll(); }, 2, 64, 1, 54),
        h('label', { class: 'daw-f' }, 'Key', h('select', { 'aria-label': 'Key', onchange: (e) => { song().key = +e.target.value; commit(); } }, NOTE.map((n, i) => h('option', { value: i, selected: song().key === i }, n)))),
        h('label', { class: 'daw-f' }, 'Scale', h('select', { 'aria-label': 'Scale', onchange: (e) => { song().mode = e.target.value; commit(); } }, gen.MODES.map((m) => h('option', { value: m, selected: song().mode === m }, m))))),
      h('div', { class: 'daw-grp' }, undoBtn, redoBtn, h('button', { class: 'btn sm', title: 'Zoom out (Ctrl + wheel)', onclick: () => zoom(0.8) }, '−'), h('button', { class: 'btn sm', title: 'Zoom in (Ctrl + wheel)', onclick: () => zoom(1.25) }, '＋')));
    function zoom(k, cx) { const sc = D.scroll, beat = (sc.scrollLeft + (cx == null ? sc.clientWidth / 2 : cx)) / D.Z; D.Z = clamp(D.Z * k, 8, 140); layout(); sc.scrollLeft = beat * D.Z - (cx == null ? sc.clientWidth / 2 : cx); drawAll(); }

    function bufReady() { return D.buf && D.bufRev === D.rev; }
    async function getBuf() {
      if (bufReady()) return D.buf; D.rendering = true; renderEl.hidden = false; playBtn.disabled = true;
      try { const b = await gen.renderSong(song(), { sampleRate: 22050, loop: true }); D.buf = b; D.bufRev = D.rev; return b; } finally { D.rendering = false; renderEl.hidden = true; playBtn.disabled = false; }
    }
    function stop() { const p = D.play; if (!p) { return; } D.play = null; try { p.src.stop(); } catch { /* ended */ } cancelAnimationFrame(p.raf); playBtn.textContent = '▶ Play'; drawAll(); }
    async function toggle() {
      if (D.rendering) return; if (D.play) return stop();
      let buf; try { buf = await getBuf(); } catch (e) { return say('Could not render: ' + (e && e.message || 'unknown error'), true); } say('');
      const c = audio(); if (c.state === 'suspended') await c.resume(); const src = c.createBufferSource(); src.buffer = buf; src.loop = !!S.loop;
      const an = c.createAnalyser(); an.fftSize = 512; src.connect(an); an.connect(c.destination); const off = ((S.pos * spb()) % buf.duration + buf.duration) % buf.duration; src.start(0, off);
      const p = D.play = { src, an, t0: c.currentTime, off, len: buf.duration, data: new Uint8Array(an.fftSize), peak: 0 }; playBtn.textContent = '■ Stop'; src.onended = () => { if (D.play === p) { D.play = null; playBtn.textContent = '▶ Play'; cancelAnimationFrame(p.raf); drawAll(); } };
      const tick = () => { if (D.play !== p) return; let el = c.currentTime - p.t0 + p.off; if (S.loop) el %= p.len; else el = Math.min(el, p.len); D.beat = el / spb(); drawHeads(); drawMeter(p); p.raf = requestAnimationFrame(tick); }; tick();
    }
    function drawMeter(p) { const g = meter.getContext('2d'); p.an.getByteTimeDomainData(p.data); let pk = 0; for (const v of p.data) pk = Math.max(pk, Math.abs(v - 128) / 128); p.peak = Math.max(pk, p.peak * 0.92); g.clearRect(0, 0, 90, 10); g.fillStyle = 'rgba(128,128,128,.25)'; g.fillRect(0, 0, 90, 10); const w = Math.min(1, p.peak * 1.2) * 90; g.fillStyle = p.peak > 0.92 ? '#f87171' : p.peak > 0.7 ? '#facc15' : '#4ade80'; g.fillRect(0, 0, w, 10); }

    /* ---------------- tracks (left) ---------------- */
    const trackBox = h('div', { class: 'daw-tracks', role: 'list' });
    function drawTracks() {
      trackBox.textContent = ''; const ins = kits.INSTRUMENTS, groups = {}; for (const k of Object.values(ins)) (groups[k.group] = groups[k.group] || []).push(k);
      const instSel = (t, onSet) => h('select', { 'aria-label': 'Instrument for ' + t.name, onchange: (e) => onSet(e.target.value) }, Object.entries(groups).map(([g, l]) => h('optgroup', { label: g }, l.map((k) => h('option', { value: k.id, selected: t.inst === k.id }, k.name)))));
      song().tracks.forEach((t, i) => {
        const on = i === S.sel, voice = isVoice(t);
        const strip = h('div', { class: 'daw-tr' + (on ? ' on' : ''), role: 'listitem', style: '--tc:' + colorOf(i), onclick: (e) => { if (!on && !e.target.closest('input,select,button,textarea')) { S.sel = i; D.sel.clear(); drawTracks(); layout(true); drawAll(); } } },
          h('div', { class: 'tr-top' }, h('i', { class: 'tr-dot' }), h('input', { class: 'tr-name', value: t.name, 'aria-label': 'Track name', onfocus: () => { S.sel = i; }, onchange: (e) => { t.name = e.target.value || 'Track'; commit(); } }),
            h('button', { class: 'btn sm' + (t.mute ? ' on' : ''), title: 'Mute', 'aria-pressed': String(!!t.mute), onclick: () => { t.mute = !t.mute; commit(); drawTracks(); } }, 'M'), h('button', { class: 'btn sm' + (t.solo ? ' on' : ''), title: 'Solo', 'aria-pressed': String(!!t.solo), onclick: () => { t.solo = !t.solo; commit(); drawTracks(); } }, 'S'),
            h('button', { class: 'btn sm', title: 'Duplicate track', 'aria-label': 'Duplicate ' + t.name, onclick: () => { const c = JSON.parse(JSON.stringify(t)); c.name += ' copy'; song().tracks.splice(i + 1, 0, c); S.sel = i + 1; commit(); rebuildAll(); } }, '⧉'),
            h('button', { class: 'btn sm', title: 'Remove track', 'aria-label': 'Remove ' + t.name, onclick: () => { song().tracks.splice(i, 1); S.sel = 0; D.sel.clear(); commit(); rebuildAll(); } }, '✕')),
          instSel(t, (v) => { t.inst = v; const k = ins[v]; if (k.type !== 'drum') for (const n of t.notes) { while (n.m < k.lo) n.m += 12; while (n.m > k.hi) n.m -= 12; } if (env.audition) env.audition(v, k.type === 'drum' ? 36 : 60); commit(); rebuildAll(); }),
          h('div', { class: 'tr-mix' }, h('label', {}, 'Vol', h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: t.vol, 'aria-label': 'Volume of ' + t.name, oninput: (e) => { t.vol = +e.target.value; }, onchange: commit })), h('label', {}, 'Pan', h('input', { type: 'range', min: -1, max: 1, step: 0.05, value: t.pan, 'aria-label': 'Pan of ' + t.name, oninput: (e) => { t.pan = +e.target.value; }, ondblclick: (e) => { e.target.value = 0; t.pan = 0; commit(); }, onchange: commit }))));
        if (voice) {
          const ly = h('textarea', { class: 'tr-lyrics', rows: 2, placeholder: 'Type lyrics – each note sings one syllable', 'aria-label': 'Lyrics for ' + t.name, maxlength: 600, onfocus: () => { S.sel = i; }, onchange: (e) => { t.lyrics = e.target.value; commit(); drawAll(); } }); ly.value = t.lyrics || '';
          strip.append(h('div', { class: 'tr-voice' }, h('label', {}, 'Vowel', h('select', { 'aria-label': 'Vowel', onchange: (e) => { t.vowel = e.target.value; commit(); } }, kits.VOWELS.map((v) => h('option', { value: v, selected: (t.vowel || 'a') === v }, v === 'a' ? 'ah' : v === 'e' ? 'eh' : v === 'i' ? 'ee' : v === 'o' ? 'oh' : 'oo')))), h('label', {}, 'Singers', h('select', { 'aria-label': 'Number of singers', onchange: (e) => { t.ens = +e.target.value; commit(); } }, ENS.map(([v, l]) => h('option', { value: v, selected: (t.ens == null ? 3 : t.ens) === v }, l))))), ly,
            h('div', { class: 'tr-voice' }, h('button', { class: 'btn sm', title: 'Write a melody that fits the lyrics (replaces this track’s notes)', onclick: () => { if (!(t.lyrics || '').trim()) return say('Type some lyrics first.', true); melodyFor(t); commit(); rebuildAll(); } }, '🎤 Sing the lyrics'), h('small', {}, (t.lyrics ? kits.syllables(t.lyrics).length : 0) + ' syllables')));
        }
        trackBox.append(strip);
      });
      const add = h('select', { class: 'tr-add', 'aria-label': 'Add an instrument' }, h('option', { value: '' }, '＋ Add instrument…'), Object.entries(groups).map(([g, l]) => h('optgroup', { label: g }, l.map((k) => h('option', { value: k.id }, k.name)))));
      add.onchange = () => { if (!add.value) return; const k = ins[add.value]; const t = { name: k.name, inst: k.id, vol: 0.8, pan: 0, mute: false, solo: false, notes: [] }; if (k.voice) { t.vowel = 'a'; t.ens = 3; } song().tracks.push(t); S.sel = song().tracks.length - 1; if (!k.voice) gen.regenTrack(song(), t); commit(); rebuildAll(); };
      trackBox.append(h('div', { class: 'tr-actions' }, add, h('button', { class: 'btn sm', title: 'Turn a line of text into sung vocals', onclick: () => vocalsDialog() }, '🎤 Vocals from text…'), h('button', { class: 'btn sm', title: 'An AI voice reads your text as natural speech and adds it to the timeline', onclick: () => aiVoiceDialog() }, '🤖 AI voice…')));
    }
    /** a simple, singable melody for the lyrics of a voice track: stepwise motion on the song's scale, inside the voice's range */
    function melodyFor(t) {
      const syl = kits.syllables(t.lyrics || ''), s = song(), sc = gen.SCALES[s.mode] || gen.SCALES.major, ins = kits.INSTRUMENTS[t.inst]; let seed = 7; for (const ch of t.lyrics || '') seed = (seed * 31 + ch.charCodeAt(0)) >>> 0; const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const pitches = []; for (let m = ins.lo; m <= ins.hi; m++) if (sc.includes(((m - s.key) % 12 + 12) % 12)) pitches.push(m); let idx = Math.floor(pitches.length / 2) + Math.floor(r() * 3) - 1, b = 0; const notes = [];
      syl.forEach((sy, i) => { const len = i % 4 === 3 ? 2 : r() < 0.3 ? 0.5 : 1; idx = clamp(idx + [-2, -1, -1, 0, 1, 1, 2][Math.floor(r() * 7)], 2, pitches.length - 3); notes.push({ t: b, d: +(len * 0.92).toFixed(3), m: pitches[idx], v: +(0.7 + r() * 0.2).toFixed(2) }); b += len; if (i % 4 === 3) b += 0.5; });
      t.notes = notes; const need = Math.min(64, Math.max(2, Math.ceil(b / 4))); if (need > s.bars) s.bars = need;
    }
    /** AI voice: natural speech from text (Kokoro, runs in the browser) added as an audio clip */
    async function aiVoiceDialog() {
      const AI = VX.aiVoice; if (!AI) return say('The AI voice is not available.', true);
      const v = await VX.ui.form({ title: 'AI voice – text to speech', intro: 'An AI voice reads your text and puts it on the timeline as an audio clip at the play position. It speaks rather than sings – use it for narration, rap-style lines or backing words, and shift the pitch to match your key. It runs on your device; the first time it downloads a ~90 MB voice model.', fields: [{ key: 'text', label: 'Text (up to ' + AI.MAX + ' characters)', type: 'textarea', value: 'Welcome to the show. Let the music begin.', required: true }, { key: 'voice', label: 'Voice', type: 'select', value: 'af_heart', options: AI.VOICES }, { key: 'speed', label: 'Speed', type: 'select', value: '1', options: [['0.8', 'Slow'], ['1', 'Normal'], ['1.15', 'Quick'], ['1.3', 'Fast']] }, { key: 'pitch', label: 'Pitch', type: 'select', value: '0', options: [['-5', 'Lower (−5)'], ['-2', 'A bit lower (−2)'], ['0', 'Natural'], ['2', 'A bit higher (+2)'], ['5', 'Higher (+5)'], ['7', 'Much higher (+7)']] }], submit: 'Generate voice' });
      if (!v || !String(v.text || '').trim()) return;
      if (!AI.consented() && !AI.ready()) { const ok = await VX.ui.confirm('The AI voice needs a one-time download of about 90 MB (the open-source Kokoro model, from the jsDelivr and Hugging Face servers). It is stored in this browser and then works offline. Nothing you type is sent anywhere – the voice runs on this device. Download it now?', 'Download and generate', { title: 'Download the voice model?' }); if (!ok) return; AI.remember(); }
      try {
        say('Preparing the voice…'); const data = await AI.speak(v.text, { voice: v.voice, speed: +v.speed || 1, pitch: +v.pitch || 0, ctx: audio(), onProgress: (p) => say('Downloading the voice model… ' + p + '%') });
        await addClip('AI voice – ' + String(v.text).trim().slice(0, 24), data); say('Voice added to the timeline at the play position.');
      } catch (e) { say('Could not make the voice: ' + (e && e.message ? e.message : 'unknown error') + (AI.ready() ? '' : ' (the first use needs an internet connection)'), true); }
    }
    async function vocalsDialog() {
      const voices = kits.VOICES; const v = await VX.ui.form({ title: 'Vocals from text', intro: 'Type a line of lyrics. Each syllable is sung on its own note by the voice you choose, and you can change every note afterwards. It is sung, not spoken – think of a choir humming the words.', fields: [{ key: 'text', label: 'Lyrics', type: 'textarea', value: 'Hello world, sing with me tonight', required: true }, { key: 'voice', label: 'Voice', type: 'select', value: 'soprano', options: Object.entries(voices).map(([k, x]) => [k, x.name]) }, { key: 'ens', label: 'Singers', type: 'select', value: '1', options: ENS.map(([k, l]) => [String(k), l]) }, { key: 'vowel', label: 'Vowel used between words', type: 'select', value: 'a', options: [['a', 'ah'], ['o', 'oh'], ['u', 'oo']] }], submit: 'Add vocals' });
      if (!v || !String(v.text || '').trim()) return;
      const t = { name: voices[v.voice].name + ' vocals', inst: 'v_' + v.voice, vol: 0.9, pan: 0, mute: false, solo: false, notes: [], lyrics: String(v.text).slice(0, 600), vowel: v.vowel, ens: +v.ens }; melodyFor(t); song().tracks.push(t); S.sel = song().tracks.length - 1; commit(); rebuildAll();
    }

    /* ---------------- piano roll ---------------- */
    const scroll = h('div', { class: 'daw-scroll', tabindex: 0, role: 'application', 'aria-label': 'Note editor. Click to add a note, drag to move, drag the right edge to change length, Delete removes, arrow keys nudge.' }), sizer = h('div', { class: 'daw-sizer' }), rollCv = h('canvas', { class: 'daw-roll' });
    const rulerCv = h('canvas', { class: 'daw-ruler', title: 'Click to move the play position' }), keysCv = h('canvas', { class: 'daw-keys' }), velCv = h('canvas', { class: 'daw-vel', title: 'Velocity (drag a bar)' }), clipCv = h('canvas', { class: 'daw-cliplane' });
    D.scroll = scroll; scroll.append(rollCv, sizer);
    const geo = () => { const t = curTrack(), ins = kits.INSTRUMENTS[t.inst], drum = ins.type === 'drum'; let rows = []; if (drum) rows = ins.rows.map((r) => r[0]); else for (let m = ins.hi; m >= ins.lo; m--) rows.push(m); return { t, ins, drum, rows, rh: drum ? 26 : 16, beats: song().bars * 4 }; };
    function sizeCv(cv, w, hh) { const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(hh * dpr)); cv.style.width = w + 'px'; cv.style.height = hh + 'px'; const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); return c; }
    let G = geo();
    function layout(recenter) {
      G = geo(); sizer.style.width = G.beats * D.Z + 'px'; sizer.style.height = G.rows.length * G.rh + 'px'; const w = scroll.clientWidth, hh = scroll.clientHeight; if (!w || !hh) return;
      D._w = w; D._h = hh; D.ctx = { roll: sizeCv(rollCv, w, hh), ruler: sizeCv(rulerCv, w, 26), keys: sizeCv(keysCv, 62, hh), vel: sizeCv(velCv, w, 66), clip: sizeCv(clipCv, w, CL_H * 3 + 22) };
      if (recenter) { const t = G.t, mid = t.notes.length ? t.notes.reduce((a, n) => a + n.m, 0) / t.notes.length : (G.ins.lo + G.ins.hi) / 2, ri = G.drum ? 0 : G.rows.indexOf(Math.round(mid)); scroll.scrollTop = Math.max(0, ri * G.rh - hh / 2); }
    }
    const CL_H = 34;
    const xOf = (b) => b * D.Z - scroll.scrollLeft;
    function drawRoll() {
      const c = D.ctx && D.ctx.roll; if (!c) return; const w = D._w, hh = D._h, sl = scroll.scrollLeft, st = scroll.scrollTop, tc = colorOf(S.sel), mu = css('--muted', '#888'), bd = css('--border', '#333'), fg = css('--text', '#ddd');
      c.clearRect(0, 0, w, hh); c.font = '10px system-ui'; c.textBaseline = 'middle';
      const r0 = Math.max(0, Math.floor(st / G.rh)), r1 = Math.min(G.rows.length, Math.ceil((st + hh) / G.rh));
      for (let i = r0; i < r1; i++) { const m = G.rows[i], y = i * G.rh - st, black = !G.drum && [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12), inKey = !G.drum && gen.SCALES[song().mode] && gen.SCALES[song().mode].includes((((m - song().key) % 12) + 12) % 12); c.fillStyle = black ? 'rgba(128,128,128,.13)' : 'rgba(128,128,128,.04)'; c.fillRect(0, y, w, G.rh); if (inKey) { c.fillStyle = 'rgba(108,140,255,.06)'; c.fillRect(0, y, w, G.rh); } c.strokeStyle = bd; c.globalAlpha = ((m % 12) + 12) % 12 === 0 && !G.drum ? 0.8 : 0.3; c.beginPath(); c.moveTo(0, y + G.rh - 0.5); c.lineTo(w, y + G.rh - 0.5); c.stroke(); c.globalAlpha = 1; }
      const b0 = Math.floor(sl / D.Z), b1 = Math.min(G.beats, Math.ceil((sl + w) / D.Z)), sub = D.Z >= 56 ? 4 : D.Z >= 26 ? 2 : 1;
      for (let b = b0; b <= b1; b++) for (let q = 0; q < sub; q++) { const bt = b + q / sub, x = Math.round(bt * D.Z - sl) + 0.5; c.strokeStyle = q ? bd : (b % 4 === 0 ? mu : bd); c.globalAlpha = q ? 0.18 : b % 4 === 0 ? 0.75 : 0.4; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, hh); c.stroke(); }
      c.globalAlpha = 1;
      const ly = G.t.lyrics && isVoice(G.t) ? kits.syllables(G.t.lyrics) : null, sorted = ly ? G.t.notes.map((n, i) => [n, i]).sort((a, b) => a[0].t - b[0].t) : null, order = new Map(); if (sorted) sorted.forEach(([n], k) => order.set(n, k));
      for (const n of G.t.notes) { const ri = G.rows.indexOf(n.m); if (ri < 0) continue; const x = xOf(n.t), wd = G.drum ? Math.max(10, D.Z * 0.4) : Math.max(4, n.d * D.Z - 1), y = ri * G.rh - st; if (x + wd < 0 || x > w || y + G.rh < 0 || y > hh) continue; const on = D.sel.has(n);
        c.globalAlpha = 0.5 + n.v * 0.5; c.fillStyle = tc; c.beginPath(); (c.roundRect ? c.roundRect(x, y + 1.5, wd, G.rh - 3, 3) : c.rect(x, y + 1.5, wd, G.rh - 3)); c.fill(); c.globalAlpha = 1; if (on) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke(); c.lineWidth = 1; }
        if (ly && ly.length && wd > 14) { c.fillStyle = '#fff'; c.fillText(ly[order.get(n) % ly.length].text, x + 3, y + G.rh / 2, wd - 4); } }
      if (D.drag && D.drag.box) { const b = D.drag.box; c.strokeStyle = tc; c.fillStyle = 'rgba(108,140,255,.15)'; c.fillRect(b.x0 - sl, b.y0 - st, b.x1 - b.x0, b.y1 - b.y0); c.strokeRect(b.x0 - sl + 0.5, b.y0 - st + 0.5, b.x1 - b.x0, b.y1 - b.y0); }
      c.fillStyle = fg; c.globalAlpha = 0.0;
    }
    function drawKeys() {
      const c = D.ctx && D.ctx.keys; if (!c) return; const st = scroll.scrollTop, hh = D._h, mu = css('--muted', '#888'), bd = css('--border', '#333'); c.clearRect(0, 0, 62, hh); c.font = '10px system-ui'; c.textBaseline = 'middle';
      const r0 = Math.max(0, Math.floor(st / G.rh)), r1 = Math.min(G.rows.length, Math.ceil((st + hh) / G.rh));
      for (let i = r0; i < r1; i++) { const m = G.rows[i], y = i * G.rh - st, black = !G.drum && [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12); c.fillStyle = G.drum ? 'rgba(128,128,128,.08)' : black ? '#20242f' : '#e8ebf5'; c.fillRect(0, y, black ? 38 : 62, G.rh - 1); if (G.drum) { c.fillStyle = mu; c.fillText(kits.ROW_NAMES[m] || String(m), 4, y + G.rh / 2, 56); } else if (((m % 12) + 12) % 12 === 0) { c.fillStyle = '#334'; c.fillText(nm(m), 38, y + G.rh / 2); } c.strokeStyle = bd; c.globalAlpha = 0.5; c.strokeRect(0.5, y + 0.5, 61, G.rh - 1); c.globalAlpha = 1; }
    }
    function drawRuler() {
      const c = D.ctx && D.ctx.ruler; if (!c) return; const w = D._w, sl = scroll.scrollLeft, mu = css('--muted', '#888'), fg = css('--text', '#ddd'), bg = css('--bg2', '#161a24'); c.fillStyle = bg; c.fillRect(0, 0, w, 26); c.font = '10px system-ui'; c.textBaseline = 'middle';
      const b0 = Math.floor(sl / D.Z), b1 = Math.min(G.beats, Math.ceil((sl + w) / D.Z)); for (let b = b0; b <= b1; b++) { const x = Math.round(b * D.Z - sl) + 0.5, bar = b % 4 === 0; c.strokeStyle = mu; c.globalAlpha = bar ? 0.9 : 0.4; c.beginPath(); c.moveTo(x, bar ? 4 : 16); c.lineTo(x, 26); c.stroke(); c.globalAlpha = 1; if (bar && b < G.beats) { c.fillStyle = fg; c.fillText(String(b / 4 + 1), x + 4, 9); } else if (D.Z >= 30 && b < G.beats) { c.fillStyle = mu; c.fillText(String(b % 4 + 1), x + 3, 18); } }
    }
    function drawVel() {
      const c = D.ctx && D.ctx.vel; if (!c) return; const w = D._w, sl = scroll.scrollLeft, tc = colorOf(S.sel), bd = css('--border', '#333'), mu = css('--muted', '#888'); c.clearRect(0, 0, w, 66); c.strokeStyle = bd; c.globalAlpha = 0.5; for (const f of [0.25, 0.5, 0.75]) { c.beginPath(); c.moveTo(0, 62 - f * 58); c.lineTo(w, 62 - f * 58); c.stroke(); } c.globalAlpha = 1; c.fillStyle = mu; c.font = '9px system-ui'; c.fillText('Velocity', 4, 8);
      for (const n of G.t.notes) { const x = xOf(n.t); if (x < -4 || x > w) continue; const on = D.sel.has(n); c.fillStyle = tc; c.globalAlpha = on ? 1 : 0.65; c.fillRect(x, 62 - n.v * 58, 5, n.v * 58); c.globalAlpha = 1; if (on) { c.strokeStyle = '#fff'; c.strokeRect(x + 0.5, 62 - n.v * 58 + 0.5, 4, n.v * 58); } }
    }
    function drawHeads() { // playhead on all lanes
      const beat = D.play ? D.beat : S.pos; const x = xOf(beat);
      for (const [k, hh] of [['roll', D._h], ['vel', 66], ['clip', CL_H * 3 + 22]]) { const cv = k === 'roll' ? rollCv : k === 'vel' ? velCv : clipCv; let ov = cv._head; if (!ov) { ov = cv._head = h('div', { class: 'daw-head' }); const par = cv === rollCv ? scroll.parentNode : cv.parentNode; par && par.append(ov); } ov.style.display = x >= 0 && x <= D._w ? 'block' : 'none'; ov.style.transform = 'translateX(' + x + 'px)'; ov.style.height = hh + 'px'; }
      const rh = rulerCv._head || (rulerCv._head = h('div', { class: 'daw-head' })); if (!rh.parentNode && rulerCv.parentNode) rulerCv.parentNode.append(rh); rh.style.display = x >= 0 && x <= D._w ? 'block' : 'none'; rh.style.transform = 'translateX(' + x + 'px)'; rh.style.height = '26px';
      if (D.play && S.loop !== undefined) { const sc = scroll; if (x > D._w - 30 || x < 0) sc.scrollLeft = Math.max(0, beat * D.Z - 60); }
      const s = beat * spb(), bar = Math.floor(beat / 4) + 1, bt = Math.floor(beat % 4) + 1; timeEl.textContent = bar + '.' + bt + ' · ' + fmtTime(s);
    }
    function drawAll() { if (!D.ctx) return; drawRoll(); drawKeys(); drawRuler(); drawVel(); drawClips(); drawHeads(); }
    function rebuildAll() { drawTracks(); layout(true); drawAll(); drawClipPanel(); sizeNote(); }

    /* ---- roll interaction ---- */
    const pos = (e) => { const r = rollCv.getBoundingClientRect(); return { x: e.clientX - r.left + scroll.scrollLeft, y: e.clientY - r.top + scroll.scrollTop }; };
    const gridT = (b, round) => (round ? Math.round(b / D.snap) : Math.floor(b / D.snap + 1e-6)) * D.snap;
    const noteAt = (x, y) => { const ri = Math.floor(y / G.rh), m = G.rows[ri]; if (m == null) return null; for (let i = G.t.notes.length - 1; i >= 0; i--) { const n = G.t.notes[i]; if (n.m !== m) continue; const nx = n.t * D.Z, wd = G.drum ? Math.max(10, D.Z * 0.4) : Math.max(4, n.d * D.Z); if (x >= nx && x <= nx + wd) return { n, edge: !G.drum && x > nx + wd - 6 }; } return null; };
    rollCv.addEventListener('contextmenu', (e) => { e.preventDefault(); const p = pos(e), hit = noteAt(p.x, p.y); if (hit) { G.t.notes.splice(G.t.notes.indexOf(hit.n), 1); D.sel.delete(hit.n); commit(); drawAll(); } });
    rollCv.addEventListener('mousemove', (e) => { if (D.drag) return; const p = pos(e), hit = noteAt(p.x, p.y); rollCv.style.cursor = hit ? (hit.edge ? 'ew-resize' : 'grab') : 'crosshair'; });
    rollCv.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; scroll.focus(); const p = pos(e), hit = noteAt(p.x, p.y), t = G.t;
      if (hit) { if (e.shiftKey) { D.sel.has(hit.n) ? D.sel.delete(hit.n) : D.sel.add(hit.n); drawAll(); } else if (!D.sel.has(hit.n)) { D.sel.clear(); D.sel.add(hit.n); } if (!D.sel.has(hit.n)) return; const sel = [...D.sel]; D.drag = { kind: hit.edge ? 'resize' : 'move', p0: p, sel, orig: sel.map((n) => ({ t: n.t, d: n.d, m: n.m })), moved: false }; if (env.audition && !hit.edge) env.audition(t.inst, hit.n.m, hit.n.v); }
      else if (e.ctrlKey || e.metaKey || e.altKey) D.drag = { kind: 'box', p0: p, box: { x0: p.x, y0: p.y, x1: p.x, y1: p.y }, add: e.shiftKey };
      else { const bt = gridT(p.x / D.Z), m = G.rows[Math.floor(p.y / G.rh)]; if (m == null || bt < 0 || bt >= G.beats) return; const n = { t: bt, d: G.drum ? 0.25 : D.snap, m, v: 0.8 }; t.notes.push(n); t.notes.sort((a, b) => a.t - b.t); D.sel.clear(); D.sel.add(n); if (env.audition) env.audition(t.inst, m, 0.8); D.drag = { kind: G.drum ? 'move' : 'resize', p0: { x: bt * D.Z + D.snap * D.Z, y: p.y }, sel: [n], orig: [{ t: n.t, d: n.d, m: n.m }], moved: false, fresh: true }; }
      drawAll(); e.preventDefault();
    });
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    function onMove(e) {
      const d = D.drag; if (!d || d.lane || d.clip || d.vel) return; const p = pos(e);
      if (d.kind === 'box') { d.box.x1 = p.x; d.box.y1 = p.y; const x0 = Math.min(d.box.x0, p.x), x1 = Math.max(d.box.x0, p.x), y0 = Math.min(d.box.y0, p.y), y1 = Math.max(d.box.y0, p.y); if (!d.add) D.sel.clear(); for (const n of G.t.notes) { const ri = G.rows.indexOf(n.m), nx = n.t * D.Z, wd = Math.max(4, n.d * D.Z); if (nx + wd >= x0 && nx <= x1 && (ri + 1) * G.rh >= y0 && ri * G.rh <= y1) D.sel.add(n); } drawRoll(); drawVel(); return; }
      const dx = (p.x - d.p0.x) / D.Z, dy = Math.round((p.y - d.p0.y) / G.rh); d.moved = true;
      d.sel.forEach((n, i) => { const o = d.orig[i]; if (d.kind === 'resize') n.d = Math.max(D.snap * (G.drum ? 1 : 0.5), Math.round((o.d + dx) / D.snap) * D.snap); else { n.t = clamp(Math.round((o.t + dx) / D.snap) * D.snap, 0, G.beats - 0.0625); const ri = G.rows.indexOf(o.m); n.m = G.rows[clamp(ri + dy, 0, G.rows.length - 1)]; } });
      drawRoll(); drawVel();
    }
    function onUp() { const d = D.drag; if (!d) return; D.drag = null; if (d.kind === 'box') { drawAll(); return; } if (d.moved || d.fresh) { G.t.notes.sort((a, b) => a.t - b.t); commit(); } drawAll(); }

    /* ---- ruler + velocity lane ---- */
    rulerCv.addEventListener('mousedown', (e) => { const r = rulerCv.getBoundingClientRect(), b = Math.max(0, Math.round((e.clientX - r.left + scroll.scrollLeft) / D.Z * 4) / 4); const was = !!D.play; S.pos = Math.min(b, G.beats - 0.01); if (was) { stop(); toggle(); } else drawHeads(); });
    velCv.addEventListener('mousedown', (e) => { const r = velCv.getBoundingClientRect(), x = e.clientX - r.left + scroll.scrollLeft; let best = null, bd = 9; for (const n of G.t.notes) { const dd = Math.abs(n.t * D.Z + 2 - x); if (dd < bd) { bd = dd; best = n; } } if (!best) return; if (!D.sel.has(best)) { D.sel.clear(); D.sel.add(best); } const set = (ev) => { const y = ev.clientY - velCv.getBoundingClientRect().top, v = clamp(+((62 - y) / 58).toFixed(2), 0.05, 1), dv = v - best.v; for (const n of D.sel) n.v = clamp(+(n.v + dv).toFixed(2), 0.05, 1); drawVel(); drawRoll(); }; set(e); D.drag = { vel: true }; const up = () => { window.removeEventListener('mousemove', set); window.removeEventListener('mouseup', up); D.drag = null; commit(); }; window.addEventListener('mousemove', set); window.addEventListener('mouseup', up); });
    keysCv.addEventListener('mousedown', (e) => { const r = keysCv.getBoundingClientRect(), i = Math.floor((e.clientY - r.top + scroll.scrollTop) / G.rh), m = G.rows[i]; if (m != null && env.audition) env.audition(G.t.inst, m, 0.8); });
    scroll.addEventListener('scroll', () => { drawAll(); });
    const wheel = (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 0.87, e.clientX - scroll.getBoundingClientRect().left); } else if (e.currentTarget !== scroll && (e.deltaX || e.shiftKey)) { scroll.scrollLeft += e.deltaX || e.deltaY; e.preventDefault(); } };
    for (const el of [scroll, rulerCv, velCv, clipCv]) el.addEventListener('wheel', wheel, { passive: false });

    /* ---- editing helpers ---- */
    const targets = () => (D.sel.size ? [...D.sel] : G.t.notes);
    const tools = h('div', { class: 'daw-tools' }, h('b', { class: 'daw-cur' }, ''),
      h('label', { class: 'daw-f' }, 'Grid', h('select', { 'aria-label': 'Grid size', onchange: (e) => { D.snap = +e.target.value; } }, [[1, '1/4'], [0.5, '1/8'], [0.25, '1/16'], [0.125, '1/32']].map(([v, l]) => h('option', { value: v, selected: D.snap === v }, l)))),
      h('button', { class: 'btn sm', title: 'Snap the selected notes (or all) to the grid', onclick: () => { for (const n of targets()) { n.t = Math.max(0, Math.round(n.t / D.snap) * D.snap); if (!G.drum) n.d = Math.max(D.snap, Math.round(n.d / D.snap) * D.snap); } commit(); drawAll(); } }, 'Quantize'),
      h('button', { class: 'btn sm', title: 'Selected notes (or all) one semitone down', onclick: () => transpose(-1) }, '♭ −1'), h('button', { class: 'btn sm', onclick: () => transpose(1), title: 'One semitone up' }, '♯ +1'), h('button', { class: 'btn sm', onclick: () => transpose(-12), title: 'One octave down' }, '−8ve'), h('button', { class: 'btn sm', onclick: () => transpose(12), title: 'One octave up' }, '+8ve'),
      h('button', { class: 'btn sm', title: 'Make velocities and timing a little less mechanical', onclick: () => { let s = 12345 + G.t.notes.length; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; for (const n of targets()) { n.v = clamp(+(n.v + (r() - 0.5) * 0.2).toFixed(2), 0.1, 1); if (!G.drum) n.t = Math.max(0, +(n.t + (r() - 0.5) * 0.04).toFixed(3)); } commit(); drawAll(); } }, 'Humanize'),
      h('button', { class: 'btn sm', title: 'Compose new notes for this track', onclick: () => { if (isVoice(G.t)) { if ((G.t.lyrics || '').trim()) melodyFor(G.t); else return say('Type lyrics for this voice first, or add notes by hand.', true); } else gen.regenTrack(song(), G.t); D.sel.clear(); commit(); rebuildAll(); } }, '🎲 Re-compose'),
      h('button', { class: 'btn sm', onclick: () => { D.sel = new Set(G.t.notes); drawAll(); }, title: 'Select all (Ctrl+A)' }, 'Select all'), h('button', { class: 'btn sm', onclick: () => deleteSel() , title: 'Delete the selection (Delete)' }, 'Delete'), h('button', { class: 'btn sm', onclick: () => { G.t.notes = []; D.sel.clear(); commit(); drawAll(); } }, 'Clear track'),
      h('span', { class: 'sp' }), h('span', { class: 'daw-hint' }, 'Click: add · Drag: move · Edge: length · Ctrl+drag: select · Right-click: delete'));
    const curLbl = tools.querySelector('.daw-cur');
    function transpose(k) { for (const n of targets()) { const lo = G.drum ? 0 : G.ins.lo, hi = G.drum ? 127 : G.ins.hi; if (!G.drum) n.m = clamp(n.m + k, lo, hi); } commit(); drawAll(); }
    function deleteSel() { if (!D.sel.size) return; G.t.notes = G.t.notes.filter((n) => !D.sel.has(n)); D.sel.clear(); commit(); drawAll(); }
    function onKey(e) {
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return; const k = e.key, ctl = e.ctrlKey || e.metaKey;
      if (k === ' ') { e.preventDefault(); toggle(); } else if (k === 'Home') { S.pos = 0; if (D.play) { stop(); toggle(); } else drawAll(); }
      else if (ctl && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); } else if (ctl && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); }
      else if (ctl && (k === 'a' || k === 'A')) { e.preventDefault(); D.sel = new Set(G.t.notes); drawAll(); }
      else if (ctl && (k === 'd' || k === 'D')) { e.preventDefault(); const src = [...D.sel]; if (!src.length) return; const span = Math.max(...src.map((n) => n.t + n.d)) - Math.min(...src.map((n) => n.t)), add = src.map((n) => Object.assign({}, n, { t: n.t + Math.ceil(span / D.snap) * D.snap })).filter((n) => n.t < G.beats); G.t.notes.push(...add); G.t.notes.sort((a, b) => a.t - b.t); D.sel = new Set(add); commit(); drawAll(); }
      else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); if (D.clipSel && !D.sel.size) removeClip(); else deleteSel(); }
      else if (/^Arrow/.test(k) && D.sel.size) { e.preventDefault(); for (const n of D.sel) { if (k === 'ArrowLeft') n.t = Math.max(0, n.t - D.snap); else if (k === 'ArrowRight') n.t = Math.min(G.beats - 0.0625, n.t + D.snap); else if (!G.drum) n.m = clamp(n.m + (k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1), G.ins.lo, G.ins.hi); else { const i = G.rows.indexOf(n.m); n.m = G.rows[clamp(i + (k === 'ArrowUp' ? -1 : 1), 0, G.rows.length - 1)]; } } commit(); drawAll(); }
    }
    root.addEventListener('keydown', onKey);

    /* ---------------- audio clips ---------------- */
    const clipHost = h('div', { class: 'daw-clips' }), clipPanel = h('div', { class: 'daw-clipbar' });
    const peaksOf = async (c) => { if (D.peaks.has(c.id)) return D.peaks.get(c.id); let res = null; try { const b = await gen.decodeClip(audio(), c.data), d = b.getChannelData(0), per = Math.max(1, Math.floor(b.sampleRate / 200)), n = Math.ceil(d.length / per), pk = new Float32Array(n); for (let i = 0; i < n; i++) { let mx = 0; for (let j = i * per, e = Math.min(d.length, j + per); j < e; j++) mx = Math.max(mx, Math.abs(d[j])); pk[i] = mx; } res = { pk, rate: 200, dur: b.duration }; } catch { res = null; } D.peaks.set(c.id, res); drawClips(); return res; };
    const clipRect = (c) => ({ x: c.start / spb() * D.Z - scroll.scrollLeft, w: Math.max(6, c.dur / spb() * D.Z), y: 20 + (c.lane || 0) * CL_H });
    function drawClips() {
      const c = D.ctx && D.ctx.clip; if (!c) return; const w = D._w, bd = css('--border', '#333'), mu = css('--muted', '#888'), fg = css('--text', '#ddd'); c.clearRect(0, 0, w, CL_H * 3 + 22); c.fillStyle = mu; c.font = '10px system-ui'; c.textBaseline = 'middle'; c.fillText('Audio clips – drag to place, drag the edges to trim', 6, 9);
      for (let l = 0; l < 3; l++) { c.fillStyle = l % 2 ? 'rgba(128,128,128,.05)' : 'rgba(128,128,128,.09)'; c.fillRect(0, 20 + l * CL_H, w, CL_H); }
      const sl = scroll.scrollLeft, b0 = Math.floor(sl / D.Z), b1 = Math.ceil((sl + w) / D.Z); c.strokeStyle = bd; for (let b = b0; b <= b1; b += 4) { const x = Math.round(b * D.Z - sl) + 0.5; c.globalAlpha = 0.5; c.beginPath(); c.moveTo(x, 20); c.lineTo(x, CL_H * 3 + 22); c.stroke(); } c.globalAlpha = 1;
      for (const cl of song().clips) { const r = clipRect(cl), on = D.clipSel === cl.id; if (r.x + r.w < 0 || r.x > w) continue; c.globalAlpha = cl.mute ? 0.35 : 1; c.fillStyle = on ? 'rgba(74,222,128,.35)' : 'rgba(74,222,128,.2)'; c.strokeStyle = on ? '#4ade80' : 'rgba(74,222,128,.6)'; c.beginPath(); c.roundRect ? c.roundRect(r.x, r.y + 2, r.w, CL_H - 4, 4) : c.rect(r.x, r.y + 2, r.w, CL_H - 4); c.fill(); c.stroke();
        const pk = D.peaks.get(cl.id); if (pk) { c.fillStyle = 'rgba(190,255,215,.75)'; const mid = r.y + CL_H / 2, amp = (CL_H - 10) / 2 * Math.min(2, cl.gain == null ? 1 : cl.gain); for (let px = Math.max(0, Math.floor(-r.x)); px < Math.min(r.w, w - r.x); px += 2) { const tt = (cl.offset || 0) + px / r.w * cl.dur, i = Math.floor(tt * pk.rate), v = pk.pk[i] || 0; const hh = Math.max(1, v * amp); c.fillRect(r.x + px, mid - hh, 1.5, hh * 2); } } else if (!D.peaks.has(cl.id)) peaksOf(cl);
        c.fillStyle = fg; c.fillText(cl.name, r.x + 6, r.y + 9, Math.max(0, r.w - 10)); c.globalAlpha = 1; }
    }
    const clipAt = (e) => { const r = clipCv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; for (let i = song().clips.length - 1; i >= 0; i--) { const c = song().clips[i], q = clipRect(c); if (x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + CL_H) return { c, edge: x < q.x + 7 ? 'l' : x > q.x + q.w - 7 ? 'r' : '' }; } return null; };
    clipCv.addEventListener('mousemove', (e) => { if (D.drag) return; const hit = clipAt(e); clipCv.style.cursor = hit ? (hit.edge ? 'ew-resize' : 'grab') : 'default'; });
    clipCv.addEventListener('mousedown', (e) => {
      const hit = clipAt(e); D.clipSel = hit ? hit.c.id : null; D.sel.clear(); drawClipPanel(); drawAll(); if (!hit) return; const c = hit.c, o = { start: c.start, offset: c.offset || 0, dur: c.dur, lane: c.lane || 0 }, x0 = e.clientX, y0 = e.clientY, S0 = spb(); let moved = false;
      const mv = (ev) => { moved = true; const dt = Math.round((ev.clientX - x0) / D.Z / D.snap) * D.snap * S0; const full = (c.full || 600);
        if (hit.edge === 'l') { const d = clamp(dt, -Math.min(o.start, o.offset), o.dur - 0.05); c.start = +(o.start + d).toFixed(3); c.offset = +(o.offset + d).toFixed(3); c.dur = +(o.dur - d).toFixed(3); }
        else if (hit.edge === 'r') c.dur = +clamp(o.dur + dt, 0.05, Math.max(0.05, full - o.offset)).toFixed(3);
        else { c.start = +Math.max(0, o.start + dt).toFixed(3); c.lane = clamp(o.lane + Math.round((ev.clientY - y0) / CL_H), 0, 2); }
        drawClips(); drawClipPanel(true); };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); D.drag = null; if (moved) commit(); drawClipPanel(); }; D.drag = { clip: true }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); e.preventDefault();
    });
    const selClip = () => song().clips.find((c) => c.id === D.clipSel);
    function removeClip() { const c = selClip(); if (!c) return; song().clips.splice(song().clips.indexOf(c), 1); D.clipSel = null; commit(); drawClips(); drawClipPanel(); }
    function drawClipPanel(keep) {
      const c = selClip(); if (keep && c && clipPanel._id === c.id) { for (const [k, i] of Object.entries(clipPanel._in || {})) if (document.activeElement !== i) i.value = c[k]; return; } clipPanel.textContent = ''; clipPanel._id = c && c.id; clipPanel._in = {};
      if (!c) { clipPanel.append(h('span', { class: 'daw-hint' }, song().clips.length ? 'Select a clip to set its volume, fades and more.' : 'No audio clips yet. Import a file or record your voice – then drag it where you want it and trim the edges.')); return; }
      const n = (label, k, min, max, step) => { const i = h('input', { type: 'number', min, max, step, value: c[k], 'aria-label': label + ' of ' + c.name, onchange: (e) => { const v = +e.target.value; if (!isFinite(v) || v < min || v > max) { e.target.value = c[k]; say(label + ' must be between ' + min + ' and ' + max, true); return; } c[k] = v; say(''); commit(); drawClips(); } }); clipPanel._in[k] = i; return h('label', { class: 'daw-f' }, label, i); };
      clipPanel.append(h('input', { class: 'nm', value: c.name, 'aria-label': 'Clip name', onchange: (e) => { c.name = e.target.value || 'Clip'; commit(); drawClips(); } }), n('Volume', 'gain', 0, 2, 0.05), n('Fade in (s)', 'fadeIn', 0, 30, 0.05), n('Fade out (s)', 'fadeOut', 0, 30, 0.05), n('Start (s)', 'start', 0, 3600, 0.05), n('Length (s)', 'dur', 0.05, 3600, 0.05),
        h('button', { class: 'btn sm', title: 'Hear this clip alone', onclick: () => { const a = new Audio(c.data); a.currentTime = c.offset || 0; a.play(); setTimeout(() => a.pause(), (c.dur || 2) * 1000); } }, '▶ Hear'),
        h('button', { class: 'btn sm', title: 'Cut the clip in two at the play position', onclick: () => { const t = S.pos * spb(); if (t <= c.start + 0.05 || t >= c.start + c.dur - 0.05) return say('Move the play position (click the ruler) inside the clip first.', true); const d = +(t - c.start).toFixed(3), b = Object.assign({}, c, { id: uid('clip'), start: +t.toFixed(3), offset: +((c.offset || 0) + d).toFixed(3), dur: +(c.dur - d).toFixed(3), fadeIn: 0.005 }); D.dataById.set(b.id, b.data); c.dur = d; c.fadeOut = 0.005; song().clips.push(b); D.clipSel = b.id; say(''); commit(); drawClips(); drawClipPanel(); } }, '✂ Split'),
        h('button', { class: 'btn sm' + (c.mute ? ' on' : ''), 'aria-pressed': String(!!c.mute), onclick: () => { c.mute = !c.mute; commit(); drawClips(); drawClipPanel(); } }, c.mute ? 'Muted' : 'Mute'), h('button', { class: 'btn sm', onclick: removeClip }, 'Delete clip'));
    }
    const addClip = async (name, data) => { let b; try { b = await gen.decodeClip(audio(), data); } catch { say('That audio file could not be read.', true); return; } const id = uid('clip'); D.dataById.set(id, data); const dur = +b.duration.toFixed(2); song().clips.push({ id, name: String(name).slice(0, 40), data, start: +(S.pos * spb()).toFixed(2), offset: 0, dur, gain: 1, fadeIn: 0.01, fadeOut: 0.05, mute: false, full: dur, lane: Math.min(2, song().clips.length % 3) }); D.clipSel = id; say(''); commit(); drawClips(); drawClipPanel(); };
    const file = h('input', { type: 'file', accept: 'audio/*', multiple: true, style: 'display:none', onchange: async (e) => { for (const f of e.target.files) { if (f.size > 12e6) { say(f.name + ' is over 12 MB – trim it first.', true); continue; } await addClip(f.name.replace(/\.[^.]+$/, ''), await VX.readFileAsDataURL(f)); } e.target.value = ''; } });
    const recBtn = h('button', { class: 'btn sm', 'aria-pressed': 'false', title: 'Record from the microphone at the play position' }, '🎤 Record');
    recBtn.onclick = async () => {
      if (D.rec) { D.rec.stop(); return; }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return say('Recording is not available here. Import an audio file instead.', true);
      let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return say(/Denied|NotAllowed/i.test(String(e && (e.name + e.message))) ? 'The microphone is blocked. Allow it in your system or browser settings, then try again.' : 'No microphone could be opened.', true); }
      const mr = new MediaRecorder(stream), parts = []; D.rec = mr; mr.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); }; recBtn.textContent = '■ Stop recording'; recBtn.setAttribute('aria-pressed', 'true'); recBtn.classList.add('on'); say('Recording… press Stop when you are done.');
      mr.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); D.rec = null; recBtn.textContent = '🎤 Record'; recBtn.setAttribute('aria-pressed', 'false'); recBtn.classList.remove('on'); const blob = new Blob(parts, { type: mr.mimeType || 'audio/webm' }); if (!blob.size) return say('Nothing was recorded.', true); const url = await VX.readFileAsDataURL(blob); try { const b = await audio().decodeAudioData(await blob.arrayBuffer()); await addClip('Voice ' + (song().clips.length + 1), gen.toWavDataURL(b)); } catch { await addClip('Voice ' + (song().clips.length + 1), url); } };
      mr.start();
    };
    const projSnd = Object.values(A.sounds).filter((s) => s.kind === 'sample' && s.data), fromProj = h('select', { 'aria-label': 'Add a sound from this project' }, h('option', { value: '' }, '＋ From project sounds…'), projSnd.map((s) => h('option', { value: s.id }, s.name)));
    fromProj.onchange = () => { const s = A.sounds[fromProj.value]; fromProj.value = ''; if (s) addClip(s.name, s.data); };
    clipHost.append(h('div', { class: 'daw-cliphead' }, h('b', {}, 'Audio'), h('span', { class: 'sp' }), h('button', { class: 'btn sm', onclick: () => file.click() }, '📁 Import audio…'), recBtn, projSnd.length ? fromProj : null, h('button', { class: 'btn sm', title: 'Make the song as long as the clips', onclick: () => { if (!song().clips.length) return; const end = Math.max(...song().clips.map((c) => (c.start || 0) + (c.dur || 0))); song().bars = clamp(Math.ceil(end / spb() / 4), 2, 64); commit(); rebuildAll(); } }, 'Fit length')), file, clipPanel);

    /* ---------------- bottom: save / export ---------------- */
    const sz = h('b', {}, ''); const sizeNote = () => { sz.textContent = env.sizeNote(song()); };
    const download = async () => { try { say('Rendering the WAV file…'); const q = QUALITY[S.quality], b = await gen.renderSong(song(), { sampleRate: q.sampleRate, mono: q.mono, loop: false }); const blob = await (await fetch(gen.toWavDataURL(b))).blob(); const where = await VX.saveFile((S.name || 'song') + '.wav', blob, { label: 'WAV audio' }); say(where ? 'Exported to ' + where : ''); if (!where) say(''); } catch (e) { say('Could not export: ' + (e && e.message || 'error'), true); } };
    const kitSel = h('select', { 'aria-label': 'Genre kit' }, gen.GENRES.map((g) => h('option', { value: g, selected: g === song().genre }, kits.KITS[g].name)));
    const bottom = h('div', { class: 'daw-bottom' },
      h('label', { class: 'daw-f' }, 'Song', h('input', { value: S.name, 'aria-label': 'Song name', oninput: (e) => { S.name = e.target.value; } })),
      h('button', { class: 'btn sm', onclick: () => { env.save(); VX.ui.toast('Song saved in the project', 'success'); } }, '💾 Save'),
      saved.length ? h('select', { 'aria-label': 'Open a saved song', onchange: (e) => { const m = A.music[e.target.value]; if (m) env.load(m); } }, h('option', { value: '' }, 'Open saved…'), saved.map((m) => h('option', { value: m.id }, m.name))) : null,
      h('span', { class: 'daw-sep' }), h('label', { class: 'daw-f' }, 'Kit', kitSel), h('button', { class: 'btn sm', title: 'Replace the tracks with a new tune made from this genre’s instruments. Audio clips are kept.', onclick: async () => { if (song().tracks.some((t) => t.notes.length) && !(await VX.ui.confirm('Replace the tracks with a new tune in this style? Audio clips are kept.', 'Replace'))) return; const nsg = gen.compose({ genre: kitSel.value, bars: song().bars, bpm: song().bpm, key: song().key }); nsg.clips = song().clips; S.song = nsg; S.sel = 0; D.sel.clear(); env.remount(); } }, '✨ New tune from kit'),
      h('span', { class: 'sp' }), h('label', { class: 'daw-f' }, 'Quality', h('select', { 'aria-label': 'Quality', onchange: (e) => { S.quality = e.target.value; sizeNote(); } }, Object.entries(QUALITY).map(([k, q]) => h('option', { value: k, selected: S.quality === k }, q.label)))), h('span', { class: 'daw-hint' }, '≈ '), sz,
      h('button', { class: 'btn sm', title: 'Save the mix as a .wav file', onclick: download }, '⬇ WAV file'), h('button', { class: 'btn primary', onclick: async () => { if (!S.name.trim()) { say('Give the song a name first.', true); return; } try { env.save(); await env.toAsset(song(), S.name); } catch (e) { say('Could not mix down: ' + (e && e.message || 'error'), true); } } }, '⬇ Mix down to Sounds'));

    /* ---------------- assemble ---------------- */
    const rollWrap = h('div', { class: 'daw-rollwrap' }, h('div', { class: 'daw-corner' }), h('div', { class: 'daw-rulerbox' }, rulerCv), h('div', { class: 'daw-keysbox' }, keysCv), h('div', { class: 'daw-scrollbox' }, scroll));
    const lanes = h('div', { class: 'daw-lanes' }, h('div', { class: 'daw-lanelab' }, 'Vel'), h('div', { class: 'daw-lanebox' }, velCv), h('div', { class: 'daw-lanelab' }, 'Audio'), h('div', { class: 'daw-lanebox' }, clipCv));
    root.append(top, h('div', { class: 'daw-main' }, h('div', { class: 'daw-left' }, trackBox), h('div', { class: 'daw-right' }, tools, rollWrap, lanes, clipHost)), bottom);
    host.append(root);
    const ro = new ResizeObserver(() => { layout(); drawAll(); }); ro.observe(scroll);
    const refreshCur = () => { curLbl.textContent = curTrack() ? curTrack().name : ''; curLbl.style.color = colorOf(S.sel); };
    const origDraw = drawAll; drawAll = function () { refreshCur(); origDraw(); };
    drawTracks(); requestAnimationFrame(() => { layout(true); drawAll(); drawClipPanel(); sizeNote(); updHist(); root.focus(); });
    return { destroy() { stop(); try { D.rec && D.rec.stop(); } catch { /* idle */ } ro.disconnect(); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); } };
  }
  VX.musicDaw = { mount };
})();
