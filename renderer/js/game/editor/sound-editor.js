/* Vextra game editor – Sound Studio: synthesizer, presets, step sequencer, sample import. */
(function () {
  const { h } = VX;
  const P = (o) => Object.assign({ wave: 'square', freq: 440, freqEnd: 440, dur: 0.3, attack: 0.005, decay: 0.1, sustain: 0.4, release: 0.1, vol: 0.5, vibrato: 0, vibratoRate: 8 }, o);
  VX.SOUND_PRESETS = {
    coin: P({ wave: 'square', freq: 880, freqEnd: 1320, dur: 0.22, decay: 0.08, sustain: 0.2, release: 0.08, vol: 0.4 }),
    jump: P({ wave: 'square', freq: 260, freqEnd: 620, dur: 0.22, decay: 0.1, sustain: 0.3, vol: 0.4 }),
    hit: P({ wave: 'sawtooth', freq: 220, freqEnd: 60, dur: 0.25, decay: 0.1, sustain: 0.2, vol: 0.5 }),
    explosion: P({ wave: 'noise', freq: 1800, freqEnd: 80, dur: 0.8, attack: 0.002, decay: 0.3, sustain: 0.3, release: 0.4, vol: 0.7 }),
    laser: P({ wave: 'sawtooth', freq: 1400, freqEnd: 180, dur: 0.28, decay: 0.05, sustain: 0.4, vol: 0.4 }),
    powerup: P({ wave: 'triangle', freq: 330, freqEnd: 990, dur: 0.5, decay: 0.2, sustain: 0.5, vibrato: 2, vibratoRate: 14, vol: 0.5 }),
    blip: P({ wave: 'sine', freq: 600, freqEnd: 600, dur: 0.08, decay: 0.03, sustain: 0.3, vol: 0.5 }),
    pickup: P({ wave: 'triangle', freq: 520, freqEnd: 1040, dur: 0.18, vol: 0.5 }),
    engine: P({ wave: 'sawtooth', freq: 70, freqEnd: 90, dur: 0.6, sustain: 0.8, vibrato: 3, vibratoRate: 20, vol: 0.4 }),
  };
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const SCALE_ROWS = 13; // semitone offsets 12..0 (top to bottom)

  class SoundEditor {
    constructor(asset, project, onChange) { this.a = asset; this.project = project; this.onChange = onChange; this.el = h('div', { class: 'snd' }); this.build(); }
    ch() { this.onChange && this.onChange(); }
    build() {
      const a = this.a, el = this.el; el.textContent = '';
      const name = h('input', { value: a.name, oninput: (e) => { a.name = e.target.value; this.ch(); } });
      const head = h('div', { class: 'row' }, h('label', { class: 'mini' }, 'Name'), name, h('span', { class: 'sp' }), h('button', { class: 'btn primary', onclick: () => this.play() }, '▶ Play'), h('button', { class: 'btn', onclick: () => VX.assetAudio.stop() }, '■ Stop'));
      el.append(head);
      if (a.kind === 'sample') {
        const au = h('audio', { controls: true, src: a.data, style: 'width:100%;margin-top:10px' });
        el.append(h('div', { class: 'snd-sample' }, h('p', {}, 'This is an imported audio file (' + Math.round((a.data || '').length / 1370) + ' KB). Sampled sounds can’t be edited here, but you can replace the file or convert to a synth sound.'), au, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { const f = (await VX.pickBrowserFile('audio/*', false))[0]; if (!f) return; a.data = await VX.readFileAsDataURL(f); this.ch(); this.build(); } }, 'Replace file…'), h('button', { class: 'btn', onclick: () => { a.kind = 'synth'; a.params = Object.assign({}, VX.SOUND_PRESETS.coin); delete a.data; this.ch(); this.build(); } }, 'Convert to synth sound'))));
        return;
      }
      const p = a.params = Object.assign(P({}), a.params || {});
      const presets = h('div', { class: 'snd-presets' }, Object.keys(VX.SOUND_PRESETS).map((k) => h('button', { class: 'btn sm', onclick: () => { Object.assign(p, VX.SOUND_PRESETS[k]); this.sliders(); this.viz(); this.ch(); this.play(); } }, k)), h('button', { class: 'btn sm', onclick: () => this.mutate() }, '🎲 Mutate'), h('button', { class: 'btn sm', onclick: () => this.randomize() }, '✨ Random'));
      this.slBox = h('div', { class: 'snd-sliders' }); this.cv = h('canvas', { class: 'snd-viz', width: 520, height: 120 });
      const mode = h('div', { class: 'row' }, h('label', { class: 'mini' }, 'Type'), VX.ui.segmented([['synth', 'Single sound'], ['melody', 'Sequenced tune']], a.kind || 'synth', (v) => { a.kind = v; if (v === 'melody') { a.bpm = a.bpm || 120; a.steps = a.steps || new Array(16).fill(null); a.loop = !!a.loop; } this.ch(); this.build(); }), h('button', { class: 'btn sm', onclick: async () => { const f = (await VX.pickBrowserFile('audio/*', false))[0]; if (!f) return; a.kind = 'sample'; a.data = await VX.readFileAsDataURL(f); delete a.params; this.ch(); this.build(); } }, 'Import file…'));
      el.append(mode, presets, h('div', { class: 'snd-main' }, this.slBox, h('div', {}, this.cv, h('div', { class: 'mini' }, 'Top: pitch sweep • Bottom: volume envelope'))));
      if (a.kind === 'melody') el.append(this.sequencer());
      this.sliders(); this.viz();
    }
    sliders() {
      const p = this.a.params, box = this.slBox; box.textContent = '';
      const sl = (key, label, min, max, step, fmt) => { const out = h('span', { class: 'val' }, (fmt || ((v) => v))(p[key])); const inp = h('input', { type: 'range', min, max, step, value: p[key], oninput: (e) => { p[key] = +e.target.value; out.textContent = (fmt || ((v) => v))(p[key]); this.viz(); this.ch(); }, onchange: () => this.play() }); box.append(h('div', { class: 'slr' }, h('label', {}, label), inp, out)); };
      box.append(h('div', { class: 'slr' }, h('label', {}, 'Wave'), VX.ui.segmented([['square', '▭', 'Square'], ['sawtooth', '◿', 'Saw'], ['triangle', '△', 'Triangle'], ['sine', '∿', 'Sine'], ['noise', '▒', 'Noise']].map(([v, l, t]) => [v, l, t]), p.wave, (v) => { p.wave = v; this.viz(); this.ch(); this.play(); })));
      sl('freq', 'Start Hz', 20, 3000, 1, (v) => v + ' Hz'); sl('freqEnd', 'End Hz', 20, 3000, 1, (v) => v + ' Hz'); sl('dur', 'Length', 0.03, 2, 0.01, (v) => v + ' s'); sl('attack', 'Attack', 0, 0.5, 0.005); sl('decay', 'Decay', 0, 1, 0.01); sl('sustain', 'Sustain', 0, 1, 0.01); sl('release', 'Release', 0, 1, 0.01); sl('vol', 'Volume', 0, 1, 0.01); sl('vibrato', 'Vibrato', 0, 10, 0.1); sl('vibratoRate', 'Vib. speed', 1, 40, 0.5);
    }
    viz() {
      const p = this.a.params, c = this.cv, x = c.getContext('2d'), W = c.width, H = c.height; x.clearRect(0, 0, W, H); x.fillStyle = '#10131a'; x.fillRect(0, 0, W, H);
      const lg = (f) => Math.log(Math.max(20, f)); const lo = Math.log(20), hi = Math.log(3000);
      x.strokeStyle = '#6c8cff'; x.lineWidth = 2; x.beginPath(); for (let i = 0; i <= 100; i++) { const t = i / 100, f = Math.exp(lg(p.freq) + (lg(p.freqEnd) - lg(p.freq)) * t); const px = t * W, py = (H / 2 - 6) - ((lg(f) - lo) / (hi - lo)) * (H / 2 - 12); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
      const a = p.attack / p.dur, d = p.decay / p.dur, r = p.release / p.dur; x.strokeStyle = '#4ade80'; x.beginPath(); x.moveTo(0, H - 4); x.lineTo(W * Math.min(1, a), H / 2 + 8); x.lineTo(W * Math.min(1, a + d), H / 2 + 8 + (1 - p.sustain) * (H / 2 - 16) * 1); x.lineTo(W * Math.max(a + d, 1 - r), H / 2 + 8 + (1 - p.sustain) * (H / 2 - 16)); x.lineTo(W, H - 4); x.stroke();
    }
    play() { VX.assetAudio.stop(); VX.assetAudio.play(this.a); }
    mutate() { const p = this.a.params, m = (v, k) => v * (1 + (Math.random() - 0.5) * k); p.freq = VX.clamp(Math.round(m(p.freq, 0.4)), 20, 3000); p.freqEnd = VX.clamp(Math.round(m(p.freqEnd, 0.4)), 20, 3000); p.dur = VX.clamp(+m(p.dur, 0.3).toFixed(2), 0.05, 2); p.decay = VX.clamp(+m(p.decay + 0.01, 0.4).toFixed(2), 0, 1); this.sliders(); this.viz(); this.ch(); this.play(); }
    randomize() { const r = (a, b) => a + Math.random() * (b - a), p = this.a.params; Object.assign(p, P({ wave: ['square', 'sawtooth', 'triangle', 'sine', 'noise'][Math.floor(r(0, 5))], freq: Math.round(r(100, 1500)), freqEnd: Math.round(r(60, 1800)), dur: +r(0.1, 0.6).toFixed(2), decay: +r(0.02, 0.3).toFixed(2), sustain: +r(0.1, 0.7).toFixed(2), release: +r(0.02, 0.2).toFixed(2), vol: 0.5, vibrato: Math.random() < 0.3 ? +r(0, 5).toFixed(1) : 0 })); this.sliders(); this.viz(); this.ch(); this.play(); }
    sequencer() {
      const a = this.a, wrap = h('div', { class: 'seq' }); const steps = a.steps;
      const bpm = h('input', { type: 'number', min: 40, max: 300, value: a.bpm, style: 'width:70px', oninput: (e) => { a.bpm = +e.target.value || 120; this.ch(); } });
      const loop = h('input', { type: 'checkbox', checked: !!a.loop, onchange: (e) => { a.loop = e.target.checked; this.ch(); } });
      const len = h('select', { onchange: (e) => { const n = +e.target.value; while (steps.length < n) steps.push(null); steps.length = n; this.ch(); this.build(); } }, [8, 16, 32, 64].map((n) => h('option', { value: n, selected: steps.length === n }, n + ' steps')));
      wrap.append(h('div', { class: 'row' }, h('b', {}, 'Step sequencer'), h('label', { class: 'mini' }, 'BPM'), bpm, len, h('label', { class: 'mini' }, loop, ' Loop'), h('button', { class: 'btn sm', onclick: () => { a.steps = steps.map(() => null); this.ch(); this.build(); } }, 'Clear')), h('div', { class: 'mini' }, 'Click a cell to place a note (the sound above is the instrument). Rows are semitones above the base pitch.'));
      const grid = h('div', { class: 'seq-grid', style: `grid-template-columns:34px repeat(${steps.length},1fr)` });
      for (let r = 0; r < SCALE_ROWS; r++) { const semi = 12 - r; grid.append(h('div', { class: 'seq-lab' }, NOTES[((semi % 12) + 12) % 12] + (semi === 12 ? '+' : ''))); for (let i = 0; i < steps.length; i++) { const cell = h('div', { class: 'seq-cell' + (steps[i] === semi ? ' on' : '') + (i % 4 === 0 ? ' beat' : ''), onclick: () => { steps[i] = steps[i] === semi ? null : semi; this.ch(); grid.querySelectorAll(`[data-c="${i}"]`).forEach((c) => c.classList.remove('on')); if (steps[i] === semi) cell.classList.add('on'); VX.assetAudio.engine().synth(a.params, { pitch: Math.pow(2, semi / 12) }); }, 'data-c': i }); grid.append(cell); } }
      wrap.append(grid); return wrap;
    }
    dispose() { VX.assetAudio.stop(); }
  }
  VX.SoundEditor = SoundEditor;
})();
