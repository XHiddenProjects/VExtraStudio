/* Vextra game editor – node-graph block editor (palette, canvas, wires, bundles, settings panel). */
(function () {
  const { h } = VX;
  const NODE_W = 196, HEAD = 28, ROW = 22;
  const SVGNS = 'http://www.w3.org/2000/svg';

  const ADV_IDS = new Set(['customBehavior', 'expression', 'rayCast', 'calendar', 'fetchUrl', 'clipboard', 'cloud', 'userInfo', 'gamePhysics', 'extractor', 'shader', 'blending', 'displayOrder', 'joint', 'pushMotor', 'spinMotor', 'attacher', 'router', 'logicGate', 'bundle', 'bundleInput', 'bundleOutput', 'custom', 'sensor', 'textSanitize', 'listModify', 'listOrder', 'listEach', 'listCount', 'textList', 'numberList', 'gesture', 'controller', 'mailbox', 'ease', 'repeater', 'gameSave', 'saveValue']);
  const simpleHide = (b) => !!(window.VX && VX.app && VX.app.settings && VX.app.settings.mode === 'simple') && (ADV_IDS.has(b.id) || ['mobile', 'mic', 'webcam', 'vr', 'ar'].includes(b.cat));
  VX.isAdvancedBlock = (b) => ADV_IDS.has(b.id) || ['mobile', 'mic', 'webcam', 'vr', 'ar'].includes(b.cat);
  class GraphEditor {
    constructor(ctx = {}) {
      this.ctx = ctx; this.readOnly = false; this.root = { nodes: [], wires: [] }; this.path = []; // path of bundle node ids we are inside
      this.view = { x: 40, y: 30, z: 1 }; this.sel = new Set(); this.selWire = null; this.undo = []; this.redo = []; this.search = '';
      this.el = this._build(); this.drawPalette();
    }
    get graph() { let g = this.root; for (const id of this.path) { const n = g.nodes.find((x) => x.id === id); if (!n || !n.graph) break; g = n.graph; } return g; }
    setGraph(graph, { readOnly = false, keepView = false } = {}) { this.root = graph || { nodes: [], wires: [] }; this.root.nodes ||= []; this.root.wires ||= []; this.path = []; this.readOnly = readOnly; this.sel.clear(); this.selWire = null; this.undo = []; this.redo = []; if (!keepView) this.view = { x: 40, y: 30, z: 1 }; this.render(); this.el.classList.toggle('ro', readOnly); this.drawSide(); this.drawCrumbs(); if (!keepView) this.fit(); }
    changed(commit = true) { if (commit) this._snap(); this.ctx.onChange && this.ctx.onChange(this.root); }
    _snap() { this.undo.push(JSON.stringify(this.root)); if (this.undo.length > 100) this.undo.shift(); this.redo.length = 0; }
    doUndo() { if (!this.undo.length) return; this.redo.push(JSON.stringify(this.root)); this.root = JSON.parse(this.undo.pop()); this._afterHistory(); }
    doRedo() { if (!this.redo.length) return; this.undo.push(JSON.stringify(this.root)); this.root = JSON.parse(this.redo.pop()); this._afterHistory(); }
    _afterHistory() { this.sel.clear(); this.render(); this.drawSide(); this.ctx.onChange && this.ctx.onChange(this.root); }

    /* ---------------- structure ---------------- */
    _build() {
      this.paletteEl = h('div', { class: 'ge-pal' }); this.world = h('div', { class: 'ge-world' }); this.svg = document.createElementNS(SVGNS, 'svg'); this.svg.setAttribute('class', 'ge-wires');
      this.band = h('div', { class: 'ge-band hidden' }); this.crumbs = h('div', { class: 'ge-crumbs' }); this.empty = h('div', { class: 'ge-empty' }, 'Drag blocks here from the palette, or double-click to search.');
      this.canvas = h('div', { class: 'ge-canvas', tabindex: '0' }, this.world, this.band, this.crumbs, this.empty); this.world.append(this.svg);
      this.sideEl = h('div', { class: 'ge-side' });
      const rz = (el, dir) => { const r = h('div', { class: 'ge-rz', title: 'Drag to resize' }); r.addEventListener('pointerdown', (e) => { e.preventDefault(); r.setPointerCapture(e.pointerId); const sx = e.clientX, w0 = el.getBoundingClientRect().width; r.classList.add('on'); const mv = (ev) => { el.style.width = VX.clamp(w0 + (ev.clientX - sx) * dir, 140, 640) + 'px'; }; const up = () => { r.classList.remove('on'); r.removeEventListener('pointermove', mv); r.removeEventListener('pointerup', up); try { localStorage.setItem('vx.ge.' + dir, el.style.width); } catch { /* private mode */ } }; r.addEventListener('pointermove', mv); r.addEventListener('pointerup', up); }); r.addEventListener('dblclick', () => { el.style.width = ''; }); try { const w = localStorage.getItem('vx.ge.' + dir); if (w) el.style.width = w; } catch { /* ignore */ } return r; };
      const root = h('div', { class: 'ge' }, this.paletteEl, rz(this.paletteEl, 1), this.canvas, rz(this.sideEl, -1), this.sideEl);
      this.canvas.addEventListener('mousedown', (e) => this._canvasDown(e));
      this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); const r = this.canvas.getBoundingClientRect(); const f = e.deltaY < 0 ? 1.1 : 0.9; this.zoomAt(e.clientX - r.left, e.clientY - r.top, f); }, { passive: false });
      this.canvas.addEventListener('dblclick', (e) => { if (e.target === this.canvas || e.target === this.world || e.target === this.svg) this.quickAdd(e.clientX, e.clientY); });
      this.canvas.addEventListener('keydown', (e) => this._key(e)); this.canvas.addEventListener('contextmenu', (e) => { if (e.target === this.canvas || e.target === this.world || e.target.tagName === 'svg') { e.preventDefault(); this.quickAdd(e.clientX, e.clientY); } });
      VX.dnd.target(this.canvas, (d, cx, cy) => { if (this.readOnly) return VX.ui.toast('Switch to Blocks mode to edit', 'warn'); const p = this.toWorld(cx, cy); this.addBlock(d.type, p.x - NODE_W / 2, p.y - 14); }, (d) => d && d.kind === 'block');
      this.root_ = root; const tog = (cls, label, title) => h('button', { class: 'ge-tog ' + cls + ' on', title, onclick: () => this.setPanel(cls, root.classList.contains(cls + '-hidden')) }, label);
      this.tools = h('div', { class: 'ge-tools' }, tog('pal', '☰ Blocks', 'Show / hide the block palette'), h('button', { class: 'ge-tog', title: 'Collapse every block to its title bar', onclick: () => this.collapseAll(true) }, '▸ Collapse all'), h('button', { class: 'ge-tog', title: 'Expand every block', onclick: () => this.collapseAll(false) }, '▾ Expand all'), h('button', { class: 'ge-tog', title: 'Fit all blocks in view', onclick: () => this.fit() }, '⤢ Fit'), tog('side', 'ⓘ Settings', 'Show / hide the block settings panel'));
      this.canvas.append(this.tools); this._ro = new ResizeObserver(() => { this._autoPanels(); clearTimeout(this._rt); this._rt = setTimeout(() => { if (!this._moved) this.fit(); }, 120); }); this._ro.observe(root); setTimeout(() => this._autoPanels(), 0);
      this._unreg = [VX.on('gameBlocks', () => { this.drawPalette(); this.render(); })];
      return root;
    }
    toggleCollapse(ids) { const ns = this.graph.nodes.filter((n) => ids.includes(n.id)); const to = !ns.every((n) => n.collapsed); for (const n of ns) n.collapsed = to; this.render(); this.changed && this.changed(); }
    collapseAll(on) { for (const n of this.graph.nodes) n.collapsed = !!on; this.render(); this.fit(); this.changed && this.changed(); }
    setPanel(which, open) { this['_' + which + 'User'] = true; this.root_.classList.toggle(which + '-hidden', !open); this.root_.querySelector('.ge-tog.' + which).classList.toggle('on', open); this.fit(); }
    _autoPanels() { const w = this.root_.clientWidth; if (!w) return; if (!this._palUser) { this.root_.classList.toggle('pal-hidden', w < 720); this.root_.querySelector('.ge-tog.pal').classList.toggle('on', w >= 720); } if (!this._sideUser) { this.root_.classList.toggle('side-hidden', w < 980); this.root_.querySelector('.ge-tog.side').classList.toggle('on', w >= 980); } }
    dispose() { if (this._ro) this._ro.disconnect(); this._unreg.forEach((f) => f()); }
    toWorld(cx, cy) { const r = this.canvas.getBoundingClientRect(); return { x: (cx - r.left - this.view.x) / this.view.z, y: (cy - r.top - this.view.y) / this.view.z }; }
    applyView() { this.world.style.transform = `translate(${this.view.x}px,${this.view.y}px) scale(${this.view.z})`; this.canvas.style.backgroundSize = `${24 * this.view.z}px ${24 * this.view.z}px`; this.canvas.style.backgroundPosition = `${this.view.x}px ${this.view.y}px`; }
    zoomAt(px, py, f) { this._moved = true; const z = VX.clamp(this.view.z * f, 0.25, 2); const k = z / this.view.z; this.view.x = px - (px - this.view.x) * k; this.view.y = py - (py - this.view.y) * k; this.view.z = z; this.applyView(); }
    fit() { this._moved = false; requestAnimationFrame(() => { const ns = this.graph.nodes; if (!ns.length) { this.view = { x: 40, y: 30, z: 1 }; return this.applyView(); } const minX = Math.min(...ns.map((n) => n.x || 0)), minY = Math.min(...ns.map((n) => n.y || 0)), maxX = Math.max(...ns.map((n) => (n.x || 0) + NODE_W)), maxY = Math.max(...ns.map((n) => (n.y || 0) + this.nodeHeight(n))); const W = this.canvas.clientWidth || 800, H = this.canvas.clientHeight || 500; const z = VX.clamp(Math.min((W - 80) / (maxX - minX), (H - 80) / (maxY - minY), 1), 0.3, 1); this.view = { z, x: 40 - minX * z + (W - 80 - (maxX - minX) * z) / 2, y: 40 - minY * z }; this.applyView(); }); }

    /* ---------------- palette ---------------- */
    drawPalette() {
      const el = this.paletteEl; el.textContent = ''; const q = this.search.toLowerCase(); const inp = h('input', { class: 'search-input', placeholder: 'Search blocks…', value: this.search }); inp.addEventListener('input', () => { this.search = inp.value; this.drawPalette(); const n = this.paletteEl.querySelector('input'); n && (n.focus(), n.setSelectionRange(n.value.length, n.value.length)); });
      el.append(inp);
      for (const cat of VXRT.CATEGORIES) {
        const defs = Object.values(VXRT.blocks).filter((b) => !simpleHide(b) && b.cat === cat.id && (!q || b.label.toLowerCase().includes(q) || b.id.toLowerCase().includes(q) || (b.desc || '').toLowerCase().includes(q))); if (!defs.length) continue;
        const open = q || this._open?.[cat.id] !== false; const head = h('div', { class: 'ge-cat', onclick: () => { (this._open ||= {})[cat.id] = !open; this.drawPalette(); } }, h('span', { class: 'ge-dot', style: `background:${cat.color}` }), cat.label, h('small', {}, defs.length));
        el.append(head); if (!open) continue;
        for (const d of defs) { const it = h('div', { class: 'ge-item', title: d.desc, onclick: () => !this.readOnly && this.addBlockCenter(d.id) }, h('span', { class: 'ge-bic', style: `--c:${cat.color}` }, VXRT.blockIcon(d)), d.label); VX.dnd.draggable(it, () => ({ kind: 'block', type: d.id }), d.label); el.append(it); }
      }
    }
    quickAdd(cx, cy) {
      if (this.readOnly) return VX.ui.toast('This behaviour is in code mode. Press “Convert to blocks” or use the Code view to edit it.', 'warn');
      const p = this.toWorld(cx, cy); const input = h('input', { class: 'big', placeholder: 'Add a block…' }); const list = h('div', { class: 'cmd-list' }); const box = h('div', { class: 'modal' }, input, list); const rec = VX.ui.layer(box, { align: 'top' }); let sel = 0, shown = [];
      const draw = () => { const q = input.value.toLowerCase(); shown = Object.values(VXRT.blocks).filter((b) => !simpleHide(b) && (!q || b.label.toLowerCase().includes(q) || b.id.toLowerCase().includes(q) || b.cat.includes(q))).slice(0, 60); sel = Math.min(sel, Math.max(0, shown.length - 1)); list.textContent = ''; shown.forEach((b, i) => list.append(h('div', { class: 'cmd' + (i === sel ? ' sel' : ''), onclick: () => pick(b) }, h('span', {}, h('span', { class: 'ge-dot', style: `background:${VXRT.catColor(b.cat)};margin-right:8px` }), b.label), h('small', {}, (b.desc || '').slice(0, 60))))); };
      const pick = (b) => { rec.close(); this.addBlock(b.id, p.x, p.y); };
      input.addEventListener('input', () => { sel = 0; draw(); }); input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter' && shown[sel]) pick(shown[sel]); }); draw(); input.focus();
    }

    /* ---------------- nodes ---------------- */
    ports(n) { const def = VXRT.blocks[n.type]; if (!def) return { inputs: [{ id: 'in', label: 'in' }], outputs: [{ id: 'out', label: 'out' }], missing: true }; return VXRT.ports(def, Object.assign(VXRT.paramDefaults(def), n.params || {}), n); }
    nodeHeight(n) { if (n.collapsed) return HEAD; const p = this.ports(n); return HEAD + Math.max(p.inputs.length, p.outputs.length, 1) * ROW + this.summary(n).length * 15 + 8; }
    summary(n) { const def = VXRT.blocks[n.type]; if (!def) return ['Missing block type “' + n.type + '”']; const d = VXRT.paramDefaults(def); const out = []; for (const p of def.params || []) { const v = (n.params || {})[p.key]; if (v === undefined || JSON.stringify(v) === JSON.stringify(d[p.key])) continue; out.push(`${p.label}: ${String(Array.isArray(v) ? v.join(',') : v).slice(0, 22)}`); if (out.length >= 3) break; } if (n.type === 'bundle') out.push(((n.graph && n.graph.nodes.length) || 0) + ' blocks inside – double-click'); return out; }
    addBlockCenter(type) { const r = this.canvas.getBoundingClientRect(); const p = this.toWorld(r.left + r.width / 2, r.top + r.height / 2); this.addBlock(type, p.x - NODE_W / 2 + (Math.random() - 0.5) * 60, p.y - 30 + (Math.random() - 0.5) * 60); }
    addBlock(type, x, y, params) { const def = VXRT.blocks[type]; if (!def) return null; const n = { id: VX.uid('n'), type, params: Object.assign({}, VXRT.paramDefaults(def), params || {}), x: Math.round(x / 8) * 8, y: Math.round(y / 8) * 8 }; if (type === 'bundle') n.graph = { nodes: [], wires: [] }; if (type === 'bundleInput' || type === 'bundleOutput') n.params.name = (type === 'bundleInput' ? 'in' : 'out') + (this.graph.nodes.filter((q) => q.type === type).length + 1); this.graph.nodes.push(n); this.sel = new Set([n.id]); this.selWire = null; this.changed(); this.render(); this.drawSide(); return n; }
    /** Live values: data = { nodeId: { n, ports: { port: 'text' } } } from the running game. Pass null to clear. */
    setLive(data) { if (!data) { this._live = null; this.world.querySelectorAll('.ge-live').forEach((e) => e.remove()); return; } const L = (this._live ||= {}); for (const id in data) { const o = L[id] || (L[id] = { n: 0, ports: {} }), d = data[id]; o.n += d.n; Object.assign(o.ports, d.ports); o.flash = true; } this.showLive(); }
    showLive() {
      if (!this._live) return; for (const el of this.world.querySelectorAll('.ge-node')) {
        const o = this._live[el.dataset.id]; let box = el.querySelector(':scope > .ge-live'); if (!o) { if (box) box.remove(); continue; }
        if (!box) { box = h('div', { class: 'ge-live' }); el.append(box); }
        box.textContent = ''; box.append(h('span', { class: 'n' }, '×' + o.n)); for (const k of Object.keys(o.ports).slice(-4)) box.append(h('div', {}, h('b', {}, k + ' '), o.ports[k]));
        if (o.flash) { o.flash = false; el.classList.add('live-hit'); clearTimeout(el._lt); el._lt = setTimeout(() => el.classList.remove('live-hit'), 220); }
      }
    }
    render() {
      for (const el of [...this.world.querySelectorAll('.ge-node')]) el.remove(); const g = this.graph; this.empty.classList.toggle('hidden', g.nodes.length > 0 || this.readOnly && false);
      for (const n of g.nodes) this.world.append(this._nodeEl(n)); this.drawWires(); this.applyView(); this.showLive();
    }
    _nodeEl(n) {
      const def = VXRT.blocks[n.type]; const p = this.ports(n); const color = def ? VXRT.catColor(def.cat) : '#ef5b5b'; const rows = Math.max(p.inputs.length, p.outputs.length, 1);
      const el = h('div', { class: 'ge-node' + (this.sel.has(n.id) ? ' sel' : '') + (def ? '' : ' missing') + (n.type === 'bundle' ? ' bundle' : '') + (n.collapsed ? ' collapsed' : ''), 'data-id': n.id, style: `left:${n.x || 0}px;top:${n.y || 0}px;width:${NODE_W}px` });
      el.append(h('div', { class: 'ge-head', style: `background:${color}` }, h('button', { class: 'ge-q ge-fold', title: n.collapsed ? 'Expand' : 'Collapse', onmousedown: (e) => e.stopPropagation(), onclick: (e) => { e.stopPropagation(); this.toggleCollapse([n.id]); } }, n.collapsed ? '▸' : '▾'), h('span', { class: 'ge-bic hd' }, VXRT.blockIcon(def)), h('span', { class: 'ge-title' }, n.label || (n.type === 'bundle' ? (n.params && n.params.name) || 'Bundle' : def ? def.label : n.type)), def ? h('button', { class: 'ge-q', title: 'Open the documentation for this block', onmousedown: (e) => e.stopPropagation(), onclick: (e) => { e.stopPropagation(); VX.docs.openBlock(def); } }, '?') : null));
      const body = h('div', { class: 'ge-ports', style: `height:${rows * ROW}px` });
      p.inputs.forEach((pt, i) => { const s = h('div', { class: 'ge-port in', 'data-port': pt.id, style: `top:${i * ROW}px` }, h('i', {}), h('span', {}, pt.label || pt.id)); s.addEventListener('mousedown', (e) => this._portDown(e, n, pt, 'in')); body.append(s); });
      p.outputs.forEach((pt, i) => { const s = h('div', { class: 'ge-port out', 'data-port': pt.id, style: `top:${i * ROW}px` }, h('span', {}, pt.label || pt.id), h('i', {})); s.addEventListener('mousedown', (e) => this._portDown(e, n, pt, 'out')); body.append(s); });
      if (n.collapsed) { el.addEventListener('mousedown', (e) => this._nodeDown(e, n)); el.addEventListener('dblclick', (e) => { e.stopPropagation(); if (n.type === 'bundle') this.enter(n.id); }); el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); if (!this.sel.has(n.id)) { this.sel = new Set([n.id]); this.render(); this.drawSide(); } this.nodeMenu(e.clientX, e.clientY, n); }); return el; }
      el.append(body); const sm = this.summary(n); if (sm.length) el.append(h('div', { class: 'ge-sum' }, sm.map((t) => h('div', {}, t))));
      el.addEventListener('mousedown', (e) => this._nodeDown(e, n)); el.addEventListener('dblclick', (e) => { e.stopPropagation(); if (n.type === 'bundle') this.enter(n.id); });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); if (!this.sel.has(n.id)) { this.sel = new Set([n.id]); this.render(); this.drawSide(); } this.nodeMenu(e.clientX, e.clientY, n); });
      return el;
    }
    portPos(n, id, side) { if (n.collapsed) return { x: (n.x || 0) + (side === 'in' ? 0 : NODE_W), y: (n.y || 0) + HEAD / 2 }; const p = this.ports(n); const list = side === 'in' ? p.inputs : p.outputs; let i = list.findIndex((x) => x.id === id); if (i < 0) i = 0; return { x: (n.x || 0) + (side === 'in' ? 0 : NODE_W), y: (n.y || 0) + HEAD + i * ROW + ROW / 2 }; }
    drawWires(extra) {
      const g = this.graph; this.svg.textContent = ''; const byId = new Map(g.nodes.map((n) => [n.id, n])); let i = 0;
      const path = (a, b, self) => { if (self) { const t = Math.min(a.y, b.y) - 46; return `M${a.x},${a.y} C${a.x + 70},${a.y} ${a.x + 70},${t} ${(a.x + b.x) / 2},${t} S${b.x - 70},${b.y} ${b.x},${b.y}`; } const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; };
      for (const w of g.wires) { const A = byId.get(w.from), B = byId.get(w.to); if (!A || !B) continue; const d = path(this.portPos(A, w.out || 'out', 'out'), this.portPos(B, w.in || 'in', 'in'), A === B); const color = VXRT.blocks[A.type] ? VXRT.catColor(VXRT.blocks[A.type].cat) : '#8b93a1'; const sel = this.selWire === w;
        const hit = document.createElementNS(SVGNS, 'path'); hit.setAttribute('d', d); hit.setAttribute('class', 'ge-hit'); hit.addEventListener('mousedown', (e) => { e.stopPropagation(); this.selWire = w; this.sel.clear(); this.render(); this.drawSide(); this.canvas.focus(); });
        const vis = document.createElementNS(SVGNS, 'path'); vis.setAttribute('d', d); vis.setAttribute('class', 'ge-wire' + (sel ? ' sel' : '')); vis.style.stroke = sel ? '' : color; this.svg.append(vis, hit); i++; }
      if (extra) { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('d', path(extra.a, extra.b)); p.setAttribute('class', 'ge-wire tmp'); this.svg.append(p); }
    }

    /* ---------------- interaction ---------------- */
    _canvasDown(e) {
      this.canvas.focus({ preventScroll: true });
      if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) return this._pan(e);
      if (e.target !== this.canvas && e.target !== this.world && e.target !== this.svg) return;
      if (e.button !== 0) return; const start = this.toWorld(e.clientX, e.clientY); const additive = e.shiftKey; if (!additive) { this.sel.clear(); this.selWire = null; } const base = new Set(this.sel); this.band.classList.remove('hidden'); let moved = false; const r0 = this.canvas.getBoundingClientRect();
      const move = (ev) => { moved = true; const p = this.toWorld(ev.clientX, ev.clientY); const x1 = Math.min(start.x, p.x), y1 = Math.min(start.y, p.y), x2 = Math.max(start.x, p.x), y2 = Math.max(start.y, p.y); Object.assign(this.band.style, { left: (Math.min(e.clientX, ev.clientX) - r0.left) + 'px', top: (Math.min(e.clientY, ev.clientY) - r0.top) + 'px', width: Math.abs(ev.clientX - e.clientX) + 'px', height: Math.abs(ev.clientY - e.clientY) + 'px' });
        this.sel = new Set(base); for (const n of this.graph.nodes) { const nx = n.x || 0, ny = n.y || 0; if (nx < x2 && nx + NODE_W > x1 && ny < y2 && ny + this.nodeHeight(n) > y1) this.sel.add(n.id); } this.world.querySelectorAll('.ge-node').forEach((el) => el.classList.toggle('sel', this.sel.has(el.dataset.id))); };
      const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); this.band.classList.add('hidden'); this.render(); this.drawSide(); void moved; };
      addEventListener('mousemove', move); addEventListener('mouseup', up);
    }
    _pan(e) { e.preventDefault(); const sx = e.clientX, sy = e.clientY, ox = this.view.x, oy = this.view.y; const move = (ev) => { this.view.x = ox + ev.clientX - sx; this.view.y = oy + ev.clientY - sy; this.applyView(); }; const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); }; addEventListener('mousemove', move); addEventListener('mouseup', up); }
    _nodeDown(e, n) {
      if (e.button === 1 || e.button === 2) return this._pan(e); if (e.button !== 0) return; if (e.target.closest('.ge-port') || e.target.closest('.ge-q')) return; e.stopPropagation(); this.canvas.focus({ preventScroll: true });
      if (e.shiftKey) { this.sel.has(n.id) ? this.sel.delete(n.id) : this.sel.add(n.id); } else if (!this.sel.has(n.id)) this.sel = new Set([n.id]); this.selWire = null;
      this.world.querySelectorAll('.ge-node').forEach((el) => el.classList.toggle('sel', this.sel.has(el.dataset.id))); this.drawSide();
      if (this.readOnly) return; const group = this.graph.nodes.filter((x) => this.sel.has(x.id)); const orig = group.map((x) => [x, x.x || 0, x.y || 0]); const sx = e.clientX, sy = e.clientY; let moved = false;
      const move = (ev) => { const dx = (ev.clientX - sx) / this.view.z, dy = (ev.clientY - sy) / this.view.z; if (Math.abs(dx) + Math.abs(dy) > 2) moved = true; if (!moved) return; for (const [x, ox, oy] of orig) { x.x = Math.round((ox + dx) / 8) * 8; x.y = Math.round((oy + dy) / 8) * 8; const el = this.world.querySelector(`.ge-node[data-id="${x.id}"]`); if (el) { el.style.left = x.x + 'px'; el.style.top = x.y + 'px'; } } this.drawWires(); };
      const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); if (moved) this.changed(); }; addEventListener('mousemove', move); addEventListener('mouseup', up);
    }
    _portDown(e, n, pt, side) {
      if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); if (this.readOnly) return VX.ui.toast('This behaviour is read-only here. Switch back to Blocks.', 'warn');
      const a = this.portPos(n, pt.id, side); const move = (ev) => { const p = this.toWorld(ev.clientX, ev.clientY); this.drawWires(side === 'out' ? { a, b: p } : { a: p, b: a }); };
      const up = (ev) => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); const el = document.elementFromPoint(ev.clientX, ev.clientY); const port = el && el.closest && el.closest('.ge-port'); const nodeEl = port && port.closest('.ge-node');
        if (port && nodeEl) { const other = nodeEl.dataset.id, op = port.dataset.port; const isIn = port.classList.contains('in'); if ((side === 'out' && isIn) || (side === 'in' && !isIn)) { const w = side === 'out' ? { from: n.id, out: pt.id, to: other, in: op } : { from: other, out: op, to: n.id, in: pt.id }; if (!this.graph.wires.some((q) => q.from === w.from && q.out === w.out && q.to === w.to && q.in === w.in)) { this.graph.wires.push(w); this.changed(); } } }
        this.drawWires(); }; addEventListener('mousemove', move); addEventListener('mouseup', up);
    }
    _key(e) {
      e.vxHandled = true;
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(); if (e.target.matches('input,textarea,select')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && !this.readOnly) { e.preventDefault(); this.deleteSel(); }
      else if (mod && k === 'z') { e.preventDefault(); if (this.readOnly) return; e.shiftKey ? this.doRedo() : this.doUndo(); } else if (mod && k === 'y') { e.preventDefault(); this.doRedo(); }
      else if (mod && k === 'd') { e.preventDefault(); this.duplicate(); } else if (mod && k === 'a') { e.preventDefault(); this.sel = new Set(this.graph.nodes.map((n) => n.id)); this.render(); this.drawSide(); } else if (k === 'f' && !mod) this.fit();
      else if (mod && k === 'c') { this.copy(); } else if (mod && k === 'v') { this.paste(); }
      else if (e.key.startsWith('Arrow') && this.sel.size && !this.readOnly) { /* keyboard alternative to dragging: Arrow = 10, Shift+Arrow = 50 */ e.preventDefault(); const st = e.shiftKey ? 50 : 10, dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0; for (const n of this.graph.nodes) if (this.sel.has(n.id)) { n.x = (n.x || 0) + dx; n.y = (n.y || 0) + dy; } this.render(); this.changed(); const first = this.graph.nodes.find((n) => this.sel.has(n.id)); VX.a11y && VX.a11y.announce('Moved to ' + Math.round(first.x) + ', ' + Math.round(first.y)); }
      else if ((e.key === '[' || e.key === ']') && this.graph.nodes.length) { /* step through the blocks with the keyboard */ e.preventDefault(); const ns = [...this.graph.nodes].sort((a, b) => (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0)), cur = ns.findIndex((n) => this.sel.has(n.id)), nx = ns[(cur + (e.key === ']' ? 1 : -1) + ns.length) % ns.length]; this.sel = new Set([nx.id]); this.render(); this.drawSide(); const d = VXRT.blocks[nx.type]; VX.a11y && VX.a11y.announce('Block ' + (ns.indexOf(nx) + 1) + ' of ' + ns.length + ': ' + ((d && d.label) || nx.type)); }
      else if (e.key === 'Enter' && this.sel.size === 1) { const n = this.graph.nodes.find((x) => this.sel.has(x.id)); if (n && n.type === 'bundle') { e.preventDefault(); this.enter(n.id); } }
    }
    deleteSel() { const g = this.graph; if (this.selWire) { g.wires = g.wires.filter((w) => w !== this.selWire); this.selWire = null; this.changed(); this.render(); return; } if (!this.sel.size) return; g.nodes = g.nodes.filter((n) => !this.sel.has(n.id)); g.wires = g.wires.filter((w) => !this.sel.has(w.from) && !this.sel.has(w.to)); this.sel.clear(); this.changed(); this.render(); this.drawSide(); }
    _clone(ids) { const nodes = this.graph.nodes.filter((n) => ids.has(n.id)); return { nodes: JSON.parse(JSON.stringify(nodes)), wires: JSON.parse(JSON.stringify(this.graph.wires.filter((w) => ids.has(w.from) && ids.has(w.to)))) }; }
    copy() { if (this.sel.size) GraphEditor.clip = this._clone(this.sel); }
    paste() { if (this.readOnly || !GraphEditor.clip) return; this._insert(JSON.parse(JSON.stringify(GraphEditor.clip))); }
    duplicate() { if (this.readOnly || !this.sel.size) return; this._insert(this._clone(this.sel)); }
    _insert(c) { const map = {}; const fresh = (n) => { const id = VX.uid('n'); map[n.id] = id; n.id = id; n.x = (n.x || 0) + 32; n.y = (n.y || 0) + 32; return n; }; c.nodes.forEach(fresh); c.wires.forEach((w) => { w.from = map[w.from]; w.to = map[w.to]; }); this.graph.nodes.push(...c.nodes); this.graph.wires.push(...c.wires); this.sel = new Set(c.nodes.map((n) => n.id)); this.changed(); this.render(); this.drawSide(); }
    nodeMenu(x, y, n) {
      const def = VXRT.blocks[n.type]; const many = this.sel.size > 1;
      VX.ui.menu(x, y, [n.type === 'bundle' && !many ? { label: 'Open bundle', run: () => this.enter(n.id) } : null, !this.readOnly && many ? { label: 'Group into bundle', run: () => this.groupSel() } : null, !this.readOnly && !many && n.type === 'bundle' ? { label: 'Ungroup', run: () => this.ungroup(n) } : null, !this.readOnly && !many ? { label: 'Rename label…', run: async () => { const v = await VX.ui.ask('Label for this block', n.label || ''); if (v !== null) { n.label = v || undefined; this.changed(); this.render(); } } } : null, def ? { label: 'Documentation', run: () => VX.docs.openBlock(def) } : null, '-', { label: 'Duplicate', hint: 'Ctrl+D', run: () => this.duplicate(), disabled: this.readOnly }, { label: 'Delete', hint: 'Del', danger: true, run: () => this.deleteSel(), disabled: this.readOnly }].filter(Boolean));
    }

    /* ---------------- bundles ---------------- */
    enter(id) { this.path.push(id); this.sel.clear(); this.selWire = null; this.render(); this.drawSide(); this.drawCrumbs(); this.fit(); }
    goto(depth) { this.path = this.path.slice(0, depth); this.sel.clear(); this.render(); this.drawSide(); this.drawCrumbs(); this.fit(); }
    drawCrumbs() {
      this.crumbs.textContent = ''; this.crumbs.classList.toggle('hidden', !this.path.length); if (!this.path.length) return; let g = this.root; const trail = [{ name: 'Main', depth: 0 }];
      this.path.forEach((id, i) => { const n = g.nodes.find((x) => x.id === id); trail.push({ name: (n && n.params && n.params.name) || 'Bundle', depth: i + 1 }); g = n && n.graph || g; });
      trail.forEach((t, i) => { this.crumbs.append(h('button', { class: 'btn sm' + (i === trail.length - 1 ? ' on' : ''), onclick: () => this.goto(t.depth) }, t.name)); if (i < trail.length - 1) this.crumbs.append(h('span', {}, '›')); });
    }
    groupSel() {
      const ids = new Set(this.sel); if (ids.size < 2) return; const g = this.graph; const inner = { nodes: [], wires: [] }; const nodes = g.nodes.filter((n) => ids.has(n.id)); const minX = Math.min(...nodes.map((n) => n.x || 0)), minY = Math.min(...nodes.map((n) => n.y || 0));
      const bundle = { id: VX.uid('n'), type: 'bundle', params: { name: 'Bundle' }, x: minX, y: minY, graph: inner }; let ci = 0, co = 0; const newWires = [];
      inner.nodes = nodes.map((n) => ({ ...n }));
      for (const w of [...g.wires]) {
        const fi = ids.has(w.from), ti = ids.has(w.to);
        if (fi && ti) { inner.wires.push(w); continue; }
        if (!fi && ti) { const name = 'in' + ++ci; const bi = { id: VX.uid('n'), type: 'bundleInput', params: { name }, x: minX - 240, y: minY + ci * 80 }; inner.nodes.push(bi); inner.wires.push({ from: bi.id, out: 'out', to: w.to, in: w.in }); newWires.push({ from: w.from, out: w.out, to: bundle.id, in: name }); }
        else if (fi && !ti) { const name = 'out' + ++co; const bo = { id: VX.uid('n'), type: 'bundleOutput', params: { name }, x: minX + 600, y: minY + co * 80 }; inner.nodes.push(bo); inner.wires.push({ from: w.from, out: w.out, to: bo.id, in: 'in' }); newWires.push({ from: bundle.id, out: name, to: w.to, in: w.in }); }
      }
      g.nodes = g.nodes.filter((n) => !ids.has(n.id)); g.nodes.push(bundle); g.wires = g.wires.filter((w) => !(ids.has(w.from) || ids.has(w.to))).concat(newWires); this.sel = new Set([bundle.id]); this.changed(); this.render(); this.drawSide();
    }
    ungroup(b) {
      const g = this.graph; const inner = b.graph; if (!inner) return; const dx = (b.x || 0), dy = (b.y || 0); const ins = new Map(), outs = new Map(); for (const n of inner.nodes) { if (n.type === 'bundleInput') ins.set(n.params.name, n); if (n.type === 'bundleOutput') outs.set(n.params.name, n); }
      const keep = inner.nodes.filter((n) => n.type !== 'bundleInput' && n.type !== 'bundleOutput'); keep.forEach((n) => { n.x = (n.x || 0) - (Math.min(...keep.map((q) => q.x || 0))) + dx; n.y = (n.y || 0) - (Math.min(...keep.map((q) => q.y || 0))) + dy; });
      const wires = inner.wires.filter((w) => !ins.has(w.from) && ![...outs.values()].some((o) => o.id === w.to)); const ext = [];
      for (const w of g.wires) { if (w.to === b.id) { const bi = ins.get(w.in); if (bi) for (const iw of inner.wires.filter((q) => q.from === bi.id)) ext.push({ from: w.from, out: w.out, to: iw.to, in: iw.in }); } else if (w.from === b.id) { const bo = outs.get(w.out); if (bo) for (const iw of inner.wires.filter((q) => q.to === bo.id)) ext.push({ from: iw.from, out: iw.out, to: w.to, in: w.in }); } }
      g.nodes = g.nodes.filter((n) => n !== b).concat(keep); g.wires = g.wires.filter((w) => w.from !== b.id && w.to !== b.id).concat(wires, ext); this.sel.clear(); this.changed(); this.render(); this.drawSide();
    }

    /* ---------------- settings panel ---------------- */
    selectNode(id) { this.sel = new Set(id ? [id] : []); this.render(); this.drawSide(); }
    drawSide() {
      if (this.ctx.onSelectNode) { const only = this.sel.size === 1 ? [...this.sel][0] : null; if (only !== this._lastSel) { this._lastSel = only; this.ctx.onSelectNode(only); } }
      const s = this.sideEl; s.textContent = ''; const ids = [...this.sel]; const g = this.graph;
      if (ids.length !== 1) { s.append(h('div', { class: 'group-title' }, ids.length > 1 ? ids.length + ' blocks selected' : 'Block settings'), h('div', { class: 'empty left', style: 'font-size:12px' }, ids.length > 1 ? [h('p', {}, 'Right-click for more actions.'), this.readOnly ? null : h('button', { class: 'btn sm', onclick: () => this.groupSel() }, 'Group into bundle')] : ['Select a block to edit its settings.', h('p', {}, 'Tips:'), h('ul', { style: 'padding-left:16px;margin:4px 0' }, h('li', {}, 'Drag from an output (right) to an input (left) to connect.'), h('li', {}, 'Double-click the canvas to search blocks.'), h('li', {}, 'Click a wire, then Delete to remove it.'), h('li', {}, 'Middle-drag or Alt-drag to pan, wheel to zoom.'))])); return; }
      const n = g.nodes.find((x) => x.id === ids[0]); if (!n) return; const def = VXRT.blocks[n.type];
      if (!def) { s.append(h('div', { class: 'group-title' }, 'Missing block'), h('p', { style: 'color:var(--danger)' }, `The block type “${n.type}” is not available. It may come from a plugin that is disabled or removed.`)); return; }
      s.append(h('div', { class: 'group-title' }, def.label, h('span', { class: 'tag', style: `background:${VXRT.catColor(def.cat)}33;color:${VXRT.catColor(def.cat)}` }, VXRT.CATEGORIES.find((c) => c.id === def.cat)?.label || def.cat)), h('p', { style: 'color:var(--muted);font-size:12px;margin:0 0 8px' }, def.desc), h('button', { class: 'btn sm', onclick: () => VX.docs.openBlock(def) }, VX.icon('docs', 13), 'Full reference'));
      const touch = () => { this.changed(false); const el = this.world.querySelector(`.ge-node[data-id="${n.id}"]`); if (el) { const fresh = this._nodeEl(n); el.replaceWith(fresh); } this.drawWires(); };
      let timer; const commit = () => { clearTimeout(timer); timer = setTimeout(() => this._snap(), 400); };
      const shown = (p) => !p.showIf || [].concat(p.showIf.in || p.showIf.is).includes(((n.params || {})[p.showIf.key] ?? VXRT.paramDefaults(def)[p.showIf.key]));
      for (const p of def.params || []) { if (!shown(p)) continue; const val = (n.params || {})[p.key] ?? VXRT.paramDefaults(def)[p.key]; s.append(this._paramField(p, val, (v) => { (n.params ||= {})[p.key] = v; touch(); commit(); if (n.type === 'bundleInput' || n.type === 'bundleOutput') this.render(); else if ((def.params || []).some((q) => q.showIf && q.showIf.key === p.key)) this.drawSide(); }, n)); }
      if (n.label !== undefined || true) s.append(VX.ui.field('Label', (() => { const i = h('input', { value: n.label || '', placeholder: 'optional name' }); i.onchange = () => { n.label = i.value || undefined; touch(); this._snap(); this.ctx.onChange && this.ctx.onChange(this.root); }; return i; })(), 'A custom title for this block on the canvas'));
      s.append(h('div', { style: 'margin-top:12px;display:flex;gap:6px' }, h('button', { class: 'btn sm', disabled: this.readOnly, onclick: () => this.duplicate() }, 'Duplicate'), h('button', { class: 'btn sm danger', disabled: this.readOnly, onclick: () => this.deleteSel() }, 'Delete')));
    }
    _paramField(p, val, set, node) {
      const ro = this.readOnly; const A = this.ctx.assets ? this.ctx.assets() : { sprites: {}, sounds: {}, models: {} }; let ctl;
      switch (p.type) {
        case 'number': ctl = h('input', { type: 'number', value: val, min: p.min, max: p.max, step: p.step ?? 'any', disabled: ro }); ctl.oninput = () => set(ctl.value === '' ? 0 : parseFloat(ctl.value)); break;
        case 'bool': ctl = VX.ui.sw(!!val, (v) => !ro && set(v)); break;
        case 'select': { ctl = h('select', { disabled: ro }, (p.options || []).map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v }, l); })); ctl.value = val; ctl.onchange = () => set(ctl.value); break; }
        case 'color': ctl = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(val) ? val : '#ffffff', disabled: ro }); ctl.oninput = () => set(ctl.value); break;
        case 'multiline': case 'code': ctl = h('textarea', { rows: p.type === 'code' ? 7 : 3, spellcheck: false, disabled: ro }, val ?? ''); ctl.oninput = () => set(ctl.value); break;
        case 'anim': { const fill = () => { const list = this.ctx.targetAnims ? this.ctx.targetAnims(node && node.params ? node.params.target : 'self') : []; ctl.textContent = ''; ctl.append(h('option', { value: '' }, '— none / sprite default —')); const grp = { sprite: 'Sprite animations', model: '3D model poses', clip: 'Keyframe clips' }; for (const k of ['sprite', 'model', 'clip']) { const l = list.filter((x) => x.kind === k); if (l.length) ctl.append(h('optgroup', { label: grp[k] }, l.map((x) => h('option', { value: k === 'clip' ? 'clip:' + x.id : x.name }, x.name)))); } if (val && ![...ctl.querySelectorAll('option')].some((o) => o.value === val)) ctl.append(h('option', { value: val }, val + ' (not on target)')); ctl.value = val ?? ''; }; ctl = h('select', { disabled: ro }); fill(); ctl.onfocus = () => { const v = ctl.value; fill(); ctl.value = v; }; ctl.onchange = () => set(ctl.value); break; }
        case 'clip': { const list = Object.values(A.animations || {}); ctl = h('select', { disabled: ro }, h('option', { value: '' }, '— none (create in Assets → Animations) —'), list.map((a) => h('option', { value: a.id }, a.name))); ctl.value = list.some((a) => a.id === val) ? val : ''; ctl.onchange = () => set(ctl.value); break; }
        case 'material': { const list = Object.values(A.materials || {}); ctl = h('select', { disabled: ro }, h('option', { value: '' }, '— none (add files in Assets → Materials) —'), list.map((a) => h('option', { value: a.id }, a.name))); ctl.value = list.some((a) => a.id === val) ? val : ''; ctl.onchange = () => set(ctl.value); break; }
        case 'shader': { const list = Object.values(A.shaders || {}); ctl = h('select', { disabled: ro }, h('option', { value: '' }, '— none (add files in Assets → Shaders) —'), list.map((a) => h('option', { value: a.id }, a.name))); ctl.value = list.some((a) => a.id === val) ? val : ''; ctl.onchange = () => set(ctl.value); break; }
        case 'sound': case 'sprite': { const list = Object.values(p.type === 'sound' ? A.sounds : A.sprites); ctl = h('select', { disabled: ro }, h('option', { value: '' }, '— none —'), list.map((a) => h('option', { value: a.id }, a.name))); ctl.value = list.some((a) => a.id === val) ? val : ''; if (val && !list.some((a) => a.id === val)) ctl.append(h('option', { value: val }, val + ' (missing)')), (ctl.value = val); ctl.onchange = () => set(ctl.value); break; }
        case 'target': {
          const names = this.ctx.objectNames ? this.ctx.objectNames() : [], tags = this.ctx.tags ? this.ctx.tags() : [], sp = p.specials || ['self', 'other', 'parent', 'all'];
          const sel = h('select', { disabled: ro }), txt = h('input', { placeholder: 'object name, tag:name or expression', disabled: ro, style: 'margin-top:4px;display:none' });
          const build = () => { sel.textContent = ''; if (sp.length) sel.append(h('optgroup', { label: 'Special' }, sp.map((v) => h('option', { value: v }, ({ self: 'self (this object)', other: 'other (last collision)', parent: 'parent', all: 'all objects', mouse: 'mouse pointer', any: 'anything', '': p.emptyLabel || 'anything' })[v] ?? v))));
            const ob = this.ctx.objectNames ? this.ctx.objectNames() : names; if (ob.length) sel.append(h('optgroup', { label: 'Objects' }, [...new Set(ob)].map((v) => h('option', { value: v }, v)))); const tg = this.ctx.tags ? this.ctx.tags() : tags; if (tg.length) sel.append(h('optgroup', { label: 'Tags (every object with it)' }, tg.map((t) => h('option', { value: 'tag:' + t }, 'tag: ' + t)))); sel.append(h('option', { value: '__custom' }, 'Custom… (type a name / x,y)')); };
          build(); const cur = val ?? (p.def ?? 'self'); const known = () => [...sel.options].some((o) => o.value === cur); if (known()) sel.value = cur; else { sel.value = '__custom'; txt.style.display = ''; txt.value = cur; }
          sel.onfocus = () => { const v = sel.value; build(); sel.value = [...sel.options].some((o) => o.value === v) ? v : '__custom'; };
          sel.onchange = () => { if (sel.value === '__custom') { txt.style.display = ''; txt.focus(); set(txt.value || ''); } else { txt.style.display = 'none'; set(sel.value); } }; txt.oninput = () => set(txt.value);
          ctl = h('div', {}, sel, txt); break; }
        case 'key': { const i = h('input', { value: val ?? '', disabled: ro, placeholder: 'press “Pick” then a key' }); i.oninput = () => set(i.value); const pick = h('button', { class: 'btn sm', disabled: ro, onclick: () => { i.value = 'press a key…'; const f = (e) => { e.preventDefault(); e.stopPropagation(); removeEventListener('keydown', f, true); const k = e.key === ' ' ? 'space' : e.key.toLowerCase(); i.value = k; set(k); }; addEventListener('keydown', f, true); } }, 'Pick'); ctl = h('div', { style: 'display:flex;gap:4px' }, i, pick); break; }
        case 'multi': { const cur = new Set(String(val || '').split(',').filter(Boolean)); ctl = h('div', {}, (p.options || []).map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; const cb = h('input', { type: 'checkbox', disabled: ro }); cb.checked = cur.has(v); cb.onchange = () => { cb.checked ? cur.add(v) : cur.delete(v); set([...cur].join(',')); }; return h('label', { style: 'display:flex;gap:6px;font-size:12px;color:var(--text)' }, cb, l); })); break; }
        default: ctl = h('input', { value: val ?? '', disabled: ro, placeholder: p.hint || '' }); ctl.oninput = () => set(ctl.value);
      }
      return VX.ui.field(p.label, ctl, p.hint);
    }
  }
  VX.GraphEditor = GraphEditor;
})();
