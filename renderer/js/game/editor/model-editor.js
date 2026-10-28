/* Vextra game editor – 3D model editor: voxel painter, primitive-group builder and OBJ import. */
(function () {
  const { h } = VX;
  const PRIMS = ['cube', 'sphere', 'cylinder', 'cone', 'plane', 'capsule', 'torus'];

  class ModelEditor {
    constructor(asset, project, onChange) {
      this.a = asset; this.project = project; this.onChange = onChange; this.layer = 0; this.N = 16; this.pc = 1; this.sel = 0; this.el = h('div', { class: 'me' }); this.prev = null; this.build();
    }
    ch() { this.onChange && this.onChange(); }
    refresh() { clearTimeout(this._r); this._r = setTimeout(() => this.prev && this.prev.set(this.a, this.project), 60); }
    build() {
      const a = this.a, el = this.el; el.textContent = ''; if (this.prev) this.prev.dispose();
      this.prev = new VX.ModelPreview(340, 300);
      const name = h('input', { value: a.name, oninput: (e) => { a.name = e.target.value; this.ch(); } });
      const side = h('div', { class: 'me-side' }, h('label', { class: 'mini' }, 'Name'), name, h('label', { class: 'mini' }, 'Live preview (drag to orbit, scroll to zoom)'), this.prev.el,
        h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => this.exportOBJ() }, 'Export OBJ')), h('div', { class: 'mini' }, 'Models fit a 1×1×1 box; use the object’s size in the inspector to scale.'));
      this.main = h('div', { class: 'me-main' }); el.append(this.main, side);
      if (a.kind === 'voxel') this.voxelUI(); else if (a.kind === 'group') this.groupUI(); else this.objUI();
      this.refresh();
    }
    /* ---------------- voxel ---------------- */
    voxelUI() {
      const a = this.a, N = this.N; a.palette = a.palette || ['#e0e4ee']; a.voxels = a.voxels || [];
      const map = () => { const m = new Map(); for (const v of a.voxels) m.set(v[0] + ',' + v[1] + ',' + v[2], v); return m; };
      const cv = h('canvas', { class: 'me-vox', width: N * 24, height: N * 24 }); let m = map();
      const draw = () => { const x = cv.getContext('2d'), s = 24; x.clearRect(0, 0, cv.width, cv.height); x.fillStyle = '#10131a'; x.fillRect(0, 0, cv.width, cv.height);
        for (const v of a.voxels) { if (v[1] === this.layer - 1) { x.fillStyle = a.palette[v[3] % a.palette.length]; x.globalAlpha = 0.18; x.fillRect(v[0] * s, (N - 1 - v[2]) * s, s, s); x.globalAlpha = 1; } }
        for (const v of a.voxels) if (v[1] === this.layer) { x.fillStyle = a.palette[v[3] % a.palette.length]; x.fillRect(v[0] * s, (N - 1 - v[2]) * s, s - 1, s - 1); }
        x.strokeStyle = 'rgba(255,255,255,.08)'; x.beginPath(); for (let i = 0; i <= N; i++) { x.moveTo(i * s + 0.5, 0); x.lineTo(i * s + 0.5, cv.height); x.moveTo(0, i * s + 0.5); x.lineTo(cv.width, i * s + 0.5); } x.stroke(); x.strokeStyle = 'rgba(108,140,255,.5)'; x.strokeRect(0.5, 0.5, cv.width - 1, cv.height - 1); };
      const paint = (e, erase) => { const r = cv.getBoundingClientRect(), gx = Math.floor(((e.clientX - r.left) / r.width) * N), gz = N - 1 - Math.floor(((e.clientY - r.top) / r.height) * N); if (gx < 0 || gz < 0 || gx >= N || gz >= N) return; const k = gx + ',' + this.layer + ',' + gz, ex = m.get(k);
        if (erase) { if (ex) { a.voxels.splice(a.voxels.indexOf(ex), 1); m.delete(k); } } else if (ex) ex[3] = this.pc; else { const v = [gx, this.layer, gz, this.pc]; a.voxels.push(v); m.set(k, v); } draw(); this.ch(); this.refresh(); };
      let down = false, er = false; cv.addEventListener('contextmenu', (e) => e.preventDefault()); cv.addEventListener('pointerdown', (e) => { down = true; er = e.button === 2; cv.setPointerCapture(e.pointerId); paint(e, er); }); cv.addEventListener('pointermove', (e) => down && paint(e, er)); cv.addEventListener('pointerup', () => { down = false; });
      const layerLab = h('b', {}, 'Layer ' + this.layer), slider = h('input', { type: 'range', min: 0, max: N - 1, value: this.layer, oninput: (e) => { this.layer = +e.target.value; layerLab.textContent = 'Layer ' + this.layer; draw(); } });
      const pal = h('div', { class: 'me-pal' }); const drawPal = () => { pal.textContent = ''; a.palette.forEach((c, i) => pal.append(h('span', { class: 'sw' + (i === this.pc ? ' on' : ''), style: 'background:' + c, title: c + ' (double-click to change)', onclick: () => { this.pc = i; drawPal(); }, ondblclick: () => { const inp = h('input', { type: 'color', value: c, oninput: (e) => { a.palette[i] = e.target.value; drawPal(); draw(); this.ch(); this.refresh(); } }); inp.click(); } }))); pal.append(h('button', { class: 'btn sm', onclick: () => { a.palette.push('#ffffff'); this.pc = a.palette.length - 1; drawPal(); } }, '＋')); }; drawPal();
      const shift = (dx, dy, dz) => { for (const v of a.voxels) { v[0] = VX.clamp(v[0] + dx, 0, N - 1); v[1] = VX.clamp(v[1] + dy, 0, N - 1); v[2] = VX.clamp(v[2] + dz, 0, N - 1); } m = map(); draw(); this.ch(); this.refresh(); };
      const mirror = () => { const mx = Math.max(0, ...a.voxels.map((v) => v[0])); for (const v of [...a.voxels]) { const nx = mx - v[0]; if (!m.has(nx + ',' + v[1] + ',' + v[2])) { const nv = [nx, v[1], v[2], v[3]]; a.voxels.push(nv); m.set(nv[0] + ',' + nv[1] + ',' + nv[2], nv); } } draw(); this.ch(); this.refresh(); };
      this.main.append(h('div', { class: 'row' }, layerLab, slider, h('span', { class: 'mini' }, 'Left-click paints • right-click erases • faint = layer below')), cv, pal,
        h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', onclick: () => { this.layer = Math.min(N - 1, this.layer + 1); slider.value = this.layer; layerLab.textContent = 'Layer ' + this.layer; draw(); } }, 'Layer ▲'), h('button', { class: 'btn sm', onclick: () => { this.layer = Math.max(0, this.layer - 1); slider.value = this.layer; layerLab.textContent = 'Layer ' + this.layer; draw(); } }, 'Layer ▼'), h('button', { class: 'btn sm', onclick: mirror }, 'Mirror X'), h('button', { class: 'btn sm', onclick: () => shift(0, 1, 0) }, 'Shift up'), h('button', { class: 'btn sm', onclick: () => shift(1, 0, 0) }, 'Shift →'), h('button', { class: 'btn sm', onclick: () => shift(-1, 0, 0) }, 'Shift ←'), h('button', { class: 'btn sm', onclick: () => { a.voxels.length = 0; m = map(); draw(); this.ch(); this.refresh(); } }, 'Clear all')));
      draw();
    }
    /* ---------------- group ---------------- */
    groupUI() {
      const a = this.a; a.parts = a.parts || []; const list = h('div', { class: 'me-parts' });
      const num = (p, k, step = 0.1) => h('input', { type: 'number', step, value: p[k] ?? 0, class: 'n', oninput: (e) => { p[k] = parseFloat(e.target.value) || 0; this.ch(); this.refresh(); } });
      const draw = () => { list.textContent = ''; a.parts.forEach((p, i) => list.append(h('div', { class: 'me-part' + (i === this.sel ? ' on' : ''), onclick: () => { this.sel = i; } },
        h('div', { class: 'row' }, h('b', {}, '#' + (i + 1)), h('select', { onchange: (e) => { p.type = e.target.value; this.ch(); this.refresh(); } }, PRIMS.map((t) => h('option', { value: t, selected: t === p.type }, t))), h('input', { type: 'color', value: p.color || '#cccccc', oninput: (e) => { p.color = e.target.value; this.ch(); this.refresh(); } }), h('span', { class: 'sp' }), h('button', { class: 'btn sm', title: 'Duplicate', onclick: () => { a.parts.splice(i + 1, 0, VX.clone(p)); draw(); this.ch(); this.refresh(); } }, '⧉'), h('button', { class: 'btn sm', onclick: () => { a.parts.splice(i, 1); draw(); this.ch(); this.refresh(); } }, '✕')),
        h('div', { class: 'row g6' }, h('span', { class: 'mini' }, 'pos'), num(p, 'x'), num(p, 'y'), num(p, 'z'), h('span', { class: 'mini' }, 'size'), num(p, 'w'), num(p, 'h'), num(p, 'd')),
        h('div', { class: 'row g6' }, h('span', { class: 'mini' }, 'rot'), num(p, 'rx', 5), num(p, 'ry', 5), num(p, 'rz', 5))))); };
      this.main.append(h('div', { class: 'row' }, h('b', {}, 'Parts'), h('button', { class: 'btn sm primary', onclick: () => { a.parts.push({ type: 'cube', x: 0, y: a.parts.length * 0.6, z: 0, w: 1, h: 0.5, d: 1, rx: 0, ry: 0, rz: 0, color: '#6c8cff' }); draw(); this.ch(); this.refresh(); } }, '＋ Add shape'), h('span', { class: 'mini' }, 'Parts are combined and scaled to fit a unit box.')), list); draw();
    }
    /* ---------------- obj ---------------- */
    objUI() {
      const a = this.a, ta = h('textarea', { class: 'me-obj', spellcheck: 'false', oninput: (e) => { a.text = e.target.value; this.ch(); this.refresh(); } }, a.text || '');
      const stats = h('div', { class: 'mini' }, ''); const upd = () => { const t = ta.value; stats.textContent = `${(t.match(/^v /gm) || []).length} vertices · ${(t.match(/^f /gm) || []).length} faces`; }; ta.addEventListener('input', upd); upd();
      this.main.append(h('div', { class: 'row' }, h('b', {}, 'OBJ mesh'), h('button', { class: 'btn sm', onclick: async () => { const f = (await VX.pickBrowserFile('.obj', false))[0]; if (!f) return; a.text = await VX.readFileAsText(f); ta.value = a.text; upd(); this.ch(); this.refresh(); } }, 'Import .obj…'), stats), ta, h('div', { class: 'mini' }, 'Wavefront OBJ (vertices, faces; materials are ignored – use the object’s color).'));
    }
    exportOBJ() {
      const T = window.THREE; let text = '';
      try { const g = VXRT.build3D(T, { type: 'model', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, w: 1, h: 1, d: 1, color: '#fff', alpha: 1, material: {}, props: { model: 'm' } }, { assets: { models: { m: this.a }, sprites: {} }, imgs: new Map() }); g.updateMatrixWorld(true); let off = 1;
        g.traverse((m) => { if (!m.isMesh) return; const pos = m.geometry.attributes.position, idx = m.geometry.index, v = new T.Vector3(); for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); text += `v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}\n`; } const n = idx ? idx.count : pos.count; for (let i = 0; i < n; i += 3) { const t = idx ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)] : [i, i + 1, i + 2]; text += `f ${t[0] + off} ${t[1] + off} ${t[2] + off}\n`; } off += pos.count; });
      } catch (e) { return VX.ui.toast('Export failed: ' + e.message, 'error'); }
      VX.download((this.a.name || 'model') + '.obj', text);
    }
    dispose() { clearTimeout(this._r); this.prev && this.prev.dispose(); }
  }
  VX.ModelEditor = ModelEditor;
})();
