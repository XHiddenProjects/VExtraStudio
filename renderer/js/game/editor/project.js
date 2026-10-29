/* Vextra game editor – project data model, object type registry, sample games. */
(function () {
  const uid = (p = 'o') => p + '_' + Math.random().toString(36).slice(2, 8);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ---------------------------------------------------------------- object types */
  const TYPES = new Map();
  const F = {
    color: (key = 'color', label = 'Colour') => ({ key, label, type: 'color' }), num: (key, label, min, max, step) => ({ key, label, type: 'number', min, max, step }), text: (key, label) => ({ key, label, type: 'text' }),
    sel: (key, label, options) => ({ key, label, type: 'select', options }), bool: (key, label) => ({ key, label, type: 'bool' }), area: (key, label) => ({ key, label, type: 'multiline' }), sprite: (key = 'sprite', label = 'Sprite') => ({ key, label, type: 'sprite' }), model: (key = 'model', label = 'Model') => ({ key, label, type: 'model' }),
  };
  const addType = (t) => { TYPES.set(t.type, Object.assign({ dim: '2d', category: 'Shapes', icon: '▭', w: 80, h: 80, d: 1, props: {}, schema: [], color: '#6c8cff', physics: null, builtin: true }, t)); };
  /* 2D */
  addType({ type: 'rect', label: 'Rectangle', icon: '▭', schema: [F.num('radius', 'Corner radius', 0, 200), F.num('strokeWidth', 'Outline', 0, 40), F.color('stroke', 'Outline colour')] });
  addType({ type: 'ellipse', label: 'Ellipse', icon: '◯', color: '#f5c451', schema: [F.num('strokeWidth', 'Outline', 0, 40), F.color('stroke', 'Outline colour')] });
  addType({ type: 'triangle', label: 'Triangle', icon: '△', color: '#4cc38a' });
  addType({ type: 'sprite', label: 'Sprite', icon: '🖼', category: 'Visuals', props: { sprite: '', emoji: '' }, schema: [F.sprite(), F.text('emoji', 'Emoji (when no sprite)')] });
  addType({ type: 'text', label: 'Text', icon: 'T', category: 'Visuals', color: '#ffffff', w: 200, h: 50, props: { text: 'Hello {score}', size: 28, bold: true, align: 'center', font: '' }, schema: [F.area('text', 'Text'), F.num('size', 'Size', 6, 200), F.bool('bold', 'Bold'), F.sel('align', 'Align', ['left', 'center', 'right']), F.text('font', 'Font family')] });
  addType({ type: 'empty', label: 'Empty', icon: '◌', category: 'Logic', dim: 'both', w: 40, h: 40, d: 1, color: '#888888' });
  /* 3D */
  const P3 = (type, label, icon, extra) => addType(Object.assign({ type, label, icon, dim: '3d', category: 'Primitives', w: 1, h: 1, d: 1, color: '#7aa2ff' }, extra));
  P3('cube', 'Cube', '🧊'); P3('sphere', 'Sphere', '⚪', { color: '#ff7a8a' }); P3('cylinder', 'Cylinder', '🥫', { color: '#7ee787' }); P3('cone', 'Cone', '🔺', { color: '#f5c451' }); P3('plane', 'Plane', '▱', { w: 10, h: 1, d: 10, color: '#4a5568' });
  P3('torus', 'Torus', '🍩', { color: '#bc8cff' }); P3('capsule', 'Capsule', '💊', { color: '#39c5cf' }); P3('pyramid', 'Pyramid', '⛰', { color: '#f0883e' }); P3('ramp', 'Ramp', '◢', { color: '#8b949e' });
  addType({ type: 'model', label: 'Model', icon: '🧩', dim: '3d', category: 'Models', w: 1, h: 1, d: 1, color: '#ffffff', props: { model: '' }, schema: [F.model()] });
  addType({ type: 'light', label: 'Light', icon: '💡', dim: '3d', category: 'Scene', w: 1, h: 1, d: 1, color: '#ffffff', props: { kind: 'point', intensity: 1, shadows: false, angle: 40, range: 0 }, schema: [F.sel('kind', 'Kind', ['point', 'directional', 'spot', 'ambient', 'hemisphere']), F.num('intensity', 'Intensity', 0, 10, 0.1), F.bool('shadows', 'Casts shadows'), F.num('angle', 'Spot angle', 5, 90), F.num('range', 'Range (0 = ∞)', 0, 500)] });
  addType({ type: 'camera', label: 'Camera', icon: '🎥', dim: '3d', category: 'Scene', w: 1, h: 1, d: 1, color: '#ffffff', props: { fov: 60 }, schema: [F.num('fov', 'Field of view', 20, 120)] });

  const GP = (VX.GameProject = {
    uid, clone,
    types: () => [...TYPES.values()],
    type: (t) => TYPES.get(t),
    registerType(def) { TYPES.set(def.type, Object.assign({ dim: '2d', category: 'Plugins', icon: '◻', w: 60, h: 60, d: 1, props: {}, schema: [], color: '#6c8cff', builtin: false }, def)); VX.emit('gameTypes'); return TYPES.get(def.type); },
    unregisterType(t) { TYPES.delete(t); VX.emit('gameTypes'); },

    /** Create a new object of a type, positioned (x,y[,z]) */
    newObject(type, dim, x = 0, y = 0, z = 0, names = []) {
      const t = TYPES.get(type) || TYPES.get(dim === '3d' ? 'cube' : 'rect'); const is3 = dim === '3d'; const base = t.label; let name = base, n = 1; while (names.includes(name)) name = base + ' ' + ++n;
      const o = { id: uid(), name, type: t.type, x, y, z: is3 ? z : 0, rot: 0, rx: 0, ry: 0, rz: 0, w: t.w, h: t.h, d: is3 ? t.d : 1, color: t.color, alpha: 1, visible: true, enabled: true, order: 0, tags: [], behaviors: [], vars: {}, props: clone(t.props || {}), physics: Object.assign({ body: 'none', shape: 'box', bounce: 0, friction: 0.2, gravityScale: 1, mass: 1 }, t.physics || {}), prefab: false };
      if (!is3) { o.w = t.w > 10 ? t.w : 80; o.h = t.h > 10 ? t.h : 80; }
      return o;
    },
    blankScene(dim, name = 'Level 1') {
      const is3 = dim === '3d';
      return { id: uid('s'), name, dim, objects: [], behaviors: [], bg: is3 ? '#1a2233' : '#10131a', gravity: is3 ? { x: 0, y: -25, z: 0 } : { x: 0, y: 980, z: 0 }, camera2d: { x: 480, y: 270, zoom: 1 }, camera3d: { mode: 'fixed', fov: 60, pos: { x: 8, y: 6, z: 10 }, target: { x: 0, y: 1, z: 0 } }, env: is3 ? { sky: '#1a2233', ambientIntensity: 0.5, shadows: true } : {} };
    },
    newBehavior(name = 'Behavior') { return { id: uid('b'), name, mode: 'graph', graph: { nodes: [], wires: [] }, code: '' }; },

    /** Make a sprite asset from rows of palette characters (for samples). */
    spriteFromRows(rows, pal, scale = 1) {
      const h = rows.length, w = rows[0].length, c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale; const x = c.getContext('2d');
      rows.forEach((r, j) => [...r].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i * scale, j * scale, scale, scale); } })); return c.toDataURL('image/png');
    },

    /** Make wires point at ports that really exist (a wire saying "out" on a block whose output is "tick" is retargeted). */
    fixWires(graph) {
      if (!graph) return; const byId = new Map((graph.nodes || []).map((n) => [n.id, n])); const ids = (n, kind) => { const d = VXRT.blocks[n.type]; if (!d) return []; try { const full = Object.assign(VXRT.paramDefaults(d), n.params || {}); return VXRT.ports(d, full, n)[kind].map((x) => x.id); } catch { return []; } };
      for (const w of graph.wires || []) { const a = byId.get(w.from), b = byId.get(w.to); if (!a || !b) continue; const oa = ids(a, 'outputs'), ib = ids(b, 'inputs'); if (oa.length && !oa.includes(w.out)) w.out = oa[0]; if (ib.length && !ib.includes(w.in)) w.in = ib[0]; }
      for (const n of graph.nodes || []) if (n.graph) GP.fixWires(n.graph);
    },
    normalize(data) {
      if (!data || typeof data !== 'object') return GP.blank({});
      if (data.format === 'forge-scene' || (Array.isArray(data.items) && !data.scenes)) return GP.fromLegacyScene(data);
      data.format = 'vextra-game'; data.version = 2; data.settings = Object.assign({ id: uid('game'), title: 'My game', width: 960, height: 540, bg: '#10131a', pixelArt: false, startScene: 0, cloudUrl: '' }, data.settings || {});
      data.scenes = data.scenes && data.scenes.length ? data.scenes : [GP.blankScene('2d')]; data.behaviors = data.behaviors || {}; data.assets = Object.assign({ sprites: {}, sounds: {}, models: {} }, data.assets || {}); for (const k of ['sprites', 'sounds', 'models']) data.assets[k] = data.assets[k] || {}; data.prefabs = data.prefabs || [];
      for (const b of Object.values(data.behaviors)) if (b && b.graph) GP.fixWires(b.graph);
      for (const s of data.scenes) { s.id = s.id || uid('s'); s.dim = s.dim || '2d'; s.objects = s.objects || []; s.behaviors = s.behaviors || []; for (const o of s.objects) { o.id = o.id || uid(); o.props = o.props || {}; o.physics = o.physics || { body: 'none' }; o.tags = o.tags || []; o.behaviors = o.behaviors || []; } }
      return data;
    },
    fromLegacyScene(old) {
      const p = GP.blank({ name: 'Imported scene', dim: '2d' }); const sc = p.scenes[0]; sc.objects = []; p.settings.width = old.width || 960; p.settings.height = old.height || 540; p.settings.bg = old.bg || '#10131a'; sc.bg = p.settings.bg;
      for (const it of old.items || []) { const pr = it.props || {}; sc.objects.push(Object.assign(GP.newObject(pr.emoji ? 'sprite' : 'rect', '2d', (it.x || 0) + (it.w || 60) / 2, (it.y || 0) + (it.h || 60) / 2), { id: it.id || uid(), name: it.type || 'Object', w: it.w || 60, h: it.h || 60, rot: it.rot || 0, color: pr.color || pr.fill || '#6c8cff', props: { emoji: pr.emoji || '', text: pr.text } })); }
      return p;
    },

    blank({ name = 'My game', dim = '2d', sample = false } = {}) {
      const p = { format: 'vextra-game', version: 2, settings: { id: uid('game'), title: name, width: 960, height: 540, bg: dim === '3d' ? '#1a2233' : '#10131a', pixelArt: false, startScene: 0, cloudUrl: '' }, scenes: [], behaviors: {}, assets: { sprites: {}, sounds: {}, models: {} }, prefabs: [] };
      if (!sample) { p.scenes.push(GP.blankScene(dim)); return p; }
      return dim === '3d' ? GP.sample3d(p) : GP.sample2d(p);
    },
  });

  /* ---------------------------------------------------------------- sample games */
  const N = (id, type, params, x, y) => ({ id, type, params: params || {}, x, y });
  const W = (from, to, out, inp) => ({ from, to, out: out || 'out', in: inp || 'in' });
  const SND = {
    coin: { id: 'snd_coin', name: 'coin', kind: 'synth', params: { wave: 'square', freq: 880, freqEnd: 1760, dur: 0.18, attack: 0.002, decay: 0.05, sustain: 0.5, release: 0.08, vol: 0.4 } },
    jump: { id: 'snd_jump', name: 'jump', kind: 'synth', params: { wave: 'square', freq: 260, freqEnd: 620, dur: 0.22, attack: 0.002, decay: 0.08, sustain: 0.4, release: 0.1, vol: 0.35 } },
    hit: { id: 'snd_hit', name: 'hit', kind: 'synth', params: { wave: 'noise', freq: 1800, freqEnd: 120, dur: 0.3, attack: 0.001, decay: 0.1, sustain: 0.3, release: 0.15, vol: 0.5 } },
  };
  GP.sample2d = function (p) {
    p.settings.title = p.settings.title || 'My 2D game';
    const robot = GP.spriteFromRows(['..XXXXXX..', '.XBBBBBBX.', 'XBWWBBWWBX', 'XBWKBBKWBX', 'XBBBBBBBBX', 'XBBRRRRBBX', '.XBBBBBBX.', '..XXXXXX..', '.X.X..X.X.', '.X.X..X.X.'], { X: '#1b2a63', B: '#6c8cff', W: '#ffffff', K: '#10131a', R: '#ff7a8a' }, 8);
    const coin = GP.spriteFromRows(['..YYYY..', '.YOOOOY.', 'YOOYYOOY', 'YOYOOYOY', 'YOYOOYOY', 'YOOYYOOY', '.YOOOOY.', '..YYYY..'], { Y: '#ffe27a', O: '#f5a623' }, 8);
    p.assets.sprites.spr_robot = { id: 'spr_robot', name: 'robot', w: 80, h: 100, frames: [robot], fps: 8, anims: {} };
    p.assets.sprites.spr_coin = { id: 'spr_coin', name: 'coin', w: 64, h: 64, frames: [coin], fps: 8, anims: {} };
    Object.assign(p.assets.sounds, { snd_coin: SND.coin, snd_jump: SND.jump, snd_hit: SND.hit });
    p.behaviors.b_player = { id: 'b_player', name: 'Player controls', mode: 'graph', graph: { nodes: [
      N('kl', 'keyboard', { key: 'left', mode: 'held' }, 40, 40), N('ka', 'keyboard', { key: 'a', mode: 'held' }, 40, 140), N('kr', 'keyboard', { key: 'right', mode: 'held' }, 40, 260), N('kd', 'keyboard', { key: 'd', mode: 'held' }, 40, 360),
      N('vl', 'velocity', { mode: 'set', x: '-240', y: '' }, 330, 90), N('vr', 'velocity', { mode: 'set', x: '240', y: '' }, 330, 310),
      N('kul', 'keyboard', { key: 'left', mode: 'up' }, 40, 480), N('kur', 'keyboard', { key: 'right', mode: 'up' }, 40, 580), N('vs', 'velocity', { mode: 'set', x: '0', y: '' }, 330, 530),
      N('kj', 'keyboard', { key: 'space', mode: 'down' }, 40, 700), N('ku', 'keyboard', { key: 'up', mode: 'down' }, 40, 800), N('im', 'impulse', { force: 560, direction: 'up', mode: 'set', axisOnly: 'y', onlyGrounded: true }, 330, 750), N('sj', 'sound', { sound: 'snd_jump', action: 'play' }, 620, 750),
      N('fl', 'flip', { }, 620, 90),
    ], wires: [W('kl', 'vl'), W('ka', 'vl'), W('kr', 'vr'), W('kd', 'vr'), W('kul', 'vs'), W('kur', 'vs'), W('kj', 'im'), W('ku', 'im'), W('im', 'sj')] } };
    p.behaviors.b_player.graph.nodes = p.behaviors.b_player.graph.nodes.filter((n) => n.type !== 'flip');
    p.behaviors.b_coin = { id: 'b_coin', name: 'Collectable coin', mode: 'graph', graph: { nodes: [
      N('c', 'collision', { with: 'tag:player', phase: 'enter' }, 40, 80), N('v', 'globalVariable', { name: 'score', op: 'add', amount: 1 }, 320, 80),
      N('s', 'sound', { sound: 'snd_coin', action: 'play' }, 320, 230), N('e', 'emit', { count: 14, color: '#ffe27a', speed: 160, life: 0.6 }, 320, 360), N('d', 'destroyer', { delay: 0 }, 600, 300),
    ], wires: [W('c', 'v'), W('c', 's'), W('c', 'e'), W('c', 'd')] } };
    p.behaviors.b_hazard = { id: 'b_hazard', name: 'Restart on touch', mode: 'graph', graph: { nodes: [N('c', 'collision', { with: 'tag:player', phase: 'enter' }, 40, 60), N('s', 'sound', { sound: 'snd_hit', action: 'play' }, 320, 40), N('r', 'restartGame', { scope: 'sceneReset' }, 320, 160)], wires: [W('c', 's'), W('c', 'r')] } };
    p.behaviors.b_goal = { id: 'b_goal', name: 'Level goal', mode: 'graph', graph: { nodes: [N('c', 'collision', { with: 'tag:player', phase: 'enter' }, 40, 60), N('a', 'alert', { mode: 'modal', kind: 'success', title: '🎉 You made it!', message: 'You collected {score} coins.', button: 'Play again', pause: true }, 320, 60), N('r', 'restartGame', { scope: 'sceneReset' }, 600, 60)], wires: [W('c', 'a'), W('a', 'r', 'ok')] } };
    p.behaviors.b_world = { id: 'b_world', name: 'Game rules', mode: 'graph', graph: { nodes: [
      N('t', 'timer', { interval: 0.05, repeat: false }, 40, 60), N('g', 'globalVariable', { name: 'score', op: 'set', amount: 0, initial: 0 }, 320, 40), N('l', 'label', { id: 'hud', text: 'Coins: {score}', anchor: 'topLeft', size: 26 }, 600, 40), N('cam', 'camera', { action: 'follow', target: 'Player', lerp: 0.12 }, 320, 200), N('hint', 'label', { id: 'hint', text: 'Arrow keys / A D to move · Space to jump', anchor: 'bottom', size: 18, color: '#cbd5e1' }, 600, 200),
    ], wires: [W('t', 'g'), W('g', 'l'), W('t', 'cam'), W('t', 'hint')] } };
    const sc = GP.blankScene('2d', 'Level 1'); sc.behaviors = ['b_world'];
    const rect = (name, x, y, w, h, color, extra) => Object.assign(GP.newObject('rect', '2d', x, y), { name, w, h, color }, extra || {});
    const stat = { physics: { body: 'static', shape: 'box', bounce: 0, friction: 0.4, gravityScale: 1, mass: 1 } };
    const ground = rect('Ground', 800, 520, 1700, 60, '#2f3b52', stat);
    const plat = (n, x, y, w) => rect(n, x, y, w, 24, '#46587a', stat);
    const player = Object.assign(GP.newObject('sprite', '2d', 120, 380), { name: 'Player', w: 56, h: 70, color: '#ffffff', tags: ['player'], behaviors: ['b_player'], props: { sprite: 'spr_robot', emoji: '' }, physics: { body: 'dynamic', shape: 'box', bounce: 0, friction: 0.1, gravityScale: 1, mass: 1, fixedRotation: true } });
    const mkCoin = (x, y, i) => Object.assign(GP.newObject('sprite', '2d', x, y), { name: 'Coin ' + i, w: 34, h: 34, color: '#ffffff', behaviors: ['b_coin'], props: { sprite: 'spr_coin', emoji: '' }, physics: { body: 'static', shape: 'circle', sensor: true, bounce: 0, friction: 0, gravityScale: 1, mass: 1 } });
    const hazard = rect('Spikes', 1000, 480, 120, 20, '#ef5b5b', { behaviors: ['b_hazard'], physics: { body: 'static', shape: 'box', sensor: true, bounce: 0, friction: 0, gravityScale: 1, mass: 1 } });
    const flag = Object.assign(GP.newObject('sprite', '2d', 1540, 460), { name: 'Goal', w: 64, h: 64, props: { sprite: '', emoji: '🏁' }, behaviors: ['b_goal'], physics: { body: 'static', shape: 'box', sensor: true, bounce: 0, friction: 0, gravityScale: 1, mass: 1 } });
    sc.objects = [ground, plat('Platform 1', 360, 420, 180), plat('Platform 2', 620, 340, 160), plat('Platform 3', 880, 400, 160), plat('Platform 4', 1240, 380, 220), player, mkCoin(360, 380, 1), mkCoin(620, 300, 2), mkCoin(880, 360, 3), mkCoin(1240, 340, 4), mkCoin(1340, 340, 5), hazard, flag];
    p.scenes = [sc]; sc.camera2d = { x: 480, y: 270, zoom: 1 }; return p;
  };
  GP.sample3d = function (p) {
    p.settings.bg = '#1a2233';
    Object.assign(p.assets.sounds, { snd_coin: SND.coin, snd_jump: SND.jump });
    p.assets.models.mdl_tree = { id: 'mdl_tree', name: 'tree', kind: 'group', parts: [{ type: 'cylinder', x: 0, y: -0.25, z: 0, w: 0.2, h: 0.5, d: 0.2, color: '#8a5a2b' }, { type: 'cone', x: 0, y: 0.35, z: 0, w: 0.7, h: 0.8, d: 0.7, color: '#2e9e5b' }, { type: 'cone', x: 0, y: 0.7, z: 0, w: 0.5, h: 0.6, d: 0.5, color: '#3fbf72' }] };
    const move = (id, key, ax, val) => [N('k' + id, 'keyboard', { key, mode: 'held' }, 40, 40), N('v' + id, 'velocity', Object.assign({ mode: 'set', x: '', y: '', z: '', space: 'camera' }, { [ax]: String(val) }), 320, 40)];
    const nodes = [], wires = [];
    [['w', 'z', -6], ['up', 'z', -6], ['s', 'z', 6], ['down', 'z', 6], ['a', 'x', -6], ['left', 'x', -6], ['d', 'x', 6], ['right', 'x', 6]].forEach(([k, ax, val], i) => { const [a, b] = move(i, k, ax, val); a.y = 20 + i * 90; b.y = 20 + i * 90; nodes.push(a, b); wires.push(W(a.id, b.id)); });
    nodes.push(N('kj', 'keyboard', { key: 'space', mode: 'down' }, 40, 780), N('imp', 'impulse', { force: 11, direction: 'up', mode: 'set', axisOnly: 'y', onlyGrounded: true }, 320, 780), N('sj', 'sound', { sound: 'snd_jump', action: 'play' }, 600, 780)); wires.push(W('kj', 'imp'), W('imp', 'sj'));
    p.behaviors.b_player = { id: 'b_player', name: 'Player controls (WASD)', mode: 'graph', graph: { nodes, wires } };
    p.behaviors.b_gem = { id: 'b_gem', name: 'Spinning gem', mode: 'graph', graph: { nodes: [N('a', 'always', {}, 40, 40), N('sp', 'rotation', { mode: 'add', speed: 0, angle: 2, axis: 'y' }, 320, 40), N('c', 'collision', { with: 'tag:player', phase: 'enter' }, 40, 200), N('v', 'globalVariable', { name: 'gems', op: 'add', amount: 1 }, 320, 200), N('s', 'sound', { sound: 'snd_coin', action: 'play' }, 320, 330), N('d', 'destroyer', {}, 600, 330)], wires: [W('a', 'sp'), W('c', 'v'), W('c', 's'), W('c', 'd')] } };
    p.behaviors.b_world = { id: 'b_world', name: 'Game rules', mode: 'graph', graph: { nodes: [N('t', 'timer', { interval: 0.05, repeat: false }, 40, 60), N('g', 'globalVariable', { name: 'gems', op: 'set', amount: 0, initial: 0 }, 320, 40), N('l', 'label', { id: 'hud', text: 'Gems: {gems}', anchor: 'topLeft', size: 26 }, 600, 40), N('cam', 'camera', { action: 'mode3d', mode: 'fps', target: 'Player', eye: 0.7, lerp: 1 }, 320, 200), N('h', 'label', { id: 'hint', text: 'Click to look around · WASD move · Space jump · Esc releases mouse', anchor: 'bottom', size: 18, color: '#cbd5e1' }, 600, 200), N('ml', 'lockedMouse', { sensitivity: 1, lockOnClick: true }, 40, 360), N('lk', 'camera', { action: 'look', target: 'Player', sensitivity: 0.15 }, 320, 360), N('cr', 'label', { id: 'cross', text: '+', anchor: 'center', size: 30, color: '#ffffff', x: 0, y: 0 }, 600, 360)], wires: [W('t', 'g'), W('g', 'l'), W('t', 'cam'), W('t', 'h'), W('t', 'cr'), W('ml', 'lk')] } };
    const sc = GP.blankScene('3d', '3D Level 1'); sc.behaviors = ['b_world']; sc.camera3d = { mode: 'fps', fov: 75, pos: { x: 0, y: 1.7, z: 0 }, target: { x: 0, y: 1.7, z: -5 } };
    const mk = (type, name, x, y, z, w, h, d, color, extra) => Object.assign(GP.newObject(type, '3d', x, y, z), { name, w, h, d, color }, extra || {});
    const stat = { physics: { body: 'static', shape: 'box', bounce: 0, friction: 0.4, gravityScale: 1, mass: 1 } };
    const sun = Object.assign(GP.newObject('light', '3d', 6, 10, 4), { name: 'Sun', props: { kind: 'directional', intensity: 1.2, shadows: true, angle: 40, range: 0 } }); const fill = Object.assign(GP.newObject('light', '3d', 0, 5, 0), { name: 'Sky light', props: { kind: 'hemisphere', intensity: 0.6, shadows: false, angle: 40, range: 0 } });
    const ground = mk('cube', 'Ground', 0, -0.5, 0, 40, 1, 40, '#3b4a63', stat);
    const player = mk('cube', 'Player', 0, 1, 0, 1, 1, 1, '#ff7a8a', { tags: ['player'], behaviors: ['b_player'], physics: { body: 'dynamic', shape: 'box', bounce: 0, friction: 0.1, gravityScale: 1, mass: 1, fixedRotation: true } });
    const gem = (i, x, z) => mk('sphere', 'Gem ' + i, x, 1, z, 0.6, 0.6, 0.6, '#5be4ff', { behaviors: ['b_gem'], physics: { body: 'static', shape: 'circle', sensor: true, bounce: 0, friction: 0, gravityScale: 1, mass: 1 }, material: { emissive: '#1b8ea8', metalness: 0.4, roughness: 0.2 } });
    const crate = (i, x, z, s) => mk('cube', 'Crate ' + i, x, s / 2, z, s, s, s, '#b9894f', stat);
    const tree = (i, x, z) => Object.assign(mk('model', 'Tree ' + i, x, 1, z, 2, 2, 2, '#ffffff'), { props: { model: 'mdl_tree' } });
    sc.objects = [sun, fill, ground, player, gem(1, 4, -3), gem(2, -5, -6), gem(3, 8, -9), gem(4, -8, 2), gem(5, 2, -12), crate(1, 3, 2, 1.5), crate(2, -3, -3, 2), crate(3, 6, -6, 1), tree(1, -9, -8), tree(2, 10, -2), tree(3, -4, 8)];
    p.scenes = [sc]; return p;
  };

  /* ---------------------------------------------------------------- plugin-facing API (VX.game) */
  VX.game = {
    currentProject: () => { const t = VX.tabs && VX.tabs.active && VX.tabs.active(); return t && t.kind === 'game' && t.ctl ? t.ctl.project : null; },
    registerBlock(def, pluginId) { const r = VXRT.registerBlock(Object.assign({ cat: 'plugins' }, def, { plugin: pluginId })); VX.emit('gameBlocks'); return r; },
    unregisterBlock(id) { VXRT.unregisterBlock(id); VX.emit('gameBlocks'); },
    registerObjectType(def, pluginId, track, note) {
      const t = GP.registerType(Object.assign({}, def, { plugin: pluginId, builtin: false, category: def.category || 'Plugins' })); VXRT.objectTypes = VXRT.objectTypes || {}; VXRT.objectTypes[def.type] = { type: def.type, draw: def.draw, build: def.build };
      note && note('objects', def.label || def.type); track && track(() => { GP.unregisterType(def.type); delete VXRT.objectTypes[def.type]; }); return t;
    },
  };
})();
