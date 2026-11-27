/** @vx-plugin {"id":"block-extras","name":"Block Extras","version":"1.2.0","description":"Extra logic blocks that Vextra Studio does not already have: Clamp, Wrap, Map Range, Round, Counter, Cooldown, Random Color, Stopwatch, Smooth and Typewriter."} */
/** @vx-docs
 * ## Using Block Extras
 * Open a game, switch to **Logic** and look for the **Plugins** category in the block palette.
 *
 * - **Clamp** – limits a number between *Min* and *Max*.
 * - **Wrap** – loops a number around a range (angles, endless scrolling).
 * - **Map Range** – converts a number from one range to another (health 0–100 → bar 0–1).
 * - **Round** – rounds, floors or ceils to a number of decimals.
 * - **Counter** – counts up / down with reset and a target that fires `reached`.
 * - **Cooldown** – lets a signal through, then ignores new ones for a few seconds.
 * - **Random Color** – a random bright colour as `#rrggbb` text.
 * - **Stopwatch** – counts seconds (start / stop / reset).
 * - **Smooth** – glides toward the latest number instead of jumping.
 * - **Typewriter** – types text out one letter at a time.
 *
 * ### Already built in
 * Coin Flip, Alternate, Sequencer, In Range and Random Pick were removed in 1.2.0 because Vextra Studio already has them: **Random** (Chance mode), **Toggle Switch**, **Router** (Round robin), **Filter** (Between) and **List Order** (Random item).
 *
 * ### Demo videos
 * Every block above has a short demo clip in its documentation page. For your own plugin blocks add `demo: { video: 'https://example.com/clip.webm', caption: 'What it shows' }` (an https or local `.webm` / `.mp4` link) and the clip appears in **Docs → Blocks** and on your plugin's page.
 *
 * ### Writing your own
 * Blocks registered with `vx.game.registerBlock` must be **self-contained**: their functions are copied as text into exported games, so they cannot use variables from the plugin file. Use only what the function receives:
 * `onInput(node, port, value, game)` – `node.p` holds the settings, `game.send(node, 'port', value)` sends a signal.
 */
vx.game.registerBlock({
  id: 'clampnum', label: 'Clamp', cat: 'plugins', desc: 'Limits a number to a range.',
  inputs: ['in'], outputs: ['out'], params: [{ key: 'min', label: 'Min', type: 'number', def: 0 }, { key: 'max', label: 'Max', type: 'number', def: 1 }],
  onInput(n, port, v, g) { const a = parseFloat(n.p.min) || 0, b = parseFloat(n.p.max); g.send(n, 'out', Math.max(a, Math.min(Number.isFinite(b) ? b : 1, parseFloat(v) || 0))); },
});

