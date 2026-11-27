/* Vextra game runtime – block registry, graph instantiation, signal delivery, code-mode behaviours and the scripting API. */
(function () {
  const VXRT = window.VXRT, U = VXRT.util;
  const blocks = (VXRT.blocks = {});
  const CATS = (VXRT.CATEGORIES = [
    { id: 'triggers', label: 'Triggers', color: '#e5534b' }, { id: 'logic', label: 'Logic & Math', color: '#3fb950' }, { id: 'components', label: 'Components', color: '#d29922' },
    { id: 'properties', label: 'Properties', color: '#58a6ff' }, { id: 'text', label: 'Text & Lists', color: '#bc8cff' }, { id: 'gui', label: 'GUI', color: '#f778ba' },
    { id: 'flow', label: 'Game Flow', color: '#39c5cf' }, { id: 'mobile', label: 'Mobile Device', color: '#f0883e' }, { id: 'mic', label: 'Microphone', color: '#e3b341' }, { id: 'webcam', label: 'Camera', color: '#2ea6a0' }, { id: 'vr', label: 'VR', color: '#a371f7' }, { id: 'ar', label: 'AR', color: '#ff7b72' }, { id: 'bundles', label: 'Behavior Bundles', color: '#8b949e' }, { id: 'plugins', label: 'Plugins', color: '#7ee787' },
  ]);
  const ICONS = { always: '🔁', timer: '⏱️', once: '1️⃣', mouseClick: '🖱️', mouseMove: '↗️', mouseWheel: '🎡', gesture: '👆', lockedMouse: '🔒', keyboard: '⌨️', controller: '🎮', collision: '💥', inView: '👁️', sensor: '📡', mailbox: '📬', custom: '🧩',
    clip: '🎬', number: '🔢', expression: 'ƒ', customBehavior: '🧠', globalVariable: '🌐', objectVariable: '📦', ease: '〰️', repeater: '🔂', random: '🎲', filter: '🚦', switch: '🎚️', toggleSwitch: '🔀', caseSwitch: '🔣', stateFlag: '🚩', router: '🛤️', logicGate: '⚙️',
    sound: '🔊', emit: '✨', spawn: '➕', attacher: '📎', physics: '🧲', joint: '⛓️', proximity: '📏', pushMotor: '🚀', spinMotor: '🌀', impulse: '💨', pointAt: '🎯', destroyer: '🗑️', camera: '🎥', message: '✉️', rayCast: '🔦',
    position: '📍', rotation: '🔄', alpha: '👻', size: '↔️', enabled: '✅', animation: '🎞️', velocity: '➡️', spin: '🌪️', material: '🎨', flip: '🪞', extractor: '🧪', displayOrder: '🥞', blending: '🌗', colors: '🌈', shader: '🔆',
    text: '🔤', textCase: 'Aa', textLength: '📐', toNumber: '#️⃣', textCompare: '⚖️', textSanitize: '🧼', textList: '📝', numberList: '🔢', listModify: '✏️', listOrder: '↕️', listEach: '🔁', listCount: '🧮',
    calendar: '📅', clock: '🕒', label: '🏷️', bar: '📊', alert: '⚠️', cursor: '🖱️', pauseGame: '⏸️', loadLevel: '🗺️', restartGame: '🔄', fetchUrl: '🌍', saveValue: '💾', gameSave: '💾', leaderboard: '🏆', achievement: '🏅', level: '🪜', gamePhysics: '🌍', userInfo: '👤', clipboard: '📋', cloud: '☁️', fullScreen: '⛶', shake: '📳', ad: '📢', vibrate: '📳', accelerometer: '📱', gameCenter: '🎲', deviceCheck: '📱', touchCheck: '👇', exitGame: '🚪', bundle: '📦', bundleInput: '⬅️', bundleOutput: '➡️' };
  const CAT_ICON = { triggers: '⚡', logic: '🧮', components: '🧱', properties: '🎛️', text: '🔤', gui: '🖼️', flow: '🕹️', mobile: '📱', mic: '🎤', webcam: '📷', vr: '🥽', ar: '🪄', bundles: '📦', plugins: '🔌' };
  /** Emoji icon for a block definition (plugins may set def.icon). */
  VXRT.blockIcon = (def) => (def && (def.icon || ICONS[def.id] || CAT_ICON[def.cat])) || '▫️';
  VXRT.catColor = (id) => (CATS.find((c) => c.id === id) || CATS[0]).color;

  /** Register a block. def: {id,cat,label,desc,inputs,outputs,params,init,onInput,update,destroy}. inputs/outputs may be arrays or (params)=>array of 'id' | {id,label}. */
  VXRT.registerBlock = function (def) {
    if (!def || !def.id) throw new Error('Block needs an id');
    const d = Object.assign({ cat: 'plugins', label: def.id, desc: '', inputs: ['in'], outputs: ['out'], params: [] }, def);
    blocks[d.id] = d; return d;
  };
  VXRT.unregisterBlock = (id) => { delete blocks[id]; };
  const portList = (spec, p, node) => (typeof spec === 'function' ? spec(p || {}, node) : spec || []).map((x) => (typeof x === 'string' ? { id: x, label: x } : x));
  /** Full port list of a block (the editor hides the ones marked `opt` until they are wired or switched on in the block's settings).
      Blocks that send an OBJECT get one output per key: def.keys = { out: { keys: ['year', …], show: ['year'] } } adds an output called "year" that carries obj.year. */
  VXRT.ports = (def, params, node) => {
    const r = { inputs: portList(def.inputs, params, node), outputs: portList(def.outputs, params, node) };
    if (def.keys) for (const port of Object.keys(def.keys)) { const K = def.keys[port]; for (const k of K.keys) if (!r.outputs.some((o) => o.id === k)) r.outputs.push({ id: k, label: k, key: port, opt: !(K.show || []).includes(k) }); }
    return r;
  };
  /** Gives a block (already registered) one output per key of the object it sends. Keys that already have their own output are left alone. */
  VXRT.setKeys = function (id, table) {
    const d = blocks[id]; if (!d) return; d.keys = table; d.keyOuts = {};
    const fixed = Array.isArray(d.outputs) ? d.outputs.map((x) => (typeof x === 'string' ? x : x.id)) : [];
    for (const port of Object.keys(table)) d.keyOuts[port] = table[port].keys.filter((k) => !fixed.includes(k));
  };
  /** Marks existing ports of a block as optional: { in: ['c', 'd'], out: ['error'] } – hidden on the canvas until used. */
  VXRT.optPorts = function (id, spec) {
    const d = blocks[id]; if (!d) return; const mark = (list, ids) => (Array.isArray(list) ? list.map((x) => { const o = typeof x === 'string' ? { id: x, label: x } : x; return ids.includes(o.id) ? Object.assign({}, o, { opt: true }) : x; }) : list);
    if (spec.in) d.inputs = mark(d.inputs, spec.in); if (spec.out) d.outputs = mark(d.outputs, spec.out);
  };
  VXRT.paramDefaults = (def) => { const o = {}; for (const p of def.params || []) o[p.key] = p.def !== undefined ? p.def : p.type === 'bool' ? false : p.type === 'number' ? 0 : ''; return o; };

  /** Rename blocks that changed meaning (switch in v2 -> caseSwitch; clip/motionAnim -> animation) so old projects keep working. Safe to call repeatedly. */
  VXRT.migrateGraph = function (graph) {
    if (!graph || graph._mig3) return graph; const nodes = graph.nodes || [], wires = graph.wires || [];
    for (const n of nodes) {
      const p = n.params || {};
      if (n.type === 'switch' && (p.cases !== undefined || p.mode !== undefined || wires.some((w) => w.from === n.id && /^(c\d+|default)$/.test(w.out || '')))) n.type = 'caseSwitch';
      if (n.type === 'shader' && p.mode === undefined && n.params) { n.params.mode = 'object'; if (p.effect === 'custom' && !p.file) n.params.effect = 'custom3d'; }
      if (n.type === 'clip') { n.type = 'animation'; n.params = { action: 'play', anim: p.clip ? 'clip:' + p.clip : '', mode: p.mode || '', speed: p.speed ?? 1, relative: !!p.relative, target: p.target || 'self' }; }
      else if (n.type === 'motionAnim') { n.type = 'animation'; n.params = { action: 'auto', target: p.target || 'self', idle: p.idle || '', walk: p.walk || '', jump: p.jump || '', fall: p.fall || '', face: p.face !== false, moveSpeed: p.threshold || 0 }; }
      else if (n.type === 'animation' && p.loop !== undefined && p.mode === undefined) { n.params = Object.assign({}, p, { mode: p.loop === false ? 'once' : '' }); delete n.params.loop; }
      if (n.graph) VXRT.migrateGraph(n.graph);
    }
    /* Once / Always have no inputs (they start with the game). Old projects: a signal-gated Once becomes a Filter set to "once"; a switchable Always becomes a fast Timer (enable → start, disable → stop); other wires into them are removed. */
    const into = (id) => wires.filter((w) => w.to === id);
    for (const n of nodes) {
      const p = n.params || {};
      if (n.type === 'once') {
        const ws = into(n.id);
        if (p.when === 'signal') { n.type = 'filter'; n.params = { op: 'once', value: '0', value2: '1' }; for (const w of ws) w.in = w.in === 'reset' ? 'reset' : 'in'; for (const w of wires) if (w.from === n.id) w.out = 'pass'; }
        else { if (ws.length) graph.wires = wires.filter((w) => w.to !== n.id); if (n.params) delete n.params.when; }
      } else if (n.type === 'always' && (into(n.id).length || p.enabled === false)) {
        n.type = 'timer'; n.params = { interval: 0.016, delay: 0, repeat: true, autoStart: p.enabled !== false };
        for (const w of wires) { if (w.to === n.id) w.in = w.in === 'disable' ? 'stop' : 'start'; if (w.from === n.id) w.out = 'tick'; }
      }
    }
    try { Object.defineProperty(graph, '_mig3', { value: true, enumerable: false }); } catch { /* frozen */ } return graph;
  };

  /* ---------- graph instantiation ---------- */
  function buildGraph(g, owner, graph, scope) {
    VXRT.migrateGraph(graph);
    const map = new Map(), list = [];
    for (const n of graph.nodes || []) {
      const def = blocks[n.type]; if (!def) { g.log('warn', `Unknown block "${n.type}" in ${owner.name} – skipped`); continue; }
      const inst = { id: n.id, def, p: Object.assign(VXRT.paramDefaults(def), n.params || {}), owner, g, st: {}, out: {}, cleanups: [], scope: scope || null, dead: false, label: n.label };
      map.set(n.id, inst); list.push(inst); owner.nodes.push(inst); g.stats.nodes++;
      if (n.type === 'bundle' && n.graph) inst.inner = buildGraph(g, owner, n.graph, inst);
    }
    for (const w of graph.wires || []) {
      const a = map.get(w.from), b = map.get(w.to); if (!a || !b) continue;
      let po = w.out || 'out', pi = w.in || 'in';
      try { const oa = VXRT.ports(a.def, a.p, a).outputs.map((x) => x.id), ib = VXRT.ports(b.def, b.p, b).inputs.map((x) => x.id); if (oa.length && !oa.includes(po)) po = oa[0]; if (ib.length && !ib.includes(pi)) pi = ib[0]; } catch { /* dynamic ports */ }
      (a.out[po] ||= []).push({ node: b, port: pi, self: a === b });
    }
    const res = { map, list };
    g.later(() => { for (const n of list) { if (n.dead) continue; try { n.def.init && n.def.init(n, g); } catch (e) { g.nodeError(n, e); } if (n.def.update && !n.dead) g.updating.add(n); } });
    return res;
  }
  VXRT.destroyNode = function (g, n) {
    if (n.dead) return; n.dead = true; g.updating.delete(n);
    try { n.def.destroy && n.def.destroy(n, g); } catch { /* ignore */ }
    for (const c of n.cleanups.splice(0)) { try { c(); } catch { /* ignore */ } }
  };
  /** Live view (editor Logic tab): remembers the latest value on every output and posts a batch to the editor ~7×/s. Off unless the editor asks. */
  const liveRec = (g, node, port, value) => {
    const L = g._live || (g._live = {}), r = L[node.id] || (L[node.id] = { n: 0, ports: {} }); r.n++; let t = U.str(value); if (t.length > 34) t = t.slice(0, 33) + '…'; r.ports[port] = t;
  };
  VXRT.liveFlush = (g) => { const ch = g.opts && g.opts.channel; if (!g._live || !ch || window.parent === window) return; try { window.parent.postMessage({ vx: 'live', token: ch.token, data: g._live }, ch.origin); } catch { /* ignore */ } g._live = {}; };
  VXRT.send = function (g, node, port, value) {
    if (node.dead) return; if (g.liveOn) liveRec(g, node, port, value); const targets = node.out[port];
    if (targets) {
      if (g.sendDepth > 60) { if (!g._depthWarned) { g._depthWarned = true; g.log('warn', 'Signal loop detected (depth > 60) – check for a cycle without a delay.'); } return; }
      g.sendDepth++;
      try { for (const t of targets) { if (t.node.dead) continue; if (t.self) { (g.selfQ ||= []).push([t, value]); continue; } try { t.node.def.onInput && t.node.def.onInput(t.node, t.port, value, g); } catch (e) { g.nodeError(t.node, e); } } } finally { g.sendDepth--; }
    }
    if (value && typeof value === 'object' && node.def.keyOuts && node.def.keyOuts[port]) VXRT.fanKeys(g, node, port, value);
  };
  /** An object left `port`: every key that has its own output sends its value there too. */
  VXRT.fanKeys = function (g, node, port, obj) {
    const ko = node.def.keyOuts && node.def.keyOuts[port]; if (!ko || !obj || typeof obj !== 'object') return;
    for (const k of ko) if (k in obj && (node.out[k] || g.liveOn)) VXRT.send(g, node, k, obj[k]);
  };
  VXRT.Game.prototype.send = function (node, port, value) { VXRT.send(this, node, port, value); };
  VXRT.Game.prototype.sendKeys = function (node, port, obj) { VXRT.fanKeys(this, node, port, obj); };
  VXRT.Game.prototype.listen = function (node, off) { node.cleanups.push(off); return off; };

  VXRT.instantiateBehavior = function (g, owner, b) {
    if (b.mode === 'code' && b.code) return runCode(g, owner, b.code, b.name);
    if (b.graph) buildGraph(g, owner, b.graph);
  };

  /* ---------- code mode: block()/connect() builder + the free scripting API ---------- */
  function scriptApi(g, owner) {
    const I = g.input; const add = (off) => { owner.cleanups.push(off); return off; };
    const pseudo = { def: { label: 'script' }, owner, p: {}, st: {}, out: {}, cleanups: owner.cleanups, dead: false };
    const api = {
      self: owner, game: g, input: { isDown: (k) => I.isDown(k), pressed: (k) => I.pressed.has(String(k).toLowerCase()), released: (k) => I.released.has(String(k).toLowerCase()), get mouse() { return I.mouse; }, get keys() { return I.keys; } },
      vars: g.vars, log: (...a) => g.log('log', ...a), Math, U,
      emit: (name, payload) => g.emit('custom:' + name, payload), fire: (name, payload) => g.emit('custom:' + name, payload),
      after: (sec, fn) => { let t = 0, done = false; const n = { def: { update: (_n, dt) => { t += dt; if (!done && t >= sec) { done = true; g.updating.delete(n); fn(); } }, label: 'after' }, dead: false }; g.updating.add(n); add(() => g.updating.delete(n)); },
      every: (sec, fn) => { let t = 0; const n = { def: { update: (_n, dt) => { t += dt; while (t >= sec) { t -= sec; fn(); } }, label: 'every' }, dead: false }; g.updating.add(n); add(() => g.updating.delete(n)); },
      on(ev, fn) {
        if (ev === 'update') { const n = { def: { update: (_n, dt) => fn(dt), label: 'script' }, dead: false, owner }; g.updating.add(n); return add(() => g.updating.delete(n)); }
        if (ev === 'start') { g.later(fn); return () => {}; }
        if (ev === 'destroy') return add((() => { owner.onDestroy = fn; return () => {}; })());
        if (ev === 'keydown' || ev === 'keyup' || ev === 'click' || ev === 'mousedown' || ev === 'mouseup' || ev === 'mousemove' || ev === 'wheel' || ev === 'gesture' || ev === 'shake') return add(I.on(ev, fn));
        if (ev.startsWith('key:')) { const k = ev.slice(4).toLowerCase(); return add(I.on('keydown', (e) => { if (e.key === k && !e.repeat) fn(e); })); }
        if (ev === 'collide' || ev.startsWith('collide:')) { const tag = ev.split(':')[1]; owner.wantsContacts = (owner.wantsContacts || 0) + 1; return add(g.on('collide:' + owner.id, (e) => { if (e.phase !== 'enter') return; if (tag && !(e.other && (e.other.name === tag || (e.other.tags || []).includes(tag)))) return; owner.lastOther = e.other; fn(e.other); })); }
        if (ev.startsWith('message:')) { const ch = ev.slice(8); const h = (m) => { if (!ch || m.channel === ch) fn(m.payload, m); }; const o1 = g.on('msg:' + owner.id, h), o2 = g.on('msg:*', h); return add(() => { o1(); o2(); }); }
        return add(g.on(ev, fn));
      },
    };
    api._pseudo = pseudo; return api;
  }
  function runCode(g, owner, code, name) {
    const ctxStack = [{ nodes: [], wires: [] }]; let counter = 0; const cur = () => ctxStack[ctxStack.length - 1];
    const handle = (node) => ({ id: node.id, type: node.type, to(next, out, inp) { cur().wires.push({ from: node.id, out: out || 'out', to: next.id, in: inp || 'in' }); return next; }, connect(next, out, inp) { return this.to(next, out, inp); } });
    const api = scriptApi(g, owner);
    api.block = (type, params, pos) => { const node = { id: 'c' + ++counter + '_' + type, type, params: params || {}, x: pos?.x ?? 0, y: pos?.y ?? 0 }; cur().nodes.push(node); return handle(node); };
    api.connect = (a, out, b, inp) => a.to(b, out, inp);
    api.bundle = (label, fn) => { const sub = { nodes: [], wires: [] }; ctxStack.push(sub); try { fn(); } finally { ctxStack.pop(); } const node = { id: 'c' + ++counter + '_bundle', type: 'bundle', params: { name: label }, graph: sub }; cur().nodes.push(node); return handle(node); };
    api.at = (x, y) => ({ x, y });
    const names = Object.keys(api); let fn;
    try { fn = new Function(...names, '"use strict";\n' + code + '\n//# sourceURL=behavior-' + String(name || 'script').replace(/\W+/g, '_') + '.js'); } catch (e) { g.log('error', `Syntax error in script "${name}": ${e.message}`); return; }
    try { fn(...names.map((k) => api[k])); } catch (e) { g.log('error', `Script "${name}" threw: ${e.message}`); }
    if (cur().nodes.length) buildGraph(g, owner, cur());
  }
  VXRT.runScript = (g, owner, code) => runCode(g, owner, code, owner.name + ' script');

  /* ---------- helpers used by blocks ---------- */
  VXRT.hitObject = function (g, o, sx, sy) {
    if (g.dim === '3d') return VXRT.pick3D(g, g.input.mouse.sx, g.input.mouse.sy) === o;
    const w = o.layer === 'ui' ? { x: sx, y: sy } : VXRT.screenToWorld(g, sx, sy); const dx = w.x - o.x, dy = w.y - o.y, r = U.rad(-o.rot), lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
    if (o.type === 'ellipse') return (lx * lx) / ((o.w / 2) ** 2 || 1) + (ly * ly) / ((o.h / 2) ** 2 || 1) <= 1; return Math.abs(lx) <= Math.abs(o.w) / 2 && Math.abs(ly) <= Math.abs(o.h) / 2;
  };
  /** Numeric tweening used by Property blocks (duration > 0). */
  VXRT.tween = function (o, key, to, dur, easeName) {
    (o.tweens ||= []); o.tweens = o.tweens.filter((t) => t.key !== key); if (!(dur > 0)) { o[key] = to; return; }
    o.tweens.push({ key, from: o[key], to, t: 0, dur, ease: VXRT.ease.get(easeName || 'quadOut') });
  };
  const stepObjects = VXRT.stepObjects;
  VXRT.stepObjects = function (g, dt) {
    stepObjects(g, dt);
    for (const o of g.objects) if (o.tweens && o.tweens.length) {
      for (const t of o.tweens) { t.t += dt; const k = Math.min(1, t.t / t.dur); o[t.key] = t.from + (t.to - t.from) * t.ease(k); }
      o.tweens = o.tweens.filter((t) => t.t < t.dur); if (o.tweens.length === 0) delete o.tweens;
    }
  };
  VXRT.keyAlias = (k) => { k = String(k || '').trim().toLowerCase(); return ({ left: 'arrowleft', right: 'arrowright', up: 'arrowup', down: 'arrowdown', ' ': 'space', spacebar: 'space', esc: 'escape', return: 'enter' })[k] || k; };
  VXRT.fmtTime = (s, f) => { s = Math.max(0, s); const m = Math.floor(s / 60), h = Math.floor(m / 60); const p = (n) => String(Math.floor(n)).padStart(2, '0'); return f === 'hh:mm:ss' ? `${p(h)}:${p(m % 60)}:${p(s % 60)}` : f === 'mm:ss' ? `${p(m)}:${p(s % 60)}` : (Math.round(s * 100) / 100).toString(); };
})();
