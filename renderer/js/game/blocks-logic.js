/* Vextra blocks – 2. Logic & Math (13). */
(function () {
  const VXRT = window.VXRT, U = VXRT.util, B = VXRT.registerBlock, P = VXRT.P, each = VXRT.each;
  const isNum = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v));
  /** a numeric signal wins; a plain pulse falls back to the block's own amount */
  const val = (v, d) => (isNum(v) ? +v : d);

  B({ id: 'number', cat: 'logic', label: 'Number', desc: 'A constant number. Sends its value whenever it receives a signal (or once at start).',
    inputs: ['in'], outputs: ['out'], params: [P.num('value', 'Value', 1, { step: 0.1 }), P.bool('onStart', 'Send once at start', false)],
    init(n, g) { if (n.p.onStart) g.send(n, 'out', U.num(n.p.value)); }, onInput(n, port, v, g) { g.send(n, 'out', U.num(n.p.value)); } });

  B({ id: 'expression', cat: 'logic', label: 'Expression', desc: 'Evaluates an arithmetic expression. Variables: a, b, c, d, e, f (inputs), value (last "in"), time, dt, any global variable name, and self.x / self.y / self.speed… Functions: sin cos abs min max floor round sqrt pow clamp lerp rand… Operators: + - * / % ^ < > == && || ?:',
    inputs: ['in', 'a', 'b', 'c', 'd', 'e', 'f'], outputs: ['out', 'error'], params: [P.text('expr', 'Expression', 'a * 2 + 1'), P.sel('trigger', 'Calculate when', [['any', 'Any input arrives'], ['in', 'Only "in" arrives']])],
    init(n) { n.st.v = n.st.v || { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, value: 0 }; },
    onInput(n, port, v, g) {
      const s = n.st; s.v = s.v || { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0, value: 0 }; if (s.src !== n.p.expr) { try { s.fn = VXRT.compileExpr(n.p.expr); s.src = n.p.expr; s.err = null; } catch (e) { s.err = e.message; s.src = n.p.expr; } }
      const x = isNum(v) ? +v : v === true ? 1 : v === false ? 0 : U.num(v); if (port === 'in') { s.v.value = x; s.v.a = x; } else s.v[port] = x;
      if (n.p.trigger === 'in' && port !== 'in') return; if (s.err) return g.send(n, 'error', s.err);
      const ctx = { get: (name) => { if (name in s.v) return s.v[name]; if (name === 'time') return g.time; if (name === 'dt') return g.dt; if (name.startsWith('self.')) return U.num(g.getProp(n.owner, name.slice(5))); const gv = g.vars[name]; return gv === undefined ? 0 : U.num(gv); } };
      let r; try { r = s.fn(ctx); } catch (e) { return g.send(n, 'error', e.message); } if (Number.isNaN(r)) return g.send(n, 'error', 'NaN'); g.send(n, 'out', r); } });

  B({ id: 'customBehavior', cat: 'logic', label: 'Custom Behavior', desc: 'Run your own JavaScript. You get: value (the incoming signal), self, game, emit(port, value). Return a value to send it out.',
    inputs: ['in'], outputs: ['out', 'out2', 'error'], params: [P.code('code', 'JavaScript', '// value = incoming signal\nreturn value;')],
    onInput(n, port, v, g) { if (!n.st.fn || n.st.src !== n.p.code) { try { n.st.fn = new Function('value', 'self', 'game', 'emit', n.p.code); n.st.src = n.p.code; } catch (e) { return g.send(n, 'error', e.message); } } try { const r = n.st.fn(v, n.owner, g, (p, x) => g.send(n, p, x)); if (r !== undefined) g.send(n, 'out', r); } catch (e) { g.send(n, 'error', e.message); g.log('error', 'Custom Behavior: ' + e.message); } } });

  const ops = ['set', 'add', 'subtract', 'multiply', 'divide', 'min', 'max', 'toggle'];
  function applyOp(op, cur, v, amount) {
    const a = U.num(cur), b = val(v, amount);
    switch (op) { case 'set': return v === true || v === undefined ? amount : v; case 'add': return a + b; case 'subtract': return a - b; case 'multiply': return a * b; case 'divide': return b ? a / b : a; case 'min': return Math.min(a, b); case 'max': return Math.max(a, b); case 'toggle': return !U.truthy(cur); default: return cur; }
  }
  B({ id: 'globalVariable', cat: 'logic', label: 'Global Variable', desc: 'A named value shared by the whole game (score, lives, level…). Input "in" changes it using the chosen operation; "get" reads it. Show it in a Label with {name}.',
    inputs: ['in', 'get', 'reset'], outputs: ['out', 'changed'], params: [P.text('name', 'Name', 'score'), P.sel('op', 'Operation', ops), P.num('amount', 'Amount (when the signal has no number)', 1), P.num('initial', 'Initial value', 0), P.bool('persist', 'Remember between sessions', false)],
    init(n, g) { const nm = n.p.name; if (g.vars[nm] === undefined) g.vars[nm] = n.p.persist ? g.store.get('var:' + nm, U.num(n.p.initial)) : U.num(n.p.initial); },
    onInput(n, port, v, g) { const nm = n.p.name; if (port === 'get') return g.send(n, 'out', g.vars[nm]); if (port === 'reset') g.vars[nm] = U.num(n.p.initial); else g.vars[nm] = applyOp(n.p.op, g.vars[nm], v, U.num(n.p.amount, 1)); if (n.p.persist) g.store.set('var:' + nm, g.vars[nm]); g.send(n, 'changed', g.vars[nm]); g.send(n, 'out', g.vars[nm]); } });

  B({ id: 'objectVariable', cat: 'logic', label: 'Object Variable', desc: 'A named value stored on an object (health, ammo…). Each object has its own copy, so spawned clones keep separate values.',
    inputs: ['in', 'get', 'reset'], outputs: ['out', 'changed'], params: [P.target(), P.text('name', 'Name', 'health'), P.sel('op', 'Operation', ops), P.num('amount', 'Amount', 1), P.num('initial', 'Initial value', 100)],
    init(n) { each(n, n.g, (o) => { if (o.vars[n.p.name] === undefined) o.vars[n.p.name] = U.num(n.p.initial); }); },
    onInput(n, port, v, g) { each(n, g, (o) => { const nm = n.p.name; if (o.vars[nm] === undefined) o.vars[nm] = U.num(n.p.initial); if (port === 'get') return g.send(n, 'out', o.vars[nm]); if (port === 'reset') o.vars[nm] = U.num(n.p.initial); else o.vars[nm] = applyOp(n.p.op, o.vars[nm], v, U.num(n.p.amount, 1)); g.send(n, 'changed', o.vars[nm]); g.send(n, 'out', o.vars[nm]); }); } });

  B({ id: 'ease', cat: 'logic', label: 'Ease', desc: 'Animates a value from "from" to "to" over time using one of 30 easing curves. Emits the eased value every frame, then "done".',
    inputs: ['start', 'stop', 'reverse'], outputs: ['out', 'done'], params: [P.sel('curve', 'Curve', VXRT.ease.names, 'quadOut'), P.num('from', 'From', 0, { step: 0.1 }), P.num('to', 'To', 1, { step: 0.1 }), P.num('duration', 'Duration (s)', 1, { min: 0.01, step: 0.1 }), P.sel('loop', 'Repeat', [['none', 'Once'], ['loop', 'Loop'], ['pingpong', 'Ping-pong']]), P.bool('autoStart', 'Start automatically', false)],
    init(n) { n.st.t = 0; n.st.dir = 1; n.st.run = !!n.p.autoStart; },
    onInput(n, port) { if (port === 'start') { n.st.t = n.st.dir > 0 ? 0 : 1; n.st.run = true; } else if (port === 'stop') n.st.run = false; else if (port === 'reverse') { n.st.dir *= -1; n.st.run = true; } },
    update(n, dt, g) { const s = n.st; if (!s.run) return; s.t += (dt / Math.max(0.001, U.num(n.p.duration, 1))) * s.dir; let done = false;
      if (s.t >= 1 || s.t <= 0) { if (n.p.loop === 'loop') s.t = s.dir > 0 ? s.t - 1 : s.t + 1; else if (n.p.loop === 'pingpong') { s.dir *= -1; s.t = U.clamp(s.t, 0, 1); } else { s.t = U.clamp(s.t, 0, 1); s.run = false; done = true; } }
      const f = VXRT.ease.get(n.p.curve)(U.clamp(s.t, 0, 1)); g.send(n, 'out', U.lerp(U.num(n.p.from), U.num(n.p.to, 1), f)); if (done) g.send(n, 'done', 1); } });

  B({ id: 'repeater', cat: 'logic', label: 'Repeater', desc: 'Sends a signal several times (optionally spaced out in time). Output value is the index starting at 0. Count -1 repeats until stopped.',
    inputs: ['in', 'stop'], outputs: ['out', 'done'], params: [P.num('count', 'Count', 3, { min: -1 }), P.num('interval', 'Interval (s, 0 = instantly)', 0, { min: 0, step: 0.05 })],
    onInput(n, port, v, g) { if (port === 'stop') { n.st.run = false; return; } const c = U.num(n.p.count, 3); if (U.num(n.p.interval) <= 0 && c >= 0) { for (let i = 0; i < Math.min(c, 5000); i++) g.send(n, 'out', i); g.send(n, 'done', c); return; } n.st.run = true; n.st.i = 0; n.st.t = 0; },
    update(n, dt, g) { const s = n.st; if (!s.run) return; s.t += dt; const iv = Math.max(0.01, U.num(n.p.interval, 0.1)); while (s.run && s.t >= iv) { s.t -= iv; g.send(n, 'out', s.i++); if (U.num(n.p.count) >= 0 && s.i >= U.num(n.p.count)) { s.run = false; g.send(n, 'done', s.i); } } } });

  B({ id: 'random', cat: 'logic', label: 'Random', desc: 'Number mode: a random number between min and max. Chance mode: sends "yes" with the given probability, otherwise "no".',
    inputs: ['in'], outputs: ['out', 'yes', 'no'], params: [P.sel('mode', 'Mode', [['number', 'Random number'], ['chance', 'Chance (yes / no)']]), P.num('min', 'Min', 0), P.num('max', 'Max', 1), P.bool('integer', 'Whole numbers only', false), P.num('chance', 'Chance (0–1)', 0.5, { min: 0, max: 1, step: 0.05 })],
    onInput(n, port, v, g) { if (n.p.mode === 'chance') { const y = Math.random() < U.num(n.p.chance, 0.5); g.send(n, y ? 'yes' : 'no', 1); g.send(n, 'out', y); return; } const a = U.num(n.p.min), b = U.num(n.p.max, 1); g.send(n, 'out', n.p.integer ? U.randInt(Math.ceil(a), Math.floor(b)) : U.rand(a, b)); } });

  B({ id: 'filter', cat: 'logic', label: 'Filter', desc: 'Lets a signal through only if it passes a test. Passing signals go to "pass", the rest to "fail". Special tests: changed (value differs from last), once, every N-th.',
    inputs: ['in', 'reset'], outputs: ['pass', 'fail'], params: [P.sel('op', 'Test', ['>', '<', '>=', '<=', '==', '!=', 'between', 'contains', 'changed', 'once', 'every', 'truthy']), P.text('value', 'Value', '0'), P.text('value2', 'Value 2 (between / every N)', '1')],
    onInput(n, port, v, g) {
      const s = n.st; if (port === 'reset') { s.once = false; s.count = 0; s.last = undefined; return; } const op = n.p.op; let ok = false; const a = isNum(v) ? +v : v, b = isNum(n.p.value) ? +n.p.value : n.p.value;
      if (op === 'between') ok = U.num(v) >= U.num(n.p.value) && U.num(v) <= U.num(n.p.value2); else if (op === 'contains') ok = String(v).includes(String(n.p.value)); else if (op === 'changed') { ok = s.last !== v; s.last = v; } else if (op === 'once') { ok = !s.once; s.once = true; }
      else if (op === 'every') { s.count = (s.count || 0) + 1; ok = s.count % Math.max(1, U.num(n.p.value, 1)) === 0; } else if (op === 'truthy') ok = U.truthy(v); else ok = { '>': a > b, '<': a < b, '>=': a >= b, '<=': a <= b, '==': a == b, '!=': a != b }[op]; // eslint-disable-line eqeqeq
      g.send(n, ok ? 'pass' : 'fail', v); } });

  B({ id: 'switch', cat: 'logic', label: 'Switch', desc: 'Compares the incoming value with a list of cases and sends the signal out of the matching output (or "default"). In index mode the number picks the output directly.',
    inputs: ['in'], outputs: (p) => [...String(p.cases || '').split(',').map((c, i) => ({ id: 'c' + i, label: c.trim() || 'case ' + (i + 1) })), { id: 'default', label: 'default' }],
    params: [P.text('cases', 'Cases (comma separated)', 'a, b, c'), P.sel('mode', 'Match by', [['value', 'Value equals case'], ['index', 'Number = output index (0-based)']])],
    onInput(n, port, v, g) { const cases = String(n.p.cases || '').split(',').map((c) => c.trim()); let i = -1; if (n.p.mode === 'index') i = Math.floor(U.num(v, -1)); else i = cases.findIndex((c) => c === String(v) || (isNum(c) && isNum(v) && +c === +v)); g.send(n, i >= 0 && i < cases.length ? 'c' + i : 'default', v); } });

  B({ id: 'toggleSwitch', cat: 'logic', label: 'Toggle Switch', desc: 'Remembers on/off. "toggle" flips it, "on" / "off" set it, "set" uses the truthiness of the incoming value. Emits the new state.',
    inputs: ['toggle', 'on', 'off', 'set'], outputs: ['out', 'on', 'off'], params: [P.bool('initial', 'Starts on', false)],
    init(n) { n.st.on = !!n.p.initial; }, onInput(n, port, v, g) { const s = n.st; if (port === 'toggle') s.on = !s.on; else if (port === 'on') s.on = true; else if (port === 'off') s.on = false; else s.on = U.truthy(v); g.send(n, s.on ? 'on' : 'off', 1); g.send(n, 'out', s.on); } });

  B({ id: 'router', cat: 'logic', label: 'Router', desc: 'Sends one input to one of several outputs: chosen by the "select" input, round-robin, random, or to all.',
    inputs: ['in', 'select'], outputs: (p) => Array.from({ length: Math.max(2, Math.min(10, U.num(p.outputs, 3))) }, (_, i) => ({ id: 'o' + i, label: 'out ' + (i + 1) })),
    params: [P.num('outputs', 'Number of outputs', 3, { min: 2, max: 10 }), P.sel('mode', 'Mode', [['select', 'Use "select" input'], ['roundRobin', 'Round robin'], ['random', 'Random'], ['all', 'All outputs']])],
    onInput(n, port, v, g) { const N = Math.max(2, Math.min(10, U.num(n.p.outputs, 3))), s = n.st; if (port === 'select') { s.sel = U.clamp(Math.floor(U.num(v)), 0, N - 1); return; } const m = n.p.mode; if (m === 'all') for (let i = 0; i < N; i++) g.send(n, 'o' + i, v); else if (m === 'random') g.send(n, 'o' + U.randInt(0, N - 1), v); else if (m === 'roundRobin') { s.rr = ((s.rr ?? -1) + 1) % N; g.send(n, 'o' + s.rr, v); } else g.send(n, 'o' + (s.sel || 0), v); } });

  const GATES = { AND: (a, b) => a && b, OR: (a, b) => a || b, NAND: (a, b) => !(a && b), NOR: (a, b) => !(a || b), XOR: (a, b) => a !== b, XNOR: (a, b) => a === b, NOT: (a) => !a };
  B({ id: 'logicGate', cat: 'logic', label: 'Logic Gate', desc: 'AND, OR, NAND, NOR, XOR, XNOR (and NOT). Remembers the latest truthiness of inputs a and b and re-evaluates whenever one changes.',
    inputs: ['a', 'b'], outputs: ['out', 'true', 'false'], params: [P.sel('gate', 'Gate', Object.keys(GATES))],
    init(n) { n.st.a = false; n.st.b = false; }, onInput(n, port, v, g) { n.st[port] = U.truthy(v); const r = !!GATES[n.p.gate](n.st.a, n.st.b); g.send(n, r ? 'true' : 'false', 1); g.send(n, 'out', r); } });
})();
