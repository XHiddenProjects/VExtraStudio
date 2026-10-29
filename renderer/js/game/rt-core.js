/* Vextra game runtime – core: utilities, easing, expression evaluator, audio, the Game class.
   This file (and the other rt-*.js files + blocks-*.js) is embedded verbatim into exported games. No editor code in here. */
(function () {
  const VXRT = (window.VXRT = window.VXRT || {});

  /* ------------------------------------------------------------ utilities */
  const U = (VXRT.util = {
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, t) => a + (b - a) * t,
    rand: (a = 0, b = 1) => a + Math.random() * (b - a), randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    deg: (r) => (r * 180) / Math.PI, rad: (d) => (d * Math.PI) / 180,
    num: (v, d = 0) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : d; },
    truthy: (v) => v !== false && v !== 0 && v !== '' && v !== null && v !== undefined && v !== 'false',
    uid: () => Math.random().toString(36).slice(2, 9),
    hex: (c, d = '#ffffff') => (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : d),
    tpl: (s, vars) => String(s ?? '').replace(/\{([\w.]+)\}/g, (m, k) => (k in vars ? vars[k] : m)),
    hsl: (h, s = 80, l = 55) => `hsl(${((h % 360) + 360) % 360},${s}%,${l}%)`,
  });

  /* ------------------------------------------------------------ easing: 10 families x in/out/inOut = 30 curves */
  const BACK = 1.70158, C2 = BACK * 1.525, C4 = (2 * Math.PI) / 3, C5 = (2 * Math.PI) / 4.5;
  const bounceOut = (x) => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };
  const fam = {
    sine: [(x) => 1 - Math.cos((x * Math.PI) / 2), (x) => Math.sin((x * Math.PI) / 2), (x) => -(Math.cos(Math.PI * x) - 1) / 2],
    quad: [(x) => x * x, (x) => 1 - (1 - x) * (1 - x), (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)],
    cubic: [(x) => x ** 3, (x) => 1 - Math.pow(1 - x, 3), (x) => (x < 0.5 ? 4 * x ** 3 : 1 - Math.pow(-2 * x + 2, 3) / 2)],
    quart: [(x) => x ** 4, (x) => 1 - Math.pow(1 - x, 4), (x) => (x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2)],
    quint: [(x) => x ** 5, (x) => 1 - Math.pow(1 - x, 5), (x) => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2)],
    expo: [(x) => (x === 0 ? 0 : Math.pow(2, 10 * x - 10)), (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)), (x) => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2)],
    circ: [(x) => 1 - Math.sqrt(1 - x * x), (x) => Math.sqrt(1 - Math.pow(x - 1, 2)), (x) => (x < 0.5 ? (1 - Math.sqrt(1 - Math.pow(2 * x, 2))) / 2 : (Math.sqrt(1 - Math.pow(-2 * x + 2, 2)) + 1) / 2)],
    back: [(x) => (BACK + 1) * x ** 3 - BACK * x * x, (x) => 1 + (BACK + 1) * Math.pow(x - 1, 3) + BACK * Math.pow(x - 1, 2), (x) => (x < 0.5 ? (Math.pow(2 * x, 2) * ((C2 + 1) * 2 * x - C2)) / 2 : (Math.pow(2 * x - 2, 2) * ((C2 + 1) * (x * 2 - 2) + C2) + 2) / 2)],
    elastic: [(x) => (x === 0 ? 0 : x === 1 ? 1 : -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * C4)), (x) => (x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * C4) + 1), (x) => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * C5)) / 2 : (Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * C5)) / 2 + 1)],
    bounce: [(x) => 1 - bounceOut(1 - x), bounceOut, (x) => (x < 0.5 ? (1 - bounceOut(1 - 2 * x)) / 2 : (1 + bounceOut(2 * x - 1)) / 2)],
  };
  const ease = (VXRT.ease = { curves: {}, names: [] });
  for (const [f, [i, o, io]] of Object.entries(fam)) { ease.curves[f + 'In'] = i; ease.curves[f + 'Out'] = o; ease.curves[f + 'InOut'] = io; ease.names.push(f + 'In', f + 'Out', f + 'InOut'); }
  ease.get = (name) => ease.curves[name] || ((x) => x);

  /* ------------------------------------------------------------ safe arithmetic expression evaluator (no eval) */
  const FN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sqrt: Math.sqrt, pow: Math.pow, min: Math.min, max: Math.max, log: Math.log, log10: Math.log10, exp: Math.exp, sign: Math.sign, trunc: Math.trunc, deg: U.deg, rad: U.rad,
    rand: (a, b) => (b === undefined ? (a === undefined ? Math.random() : Math.random() * a) : U.rand(a, b)), randint: U.randInt, clamp: U.clamp, lerp: U.lerp, mod: (a, b) => ((a % b) + b) % b, hypot: Math.hypot, step: (e, x) => (x < e ? 0 : 1), smoothstep: (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); } };
  const CONST = { PI: Math.PI, E: Math.E, TAU: Math.PI * 2, true: 1, false: 0 };
  function tokenize(s) {
    const t = []; const re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_$][\w$.]*)|(\*\*|<=|>=|==|!=|&&|\|\||[-+*\/%^()<>!?:,]))/gy; let m; let last = 0;
    while (last < s.length && (m = re.exec(s))) { last = re.lastIndex; if (m[1] !== undefined) t.push({ n: parseFloat(m[1]) }); else if (m[2]) t.push({ id: m[2] }); else t.push({ op: m[3] }); }
    if (s.slice(last).trim()) throw new Error('Unexpected character near "' + s.slice(last).trim().slice(0, 8) + '"');
    return t;
  }
  VXRT.compileExpr = function (src) {
    const toks = tokenize(String(src)); let p = 0;
    const peek = () => toks[p], eat = (op) => { const k = toks[p]; if (k && k.op === op) { p++; return true; } return false; };
    const expect = (op) => { if (!eat(op)) throw new Error('Expected "' + op + '"'); };
    function primary() {
      const k = toks[p++]; if (!k) throw new Error('Unexpected end');
      if (k.n !== undefined) return () => k.n;
      if (k.id) {
        if (eat('(')) { const args = []; if (!eat(')')) { do args.push(ternary()); while (eat(',')); expect(')'); } const f = FN[k.id]; if (!f) throw new Error('Unknown function ' + k.id); return (c) => f(...args.map((a) => a(c))); }
        if (k.id in CONST) return () => CONST[k.id];
        return (c) => c.get(k.id);
      }
      if (k.op === '(') { const e = ternary(); expect(')'); return e; }
      if (k.op === '-') { const e = unary(); return (c) => -e(c); }
      if (k.op === '+') return unary();
      if (k.op === '!') { const e = unary(); return (c) => (e(c) ? 0 : 1); }
      throw new Error('Unexpected "' + (k.op || '') + '"');
    }
    function unary() { return primary(); }
    function power() { let l = primary(); while (peek() && (peek().op === '^' || peek().op === '**')) { p++; const r = unaryPow(); const a = l; l = (c) => Math.pow(a(c), r(c)); } return l; }
    function unaryPow() { if (eat('-')) { const e = unaryPow(); return (c) => -e(c); } return power(); }
    function mul() { let l = power(); while (peek() && ['*', '/', '%'].includes(peek().op)) { const o = toks[p++].op; const r = power(), a = l; l = o === '*' ? (c) => a(c) * r(c) : o === '/' ? (c) => a(c) / r(c) : (c) => a(c) % r(c); } return l; }
    function add() { let l = mul(); while (peek() && (peek().op === '+' || peek().op === '-')) { const o = toks[p++].op; const r = mul(), a = l; l = o === '+' ? (c) => a(c) + r(c) : (c) => a(c) - r(c); } return l; }
    function cmp() { let l = add(); while (peek() && ['<', '>', '<=', '>=', '==', '!='].includes(peek().op)) { const o = toks[p++].op; const r = add(), a = l; l = (c) => { const x = a(c), y = r(c); return (o === '<' ? x < y : o === '>' ? x > y : o === '<=' ? x <= y : o === '>=' ? x >= y : o === '==' ? x === y : x !== y) ? 1 : 0; }; } return l; }
    function and() { let l = cmp(); while (eat('&&')) { const r = cmp(), a = l; l = (c) => (a(c) && r(c) ? 1 : 0); } return l; }
    function or() { let l = and(); while (eat('||')) { const r = and(), a = l; l = (c) => (a(c) || r(c) ? 1 : 0); } return l; }
    function ternary() { const cnd = or(); if (eat('?')) { const a = ternary(); expect(':'); const b = ternary(); return (c) => (cnd(c) ? a(c) : b(c)); } return cnd; }
    const root = ternary(); if (p < toks.length) throw new Error('Unexpected "' + (toks[p].op || toks[p].id || toks[p].n) + '"');
    return root;
  };

  /* ------------------------------------------------------------ audio (WebAudio synth + sampled sounds) */
  class AudioEngine {
    constructor(game) { this.game = game; this.ctx = null; this.master = null; this.volume = 1; this.muted = false; this.playing = new Set(); this.buffers = new Map(); }
    ensure() {
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      this.master.gain.value = this.muted ? 0 : this.volume; return this.ctx;
    }
    setVolume(v) { this.volume = U.clamp(v, 0, 1); if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; }
    /** Synth description: {wave,freq,freqEnd,dur,attack,decay,sustain,release,vol,noise,vibrato,vibratoRate} */
    synth(p, opts = {}) {
      const ctx = this.ensure(); if (!ctx) return null; const t0 = ctx.currentTime;
      const dur = Math.max(0.03, U.num(p.dur, 0.3)), vol = U.clamp(U.num(p.vol, 0.5) * U.num(opts.volume, 1), 0, 1.5), pitch = U.num(opts.pitch, 1);
      const g = ctx.createGain(); g.connect(this.master);
      const a = U.num(p.attack, 0.005), d = U.num(p.decay, 0.1), s = U.num(p.sustain, 0.4), r = U.num(p.release, 0.1);
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + a); g.gain.linearRampToValueAtTime(vol * s, t0 + a + d);
      g.gain.setValueAtTime(vol * s, t0 + Math.max(a + d, dur - r)); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      let src;
      if (p.wave === 'noise') {
        const len = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate), dta = buf.getChannelData(0); for (let i = 0; i < len; i++) dta[i] = Math.random() * 2 - 1;
        src = ctx.createBufferSource(); src.buffer = buf; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(U.num(p.freq, 800) * pitch, t0); f.frequency.exponentialRampToValueAtTime(Math.max(40, U.num(p.freqEnd, U.num(p.freq, 800)) * pitch), t0 + dur); src.connect(f); f.connect(g);
      } else {
        src = ctx.createOscillator(); src.type = ['sine', 'square', 'sawtooth', 'triangle'].includes(p.wave) ? p.wave : 'square';
        const f0 = Math.max(20, U.num(p.freq, 440) * pitch), f1 = Math.max(20, U.num(p.freqEnd, U.num(p.freq, 440)) * pitch);
        src.frequency.setValueAtTime(f0, t0); if (f1 !== f0) src.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
        if (U.num(p.vibrato, 0) > 0) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = U.num(p.vibratoRate, 8); lg.gain.value = U.num(p.vibrato) * f0 * 0.02; lfo.connect(lg); lg.connect(src.frequency); lfo.start(t0); lfo.stop(t0 + dur + 0.05); }
        src.connect(g);
      }
      src.start(t0); src.stop(t0 + dur + 0.05); const h = { stop: () => { try { src.stop(); } catch { /* done */ } }, src }; this.playing.add(h); src.onended = () => this.playing.delete(h); return h;
    }
    async sample(asset, opts = {}) {
      const ctx = this.ensure(); if (!ctx) return null;
      let buf = this.buffers.get(asset.id);
      if (!buf) { try { const ab = await (await fetch(asset.data)).arrayBuffer(); buf = await ctx.decodeAudioData(ab); this.buffers.set(asset.id, buf); } catch (e) { this.game.log('warn', 'Could not decode sound ' + asset.name); return null; } }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = !!opts.loop; src.playbackRate.value = U.num(opts.pitch, 1); const g = ctx.createGain(); g.gain.value = U.clamp(U.num(opts.volume, 1), 0, 2);
      src.connect(g); g.connect(this.master); src.start(); const h = { stop: () => { try { src.stop(); } catch { /* done */ } }, src }; this.playing.add(h); src.onended = () => { this.playing.delete(h); opts.onEnd && opts.onEnd(); }; return h;
    }
    play(soundId, opts = {}) {
      const a = this.game.data.assets?.sounds?.[soundId] || Object.values(this.game.data.assets?.sounds || {}).find((s) => s.name === soundId);
      if (!a) { if (soundId) this.game.log('warn', 'Sound not found: ' + soundId); return null; }
      if (a.kind === 'melody') return this.melody(a, opts);
      return a.kind === 'sample' ? this.sample(a, opts) : this.synth(a.params || a, opts);
    }
    /** Step-sequenced tune: {params, bpm, steps:[semitone|null], loop} */
    melody(a, opts = {}) {
      const step = 60 / U.clamp(U.num(a.bpm, 120), 30, 400) / 2 * 1000, steps = a.steps || []; let i = 0, stopped = false, timer = 0;
      const handle = { stop: () => { stopped = true; clearTimeout(timer); } }; this.playing.add(handle);
      const tick = () => { if (stopped) return; const n = steps[i % Math.max(1, steps.length)]; if (n !== null && n !== undefined && n !== '') this.synth(Object.assign({}, a.params, { dur: Math.min(U.num(a.params && a.params.dur, 0.25), step / 1000 * 1.6) }), Object.assign({}, opts, { pitch: Math.pow(2, n / 12) * U.num(opts.pitch, 1) })); i++; if (i >= steps.length && !a.loop && !opts.loop) { this.playing.delete(handle); return; } timer = setTimeout(tick, step); };
      tick(); return handle;
    }
    stopAll() { for (const h of [...this.playing]) h.stop(); this.playing.clear(); }
  }
  VXRT.AudioEngine = AudioEngine;

  /* ------------------------------------------------------------ Game */
  const DEFAULT_OBJ = { x: 0, y: 0, z: 0, rot: 0, rx: 0, ry: 0, rz: 0, w: 50, h: 50, d: 50, alpha: 1, visible: true, enabled: true, flipX: false, flipY: false, order: 0, blend: 'normal', shader: null, color: '#6c8cff', tags: [], behaviors: [], vars: {}, props: {}, physics: { body: 'none', shape: 'box', bounce: 0, friction: 0.1, gravityScale: 1, mass: 1, fixedRotation: false, sensor: false } };

  class Game {
    constructor(data, opts = {}) {
      VXRT.loadCustom && VXRT.loadCustom(data);
      this.data = data; this.opts = opts; this.settings = Object.assign({ width: 960, height: 540, bg: '#10131a', pixelArt: false, title: 'Game', id: 'game' }, data.settings || {});
      this.vars = {}; this.lists = {}; this.objects = []; this.byId = new Map(); this.time = 0; this.dt = 0; this.paused = false; this.running = false; this.frame = 0;
      this.sceneIndex = 0; this.scene = null; this.bus = new Map(); this.sceneCleanups = []; this.updating = new Set(); this.pending = []; this.fps = 60; this.timeScale = 1;
      this.gravity = { x: 0, y: 980, z: -20 }; this.debug = !!opts.debug; this.stats = { objects: 0, nodes: 0 }; this.msgQueue = [];
      this.audio = new AudioEngine(this); this.storagePrefix = 'vx:' + (this.settings.id || 'game') + ':';
      this.guiItems = new Set(); this.sendDepth = 0; this.unlocked = new Set();
    }

    /* ----- logging / host messaging ----- */
    log(level, ...args) {
      const text = args.map((a) => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(' ');
      if (this.opts.onLog) this.opts.onLog(level, text); else (console[level] || console.log)('[game]', text);
      try { if (this.opts.host && window.parent !== window) { const ch = this.opts.channel; if (ch) window.parent.postMessage({ vx: 'log', token: ch.token, level, text }, ch.origin); }; } catch { /* ignore */ }
    }

    /* ----- storage ----- */
    store = {
      get: (k, d) => { try { const v = localStorage.getItem(this.storagePrefix + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
      set: (k, v) => { try { localStorage.setItem(this.storagePrefix + k, JSON.stringify(v)); return true; } catch { return false; } },
      del: (k) => { try { localStorage.removeItem(this.storagePrefix + k); } catch { /* ignore */ } },
    };

    /* ----- event bus ----- */
    on(name, fn) { let s = this.bus.get(name); if (!s) this.bus.set(name, (s = new Set())); s.add(fn); return () => s.delete(fn); }
    emit(name, payload) { const s = this.bus.get(name); if (s) for (const fn of [...s]) { try { fn(payload); } catch (e) { this.log('error', 'Error in listener "' + name + '": ' + e.message); } } }

    /* ----- lifecycle ----- */
    start(container) {
      this.container = container; container.classList.add('vx-root');
      container.style.cssText += ';position:relative;overflow:hidden;background:' + this.settings.bg + ';user-select:none;-webkit-user-select:none;touch-action:none';
      this.stageEl = document.createElement('div'); this.stageEl.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center'; container.append(this.stageEl);
      this.guiEl = document.createElement('div'); this.guiEl.className = 'vx-gui'; this.guiEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:system-ui,sans-serif'; container.append(this.guiEl);
      VXRT.initInput(this); VXRT.initRender(this);
      this.resize(); this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(container);
      this.running = true; this.loadScene(this.opts.startScene ?? this.data.settings?.startScene ?? 0, { first: true });
      this._last = performance.now(); const loop = (t) => { if (!this.running) return; this._raf = requestAnimationFrame(loop); this.tick(t); }; this._raf = requestAnimationFrame(loop);
      this.log('info', 'Game started: ' + this.settings.title);
      return this;
    }
    destroy() {
      this.running = false; cancelAnimationFrame(this._raf); this._ro && this._ro.disconnect(); this.teardownScene(); VXRT.destroyInput && VXRT.destroyInput(this); VXRT.destroyRender && VXRT.destroyRender(this);
      this.audio.stopAll(); if (this.container) { this.container.textContent = ''; } this.running = false;
    }
    resize() { VXRT.resizeRender && VXRT.resizeRender(this); }
    pause(v) { this.paused = v === undefined ? !this.paused : !!v; this.emit('pause', this.paused); }

    /* ----- scenes ----- */
    findSceneIndex(ref) {
      const sc = this.data.scenes; if (typeof ref === 'number') return U.clamp(Math.floor(ref), 0, sc.length - 1);
      if (ref === 'next') return Math.min(sc.length - 1, this.sceneIndex + 1); if (ref === 'previous' || ref === 'prev') return Math.max(0, this.sceneIndex - 1);
      if (/^\d+$/.test(String(ref))) return U.clamp(parseInt(ref, 10) - 1, 0, sc.length - 1);
      const i = sc.findIndex((s) => s.name === ref || s.id === ref); return i < 0 ? this.sceneIndex : i;
    }
    loadScene(ref, opts = {}) {
      const idx = this.findSceneIndex(ref); const sc = this.data.scenes[idx]; if (!sc) { this.log('error', 'No scene to load'); return; }
      this.teardownScene(); this.sceneIndex = idx; this.scene = sc; this.dim = sc.dim || '2d';
      this.sceneVars = {}; this.camera2d = { x: this.settings.width / 2, y: this.settings.height / 2, zoom: 1, shake: 0, follow: null, lerp: 1, offX: 0, offY: 0 };
      if (sc.camera2d) Object.assign(this.camera2d, { x: sc.camera2d.x ?? this.camera2d.x, y: sc.camera2d.y ?? this.camera2d.y, zoom: sc.camera2d.zoom ?? 1 });
      { const cs = sc.camera2d, vw = +cs.viewW || 0, vh = +cs.viewH || 0; if (vw > 0 || vh > 0) this.camera2d.zoom = Math.min(vw > 0 ? this.settings.width / vw : Infinity, vh > 0 ? this.settings.height / vh : Infinity); }
      const g = sc.gravity || {}; this.gravity = { x: g.x ?? 0, y: g.y ?? (this.dim === '2d' ? 980 : 0), z: g.z ?? 0 }; if (this.dim === '3d') this.gravity = { x: g.x ?? 0, y: g.y ?? -25, z: g.z ?? 0 };
      VXRT.setupScene(this, sc);
      const root = this.addObject({ id: '__scene__', name: 'Scene', type: 'empty', behaviors: sc.behaviors || [], visible: false });
      root.isScene = true; this.sceneObj = root;
      for (const def of sc.objects || []) if (!def.prefab) this.addObject(def);
      this.time = 0; this.emit('sceneLoaded', sc);
      this.log('info', `Scene loaded: ${sc.name} (${this.dim.toUpperCase()}) – ${this.objects.length - 1} objects`);
    }
    teardownScene() {
      this.pending.length = 0;
      for (const o of [...this.objects]) this.removeObject(o, true);
      for (const c of this.sceneCleanups.splice(0)) { try { c(); } catch { /* ignore */ } }
      this.objects = []; this.byId.clear(); this.updating.clear(); for (const g of [...this.guiItems]) g.remove(); this.guiItems.clear(); if (this.guiMap) this.guiMap.clear();
      this.bus.forEach((s, k) => { if (k.startsWith('scene:')) s.clear(); });
    }
    restart(full) { if (full) { this.vars = {}; this.lists = {}; } this.loadScene(full ? (this.data.settings?.startScene ?? 0) : this.sceneIndex); }

    /* ----- objects ----- */
    prefabByName(name) { for (const sc of this.data.scenes) for (const o of sc.objects || []) if (o.name === name && (o.prefab || sc === this.scene)) return o; for (const sc of this.data.scenes) for (const o of sc.objects || []) if (o.name === name) return o; return (this.data.prefabs || []).find((p) => p.name === name) || null; }
    addObject(def, over) {
      const o = Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_OBJ)), JSON.parse(JSON.stringify(def)), over || {});
      o.physics = Object.assign({}, DEFAULT_OBJ.physics, def.physics || {}, (over && over.physics) || {});
      o.def = def; o.id = over && over.id ? over.id : (over ? 'o_' + U.uid() : def.id || 'o_' + U.uid()); o.alive = true; o.vx = 0; o.vy = 0; o.vz = 0; o.spin = 0; o.nodes = []; o.cleanups = []; o.children = []; o.parent = null; o.offset = null;
      o.contacts = new Set(); o.anim = { name: null, frame: 0, t: 0, playing: false, loop: true }; o.name = o.name || o.type; o.mass = o.physics.mass || 1; o.shaderState = {}; o.spawnTime = this.time;
      if (o.props && o.props.anim) o.anim.name = o.props.anim, o.anim.playing = true;
      this.objects.push(o); this.byId.set(o.id, o); VXRT.onObjectAdded && VXRT.onObjectAdded(this, o);
      for (const bid of o.behaviors || []) { const b = this.data.behaviors?.[bid]; if (b) VXRT.instantiateBehavior(this, o, b); else this.log('warn', `Behavior ${bid} not found (object ${o.name})`); }
      if (o.script) VXRT.runScript(this, o, o.script);
      return o;
    }
    spawn(templateName, over = {}) {
      const def = typeof templateName === 'string' ? this.prefabByName(templateName) : templateName; if (!def) { this.log('warn', 'Spawn: no object named "' + templateName + '"'); return null; }
      const copy = JSON.parse(JSON.stringify(def)); copy.prefab = false; const o = this.addObject(copy, Object.assign({}, over, { name: over.name || def.name })); o.spawned = true; return o;
    }
    removeObject(o, silent) {
      if (!o || !o.alive) return; o.alive = false;
      for (const c of [...(o.children || [])]) this.removeObject(c, silent);
      for (const n of o.nodes) VXRT.destroyNode(this, n);
      for (const c of o.cleanups.splice(0)) { try { c(); } catch { /* ignore */ } }
      if (!silent) { this.emit('destroyed', o); if (o.onDestroy) { try { o.onDestroy(o); } catch { /* ignore */ } } }
      VXRT.onObjectRemoved && VXRT.onObjectRemoved(this, o);
      this.byId.delete(o.id); const i = this.objects.indexOf(o); if (i >= 0) this.objects.splice(i, 1);
      if (o.parent) o.parent.children = o.parent.children.filter((c) => c !== o);
    }
    find(name) { return this.objects.find((o) => o.name === name && o.alive) || null; }
    findByTag(tag) { return this.objects.filter((o) => o.alive && o.tags && o.tags.includes(tag)); }
    /** Resolve a target spec to a list of objects. Specs: self | other | parent | all | tag:xxx | <object name> | #id */
    targets(spec, self, other) {
      const s = String(spec ?? 'self').trim();
      if (s === '' || s === 'self') return self ? [self] : [];
      if (s === 'other') return other ? [other] : (self && self.lastOther ? [self.lastOther] : []);
      if (s === 'parent') return self && self.parent ? [self.parent] : [];
      if (s === 'all') return this.objects.filter((o) => o.alive && !o.isScene);
      if (s.startsWith('tag:')) return this.findByTag(s.slice(4));
      if (s.startsWith('#')) { const o = this.byId.get(s.slice(1)); return o ? [o] : []; }
      const o = this.find(s); return o ? [o] : [];
    }
    attach(child, parent, keepWorld) { if (child === parent || !parent) return; if (child.parent) child.parent.children = child.parent.children.filter((c) => c !== child); child.parent = parent; parent.children.push(child); child.offset = keepWorld === false ? { x: 0, y: 0, z: 0 } : { x: child.x - parent.x, y: child.y - parent.y, z: child.z - parent.z }; }
    detach(child) { if (child.parent) child.parent.children = child.parent.children.filter((c) => c !== child); child.parent = null; child.offset = null; }

    getProp(o, k) {
      switch (k) {
        case 'speed': return Math.hypot(o.vx, o.vy, this.dim === '3d' ? o.vz : 0);
        case 'angle': return U.deg(Math.atan2(o.vy, o.vx));
        case 'width': return o.w; case 'height': return o.h; case 'depth': return o.d;
        case 'rotation': return this.dim === '3d' ? o.ry : o.rot;
        case 'name': return o.name; case 'id': return o.id; case 'tags': return (o.tags || []).join(',');
        case 'age': return this.time - o.spawnTime;
        case 'screenX': return VXRT.worldToScreen ? VXRT.worldToScreen(this, o).x : o.x;
        case 'screenY': return VXRT.worldToScreen ? VXRT.worldToScreen(this, o).y : o.y;
        default: if (k in o && typeof o[k] !== 'object') return o[k]; if (o.vars && k in o.vars) return o.vars[k]; return undefined;
      }
    }

    /* ----- main loop ----- */
    tick(now) {
      let dt = Math.min(0.05, (now - this._last) / 1000); this._last = now; this.fps = this.fps * 0.95 + (1 / Math.max(dt, 0.0001)) * 0.05;
      this.realDt = dt; if (this.paused) { VXRT.render(this); return; }
      dt *= this.timeScale; this.dt = dt; this.time += dt; this.frame++;
      try {
        VXRT.input_beginFrame(this);
        for (const n of [...this.updating]) { if (n.dead) { this.updating.delete(n); continue; } try { n.def.update(n, dt, this); } catch (e) { this.nodeError(n, e); } }
        VXRT.stepPhysics(this, dt); VXRT.stepObjects(this, dt);
        if (this.pending.length) { const p = this.pending.splice(0); for (const fn of p) { try { fn(); } catch (e) { this.log('error', e.message); } } }
        VXRT.input_endFrame(this);
      } catch (e) { this.log('error', 'Runtime error: ' + (e.stack || e.message)); }
      VXRT.render(this);
      if (this.opts.onFrame) this.opts.onFrame(this);
    }
    later(fn) { this.pending.push(fn); }
    nodeError(n, e) { if (!n.errored) { n.errored = true; this.log('error', `Block "${n.def.label}" failed: ${e.message}`); } }
  }
  /** Register plugin-provided object types / blocks that were embedded into the game data (see editor export). */
  VXRT.objectTypes = VXRT.objectTypes || {};
  VXRT.loadCustom = function (data) {
    const fn = (src) => { try { return (0, eval)('(' + src + ')'); } catch (e) { console.warn('custom code', e.message); return null; } };
    for (const t of data.customTypes || []) VXRT.objectTypes[t.type] = { type: t.type, draw: t.draw ? fn(t.draw) : null, build: t.build ? fn(t.build) : null };
    for (const b of data.customBlocks || []) { if (VXRT.blocks && VXRT.blocks[b.id]) continue; const d = Object.assign({}, b.def); for (const [k, src] of Object.entries(b.fns || {})) d[k] = fn(src); VXRT.registerBlock && VXRT.registerBlock(d); }
  };
  VXRT.Game = Game; VXRT.DEFAULT_OBJ = DEFAULT_OBJ;

  /* per-frame object motion: velocity integration for objects without physics bodies, parents, spin, animations */
  VXRT.stepObjects = function (g, dt) {
    const is3 = g.dim === '3d';
    for (const o of g.objects) {
      if (!o.alive || !o.enabled) continue;
      if (o.physics.body === 'none' || o.physics.body === 'kinematic') { o.x += o.vx * dt; o.y += o.vy * dt; if (is3) o.z += o.vz * dt; }
      if (o.spin) { if (is3) o['r' + (o.spinAxis || 'y')] += o.spin * dt; else o.rot += o.spin * dt; }
      if (o.parent && o.offset) { o.x = o.parent.x + o.offset.x; o.y = o.parent.y + o.offset.y; o.z = o.parent.z + o.offset.z; }
      if (o.anim && o.anim.playing) VXRT.stepAnim && VXRT.stepAnim(g, o, dt);
      if (o.lerpTargets) for (const k of Object.keys(o.lerpTargets)) { const t = o.lerpTargets[k]; o[k] += (t.to - o[k]) * Math.min(1, t.rate * dt); if (Math.abs(t.to - o[k]) < 0.01) { o[k] = t.to; delete o.lerpTargets[k]; } }
      if (o.destroyAt !== undefined && g.time >= o.destroyAt) g.later(() => g.removeObject(o));
    }
  };
})();
