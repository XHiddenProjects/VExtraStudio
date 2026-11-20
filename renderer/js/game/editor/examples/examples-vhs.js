/* Night Shift: Tape 07 – a first-person found-footage horror game seen through a VHS camcorder.
 *   Intro cutscene → 1 Lobby → cutscene → 2 Basement → cutscene → 3 Rooftop → ending cutscene.
 *   Objective each level: collect the fuse cards, reach the exit. Something hunts you by sound; your flashlight keeps it away, but it drains the battery.
 *   Everything is blocks (Logic tab) and procedural geometry with PBR "Realism" materials – there are no image or model files. */
(function () {
  const K = VX.exKit, PH = K.PH;
  const add = (p, ...a) => K.add(p, '3d', ...a);
  const stat = (e) => PH('static', Object.assign({ friction: 0.2 }, e));
  const C = 4; // cell size in metres

  /* ------------------------------------------------------------ materials + sounds */
  function materials(p) {
    const R = (n, o) => K.mat(p, n, Object.assign({ realism: true, envIntensity: 0.6, detail: 0.6 }, o));
    return {
      wall: R('Concrete', { color: '#6d7072', roughness: 0.95, metalness: 0 }),
      wallDark: R('Basement brick', { color: '#4a3c36', roughness: 0.95, metalness: 0, pattern: 'bricks', color2: '#2e2420' }),
      floor: R('Wet tile', { color: '#2b2f33', roughness: 0.22, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.12, detail: 0.3 }),
      carpet: R('Worn carpet', { color: '#3b2a33', roughness: 1, metalness: 0, detail: 0.9 }),
      roof: R('Roof gravel', { color: '#4a4b4c', roughness: 1, metalness: 0, detail: 1 }),
      ceiling: R('Ceiling tile', { color: '#8a8c8b', roughness: 0.9, metalness: 0 }),
      wood: R('Desk wood', { color: '#5b3a22', roughness: 0.55, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
      steel: R('Brushed steel', { color: '#aeb4ba', roughness: 0.38, metalness: 1, clearcoat: 0.2 }),
      rust: R('Rusty metal', { color: '#6b3b24', roughness: 0.7, metalness: 0.8, detail: 1 }),
      plastic: R('Black plastic', { color: '#17191b', roughness: 0.4, metalness: 0.1, clearcoat: 0.5 }),
      glass: R('Dirty glass', { color: '#9fb6bb', roughness: 0.08, metalness: 0, transmission: 0.7, ior: 1.45, thickness: 0.1, opacity: 1 }),
      screen: R('CRT screen', { color: '#0b2a1c', roughness: 0.2, metalness: 0, emissive: '#2cff9a', emissiveIntensity: 1.3 }),
      lamp: R('Lamp panel', { color: '#fff4d6', roughness: 0.5, metalness: 0, emissive: '#fff0c0', emissiveIntensity: 2.2 }),
      redLed: R('Red LED', { color: '#300', roughness: 0.4, metalness: 0, emissive: '#ff2a1a', emissiveIntensity: 3 }),
      card: R('Fuse card', { color: '#ffb02e', roughness: 0.4, metalness: 0.3, emissive: '#ff8a00', emissiveIntensity: 1.6 }),
      battery: R('Battery', { color: '#34d17a', roughness: 0.3, metalness: 0.5, emissive: '#1fe06e', emissiveIntensity: 1.4 }),
      paper: R('Paper note', { color: '#e8e0c6', roughness: 0.9, metalness: 0, emissive: '#6d6850', emissiveIntensity: 0.5 }),
      skin: R('Shadow', { color: '#050506', roughness: 0.6, metalness: 0 }),
      eye: R('Eye', { color: '#400', roughness: 0.3, metalness: 0, emissive: '#ff1d12', emissiveIntensity: 4 }),
      beacon: R('Beacon', { color: '#400', roughness: 0.3, metalness: 0, emissive: '#ff5a2a', emissiveIntensity: 3 }),
      moon: R('Moon', { color: '#dfe8ff', roughness: 1, metalness: 0, emissive: '#cfe0ff', emissiveIntensity: 1.5 }),
      win: R('Lit window', { color: '#ffe9a8', roughness: 0.6, metalness: 0, emissive: '#ffd36a', emissiveIntensity: 1.8 }),
      dark: R('Dark facade', { color: '#14181d', roughness: 0.8, metalness: 0.1 }),
    };
  }
  function sounds(p) {
    K.synth(p, 'pick', 'square', 620, 1240, 0.18, 0.3); K.synth(p, 'sting', 'saw', 420, 55, 0.9, 0.55); K.synth(p, 'door', 'saw', 180, 60, 0.7, 0.35);
    K.synth(p, 'click', 'square', 900, 500, 0.05, 0.25); K.synth(p, 'hum', 'sine', 55, 55, 2, 0.12); K.synth(p, 'heart', 'sine', 70, 38, 0.28, 0.5);
    K.synth(p, 'clear', 'square', 330, 1320, 0.9, 0.3); K.synth(p, 'beep', 'square', 880, 880, 0.12, 0.2);
  }

  /* ------------------------------------------------------------ small model builders (every prop is several parts with different materials) */
  const part = (p, M, name, x, y, z, w, h, d, mat, extra) => add(p, 'cube', name, x, y, Object.assign({ z, w, h, d, color: '#888888', matAsset: M[mat] }, extra || {}));
  const solid = (p, M, name, x, y, z, w, h, d, mat, extra) => part(p, M, name, x, y, z, w, h, d, mat, Object.assign({ physics: stat() }, extra || {}));
  const cyl = (p, M, name, x, y, z, w, h, mat, extra) => add(p, 'cylinder', name, x, y, Object.assign({ z, w, h, d: w, color: '#888888', matAsset: M[mat] }, extra || {}));

  function desk(p, M, x, z, rot) {
    solid(p, M, 'Desk top', x, 0.76, z, 1.9, 0.08, 0.85, 'wood', { rotY: rot }); solid(p, M, 'Desk drawers', x + 0.65, 0.38, z, 0.5, 0.72, 0.8, 'wood');
    for (const [dx, dz] of [[-0.85, -0.36], [-0.85, 0.36]]) part(p, M, 'Desk leg', x + dx, 0.38, z + dz, 0.07, 0.74, 0.07, 'steel');
    part(p, M, 'Monitor base', x - 0.3, 0.84, z, 0.3, 0.05, 0.22, 'plastic'); part(p, M, 'Monitor', x - 0.3, 1.1, z, 0.62, 0.48, 0.42, 'plastic'); part(p, M, 'Monitor screen', x - 0.3, 1.1, z + 0.22, 0.52, 0.38, 0.02, 'screen');
    part(p, M, 'Keyboard', x - 0.3, 0.82, z + 0.34, 0.5, 0.03, 0.17, 'plastic'); part(p, M, 'Desk lamp base', x + 0.5, 0.82, z - 0.1, 0.16, 0.03, 0.16, 'steel');
  }
  function chair(p, M, x, z) { part(p, M, 'Chair seat', x, 0.5, z, 0.5, 0.08, 0.5, 'plastic'); part(p, M, 'Chair back', x, 0.82, z - 0.24, 0.5, 0.6, 0.07, 'plastic'); cyl(p, M, 'Chair stem', x, 0.24, z, 0.08, 0.5, 'steel'); part(p, M, 'Chair base', x, 0.04, z, 0.55, 0.05, 0.08, 'steel'); part(p, M, 'Chair base', x, 0.04, z, 0.08, 0.05, 0.55, 'steel'); }
  function barrel(p, M, x, z) { solid(p, M, 'Barrel', x, 0.55, z, 0.8, 1.1, 0.8, 'rust', { shape: 'cylinder' }); cyl(p, M, 'Barrel ring', x, 0.3, z, 0.86, 0.06, 'steel'); cyl(p, M, 'Barrel ring', x, 0.8, z, 0.86, 0.06, 'steel'); cyl(p, M, 'Barrel lid', x, 1.12, z, 0.7, 0.04, 'steel'); }
  function vending(p, M, x, z) { solid(p, M, 'Vending machine', x, 1, z, 1, 2, 0.85, 'rust'); part(p, M, 'Vending window', x, 1.25, z + 0.43, 0.75, 1, 0.03, 'win'); part(p, M, 'Vending glass', x, 1.25, z + 0.45, 0.78, 1.02, 0.02, 'glass'); part(p, M, 'Vending slot', x, 0.35, z + 0.43, 0.5, 0.18, 0.04, 'plastic'); part(p, M, 'Vending keypad', x + 0.36, 1.3, z + 0.45, 0.12, 0.3, 0.03, 'redLed'); }
  function generator(p, M, x, z) { solid(p, M, 'Generator', x, 0.7, z, 1.6, 1.4, 1, 'rust'); part(p, M, 'Generator panel', x, 0.9, z + 0.52, 1.1, 0.5, 0.03, 'steel'); part(p, M, 'Generator led', x - 0.4, 1.1, z + 0.55, 0.08, 0.08, 0.03, 'redLed'); cyl(p, M, 'Generator pipe', x + 0.5, 1.7, z, 0.18, 0.6, 'steel'); }
  function shelf(p, M, x, z) { for (const y of [0.3, 0.9, 1.5]) solid(p, M, 'Shelf board', x, y, z, 1.8, 0.05, 0.5, 'steel'); for (const dx of [-0.88, 0.88]) part(p, M, 'Shelf post', x + dx, 0.9, z, 0.05, 1.8, 0.5, 'steel'); for (let i = 0; i < 5; i++) part(p, M, 'Box', x - 0.7 + i * 0.35, 0.5 + (i % 3) * 0.6, z, 0.28, 0.3, 0.36, 'paper'); }
  function crates(p, M, x, z) { solid(p, M, 'Crate', x, 0.45, z, 0.9, 0.9, 0.9, 'wood'); solid(p, M, 'Crate', x + 0.95, 0.35, z + 0.15, 0.7, 0.7, 0.7, 'wood'); solid(p, M, 'Crate', x + 0.2, 1.2, z, 0.7, 0.6, 0.7, 'wood', { rotY: 20 }); }
  function pillar(p, M, x, z, h) { solid(p, M, 'Pillar', x, h / 2, z, 0.9, h, 0.9, 'wall'); }
  function pipeRun(p, M, x, z, len, axis) { cyl(p, M, 'Pipe', x, 3.3, z, 0.25, len, 'rust', { rotZ: axis === 'x' ? 90 : 0, rotX: axis === 'z' ? 90 : 0 }); }
  function antenna(p, M, x, z) { solid(p, M, 'Antenna base', x, 0.3, z, 1.2, 0.6, 1.2, 'steel'); cyl(p, M, 'Antenna mast', x, 3.5, z, 0.12, 6, 'steel'); part(p, M, 'Antenna arm', x, 5, z, 1.6, 0.05, 0.05, 'steel'); part(p, M, 'Antenna arm', x, 4.2, z, 1.2, 0.05, 0.05, 'steel'); part(p, M, 'Antenna light', x, 6.6, z, 0.18, 0.18, 0.18, 'redLed'); }

  /* ------------------------------------------------------------ behaviours (blocks) */
  const flicker = (p) => K.bhv(p, 'Lamp – flicker', ({ block }) => {
    const tick = block('timer', { interval: 0.17, delay: 0, repeat: true, autoStart: true }), r = block('random', { mode: 'chance', chance: 0.09 }), off = block('light', { target: 'self', mode: 'set', intensity: '0.12' }), on = block('light', { target: 'self', mode: 'set', intensity: '1' }), back = block('timer', { interval: 0.1, delay: 0, repeat: false, autoStart: false });
    tick.to(r, 'tick', 'in'); r.to(off, 'yes'); r.to(back, 'yes', 'start'); back.to(on, 'tick');
  });
  const spinB = (p) => K.bhv(p, 'Pickup – spin', ({ block, start }) => { start().to(block('spin', { target: 'self', mode: 'set', speed: 70, axis: 'y' })); });
  const noteB = (p, text) => K.bhv(p, 'Note – ' + text.slice(0, 18), ({ block, start }) => {
    const l = block('label', { id: 'note', text, anchor: 'center', size: 20, color: '#f4efd6', bg: 'rgba(0,0,0,0.65)', y: 80 }), n = block('proximity', { target: 'tag:player', radius: 2.4, mode: 'enter' }), f = block('proximity', { target: 'tag:player', radius: 2.4, mode: 'leave' });
    start().to(l, 'out', 'hide'); n.to(l, 'out', 'show'); f.to(l, 'out', 'hide');
  });

  /** the whole game state for one level: variables, HUD, clock, win/lose */
  function rules(p, tag, need, objective, nextDelay) {
    return K.bhv(p, 'Rules & HUD – ' + tag, ({ block, gv, ex, lab, start, put, flt, snd, key }) => {
      for (const [n, v] of [['state', 0], ['fuses', 0], ['battery', 100], ['flash', 0], ['s0', 0], ['s1', 0], ['mm', 0], ['alert', 0]]) { gv(n, 'set', v, v); start().to(put(n, 'set', v)); }
      gv('need', 'set', need, need); start().to(put('need', 'set', need));
      const mono = { bold: true };
      const L = (id, text, anchor, size, color, y, x, extra) => block('label', Object.assign({ id, text, anchor, size, color, y: y || 0, x: x || 0 }, mono, extra || {}));
      const rec = L('rec', '● REC', 'topLeft', 24, '#ff3b30', 16, 18), tc = L('tc', '{mm}:{s1}{s0}', 'topLeft', 24, '#eaffea', 16, 110);
      const blink = block('timer', { interval: 1, delay: 0, repeat: true, autoStart: true }), blink2 = block('timer', { interval: 1, delay: 0.5, repeat: true, autoStart: true }); blink.to(rec, 'tick', 'show'); blink2.to(rec, 'tick', 'hide');
      L('mode', 'SP', 'topLeft', 18, '#eaffea', 22, 205); L('date', 'NOV 12 1999   03:42 AM', 'bottomRight', 18, '#eaffea', 16, 16);
      L('batt', 'BATTERY {battery}%', 'topRight', 22, '#eaffea', 16, 16, {}); L('obj', 'OBJECTIVE  ' + objective + '   {fuses} / {need}', 'bottomLeft', 20, '#ffe9a8', 16, 16);
      L('help', 'WASD move · Shift run · F flashlight · mouse look', 'bottom', 15, '#a7c9b1', 52, 0);
      const dead = L('dead', 'SIGNAL LOST – click to retry', 'center', 34, '#ffd7d7', 0, 0, { bg: 'rgba(0,0,0,0.7)' }), clear = L('clear', 'AREA CLEAR', 'center', 40, '#ffffff', 0, 0, { bg: 'rgba(0,0,0,0.55)' });
      start().to(dead, 'out', 'hide'); start().to(clear, 'out', 'hide');
      /* clock */
      const t = block('timer', { interval: 1, delay: 0, repeat: true, autoStart: true }), live = ex('state == 0', 'Playing?'), ok = flt('truthy');
      t.to(live, 'tick', 'in'); live.to(ok); const s0 = put('s0', 'add', 1); ok.to(s0, 'pass'); const w1 = ex('s0 >= 10', 'Ten seconds?'), f1 = flt('truthy'); s0.to(w1); w1.to(f1);
      const r0 = put('s0', 'set', 0), a1 = put('s1', 'add', 1); f1.to(r0, 'pass'); f1.to(a1, 'pass'); const w2 = ex('s1 >= 6', 'A minute?'), f2 = flt('truthy'); a1.to(w2); w2.to(f2); f2.to(put('s1', 'set', 0), 'pass'); f2.to(put('mm', 'add', 1), 'pass');
      /* battery drains while the flashlight is on */
      const bt = block('timer', { interval: 0.6, delay: 0, repeat: true, autoStart: true }), on = ex('flash > 0', 'Light on?'), ft = flt('truthy'); bt.to(on, 'tick', 'in'); on.to(ft); const dr = put('battery', 'subtract', 1); ft.to(dr, 'pass');
      const emp = ex('battery <= 0 && flash > 0', 'Battery empty?'), fe = flt('truthy'); dr.to(emp); emp.to(fe); fe.to(put('flash', 'set', 0), 'pass'); fe.to(snd('click'), 'pass');
      /* win / lose */
      const when = (name, op, v) => block('sensor', { target: 'self', property: 'global:' + name, op, value: v, mode: 'edge' });
      const lose = when('state', '==', 1); lose.to(dead, 'out', 'show'); lose.to(snd('sting'));
      const win = when('state', '==', 2); win.to(clear, 'out', 'show'); win.to(snd('clear')); win.to(block('loadLevel', { level: 'next', delay: nextDelay || 1.6 }));
      block('mouseClick', { phase: 'click' }).to(ex('state == 1', 'Caught?')).to(flt('truthy')).to(block('restartGame', { scope: 'scene' }), 'pass');
      start().to(block('sound', { sound: 'snd_hum', volume: 0.5, loop: true }));
    });
  }

  /** first-person player: move, run, flashlight, pickups */
  function player(p) {
    return K.bhv(p, 'Player – move, look, flashlight', ({ block, gv, ex, put, flt, snd, start, key }) => {
      start().to(block('camera', { action: 'mode3d', mode: 'fps', target: 'Player', eye: 0.62, distance: 0 }));
      block('lockedMouse', { sensitivity: 1, lockOnClick: true }).to(block('camera', { action: 'look', sensitivity: 0.12 }));
      gv('speed', 'set', 4, 4); start().to(put('speed', 'set', 4)); key('shift', 'down').to(put('speed', 'set', 6.6)); key('shift', 'up').to(put('speed', 'set', 4));
      block('always', {}).to(block('velocity', { target: 'self', mode: 'set', x: '0', z: '0', space: 'world' }, 'Stand still'));
      const go = (k, expr, src) => key(k, 'held').to(ex(expr, 'Move')).to(block('velocity', { target: 'self', mode: 'add', source: src, space: 'camera' }));
      for (const k of ['w', 'arrowup']) go(k, '-speed * (state == 0)', 'signalZ'); for (const k of ['s', 'arrowdown']) go(k, 'speed * (state == 0)', 'signalZ');
      for (const k of ['d', 'arrowright']) go(k, 'speed * (state == 0)', 'signalX'); for (const k of ['a', 'arrowleft']) go(k, '-speed * (state == 0)', 'signalX');
      block('makeNoise', { source: 'self', radius: 7, footsteps: true, stepSpeed: 1.5, stepRadius: 6, stepEvery: 0.42 }, 'Footsteps');
      /* flashlight: F toggles while there is battery */
      const f = key('f', 'down'), can = ex('battery > 0 && state == 0', 'Has battery?'), ok = flt('truthy'); f.to(can); can.to(ok); const tog = block('globalVariable', { name: 'flash', op: 'toggle', amount: 1, initial: 0 }); ok.to(tog, 'pass'); ok.to(snd('click'), 'pass');
      const lamp = block('sensor', { target: 'self', property: 'global:flash', op: '>', value: 0, mode: 'edge' }), lampOff = block('sensor', { target: 'self', property: 'global:flash', op: '<=', value: 0, mode: 'edge' });
      lamp.to(block('light', { target: 'tag:flashlight', mode: 'set', intensity: '1.6' })); lampOff.to(block('light', { target: 'tag:flashlight', mode: 'set', intensity: '0' }));
      /* pickups */
      const card = block('proximity', { target: 'tag:fuse', radius: 1.5, mode: 'enter' }, 'Fuse card in reach'); card.to(block('emit', { target: 'other', count: 16, color: '#ffb02e', speed: 4, spread: 360, life: 0.6, size: 0.12, gravity: 0 }), 'out', 'emit'); card.to(block('destroyer', { target: 'other' })); card.to(snd('pick')); card.to(put('fuses', 'add', 1));
      const bat = block('proximity', { target: 'tag:battery', radius: 1.5, mode: 'enter' }, 'Battery in reach'); bat.to(block('destroyer', { target: 'other' })); bat.to(snd('pick')); bat.to(put('battery', 'set', 100));
      /* heartbeat when the hunter is close */
      const near = block('proximity', { target: 'tag:enemy', radius: 11, mode: 'while' }); const beat = block('timer', { interval: 0.8, delay: 0, repeat: true, autoStart: false }); near.to(beat, 'near', 'start'); near.to(beat, 'far', 'stop'); beat.to(snd('heart', 0.8), 'tick');
    });
  }

  /** the thing that hunts you: it listens, the flashlight makes it flinch */
  function stalker(p, speed) {
    return K.bhv(p, 'The Watcher – hears you', ({ block, ex, put, flt, start, snd }) => {
      const ears = block('hearing', { range: 1.2, chase: true, speed, stopAt: 1.2, memory: 6, face: true, faceOffset: 0, flat: true }, 'Ears'); ears.to(put('alert', 'set', 1), 'heard'); ears.to(put('alert', 'set', 0), 'lost');
      const over = block('sensor', { target: 'self', property: 'global:state', op: '>', value: 0, mode: 'edge' }); over.to(ears, 'out', 'disable'); over.to(block('velocity', { target: 'self', mode: 'set', x: '0', z: '0' }));
      block('proximity', { target: 'tag:player', radius: 1.6, mode: 'enter' }).to(ex('state == 0', 'Still playing?')).to(flt('truthy')).to(put('state', 'set', 1), 'pass');
      /* the flashlight stuns it for a few seconds */
      const lit = block('proximity', { target: 'tag:player', radius: 7, mode: 'enter' }), chk = ex('flash > 0 && state == 0', 'Light on and close?'), fl = flt('truthy'), wake = block('timer', { interval: 2.8, delay: 0, repeat: false, autoStart: false });
      lit.to(chk); chk.to(fl); fl.to(ears, 'pass', 'disable'); fl.to(block('velocity', { target: 'self', mode: 'set', x: '0', z: '0' }), 'pass'); fl.to(wake, 'pass', 'start'); fl.to(snd('sting', 0.5), 'pass'); wake.to(ears, 'tick', 'enable');
    });
  }
  function exitB(p, label) {
    return K.bhv(p, 'Exit – ' + label, ({ block, ex, put, flt, snd, start }) => {
      const hint = block('label', { id: 'exithint', text: 'Locked – you need {need} fuse cards ({fuses} found)', anchor: 'center', size: 22, color: '#ffd7a0', bg: 'rgba(0,0,0,0.6)', y: 90 });
      start().to(hint, 'out', 'hide'); const near = block('proximity', { target: 'tag:player', radius: 3.4, mode: 'enter' }), far = block('proximity', { target: 'tag:player', radius: 3.4, mode: 'leave' }); const have = ex('fuses >= need', 'Enough fuse cards?'), f = flt('truthy');
      near.to(have); have.to(f); f.to(put('state', 'set', 2), 'pass'); f.to(snd('door'), 'pass'); f.to(hint, 'fail', 'show'); far.to(hint, 'out', 'hide');
    });
  }

  /* ------------------------------------------------------------ level builder from a text map */
  function level(p, M, cfg) {
    const sc = K.newScene(p, cfg.name, cfg.bg, '3d'); sc.gravity = { x: 0, y: -25, z: 0 };
    const rows = cfg.map, H = rows.length, W = rows[0].length, at = (c, r) => [(c - (W - 1) / 2) * C, (r - (H - 1) / 2) * C];
    K.sky(p, cfg.sun, cfg.sky + 0.12);
    const wallMat = M[cfg.wall]; const lights = [], fuseAt = [], batAt = [], noteAt = []; let start = [0, 0], enemy = [0, 0], exit = [0, 0];
    const flick = flicker(p), spin = spinB(p); let noteN = 0;
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      const [x, z] = at(c, r);
      if (ch === '#') { add(p, 'cube', 'Wall', x, 2, { z, w: C, h: 4, d: C, color: '#777', matAsset: wallMat, physics: stat({ friction: 0 }), tags: ['wall'] }); return; }
      if (ch === 'S') start = [x, z]; else if (ch === 'X') enemy = [x, z]; else if (ch === 'E') exit = [x, z]; else if (ch === 'F') fuseAt.push([x, z]); else if (ch === 'B') batAt.push([x, z]); else if (ch === 'N') noteAt.push([x, z]);
      else if (ch === 'd') { desk(p, M, x, z, 0); chair(p, M, x - 0.3, z + 1.1); } else if (ch === 'r') barrel(p, M, x, z); else if (ch === 'v') vending(p, M, x, z); else if (ch === 'g') generator(p, M, x, z); else if (ch === 'k') shelf(p, M, x, z);
      else if (ch === 'c') crates(p, M, x - 0.5, z); else if (ch === 'p') pillar(p, M, x, z, cfg.roof ? 1.2 : 4); else if (ch === 'a') antenna(p, M, x, z); else if (ch === 'l') lights.push([x, z]);
    }));
    /* floor, ceiling, edges */
    const fw = W * C + 4, fd = H * C + 4;
    add(p, 'cube', 'Floor', 0, -0.5, { z: 0, w: fw, h: 1, d: fd, color: '#333', matAsset: M[cfg.floor], physics: stat({ friction: 0 }) });
    if (!cfg.roof) add(p, 'cube', 'Ceiling', 0, 4.5, { z: 0, w: fw, h: 1, d: fd, color: '#444', matAsset: M.ceiling, physics: stat() });
    else { add(p, 'sphere', 'Moon', -40, 60, { z: -90, w: 14, h: 14, d: 14, color: '#dfe8ff', matAsset: M.moon }); }
    /* lamps: a ceiling panel + a flickering light */
    lights.forEach(([x, z], i) => { part(p, M, 'Ceiling lamp', x, 3.92, z, 1.4, 0.1, 0.5, 'lamp'); add(p, 'light', 'Lamp light ' + i, x, 3.5, { z, color: cfg.lampColor || '#ffe2a8', props: { kind: 'point', intensity: cfg.lampPower || 0.55, shadows: false, range: 16 }, behaviors: [flick] }); });
    if (cfg.pipes) for (let i = 0; i < 5; i++) pipeRun(p, M, at(5, 3 + i)[0], at(5, 3 + i)[1], W * C, i % 2 ? 'x' : 'x');
    /* fuse cards (+ glow), batteries, notes */
    fuseAt.forEach(([x, z], i) => { part(p, M, 'Fuse card ' + i, x, 0.9, z, 0.34, 0.03, 0.22, 'card', { tags: ['fuse'], behaviors: [spin] }); });
    batAt.forEach(([x, z], i) => { cyl(p, M, 'Battery ' + i, x, 0.6, z, 0.24, 0.5, 'battery', { tags: ['battery'], behaviors: [spin] }); });
    noteAt.forEach(([x, z], i) => { part(p, M, 'Note ' + i, x, 0.78, z, 0.3, 0.01, 0.4, 'paper', { tags: ['note'], behaviors: [noteB(p, cfg.notes[i % cfg.notes.length])] }); noteN++; });
    /* the exit */
    const eb = exitB(p, cfg.name); solid(p, M, 'Exit frame', exit[0], 1.4, exit[1], 2.6, 2.8, 0.3, 'steel', { behaviors: [eb] }); part(p, M, 'Exit door', exit[0], 1.3, exit[1] + 0.17, 2, 2.4, 0.05, 'rust'); part(p, M, 'Exit light', exit[0], 3, exit[1] + 0.2, 0.5, 0.18, 0.05, cfg.roof ? 'beacon' : 'redLed');
    add(p, 'light', 'Exit glow', exit[0], 2.8, { z: exit[1] + 0.6, color: '#ff3a2a', props: { kind: 'point', intensity: 0.28, shadows: false, range: 9 } });
    /* the watcher: a tall shape with glowing eyes riding along */
    add(p, 'capsule', 'The Watcher', enemy[0], 1.3, { z: enemy[1], w: 0.8, h: 2.3, d: 0.8, color: '#050506', matAsset: M.skin, tags: ['enemy', 'stalker'], physics: PH('kinematic', { shape: 'box' }), behaviors: [stalker(p, cfg.speed)] });
    const eyes = K.bhv(p, 'Eyes – ride on the Watcher', ({ block, start }) => { start().to(block('attacher', { target: 'tag:stalker', keepOffset: true })); });
    for (const dx of [-0.16, 0.16]) add(p, 'sphere', 'Eye', enemy[0] + dx, 2.0, { z: enemy[1] + 0.35, w: 0.12, h: 0.12, d: 0.12, color: '#f00', matAsset: M.eye, behaviors: [eyes] });
    /* flashlight (follows you) + the player */
    const holder = K.bhv(p, 'Flashlight – follow player', ({ block, start }) => { start().to(block('attacher', { target: 'tag:player', keepOffset: true })); });
    add(p, 'light', 'Flashlight', start[0], 1.9, { z: start[1], color: '#fff3d6', props: { kind: 'point', intensity: 0, shadows: false, range: 15 }, tags: ['flashlight'], behaviors: [holder] });
    add(p, 'cube', 'Player', start[0], 1.2, { z: start[1], w: 0.8, h: 1.6, d: 0.8, color: '#fff', visible: false, tags: ['player'], physics: PH('dynamic', { shape: 'box', friction: 0, fixedRotation: true, mass: 1 }), behaviors: [player(p)] });
    sc.camera3d = { mode: 'fps', yaw: cfg.yaw || 180, fov: 70, pos: { x: start[0], y: 1.7, z: start[1] }, target: { x: start[0], y: 1.7, z: start[1] - 5 } };
    sc.behaviors = (sc.behaviors || []).concat([rules(p, cfg.name, cfg.need, cfg.objective)]);
    sc.effects = null; void noteN;
    shader(p, sc);
    return { sc, start, enemy, exit, fuses: fuseAt.length };
  }
  /** the VHS look: a scene behaviour that switches the screen shader on */
  function shader(p, sc, amount) {
    const id = K.bhv(p, 'VHS look', ({ block, start }) => { const s = block('shader', { effect: 'vhs', mode: 'all', amount: amount === undefined ? 100 : amount, size: 2, auto: true }); start().to(s, 'out', 'in'); });
    sc.behaviors = (sc.behaviors || []).concat([id]);
  }

  /* ------------------------------------------------------------ cutscenes */
  /** a short scripted scene: set dressing, a moving camera, letterbox bars and subtitles; Space / Enter skips it */
  function cutscene(p, M, spec) {
    let sc; if (spec.first) { sc = p.scenes[0]; p.cur = 0; sc.name = spec.name; sc.bg = spec.bg; } else sc = K.newScene(p, spec.name, spec.bg, '3d'); sc.gravity = { x: 0, y: 0, z: 0 }; K.sky(p, spec.sun === undefined ? 0.1 : spec.sun, spec.sky === undefined ? 0.35 : spec.sky);
    spec.build(p, M, sc);
    /* the camera rides an invisible rig that glides from `from` to `to`; the view direction (yaw/pitch) comes from `from` → `look` */
    const dx = spec.look.x - spec.from.x, dy = spec.look.y - spec.from.y, dz = spec.look.z - spec.from.z, len = Math.hypot(dx, dy, dz) || 1;
    const yaw = Math.atan2(-dx, -dz) * 180 / Math.PI, pitch = Math.asin(dy / len) * 180 / Math.PI;
    sc.camera3d = { mode: 'fps', yaw, pitch, fov: spec.fov || 60, pos: spec.from, target: spec.look };
    const glide = K.bhv(p, 'Camera rig – glide (' + spec.name + ')', ({ block, start }) => { start().to(block('position', { target: 'self', mode: 'set', x: String(spec.to.x), y: String(spec.to.y), z: String(spec.to.z), duration: spec.secs || 16, ease: 'sineInOut' })); });
    add(p, 'empty', 'Camera rig', spec.from.x, spec.from.y, { z: spec.from.z, tags: ['camrig'], behaviors: [glide] });
    const total = spec.lines[spec.lines.length - 1].t + spec.lines[spec.lines.length - 1].d + 0.8;
    const id = K.bhv(p, 'Cutscene – ' + spec.name, ({ block, start, key, snd }) => {
      const bar = (anchor) => block('label', { id: 'bar_' + anchor, text: ' '.repeat(260), anchor, size: 46, color: '#000', bg: '#000', y: 0 }); start().to(bar('top'), 'out', 'show'); start().to(bar('bottom'), 'out', 'show');
      start().to(block('label', { id: 'rec', text: '● REC   SP      ' + (spec.stamp || 'NOV 12 1999   03:42 AM'), anchor: 'topLeft', size: 20, color: '#ff6a5e', x: 24, y: 96 }), 'out', 'show');
      start().to(block('camera', { action: 'mode3d', mode: 'fps', target: 'tag:camrig', eye: 0, distance: 0 }));
      spec.lines.forEach((l, i) => { const lb = block('label', { id: 'sub' + i, text: l.text, anchor: 'bottom', size: 26, color: l.color || '#f4f4f4', y: 62, bold: true }); start().to(lb, 'out', 'hide'); start(l.t).to(lb, 'out', 'show'); start(l.t + l.d).to(lb, 'out', 'hide'); if (i === 0) start(0.2).to(snd('beep')); });
      start().to(block('sound', { sound: 'snd_hum', volume: 0.6, loop: true }));
      start(total).to(block('loadLevel', { level: spec.last ? '0' : 'next', delay: 0 }));
      for (const k of ['space', 'enter']) key(k, 'down').to(block('loadLevel', { level: spec.last ? '0' : 'next', delay: 0 }));
      const skip = block('label', { id: 'skip', text: spec.last ? 'Space – play again' : 'Space – skip', anchor: 'bottomRight', size: 15, color: '#9fbfa9', x: 24, y: 96 }); start().to(skip, 'out', 'hide'); start(0.5).to(skip, 'out', 'show');
    });
    sc.behaviors = (sc.behaviors || []).concat([id]); shader(p, sc, 100);
    return sc;
  }

  /* ------------------------------------------------------------ the game */
  VX.gameExamples.push({ id: 'ex3d-vhs-tape', name: 'Night Shift: Tape 07 (3D)', type: 'game3d', desc: 'A found-footage horror seen through a VHS camcorder. Three levels with cutscenes: collect the fuse cards, keep your flashlight charged, and slip past the thing that hunts you by sound. WASD move, Shift run, F flashlight, mouse look.', build() {
    const p = K.proj('Night Shift: Tape 07', '3d', '#03050a'); sounds(p); const M = materials(p);
    p.settings.title = 'Night Shift: Tape 07';
    /* intro cutscene: the tower at night */
    const tower = (pp, MM) => {
      solid(pp, MM, 'Tower', 0, 12, -30, 18, 24, 12, 'dark'); for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) if ((r * 7 + c * 3) % 5 === 0) part(pp, MM, 'Window', -7 + c * 2.8, 2.5 + r * 3.6, -23.9, 1.4, 1.8, 0.1, 'win');
      solid(pp, MM, 'Entrance', 0, 1.6, -23.9, 3, 3.2, 0.3, 'steel'); part(pp, MM, 'Entrance light', 0, 3.6, -23.7, 2, 0.2, 0.2, 'lamp'); add(pp, 'cube', 'Ground', 0, -0.5, { z: -12, w: 90, h: 1, d: 60, color: '#222', matAsset: MM.roof, physics: stat() }); add(pp, 'sphere', 'Moon', 30, 40, { z: -80, w: 10, h: 10, d: 10, color: '#dfe8ff', matAsset: MM.moon });
      barrel(pp, MM, -4, -14); barrel(pp, MM, -3.2, -14.6); crates(pp, MM, 5, -16); add(pp, 'light', 'Entrance glow', 0, 3, { z: -22, color: '#ffe2a8', props: { kind: 'point', intensity: 0.8, shadows: false, range: 14 } });
    };
    cutscene(p, M, { name: 'Intro', first: true, bg: '#02030a', from: { x: -10, y: 2.2, z: 8 }, look: { x: 0, y: 4, z: -30 }, to: { x: -1.5, y: 1.9, z: -10 }, lookTo: { x: 0, y: 2.5, z: -24 }, lerp: 0.006, build: tower,
      lines: [{ t: 1, d: 3.5, text: 'MERIDIAN TOWER – NIGHT SHIFT' }, { t: 5, d: 4, text: 'Tape 07. Power is out on every floor.' }, { t: 9.5, d: 4.5, text: 'Find the fuse cards. Get the lift running. Get out.' }, { t: 14.5, d: 3, text: 'And whatever you hear… do not make noise.', color: '#ff9a8a' }] });
    /* 1 · lobby */
    level(p, M, { name: 'Lobby', bg: '#04060a', wall: 'wall', floor: 'floor', need: 3, objective: 'Find the fuse cards', speed: 2.6, sun: 0.03, sky: 0.22, lampColor: '#ffe2a8', lampPower: 0.5,
      notes: ['"Night guard: the lift needs three fuse cards. They were taken to the offices. — M."', '"It only comes when you make noise. Walk slowly. Use the light."'],
      map: ['#############', '#S..#.l.#..F#', '#.d.#.d.#.k.#', '#..N....#l..#', '##.######.###', '#.B.vl.#....#', '#.F....#.r.l#', '#......#B...#', '###.#####.###', '#X....lF...E#', '#############'] });
    cutscene(p, M, { name: 'Descent', bg: '#02030a', stamp: 'NOV 12 1999   04:05 AM', from: { x: 0, y: 1.7, z: 6 }, look: { x: 0, y: 1.7, z: -6 }, to: { x: 0, y: 1.6, z: -3 }, lookTo: { x: 0, y: 1.2, z: -8 }, lerp: 0.01,
      build: (pp, MM) => { solid(pp, MM, 'Lift floor', 0, -0.1, 0, 4, 0.2, 4, 'floor'); solid(pp, MM, 'Lift wall', -2, 1.5, 0, 0.2, 3, 4, 'steel'); solid(pp, MM, 'Lift wall', 2, 1.5, 0, 0.2, 3, 4, 'steel'); solid(pp, MM, 'Lift back', 0, 1.5, -2, 4, 3, 0.2, 'steel'); solid(pp, MM, 'Lift roof', 0, 3.1, 0, 4, 0.2, 4, 'ceiling'); part(pp, MM, 'Floor display', 0, 2.6, -1.85, 0.5, 0.2, 0.05, 'redLed'); add(pp, 'light', 'Lift light', 0, 2.8, { z: 0, color: '#ffd9a0', props: { kind: 'point', intensity: 0.5, shadows: false, range: 8 }, behaviors: [flicker(pp)] }); },
      lines: [{ t: 1, d: 3, text: 'The lift works. It only goes down.' }, { t: 4.8, d: 4, text: 'B1 – the archive. The cards for the roof are down there.' }, { t: 9.2, d: 3, text: 'Something is breathing in the dark.', color: '#ff9a8a' }] });
    /* 2 · basement */
    level(p, M, { name: 'Basement', bg: '#030306', wall: 'wallDark', floor: 'floor', need: 3, objective: 'Restart the generator – find the cards', speed: 3.3, pipes: true, sun: 0.01, sky: 0.14, lampColor: '#ff9a5a', lampPower: 0.4,
      notes: ['"Do NOT use the stairs. It follows the sound of footsteps."', '"The flashlight makes it back off. For a while. Watch the battery."'],
      map: ['###########', '#S..#..l..#', '#.#.#.###.#', '#.#...#F#.#', '#.#####.#.#', '#.F.l.#N#.#', '###.#.#.#.#', '#..B#.#...#', '#.###.###.#', '#X..F...lE#', '###########'] });
    cutscene(p, M, { name: 'Ascent', bg: '#02030a', stamp: 'NOV 12 1999   04:51 AM', from: { x: 0, y: 1.7, z: 6 }, look: { x: 0, y: 3, z: -6 }, to: { x: 0, y: 2.2, z: -3 }, lookTo: { x: 0, y: 6, z: -8 }, lerp: 0.01,
      build: (pp, MM) => { for (let i = 0; i < 9; i++) solid(pp, MM, 'Stair', 0, i * 0.4, -i * 0.8, 2.6, 0.4, 0.8, 'steel'); solid(pp, MM, 'Stair wall', -1.5, 2.5, -3, 0.2, 5, 9, 'wallDark'); solid(pp, MM, 'Stair wall', 1.5, 2.5, -3, 0.2, 5, 9, 'wallDark'); add(pp, 'light', 'Stair light', 0, 4, { z: -2, color: '#ff9a5a', props: { kind: 'point', intensity: 0.45, shadows: false, range: 10 }, behaviors: [flicker(pp)] }); },
      lines: [{ t: 1, d: 3.5, text: 'The generator is running. The roof door is open.' }, { t: 5, d: 4, text: 'The helipad beacon needs three fuse cards.' }, { t: 9.5, d: 3, text: 'It is still behind you.', color: '#ff9a8a' }] });
    /* 3 · rooftop */
    level(p, M, { name: 'Rooftop', bg: '#070b18', roof: true, wall: 'wall', floor: 'roof', need: 3, objective: 'Light the beacon – find the cards', speed: 4, sun: 0.12, sky: 0.55, lampColor: '#cfe0ff', lampPower: 0.3,
      notes: ['"Beacon first. Then the helicopter can find us."'],
      map: ['#############', '#S..........#', '#..c..c.....#', '#.....r..F..#', '#.c.....N...#', '#......g....#', '#.F.....c...#', '#...c...B...#', '#.......F...#', '#..r...X.a.E#', '#############'] });
    cutscene(p, M, { name: 'Ending', last: true, bg: '#0a1020', sun: 0.35, sky: 0.7, stamp: 'NOV 12 1999   05:30 AM', from: { x: 0, y: 3, z: 12 }, look: { x: 0, y: 8, z: -20 }, to: { x: 0, y: 9, z: 4 }, lookTo: { x: 0, y: 14, z: -30 }, lerp: 0.006,
      build: (pp, MM) => { add(pp, 'cube', 'Roof', 0, -0.5, { z: 0, w: 40, h: 1, d: 40, color: '#333', matAsset: MM.roof, physics: stat() }); antenna(pp, MM, 6, -6); part(pp, MM, 'Helipad', 0, 0.02, -4, 9, 0.05, 9, 'steel'); add(pp, 'sphere', 'Beacon', 0, 1.2, { z: -4, w: 1, h: 1, d: 1, color: '#f52', matAsset: MM.beacon }); add(pp, 'light', 'Beacon light', 0, 2, { z: -4, color: '#ff6a3a', props: { kind: 'point', intensity: 2.5, shadows: false, range: 40 } }); add(pp, 'sphere', 'Moon', 20, 40, { z: -90, w: 14, h: 14, d: 14, color: '#dfe8ff', matAsset: MM.moon }); },
      lines: [{ t: 1, d: 3.5, text: 'The beacon is lit. Rotors in the distance.' }, { t: 5, d: 4, text: 'Tape 07 ends here. Whatever was in the tower stays there.' }, { t: 9.5, d: 4, text: 'NIGHT SHIFT – THE END' }, { t: 14, d: 3, text: 'Thanks for playing.' }] });
    p.cur = 0;
    K.touch(p, { buttons: [{ label: 'Light', key: 'f' }, { label: 'Run', key: 'shift' }] });
    return p;
  } });
})();
