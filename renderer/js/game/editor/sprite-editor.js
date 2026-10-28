/* Vextra game editor – pixel sprite editor with frames and named animations. */
(function () {
  const { h } = VX;
  const PAL = ['#000000', '#ffffff', '#ff4d4d', '#ff9f43', '#ffd54a', '#4ade80', '#22c3a6', '#6c8cff', '#a06cff', '#ff7ab6', '#8a5a2b', '#555b70', '#9aa3bd', '#1b2a63', '#10131a', '#e0e4ee'];
  const hexToRgba = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; };

  class SpriteEditor {
    constructor(asset, project, onChange) {
      this.a = asset; this.project = project; this.onChange = onChange; this.tool = 'pencil'; this.color = '#6c8cff'; this.size = 1; this.zoom = Math.max(2, Math.min(24, Math.floor(480 / Math.max(asset.w, asset.h)))); this.cur = 0; this.mx = false; this.my = false; this.onion = false; this.grid = true; this.history = []; this.redo = []; this.frames = []; this.alphaLock = false;
      this.el = h('div', { class: 'se' }); this.loaded = false; this.load().then(() => { this.loaded = true; this.build(); });
    }
    async load() {
      const a = this.a; this.frames = [];
      for (const url of a.frames.length ? a.frames : [VX.blankFrame(a.w, a.h)]) {
        const c = document.createElement('canvas'); c.width = a.w; c.height = a.h; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false;
        await new Promise((res) => { const im = new Image(); im.onload = () => { x.drawImage(im, 0, 0, a.w, a.h); res(); }; im.onerror = res; im.src = url; });
        this.frames.push(c);
      }
    }
    get c() { return this.frames[this.cur]; }
    get ctx2() { return this.c.getContext('2d', { willReadFrequently: true }); }
    build() {
      const a = this.a, el = this.el; el.textContent = '';
      const tools = [['pencil', '✏️', 'Pencil (B)'], ['eraser', '🧽', 'Eraser (E)'], ['fill', '🪣', 'Fill (G)'], ['line', '📏', 'Line (L)'], ['rect', '▭', 'Rectangle (R)'], ['ellipse', '◯', 'Ellipse (O)'], ['pick', '💧', 'Color picker (I)'], ['move', '✥', 'Shift pixels']];
      this.toolBtns = tools.map(([k, i, t]) => h('button', { class: 'btn sm tool' + (k === this.tool ? ' on' : ''), title: t, onclick: () => { this.tool = k; this.toolBtns.forEach((b, j) => b.classList.toggle('on', tools[j][0] === k)); } }, i));
      const sizeSel = h('select', { onchange: (e) => { this.size = +e.target.value; } }, [1, 2, 3, 4, 6, 8].map((n) => h('option', { value: n }, n + ' px')));
      const left = h('div', { class: 'se-tools' }, this.toolBtns, h('hr'), h('label', { class: 'mini' }, 'Brush'), sizeSel,
        h('button', { class: 'btn sm' + (this.mx ? ' on' : ''), title: 'Mirror horizontally', onclick: (e) => { this.mx = !this.mx; e.target.classList.toggle('on', this.mx); } }, '⇋ X'), h('button', { class: 'btn sm' + (this.my ? ' on' : ''), title: 'Mirror vertically', onclick: (e) => { this.my = !this.my; e.target.classList.toggle('on', this.my); } }, '⇅ Y'),
        h('hr'), h('button', { class: 'btn sm', onclick: () => this.undo() }, '↶'), h('button', { class: 'btn sm', onclick: () => this.redoOp() }, '↷'), h('button', { class: 'btn sm', onclick: () => this.clear() }, 'Clear'));
      this.picker = h('input', { type: 'color', value: this.color, oninput: (e) => { this.color = e.target.value; } });
      const palette = h('div', { class: 'se-pal' }, PAL.map((c) => h('button', { class: 'sw', style: 'background:' + c, onclick: () => { this.color = c; this.picker.value = c; } })));
      this.cv = h('canvas', { class: 'se-cv' }); this.fit();
      this.wrap = h('div', { class: 'se-stage' }, this.cv);
      const zoom = h('input', { type: 'range', min: 1, max: 32, value: this.zoom, oninput: (e) => { this.zoom = +e.target.value; this.fit(); this.draw(); } });
      this.status = h('span', { class: 'mini' }, '');
      const center = h('div', { class: 'se-center' }, this.wrap, h('div', { class: 'se-foot' }, h('label', { class: 'mini' }, 'Zoom'), zoom, h('label', { class: 'mini' }, h('input', { type: 'checkbox', checked: this.grid, onchange: (e) => { this.grid = e.target.checked; this.draw(); } }), ' Grid'), h('label', { class: 'mini' }, h('input', { type: 'checkbox', checked: this.onion, onchange: (e) => { this.onion = e.target.checked; this.draw(); } }), ' Onion skin'), this.status));
      this.prev = h('canvas', { class: 'se-prev', width: a.w, height: a.h }); this.prev.style.width = Math.min(120, a.w * 3) + 'px';
      this.frameList = h('div', { class: 'se-frames' }); this.animBox = h('div', { class: 'se-anims' });
      const name = h('input', { value: a.name, oninput: (e) => { a.name = e.target.value; this.changed(); } });
      const fps = h('input', { type: 'number', min: 1, max: 60, value: a.fps || 8, oninput: (e) => { a.fps = Math.max(1, +e.target.value || 8); this.changed(); } });
      const right = h('div', { class: 'se-side' }, h('label', { class: 'mini' }, 'Name'), name, h('label', { class: 'mini' }, 'Color'), h('div', { class: 'row' }, this.picker), palette,
        h('label', { class: 'mini' }, 'Preview'), this.prev, h('label', { class: 'mini' }, 'Frames per second'), fps,
        h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', onclick: () => this.importImage() }, 'Import image…'), h('button', { class: 'btn sm', onclick: () => this.resize() }, 'Resize…'), h('button', { class: 'btn sm', onclick: () => this.exportPNG() }, 'Export PNG')),
        h('label', { class: 'mini' }, 'Animations'), this.animBox);
      const frames = h('div', { class: 'se-framebar' }, h('div', { class: 'row' }, h('b', {}, 'Frames'), h('button', { class: 'btn sm', onclick: () => this.addFrame(false) }, '＋ Blank'), h('button', { class: 'btn sm', onclick: () => this.addFrame(true) }, 'Duplicate'), h('button', { class: 'btn sm', onclick: () => this.delFrame() }, 'Delete'), h('button', { class: 'btn sm', onclick: () => this.moveFrame(-1) }, '◀'), h('button', { class: 'btn sm', onclick: () => this.moveFrame(1) }, '▶')), this.frameList);
      el.append(left, center, right, frames);
      this.bindCanvas(); this.renderFrames(); this.renderAnims(); this.draw(); this.startPreview();
      this.keyH = (e) => { if (!document.body.contains(el) || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; const k = e.key.toLowerCase(); const mp = { b: 'pencil', e: 'eraser', g: 'fill', l: 'line', r: 'rect', o: 'ellipse', i: 'pick' }; if (e.ctrlKey || e.metaKey) { if (k === 'z') { e.preventDefault(); e.shiftKey ? this.redoOp() : this.undo(); } return; } if (mp[k]) { this.tool = mp[k]; this.toolBtns.forEach((b, j) => b.classList.toggle('on', tools[j][0] === this.tool)); } }; document.addEventListener('keydown', this.keyH);
    }
    fit() { const a = this.a; this.cv.width = a.w * this.zoom; this.cv.height = a.h * this.zoom; this.cv.style.width = this.cv.width + 'px'; this.cv.style.height = this.cv.height + 'px'; }
    draw() {
      const a = this.a, z = this.zoom, x = this.cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, this.cv.width, this.cv.height);
      const t = Math.max(4, Math.min(z, 8)); for (let j = 0; j < this.cv.height; j += t) for (let i = 0; i < this.cv.width; i += t) { x.fillStyle = ((i / t + j / t) & 1) ? '#2a2f42' : '#222637'; x.fillRect(i, j, t, t); }
      if (this.onion && this.cur > 0) { x.globalAlpha = 0.3; x.drawImage(this.frames[this.cur - 1], 0, 0, this.cv.width, this.cv.height); x.globalAlpha = 1; }
      x.drawImage(this.c, 0, 0, this.cv.width, this.cv.height);
      if (this.shape) { this.drawShape(x, this.shape, true); }
      if (this.grid && z >= 6) { x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 1; x.beginPath(); for (let i = 0; i <= a.w; i++) { x.moveTo(i * z + 0.5, 0); x.lineTo(i * z + 0.5, this.cv.height); } for (let j = 0; j <= a.h; j++) { x.moveTo(0, j * z + 0.5); x.lineTo(this.cv.width, j * z + 0.5); } x.stroke(); }
      this.updatePrev();
    }
    updatePrev() { if (!this.prev) return; const x = this.prev.getContext('2d'); x.clearRect(0, 0, this.prev.width, this.prev.height); x.imageSmoothingEnabled = false; x.drawImage(this.animPlaying != null ? this.frames[this.animPlaying % this.frames.length] : this.c, 0, 0); }
    startPreview() { let i = 0; clearInterval(this.pt); this.pt = setInterval(() => { if (!document.body.contains(this.el)) { clearInterval(this.pt); return; } if (this.frames.length > 1) { this.animPlaying = i++ % this.frames.length; this.updatePrev(); } else this.animPlaying = null; }, 1000 / (this.a.fps || 8)); }
    px(e) { const r = this.cv.getBoundingClientRect(); return [Math.floor(((e.clientX - r.left) / r.width) * this.a.w), Math.floor(((e.clientY - r.top) / r.height) * this.a.h)]; }
    snapshot() { this.history.push({ f: this.cur, d: this.ctx2.getImageData(0, 0, this.a.w, this.a.h) }); if (this.history.length > 60) this.history.shift(); this.redo = []; }
    undo() { const s = this.history.pop(); if (!s) return; this.redo.push({ f: s.f, d: this.frames[s.f].getContext('2d').getImageData(0, 0, this.a.w, this.a.h) }); this.frames[s.f].getContext('2d').putImageData(s.d, 0, 0); this.cur = s.f; this.afterEdit(); }
    redoOp() { const s = this.redo.pop(); if (!s) return; this.history.push({ f: s.f, d: this.frames[s.f].getContext('2d').getImageData(0, 0, this.a.w, this.a.h) }); this.frames[s.f].getContext('2d').putImageData(s.d, 0, 0); this.cur = s.f; this.afterEdit(); }
    clear() { this.snapshot(); this.ctx2.clearRect(0, 0, this.a.w, this.a.h); this.afterEdit(); }
    stamp(x, y, erase) {
      const s = this.size, ctx = this.ctx2, pts = [[x, y]]; if (this.mx) pts.push([this.a.w - 1 - x - (s - 1), y]); if (this.my) pts.push([x, this.a.h - 1 - y - (s - 1)]); if (this.mx && this.my) pts.push([this.a.w - 1 - x - (s - 1), this.a.h - 1 - y - (s - 1)]);
      for (const [px, py] of pts) { if (erase) ctx.clearRect(px, py, s, s); else { ctx.fillStyle = this.color; ctx.clearRect(px, py, s, s); ctx.fillRect(px, py, s, s); } }
    }
    lineTo(x0, y0, x1, y1, fn) { const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx - dy; for (;;) { fn(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; } } }
    drawShape(ctx, sh, preview) {
      const z = preview ? this.zoom : 1; const put = (x, y) => { if (preview) { ctx.fillStyle = this.tool === 'eraser' ? '#ff4d4d88' : this.color; ctx.fillRect(x * z, y * z, this.size * z, this.size * z); } else this.stamp(x, y, false); };
      const { x0, y0, x1, y1 } = sh;
      if (this.tool === 'line') this.lineTo(x0, y0, x1, y1, put);
      else if (this.tool === 'rect') { const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1); for (let x = a; x <= b; x++) { put(x, c); put(x, d); } for (let y = c; y <= d; y++) { put(a, y); put(b, y); } }
      else if (this.tool === 'ellipse') { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2; const n = Math.max(24, Math.ceil((rx + ry) * 8)); let px = null; for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI * 2, x = Math.round(cx + Math.cos(t) * rx), y = Math.round(cy + Math.sin(t) * ry); if (!px || px[0] !== x || px[1] !== y) { put(x, y); px = [x, y]; } } }
    }
    fillAt(x, y) {
      const w = this.a.w, hh = this.a.h; if (x < 0 || y < 0 || x >= w || y >= hh) return; const ctx = this.ctx2, img = ctx.getImageData(0, 0, w, hh), d = img.data, i0 = (y * w + x) * 4, tgt = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]], rep = hexToRgba(this.color);
      if (tgt.every((v, k) => v === rep[k])) return; const same = (i) => d[i] === tgt[0] && d[i + 1] === tgt[1] && d[i + 2] === tgt[2] && d[i + 3] === tgt[3]; const st = [[x, y]];
      while (st.length) { const [cx, cy] = st.pop(); if (cx < 0 || cy < 0 || cx >= w || cy >= hh) continue; const i = (cy * w + cx) * 4; if (!same(i)) continue; d[i] = rep[0]; d[i + 1] = rep[1]; d[i + 2] = rep[2]; d[i + 3] = 255; st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]); }
      ctx.putImageData(img, 0, 0);
    }
    bindCanvas() {
      let down = false, last = null, start = null, erase = false;
      this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
      this.cv.addEventListener('pointerdown', (e) => {
        e.preventDefault(); const [x, y] = this.px(e); down = true; erase = e.button === 2 || this.tool === 'eraser'; last = [x, y]; start = [x, y]; this.cv.setPointerCapture(e.pointerId);
        if (this.tool === 'pick') { const d = this.ctx2.getImageData(x, y, 1, 1).data; if (d[3]) { this.color = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''); this.picker.value = this.color; } down = false; return; }
        this.snapshot();
        if (this.tool === 'fill') { this.fillAt(x, y); down = false; this.afterEdit(); return; }
        if (this.tool === 'pencil' || this.tool === 'eraser') { this.stamp(x, y, erase); this.draw(); }
      });
      this.cv.addEventListener('pointermove', (e) => {
        const [x, y] = this.px(e); this.status.textContent = `${x}, ${y}`; if (!down) return;
        if (this.tool === 'pencil' || this.tool === 'eraser') { this.lineTo(last[0], last[1], x, y, (px, py) => this.stamp(px, py, erase)); last = [x, y]; this.draw(); }
        else if (this.tool === 'move') { const dx = x - last[0], dy = y - last[1]; if (dx || dy) { const ctx = this.ctx2, copy = document.createElement('canvas'); copy.width = this.a.w; copy.height = this.a.h; copy.getContext('2d').drawImage(this.c, 0, 0); ctx.clearRect(0, 0, this.a.w, this.a.h); ctx.drawImage(copy, dx, dy); last = [x, y]; this.draw(); } }
        else if (['line', 'rect', 'ellipse'].includes(this.tool)) { this.shape = { x0: start[0], y0: start[1], x1: x, y1: y }; this.draw(); }
      });
      const end = () => { if (!down) return; down = false; if (this.shape) { this.drawShape(null, this.shape, false); this.shape = null; } this.afterEdit(); };
      this.cv.addEventListener('pointerup', end); this.cv.addEventListener('pointercancel', end);
    }
    afterEdit() { this.draw(); this.renderFrames(); this.commit(); }
    commit() { clearTimeout(this._t); this._t = setTimeout(() => this.flush(), 150); }
    flush() { this.a.frames = this.frames.map((c) => c.toDataURL('image/png')); this.changed(); }
    changed() { this.onChange && this.onChange(); }
    renderFrames() {
      this.frameList.textContent = ''; this.frames.forEach((c, i) => { const t = h('canvas', { class: 'se-thumb' + (i === this.cur ? ' on' : ''), width: this.a.w, height: this.a.h, title: 'Frame ' + i, onclick: () => { this.cur = i; this.renderFrames(); this.draw(); } }); const x = t.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0); t.style.height = '56px'; t.style.width = Math.max(24, Math.round((56 * this.a.w) / this.a.h)) + 'px'; this.frameList.append(h('div', { class: 'se-fr' }, t, h('span', { class: 'mini' }, String(i)))); });
    }
    addFrame(dup) { const c = document.createElement('canvas'); c.width = this.a.w; c.height = this.a.h; if (dup) c.getContext('2d').drawImage(this.c, 0, 0); this.frames.splice(this.cur + 1, 0, c); this.cur++; this.afterEdit(); }
    delFrame() { if (this.frames.length < 2) return VX.ui.toast('A sprite needs at least one frame'); this.frames.splice(this.cur, 1); this.cur = Math.max(0, this.cur - 1); this.afterEdit(); }
    moveFrame(d) { const j = this.cur + d; if (j < 0 || j >= this.frames.length) return; [this.frames[this.cur], this.frames[j]] = [this.frames[j], this.frames[this.cur]]; this.cur = j; this.afterEdit(); }
    renderAnims() {
      const a = this.a, box = this.animBox; box.textContent = ''; a.anims = a.anims || {};
      for (const [n, fr] of Object.entries(a.anims)) { box.append(h('div', { class: 'row' }, h('b', {}, n), h('input', { value: fr.join(','), title: 'Frame indices, comma separated', onchange: (e) => { a.anims[n] = e.target.value.split(/[ ,]+/).map(Number).filter((v) => Number.isFinite(v)); this.changed(); } }), h('button', { class: 'btn sm', onclick: () => { delete a.anims[n]; this.renderAnims(); this.changed(); } }, '✕'))); }
      box.append(h('button', { class: 'btn sm', onclick: async () => { const n = await VX.ui.ask('Animation name (e.g. walk, idle, jump)'); if (!n) return; a.anims[n] = this.frames.map((_, i) => i); this.renderAnims(); this.changed(); } }, '＋ Animation'), h('div', { class: 'mini' }, 'Use these names in the Animation block.'));
    }
    async importImage() {
      const f = (await VX.pickBrowserFile('image/*', false))[0]; if (!f) return; const url = await VX.readFileAsDataURL(f); const im = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = url; }); this.snapshot();
      const fit = Math.min(this.a.w / im.naturalWidth, this.a.h / im.naturalHeight, 1) ; const w = Math.round(im.naturalWidth * (fit < 1 ? fit : 1)), hh = Math.round(im.naturalHeight * (fit < 1 ? fit : 1)); const ctx = this.ctx2; ctx.clearRect(0, 0, this.a.w, this.a.h); ctx.imageSmoothingEnabled = !this.project.settings.pixelArt; ctx.drawImage(im, Math.floor((this.a.w - w) / 2), Math.floor((this.a.h - hh) / 2), w, hh); this.afterEdit();
    }
    async resize() {
      const v = await VX.ui.form({ title: 'Resize canvas', fields: [{ key: 'w', label: 'Width', type: 'number', value: this.a.w }, { key: 'h', label: 'Height', type: 'number', value: this.a.h }, { key: 'scale', label: 'Scale existing pixels', type: 'checkbox', value: false }], submit: 'Resize' }); if (!v) return;
      const w = VX.clamp(Math.round(v.w) || this.a.w, 1, 512), hh = VX.clamp(Math.round(v.h) || this.a.h, 1, 512);
      this.frames = this.frames.map((c) => { const n = document.createElement('canvas'); n.width = w; n.height = hh; const x = n.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false; if (v.scale) x.drawImage(c, 0, 0, w, hh); else x.drawImage(c, 0, 0); return n; });
      this.a.w = w; this.a.h = hh; this.history = []; this.zoom = Math.max(2, Math.min(24, Math.floor(480 / Math.max(w, hh)))); this.flush(); this.build();
    }
    exportPNG() { const u = this.c.toDataURL('image/png'); const a = document.createElement('a'); a.href = u; a.download = (this.a.name || 'sprite') + '.png'; a.click(); }
    dispose() { clearTimeout(this._t); if (this.loaded) this.flush(); clearInterval(this.pt); document.removeEventListener('keydown', this.keyH); }
  }
  VX.SpriteEditor = SpriteEditor;
})();
