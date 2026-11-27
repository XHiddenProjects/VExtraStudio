/* Vextra game editor – Music: the genre library (procedural, loopable background music; shown in Assets → Sounds → ✨ Defaults… → Music library)
   and the studio window (music-daw.js). VX.musicStudio.open(ctx, 'studio', { song? }) opens the studio; VX.musicStudio.library(ctx, host) draws the library into `host`. */
(function () {
  const { h } = VX;
  const MG = () => window.VXMusicGen, MK = () => window.VXMusicKits;
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const QUALITY = { small: { label: 'Small – 22 kHz mono', sampleRate: 22050, mono: true }, standard: { label: 'Standard – 32 kHz stereo', sampleRate: 32000, mono: false }, high: { label: 'High – 44.1 kHz stereo', sampleRate: 44100, mono: false } };
  const GENRE_INFO = { orchestral: ['🎻', 'Strings, brass, woodwinds, harp and timpani'], rock: ['🎸', 'Driving guitars, bass and a full drum kit'], synthwave: ['🌆', 'Retro synths, arpeggios and gated drums'], electronic: ['🎛', 'Synth stabs, sub bass and a drum machine'], chiptune: ['👾', '8-bit pulse waves, triangle bass, noise drums'], ambient: ['🌌', 'Slow pads, drones and glassy bells'], jazz: ['🎷', 'Piano, walking bass, sax and brushes'], lofi: ['☕', 'Dusty keys, mellow drums and vinyl'], folk: ['🪕', 'Acoustic guitar, fiddle and tin whistle'], horror: ['🕯', 'Drones, whispers and a slow heartbeat'], epic: ['🏔', 'Cinematic strings, choir, brass and taiko'], piano: ['🎹', 'Solo piano with soft strings'], choral: ['🎼', 'Soprano, mezzo, alto, countertenor, tenor, baritone and bass voices'] };
  const nm = (m) => NOTE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 8);
  const fmtSize = (b) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB');
  let ac = null; const audio = () => ac || (ac = new (window.AudioContext || window.webkitAudioContext)());
  const audition = (inst, m, v) => { try { const c = audio(); if (c.state === 'suspended') c.resume(); const k = MK(); k.seed(c, 1); const g = c.createGain(); g.gain.value = 0.8; g.connect(c.destination); const i = k.INSTRUMENTS[inst]; k.play(inst, c, g, c.currentTime + 0.02, i && i.voice ? 0.8 : 0.4, m, v || 0.8, i && i.voice ? { track: { ens: 1, vowel: 'a' } } : undefined); } catch { /* no audio */ } };

  /** shared bits: add a song to the project as a Sound, and a status line */
  function helpers(ctx, S, say) {
    const A = ctx.project.assets; A.music = A.music || {}; A.sounds = A.sounds || {};
    return {
      A, async toAsset(song, name) {
        const gen = MG(), q = QUALITY[S.quality]; say('Mixing down…'); const buf = await gen.renderSong(song, { sampleRate: q.sampleRate, mono: q.mono, loop: S.loop }); const data = gen.toWavDataURL(buf);
        if (data.length > 6e6) VX.ui.toast('This track is ' + fmtSize(data.length) + ' – it will make the project file large. Try the Small quality or fewer bars.', 'warn');
        const a = { id: uid('snd'), name: (name || song.name || 'Music').slice(0, 60) + (S.loop ? ' (loop)' : ''), kind: 'sample', data, loop: !!S.loop, music: true }; A.sounds[a.id] = a; ctx.onChange(); ctx.refresh && ctx.refresh(); say(''); VX.ui.toast('“' + a.name + '” added to this project → Assets → Sounds (' + fmtSize(data.length) + ', stored inside the project file)', 'success'); return a;
      },
      sizeNote(song) { const q = QUALITY[S.quality], sec = MG().lengthSec(song); return fmtSize(sec * q.sampleRate * (q.mono ? 1 : 2) * 2 * 1.37); },
    };
  }

  /* ---------------- library (drawn into any element) ---------------- */
  function library(ctx, host) {
    const S = { quality: 'small', loop: true, bars: 8, mood: 1, key: -1, seeds: {}, playing: null }, gen = MG(), kits = MK();
    const status = h('div', { class: 'mus-status', role: 'status', 'aria-live': 'polite' }, ''); const say = (t, bad) => { status.textContent = t || ''; status.className = 'mus-status' + (bad ? ' bad' : ''); };
    const Hh = helpers(ctx, S, say), body = h('div', { class: 'mus' }); host.append(body, status);
    if (!kits || !gen) { body.append(h('p', {}, 'The music engine did not load.')); return { destroy() {} }; }
    function stop() { const p = S.playing; if (!p) return; S.playing = null; try { p.src.stop(); } catch { /* ended */ } if (p.btn) p.btn.textContent = '▶ Preview'; }
    async function play(song, btn, card) {
      stop(); btn.disabled = true; say('Rendering… this can take a few seconds'); let buf; try { buf = await gen.renderSong(song, { sampleRate: 22050, loop: true }); } catch (e) { btn.disabled = false; return say('Could not render: ' + (e && e.message || 'error'), true); } say(''); btn.disabled = false;
      const c = audio(); if (c.state === 'suspended') await c.resume(); const src = c.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(c.destination); const p = S.playing = { src, btn, card }; src.start(); btn.textContent = '■ Stop';
    }
    const sel = (opts, get, set, label) => h('select', { 'aria-label': label, onchange: (e) => set(e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: String(get()) === String(v) }, l)));
    const bar = h('div', { class: 'mus-opts' },
      h('label', {}, 'Length ', sel([[4, '4 bars'], [8, '8 bars'], [16, '16 bars'], [32, '32 bars']], () => S.bars, (v) => { S.bars = +v; }, 'Length')), h('label', {}, 'Mood ', sel([[0.85, 'Calm'], [1, 'Normal'], [1.2, 'Energetic']], () => S.mood, (v) => { S.mood = +v; }, 'Mood')),
      h('label', {}, 'Key ', sel([[-1, 'Surprise me']].concat(NOTE.map((n, i) => [i, n])), () => S.key, (v) => { S.key = +v; }, 'Key')), h('label', {}, 'Quality ', sel(Object.entries(QUALITY).map(([k, q]) => [k, q.label]), () => S.quality, (v) => { S.quality = v; }, 'Quality')),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.loop, onchange: (e) => { S.loop = e.target.checked; } }), ' Seamless loop'));
    const grid = h('div', { class: 'mus-grid' });
    for (const g of gen.GENRES) {
      if (S.seeds[g] == null) S.seeds[g] = Math.floor(Math.random() * 1e9);
      const song = () => gen.compose({ genre: g, seed: S.seeds[g], bars: S.bars, tempo: S.mood, key: S.key < 0 ? undefined : S.key }), info = GENRE_INFO[g] || ['🎵', ''], P = gen.PROFILES[g], seedLab = h('span', { class: 'mus-seed' }, 'Variation ' + (S.seeds[g] % 1000));
      const pv = h('button', { class: 'btn sm primary', 'aria-label': 'Preview ' + kits.KITS[g].name }, '▶ Preview'); pv.onclick = () => { if (S.playing && S.playing.btn === pv) return stop(); play(song(), pv); };
      grid.append(h('div', { class: 'mus-card' }, h('div', { class: 'mus-ic', 'aria-hidden': 'true' }, info[0]), h('b', {}, kits.KITS[g].name), h('p', {}, info[1]), h('small', {}, P.bpm[0] + '–' + P.bpm[1] + ' BPM · ' + P.modes.join(' / ') + ' · ' + kits.KITS[g].tracks.length + ' instruments'),
        h('div', { class: 'mus-row' }, seedLab, h('button', { class: 'btn sm', title: 'A different tune in this style', 'aria-label': 'New variation of ' + kits.KITS[g].name, onclick: () => { S.seeds[g] = Math.floor(Math.random() * 1e9); seedLab.textContent = 'Variation ' + (S.seeds[g] % 1000); if (S.playing && S.playing.btn === pv) stop(); } }, '🎲')),
        h('div', { class: 'mus-row' }, pv, h('button', { class: 'btn sm', onclick: async () => { try { await Hh.toAsset(song(), kits.KITS[g].name + ' ' + (S.seeds[g] % 1000)); } catch (e) { say('Could not add: ' + (e && e.message || 'error'), true); } } }, '＋ Add to project'), h('button', { class: 'btn sm', title: 'Open this tune in the studio to change every note', onclick: () => { stop(); open(ctx, 'studio', { song: song() }); } }, '🎹 Edit'))));
    }
    body.append(h('p', { class: 'mus-lead' }, 'Pick a style, preview it, and add it to your project as a loopable Sound. Every tune is composed on your computer – nothing is downloaded.'), bar, grid);
    return { destroy: stop };
  }

  /* ---------------- studio window ---------------- */
  function open(ctx, tab, opts) {
    if (tab === 'library') { const host = h('div', { class: 'mus-wrap' }); let lib = null; const m = VX.ui.modal({ title: 'Music library', body: host, wide: true, className: 'mus-modal', onClose: () => lib && lib.destroy() }); lib = library(ctx, host); return m; }
    const gen = MG(), kits = MK();
    const S = { song: null, sel: 0, quality: 'small', loop: true, name: '', savedId: '', pos: 0 };
    const status = h('div', { class: 'mus-status', role: 'status', 'aria-live': 'polite' }, ''); const say = (t, bad) => { status.textContent = t || ''; status.className = 'mus-status' + (bad ? ' bad' : ''); };
    const host = h('div', { class: 'mus-wrap studio' }, h('div', { class: 'mus-dawhost' }), status); const dh = host.firstChild; let daw = null;
    const modal = VX.ui.modal({ title: 'Music studio', body: host, wide: true, className: 'mus-modal mus-studio', onClose: () => { daw && daw.destroy(); } });
    if (!kits || !gen) { dh.append(h('p', {}, 'The music engine did not load.')); return modal; }
    if (opts && opts.song) { S.song = opts.song; S.name = opts.song.name || 'My song'; } else { S.song = gen.compose({ genre: 'piano', bars: 8 }); S.name = 'My song'; }
    const Hh = helpers(ctx, S, say);
    const env = { S, A: Hh.A, gen, kits, QUALITY, NOTE, nm, uid, say, audio, audition, toAsset: Hh.toAsset, sizeNote: Hh.sizeNote,
      save() { const s = S.song; const id = S.savedId || uid('mus'); S.savedId = id; Hh.A.music[id] = { id, name: S.name || s.name, song: JSON.parse(JSON.stringify(s)) }; ctx.onChange(); },
      load(m) { S.song = JSON.parse(JSON.stringify(m.song)); S.name = m.name; S.savedId = m.id; S.sel = 0; S.pos = 0; env.remount(); },
      remount() { daw && daw.destroy(); dh.textContent = ''; daw = VX.musicDaw.mount(dh, env); } };
    env.remount(); return modal;
  }
  VX.musicStudio = { open, library };
})();
