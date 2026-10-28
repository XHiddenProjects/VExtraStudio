/* Vextra game editor – asset library (sprites, sounds, models) and shared preview helpers. */
(function () {
  const { h, uid } = VX;

  /* shared audio engine for previews inside the editor */
  const fakeGame = { data: { assets: { sounds: {} } }, log() {} };
  let engine = null;
  VX.assetAudio = {
    engine() { if (!engine) engine = new VXRT.AudioEngine(fakeGame); return engine; },
    play(asset, opts) { const e = this.engine(); fakeGame.data.assets.sounds = { [asset.id]: asset }; return e.play(asset.id, opts); },
    stop() { if (engine) engine.stopAll(); },
  };

  /* small three.js preview used by the model studio and the asset cards */
  class ModelPreview {
    constructor(w = 320, hgt = 260) {
      const T = window.THREE; this.T = T; this.el = h('canvas', { class: 'mp-canvas' }); this.w = w; this.hgt = hgt;
      this.r = new T.WebGLRenderer({ canvas: this.el, antialias: true, alpha: true }); this.r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); this.r.setSize(w, hgt, false); this.el.style.width = w + 'px'; this.el.style.height = hgt + 'px';
      this.scene = new T.Scene(); this.scene.add(new T.AmbientLight(0xffffff, 0.7)); const d = new T.DirectionalLight(0xffffff, 1.1); d.position.set(3, 5, 4); this.scene.add(d);
      const grid = new T.GridHelper(4, 8, 0x4a5578, 0x2a3047); grid.position.y = -0.5; this.scene.add(grid);
      this.cam = new T.PerspectiveCamera(45, w / hgt, 0.05, 100); this.cam.position.set(1.8, 1.4, 2.2); this.orbit = new VX_THREE.OrbitControls(this.cam, this.el); this.orbit.addEventListener('change', () => this.draw()); this.orbit.update(); this.obj = null;
    }
    set(asset, project) {
      const T = this.T; if (this.obj) this.scene.remove(this.obj); this.obj = null; if (!asset) { this.draw(); return; }
      const env = { assets: { sprites: {}, sounds: {}, models: { m: asset }, ...(project ? { sprites: project.assets.sprites } : {}) }, imgs: new Map(), onImageLoad: () => this.draw() };
      try {
        const o = { type: 'model', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, w: 1, h: 1, d: 1, color: '#ffffff', alpha: 1, material: {}, props: { model: 'm' } };
        this.obj = VXRT.build3D(T, o, env);
        if (asset.kind === 'voxel') { const b = new T.Box3().setFromObject(this.obj); const s = new T.Vector3(); b.getSize(s); const k = 1.6 / Math.max(s.x, s.y, s.z, 1e-6); const c = new T.Vector3(); b.getCenter(c); this.obj.scale.setScalar(k); this.obj.position.set(-c.x * k, -c.y * k, -c.z * k); }
        this.scene.add(this.obj);
      } catch (e) { console.warn('preview failed', e); }
      this.draw();
    }
    draw() { this.r.render(this.scene, this.cam); }
    dispose() { this.orbit.dispose(); this.r.dispose(); }
  }
  VX.ModelPreview = ModelPreview;

  function thumbOf(kind, a, project) {
    if (kind === 'sprites') { const im = h('img', { class: 'as-img', src: (a.frames && a.frames[0]) || '', draggable: 'false' }); if (project && project.settings.pixelArt) im.style.imageRendering = 'pixelated'; return im; }
    if (kind === 'sounds') return h('div', { class: 'as-glyph' }, a.kind === 'sample' ? '🎵' : a.kind === 'melody' ? '🎼' : '🔊');
    return h('div', { class: 'as-glyph' }, a.kind === 'voxel' ? '🧱' : a.kind === 'obj' ? '📐' : '🧩');
  }

  class AssetManager {
    /** ctx: { project, onChange(), openStudio(kind,id) } */
    constructor(ctx) {
      this.ctx = ctx; this.tab = 'sprites'; this.filter = ''; this.el = h('div', { class: 'assets' }); this.render();
    }
    get A() { return this.ctx.project.assets; }
    render() {
      const el = this.el; el.textContent = ''; const kinds = [['sprites', 'Sprites', '🖼'], ['sounds', 'Sounds', '🔊'], ['models', '3D Models', '🧊']];
      const bar = h('div', { class: 'as-bar' }, kinds.map(([k, l, i]) => h('button', { class: 'as-tab' + (this.tab === k ? ' on' : ''), onclick: () => { this.tab = k; this.render(); } }, i + ' ' + l + ' ', h('span', { class: 'cnt' }, String(Object.keys(this.A[k]).length)))),
        h('span', { class: 'sp' }), h('input', { class: 'as-search', placeholder: 'Filter…', value: this.filter, oninput: (e) => { this.filter = e.target.value; this.renderGrid(); } }),
        h('button', { class: 'btn sm primary', onclick: () => this.create() }, '＋ New'), h('button', { class: 'btn sm', onclick: () => this.import() }, 'Import…'));
      this.grid = h('div', { class: 'as-grid' }); el.append(bar, this.grid, h('div', { class: 'as-hint' }, 'Double-click to edit • drag onto the Scene to place • assets are stored inside your .vxgame file'));
      this.renderGrid();
    }
    renderGrid() {
      const kind = this.tab, list = Object.values(this.A[kind]).filter((a) => !this.filter || a.name.toLowerCase().includes(this.filter.toLowerCase())); this.grid.textContent = '';
      if (!list.length) this.grid.append(h('div', { class: 'as-empty' }, 'Nothing here yet. Click ', h('b', {}, '＋ New'), ' to draw, synthesize or build one — or ', h('b', {}, 'Import…'), ' a file.'));
      for (const a of list) {
        const card = h('div', { class: 'as-card', title: a.id }, thumbOf(kind, a, this.ctx.project), h('div', { class: 'as-name' }, a.name), h('div', { class: 'as-meta' }, kind === 'sprites' ? `${a.w}×${a.h} · ${a.frames.length}f` : kind === 'sounds' ? (a.kind || 'synth') : (a.kind || 'voxel')));
        card.addEventListener('dblclick', () => this.ctx.openStudio(kind, a.id));
        card.addEventListener('contextmenu', (e) => { e.preventDefault(); VX.ui.menu(e.clientX, e.clientY, [{ label: 'Edit', run: () => this.ctx.openStudio(kind, a.id) }, ...(kind === 'sounds' ? [{ label: 'Play', run: () => VX.assetAudio.play(a) }] : []), { label: 'Rename…', run: () => this.rename(kind, a) }, { label: 'Duplicate', run: () => this.duplicate(kind, a) }, { label: 'Copy id', run: () => navigator.clipboard && navigator.clipboard.writeText(a.id) }, '-', { label: 'Delete', danger: true, run: () => this.remove(kind, a) }]); });
        if (kind === 'sounds') card.addEventListener('click', () => VX.assetAudio.play(a));
        VX.dnd.draggable(card, () => ({ kind: kind === 'sprites' ? 'asset-sprite' : kind === 'models' ? 'asset-model' : 'asset-sound', id: a.id, name: a.name }), a.name);
        this.grid.append(card);
      }
    }
    async rename(kind, a) { const n = await VX.ui.ask('Rename asset', a.name); if (n) { a.name = n; this.ctx.onChange(); this.renderGrid(); } }
    duplicate(kind, a) { const c = VX.clone(a); c.id = uid(kind.slice(0, 3)); c.name = a.name + ' copy'; this.A[kind][c.id] = c; this.ctx.onChange(); this.renderGrid(); }
    async remove(kind, a) { if (!(await VX.ui.confirm(`Delete “${a.name}”? Objects and blocks using it will show nothing.`, 'Delete', { danger: true }))) return; delete this.A[kind][a.id]; this.ctx.onChange(); this.renderGrid(); }
    async create() {
      const kind = this.tab;
      if (kind === 'sprites') { const v = await VX.ui.form({ title: 'New sprite', fields: [{ key: 'name', label: 'Name', value: 'sprite', required: true }, { key: 'size', label: 'Canvas size', type: 'select', value: '32', options: [['16', '16 × 16'], ['32', '32 × 32'], ['48', '48 × 48'], ['64', '64 × 64'], ['128', '128 × 128'], ['64x32', '64 × 32 (wide)'], ['32x64', '32 × 64 (tall)']] }], submit: 'Create' }); if (!v) return; const [w, hh] = v.size.includes('x') ? v.size.split('x').map(Number) : [+v.size, +v.size]; const a = { id: uid('spr'), name: v.name, w, h: hh, frames: [VX.blankFrame(w, hh)], fps: 8, anims: {} }; this.A.sprites[a.id] = a; this.ctx.onChange(); this.renderGrid(); this.ctx.openStudio('sprites', a.id); }
      else if (kind === 'sounds') { const a = { id: uid('snd'), name: 'sound', kind: 'synth', params: Object.assign({}, VX.SOUND_PRESETS.coin) }; this.A.sounds[a.id] = a; this.ctx.onChange(); this.renderGrid(); this.ctx.openStudio('sounds', a.id); }
      else { const v = await VX.ui.form({ title: 'New 3D model', fields: [{ key: 'name', label: 'Name', value: 'model', required: true }, { key: 'kind', label: 'Type', type: 'select', value: 'voxel', options: [['voxel', 'Voxel (paint blocks)'], ['group', 'Shape group (combine primitives)'], ['obj', 'OBJ mesh (paste / import)']] }], submit: 'Create' }); if (!v) return; const a = { id: uid('mdl'), name: v.name, kind: v.kind }; if (v.kind === 'voxel') { a.palette = ['#e0e4ee', '#6c8cff', '#ff7a8a', '#ffd54a', '#4ade80', '#8a5a2b', '#1b2a63', '#10131a']; a.voxels = [[0, 0, 0, 1], [1, 0, 0, 1], [0, 1, 0, 2]]; } else if (v.kind === 'group') a.parts = [{ type: 'cube', x: 0, y: 0, z: 0, w: 1, h: 1, d: 1, color: '#6c8cff' }]; else a.text = 'v -0.5 -0.5 0\nv 0.5 -0.5 0\nv 0 0.5 0\nf 1 2 3\n'; this.A.models[a.id] = a; this.ctx.onChange(); this.renderGrid(); this.ctx.openStudio('models', a.id); }
    }
    async import() {
      const kind = this.tab; const accept = kind === 'sprites' ? 'image/*' : kind === 'sounds' ? 'audio/*' : '.obj';
      const files = await VX.pickBrowserFile(accept, true); if (!files || !files.length) return;
      for (const f of files) {
        const name = f.name.replace(/\.[^.]+$/, '');
        try {
          if (kind === 'sprites') { const url = await VX.readFileAsDataURL(f); const dim = await new Promise((res) => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([32, 32]); im.src = url; }); const a = { id: uid('spr'), name, w: dim[0], h: dim[1], frames: [url], fps: 8, anims: {} }; this.A.sprites[a.id] = a; }
          else if (kind === 'sounds') { const url = await VX.readFileAsDataURL(f); if (url.length > 4_000_000) VX.ui.toast('Large sound (' + (url.length / 1e6).toFixed(1) + ' MB) – it will bloat the project file', 'warn'); const a = { id: uid('snd'), name, kind: 'sample', data: url }; this.A.sounds[a.id] = a; }
          else { const text = await VX.readFileAsText(f); const a = { id: uid('mdl'), name, kind: 'obj', text }; this.A.models[a.id] = a; }
        } catch (e) { VX.ui.toast('Could not import ' + f.name + ': ' + e.message, 'error'); }
      }
      this.ctx.onChange(); this.render();
    }
  }
  VX.AssetManager = AssetManager;

  VX.blankFrame = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c.toDataURL(); };

  /** Open an asset studio in a modal. */
  VX.openStudio = function (kind, asset, project, onChange) {
    const make = { sprites: VX.SpriteEditor, sounds: VX.SoundEditor, models: VX.ModelEditor }[kind]; if (!make) return;
    const ed = new make(asset, project, onChange);
    const m = VX.ui.modal({ title: (kind === 'sprites' ? 'Sprite Editor – ' : kind === 'sounds' ? 'Sound Studio – ' : 'Model Editor – ') + asset.name, body: ed.el, wide: true, className: 'studio flush', onClose: () => { ed.dispose && ed.dispose(); onChange && onChange(true); } });
    ed.mounted && ed.mounted();
    return m;
  };
})();
