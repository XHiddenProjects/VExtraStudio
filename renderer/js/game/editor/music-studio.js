/* Vextra game editor – Music: a genre library (procedural, loopable background music) and a studio (instrument kits, piano roll / drum grid,
   audio clips from files or the microphone, mix-down to a project sound). Opened from the Assets → Sounds toolbar: VX.musicStudio.open(ctx, 'library'|'studio'). */
(function () {
  const { h } = VX;
  const MG = () => window.VXMusicGen, MK = () => window.VXMusicKits;
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const QUALITY = { small: { label: 'Small – 22 kHz mono', sampleRate: 22050, mono: true }, standard: { label: 'Standard – 32 kHz stereo', sampleRate: 32000, mono: false }, high: { label: 'High – 44.1 kHz stereo', sampleRate: 44100, mono: false } };
  const GENRE_INFO = { orchestral: ['🎻', 'Strings, brass, woodwinds, harp and timpani'], rock: ['🎸', 'Driving guitars, bass and a full drum kit'], synthwave: ['🌆', 'Retro synths, arpeggios and gated drums'], electronic: ['🎛', 'Synth stabs, sub bass and a drum machine'], chiptune: ['👾', '8-bit pulse waves, triangle bass, noise drums'], ambient: ['🌌', 'Slow pads, drones and glassy bells'], jazz: ['🎷', 'Piano, walking bass, sax and brushes'], lofi: ['☕', 'Dusty keys, mellow drums and vinyl'], folk: ['🪕', 'Acoustic guitar, fiddle and tin whistle'], horror: ['🕯', 'Drones, whispers and a slow heartbeat'], epic: ['🏔', 'Cinematic strings, choir, brass and taiko'], piano: ['🎹', 'Solo piano with soft strings'] };
  const nm = (m) => NOTE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 8);
  const fmtSize = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB');
  let ac = null; const audio = () => ac || (ac = new (window.AudioContext || window.webkitAudioContext)());

  function open(ctx, tab) {
    const A = ctx.project.assets; A.music = A.music || {}; A.sounds = A.sounds || {};
    const S = { tab: tab || 'library', song: null, sel: 0, snap: 0.5, quality: 'small', loop: true, bars: 8, mood: 1, key: -1, seeds: {}, playing: null, name: '', savedId: '', cursor: { t: 0, m: 60 } };
    const body = h('div', { class: 'mus' }); const status = h('div', { class: 'mus-status', role: 'status', 'aria-live': 'polite' }, '');
    const say = (t, bad) => { status.textContent = t || ''; status.className = 'mus-status' + (bad ? ' bad' : ''); };
    const modal = VX.ui.modal({ title: 'Music', body: h('div', { class: 'mus-wrap' }, body, status), wide: true, className: 'mus-modal', onClose: () => { stop(); } });
    const kits = MK(), gen = MG(); if (!kits || !gen) { body.append(h('p', {}, 'The music engine did not load.')); return modal; }

    /* ---------------- playback ---------------- */
    function stop() { const p = S.playing; if (!p) return; S.playing = null; try { p.src.stop(); } catch { /* ended */ } cancelAnimationFrame(p.raf); if (p.line) p.line.style.display = 'none'; refreshTransport(); }
    async function play(song, opts) {
      stop(); say('Rendering… this can take a few seconds'); let buf; try { buf = await gen.renderSong(song, { sampleRate: 22050, loop: true }); } catch (e) { return say('Could not render: ' + e.message, true); } say('');
      const c = audio(); if (c.state === 'suspended') await c.resume(); const src = c.createBufferSource(); src.buffer = buf; src.loop = S.loop || (opts && opts.loop); src.connect(c.destination); const p = S.playing = { src, t0: c.currentTime, len: buf.duration, line: opts && opts.line };
      src.onended = () => { if (S.playing === p) stop(); }; src.start();
      const tick = () => { if (S.playing !== p) return; const el = ((c.currentTime - p.t0) % p.len) / p.len; if (p.line) { p.line.style.display = 'block'; p.line.style.left = el * 100 + '%'; } p.raf = requestAnimationFrame(tick); }; tick(); refreshTransport();
    }
    let transportBtns = [];
    function refreshTransport() { for (const b of transportBtns) b.textContent = S.playing ? '■ Stop' : '▶ Play'; }
    const audition = (inst, m, v) => { try { const c = audio(); kits.seed(c, 1); const g = c.createGain(); g.gain.value = 0.8; g.connect(c.destination); kits.play(inst, c, g, c.currentTime + 0.02, 0.4, m, v || 0.8); } catch { /* no audio */ } };

    /* ---------------- adding to the project ---------------- */
    async function toAsset(song, name) {
      const q = QUALITY[S.quality]; say('Mixing down…'); const buf = await gen.renderSong(song, { sampleRate: q.sampleRate, mono: q.mono, loop: S.loop }); const data = gen.toWavDataURL(buf);
      if (data.length > 6e6) VX.ui.toast('This track is ' + fmtSize(data.length) + ' – it will make the project file large. Try the Small quality or fewer bars.', 'warn');
      const a = { id: uid('snd'), name: (name || song.name || 'Music').slice(0, 60) + (S.loop ? ' (loop)' : ''), kind: 'sample', data, loop: !!S.loop, music: true }; A.sounds[a.id] = a; ctx.onChange(); ctx.refresh && ctx.refresh(); say(''); VX.ui.toast('“' + a.name + '” added to Sounds (' + fmtSize(data.length) + ')', 'success'); return a;
    }
    const sizeNote = (song) => { const q = QUALITY[S.quality], sec = gen.lengthSec(song); return fmtSize(sec * q.sampleRate * (q.mono ? 1 : 2) * 2 * 1.37); };

    /* ---------------- library ---------------- */
    function drawLibrary() {
      body.textContent = ''; stop();
      const sel = (opts, get, set) => h('select', { onchange: (e) => set(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: String(get()) === String(v) }, l)));
      const bar = h('div', { class: 'mus-opts' },
        h('label', {}, 'Length ', sel([[4, '4 bars'], [8, '8 bars'], [16, '16 bars'], [32, '32 bars']], () => S.bars, (v) => { S.bars = +v; })),
        h('label', {}, 'Mood ', sel([[0.85, 'Calm'], [1, 'Normal'], [1.2, 'Energetic']], () => S.mood, (v) => { S.mood = +v; })),
        h('label', {}, 'Key ', sel([[-1, 'Surprise me']].concat(NOTE.map((n, i) => [i, n])), () => S.key, (v) => { S.key = +v; })),
        h('label', {}, 'Quality ', sel(Object.entries(QUALITY).map(([k, q]) => [k, q.label]), () => S.quality, (v) => { S.quality = v; })),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.loop, onchange: (e) => { S.loop = e.target.checked; } }), ' Seamless loop'));
      const grid = h('div', { class: 'mus-grid' });
      const mk = (g) => { const song = () => gen.compose({ genre: g, seed: S.seeds[g], bars: S.bars, tempo: S.mood, key: S.key < 0 ? undefined : S.key }); if (S.seeds[g] == null) S.seeds[g] = Math.floor(Math.random() * 1e9);
        const info = GENRE_INFO[g] || ['🎵', ''], P = gen.PROFILES[g], seedLab = h('span', { class: 'mus-seed' }, 'Variation ' + (S.seeds[g] % 1000));
        const pv = h('button', { class: 'btn sm primary', 'aria-label': 'Preview ' + g }, '▶ Preview');
        pv.onclick = async () => { if (S.playing && S.playing.card === g) return stop(); await play(song(), { loop: true }); if (S.playing) { S.playing.card = g; pv.textContent = '■ Stop'; S.playing.src.addEventListener('ended', () => { pv.textContent = '▶ Preview'; }); } };
        return h('div', { class: 'mus-card' }, h('div', { class: 'mus-ic', 'aria-hidden': 'true' }, info[0]), h('b', {}, MK().KITS[g] ? MK().KITS[g].name : g), h('p', {}, info[1]), h('small', {}, P.bpm[0] + '–' + P.bpm[1] + ' BPM · ' + P.modes.join(' / ') + ' · ' + MK().KITS[g].tracks.length + ' instruments'),
          h('div', { class: 'mus-row' }, seedLab, h('button', { class: 'btn sm', title: 'A different tune in this style', 'aria-label': 'New variation of ' + g, onclick: () => { S.seeds[g] = Math.floor(Math.random() * 1e9); seedLab.textContent = 'Variation ' + (S.seeds[g] % 1000); if (S.playing) { stop(); pv.textContent = '▶ Preview'; } } }, '🎲')),
          h('div', { class: 'mus-row' }, pv, h('button', { class: 'btn sm', onclick: async () => { const s = song(); try { await toAsset(s, MK().KITS[g].name + ' ' + (S.seeds[g] % 1000)); } catch (e) { say('Could not add: ' + e.message, true); } } }, '＋ Add to project'), h('button', { class: 'btn sm', title: 'Open this tune in the studio to change every note', onclick: () => { S.song = song(); S.name = S.song.name; S.savedId = ''; S.sel = 0; S.tab = 'studio'; draw(); } }, '🎹 Edit'))); };
      for (const g of gen.GENRES) grid.append(mk(g));
      body.append(tabs(), h('p', { class: 'mus-lead' }, 'Pick a style, preview it, and add it to your project as a loopable Sound. Every tune is composed on your computer – nothing is downloaded.'), bar, grid);
    }

    /* ---------------- studio ---------------- */
    function tabs() { return h('div', { class: 'mus-tabs', role: 'tablist' }, [['library', '🎼 Library'], ['studio', '🎹 Studio']].map(([id, l]) => h('button', { role: 'tab', 'aria-selected': String(S.tab === id), class: 'btn sm' + (S.tab === id ? ' on' : ''), onclick: () => { S.tab = id; draw(); } }, l))); }
    const curTrack = () => S.song.tracks[Math.min(S.sel, S.song.tracks.length - 1)];
    function save() { const s = S.song; if (!s) return; const id = S.savedId || uid('mus'); S.savedId = id; A.music[id] = { id, name: S.name || s.name, song: s }; ctx.onChange(); }
    function drawStudio() {
      body.textContent = ''; transportBtns = [];
      if (!S.song) { S.song = gen.compose({ genre: 'piano', bars: 8 }); S.name = 'My song'; }
      const song = S.song; if (!song.clips) song.clips = [];
      const num = (label, get, set, min, max, step) => h('label', {}, label + ' ', h('input', { type: 'number', min, max, step: step || 1, value: get(), 'aria-label': label, onchange: (e) => { const v = +e.target.value; if (!isFinite(v) || v < min || v > max) { e.target.value = get(); say(label + ' must be between ' + min + ' and ' + max, true); return; } say(''); set(v); } }));
      const playBtn = h('button', { class: 'btn primary', onclick: () => (S.playing ? stop() : play(song, { line: roll.line })) }, '▶ Play'); transportBtns.push(playBtn);
      const kitSel = h('select', { 'aria-label': 'Genre kit' }, gen.GENRES.map((g) => h('option', { value: g, selected: g === song.genre }, MK().KITS[g].name)));
      const saved = Object.values(A.music);
      const head = h('div', { class: 'mus-bar' },
        h('label', {}, 'Name ', h('input', { value: S.name, 'aria-label': 'Song name', oninput: (e) => { S.name = e.target.value; } })), playBtn,
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.loop, onchange: (e) => { S.loop = e.target.checked; } }), ' Loop'),
        num('BPM', () => song.bpm, (v) => { song.bpm = v; }, 40, 220), num('Bars', () => song.bars, (v) => { song.bars = v; drawStudio(); }, 2, 64),
        h('label', {}, 'Key ', h('select', { 'aria-label': 'Key', onchange: (e) => { song.key = +e.target.value; } }, NOTE.map((n, i) => h('option', { value: i, selected: song.key === i }, n)))),
        h('label', {}, 'Scale ', h('select', { 'aria-label': 'Scale', onchange: (e) => { song.mode = e.target.value; } }, gen.MODES.map((m) => h('option', { value: m, selected: song.mode === m }, m)))));
      const kitBar = h('div', { class: 'mus-bar' }, h('b', {}, 'Instrument kit'), kitSel,
        h('button', { class: 'btn sm', title: 'Replace everything with this genre’s instruments and a freshly composed tune', onclick: async () => { if (song.tracks.some((t) => t.notes.length) && !(await VX.ui.confirm('Replace the tracks with a new tune in this style? Audio clips are kept.', 'Replace'))) return; const n = gen.compose({ genre: kitSel.value, bars: song.bars, bpm: song.bpm, key: song.key }); n.clips = song.clips; S.song = n; S.sel = 0; drawStudio(); } }, '✨ New tune from kit'),
        h('button', { class: 'btn sm', title: 'Compose new notes for the selected track only', onclick: () => { gen.regenTrack(song, curTrack()); drawStudio(); } }, '🎲 Re-compose track'),
        h('span', { class: 'sp' }), saved.length ? h('select', { 'aria-label': 'Open a saved song', onchange: (e) => { const m = A.music[e.target.value]; if (m) { S.song = JSON.parse(JSON.stringify(m.song)); S.name = m.name; S.savedId = m.id; S.sel = 0; drawStudio(); } } }, h('option', { value: '' }, 'Open saved…'), saved.map((m) => h('option', { value: m.id }, m.name))) : null,
        h('button', { class: 'btn sm', onclick: () => { save(); VX.ui.toast('Song saved in the project', 'success'); } }, '💾 Save song'));
      /* tracks */
      const list = h('div', { class: 'mus-tracks', role: 'list' });
      song.tracks.forEach((t, i) => {
        const ins = MK().INSTRUMENTS, groups = {}; for (const k of Object.values(ins)) (groups[k.group] = groups[k.group] || []).push(k);
        list.append(h('div', { class: 'mus-tr' + (i === S.sel ? ' on' : ''), role: 'listitem' },
          h('button', { class: 'nm', 'aria-pressed': String(i === S.sel), onclick: () => { S.sel = i; drawStudio(); } }, t.name),
          h('select', { 'aria-label': 'Instrument for ' + t.name, onchange: (e) => { t.inst = e.target.value; const k = ins[t.inst]; for (const n of t.notes) { while (k.type !== 'drum' && n.m < k.lo) n.m += 12; while (k.type !== 'drum' && n.m > k.hi) n.m -= 12; } audition(t.inst, k.type === 'drum' ? 36 : 60); drawStudio(); } }, Object.entries(groups).map(([g, l]) => h('optgroup', { label: g }, l.map((k) => h('option', { value: k.id, selected: t.inst === k.id }, k.name))))),
          h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: t.vol, 'aria-label': 'Volume of ' + t.name, title: 'Volume', oninput: (e) => { t.vol = +e.target.value; } }),
          h('input', { type: 'range', min: -1, max: 1, step: 0.05, value: t.pan, 'aria-label': 'Pan of ' + t.name, title: 'Left / right', oninput: (e) => { t.pan = +e.target.value; } }),
          h('button', { class: 'btn sm' + (t.mute ? ' on' : ''), title: 'Mute', 'aria-pressed': String(!!t.mute), onclick: () => { t.mute = !t.mute; drawStudio(); } }, 'M'), h('button', { class: 'btn sm' + (t.solo ? ' on' : ''), title: 'Solo', 'aria-pressed': String(!!t.solo), onclick: () => { t.solo = !t.solo; drawStudio(); } }, 'S'),
          h('button', { class: 'btn sm', title: 'Remove track', 'aria-label': 'Remove ' + t.name, onclick: () => { song.tracks.splice(i, 1); S.sel = 0; drawStudio(); } }, '✕')));
      });
      const addSel = h('select', { 'aria-label': 'Add an instrument' }, h('option', { value: '' }, '＋ Add instrument…'), (() => { const groups = {}; for (const k of Object.values(MK().INSTRUMENTS)) (groups[k.group] = groups[k.group] || []).push(k); return Object.entries(groups).map(([g, l]) => h('optgroup', { label: g }, l.map((k) => h('option', { value: k.id }, k.name)))); })());
      addSel.onchange = () => { if (!addSel.value) return; const k = MK().INSTRUMENTS[addSel.value]; song.tracks.push({ name: k.name, inst: k.id, vol: 0.8, pan: 0, mute: false, solo: false, notes: [] }); S.sel = song.tracks.length - 1; gen.regenTrack(song, curTrack()); drawStudio(); };
      list.append(addSel);
      /* roll */
      const roll = pianoRoll(); const snapSel = h('label', {}, 'Grid ', h('select', { 'aria-label': 'Grid size', onchange: (e) => { S.snap = +e.target.value; roll.draw(); } }, [[1, '1 beat'], [0.5, '1/8'], [0.25, '1/16']].map(([v, l]) => h('option', { value: v, selected: S.snap === v }, l))));
      const rollHead = h('div', { class: 'mus-bar' }, h('b', {}, curTrack() ? curTrack().name : ''), snapSel, h('button', { class: 'btn sm', onclick: () => { curTrack().notes = []; roll.draw(); } }, 'Clear track'), h('span', { class: 'mus-hint' }, 'Click to add or remove a note. Keyboard: arrow keys move, Enter toggles.'));
      /* clips */
      const clipBox = clips(song);
      /* mix down */
      const foot = h('div', { class: 'mus-bar mus-foot' }, h('label', {}, 'Quality ', h('select', { 'aria-label': 'Quality', onchange: (e) => { S.quality = e.target.value; sz.textContent = sizeNote(song); } }, Object.entries(QUALITY).map(([k, q]) => h('option', { value: k, selected: S.quality === k }, q.label)))), h('span', { class: 'mus-hint' }, 'About '), sz_ = h('b', {}, sizeNote(song)),
        h('span', { class: 'sp' }), h('button', { class: 'btn primary', onclick: async () => { if (!S.name.trim()) { say('Give the song a name first.', true); return; } try { save(); await toAsset(song, S.name); } catch (e) { say('Could not mix down: ' + e.message, true); } } }, '⬇ Mix down to Sounds'));
      const sz = sz_;
      body.append(tabs(), head, kitBar, h('div', { class: 'mus-main' }, list, h('div', { class: 'mus-edit' }, rollHead, roll.el)), clipBox, foot);
      roll.draw();
    }
    let sz_ = null;

    function pianoRoll() {
      const wrap = h('div', { class: 'mus-roll' }), cv = h('canvas', { tabindex: 0, role: 'application', 'aria-label': 'Note editor. Arrow keys move the cursor, Enter adds or removes a note.' }), line = h('div', { class: 'mus-line' }); wrap.append(cv, line);
      const geo = () => { const song = S.song, tr = curTrack(), ins = MK().INSTRUMENTS[tr.inst], drum = ins.type === 'drum'; let lo, hi, rows;
        if (drum) { rows = ins.rows.map((r) => r[0]); } else { lo = ins.lo; hi = ins.hi; if (tr.notes.length) { lo = Math.max(ins.lo, Math.min(...tr.notes.map((n) => n.m)) - 3); hi = Math.min(ins.hi, Math.max(...tr.notes.map((n) => n.m)) + 3); } if (hi - lo < 24) { const mid = tr.notes.length ? Math.round((lo + hi) / 2) : Math.round((ins.lo + ins.hi) / 2); lo = Math.max(ins.lo, mid - 12); hi = Math.min(ins.hi, lo + 24); lo = Math.max(ins.lo, hi - 24); } rows = []; for (let m = hi; m >= lo; m--) rows.push(m); }
        const beats = song.bars * 4, pxB = Math.max(18, Math.min(64, 900 / beats * 1.2)), rh = drum ? 22 : 14, lab = 64; return { drum, ins, rows, beats, pxB, rh, lab, W: lab + beats * pxB, H: rows.length * rh + 18, tr }; };
      const draw = () => {
        const g = geo(), c = cv.getContext('2d'), dpr = window.devicePixelRatio || 1; cv.width = g.W * dpr; cv.height = g.H * dpr; cv.style.width = g.W + 'px'; cv.style.height = g.H + 'px'; c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cs = getComputedStyle(document.body), fg = cs.getPropertyValue('--text') || '#ddd', mu = cs.getPropertyValue('--muted') || '#888', ac2 = cs.getPropertyValue('--accent') || '#6c8cff', bd = cs.getPropertyValue('--border') || '#333';
        c.clearRect(0, 0, g.W, g.H); c.font = '10px system-ui'; c.textBaseline = 'middle';
        g.rows.forEach((m, i) => { const y = 18 + i * g.rh, black = !g.drum && [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12); c.fillStyle = black ? 'rgba(128,128,128,.12)' : 'rgba(128,128,128,.04)'; c.fillRect(g.lab, y, g.W - g.lab, g.rh); c.fillStyle = mu; c.fillText(g.drum ? (MK().ROW_NAMES[m] || m) : (m % 12 === 0 || i === 0 ? nm(m) : ''), 4, y + g.rh / 2); c.strokeStyle = bd; c.beginPath(); c.moveTo(0, y + g.rh + .5); c.lineTo(g.W, y + g.rh + .5); c.globalAlpha = .35; c.stroke(); c.globalAlpha = 1; });
        for (let b = 0; b <= g.beats; b++) { const x = g.lab + b * g.pxB; c.strokeStyle = b % 4 === 0 ? mu : bd; c.globalAlpha = b % 4 === 0 ? .8 : .4; c.beginPath(); c.moveTo(x + .5, 14); c.lineTo(x + .5, g.H); c.stroke(); c.globalAlpha = 1; if (b % 4 === 0 && b < g.beats) { c.fillStyle = fg; c.fillText(String(b / 4 + 1), x + 3, 8); } }
        for (const n of g.tr.notes) { const r = g.rows.indexOf(n.m); if (r < 0) continue; const x = g.lab + n.t * g.pxB, w = Math.max(3, n.d * g.pxB - 1), y = 18 + r * g.rh; c.fillStyle = ac2; c.globalAlpha = 0.55 + n.v * 0.45; c.fillRect(x, y + 1, g.drum ? Math.max(8, g.pxB * 0.45) : w, g.rh - 2); c.globalAlpha = 1; }
        const cr = g.rows.indexOf(S.cursor.m); if (cr >= 0 && document.activeElement === cv) { c.strokeStyle = fg; c.lineWidth = 2; c.strokeRect(g.lab + S.cursor.t * g.pxB, 18 + cr * g.rh, Math.max(6, S.snap * g.pxB), g.rh); c.lineWidth = 1; }
        line.style.height = g.H + 'px'; line.style.marginLeft = g.lab + 'px'; line.style.width = (g.W - g.lab) + 'px';
      };
      const toggle = (t, m) => { const g = geo(), notes = g.tr.notes; const hit = notes.findIndex((n) => n.m === m && t >= n.t - 1e-6 && t < n.t + (g.drum ? S.snap : n.d) - 1e-6); if (hit >= 0) notes.splice(hit, 1); else { notes.push({ t, d: g.drum ? 0.25 : S.snap, m, v: 0.8 }); notes.sort((a, b) => a.t - b.t); audition(g.tr.inst, m); } draw(); };
      cv.addEventListener('mousedown', (e) => { const g = geo(), r = cv.getBoundingClientRect(), x = e.clientX - r.left - g.lab, y = e.clientY - r.top - 18; if (x < 0 || y < 0) return; const row = Math.floor(y / g.rh); if (row >= g.rows.length) return; const t = Math.floor(x / g.pxB / S.snap + 1e-6) * S.snap; if (t >= g.beats) return; S.cursor = { t, m: g.rows[row] }; toggle(t, g.rows[row]); });
      cv.addEventListener('focus', draw); cv.addEventListener('blur', draw);
      cv.addEventListener('keydown', (e) => { const g = geo(), k = e.key; let { t, m } = S.cursor; const ri = Math.max(0, g.rows.indexOf(m)); if (k === 'ArrowRight') t = Math.min(g.beats - S.snap, t + S.snap); else if (k === 'ArrowLeft') t = Math.max(0, t - S.snap); else if (k === 'ArrowUp') m = g.rows[Math.max(0, ri - 1)]; else if (k === 'ArrowDown') m = g.rows[Math.min(g.rows.length - 1, ri + 1)]; else if (k === 'Enter' || k === ' ') { e.preventDefault(); toggle(t, m); return; } else return; e.preventDefault(); S.cursor = { t, m }; draw(); say(g.drum ? (MK().ROW_NAMES[m] || m) + ' at beat ' + (t + 1) : nm(m) + ' at beat ' + (t + 1)); });
      return { el: wrap, draw, line };
    }

    /* ---------------- audio clips: import, record, trim, fade ---------------- */
    function clips(song) {
      const box = h('div', { class: 'mus-clips' }); const rows = h('div', { class: 'mus-clist' });
      const addClip = async (name, data) => { let dur = 0; try { const c = audio(); const b = await gen.decodeClip(c, data); dur = b.duration; } catch { say('That audio file could not be read.', true); return; } song.clips.push({ id: uid('clip'), name: String(name).slice(0, 40), data, start: 0, offset: 0, dur: +dur.toFixed(2), gain: 1, fadeIn: 0.01, fadeOut: 0.05, mute: false, full: +dur.toFixed(2) }); say(''); drawStudio(); };
      const file = h('input', { type: 'file', accept: 'audio/*', style: 'display:none', onchange: async (e) => { for (const f of e.target.files) { if (f.size > 12e6) { say(f.name + ' is over 12 MB – trim it first.', true); continue; } await addClip(f.name.replace(/\.[^.]+$/, ''), await VX.readFileAsDataURL(f)); } e.target.value = ''; } });
      let rec = null; const recBtn = h('button', { class: 'btn sm', 'aria-pressed': 'false' }, '🎤 Record voice');
      recBtn.onclick = async () => {
        if (rec) { rec.stop(); return; }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return say('Recording is not available here. Import an audio file instead.', true);
        let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return say(/Denied|NotAllowed/i.test(e.name + e.message) ? 'The microphone is blocked. Allow it in your system or browser settings, then try again.' : 'No microphone could be opened (' + (e.name || 'error') + ').', true); }
        const mr = new MediaRecorder(stream), parts = []; rec = mr; mr.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); }; recBtn.textContent = '■ Stop recording'; recBtn.setAttribute('aria-pressed', 'true'); recBtn.classList.add('on'); say('Recording… press Stop when you are done.');
        mr.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); rec = null; recBtn.textContent = '🎤 Record voice'; recBtn.setAttribute('aria-pressed', 'false'); recBtn.classList.remove('on'); const blob = new Blob(parts, { type: mr.mimeType || 'audio/webm' }); if (!blob.size) return say('Nothing was recorded.', true); const url = await VX.readFileAsDataURL(blob); const c = audio(); try { const b = await c.decodeAudioData(await blob.arrayBuffer()); await addClip('Voice ' + (song.clips.length + 1), gen.toWavDataURL(b)); } catch { await addClip('Voice ' + (song.clips.length + 1), url); } };
        mr.start();
      };
      const projSnd = Object.values(A.sounds).filter((s) => s.kind === 'sample' && s.data); const fromProj = h('select', { 'aria-label': 'Add a sound from this project' }, h('option', { value: '' }, '＋ From project sounds…'), projSnd.map((s) => h('option', { value: s.id }, s.name)));
      fromProj.onchange = () => { const s = A.sounds[fromProj.value]; if (s) addClip(s.name, s.data); };
      box.append(h('div', { class: 'mus-bar' }, h('b', {}, 'Audio clips'), h('span', { class: 'mus-hint' }, 'Merge recorded voices and audio files into your song'), h('span', { class: 'sp' }), h('button', { class: 'btn sm', onclick: () => file.click() }, '📁 Import audio…'), recBtn, projSnd.length ? fromProj : null,
        song.clips.length ? h('button', { class: 'btn sm', title: 'Make the song as long as the clips', onclick: () => { const end = Math.max(...song.clips.map((c) => (c.start || 0) + (c.dur || 0))), bars = Math.min(64, Math.max(2, Math.ceil(end / (60 / song.bpm) / 4))); song.bars = bars; drawStudio(); } }, 'Fit length') : null), file, rows);
      if (!song.clips.length) rows.append(h('p', { class: 'mus-hint' }, 'No clips yet. Import a file or record your voice, then trim it, set its start time and fades, and mix it down together with the instruments.'));
      song.clips.forEach((c, i) => {
        const n = (label, k, min, max, step) => h('label', {}, label + ' ', h('input', { type: 'number', min, max, step, value: c[k], 'aria-label': label + ' of ' + c.name, onchange: (e) => { const v = +e.target.value; if (!isFinite(v) || v < min || v > max) { e.target.value = c[k]; say(label + ' must be between ' + min + ' and ' + max, true); return; } c[k] = v; say(''); sz_ && (sz_.textContent = sizeNote(song)); } }));
        rows.append(h('div', { class: 'mus-clip' }, h('input', { class: 'nm', value: c.name, 'aria-label': 'Clip name', oninput: (e) => { c.name = e.target.value; } }), n('Start (s)', 'start', 0, 3600, 0.05), n('Skip (s)', 'offset', 0, 3600, 0.05), n('Length (s)', 'dur', 0.05, 3600, 0.05), n('Volume', 'gain', 0, 2, 0.05), n('Fade in', 'fadeIn', 0, 30, 0.05), n('Fade out', 'fadeOut', 0, 30, 0.05),
          h('button', { class: 'btn sm', 'aria-label': 'Play ' + c.name, onclick: () => { const a = new Audio(c.data); a.currentTime = c.offset || 0; a.play(); setTimeout(() => a.pause(), (c.dur || 2) * 1000); } }, '▶'), h('button', { class: 'btn sm' + (c.mute ? ' on' : ''), 'aria-pressed': String(!!c.mute), onclick: () => { c.mute = !c.mute; drawStudio(); } }, 'M'), h('button', { class: 'btn sm', 'aria-label': 'Remove ' + c.name, onclick: () => { song.clips.splice(i, 1); drawStudio(); } }, '✕')));
      });
      return box;
    }

    function draw() { if (S.tab === 'library') drawLibrary(); else drawStudio(); }
    draw(); return modal;
  }
  VX.musicStudio = { open };
})();
