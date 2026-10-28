/* Vextra game editor – 2D scene viewport: pan/zoom, select, move, resize, rotate, drop from palette. */
(function () {
  const { h } = VX;
  const HS = 5; // handle half-size (screen px)

  class Viewport2D {
    constructor(ctx) {
      this.ctx = ctx; this.scene = null; this.sel = []; this.view = { x: 0, y: 0, z: 1 }; this.grid = 32; this.snap = true; this.showGrid = true; this.showCam = true; this.showColliders = true; this.tool = 'move';
      this.canvas = h('canvas', { class: 'vp-canvas', tabindex: '0' }); this.g = this.canvas.getContext('2d'); this.el = h('div', { class: 'vp' }, this.canvas); this.env = null;
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.el);
      this.canvas.addEventListener('mousedown', (e) => this._down(e)); this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); const r = this.canvas.getBoundingClientRect(); this.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 0.89); }, { passive: false });
      this.canvas.addEventListener('keydown', (e) => this._key(e)); this.canvas.addEventListener('mousemove', (e) => this._hoverCursor(e));
      VX.dnd.target(this.el, (d, cx, cy) => { const p = this.toWorld(cx, cy); this.ctx.onDropType && this.ctx.onDropType(d, p.x, p.y); }, (d) => d && (d.kind === 'obj' || d.kind === 'asset-sprite' || d.kind === 'asset-model' || d.kind === 'prefab-obj'));
      this._raf = 0;
    }
    dispose() { this.ro.disconnect(); cancelAnimationFrame(this._raf); }
    setScene(scene, project) { this.scene = scene; this.project = project; this.env = VXRT.makeEnv(project, () => this.render()); this.env.settings = project.settings; this.sel = this.sel.filter((id) => scene.objects.some((o) => o.id === id)); this.render(); }
    resize() { const r = this.el.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; this.canvas.width = Math.max(1, r.width * dpr); this.canvas.height = Math.max(1, r.height * dpr); this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px'; this.dpr = dpr; if (!this._fitted && r.width > 50) { this._fitted = true; this.fit(); } this.render(); }
    toWorld(cx, cy) { const r = this.canvas.getBoundingClientRect(); return { x: (cx - r.left - this.view.x) / this.view.z, y: (cy - r.top - this.view.y) / this.view.z }; }
    zoomAt(px, py, f) { const z = VX.clamp(this.view.z * f, 0.1, 6); const k = z / this.view.z; this.view.x = px - (px - this.view.x) * k; this.view.y = py - (py - this.view.y) * k; this.view.z = z; this.render(); this.ctx.onView && this.ctx.onView(); }
    fit() { const W = this.canvas.clientWidth, H = this.canvas.clientHeight; const gw = this.project ? this.project.settings.width : 960, gh = this.project ? this.project.settings.height : 540; const z = VX.clamp(Math.min((W - 80) / gw, (H - 80) / gh), 0.1, 2); this.view = { z, x: (W - gw * z) / 2, y: (H - gh * z) / 2 }; this.render(); this.ctx.onView && this.ctx.onView(); }
    focusSelection() { const o = this.objs()[0]; if (!o) return this.fit(); const W = this.canvas.clientWidth, H = this.canvas.clientHeight; this.view.x = W / 2 - o.x * this.view.z; this.view.y = H / 2 - o.y * this.view.z; this.render(); }
    objs() { return this.scene ? this.sel.map((id) => this.scene.objects.find((o) => o.id === id)).filter(Boolean) : []; }
    select(ids) { this.sel = ids; this.render(); this.ctx.onSelect && this.ctx.onSelect(ids); }
    refresh() { this.render(); }
    render() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this._draw(); }); }

    _draw() {
      const g = this.g, dpr = this.dpr || 1, W = this.canvas.width / dpr, H = this.canvas.height / dpr; if (!this.scene) return; const css = getComputedStyle(document.documentElement);
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = css.getPropertyValue('--canvas') || '#0b0d12'; g.fillRect(0, 0, W, H);
      g.save(); g.translate(this.view.x, this.view.y); g.scale(this.view.z, this.view.z);
      const gw = this.project.settings.width, gh = this.project.settings.height;
      g.fillStyle = this.scene.bg || this.project.settings.bg; g.fillRect(0, 0, gw, gh);
      if (this.showGrid) { g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1 / this.view.z; g.beginPath(); const s = this.grid; const x0 = Math.floor(-this.view.x / this.view.z / s) * s, x1 = (W - this.view.x) / this.view.z, y0 = Math.floor(-this.view.y / this.view.z / s) * s, y1 = (H - this.view.y) / this.view.z; if (s * this.view.z > 6) { for (let x = x0; x < x1; x += s) { g.moveTo(x, y0); g.lineTo(x, y1); } for (let y = y0; y < y1; y += s) { g.moveTo(x0, y); g.lineTo(x1, y); } } g.stroke(); }
      this.env.time = performance.now() / 1000; this.env.vars = {}; this.env.sceneVars = {};
      for (const o of VXRT.draw2D.sorted(this.scene.objects)) { if (o.hidden || o.visible === false) continue; const ob = Object.assign({ anim: { frame: 0 }, flipX: false, flipY: false, blend: 'normal', shader: null }, o, { rot: o.rot || 0 }); try { VXRT.draw2D.object(g, ob, this.env); } catch (e) { /* bad object type; show box */ g.strokeStyle = '#ef5b5b'; g.strokeRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h); } if (['empty', 'camera', 'light'].includes(o.type)) { g.save(); g.translate(o.x, o.y); g.strokeStyle = 'rgba(255,255,255,.5)'; g.setLineDash([4 / this.view.z, 3 / this.view.z]); g.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h); g.restore(); } }
      if (this.showColliders) for (const o of this.scene.objects) if (o.physics && o.physics.body && o.physics.body !== 'none' && !o.hidden) { g.globalAlpha = 0.5; VXRT.draw2D.collider(g, Object.assign({ rot: 0 }, o)); g.globalAlpha = 1; }
      g.strokeStyle = 'rgba(108,140,255,.8)'; g.lineWidth = 2 / this.view.z; g.strokeRect(0, 0, gw, gh);
      const cam = this.scene.camera2d; if (this.showCam && cam) { const cz = cam.zoom || 1, cw = gw / cz, ch = gh / cz; g.strokeStyle = 'rgba(245,196,81,.55)'; g.setLineDash([8 / this.view.z, 6 / this.view.z]); g.strokeRect(cam.x - cw / 2, cam.y - ch / 2, cw, ch); g.setLineDash([]); }
      /* selection */
      for (const o of this.objs()) {
        g.save(); g.translate(o.x, o.y); g.rotate(((o.rot || 0) * Math.PI) / 180); g.strokeStyle = '#6c8cff'; g.lineWidth = 1.5 / this.view.z; g.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h);
        if (this.sel.length === 1 && !o.locked) { const s = (HS * 2) / this.view.z; g.fillStyle = '#fff'; for (const [hx, hy] of this._handles(o)) g.fillRect(hx - s / 2, hy - s / 2, s, s); g.beginPath(); g.moveTo(0, -o.h / 2); g.lineTo(0, -o.h / 2 - 26 / this.view.z); g.stroke(); g.beginPath(); g.arc(0, -o.h / 2 - 26 / this.view.z, 5 / this.view.z, 0, Math.PI * 2); g.fillStyle = '#6c8cff'; g.fill(); }
        g.restore();
      }
      g.restore(); g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '11px system-ui'; g.fillText(`${Math.round(this.view.z * 100)}%  ·  ${gw}×${gh}`, 10, H - 10);
    }
    _handles(o) { const w = o.w / 2, hh = o.h / 2; return [[-w, -hh], [0, -hh], [w, -hh], [w, 0], [w, hh], [0, hh], [-w, hh], [-w, 0]]; }
    _hit(wx, wy) { const list = VXRT.draw2D.sorted(this.scene.objects).reverse(); for (const o of list) { if (o.hidden || o.locked) continue; const dx = wx - o.x, dy = wy - o.y, r = -((o.rot || 0) * Math.PI) / 180, lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r); const pad = 4 / this.view.z; if (Math.abs(lx) <= Math.abs(o.w) / 2 + pad && Math.abs(ly) <= Math.abs(o.h) / 2 + pad) return o; } return null; }
    _localOf(o, wx, wy) { const dx = wx - o.x, dy = wy - o.y, r = -((o.rot || 0) * Math.PI) / 180; return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) }; }
    _handleAt(o, wx, wy) { const l = this._localOf(o, wx, wy), t = (HS * 2.2) / this.view.z; if (Math.hypot(l.x, l.y + o.h / 2 + 26 / this.view.z) < t) return 'rot'; const idx = this._handles(o).findIndex(([x, y]) => Math.abs(l.x - x) < t && Math.abs(l.y - y) < t); return idx < 0 ? null : idx; }
    _hoverCursor(e) { if (!this.scene || e.buttons) return; const p = this.toWorld(e.clientX, e.clientY); const o = this.objs()[0]; let c = 'default'; if (o && this.sel.length === 1) { const hd = this._handleAt(o, p.x, p.y); if (hd === 'rot') c = 'grab'; else if (hd !== null) c = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'][hd]; else if (this._hit(p.x, p.y)) c = 'move'; } else if (this._hit(p.x, p.y)) c = 'move'; this.canvas.style.cursor = c; }
    _snapv(v) { return this.snap ? Math.round(v / this.grid) * this.grid : v; }

    _down(e) {
      this.canvas.focus({ preventScroll: true }); if (!this.scene) return;
      if (e.button === 1 || e.button === 2 || (e.button === 0 && (e.altKey || this._space))) { e.preventDefault(); const sx = e.clientX, sy = e.clientY, ox = this.view.x, oy = this.view.y; const mv = (ev) => { this.view.x = ox + ev.clientX - sx; this.view.y = oy + ev.clientY - sy; this.render(); }; const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); return; }
      if (e.button !== 0) return; const p = this.toWorld(e.clientX, e.clientY); const cur = this.objs();
      if (cur.length === 1 && !cur[0].locked) { const hd = this._handleAt(cur[0], p.x, p.y); if (hd !== null) return this._transform(e, cur[0], hd); }
      const hit = this._hit(p.x, p.y);
      if (!hit) { if (!e.shiftKey) this.select([]); const sx = p.x, sy = p.y; const mv = (ev) => { const q = this.toWorld(ev.clientX, ev.clientY); const x1 = Math.min(sx, q.x), x2 = Math.max(sx, q.x), y1 = Math.min(sy, q.y), y2 = Math.max(sy, q.y); this.sel = this.scene.objects.filter((o) => !o.hidden && o.x >= x1 && o.x <= x2 && o.y >= y1 && o.y <= y2).map((o) => o.id); this.render(); this._band = { x1, y1, x2, y2 }; }; const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); this._band = null; this.ctx.onSelect && this.ctx.onSelect(this.sel); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); return; }
      if (e.shiftKey) this.select(this.sel.includes(hit.id) ? this.sel.filter((i) => i !== hit.id) : [...this.sel, hit.id]); else if (!this.sel.includes(hit.id)) this.select([hit.id]);
      const group = this.objs().filter((o) => !o.locked); const orig = group.map((o) => [o, o.x, o.y]); const sx = p.x, sy = p.y; let moved = false;
      const mv = (ev) => { const q = this.toWorld(ev.clientX, ev.clientY); let dx = q.x - sx, dy = q.y - sy; if (!moved && Math.hypot(dx, dy) * this.view.z < 3) return; moved = true; for (const [o, ox, oy] of orig) { o.x = Math.round(this.snap && !ev.altKey ? this._snapv(ox + dx) : ox + dx); o.y = Math.round(this.snap && !ev.altKey ? this._snapv(oy + dy) : oy + dy); } this.render(); this.ctx.onLiveChange && this.ctx.onLiveChange(); };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (moved) this.ctx.onChange && this.ctx.onChange(); }; addEventListener('mousemove', mv); addEventListener('mouseup', up);
    }
    _transform(e, o, hd) {
      const o0 = { x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot || 0 };
      const mv = (ev) => { const q = this.toWorld(ev.clientX, ev.clientY); if (hd === 'rot') { let a = (Math.atan2(q.y - o.y, q.x - o.x) * 180) / Math.PI + 90; if (ev.shiftKey || this.snap) a = Math.round(a / 15) * 15; o.rot = Math.round(a * 10) / 10; } else {
        const dx = q.x - o0.x, dy = q.y - o0.y, r = -(o0.rot * Math.PI) / 180, lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r); const sgnX = [-1, 0, 1, 1, 1, 0, -1, -1][hd], sgnY = [-1, -1, -1, 0, 1, 1, 1, 0][hd];
        let nw = o0.w, nh = o0.h, cx = 0, cy = 0; if (sgnX) { const edge = this.snap && !ev.altKey ? this._snapv(lx) : lx; nw = Math.max(4, sgnX > 0 ? edge + o0.w / 2 : o0.w / 2 - edge); cx = sgnX > 0 ? (edge - o0.w / 2) / 2 : (edge + o0.w / 2) / 2; } if (sgnY) { const edge = this.snap && !ev.altKey ? this._snapv(ly) : ly; nh = Math.max(4, sgnY > 0 ? edge + o0.h / 2 : o0.h / 2 - edge); cy = sgnY > 0 ? (edge - o0.h / 2) / 2 : (edge + o0.h / 2) / 2; }
        if (ev.shiftKey && sgnX && sgnY) { const k = Math.max(nw / o0.w, nh / o0.h); nw = o0.w * k; nh = o0.h * k; cx = (sgnX * (nw - o0.w)) / 2; cy = (sgnY * (nh - o0.h)) / 2; }
        const rr = (o0.rot * Math.PI) / 180; o.w = Math.round(nw); o.h = Math.round(nh); o.x = Math.round(o0.x + cx * Math.cos(rr) - cy * Math.sin(rr)); o.y = Math.round(o0.y + cx * Math.sin(rr) + cy * Math.cos(rr)); } this.render(); this.ctx.onLiveChange && this.ctx.onLiveChange(); };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); this.ctx.onChange && this.ctx.onChange(); }; addEventListener('mousemove', mv); addEventListener('mouseup', up);
    }
    _key(e) {
      if (e.key === ' ') { this._space = true; this.canvas.style.cursor = 'grab'; const up = (ev) => { if (ev.key === ' ') { this._space = false; removeEventListener('keyup', up); } }; addEventListener('keyup', up); e.preventDefault(); return; }
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(); const os = this.objs();
      if ((k === 'delete' || k === 'backspace') && os.length) { e.preventDefault(); this.ctx.onDelete && this.ctx.onDelete(this.sel.slice()); }
      else if (mod && k === 'd') { e.preventDefault(); this.ctx.onDuplicate && this.ctx.onDuplicate(); } else if (mod && k === 'c') this.ctx.onCopy && this.ctx.onCopy(); else if (mod && k === 'v') this.ctx.onPaste && this.ctx.onPaste(); else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? this.ctx.onRedo && this.ctx.onRedo() : this.ctx.onUndo && this.ctx.onUndo(); } else if (mod && k === 'a') { e.preventDefault(); this.select(this.scene.objects.map((o) => o.id)); }
      else if (k === 'f' && !mod) this.focusSelection(); else if (k.startsWith('arrow') && os.length) { e.preventDefault(); const s = e.shiftKey ? 10 : 1; for (const o of os) { if (k === 'arrowleft') o.x -= s; if (k === 'arrowright') o.x += s; if (k === 'arrowup') o.y -= s; if (k === 'arrowdown') o.y += s; } this.render(); this.ctx.onChange && this.ctx.onChange(); }
    }
  }
  VX.Viewport2D = Viewport2D;
})();
