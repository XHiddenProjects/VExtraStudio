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
      this.zoom = 1; this.snap = true; this.showGrid = true; this.sel = []; this.clip = null; this.device = 'desktop';
      this.page = (Array.isArray(this.doc.pages) && this.doc.pages[0]) || '';
      this.undoStack = []; this.redoStack = [];
      this.root = this._build(); this._snapshot(true); this.render(); this.fit();
    }
    static blank() { return new Designer({ format: 'vextra-ui', width: 1024, height: 640, bg: '#14161b', items: [] }); }
    static example() { return new Designer(null); }
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
      this.bar = h('div', { class: 'dz-bar' }); this.dev = h('div', { class: 'dz-device hidden' });
      this.main = h('div', { class: 'dz-main' }, this.bar, this.canvas, this.dev);
      const root = h('div', { class: 'dz' }, this.main, this.side);
      this.canvas.addEventListener('mousedown', (e) => this._canvasDown(e));
      this._ro = new ResizeObserver(() => { if (this._auto !== false && this.canvas.clientWidth > 0) this.fit(); }); this._ro.observe(this.canvas); this._auto = true;
      this.canvas.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });
      this.canvas.addEventListener('keydown', (e) => this._key(e));
      // palette drops (pointer-based, see core/dnd.js)
      VX.dnd.target(this.canvas, (data, cx, cy) => {
        if (!data || data.kind !== 'ui') return VX.ui.toast('That item belongs to the game editor', 'error');
        const r = this.stage.getBoundingClientRect();
        this.addItem(data.type, (cx - r.left) / this.zoom, (cy - r.top) / this.zoom, true);
      }, (d) => d && d.kind === 'ui');
      this._drawBar();
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
        const ids = this.doc.items.filter((i) => !i.hidden && !i.locked && this._visible(i) && i.x < x + w && i.x + i.w > x && i.y < y + hh && i.y + i.h > y).map((i) => i.id);
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
      else if (mod && k === 'a') { e.preventDefault(); this.select(this.doc.items.filter((i) => !i.hidden && !i.locked && this._visible(i)).map((i) => i.id)); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.remove(); }
      else if (e.key === 'Escape') this.select([]);
      else if (e.key.startsWith('Arrow') && this.sel.length) {
        e.preventDefault(); const s = e.shiftKey ? 10 : 1; if (VX.a11y) { const f = this.items()[0]; if (f) VX.a11y.announce('Position ' + Math.round(f.x + (e.key === 'ArrowRight' ? s : e.key === 'ArrowLeft' ? -s : 0)) + ', ' + Math.round(f.y + (e.key === 'ArrowDown' ? s : e.key === 'ArrowUp' ? -s : 0))); }
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

    /* ----- site builder: pages, sections, devices (like a website builder) ----- */
    pages() { const out = []; for (const p of this.doc.pages || []) if (p && !out.includes(p)) out.push(p); for (const it of this.doc.items) if (it.page && !out.includes(it.page)) out.push(it.page); return out; }
    _visible(it) { return !this.page || !it.page || it.page === this.page; }
    _slug(n) { return String(n || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''); }
    setPage(name) { this.page = name; this.sel = []; this.render(); this._drawBar(); }
    async addPage() {
      const raw = await VX.ui.ask('Name of the new page (for example About)', ''); if (raw == null) return; const name = this._slug(raw); if (!name) return VX.ui.toast('Use letters or numbers for a page name', 'error');
      const pages = this.pages(); if (pages.includes(name)) return VX.ui.toast('There is already a page called ' + name, 'error');
      if (!pages.length) { pages.push('home'); for (const it of this.doc.items) if (!it.page && !['navbar', 'footer'].includes(it.type)) it.page = 'home'; }  /* first page: the existing content becomes Home; navbar and footer stay on every page */
      pages.push(name); this.doc.pages = pages; this.setPage(name); this.commit(); VX.ui.toast(`Page “${name}” added. Link to it with #${name}`);
    }
    async renamePage(old) {
      const raw = await VX.ui.ask('Rename the page', old); if (raw == null) return; const name = this._slug(raw); if (!name || name === old) return; if (this.pages().includes(name)) return VX.ui.toast('There is already a page called ' + name, 'error');
      this.doc.pages = this.pages().map((x) => (x === old ? name : x)); for (const it of this.doc.items) if (it.page === old) it.page = name; this.page = name; this.render(); this._drawBar(); this.commit();
    }
    async deletePage(name) {
      const n = this.doc.items.filter((i) => i.page === name).length; if (!(await VX.ui.confirm(`Delete the page “${name}”${n ? ' and its ' + n + ' item' + (n === 1 ? '' : 's') : ''}?`, 'Delete', { danger: true }))) return;
      this.doc.items = this.doc.items.filter((i) => i.page !== name); this.doc.pages = this.pages().filter((x) => x !== name); this.page = this.doc.pages[0] || ''; this.sel = []; this.render(); this._drawBar(); this.commit();
    }
    _bottom() { let y = 0; for (const it of this.doc.items) if (this._visible(it) && it.type !== 'footer') y = Math.max(y, it.y + it.h); return y; }
    /** Adds a ready-made section (several items) under the content of the current page. */
    addSection(kind) {
      const W = this.doc.width, reg = registry(), y0 = Math.round(this._bottom() / 8) * 8 + (this._bottom() ? 32 : 0);
      const mk = (type, x, y, w, hh, props) => { const d = reg[type]; if (!d) return null; return { id: uid('i'), type, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh == null ? d.h : hh), rot: 0, props: Object.assign(clone(d.props), props || {}) }; };
      const gap = 24, col = (n, i, pad = 48) => { const w = (W - pad * 2 - gap * (n - 1)) / n; return [pad + i * (w + gap), w]; };
      const T = {
        hero: () => [mk('hero', 0, y0, W, 380)],
        features: () => [mk('heading', 48, y0, W - 96, 52, { text: 'Why choose us', align: 'center' }), ...[0, 1, 2].map((i) => mk('card', col(3, i)[0], y0 + 76, col(3, i)[1], 170, { title: ['Fast', 'Simple', 'Secure'][i], body: ['Loads in a blink.', 'Easy to manage.', 'Built to be safe.'][i] }))],
        pricing: () => [mk('heading', 48, y0, W - 96, 52, { text: 'Pricing', align: 'center' }), ...[0, 1, 2].map((i) => mk('pricing', col(3, i)[0], y0 + 76, col(3, i)[1], 320))],
        testimonials: () => [mk('heading', 48, y0, W - 96, 52, { text: 'What people say', align: 'center' }), ...[0, 1].map((i) => mk('testimonial', col(2, i)[0], y0 + 76, col(2, i)[1], 190))],
        contact: () => [mk('heading', 48, y0, W - 96, 52, { text: 'Get in touch', align: 'center' }), mk('input', (W - 420) / 2, y0 + 76, 420, 44, { placeholder: 'Your name' }), mk('input', (W - 420) / 2, y0 + 132, 420, 44, { placeholder: 'Your email' }), mk('textarea', (W - 420) / 2, y0 + 188, 420, 120, { placeholder: 'Message' }), mk('button', (W - 420) / 2, y0 + 320, 420, 46, { text: 'Send message' })],
        cta: () => [mk('card', 48, y0, W - 96, 190, { title: 'Ready to get started?', body: 'Join today. It only takes a minute.' }), mk('button', (W - 200) / 2, y0 + 120, 200, 46, { text: 'Get started' })],
        footer: () => [mk('footer', 0, Math.max(y0, this._bottom() + 32), W, 64)],
      };
      const built = (T[kind] ? T[kind]() : []).filter(Boolean); if (!built.length) return;
      for (const it of built) { if (this.page && it.type !== 'footer') it.page = this.page; this.doc.items.push(it); }
      const bottom = Math.max(...built.map((i) => i.y + i.h)) + 40; if (bottom > this.doc.height) this.doc.height = bottom;
      this.sel = built.map((i) => i.id); this.render(); this.commit(); this.canvas.scrollTo({ top: Math.max(0, (y0 - 40) * this.zoom), behavior: 'smooth' });
    }
    setDevice(d) { this.device = d; this.canvas.classList.toggle('hidden', d !== 'desktop'); this.dev.classList.toggle('hidden', d === 'desktop'); this._drawBar(); if (d !== 'desktop') this._refreshDevice(); }
    _refreshDevice() {
      if (this.device === 'desktop') return; clearTimeout(this._dt); this._dt = setTimeout(() => {
        const w = this.device === 'phone' ? 390 : 768; const html = this.toHTML(this.doc.title || 'Preview'); const guarded = VX.ui.guardHash ? VX.ui.guardHash(html) : html;
        this.dev.textContent = ''; const fr = h('iframe', { class: 'dz-devframe', sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups', style: `width:${w}px` }); fr.srcdoc = guarded;
        this.dev.append(h('div', { class: 'dz-devnote' }, `${this.device === 'phone' ? 'Phone' : 'Tablet'} preview (${w}px wide) – this is how the exported page looks. Switch to Desktop to edit.`), fr);
      }, 120);
    }
    _drawBar() {
      const b = this.bar; b.textContent = ''; const pages = this.pages(), btn = (label, fn, cls = '', title = '') => h('button', { class: 'btn sm ' + cls, onclick: fn, title }, label);
      const tabs = h('div', { class: 'dz-pages' });
      if (!pages.length) tabs.append(h('span', { class: 'dz-pagehint' }, 'One page'));
      for (const pg of pages) tabs.append(h('button', { class: 'dz-pagetab' + (pg === this.page ? ' on' : ''), title: pg === this.page ? 'Double-click to rename · right-click to delete' : 'Open the page “' + pg + '”', onclick: () => this.setPage(pg), ondblclick: () => this.renamePage(pg), oncontextmenu: (e) => { e.preventDefault(); this.deletePage(pg); } }, pg));
      tabs.append(btn('+ Page', () => this.addPage(), 'dz-add', 'Add a page. Link to it with #name'));
      if (this.page) tabs.append(btn('🗑', () => this.deletePage(this.page), 'dz-del', 'Delete this page'));
      const sec = h('select', { class: 'dz-sec', title: 'Add a ready-made section under your content', onchange: () => { if (sec.value) this.addSection(sec.value); sec.value = ''; } }, h('option', { value: '' }, '＋ Section…'), [['hero', 'Hero'], ['features', 'Features'], ['pricing', 'Pricing'], ['testimonials', 'Testimonials'], ['cta', 'Call to action'], ['contact', 'Contact form'], ['footer', 'Footer']].map(([v, l]) => h('option', { value: v }, l)));
      const dv = h('div', { class: 'dz-devs' }, [['desktop', '🖥', 'Desktop – edit'], ['tablet', '▭', 'Tablet preview'], ['phone', '📱', 'Phone preview']].map(([k, ic, t]) => h('button', { class: 'btn sm' + (this.device === k ? ' on' : ''), title: t, onclick: () => this.setDevice(k) }, ic)));
      b.append(tabs, h('span', { class: 'spacer' }), this.device === 'desktop' ? sec : null, dv);
    }
    addItem(type, x, y, centered) {
      const def = registry()[type]; if (!def) return null;
      const it = { id: uid('i'), type, x: 0, y: 0, w: def.w, h: def.h, rot: 0, props: clone(def.props) };
      if (this.page && !['navbar', 'footer', 'announcement'].includes(type)) it.page = this.page;   /* new items belong to the page you are editing */
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
    select(ids) { this.sel = Array.isArray(ids) ? ids : ids ? [ids] : []; if (VX.a11y && this.sel.length) { const it = this.doc.items.find((i) => i.id === this.sel[0]); VX.a11y.announce(this.sel.length > 1 ? this.sel.length + ' items selected' : (it ? (it.type || 'item') + ' selected' : '')); } this._applyStageItems(); this._drawOverlay(); this._drawSide(); }

    /* ----- zoom ----- */
    setZoom(z, auto) { if (!auto) this._auto = false; this.zoom = VX.clamp(z, 0.2, 3); this._applyZoom(); this.hooks.onZoom && this.hooks.onZoom(this.zoom); }
    fit() { this._auto = true; requestAnimationFrame(() => { const w = this.canvas.clientWidth - 90, hh = this.canvas.clientHeight - 90; if (w > 0 && hh > 0) this.setZoom(Math.min(1, w / this.doc.width, hh / this.doc.height), true); else this._applyZoom(); }); }
    _applyZoom() {
      const z = this.zoom;
      Object.assign(this.stage.style, { width: this.doc.width + 'px', height: this.doc.height + 'px', background: this.doc.bg, transform: `scale(${z})`, left: '0px', top: '0px' });
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
        if (it.hidden || !this._visible(it)) node.style.display = 'none';
        node.addEventListener('mousedown', (e) => this._startDrag(e, it.id));
        this.stage.append(node); this.els.set(it.id, node); this._place(node, it, idx);
      });
      this._applyZoom(); this._applyStageItems(); this._drawSide(); if (this.device !== 'desktop') this._refreshDevice();
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
      /* floating toolbar above the selected element (constant size at any zoom) */
      const tb = h('div', { class: 'dz-float', style: `left:${it.x}px;top:${it.y}px;transform:translateY(-100%) scale(${1 / this.zoom});transform-origin:0 100%` });
      const fb = (t, tip, fn) => h('button', { title: tip, onmousedown: (e) => e.stopPropagation(), onclick: (e) => { e.stopPropagation(); fn(); } }, t);
      tb.append(fb('⧉', 'Duplicate (Ctrl+D)', () => this.duplicate()), fb('↑', 'Bring forward', () => this.reorder('up')), fb('↓', 'Send backward', () => this.reorder('down')), fb(it.page ? '🌐' : '📌', it.page ? 'On page “' + it.page + '” – click to show it on every page' : 'On every page – click to put it only on the current page', () => { if (it.page) delete it.page; else if (this.page) it.page = this.page; else return VX.ui.toast('Add a page first (+ Page)', 'error'); this.render(); this.commit(); }), fb('🗑', 'Delete', () => this.remove()));
      this.overlay.append(tb);
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
        s.append(h('div', { class: 'group-title' }, 'Site'));
        { const ti = h('input', { type: 'text', value: this.doc.title || '', placeholder: 'Browser tab title' }); ti.addEventListener('input', () => { this.doc.title = ti.value; }); ti.addEventListener('change', () => this.commit()); s.append(VX.ui.field('Site title', ti)); }
        s.append(h('div', { class: 'dz-help' }, 'Tip: drag components from the left, or use ＋ Section above for ready-made blocks. Pages are tabs above the canvas; link to a page or anchor with #name.'));
        s.append(h('div', { class: 'group-title' }, 'Canvas'));
        s.append(F('Width', this._num(this.doc.width, (v) => { this.doc.width = Math.max(100, v); this._applyZoom(); })), F('Height', this._num(this.doc.height, (v) => { this.doc.height = Math.max(100, v); this._applyZoom(); })));
        const bg = h('input', { type: 'color', value: this.doc.bg }); bg.addEventListener('input', () => { this.doc.bg = bg.value; this._applyZoom(); }); bg.addEventListener('change', () => this.commit());
        s.append(F('Background', bg));
        const presets = h('div', { class: 'row' }, [['Desktop', 1280, 800], ['Laptop', 1024, 640], ['Tablet', 768, 1024], ['Phone', 390, 844]].map(([n, w, hh]) => h('button', { class: 'btn sm', onclick: () => { this.doc.width = w; this.doc.height = hh; this._applyZoom(); this.commit(); this._drawSide(); this.fit(); } }, n)));
        s.append(F('Size presets', presets));
        const rs = h('select', {}, [['auto', 'Auto – scale to the screen, stack on phones'], ['scale', 'Scale to the screen only'], ['fixed', 'Fixed size']].map(([v, l]) => h('option', { value: v }, l))); rs.value = this.doc.responsive || 'auto'; rs.addEventListener('change', () => { this.doc.responsive = rs.value; this.commit(); });
        s.append(F('Responsive layout', rs), F('Stack below (px)', this._num(this.doc.breakpoint || 640, (v) => { this.doc.breakpoint = Math.max(320, v); })));
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
        const rotRow = F('Rotation', this._num(it.rot || 0, (v) => { it.rot = v; this.refreshItem(it); }, { 'data-geom': 'rot' })); rotRow.classList.add('adv'); s.append(g, rotRow);
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
        s.append(h('div', { class: 'group-title' }, 'Responsive & links'));
        const txt = (key, ph) => { const i = h('input', { type: 'text', value: it[key] || '', placeholder: ph }); i.addEventListener('input', () => { it[key] = i.value; }); i.addEventListener('change', () => { this.commit(); this._drawSide(); }); return i; };
        const mob = h('select', {}, [['stack', 'Stack in reading order'], ['full', 'Stack, full width'], ['hide', 'Hide on phones']].map(([v, l]) => h('option', { value: v }, l))); mob.value = it.mobile || 'stack'; mob.addEventListener('change', () => { it.mobile = mob.value; this.commit(); });
        s.append(F('Anchor name', txt('anchor', 'e.g. pricing  →  link to #pricing')), F('Show on page', this.pages().length ? (() => { const sel = h('select', {}, [h('option', { value: '' }, 'Every page'), ...this.pages().map((x) => h('option', { value: x }, x))]); sel.value = it.page || ''; sel.addEventListener('change', () => { if (sel.value) it.page = sel.value; else delete it.page; this.render(); this.commit(); }); return sel; })() : txt('page', 'use + Page above')), F('On phones', mob));
        s.append(h('div', { class: 'group-title adv' }, 'Arrange')); { const ar = this._arrangeRow(); ar.classList.add('adv'); s.append(ar); }
        s.append(h('div', { class: 'row adv', style: 'margin-top:6px' }, [['⇤', 'left', 'Align left'], ['↔', 'center', 'Center horizontally on canvas'], ['⇥', 'right', 'Align right'], ['⤒', 'top', 'Align top'], ['↕', 'middle', 'Center vertically on canvas'], ['⤓', 'bottom', 'Align bottom']].map(([l, k, t]) => h('button', { class: 'btn sm', title: t, onclick: () => this.align(k) }, l))));
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
      const snap = btn('Snap', () => { this.snap = !this.snap; snap.classList.toggle('on', this.snap); }, 'adv' + (this.snap ? ' on' : ''), 'Snap to the 8px grid (hold Alt to bypass)');
      const grid = btn('Grid', () => { this.showGrid = !this.showGrid; grid.classList.toggle('on', this.showGrid); this._applyZoom(); }, 'adv' + (this.showGrid ? ' on' : ''), 'Show grid');
      return [btn([VX.icon('undo', 14), 'Undo'], () => this.undo(), '', 'Ctrl+Z'), btn([VX.icon('redo', 14), 'Redo'], () => this.redo(), '', 'Ctrl+Shift+Z'), h('span', { class: 'sep' }),
        btn('−', () => this.setZoom(this.zoom / 1.2)), zl, btn('+', () => this.setZoom(this.zoom * 1.2)), btn('Fit', () => this.fit()), h('span', { class: 'sep' }), snap, grid, h('span', { class: 'spacer' }),
        btn([VX.icon('play', 13), 'Preview'], () => this.hooks.preview && this.hooks.preview(this), 'primary'), btn([VX.icon('code', 14), 'Export HTML'], () => this.hooks.exportCode && this.hooks.exportCode(this))];
    }
  }
  VX.Designer = Designer;
})();
