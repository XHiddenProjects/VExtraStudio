/* Vextra game editor – 3D scene viewport (three.js): orbit camera, gizmos, picking and palette drops. */
(function () {
  const { h } = VX;
  const deg = (r) => (r * 180) / Math.PI, rad = (d) => (d * Math.PI) / 180;

  class Viewport3D {
    constructor(ctx) {
      const T = window.THREE; this.T = T; this.ctx = ctx; this.scene = null; this.project = null; this.sel = []; this.map = new Map(); this.tool = 'translate'; this.snap = false; this.showGrid = true; this._need = false;
      this.el = h('div', { class: 'vp' }); this.canvas = h('canvas', { class: 'vp-canvas', tabindex: '0' }); this.el.append(this.canvas);
      this.renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: true, preserveDrawingBuffer: false }); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap; this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      this.three = new T.Scene(); this.cam = new T.PerspectiveCamera(60, 1, 0.05, 2000); this.cam.position.set(9, 7, 11);
      this.orbit = new VX_THREE.OrbitControls(this.cam, this.canvas); this.orbit.enableDamping = false; this.orbit.target.set(0, 1, 0); this.orbit.addEventListener('change', () => this.render()); this.orbit.mouseButtons = { LEFT: -1, MIDDLE: T.MOUSE.DOLLY, RIGHT: T.MOUSE.ROTATE }; this.orbit.update();
      this.tc = new VX_THREE.TransformControls(this.cam, this.canvas); this.tc.addEventListener('change', () => this.render()); this.tc.addEventListener('dragging-changed', (e) => { this.orbit.enabled = !e.value; this._dragging = e.value; if (!e.value) this.ctx.onChange && this.ctx.onChange(); });
      this.tc.addEventListener('objectChange', () => this._fromGizmo()); this.three.add(this.tc.getHelper ? this.tc.getHelper() : this.tc);
      this.gridHelper = new T.GridHelper(60, 60, 0x4a5578, 0x2a3047); this.gridHelper.material.transparent = true; this.gridHelper.material.opacity = 0.5; this.three.add(this.gridHelper); this.axes = new T.AxesHelper(1.5); this.three.add(this.axes);
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.el); this.canvas.addEventListener('pointerdown', (e) => this._down(e)); this.canvas.addEventListener('keydown', (e) => this._key(e)); this.canvas.addEventListener('wheel', () => this.render(), { passive: true });
      this.env = { assets: {}, data: null, imgs: new Map(), tex3d: new Map(), onImageLoad: () => this.render() }; this.ray = new T.Raycaster();
      VX.dnd.target(this.el, (d, cx, cy) => { const p = this.dropPoint(cx, cy); this.ctx.onDropType && this.ctx.onDropType(d, p.x, p.y, p.z); }, (d) => d && (d.kind === 'obj' || d.kind === 'prefab-obj' || d.kind === 'asset-model' || d.kind === 'asset-sprite'));
    }
    dispose() { this.ro.disconnect(); this.tc.dispose && this.tc.dispose(); this.orbit.dispose(); this.renderer.dispose(); }
    resize() { const r = this.el.getBoundingClientRect(); if (r.width < 2) return; this.renderer.setSize(r.width, r.height, false); this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px'; this.cam.aspect = r.width / r.height; this.cam.updateProjectionMatrix(); this.render(); }
    render() { if (this._need) return; this._need = true; requestAnimationFrame(() => { this._need = false; this._upd(); this.renderer.render(this.three, this.cam); }); }
    _upd() { for (const [id, rec] of this.map) { const o = rec.o; if (rec.root.userData.isLight || o.type === 'camera') { /* handled by sync */ } if (rec.root.material && rec.root.material.isVxShader) rec.root.material.uniforms.uTime.value = performance.now() / 1000; } }
    setScene(scene, project) {
      this.scene = scene; this.project = project; this.env.assets = project.assets; this.env.data = project; this.env.tex3d = new Map(); this.rebuild();
      const e = scene.env || {}; this.three.background = new this.T.Color(e.sky || scene.bg || '#1a2233');
    }
    rebuild() {
      const T = this.T; for (const rec of this.map.values()) { this.three.remove(rec.root); if (rec.gizmo) this.three.remove(rec.gizmo); } this.map.clear(); this.tc.detach();
      for (const l of [...this.three.children]) if (l.userData.vxEnv) this.three.remove(l);
      const e = this.scene.env || {}; const amb = new T.AmbientLight(e.ambientColor || '#ffffff', e.ambientIntensity ?? 0.45); amb.userData.vxEnv = true; this.three.add(amb);
      if (e.fog) { this.three.fog = new T.Fog(e.fogColor || e.sky || '#1a2233', e.fogNear ?? 20, e.fogFar ?? 120); } else this.three.fog = null;
      this.three.background = new T.Color(e.sky || this.scene.bg || '#1a2233');
      for (const o of this.scene.objects) this._add(o); this.syncSel(); this.render();
    }
    _add(o) {
      const T = this.T; const root = VXRT.build3D(T, o, this.env); const rec = { o, root }; this.map.set(o.id, rec); root.userData.vxObj = o; root.traverse((c) => { c.userData.vxObj = o; });
      if (o.shader && o.shader.name && o.shader.name !== 'none') { try { VXRT.applyShader3D(T, { ...o, obj3d: root }, this.env); } catch { /* ignore */ } }
      this._place(rec); root.visible = o.visible !== false && !o.hidden; this.three.add(root);
      if (['light', 'camera', 'empty'].includes(o.type)) { const col = o.type === 'light' ? 0xffd54a : o.type === 'camera' ? 0x6c8cff : 0xaaaaaa; const geo = o.type === 'camera' ? new T.ConeGeometry(0.35, 0.7, 4) : o.type === 'light' ? new T.OctahedronGeometry(0.3) : new T.BoxGeometry(0.4, 0.4, 0.4); const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: col, wireframe: true })); if (o.type === 'camera') m.rotation.x = -Math.PI / 2; const gz = new T.Group(); gz.add(m); gz.userData.vxObj = o; m.userData.vxObj = o; rec.gizmo = gz; this.three.add(gz); this._placeGizmo(rec); }
    }
    _place(rec) { const o = rec.o, r = rec.root; r.position.set(o.x, o.y, o.z); r.rotation.set(rad(o.rx || 0), rad(o.ry || 0), rad(o.rz || 0), 'YXZ'); if (!r.userData.isLight && o.type !== 'camera') r.scale.set((o.w || 1) * (o.flipX ? -1 : 1), (o.h || 1) * (o.flipY ? -1 : 1), o.d || 1); }
    _placeGizmo(rec) { if (!rec.gizmo) return; rec.gizmo.position.set(rec.o.x, rec.o.y, rec.o.z); rec.gizmo.rotation.set(rad(rec.o.rx || 0), rad(rec.o.ry || 0), rad(rec.o.rz || 0), 'YXZ'); }
    refreshObject(id) { const rec = this.map.get(id); const o = this.scene.objects.find((x) => x.id === id); if (!o) return; if (rec) { this.three.remove(rec.root); if (rec.gizmo) this.three.remove(rec.gizmo); this.map.delete(id); } this._add(o); if (this.sel.includes(id)) this.syncSel(); this.render(); }
    refreshAll() { this.rebuild(); }
    syncPositions() { for (const rec of this.map.values()) { this._place(rec); this._placeGizmo(rec); } this.render(); }
    select(ids) { this.sel = ids; this.syncSel(); this.ctx.onSelect && this.ctx.onSelect(ids); }
    syncSel() { const rec = this.sel.length === 1 ? this.map.get(this.sel[0]) : null; this.tc.detach(); if (rec && !rec.o.locked) { this.tc.attach(rec.gizmo || rec.root); this.tc.setMode(this.tool); this._applySnap(); } for (const r of this.map.values()) this._outline(r, this.sel.includes(r.o.id)); this.render(); }
    _outline(rec, on) { if (rec._box) { this.three.remove(rec._box); rec._box = null; } if (on) { const b = new this.T.Box3().setFromObject(rec.root); if (!b.isEmpty()) { rec._box = new this.T.Box3Helper(b, 0x6c8cff); this.three.add(rec._box); } } }
    setTool(t) { this.tool = t; this.tc.setMode(t); this.render(); }
    _applySnap() { this.tc.setTranslationSnap(this.snap ? 0.5 : null); this.tc.setRotationSnap(this.snap ? rad(15) : null); this.tc.setScaleSnap(this.snap ? 0.25 : null); }
    setSnap(v) { this.snap = v; this._applySnap(); }
    setGrid(v) { this.showGrid = v; this.gridHelper.visible = v; this.axes.visible = v; this.render(); }
    _fromGizmo() {
      const rec = this.map.get(this.sel[0]); if (!rec) return; const g = this.tc.object, o = rec.o, r = (v) => Math.round(v * 1000) / 1000;
      o.x = r(g.position.x); o.y = r(g.position.y); o.z = r(g.position.z); o.rx = r(deg(g.rotation.x)); o.ry = r(deg(g.rotation.y)); o.rz = r(deg(g.rotation.z));
      if (rec.gizmo) { rec.root.position.copy(g.position); rec.root.rotation.copy(g.rotation); } else if (!rec.root.userData.isLight && o.type !== 'camera') { o.w = r(Math.abs(g.scale.x)); o.h = r(Math.abs(g.scale.y)); o.d = r(Math.abs(g.scale.z)); }
      if (rec._box) { this.three.remove(rec._box); const b = new this.T.Box3().setFromObject(rec.root); rec._box = new this.T.Box3Helper(b, 0x6c8cff); this.three.add(rec._box); }
      this.ctx.onLiveChange && this.ctx.onLiveChange();
    }
    pick(cx, cy) { const T = this.T, r = this.canvas.getBoundingClientRect(); this.ray.setFromCamera(new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.cam); const objs = []; for (const rec of this.map.values()) { if (rec.root.visible) objs.push(rec.root); if (rec.gizmo) objs.push(rec.gizmo); } const hits = this.ray.intersectObjects(objs, true); for (const hit of hits) { const o = hit.object.userData.vxObj; if (o && !o.locked) return o; } return null; }
    dropPoint(cx, cy) { const T = this.T, r = this.canvas.getBoundingClientRect(); this.ray.setFromCamera(new T.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.cam); const plane = new T.Plane(new T.Vector3(0, 1, 0), 0); const p = new T.Vector3(); if (this.ray.ray.intersectPlane(plane, p)) return { x: Math.round(p.x * 2) / 2, y: 0, z: Math.round(p.z * 2) / 2 }; return { x: this.orbit.target.x, y: 0, z: this.orbit.target.z }; }
    _down(e) {
      this.canvas.focus({ preventScroll: true });
      if (e.button === 0 && !this._dragging && !(this.tc.axis)) {
        const sx = e.clientX, sy = e.clientY; let moved = false; const mv = (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) moved = true; if (moved && ev.buttons === 1 && !this._dragging) { /* left-drag orbits as well */ } };
        const up = (ev) => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved || this._dragging || this.tc.axis) return; const o = this.pick(ev.clientX, ev.clientY); if (o) this.select(e.shiftKey ? (this.sel.includes(o.id) ? this.sel.filter((i) => i !== o.id) : [...this.sel, o.id]) : [o.id]); else this.select([]); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
        // left-drag on empty space = orbit
        if (!this.pick(e.clientX, e.clientY)) { this._leftOrbit(e); }
      }
    }
    _leftOrbit(e) { const sx = e.clientX, sy = e.clientY; const o = this.orbit; const mv = (ev) => { if (this.tc.axis || this._dragging) return; const dx = ev.clientX - sx, dy = ev.clientY - sy; if (Math.hypot(dx, dy) < 4) return; const T = this.T; const off = this.cam.position.clone().sub(o.target); const sph = new T.Spherical().setFromVector3(off); sph.theta -= (ev.movementX || 0) * 0.008; sph.phi = VX.clamp(sph.phi - (ev.movementY || 0) * 0.008, 0.05, Math.PI - 0.05); off.setFromSpherical(sph); this.cam.position.copy(o.target).add(off); this.cam.lookAt(o.target); this.render(); }; const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); }
    focusSelection() { const rec = this.map.get(this.sel[0]); const T = this.T; let c = new T.Vector3(0, 1, 0), r = 5; if (rec) { const b = new T.Box3().setFromObject(rec.root); if (!b.isEmpty()) { b.getCenter(c); r = Math.max(3, b.getSize(new T.Vector3()).length() * 1.8); } } const dir = this.cam.position.clone().sub(this.orbit.target).normalize(); this.orbit.target.copy(c); this.cam.position.copy(c).addScaledVector(dir, r); this.orbit.update(); this.render(); }
    fit() { this.orbit.target.set(0, 1, 0); this.cam.position.set(9, 7, 11); this.orbit.update(); this.render(); }
    _key(e) {
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (k === 'w' && !mod) { this.setTool('translate'); this.ctx.onTool && this.ctx.onTool('translate'); } else if (k === 'e' && !mod) { this.setTool('rotate'); this.ctx.onTool && this.ctx.onTool('rotate'); } else if (k === 'r' && !mod) { this.setTool('scale'); this.ctx.onTool && this.ctx.onTool('scale'); }
      else if (k === 'f' && !mod) this.focusSelection(); else if ((k === 'delete' || k === 'backspace') && this.sel.length) { e.preventDefault(); this.ctx.onDelete && this.ctx.onDelete(this.sel.slice()); }
      else if (mod && k === 'd') { e.preventDefault(); this.ctx.onDuplicate && this.ctx.onDuplicate(); } else if (mod && k === 'c') this.ctx.onCopy && this.ctx.onCopy(); else if (mod && k === 'v') this.ctx.onPaste && this.ctx.onPaste(); else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? this.ctx.onRedo && this.ctx.onRedo() : this.ctx.onUndo && this.ctx.onUndo(); }
    }
  }
  VX.Viewport3D = Viewport3D;
})();
