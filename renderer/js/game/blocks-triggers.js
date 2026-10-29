/* Vextra blocks – 1. Triggers (15). Triggers start logic: they have no required inputs and emit signals when something happens. */
(function () {
  const VXRT = window.VXRT, U = VXRT.util, B = VXRT.registerBlock;
  const P = (VXRT.P = {
    num: (key, label, def = 0, x) => Object.assign({ key, label, type: 'number', def }, x), text: (key, label, def = '', x) => Object.assign({ key, label, type: 'text', def }, x),
    area: (key, label, def = '', x) => Object.assign({ key, label, type: 'multiline', def }, x), bool: (key, label, def = false, x) => Object.assign({ key, label, type: 'bool', def }, x),
    sel: (key, label, options, def, x) => Object.assign({ key, label, type: 'select', options, def: def ?? (Array.isArray(options[0]) ? options[0][0] : options[0]) }, x), color: (key, label, def = '#ffffff', x) => Object.assign({ key, label, type: 'color', def }, x),
    code: (key, label, def = '', x) => Object.assign({ key, label, type: 'code', def }, x), target: (key = 'target', label = 'Target', def = 'self', x) => Object.assign({ key, label, type: 'target', def, hint: 'self, other (last collision), parent, all, tag:name, or an object name' }, x),
    sound: (key = 'sound', label = 'Sound', x) => Object.assign({ key, label, type: 'sound', def: '' }, x), sprite: (key = 'sprite', label = 'Sprite', x) => Object.assign({ key, label, type: 'sprite', def: '' }, x),
    key: (key = 'key', label = 'Key', def = 'space', x) => Object.assign({ key, label, type: 'key', def }, x), multi: (key, label, options, def, x) => Object.assign({ key, label, type: 'multi', options, def }, x),
  });
  const each = (n, g, fn) => { for (const o of g.targets(n.p.target, n.owner, n.owner.lastOther)) if (o.alive) fn(o); };
  VXRT.each = each;
  const MATCH = (spec, other) => { const s = String(spec ?? 'any').trim(); if (!other) return s === 'any' || s === ''; if (s === '' || s === 'any') return true; if (s.startsWith('tag:')) return (other.tags || []).includes(s.slice(4)); return other.name === s || (other.tags || []).includes(s); };

  B({ id: 'always', cat: 'triggers', label: 'Always', desc: 'Fires every frame. Output value is the frame time in seconds (dt). Use Enable/Disable to switch it on and off.',
    inputs: ['enable', 'disable'], outputs: ['out'], params: [P.bool('enabled', 'Enabled at start', true)],
    init(n) { n.st.on = n.p.enabled; }, onInput(n, port) { n.st.on = port === 'enable'; }, update(n, dt, g) { if (n.st.on) g.send(n, 'out', dt); } });

  B({ id: 'timer', cat: 'triggers', label: 'Timer', desc: 'Fires after an interval, once or repeatedly. Output value is how many times it has fired.',
    inputs: ['start', 'stop', 'reset'], outputs: ['tick'], params: [P.num('interval', 'Interval (s)', 1, { min: 0.01, step: 0.1 }), P.num('delay', 'Start delay (s)', 0, { min: 0 }), P.bool('repeat', 'Repeat', true), P.bool('autoStart', 'Start automatically', true)],
    init(n) { n.st.t = -U.num(n.p.delay); n.st.run = !!n.p.autoStart; n.st.count = 0; },
    onInput(n, port) { if (port === 'start') n.st.run = true; else if (port === 'stop') n.st.run = false; else if (port === 'reset') { n.st.t = -U.num(n.p.delay); n.st.count = 0; } },
    update(n, dt, g) { if (!n.st.run) return; n.st.t += dt; const iv = Math.max(0.005, U.num(n.p.interval, 1)); while (n.st.t >= iv) { n.st.t -= iv; n.st.count++; g.send(n, 'tick', n.st.count); if (!n.p.repeat) { n.st.run = false; break; } } } });

  B({ id: 'once', cat: 'triggers', label: 'Once', desc: 'Fires exactly one time, then stays silent until reset. "At start" fires after the delay when the game starts; "On first signal" lets only the first incoming signal through (a one-shot gate). Send "reset" to arm it again.',
    inputs: ['fire', 'reset'], outputs: ['out'], params: [P.sel('when', 'Fire', [['start', 'At game start'], ['signal', 'On first signal']]), P.num('delay', 'Delay (s)', 0, { min: 0, step: 0.1 })],
    init(n) { n.st.done = false; n.st.t = 0; n.st.pend = n.p.when === 'start'; },
    onInput(n, port, v, g) { if (port === 'reset') { n.st.done = false; n.st.t = 0; n.st.pend = n.p.when === 'start'; return; } if (n.st.done) return; if (U.num(n.p.delay) > 0) { n.st.pend = true; n.st.t = 0; n.st.val = v; return; } n.st.done = true; g.send(n, 'out', v === undefined ? 1 : v); },
    update(n, dt, g) { if (!n.st.pend || n.st.done) return; n.st.t += dt; if (n.st.t >= U.num(n.p.delay)) { n.st.pend = false; n.st.done = true; g.send(n, 'out', n.st.val === undefined ? 1 : n.st.val); } } });

  const btnOK = (p, b) => p === 'any' || (p === 'left' && b === 0) || (p === 'middle' && b === 1) || (p === 'right' && b === 2);
  B({ id: 'mouseClick', cat: 'triggers', label: 'Mouse Click', desc: 'Fires when the mouse (or a finger) is pressed, released or clicked – anywhere or on this object. Outputs the pointer position.',
    inputs: [], outputs: ['out', 'x', 'y'], params: [P.sel('button', 'Button', ['left', 'right', 'middle', 'any']), P.sel('phase', 'When', [['click', 'Click'], ['down', 'Press'], ['up', 'Release']]), P.sel('on', 'Where', [['anywhere', 'Anywhere'], ['self', 'On this object']])],
    init(n, g) { const ev = n.p.phase === 'down' ? 'mousedown' : n.p.phase === 'up' ? 'mouseup' : 'click'; n.cleanups.push(g.input.on(ev, (e) => { if (!btnOK(n.p.button, e.button) || !n.owner.alive || !n.owner.enabled) return; if (n.p.on === 'self' && !VXRT.hitObject(g, n.owner, e.sx, e.sy)) return; g.send(n, 'x', e.x); g.send(n, 'y', e.y); g.send(n, 'out', { x: e.x, y: e.y }); })); } });

  B({ id: 'mouseMove', cat: 'triggers', label: 'Mouse Move', desc: 'Fires while the pointer moves. Outputs world position (2D) or screen position (3D).',
    inputs: [], outputs: ['out', 'x', 'y'], params: [P.sel('when', 'When', [['always', 'Always'], ['pressed', 'Only while pressed (drag)']])],
    init(n, g) { n.cleanups.push(g.input.on('mousemove', (e) => { if (n.p.when === 'pressed' && !g.input.mouse.down) return; g.send(n, 'x', e.x); g.send(n, 'y', e.y); g.send(n, 'out', { x: e.x, y: e.y }); })); } });

  B({ id: 'mouseWheel', cat: 'triggers', label: 'Mouse Wheel', desc: 'Fires when the wheel scrolls. Output is the scroll amount (positive = down).',
    inputs: [], outputs: ['out', 'up', 'down'], params: [P.num('scale', 'Scale', 1)],
    init(n, g) { n.cleanups.push(g.input.on('wheel', (e) => { const v = e.delta * U.num(n.p.scale, 1); g.send(n, e.delta < 0 ? 'up' : 'down', Math.abs(v)); g.send(n, 'out', v); })); } });

  B({ id: 'gesture', cat: 'triggers', label: 'Gesture', desc: 'Touch gestures: swipes, tap, double tap and pinch (pinch outputs the scale factor).',
    inputs: [], outputs: ['out'], params: [P.sel('gesture', 'Gesture', ['swipeLeft', 'swipeRight', 'swipeUp', 'swipeDown', 'tap', 'doubleTap', 'pinch'])],
    init(n, g) { n.cleanups.push(g.input.on('gesture', (e) => { if (e.type === n.p.gesture) g.send(n, 'out', e.value ?? e); })); } });

  B({ id: 'lockedMouse', cat: 'triggers', label: 'Locked Mouse', desc: 'Captures the mouse pointer (like a first-person game) and emits movement deltas. Click the game to lock; press Esc to release.',
    inputs: ['lock', 'unlock'], outputs: ['out', 'dx', 'dy'], params: [P.num('sensitivity', 'Sensitivity', 1, { step: 0.1 }), P.bool('lockOnClick', 'Lock when clicked', true)],
    init(n, g) { const k = U.num(n.p.sensitivity, 1); n.cleanups.push(g.input.on('lockedmove', (e) => { g.send(n, 'dx', e.dx * k); g.send(n, 'dy', e.dy * k); g.send(n, 'out', { dx: e.dx * k, dy: e.dy * k }); })); if (n.p.lockOnClick) n.cleanups.push(g.input.on('mousedown', () => { if (!g.input.locked) g.input.lock(true); })); },
    onInput(n, port, v, g) { g.input.lock(port === 'lock'); } });

  B({ id: 'keyboard', cat: 'triggers', label: 'Keyboard', desc: 'Fires when a key is pressed, released or held. Use "any" for any key. Names: a-z, 0-9, space, arrowleft, enter, shift…',
    inputs: [], outputs: ['out'], params: [P.key('key', 'Key', 'space'), P.sel('mode', 'When', [['down', 'Pressed'], ['up', 'Released'], ['held', 'Held down (every frame)']])],
    init(n, g) { const k = VXRT.keyAlias(n.p.key); n.st.k = k; if (n.p.mode === 'held') return; const ev = n.p.mode === 'up' ? 'keyup' : 'keydown'; n.cleanups.push(g.input.on(ev, (e) => { if (e.repeat) return; if (k === 'any' || e.key === k || e.code === k) g.send(n, 'out', e.key); })); },
    update(n, dt, g) { if (n.p.mode !== 'held' || g.paused) return; const k = n.st.k; if (k === 'any' ? g.input.keys.size > 0 : g.input.keys.has(k)) g.send(n, 'out', dt); } });

  B({ id: 'controller', cat: 'triggers', label: 'Controller', desc: 'Gamepad buttons and sticks. Button index 0 = A/Cross, 1 = B/Circle, 2 = X, 3 = Y, 12-15 = D-pad. Axes 0/1 = left stick, 2/3 = right stick.',
    inputs: [], outputs: ['out'], params: [P.sel('type', 'Input', [['button', 'Button'], ['axis', 'Stick / axis']]), P.num('index', 'Index', 0, { min: 0, max: 20 }), P.sel('mode', 'Button mode', [['down', 'Pressed'], ['up', 'Released'], ['held', 'Held']]), P.num('deadzone', 'Dead zone', 0.15, { step: 0.05, min: 0, max: 1 })],
    init(n, g) { if (n.p.type === 'button' && n.p.mode !== 'held') n.cleanups.push(g.input.on('padbutton', (e) => { if (e.button === U.num(n.p.index) && e.down === (n.p.mode === 'down')) g.send(n, 'out', 1); })); },
    update(n, dt, g) { const pad = g.input.pad; if (!pad.connected) return; const i = U.num(n.p.index); if (n.p.type === 'axis') { const v = pad.axes[i] || 0; if (Math.abs(v) > U.num(n.p.deadzone, 0.15)) g.send(n, 'out', v); } else if (n.p.mode === 'held' && (pad.buttons[i] || 0) > 0.5) g.send(n, 'out', pad.buttons[i]); } });

  B({ id: 'collision', cat: 'triggers', label: 'Collision', desc: 'Fires when this object touches another one. "With" can be any, an object name, or tag:name. Outputs the other object\'s name and remembers it as "other".',
    inputs: [], outputs: ['out', 'other'], params: [P.text('with', 'Collides with', 'any', { hint: 'any, object name, or tag:name' }), P.sel('phase', 'When', [['enter', 'Starts touching'], ['stay', 'Keeps touching'], ['exit', 'Stops touching']])],
    init(n, g) { n.owner.wantsContacts = (n.owner.wantsContacts || 0) + 1; n.cleanups.push(g.on('collide:' + n.owner.id, (e) => { if (e.phase !== n.p.phase || !e.other || !MATCH(n.p.with, e.other)) return; n.owner.lastOther = e.other; g.send(n, 'other', e.other.name); g.send(n, 'out', e.other.name); })); n.cleanups.push(() => { n.owner.wantsContacts--; }); } });

  B({ id: 'inView', cat: 'triggers', label: 'In View', desc: 'Fires when this object enters or leaves the camera view (or every frame while visible).',
    inputs: [], outputs: ['out'], params: [P.sel('mode', 'When', [['enter', 'Enters view'], ['leave', 'Leaves view'], ['while', 'While in view']]), P.num('margin', 'Margin (px)', 0)],
    update(n, dt, g) { const v = VXRT.isInView(g, n.owner, U.num(n.p.margin)); const was = n.st.was; n.st.was = v; if (n.p.mode === 'while') { if (v) g.send(n, 'out', dt); } else if (n.p.mode === 'enter' ? v && was === false || (v && was === undefined) : !v && was === true) g.send(n, 'out', n.owner.name); } });

  B({ id: 'sensor', cat: 'triggers', label: 'Sensor', desc: 'Watches a property of an object and fires when a condition becomes true (e.g. y > 600, speed < 5, or var:health <= 0).',
    inputs: [], outputs: ['out'], params: [P.target(), P.text('property', 'Property', 'y', { hint: 'x, y, z, speed, alpha, rotation, vx, vy… or var:name for object variable, or global:name' }), P.sel('op', 'Condition', ['>', '<', '>=', '<=', '==', '!=']), P.num('value', 'Value', 0), P.sel('mode', 'Fire', [['edge', 'When it becomes true'], ['while', 'Every frame while true']])],
    update(n, dt, g) { const o = g.targets(n.p.target, n.owner, n.owner.lastOther)[0]; if (!o) return; const pr = String(n.p.property); const raw = pr.startsWith('var:') ? o.vars[pr.slice(4)] : pr.startsWith('global:') ? g.vars[pr.slice(7)] : g.getProp(o, pr); const a = U.num(raw), b = U.num(n.p.value); const r = { '>': a > b, '<': a < b, '>=': a >= b, '<=': a <= b, '==': a === b, '!=': a !== b }[n.p.op]; if (r && (n.p.mode === 'while' || !n.st.was)) g.send(n, 'out', a); n.st.was = r; } });

  B({ id: 'mailbox', cat: 'triggers', label: 'Mailbox', desc: 'Receives messages sent by a Message block (or script) on a channel. Output is the message payload.',
    inputs: [], outputs: ['out', 'sender'], params: [P.text('channel', 'Channel', 'hello', { hint: 'Leave empty to receive every message' })],
    init(n, g) { const h = (m) => { if (n.p.channel && m.channel !== n.p.channel) return; g.send(n, 'sender', m.sender || ''); g.send(n, 'out', m.payload); }; n.cleanups.push(g.on('msg:' + n.owner.id, h), g.on('msg:*', h)); } });

  B({ id: 'custom', cat: 'triggers', label: 'Custom Trigger', desc: 'Your own trigger. Either listen for a named game event (emitted by scripts with fire("name")), or write JS that calls fire(value) whenever you like. The code may return a cleanup function.',
    inputs: [], outputs: ['out'], params: [P.text('event', 'Event name', '', { hint: 'Fires when game.emit("custom:NAME") / fire("NAME") happens' }), P.code('code', 'Setup code', '// fire(value) sends a signal. Example:\n// const id = setInterval(() => fire(Math.random()), 1000);\n// return () => clearInterval(id);')],
    init(n, g) { const fire = (v) => g.send(n, 'out', v); if (n.p.event) n.cleanups.push(g.on('custom:' + n.p.event, fire)); const src = String(n.p.code || '').replace(/^\s*\/\/.*$/gm, '').trim(); if (src) { try { const r = new Function('fire', 'self', 'game', 'input', n.p.code)(fire, n.owner, g, g.input); if (typeof r === 'function') n.cleanups.push(r); } catch (e) { g.nodeError(n, e); } } } });
})();
