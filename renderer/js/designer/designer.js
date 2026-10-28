/* Visual UI designer: absolute-positioned components, multi-select, align tools, undo/redo, export to HTML. */
(function () {
  const { h, uid, clone } = VX;
  const registry = () => VX.components.registry.ui;

  function templateDoc() {
    const mk = (type, x, y, w, hh, props = {}) => { const d = registry()[type]; return { id: uid('i'), type, x, y, w: w ?? d.w, h: hh ?? d.h, rot: 0, props: Object.assign({}, clone(d.props), props) }; };
    return { format: 'vextra-ui', width: 1024, height: 640, bg: '#14161b', items: [
      mk('navbar', 0, 0, 1024, 56),
      mk('heading', 80, 150, 560, 60, { text: 'Build something great', size: 48 }),
      mk('text', 80, 225, 480, 70, { text: 'Drag components from the Create panel onto the canvas, tweak them in Properties, then export clean HTML.' }),
      mk('button', 80, 320, 160, 48, { text: 'Get started' }),
      mk('button', 256, 320, 140, 48, { text: 'Learn more', bg: '#2a2f3a' }),
      mk('card', 680, 130, 270, 190, { title: 'Live preview', body: 'Everything you place here becomes real HTML you can edit in the code editor.' }),
    ] };
  }

  class Designer {
    constructor(doc, hooks = {}) {
      this.mode = 'ui'; this.doc = doc || templateDoc(); this.hooks = hooks;
      this.zoom = 1; this.snap = true; this.showGrid = true; this.sel = []; this.clip = null;
      this.undoStack = []; this.redoStack = [];
      this.root = this._build(); this._snapshot(true); this.render(); this.fit();
    }
    static blank() { return new Designer(null); }
    static fromText(text, hooks) {
      let doc; try { doc = JSON.parse(text); } catch { doc = null; }
      if (!doc || !Array.isArray(doc.items)) doc = templateDoc();
      doc.width = doc.width || 1024; doc.height = doc.height || 640; doc.bg = doc.bg || '#14161b'; doc.format = 'vextra-ui';
      return new Designer(doc, hooks);
    }

    /* ----- structure ----- */
    _build() {
      this.stage = h('div', { class: 'dz-stage' });
      this.overlay = h('div', { class: 'dz-overlay' });
      this.band = h('div', { class: 'dz-band hidden' });
      this.wrap = h('div', { class: 'dz-stagewrap' }, this.stage, this.overlay, this.band);
      this.canvas = h('div', { class: 'dz-canvas', tabindex: '0' }, this.wrap);
      this.side = h('div', { class: 'dz-side' });
      const root = h('div', { class: 'dz' }, this.canvas, this.side);
      this.canvas.addEventListener('mousedown', (e) => this._canvasDown(e));
      this.canvas.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });
      this.canvas.addEventListener('keydown', (e) => this._key(e));
      // palette drops (pointer-based, see core/dnd.js)
      VX.dnd.target(this.canvas, (data, cx, cy) => {
        if (!data || data.kind !== 'ui') return VX.ui.toast('That item belongs to the game editor', 'error');
        const r = this.stage.getBoundingClientRect();
        this.addItem(data.type, (cx - r.left) / this.zoom, (cy - r.top) / this.zoom, true);
      }, (d) => d && d.kind === 'ui');
      return root;
    }
    _pt(e) { const r = this.stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / this.zoom, y: (e.clientY - r.top) / this.zoom }; }

    _canvasDown(e) {
      this.canvas.focus({ preventScroll: true });
      if (e.target !== this.canvas && e.target !== this.wrap && e.target !== this.stage) return;
      // rubber-band selection
      const start = this._pt(e); const add = e.shiftKey; if (!add) this.select([]);
      const base = new Set(this.sel); this.band.classList.remove('hidden');
      const move = (ev) => {
        const p = this._pt(ev); const x = Math.min(start.x, p.x), y = Math.min(start.y, p.y), w = Math.abs(p.x - start.x), hh = Math.abs(p.y - start.y);
        Object.assign(this.band.style, { left: 40 + x * this.zoom + 'px', top: 40 + y * this.zoom + 'px', width: w * this.zoom + 'px', height: hh * this.zoom + 'px' });
        const ids = this.doc.items.filter((i) => !i.hidden && !i.locked && i.x < x + w && i.x + i.w > x && i.y < y + hh && i.y + i.h > y).map((i) => i.id);
        this.select([...new Set([...base, ...ids])]);
      };
      const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); this.band.classList.add('hidden'); };
      addEventListener('mousemove', move); addEventListener('mouseup', up);
    }

    _key(e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      else if (mod && k === 'y') { e.preventDefault(); this.redo(); }
      else if (mod && k === 'd') { e.preventDefault(); this.duplicate(); }
      else if (mod && k === 'c') { e.preventDefault(); this.copy(); }
      else if (mod && k === 'v') { e.preventDefault(); this.paste(); }
      else if (mod && k === 'a') { e.preventDefault(); this.select(this.doc.items.filter((i) => !i.hidden && !i.locked).map((i) => i.id)); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.remove(); }
      else if (e.key === 'Escape') this.select([]);
      else if (e.key.startsWith('Arrow') && this.sel.length) {
        e.preventDefault(); const s = e.shiftKey ? 10 : 1;
        for (const it of this.items()) { if (e.key === 'ArrowLeft') it.x -= s; if (e.key === 'ArrowRight') it.x += s; if (e.key === 'ArrowUp') it.y -= s; if (e.key === 'ArrowDown') it.y += s; this.refreshItem(it); }
        this._commitSoon();
      }
    }

    /* ----- model helpers ----- */
    item(id) { return this.doc.items.find((i) => i.id === id); }
    items() { return this.sel.map((id) => this.item(id)).filter(Boolean); }
    changed() { this.hooks.onChange && this.hooks.onChange(); }
    serialize() { return JSON.stringify(this.doc, null, 2); }
    toHTML(title) { return VX.components.uiToHTML(this.doc, title); }
    _snapshot(initial) {
      const s = JSON.stringify(this.doc); if (this.undoStack[this.undoStack.length - 1] === s) return;
      this.undoStack.push(s); if (this.undoStack.length > 120) this.undoStack.shift(); this.redoStack = []; if (!initial) this.changed();
    }
    _commitSoon() { clearTimeout(this._ct); this._ct = setTimeout(() => this._snapshot(), 350); }
    commit() { clearTimeout(this._ct); this._snapshot(); }
    undo() { if (this.undoStack.length < 2) return; this.redoStack.push(this.undoStack.pop()); this._restore(); }
    redo() { if (!this.redoStack.length) return; this.undoStack.push(this.redoStack.pop()); this._restore(); }
    _restore() { this.doc = JSON.parse(this.undoStack[this.undoStack.length - 1]); this.sel = this.sel.filter((id) => this.item(id)); this.render(); this.changed(); }

    addItem(type, x, y, centered) {
      const def = registry()[type]; if (!def) return null;
      const it = { id: uid('i'), type, x: 0, y: 0, w: def.w, h: def.h, rot: 0, props: clone(def.props) };
      it.x = Math.round(x == null ? (this.doc.width - it.w) / 2 : centered ? x - it.w / 2 : x);
      it.y = Math.round(y == null ? (this.doc.height - it.h) / 2 : centered ? y - it.h / 2 : y);
      if (this.snap) { it.x = Math.round(it.x / 8) * 8; it.y = Math.round(it.y / 8) * 8; }
      this.doc.items.push(it); this.sel = [it.id]; this.render(); this.commit(); return it;
    }
    remove() { if (!this.sel.length) return; const s = new Set(this.sel); this.doc.items = this.doc.items.filter((i) => !s.has(i.id)); this.sel = []; this.render(); this.commit(); }
    duplicate() { const out = []; for (const it of this.items()) { const c = clone(it); c.id = uid('i'); c.x += 16; c.y += 16; this.doc.items.push(c); out.push(c.id); } if (out.length) { this.sel = out; this.render(); this.commit(); } }
    copy() { this.clip = this.items().map(clone); }
    paste() { if (!this.clip || !this.clip.length) return; const out = []; for (const it of this.clip) { const c = clone(it); c.id = uid('i'); c.x += 20; c.y += 20; this.doc.items.push(c); out.push(c.id); } this.clip = this.clip.map((c) => ({ ...c, x: c.x + 20, y: c.y + 20 })); this.sel = out; this.render(); this.commit(); }
    reorder(dir) {
      const arr = this.doc.items; for (const it of (dir === 'front' || dir === 'up' ? this.items() : [...this.items()].reverse())) {
        const i = arr.indexOf(it); arr.splice(i, 1); const j = dir === 'front' ? arr.length : dir === 'back' ? 0 : Math.max(0, Math.min(arr.length, i + (dir === 'up' ? 1 : -1))); arr.splice(j, 0, it);
      } this.render(); this.commit();
    }
    align(how) {
      const its = this.items(); if (!its.length) return;
      const box = its.length === 1 ? { l: 0, t: 0, r: this.doc.width, b: this.doc.height } : { l: Math.min(...its.map((i) => i.x)), t: Math.min(...its.map((i) => i.y)), r: Math.max(...its.map((i) => i.x + i.w)), b: Math.max(...its.map((i) => i.y + i.h)) };
      for (const i of its) {
        if (how === 'left') i.x = box.l; if (how === 'right') i.x = box.r - i.w; if (how === 'center') i.x = Math.round((box.l + box.r) / 2 - i.w / 2);
        if (how === 'top') i.y = box.t; if (how === 'bottom') i.y = box.b - i.h; if (how === 'middle') i.y = Math.round((box.t + box.b) / 2 - i.h / 2);
      }
      if ((how === 'distH' || how === 'distV') && its.length > 2) {
        const hz = how === 'distH', s = [...its].sort((a, b) => (hz ? a.x - b.x : a.y - b.y)); const first = s[0], last = s[s.length - 1];
        const total = hz ? last.x - first.x : last.y - first.y; s.forEach((i, n) => { if (hz) i.x = Math.round(first.x + (total * n) / (s.length - 1)); else i.y = Math.round(first.y + (total * n) / (s.length - 1)); });
      }
      this.render(); this.commit();
    }
    select(ids) { this.sel = Array.isArray(ids) ? ids : ids ? [ids] : []; this._applyStageItems(); this._drawOverlay(); this._drawSide(); }

    /* ----- zoom ----- */
    setZoom(z) { this.zoom = VX.clamp(z, 0.2, 3); this._applyZoom(); this.hooks.onZoom && this.hooks.onZoom(this.zoom); }
    fit() { requestAnimationFrame(() => { const w = this.canvas.clientWidth - 90, hh = this.canvas.clientHeight - 90; if (w > 0 && hh > 0) this.setZoom(Math.min(1, w / this.doc.width, hh / this.doc.height)); else this._applyZoom(); }); }
    _applyZoom() {
      const z = this.zoom;
      Object.assign(this.stage.style, { width: this.doc.width + 'px', height: this.doc.height + 'px', background: this.doc.bg, transform: `scale(${z})`, left: '40px', top: '40px' });
      this.wrap.style.width = this.doc.width * z + 80 + 'px'; this.wrap.style.height = this.doc.height * z + 80 + 'px';
      Object.assign(this.overlay.style, { width: this.doc.width + 'px', height: this.doc.height + 'px', transform: `scale(${z})`, left: '40px', top: '40px' });
      this.stage.classList.toggle('grid', this.showGrid); this._drawOverlay();
    }

    /* ----- rendering ----- */
    render() {
      this.stage.textContent = ''; this.els = new Map();
      this.doc.items.forEach((it, idx) => {
        const def = registry()[it.type];
        const node = h('div', { class: 'dz-item' + (it.locked ? ' locked' : ''), 'data-id': it.id });
        node.innerHTML = def ? def.html(it, false) : `<div style="color:#ef5b5b;font:12px sans-serif">Missing component: ${VX.esc(it.type)}</div>`;
        for (const c of node.querySelectorAll('*')) c.style.pointerEvents = 'none';
        if (it.hidden) node.style.display = 'none';
        node.addEventListener('mousedown', (e) => this._startDrag(e, it.id));
        this.stage.append(node); this.els.set(it.id, node); this._place(node, it, idx);
      });
      this._applyZoom(); this._applyStageItems(); this._drawSide();
    }
    _place(node, it, idx) { Object.assign(node.style, { left: it.x + 'px', top: it.y + 'px', width: it.w + 'px', height: it.h + 'px', zIndex: idx, transform: it.rot ? `rotate(${it.rot}deg)` : '' }); }
    _applyStageItems() { for (const [id, n] of this.els) n.classList.toggle('selected', this.sel.includes(id)); }
    refreshItem(it, rerender) {
      const node = this.els.get(it.id); if (!node) return;
      if (rerender) { const def = registry()[it.type]; node.innerHTML = def.html(it, false); for (const c of node.querySelectorAll('*')) c.style.pointerEvents = 'none'; }
      this._place(node, it, this.doc.items.indexOf(it)); this._drawOverlay();
    }
    _drawOverlay() {
      this.overlay.textContent = '';
      const its = this.items(); if (!its.length) return;
      const s = 10 / this.zoom;
      if (its.length > 1) { for (const it of its) this.overlay.append(h('div', { class: 'dz-multi', style: `left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;border-width:${1 / this.zoom}px` })); return; }
      const it = its[0]; if (it.locked) return;
      const box = h('div', { style: `position:absolute;left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;pointer-events:none;transform:rotate(${it.rot || 0}deg)` });
      const spots = { nw: [0, 0], n: [.5, 0], ne: [1, 0], e: [1, .5], se: [1, 1], s: [.5, 1], sw: [0, 1], w: [0, .5] };
      const cur = { nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw', n: 'ns', s: 'ns', e: 'ew', w: 'ew' };
      for (const [k, [fx, fy]] of Object.entries(spots)) {
        const hd = h('div', { class: 'dz-handle', style: `left:${fx * 100}%;top:${fy * 100}%;width:${s}px;height:${s}px;margin:${-s / 2}px 0 0 ${-s / 2}px;border-width:${2 / this.zoom}px;cursor:${cur[k]}-resize;pointer-events:auto` });
        hd.addEventListener('mousedown', (e) => this._startResize(e, it, k)); box.append(hd);
      }
      this.overlay.append(box);
    }

    /* ----- pointer interactions ----- */
    _startDrag(e, id) {
      if (e.button !== 0) return; e.preventDefault(); this.canvas.focus({ preventScroll: true });
      const it0 = this.item(id); if (it0.locked) { this.select([id]); return; }
      if (e.shiftKey) { this.select(this.sel.includes(id) ? this.sel.filter((x) => x !== id) : [...this.sel, id]); } else if (!this.sel.includes(id)) this.select([id]);
      const group = this.items().filter((i) => !i.locked); const sx = e.clientX, sy = e.clientY, orig = group.map((i) => [i, i.x, i.y]); let moved = false;
      const move = (ev) => {
        let dx = (ev.clientX - sx) / this.zoom, dy = (ev.clientY - sy) / this.zoom;
        if (this.snap && !ev.altKey) { dx = Math.round(dx / 8) * 8; dy = Math.round(dy / 8) * 8; }
        if (dx || dy) moved = true;
        for (const [i, ox, oy] of orig) { i.x = Math.round(ox + dx); i.y = Math.round(oy + dy); this.refreshItem(i); }
        this._syncGeom();
      };
      const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); if (moved) this.commit(); };
      addEventListener('mousemove', move); addEventListener('mouseup', up);
    }
    _startResize(e, it, k) {
      e.preventDefault(); e.stopPropagation(); const sx = e.clientX, sy = e.clientY, o = { x: it.x, y: it.y, w: it.w, h: it.h };
      const move = (ev) => {
        let dx = (ev.clientX - sx) / this.zoom, dy = (ev.clientY - sy) / this.zoom;
        if (this.snap && !ev.altKey) { dx = Math.round(dx / 8) * 8; dy = Math.round(dy / 8) * 8; }
        let { x, y, w, h: hh } = o;
        if (k.includes('e')) w = o.w + dx; if (k.includes('s')) hh = o.h + dy;
        if (k.includes('w')) { w = o.w - dx; x = o.x + dx; } if (k.includes('n')) { hh = o.h - dy; y = o.y + dy; }
        if (ev.shiftKey && o.w && o.h) { const r = o.w / o.h; if (k.length === 2) hh = w / r; }
        if (w < 4) { if (k.includes('w')) x -= 4 - w; w = 4; } if (hh < 2) { if (k.includes('n')) y -= 2 - hh; hh = 2; }
        Object.assign(it, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh) }); this.refreshItem(it, true); this._syncGeom();
      };
      const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); this.commit(); };
      addEventListener('mousemove', move); addEventListener('mouseup', up);
    }

    /* ----- side panel (properties + layers) ----- */
    _syncGeom() { const it = this.items()[0]; if (!it || this.sel.length !== 1) return; for (const k of ['x', 'y', 'w', 'h', 'rot']) { const i = this.side.querySelector(`[data-geom="${k}"]`); if (i && document.activeElement !== i) i.value = it[k] ?? 0; } }
    _num(value, on, attrs = {}) { const i = h('input', Object.assign({ type: 'number', value }, attrs)); i.addEventListener('input', () => on(parseFloat(i.value) || 0)); i.addEventListener('change', () => this.commit()); return i; }
    _drawSide() {
      const s = this.side; s.textContent = ''; const its = this.items(); const it = its.length === 1 ? its[0] : null; const F = VX.ui.field;
      if (!its.length) {
        s.append(h('div', { class: 'group-title' }, 'Canvas'));
        s.append(F('Width', this._num(this.doc.width, (v) => { this.doc.width = Math.max(100, v); this._applyZoom(); })), F('Height', this._num(this.doc.height, (v) => { this.doc.height = Math.max(100, v); this._applyZoom(); })));
        const bg = h('input', { type: 'color', value: this.doc.bg }); bg.addEventListener('input', () => { this.doc.bg = bg.value; this._applyZoom(); }); bg.addEventListener('change', () => this.commit());
        s.append(F('Background', bg));
        const presets = h('div', { class: 'row' }, [['Desktop', 1280, 800], ['Laptop', 1024, 640], ['Tablet', 768, 1024], ['Phone', 390, 844]].map(([n, w, hh]) => h('button', { class: 'btn sm', onclick: () => { this.doc.width = w; this.doc.height = hh; this._applyZoom(); this.commit(); this._drawSide(); this.fit(); } }, n)));
        s.append(F('Size presets', presets));
        s.append(h('div', { class: 'empty left' }, 'Drag components from the Create panel onto the canvas. Click one to select it, drag to move, use the handles to resize, arrow keys to nudge (Shift = 10px), Shift-click or drag a box to select several.'));
      } else if (!it) {
        s.append(h('div', { class: 'group-title' }, `${its.length} items selected`));
        s.append(h('div', { class: 'row' }, [['⇤', 'left', 'Align left'], ['↔', 'center', 'Align horizontal centers'], ['⇥', 'right', 'Align right'], ['⤒', 'top', 'Align top'], ['↕', 'middle', 'Align vertical middles'], ['⤓', 'bottom', 'Align bottom'], ['⇹', 'distH', 'Distribute horizontally'], ['⇳', 'distV', 'Distribute vertically']].map(([l, k, t]) => h('button', { class: 'btn sm', title: t, onclick: () => this.align(k) }, l))));
        s.append(this._arrangeRow());
      } else {
        const def = registry()[it.type];
        s.append(h('div', { class: 'group-title' }, `${def?.label || it.type} properties`));
        const g = h('div', { class: 'geom' });
        for (const k of ['x', 'y', 'w', 'h']) g.append(h('div', {}, h('label', {}, k.toUpperCase()), this._num(it[k], (v) => { it[k] = v; this.refreshItem(it, k === 'w' || k === 'h'); }, { 'data-geom': k })));
        s.append(g, F('Rotation', this._num(it.rot || 0, (v) => { it.rot = v; this.refreshItem(it); }, { 'data-geom': 'rot' })));
        for (const f of def?.schema || []) {
          const v = it.props[f.key]; let input;
          if (f.type === 'color') input = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000' });
          else if (f.type === 'number') input = h('input', { type: 'number', value: v, min: f.min, max: f.max });
          else if (f.type === 'select') { input = h('select', {}, f.options.map((o) => h('option', { value: o }, o))); input.value = String(v); }
          else if (f.type === 'textarea') { input = h('textarea', { rows: 3 }); input.value = v ?? ''; }
          else input = h('input', { type: 'text', value: v ?? '' });
          input.addEventListener('input', () => { it.props[f.key] = f.type === 'number' ? parseFloat(input.value) || 0 : input.value; this.refreshItem(it, true); });
          input.addEventListener('change', () => this.commit()); s.append(F(f.label, input));
        }
        s.append(h('div', { class: 'group-title' }, 'Arrange'), this._arrangeRow());
        s.append(h('div', { class: 'row', style: 'margin-top:6px' }, [['⇤', 'left', 'Align left'], ['↔', 'center', 'Center horizontally on canvas'], ['⇥', 'right', 'Align right'], ['⤒', 'top', 'Align top'], ['↕', 'middle', 'Center vertically on canvas'], ['⤓', 'bottom', 'Align bottom']].map(([l, k, t]) => h('button', { class: 'btn sm', title: t, onclick: () => this.align(k) }, l))));
      }
      s.append(h('div', { class: 'group-title' }, `Layers (${this.doc.items.length})`));
      [...this.doc.items].reverse().forEach((i) => {
        const d = registry()[i.type];
        s.append(h('div', { class: 'layer' + (this.sel.includes(i.id) ? ' sel' : '') + (i.hidden ? ' dim' : ''), onclick: (e) => this.select(e.shiftKey ? [...new Set([...this.sel, i.id])] : [i.id]) },
          h('span', {}, d?.icon || '▢'), h('span', { class: 'name' }, i.name || d?.label || i.type), h('span', { class: 'spacer' }),
          h('button', { class: 'mini', title: i.hidden ? 'Show' : 'Hide', onclick: (e) => { e.stopPropagation(); i.hidden = !i.hidden; this.render(); this.commit(); } }, i.hidden ? '⊘' : '👁'),
          h('button', { class: 'mini', title: i.locked ? 'Unlock' : 'Lock', onclick: (e) => { e.stopPropagation(); i.locked = !i.locked; this.render(); this.commit(); } }, i.locked ? '🔒' : '🔓')));
      });
    }
    _arrangeRow() {
      const b = (l, f, c = '') => h('button', { class: 'btn sm ' + c, onclick: f }, l);
      return h('div', { class: 'row' }, b('To front', () => this.reorder('front')), b('To back', () => this.reorder('back')), b('Duplicate', () => this.duplicate()), b('Delete', () => this.remove(), 'danger'));
    }

    /* ----- toolbar ----- */
    toolbar() {
      const btn = (label, fn, cls = '', title = '') => h('button', { class: 'btn sm ' + cls, onclick: fn, title }, label);
      const zl = h('span', { class: 'zoomlabel' }, Math.round(this.zoom * 100) + '%'); this.hooks.onZoom = (z) => { zl.textContent = Math.round(z * 100) + '%'; };
      const snap = btn('Snap', () => { this.snap = !this.snap; snap.classList.toggle('on', this.snap); }, this.snap ? 'on' : '', 'Snap to the 8px grid (hold Alt to bypass)');
      const grid = btn('Grid', () => { this.showGrid = !this.showGrid; grid.classList.toggle('on', this.showGrid); this._applyZoom(); }, this.showGrid ? 'on' : '', 'Show grid');
      return [btn([VX.icon('undo', 14), 'Undo'], () => this.undo(), '', 'Ctrl+Z'), btn([VX.icon('redo', 14), 'Redo'], () => this.redo(), '', 'Ctrl+Shift+Z'), h('span', { class: 'sep' }),
        btn('−', () => this.setZoom(this.zoom / 1.2)), zl, btn('+', () => this.setZoom(this.zoom * 1.2)), btn('Fit', () => this.fit()), h('span', { class: 'sep' }), snap, grid, h('span', { class: 'spacer' }),
        btn([VX.icon('play', 13), 'Preview'], () => this.hooks.preview && this.hooks.preview(this), 'primary'), btn([VX.icon('code', 14), 'Export HTML'], () => this.hooks.exportCode && this.hooks.exportCode(this))];
    }
  }
  VX.Designer = Designer;
})();
