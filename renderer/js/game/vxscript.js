/* VXScript – a small, readable language that compiles to Vextra block graphs (it is NOT JavaScript and never runs as text).
   Each `when …:` line becomes a trigger block, every indented line below it becomes a block wired after it.

     behavior "Player"
     when key left held:
         set velocity x -240
     when touching tag:coin:
         destroy other
         score += 1
         play sound snd_coin

   VX.vxs.compile(source) → { behaviors:[{ name, graph:{nodes,wires} }], warnings:[], errors:[{line,message}] }
   VX.vxs.addTo(project, source, opts) → adds the behaviors to a game project (replacing ones with the same name).
   Works in the browser (VX.vxs) and in Node (module.exports) so the self-test can run it. */
(function (root) {
  'use strict';
  const NUM = /^-?\d+(\.\d+)?$/;
  const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());
  class Err extends Error { constructor(line, msg) { super(msg); this.line = line; } }

  /* ---------------------------------------------------------------- tokens */
  /** Splits a line into words; "quoted text" stays one word (quotes removed), and a trailing ':' is returned separately. */
  function tokens(text, ln) {
    const out = []; let i = 0; const s = text;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '"') { let j = i + 1, v = ''; while (j < s.length && s[j] !== '"') { if (s[j] === '\\' && j + 1 < s.length) { v += s[j + 1] === 'n' ? '\n' : s[j + 1]; j += 2; } else v += s[j++]; } if (j >= s.length) throw new Err(ln, 'A quote was opened but never closed'); out.push({ v, q: true }); i = j + 1; continue; }
      /* a bare word may carry a quoted value: key="two words" */
      let j = i, v = ''; while (j < s.length && s[j] !== ' ' && s[j] !== '\t') { if (s[j] === '"' && j > i) { j++; while (j < s.length && s[j] !== '"') { if (s[j] === '\\' && j + 1 < s.length) { v += s[j + 1] === 'n' ? '\n' : s[j + 1]; j += 2; } else v += s[j++]; } if (j >= s.length) throw new Err(ln, 'A quote is not closed'); j++; } else v += s[j++]; }
      out.push({ v, q: false }); i = j;
    }
    return out;
  }

  /* ---------------------------------------------------------------- argument reader */
  function reader(t, ln) {
    let p = 0; const r = {
      more: () => p < t.length, peek: () => (p < t.length ? t[p].v : undefined), word: () => t[p++]?.v, rest: () => t.slice(p).map((x) => x.v),
      /** Consume a word if it equals one of `names` (case-insensitive). */
      eat(...names) { if (p < t.length && !t[p].q && names.includes(t[p].v.toLowerCase())) { r._last = t[p].v.toLowerCase(); p++; return true; } return false; },
      need(what) { if (p >= t.length) throw new Err(ln, 'Missing ' + what); return t[p++].v; },
      num(what) { const v = r.need(what); if (!NUM.test(v)) throw new Err(ln, `${cap(what)} must be a number, found “${v}”`); return +v; },
      /** Keyword options: `volume 0.5 loop after 2 seconds` → { volume:'0.5', loop:true, ... } for the listed `keys` ({name: 'value'|'flag'}). */
      opts(keys) { const o = {}; while (p < t.length) { const k = t[p].v.toLowerCase(); if (!(k in keys)) throw new Err(ln, `Unexpected “${t[p].v}”. Allowed here: ${Object.keys(keys).join(', ') || 'nothing more'}`); p++; if (keys[k] === 'flag') o[k] = true; else { o[k] = r.need('a value after “' + k + '”'); if (NUM.test(o[k])) r.eat('seconds', 'second', 'sec', 's'); } } return o; },
    }; return r;
  }
  const secs = (r) => { const v = r.num('time'); r.eat('seconds', 'second', 'sec', 's'); return v; };

  /* ---------------------------------------------------------------- triggers: line after "when/every/after/on" → { type, params, out } */
  const TRIG = {
    start: (r) => ({ type: 'once', params: { delay: 0 } }),
    always: () => ({ type: 'always', params: {} }), frame: () => ({ type: 'always', params: {} }),
    key(r, ln) { const key = r.need('a key name').toLowerCase(); let mode = 'down'; if (r.eat('held', 'holding', 'hold')) mode = 'held'; else if (r.eat('released', 'up', 'release')) mode = 'up'; else r.eat('pressed', 'down', 'press'); return { type: 'keyboard', params: { key, mode } }; },
    click(r) { const p = { button: 'left', phase: 'click', on: 'anywhere' }; for (;;) { if (r.eat('left', 'right', 'middle', 'any')) { p.button = r._last; } else break; } return { type: 'mouseClick', params: p, out: 'out' }; },
    touching(r) { const p = { with: r.need('what is touched (any, tag:name, name:object)'), phase: 'enter', side: 'any' }; for (;;) { if (r.eat('enter', 'stay', 'exit')) p.phase = r._last; else if (r.eat('top', 'bottom', 'left', 'right', 'front', 'back')) p.side = r._last; else break; } return { type: 'collision', params: p }; },
    message(r) { return { type: 'mailbox', params: { channel: r.need('a channel name') } }; },
    near(r) { const target = r.need('a target (tag:player)'); const p = { target, radius: 150, mode: 'enter' }; if (r.eat('within')) p.radius = r.num('distance'); if (r.eat('leaves', 'exit')) p.mode = 'exit'; return { type: 'proximity', params: p }; },
    visible: () => ({ type: 'inView', params: { mode: 'enter' } }),
    setting(r) { r.eat('changed', 'changes'); const key = r.more() ? r.word() : ''; return { type: 'gameSettings', params: { key }, out: 'changed' }; },
  };

  /* ---------------------------------------------------------------- statements: each returns { type, params, in?, out? } (or a list for sugar that needs several blocks) */
  const VARCMP = { '=': 'set', '+=': 'add', '-=': 'subtract', '*=': 'multiply', '/=': 'divide' };
  const ST = {
    set(r, ln) {
      const what = r.need('what to set').toLowerCase();
      if (what === 'velocity' || what === 'position' || what === 'size') {
        const mode = 'set'; return axes(r, what === 'velocity' ? 'velocity' : what, mode, ln);
      }
      if (what === 'rotation') { r.eat('to'); const ang = r.num('angle'); const o = r.opts({ axis: 'value', over: 'value' }); return { type: 'rotation', params: { mode: 'set', angle: ang, axis: o.axis || 'y', duration: o.over ? +o.over : 0 } }; }
      if (what === 'alpha' || what === 'opacity') { r.eat('to'); return { type: 'alpha', params: { mode: 'set', value: r.num('value') } }; }
      if (what === 'setting') { const key = r.need('a setting name (volume, sensitivity, fps, showFps or your own)'); r.eat('to'); return { type: 'gameSettings', params: { key, value: r.need('a value') }, in: 'set' }; }
      throw new Err(ln, `“set ${what}” is not known. Use: set velocity/position/size/rotation/alpha …  (for variables write  name = value)`);
    },
    add(r, ln) { const what = r.need('what to add').toLowerCase(); if (what === 'velocity' || what === 'position' || what === 'size') return axes(r, what, 'add', ln); if (what === 'rotation') { r.eat('to'); const ang = r.num('angle'); const o = r.opts({ axis: 'value', over: 'value' }); return { type: 'rotation', params: { mode: 'add', angle: ang, axis: o.axis || 'y', duration: o.over ? +o.over : 0 } }; } throw new Err(ln, `“add ${what}” is not known. Use: add velocity/position/size/rotation …`); },
    stop(r, ln) { const what = (r.peek() || '').toLowerCase(); if (what === 'velocity' || what === 'moving') { r.word(); return { type: 'velocity', params: { mode: 'stop' } }; } if (what === 'sound') { r.word(); return { type: 'sound', params: { sound: r.need('a sound'), action: 'stop' } }; } if (what === 'animation') { r.word(); return { type: 'animation', params: { action: 'stop' } }; } throw new Err(ln, 'Use: stop velocity | stop sound NAME | stop animation'); },
    jump(r) { const f = r.more() && NUM.test(r.peek()) ? r.num('force') : 450; return { type: 'impulse', params: { force: f, direction: 'up', mode: 'set', axisOnly: 'y', onlyGrounded: !r.eat('anywhere') } }; },
    push(r) { const f = r.num('force'); const dir = r.need('a direction (up, down, left, right, forward, back)').toLowerCase(); const t = r.eat('target') ? r.need('a target') : 'self'; return { type: 'impulse', params: { target: t, force: f, direction: dir, mode: 'add', axisOnly: 'all', onlyGrounded: false } }; },
    play(r, ln) {
      const what = r.need('sound or animation').toLowerCase();
      if (what === 'sound') { const o = { sound: r.need('a sound name'), action: 'play', volume: 1, pitch: 1, loop: false }; const k = r.opts({ volume: 'value', pitch: 'value', loop: 'flag' }); if (k.volume) o.volume = +k.volume; if (k.pitch) o.pitch = +k.pitch; if (k.loop) o.loop = true; return { type: 'sound', params: o }; }
      if (what === 'animation') { const a = r.need('an animation name'); const k = r.opts({ loop: 'flag', once: 'flag', speed: 'value', on: 'value' }); return { type: 'animation', params: { target: k.on || 'self', action: 'play', anim: /^(clip:|anim:)/.test(a) ? a : a, mode: k.once ? 'once' : k.loop ? 'loop' : '', speed: k.speed ? +k.speed : 1 } }; }
      throw new Err(ln, 'Use: play sound NAME [volume V] [loop]  or  play animation NAME [loop|once]');
    },
    show(r, ln) { const kind = r.need('toast or modal').toLowerCase(); if (kind !== 'toast' && kind !== 'modal') throw new Err(ln, 'Use: show toast "text"  or  show modal "text"'); const msg = r.need('the text to show'); const o = r.opts({ title: 'value', kind: 'value', button: 'value', for: 'value' }); return { type: 'alert', params: { mode: kind, message: msg, title: o.title || '', kind: o.kind || 'info', button: o.button || 'OK', duration: o.for ? +o.for : 2.5 } }; },
    destroy(r) { let t = 'self'; if (r.more() && !['after', 'with'].includes(r.peek().toLowerCase())) t = r.word(); const o = r.opts({ after: 'value', with: 'value', burst: 'flag' }); return { type: 'destroyer', params: { target: t, delay: o.after ? +o.after : 0, burst: !!o.burst } }; },
    spawn(r) { const tpl = r.need('a template object'); const p = { template: tpl, count: 1, at: 'self', offsetX: 0, offsetY: 0, offsetZ: 0, randomX: 0, randomY: 0 }; const o = r.opts({ count: 'value', at: 'value', x: 'value', y: 'value', z: 'value', randomx: 'value', randomy: 'value' }); if (o.count) p.count = +o.count; if (o.at) p.at = o.at; if (o.x) p.offsetX = +o.x; if (o.y) p.offsetY = +o.y; if (o.z) p.offsetZ = +o.z; if (o.randomx) p.randomX = +o.randomx; if (o.randomy) p.randomY = +o.randomy; return { type: 'spawn', params: p }; },
    load(r, ln) { if (!r.eat('level')) throw new Err(ln, 'Use: load level next | NAME [after N seconds]'); const lv = r.need('a level name or “next”'); const o = r.opts({ after: 'value' }); return { type: 'loadLevel', params: { level: lv, delay: o.after ? +o.after : 0 } }; },
    restart(r) { const s = (r.peek() || 'scene').toLowerCase(); if (r.more()) r.word(); return { type: 'restartGame', params: { scope: s === 'game' ? 'game' : s === 'reset' ? 'sceneReset' : 'scene' } }; },
    open(r, ln) { if (!r.eat('settings', 'setting')) throw new Err(ln, 'Use: open settings'); return { type: 'gameSettings', params: {}, in: 'open' }; },
    close(r, ln) { if (!r.eat('settings', 'setting')) throw new Err(ln, 'Use: close settings'); return { type: 'gameSettings', params: {}, in: 'close' }; },
    reset(r, ln) { if (!r.eat('settings', 'setting')) throw new Err(ln, 'Use: reset settings'); return { type: 'gameSettings', params: {}, in: 'reset' }; },
    pause: () => ({ type: 'pauseGame', params: { action: 'pause' } }), resume: () => ({ type: 'pauseGame', params: { action: 'resume' } }),
    enable(r) { return { type: 'enabled', params: { target: r.more() ? r.word() : 'self', state: 'enable', what: 'all' } }; },
    disable(r) { return { type: 'enabled', params: { target: r.more() ? r.word() : 'self', state: 'disable', what: 'all' } }; },
    toggle(r) { const w = r.need('a variable or object'); return { type: 'globalVariable', params: { name: w, op: 'toggle', amount: 1, initial: 0, persist: false } }; },
    send(r) { const ch = r.need('a channel name'); const o = r.opts({ to: 'value', payload: 'value' }); return { type: 'message', params: { target: o.to || 'all', channel: ch, payload: o.payload || '' } }; },
    camera(r, ln) {
      const a = r.need('a camera action').toLowerCase(); const p = { action: '', target: 'self', value: 1, x: 0, y: 0, z: 0 };
      if (a === 'follow') { p.action = 'follow'; if (r.more()) p.target = r.word(); } else if (a === 'stop') { p.action = 'stopFollow'; } else if (a === 'shake') { p.action = 'shake'; p.value = r.more() ? r.num('strength') : 5; } else if (a === 'zoom') { p.action = 'zoom'; p.value = r.num('zoom'); }
      else if (a === 'look') { p.action = 'lookAt'; p.x = r.num('x'); p.y = r.num('y'); p.z = r.more() ? r.num('z') : 0; } else if (a === 'moveto' || a === 'move') { r.eat('to'); p.action = 'moveTo'; p.x = r.num('x'); p.y = r.num('y'); p.z = r.more() ? r.num('z') : 0; }
      else throw new Err(ln, 'Use: camera follow [target] | stop | shake N | zoom N | look X Y Z | move to X Y Z'); return { type: 'camera', params: p };
    },
    emit(r) { const o = { target: 'self', count: 14, rate: 0, color: '#ffd54a', emoji: '', speed: 160, spread: 360, angle: -90 }; r.eat('particles'); if (r.more() && NUM.test(r.peek())) o.count = r.num('count'); const k = r.opts({ color: 'value', emoji: 'value', speed: 'value', spread: 'value', on: 'value' }); if (k.color) o.color = k.color; if (k.emoji) o.emoji = k.emoji; if (k.speed) o.speed = +k.speed; if (k.spread) o.spread = +k.spread; if (k.on) o.target = k.on; return { type: 'emit', params: o }; },
    label(r) { const id = r.need('a label id'); const txt = r.need('the text ({score} shows a variable)'); const o = r.opts({ at: 'value', x: 'value', y: 'value', size: 'value', color: 'value', bold: 'flag' }); return { type: 'label', params: { id, text: txt, anchor: o.at || 'topLeft', x: o.x ? +o.x : 16, y: o.y ? +o.y : 12, size: o.size ? +o.size : 24, color: o.color || '#ffffff', bold: o.bold !== false } }; },
    bar(r) { const id = r.need('a bar id'); const o = r.opts({ variable: 'value', max: 'value', at: 'value', x: 'value', y: 'value', w: 'value', h: 'value' }); return { type: 'bar', params: { id, variable: o.variable || '', max: o.max ? +o.max : 100, anchor: o.at || 'topLeft', x: o.x ? +o.x : 16, y: o.y ? +o.y : 48, w: o.w ? +o.w : 220, h: o.h ? +o.h : 18 } }; },
    save(r) { const k = r.need('a save slot'); return { type: 'gameSave', params: { slot: k, action: 'save' }, in: 'save' }; },
    rotate(r) { const ang = r.num('angle'); const o = r.opts({ axis: 'value', over: 'value', target: 'value' }); return { type: 'rotation', params: { target: o.target || 'self', mode: 'add', angle: ang, axis: o.axis || 'y', duration: o.over ? +o.over : 0 } }; },
    fade(r) { r.eat('to'); const v = r.num('alpha'); const o = r.opts({ over: 'value', target: 'value' }); return { type: 'alpha', params: { target: o.target || 'self', mode: 'set', value: v, duration: o.over ? +o.over : 0 } }; },
    move(r) { r.eat('to'); const x = r.num('x'), y = r.num('y'); const z = r.more() && NUM.test(r.peek()) ? r.num('z') : ''; const o = r.opts({ over: 'value', target: 'value', ease: 'value' }); return { type: 'position', params: { target: o.target || 'self', mode: 'set', x: String(x), y: String(y), z: z === '' ? '' : String(z), duration: o.over ? +o.over : 0, ease: o.ease || 'quadOut' } }; },
    say(r) { return { type: 'text', params: { text: r.need('the text') } }; },
  };
  /** velocity/position/size with axes: `set velocity x -240 y 0`, or two/three bare numbers `set position 10 20`. */
  function axes(r, what, mode, ln) {
    const keys = what === 'size' ? { w: 'value', h: 'value', d: 'value', uniform: 'flag', over: 'value', target: 'value' } : { x: 'value', y: 'value', z: 'value', over: 'value', target: 'value', space: 'value' };
    const bare = []; while (r.more() && NUM.test(r.peek())) bare.push(r.word()); const o = r.opts(keys); const names = what === 'size' ? ['w', 'h', 'd'] : ['x', 'y', 'z']; bare.forEach((v, i) => { o[names[i]] = v; });
    if (!names.some((n) => o[n] !== undefined) && mode === 'set' && what === 'velocity') throw new Err(ln, 'Give at least one of x, y, z (example: set velocity x -240)');
    const p = { target: o.target || 'self', mode }; for (const n of names) p[n] = o[n] !== undefined ? String(o[n]) : ''; if (o.over) p.duration = +o.over; if (what === 'size' && o.uniform) p.uniform = true; if (o.space) p.space = o.space;
    return { type: what, params: p };
  }

  /** reads `TYPE key=value … [from INPUT] [out OUTPUT]` (used by `block` and `when block`) and checks it against the real block definition */
  function blockSpec(r, ln, reg) {
    const type = r.need('a block type'); const def = reg && reg[type]; if (reg && !def) throw new Err(ln, `There is no block called “${type}”.${nearest(type, Object.keys(reg))}`);
    const params = {}; let via = null, outp = null; const keys = def ? (def.params || []).map((q) => q.key) : null;
    while (r.more()) {
      const w = r.word(); if (w === 'from') { via = r.need('an input port'); continue; } if (w === 'out') { outp = r.need('an output port'); continue; }
      const eq = w.indexOf('='); if (eq < 1) throw new Err(ln, `Write block settings as name=value (found “${w}”)`);
      const k = w.slice(0, eq), v = w.slice(eq + 1); if (keys && !keys.includes(k)) throw new Err(ln, `Block “${type}” has no setting “${k}”.${keys.length ? ' Settings: ' + keys.join(', ') + '.' : ''}${nearest(k, keys)}`);
      const pd = def && def.params.find((q) => q.key === k); params[k] = pd && (pd.type === 'text' || pd.type === 'string') ? v : NUM.test(v) ? +v : v === 'true' ? true : v === 'false' ? false : v;
    }
    if (def) {
      let ports = null; try { ports = VXRT.ports(def, Object.assign(VXRT.paramDefaults(def), params)); } catch { /* ports depend on settings */ }
      if (ports && via && !ports.inputs.some((i) => i.id === via)) throw new Err(ln, `Block “${type}” has no input “${via}”. Inputs: ${ports.inputs.map((i) => i.id).join(', ') || 'none'}.`);
      if (ports && outp && !ports.outputs.some((o) => o.id === outp)) throw new Err(ln, `Block “${type}” has no output “${outp}”. Outputs: ${ports.outputs.map((o) => o.id).join(', ') || 'none'}.`);
    }
    return { type, params, via, outp };
  }
  const nearest = (w, list) => { if (!list || !list.length) return ''; let best = null, bd = 99; for (const c of list) { const d = lev2(String(c).toLowerCase(), String(w).toLowerCase()); if (d < bd) { bd = d; best = c; } } return best && bd <= 2 ? ` Did you mean “${best}”?` : ''; };
  function lev2(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
  const CLAUSE = /^on\s+(\S+?)\s*:?$/i;

  /* ---------------------------------------------------------------- compile */
  function compile(source, hooks) {
    const reg = (hooks && hooks.blocks) || (typeof VXRT !== 'undefined' ? VXRT.blocks : null);
    const res = { behaviors: [], warnings: [], errors: [] };
    const lines = String(source).replace(/\r\n?/g, '\n').split('\n'); let cur = null, uid = 0;
    const startBehavior = (name) => { cur = { name: name || 'Behavior', graph: { nodes: [], wires: [] } }; res.behaviors.push(cur); };
    const addNode = (n, x, y) => { const id = 'n' + ++uid; cur.graph.nodes.push({ id, type: n.type, params: n.params || {}, x, y }); return id; };
    const wire = (from, to, out, inp) => cur.graph.wires.push({ from, to, out: out || 'out', in: inp || 'in' });
    const checkOut = (type, params, port, line) => { const d = reg && reg[type]; if (!d) return; try { const o = VXRT.ports(d, Object.assign(VXRT.paramDefaults(d), params)).outputs; if (!o.some((q) => q.id === port)) throw new Err(line, `Block “${type}” has no output “${port}”. Outputs: ${o.map((q) => q.id).join(', ') || 'none'}.`); } catch (e) { if (e instanceof Err) throw e; } };
    const outOf = (type, want) => { if (want) return want; const d = reg && reg[type]; if (d) { try { const o = VXRT.ports(d, VXRT.paramDefaults(d)).outputs; if (o.length) return o[0].id; } catch { /* default */ } } return { timer: 'tick', collision: 'out' }[type] || 'out'; };
    const endsFor = (id, type, port) => { const d = reg && reg[type]; if (d) { try { if (!VXRT.ports(d, VXRT.paramDefaults(d)).outputs.length) return []; } catch { /* keep */ } } else if (['loadLevel', 'restartGame', 'pushMotor'].includes(type)) return []; return [{ id, port }]; };
    const inOf = (type, want) => { if (want) return want; const d = reg && reg[type]; if (d) { try { const i = VXRT.ports(d, VXRT.paramDefaults(d)).inputs; if (i.length) return i[0].id; } catch { /* default */ } } return 'in'; };

    /* parse into a tree: { line, toks, kids[] } by indentation */
    const items = []; let unit = 0;
    for (let i = 0; i < lines.length; i++) {
      let raw = lines[i]; const hash = (() => { let q = false; for (let k = 0; k < raw.length; k++) { if (raw[k] === '"') q = !q; else if (raw[k] === '#' && !q && (k === 0 || /\s/.test(raw[k - 1])) && (k + 1 >= raw.length || /[\s#]/.test(raw[k + 1]))) return k; } return -1; })(); if (hash >= 0) raw = raw.slice(0, hash);
      if (!raw.trim()) continue; const m = /^(\s*)/.exec(raw)[1]; if (/\t/.test(m) && / /.test(m)) { res.errors.push({ line: i + 1, message: 'Mixed tabs and spaces' }); continue; }
      const depth = m.length; if (depth && !unit) unit = depth; items.push({ line: i + 1, depth, text: raw.trim() });
    }
    unit = unit || 4; const root = { kids: [], depth: -1 }; const stack = [root];
    for (const it of items) {
      while (stack.length > 1 && stack[stack.length - 1].depth >= it.depth) stack.pop();
      if (it.depth % unit) { res.errors.push({ line: it.line, message: `Indent in steps of ${unit} spaces` }); continue; }
      const parent = stack[stack.length - 1]; if (parent.depth + unit < it.depth && parent !== root) { res.errors.push({ line: it.line, message: 'Indented too far' }); continue; }
      const node = { line: it.line, text: it.text, depth: it.depth, kids: [] }; parent.kids.push(node); stack.push(node);
    }

    const fail = (e, line) => { if (e instanceof Err) res.errors.push({ line: e.line || line, message: e.message }); else throw e; };
    const colon = (t) => { const v = t[t.length - 1]; if (v && !v.q && v.v.endsWith(':')) { v.v = v.v.slice(0, -1); if (!v.v) t.pop(); return true; } return false; };

    /** Compile `kids` as a chain after the `from` ends ([{id,port}]); returns the ends of the chain (where whatever comes next attaches). */
    function chain(kidsAll, from, x, y) {
      const kids = kidsAll.filter((k) => !k.isElse); let ends = from; let yy = y;
      const link = (id, inp, toType) => { for (const e of ends) wire(e.id, id, e.port, inOf(toType, inp)); };
      const rows = (list) => Math.max(1, list.length);
      for (const k of kids) {
        try {
          const t = tokens(k.text, k.line); const hasBlock = colon(t); const r = reader(t, k.line); const head = (r.word() || '').toLowerCase();
          if (head === 'if' || head === 'unless') {
            if (!hasBlock) throw new Err(k.line, 'End the line with “:”');
            const f = condition(r, k.line, head === 'unless'); let ex = x;
            if (f.read) { const idV = addNode(f.read, ex, yy); link(idV, 'get', f.read.type); ends = [{ id: idV, port: 'out' }]; ex += 290; }
            const idF = addNode(f.filter, ex, yy); link(idF, 'in', 'filter'); const thenEnds = chain(k.kids, [{ id: idF, port: 'pass' }], ex + 290, yy);
            const elseEnds = k.elseKid ? chain(k.elseKid.kids, [{ id: idF, port: 'fail' }], ex + 290, yy + 110 * rows(k.kids)) : [{ id: idF, port: 'fail' }];
            ends = thenEnds.concat(elseEnds); yy += 110 * (rows(k.kids) + (k.elseKid ? rows(k.elseKid.kids) : 0)); x = ex + 290 * 2; continue;
          }
          if (head === 'else') throw new Err(k.line, '“else” must come right after an “if” block');
          if (head === 'chance') {
            if (!hasBlock) throw new Err(k.line, 'End the line with “:”'); const pct = +String(r.need('a percentage')).replace(/%$/, ''); if (!(pct >= 0 && pct <= 100)) throw new Err(k.line, 'The chance must be between 0 and 100 (example: chance 30%:)'); r.eat('percent', '%');
            const id = addNode({ type: 'random', params: { mode: 'chance', chance: Math.max(0, Math.min(1, pct / 100)), min: 0, max: 1, integer: false } }, x, yy); link(id, 'in', 'random');
            const yesEnds = chain(k.kids, [{ id, port: 'yes' }], x + 290, yy); const noEnds = k.elseKid ? chain(k.elseKid.kids, [{ id, port: 'no' }], x + 290, yy + 110 * rows(k.kids)) : [{ id, port: 'no' }];
            ends = yesEnds.concat(noEnds); yy += 110 * (rows(k.kids) + (k.elseKid ? rows(k.elseKid.kids) : 0)); x += 290 * 2; continue;
          }
          if (head === 'repeat') {
            if (!hasBlock) throw new Err(k.line, 'End the line with “:”'); const n = r.num('count'); r.eat('times', 'time'); const o = r.opts({ every: 'value' });
            const id = addNode({ type: 'repeater', params: { count: n, interval: o.every ? +o.every : 0 } }, x, yy); link(id, 'in', 'repeater'); chain(k.kids, [{ id, port: 'out' }], x + 290, yy); yy += 110 * rows(k.kids); ends = [{ id, port: 'done' }]; x += 290; continue;
          }
          if (head === 'wait') { const sc = secs(r); const id = addNode({ type: 'timer', params: { interval: sc, delay: 0, repeat: false, autoStart: false } }, x, yy); link(id, 'start', 'timer'); ends = [{ id, port: 'tick' }]; x += 290; continue; }
          if (head === 'block') {
            const sp = blockSpec(r, k.line, reg); const id = addNode({ type: sp.type, params: sp.params }, x, yy); link(id, sp.via, sp.type);
            if (hasBlock) {   /* block TYPE …:  with  on PORT:  branches */
              if (!k.kids.length || !k.kids.every((c) => CLAUSE.test(c.text))) throw new Err(k.line, 'Under a block line that ends with “:” write one “on PORT:” branch per output, e.g.  on pass:');
              const found = []; let yb = yy; for (const c of k.kids) { const port = CLAUSE.exec(c.text)[1]; checkOut(sp.type, sp.params, port, c.line); found.push(...chain(c.kids, [{ id, port }], x + 290, yb)); yb += 110 * rows(c.kids); }
              ends = found; yy = yb; x += 290 * 2; continue;
            }
            ends = endsFor(id, sp.type, outOf(sp.type, sp.outp)); x += 290; continue;
          }
          /* variable statements: name = 5, name += 1, self.health -= 10 */
          const vm = /^(.+?)\s*(\+=|-=|\*=|\/=|=)\s*(.+)$/.exec(k.text.replace(/:$/, ''));
          if (vm && !ST[head]) {
            const lhs = vm[1].trim(), op = VARCMP[vm[2]], rhsT = tokens(vm[3], k.line); if (rhsT.length !== 1) throw new Err(k.line, 'Give one value (a number)'); const amt = rhsT[0].v, asNum = NUM.test(amt) ? +amt : null;
            if (asNum === null) throw new Err(k.line, `“${amt}” is not a number. Variables are set from numbers here; for anything else use:  block globalVariable name=… op=…`);
            const dot = lhs.indexOf('.'); const node = dot > 0 ? { type: 'objectVariable', params: { target: lhs.slice(0, dot), name: lhs.slice(dot + 1), op, amount: asNum, initial: 0 } } : { type: 'globalVariable', params: { name: lhs, op, amount: asNum, initial: 0, persist: false } };
            const id = addNode(node, x, yy); link(id, 'in', node.type); ends = [{ id, port: 'out' }]; x += 290; continue;
          }
          const fn = ST[head]; if (!fn) throw new Err(k.line, `I do not know “${head}”. ${suggest(head)}`);
          const n = fn(r, k.line); if (r.more()) throw new Err(k.line, `Unexpected “${r.rest().join(' ')}”`);
          if (reg && !reg[n.type]) throw new Err(k.line, `This version of Vextra has no “${n.type}” block`);
          const id = addNode(n, x, yy); link(id, n.in, n.type); ends = endsFor(id, n.type, outOf(n.type, n.out)); x += 290;
        } catch (e) { fail(e, k.line); }
      }
      return ends;
    }
    const suggest = (w) => { const all = [...Object.keys(ST), 'if', 'unless', 'else', 'chance', 'repeat', 'wait', 'block']; const best = all.map((c) => [c, lev(c, w)]).sort((a, b) => a[1] - b[1])[0]; return best && best[1] <= 2 ? `Did you mean “${best[0]}”?` : 'Statements: ' + all.join(', ') + '.'; };
    function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
    /** `if score >= 5`, `if self.health <= 0`, `if value > 3` (signal), `if key ...` – returns the nodes to build. */
    function condition(r, ln, negate) {
      const subj = r.need('what to compare'); const opw = r.need('a comparison (> < >= <= == !=)'); const OPS = { '>': '>', '<': '<', '>=': '>=', '<=': '<=', '==': '==', '=': '==', '!=': '!=', is: '==', 'is-not': '!=' }; let op = OPS[opw.toLowerCase()]; if (!op) throw new Err(ln, `“${opw}” is not a comparison. Use > < >= <= == !=`);
      if (negate) op = { '>': '<=', '<': '>=', '>=': '<', '<=': '>', '==': '!=', '!=': '==' }[op]; const val = r.need('a value'); if (r.more()) throw new Err(ln, `Unexpected “${r.rest().join(' ')}”`);
      let read = null; if (subj !== 'value') { const dot = subj.indexOf('.'); read = dot > 0 ? { type: 'objectVariable', params: { target: subj.slice(0, dot), name: subj.slice(dot + 1), op: 'set', amount: 0, initial: 0 } } : { type: 'globalVariable', params: { name: subj, op: 'set', amount: 0, initial: 0, persist: false } }; }
      return { read, filter: { type: 'filter', params: { op, value: val, value2: '1' } } };
    }

    /* top level: behavior lines and trigger lines */
    startBehavior('Behavior'); let used = false; const first = res.behaviors[0];
    for (const top of root.kids) {
      try {
        const t = tokens(top.text, top.line); const hasBlock = colon(t); const r = reader(t, top.line); const head = (r.word() || '').toLowerCase();
        if (head === 'behavior' || head === 'behaviour') { const name = r.need('a name in quotes'); if (r.more()) throw new Err(top.line, 'Put the name in quotes: behavior "My name"'); if (hasBlock || top.kids.length) throw new Err(top.line, 'A behavior line has nothing indented below it – write the “when …” lines at the same level'); if (!used && cur === first) { first.name = name; } else startBehavior(name); used = false; continue; }
        if (!['when', 'on', 'every', 'after', 'always'].includes(head)) throw new Err(top.line, `A line at the left edge must start with behavior, when, every, after or always (found “${head}”)`);
        if (!hasBlock) throw new Err(top.line, 'End the line with “:”'); let node, trigClauses = false;
        if (head === 'every') { const s = secs(r); node = { type: 'timer', params: { interval: s, delay: 0, repeat: true, autoStart: true } }; if (r.more()) throw new Err(top.line, `Unexpected “${r.rest().join(' ')}”`); node.out = 'tick'; }
        else if (head === 'after') { const s = secs(r); node = { type: 'timer', params: { interval: s, delay: 0, repeat: false, autoStart: true } }; node.out = 'tick'; if (r.more()) throw new Err(top.line, `Unexpected “${r.rest().join(' ')}”`); }
        else if (head === 'always') { node = { type: 'always', params: {} }; }
        else if ((r.peek() || '').toLowerCase() === 'block') { r.word(); const sp = blockSpec(r, top.line, reg); node = { type: sp.type, params: sp.params, out: sp.outp }; trigClauses = true; }
        else { const kind = (r.word() || '').toLowerCase(); if (!kind) throw new Err(top.line, 'Say what to wait for: when start | key K | click | touching T | message M | near T'); const tf = TRIG[kind]; if (!tf) throw new Err(top.line, `I do not know the trigger “${kind}”. Triggers: ${Object.keys(TRIG).join(', ')}, or every N seconds / after N seconds`); node = tf(r, top.line); if (r.more()) throw new Err(top.line, `Unexpected “${r.rest().join(' ')}”`); }
        if (reg && !reg[node.type]) throw new Err(top.line, `This version of Vextra has no “${node.type}” block`);
        const rowY = 40 + (cur.graph.nodes.length ? Math.max(...cur.graph.nodes.map((n) => n.y)) + 160 : 0); const id = addNode(node, 40, rowY); used = true;
        if (trigClauses && top.kids.length && top.kids.every((c) => CLAUSE.test(c.text))) { let yb = rowY; for (const c of top.kids) { const port = CLAUSE.exec(c.text)[1]; checkOut(node.type, node.params, port, c.line); pairElse(c.kids); chain(c.kids, [{ id, port }], 330, yb); yb += 110 * Math.max(1, c.kids.length); } }
        else { pairElse(top.kids); chain(top.kids, [{ id, port: outOf(node.type, node.out) }], 330, rowY); }
      } catch (e) { fail(e, top.line); }
    }
    function pairElse(kids) { for (let i = 0; i < kids.length; i++) { const k = kids[i]; if (/^else\s*:?$/i.test(k.text)) { const p = kids[i - 1]; if (!p || !/^(if|unless|chance)\b/i.test(p.text)) { res.errors.push({ line: k.line, message: '“else:” must come right after an “if” or “chance” block' }); } else p.elseKid = k; k.isElse = true; } pairElse(k.kids); } }
    res.behaviors = res.behaviors.filter((b) => b.graph.nodes.length);
    if (!res.behaviors.length && !res.errors.length) res.warnings.push({ line: 1, message: 'The script has no behaviors yet. Start with:  when start:' });
    return res;
  }

  /** Adds the compiled behaviors to a game project (existing behaviors with the same name are replaced). Returns { added, replaced, ids }. */
  function addTo(project, source, opts) {
    const r = compile(source, opts); if (r.errors.length) return Object.assign({ added: 0, replaced: 0, ids: [] }, r);
    const GP = root.VX && root.VX.GameProject; let added = 0, replaced = 0; const ids = [];
    project.behaviors = project.behaviors || {};
    for (const b of r.behaviors) {
      const old = Object.values(project.behaviors).find((x) => x && x.name === b.name && x.fromVxs);
      const id = old ? old.id : 'b_vxs_' + b.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + Math.random().toString(36).slice(2, 6);
      project.behaviors[id] = { id, name: b.name, mode: 'graph', graph: b.graph, code: '', fromVxs: true }; (old ? replaced++ : added++); ids.push(id);
      if (GP && GP.fixWires) GP.fixWires(b.graph);
    }
    return Object.assign({ added, replaced, ids }, r);
  }


  /* ---------------------------------------------------------------- reference table: feeds the editor's auto-complete, the hover help and the documentation */
  const HELP = {
    triggers: [
      { name: 'start', usage: 'when start:', desc: 'Runs once, when the scene begins.', ex: 'when start:\n    label hud "Score: {score}"' },
      { name: 'always', usage: 'when always:', desc: 'Runs every frame (also written “always:” or “when frame:”).', ex: 'always:\n    set velocity x 120' },
      { name: 'key', usage: 'when key KEY [pressed|held|released]:', desc: 'A keyboard key. KEY is a-z, 0-9, space, enter, shift, arrowleft … or any.', ex: 'when key space pressed:\n    jump' },
      { name: 'click', usage: 'when click [left|right|middle|any]:', desc: 'A mouse click or tap.', ex: 'when click:\n    spawn bullet' },
      { name: 'touching', usage: 'when touching WHAT [enter|stay|exit] [top|bottom|left|right|front|back]:', desc: 'Contact with another object. WHAT is any, tag:NAME or name:OBJECT.', ex: 'when touching tag:coin:\n    destroy other' },
      { name: 'message', usage: 'when message CHANNEL:', desc: 'A message sent with “send CHANNEL”.', ex: 'when message boss_dead:\n    load level next' },
      { name: 'near', usage: 'when near TARGET [within DISTANCE] [leaves]:', desc: 'Another object comes within a distance (or leaves it).', ex: 'when near tag:player within 200:\n    play sound alarm' },
      { name: 'visible', usage: 'when visible:', desc: 'The object enters the camera view.', ex: 'when visible:\n    play animation wake' },
      { name: 'setting', usage: 'when setting changed [KEY]:', desc: 'The player changed a setting in the settings panel (volume, sensitivity, fps, showFps or one of your own).', ex: 'when setting changed difficulty:\n    show toast "Difficulty changed"' },
      { name: 'every', usage: 'every N seconds:', desc: 'Repeats on a timer.', ex: 'every 2 seconds:\n    spawn enemy' },
      { name: 'after', usage: 'after N seconds:', desc: 'Runs once, N seconds after the scene begins.', ex: 'after 5 seconds:\n    show toast "Hurry!"' },
      { name: 'block', usage: 'when block TYPE name=value … [out PORT]:', desc: 'Any trigger block by its type name – every block in Vextra can be written this way. Branch outputs with “on PORT:” lines.', ex: 'when block lockedMouse sensitivity=1.5:\n    on dx:\n        rotate 1 axis y' },
    ],
    statements: [
      { name: 'set', usage: 'set velocity|position|size X Y Z … | set rotation ANGLE | set alpha V | set setting KEY VALUE', desc: 'Sets a property of the object (axes as “x 10 y 20” or bare numbers). “over S” animates it.', ex: 'set velocity x -240\nset position 10 20\nset alpha 0.5\nset setting volume 0.8' },
      { name: 'add', usage: 'add velocity|position|size … | add rotation ANGLE [axis A] [over S]', desc: 'Adds to a property.', ex: 'add position x 10' },
      { name: 'stop', usage: 'stop velocity | stop sound NAME | stop animation', desc: 'Stops movement, a sound or an animation.', ex: 'stop sound music' },
      { name: 'jump', usage: 'jump [FORCE] [anywhere]', desc: 'Jumps (only on the ground unless “anywhere”).', ex: 'jump 520' },
      { name: 'push', usage: 'push FORCE DIRECTION [target T]', desc: 'Pushes an object (up, down, left, right, forward, back).', ex: 'push 300 right target other' },
      { name: 'play', usage: 'play sound NAME [volume V] [pitch P] [loop] | play animation NAME [loop|once] [speed S] [on T]', desc: 'Plays a sound or an animation.', ex: 'play sound snd_coin volume 0.6' },
      { name: 'show', usage: 'show toast|modal "TEXT" [title T] [kind info|success|warn|error] [button B] [for S]', desc: 'Shows a message to the player.', ex: 'show toast "Saved!" kind success' },
      { name: 'destroy', usage: 'destroy [TARGET] [after S] [burst]', desc: 'Removes an object (default: itself; “other” is what you touched).', ex: 'destroy other burst' },
      { name: 'spawn', usage: 'spawn TEMPLATE [count N] [at T] [x N] [y N] [z N] [randomx N] [randomy N]', desc: 'Creates copies of a template object.', ex: 'spawn coin count 3 randomx 80' },
      { name: 'load', usage: 'load level next|NAME [after S]', desc: 'Switches to another level (scene).', ex: 'load level next after 2 seconds' },
      { name: 'restart', usage: 'restart [scene|game|reset]', desc: 'Restarts the scene or the whole game.', ex: 'restart game' },
      { name: 'pause', usage: 'pause', desc: 'Pauses the game.', ex: 'pause' },
      { name: 'resume', usage: 'resume', desc: 'Resumes the game.', ex: 'resume' },
      { name: 'enable', usage: 'enable [TARGET]', desc: 'Turns an object’s behaviour on.', ex: 'enable door' },
      { name: 'disable', usage: 'disable [TARGET]', desc: 'Turns an object’s behaviour off.', ex: 'disable trap' },
      { name: 'toggle', usage: 'toggle VARIABLE', desc: 'Flips a variable between 0 and 1.', ex: 'toggle lights' },
      { name: 'send', usage: 'send CHANNEL [to T] [payload V]', desc: 'Sends a message other behaviours can wait for.', ex: 'send boss_dead' },
      { name: 'camera', usage: 'camera follow [T] | stop | shake N | zoom N | look X Y [Z] | move to X Y [Z]', desc: 'Controls the camera.', ex: 'camera shake 8' },
      { name: 'emit', usage: 'emit [particles] [N] [color C] [emoji E] [speed S] [spread D] [on T]', desc: 'Particle burst.', ex: 'emit particles 20 color #ffcc00' },
      { name: 'label', usage: 'label ID "TEXT" [at ANCHOR] [x N] [y N] [size N] [color C] [bold]', desc: 'On-screen text. {name} inside the text shows a variable.', ex: 'label hud "Score: {score}" at topLeft size 28' },
      { name: 'bar', usage: 'bar ID [variable V] [max N] [at ANCHOR] [x N] [y N] [w N] [h N]', desc: 'A progress bar bound to a variable.', ex: 'bar hp variable health max 100' },
      { name: 'save', usage: 'save SLOT', desc: 'Saves the game to a slot.', ex: 'save slot1' },
      { name: 'rotate', usage: 'rotate ANGLE [axis A] [over S] [target T]', desc: 'Turns an object.', ex: 'rotate 90 axis y over 0.5' },
      { name: 'fade', usage: 'fade [to] ALPHA [over S] [target T]', desc: 'Fades an object.', ex: 'fade to 0 over 1' },
      { name: 'move', usage: 'move [to] X Y [Z] [over S] [target T] [ease E]', desc: 'Moves an object to a place.', ex: 'move to 400 120 over 2' },
      { name: 'say', usage: 'say "TEXT"', desc: 'Passes text on (for blocks that read text).', ex: 'say "Hello"' },
      { name: 'open', usage: 'open settings', desc: 'Opens the player settings panel (volume, sensitivity, frame rate, your own options).', ex: 'when key o pressed:\n    open settings' },
      { name: 'close', usage: 'close settings', desc: 'Closes the settings panel.', ex: 'close settings' },
      { name: 'reset', usage: 'reset settings', desc: 'Puts every setting back to its default.', ex: 'reset settings' },
      { name: 'wait', usage: 'wait N [seconds]', desc: 'Pauses this chain, then continues.', ex: 'wait 2 seconds' },
    ],
    flow: [
      { name: 'if', usage: 'if VARIABLE OP VALUE:   (OP: > < >= <= == !=)   …   [else:]', desc: 'Runs the indented lines when the test is true. VARIABLE can be a variable, self.property, or “value” (the incoming signal). “unless” inverts it.', ex: 'if score >= 5:\n    load level next\nelse:\n    show toast "Keep going"' },
      { name: 'chance', usage: 'chance PERCENT%:   …   [else:]', desc: 'Random branch.', ex: 'chance 30%:\n    spawn health' },
      { name: 'repeat', usage: 'repeat N [times] [every S]:', desc: 'Runs the indented lines N times.', ex: 'repeat 3 times every 0.5:\n    spawn bullet' },
      { name: 'block', usage: 'block TYPE name=value … [from INPUT] [out OUTPUT]  or  block TYPE …:  with  on OUTPUT:  branches', desc: 'Any block in Vextra, by its type name. Ports and settings are checked against the real block, so typos are reported.', ex: 'block filter op=">" value=3:\n    on pass:\n        say "big"\n    on fail:\n        say "small"' },
      { name: 'VAR += N', usage: 'NAME = N | NAME += N | NAME -= N | NAME *= N | NAME /= N | OBJECT.NAME op N', desc: 'Variable maths (numbers).', ex: 'score += 10\nself.health -= 25' },
    ],
    keys: ['space', 'enter', 'escape', 'shift', 'control', 'alt', 'tab', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'any', 'w', 'a', 's', 'd', 'e', 'f', 'q', 'r', 'z', 'x'],
    anchors: ['topLeft', 'top', 'topRight', 'left', 'center', 'right', 'bottomLeft', 'bottom', 'bottomRight'],
    options: { 'play': ['sound', 'animation', 'volume', 'pitch', 'loop', 'once', 'speed', 'on'], 'show': ['toast', 'modal', 'title', 'kind', 'button', 'for'], 'spawn': ['count', 'at', 'x', 'y', 'z', 'randomx', 'randomy'], 'label': ['at', 'x', 'y', 'size', 'color', 'bold'], 'bar': ['variable', 'max', 'at', 'x', 'y', 'w', 'h'], 'move': ['to', 'over', 'target', 'ease'], 'rotate': ['axis', 'over', 'target'], 'fade': ['to', 'over', 'target'], 'destroy': ['after', 'with', 'burst'], 'emit': ['particles', 'color', 'emoji', 'speed', 'spread', 'on'], 'camera': ['follow', 'stop', 'shake', 'zoom', 'look', 'move'], 'send': ['to', 'payload'], 'load': ['level', 'next', 'after'], 'set': ['velocity', 'position', 'size', 'rotation', 'alpha', 'setting'], 'add': ['velocity', 'position', 'size', 'rotation'] },
  };
  /** every block type with its settings and ports, for auto-complete and the docs (needs the game runtime to be loaded) */
  function catalog() {
    const reg = typeof VXRT !== 'undefined' ? VXRT.blocks : null; if (!reg) return [];
    return Object.keys(reg).sort().map((id) => { const d = reg[id]; let ports = { inputs: [], outputs: [] }; try { ports = VXRT.ports(d, VXRT.paramDefaults(d)); } catch { /* dynamic ports */ }
      return { id, label: d.label || id, cat: d.cat || '', desc: d.desc || '', params: (d.params || []).map((q) => ({ key: q.key, label: q.label || q.key, type: q.type, def: q.def, options: q.options })), inputs: ports.inputs.map((i) => i.id), outputs: ports.outputs.map((o) => o.id), trigger: !(d.inputs && d.inputs.length) && !!(ports.outputs && ports.outputs.length) }; });
  }

  const api = { compile, addTo, catalog, help: HELP, triggers: Object.keys(TRIG), statements: Object.keys(ST) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.VX = root.VX || {}; root.VX.vxs = api; }
})(typeof window !== 'undefined' ? window : globalThis);