/* ---------------- v1.1 – more blocks ---------------- */
vx.game.registerBlock({
  id: 'wrapnum', label: 'Wrap', cat: 'plugins', desc: 'Loops a number around a range: with Min 0 and Max 360, 370 becomes 10 and -10 becomes 350.',
  inputs: ['in'], outputs: ['out'], params: [{ key: 'min', label: 'Min', type: 'number', def: 0 }, { key: 'max', label: 'Max', type: 'number', def: 360 }],
  onInput(n, port, v, g) { const a = parseFloat(n.p.min) || 0, b = parseFloat(n.p.max), w = (Number.isFinite(b) ? b : 360) - a; const x = parseFloat(v) || 0; g.send(n, 'out', w > 0 ? a + (((x - a) % w) + w) % w : a); },
});
vx.game.registerBlock({
  id: 'mapnum', label: 'Map Range', cat: 'plugins', desc: 'Converts a number from one range to another, e.g. health 0–100 into a bar 0–1. Tick Clamp to stop it going outside the new range.',
  inputs: ['in'], outputs: ['out'], params: [{ key: 'inMin', label: 'From min', type: 'number', def: 0 }, { key: 'inMax', label: 'From max', type: 'number', def: 100 }, { key: 'outMin', label: 'To min', type: 'number', def: 0 }, { key: 'outMax', label: 'To max', type: 'number', def: 1 }, { key: 'clamp', label: 'Clamp', type: 'bool', def: true }],
  onInput(n, port, v, g) { const f = (k, d) => { const x = parseFloat(n.p[k]); return Number.isFinite(x) ? x : d; }; const a = f('inMin', 0), b = f('inMax', 100), c = f('outMin', 0), d = f('outMax', 1); let t = b === a ? 0 : ((parseFloat(v) || 0) - a) / (b - a); if (n.p.clamp) t = Math.max(0, Math.min(1, t)); g.send(n, 'out', c + (d - c) * t); },
});
vx.game.registerBlock({
  id: 'roundnum', label: 'Round', cat: 'plugins', desc: 'Rounds a number to a fixed number of decimals – nearest, always down or always up.',
  inputs: ['in'], outputs: ['out'], params: [{ key: 'mode', label: 'Mode', type: 'select', options: [['round', 'Nearest'], ['floor', 'Down'], ['ceil', 'Up']], def: 'round' }, { key: 'decimals', label: 'Decimals', type: 'number', def: 0 }],
  onInput(n, port, v, g) { const k = Math.pow(10, Math.max(0, Math.min(8, parseInt(n.p.decimals) || 0))); const f = n.p.mode === 'floor' ? Math.floor : n.p.mode === 'ceil' ? Math.ceil : Math.round; g.send(n, 'out', f((parseFloat(v) || 0) * k) / k); },
});
vx.game.registerBlock({
  id: 'counter', label: 'Counter', cat: 'plugins', desc: 'Counts signals. "in" / "up" add Step, "down" subtracts, "reset" goes back to Start. "reached" fires once when the Target is hit (leave Target empty for none).',
  inputs: ['in', 'up', 'down', 'reset'], outputs: ['out', 'reached'], params: [{ key: 'start', label: 'Start', type: 'number', def: 0 }, { key: 'step', label: 'Step', type: 'number', def: 1 }, { key: 'target', label: 'Target (optional)', type: 'text', def: '' }],
  init(n) { n.st.v = parseFloat(n.p.start) || 0; },
  onInput(n, port, v, g) { const st = parseFloat(n.p.step); const s = Number.isFinite(st) ? st : 1; if (port === 'reset') { n.st.v = parseFloat(n.p.start) || 0; n.st.done = false; } else n.st.v += port === 'down' ? -s : s; g.send(n, 'out', n.st.v); const t = parseFloat(n.p.target); if (Number.isFinite(t) && String(n.p.target).trim() !== '' && !n.st.done && (s >= 0 ? n.st.v >= t : n.st.v <= t) && port !== 'reset') { n.st.done = true; g.send(n, 'reached', n.st.v); } },
});
vx.game.registerBlock({
  id: 'cooldown', label: 'Cooldown', cat: 'plugins', desc: 'Lets a signal through, then ignores new ones for a number of seconds (shooting speed, button spam). Ignored signals leave through "blocked".',
  inputs: ['in'], outputs: ['out', 'blocked'], params: [{ key: 'seconds', label: 'Wait (seconds)', type: 'number', def: 1 }],
  onInput(n, port, v, g) { const w = parseFloat(n.p.seconds); if (n.st.until !== undefined && g.time < n.st.until) { g.send(n, 'blocked', v); return; } n.st.until = g.time + (Number.isFinite(w) ? w : 1); g.send(n, 'out', v); },
});
vx.game.registerBlock({
  id: 'randomcolor', label: 'Random Color', cat: 'plugins', desc: 'Sends a random bright colour as text like #3fb950 – feed it to a Colors block.',
  inputs: ['in'], outputs: ['out'], params: [{ key: 'bright', label: 'Brightness (0–100)', type: 'number', def: 60 }],
  onInput(n, port, v, g) { const h = Math.random() * 360, l = Math.max(10, Math.min(90, parseFloat(n.p.bright) || 60)) / 100, a = 0.9 * Math.min(l, 1 - l); const f = (k) => { const m = (k + h / 30) % 12, c = l - a * Math.max(-1, Math.min(m - 3, 9 - m, 1)); return ('0' + Math.round(c * 255).toString(16)).slice(-2); }; g.send(n, 'out', '#' + f(0) + f(8) + f(4)); },
});
vx.game.registerBlock({
  id: 'stopwatch', label: 'Stopwatch', cat: 'plugins', desc: 'Counts seconds while running. "start" / "stop" / "reset"; "out" sends the time every frame while running (or tick Auto start). "stopped" sends the final time.',
  inputs: ['start', 'stop', 'reset'], outputs: ['out', 'stopped'], params: [{ key: 'auto', label: 'Auto start', type: 'bool', def: false }, { key: 'decimals', label: 'Decimals', type: 'number', def: 1 }],
  init(n) { n.st.t = 0; n.st.on = !!n.p.auto; },
  onInput(n, port, v, g) { if (port === 'start') n.st.on = true; else if (port === 'stop') { n.st.on = false; g.send(n, 'stopped', n.st.t); } else { n.st.t = 0; g.send(n, 'out', 0); } },
  update(n, dt, g) { if (!n.st.on) return; n.st.t += dt; const k = Math.pow(10, Math.max(0, Math.min(3, parseInt(n.p.decimals) || 0))); g.send(n, 'out', Math.round(n.st.t * k) / k); },
});
vx.game.registerBlock({
  id: 'smoothnum', label: 'Smooth', cat: 'plugins', desc: 'Glides toward the newest number instead of jumping – smooth bars, camera follow, fading values. Higher Speed = quicker.',
  inputs: ['in'], outputs: ['out'], params: [{ key: 'speed', label: 'Speed', type: 'number', def: 4 }],
  onInput(n, port, v) { n.st.to = parseFloat(v) || 0; if (n.st.cur === undefined) n.st.cur = 0; },
  update(n, dt, g) { if (n.st.to === undefined || n.st.cur === n.st.to) return; const k = 1 - Math.exp(-(parseFloat(n.p.speed) || 4) * dt); n.st.cur += (n.st.to - n.st.cur) * k; if (Math.abs(n.st.to - n.st.cur) < 0.001) n.st.cur = n.st.to; g.send(n, 'out', Math.round(n.st.cur * 1000) / 1000); },
});
vx.game.registerBlock({
  id: 'typewriter', label: 'Typewriter', cat: 'plugins', desc: 'Types text out one letter at a time (dialogue, intros). Fill Text, or leave it empty and send the text into "in"; "out" gets the growing text, "done" the full text when finished.',
  inputs: ['in'], outputs: ['out', 'done'], params: [{ key: 'text', label: 'Text (empty = use the incoming text)', type: 'text', def: 'Hello, traveller!' }, { key: 'cps', label: 'Letters per second', type: 'number', def: 18 }],
  onInput(n, port, v) { const t = String(n.p.text || ''); n.st.full = t ? t : typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v); n.st.pos = 0; n.st.on = true; },
  update(n, dt, g) { if (!n.st.on) return; n.st.pos += dt * (parseFloat(n.p.cps) || 18); const k = Math.min(n.st.full.length, Math.floor(n.st.pos)); if (k !== n.st.k) { n.st.k = k; g.send(n, 'out', n.st.full.slice(0, k)); } if (k >= n.st.full.length) { n.st.on = false; g.send(n, 'done', n.st.full); } },
});
