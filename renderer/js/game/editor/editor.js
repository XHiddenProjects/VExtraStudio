/* Vextra game editor – the main editor for .vxgame files (scene, logic, assets, play, inspector). */
(function () {
  const { h, uid, clone } = VX;
  const GP = VX.GameProject;
  const jt = (o) => JSON.stringify(o);
  const noComments = (c) => String(c || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  class GameEditor {
    constructor(text, opts = {}) {
      this.opts = opts; this.path = opts.path || ''; let data = null;
      try { data = text && text.trim() ? JSON.parse(text) : null; } catch (e) { opts.notify && opts.notify('This game file could not be parsed – starting empty. ' + e.message, 'error'); }
      this.project = data ? GP.normalize(data) : GP.blank({ name: opts.title || 'My game', dim: '2d' });
      this.sceneIdx = VX.clamp(this.project.settings.startScene || 0, 0, this.project.scenes.length - 1); this.sel = []; this.view = 'scene'; this.logicMode = 'split'; this.curBeh = null; this.clip = null;
      this.undoStack = []; this.redoStack = []; this.last = jt(this.project); this.vp = {}; this.pendingLayoutFit = true; this.playing = false;
      this.build(); this.loadScene(); this.setView('scene');
      this.offs = [VX.on('gameBlocks', () => { this.graph && this.graph.drawPalette && this.graph.drawPalette(); }), VX.on('gameTypes', () => { this.inspect(); this.refreshPaletteHosts(); }), VX.on('theme', () => this.applyCodeLook())];
    }
    get scene() { return this.project.scenes[this.sceneIdx]; }
    get is3d() { return this.scene.dim === '3d'; }
    objById(id) { return this.scene.objects.find((o) => o.id === id); }
    selObjs() { return this.sel.map((id) => this.objById(id)).filter(Boolean); }
    serialize() { return JSON.stringify(this.project, null, 1); }
    setPath(p) { this.path = p; }

    /* ------------------------------------------------------------------ change tracking & undo */
    commit(structural) {
      const now = jt(this.project); if (now === this.last) return; this.undoStack.push(this.last); if (this.undoStack.length > 80) this.undoStack.shift(); this.redoStack = []; this.last = now;
      this.opts.onChange && this.opts.onChange(); if (structural) { this.renderHierarchy(); }
    }
    restore(json) {
      const sel = this.sel.slice(); this.project = JSON.parse(json); this.last = json; this.sceneIdx = Math.min(this.sceneIdx, this.project.scenes.length - 1); this.sel = sel.filter((id) => this.objById(id)); if (this.curBeh && !this.project.behaviors[this.curBeh]) this.curBeh = null;
      this.assets && (this.assets.ctx.project = this.project); this.loadScene(); this.renderSceneList(); this.renderBehList(); this.loadBehavior(); this.opts.onChange && this.opts.onChange();
    }
    undo() { if (this.view === 'logic' && this.graph && this.graph.undo.length && this.behMode() === 'graph') return this.graph.doUndo(); const j = this.undoStack.pop(); if (!j) return; this.redoStack.push(this.last); this.restore(j); }
    redo() { if (this.view === 'logic' && this.graph && this.graph.redo.length) return this.graph.doRedo(); const j = this.redoStack.pop(); if (!j) return; this.undoStack.push(this.last); this.restore(j); }
    applyCodeLook() { if (!this.code) return; const s = VX.app.settings, th = VX.theme.current(); if (th) this.code.setLook(th, { fontSize: s.fontSize, tabSize: s.tabSize, wrap: s.wrap, fontFamily: s.fontFamily || 'JetBrains Mono, Consolas, monospace' }); }

    /* ------------------------------------------------------------------ layout */
    build() {
      const P = this.project;
      this.leftEl = h('div', { class: 'gl-left' }); this.centerEl = h('div', { class: 'gl-center' }); this.rightEl = h('div', { class: 'gl-right' });
      this.root = h('div', { class: 'gl' }, this.leftEl, h('div', { class: 'resizer v', 'data-for': 'left' }), this.centerEl, h('div', { class: 'resizer v', 'data-for': 'right' }), this.rightEl);
      /* left: scenes + hierarchy */
      this.sceneListEl = h('div', { class: 'gl-scenes' }); this.hierEl = h('div', { class: 'gl-hier' });
      this.leftEl.append(h('div', { class: 'gl-sec' }, h('div', { class: 'gl-sec-h' }, h('span', {}, 'SCENES'), h('button', { class: 'btn sm ghost', title: 'Add scene', onclick: () => this.addScene() }, '＋')), this.sceneListEl),
        h('div', { class: 'gl-sec grow' }, h('div', { class: 'gl-sec-h' }, h('span', {}, 'OBJECTS'), h('span', { class: 'sp' }), h('button', { class: 'btn sm ghost', title: 'Duplicate (Ctrl+D)', onclick: () => this.duplicate() }, '⧉'), h('button', { class: 'btn sm ghost', title: 'Delete', onclick: () => this.deleteObjects(this.sel) }, '🗑')), this.hierEl));
      /* center: tabs + views */
      const tabs = [['scene', '🎬 Scene'], ['logic', '🧩 Logic'], ['assets', '🎨 Assets'], ['play', '▶ Play']];
      this.tabBtns = tabs.map(([k, l]) => h('button', { class: 'gl-tab', onclick: () => this.setView(k) }, l));
      this.panBtns = { left: h('button', { class: 'btn sm on', title: 'Show / hide the scenes + objects panel', onclick: () => this.togglePanel('left') }, '◧'), right: h('button', { class: 'btn sm on', title: 'Show / hide the inspector', onclick: () => this.togglePanel('right') }, '◨') };
      this.tabBar = h('div', { class: 'gl-tabs' }, this.tabBtns, h('span', { class: 'sp' }), this.viewTools = h('div', { class: 'gl-vtools' }), this.panBtns.left, this.panBtns.right);
      this._pan = {}; this._ro = new ResizeObserver(() => this.autoPanels()); this._ro.observe(this.root);
      this.sceneView = h('div', { class: 'gl-view v-scene' }); this.logicView = h('div', { class: 'gl-view v-logic' }); this.assetView = h('div', { class: 'gl-view v-assets' }); this.playView = h('div', { class: 'gl-view v-play' });
      this.assetsView = this.assetView; this.centerEl.append(this.tabBar, this.sceneView, this.logicView, this.assetView, this.playView);
      this.buildLogic(); this.buildAssets();
      this.root.addEventListener('keydown', (e) => this.onKey(e));
      for (const r of this.root.querySelectorAll('.resizer')) this.bindResizer(r);
      this.renderSceneList(); this.inspect();
    }
    bindResizer(r) {
      const which = r.dataset.for; r.addEventListener('mousedown', (e) => { e.preventDefault(); const el = which === 'left' ? this.leftEl : this.rightEl; const sx = e.clientX, w0 = el.getBoundingClientRect().width; const mv = (ev) => { const d = ev.clientX - sx; el.style.width = VX.clamp(w0 + (which === 'left' ? d : -d), 180, 520) + 'px'; this.fitSoon(); }; const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); });
    }
    fitSoon() { requestAnimationFrame(() => { const v = this.vpNow(); v && v.resize && v.resize(); }); }
    onKey(e) {
      if (e.vxHandled || e.defaultPrevented) return; if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.closest('.ace_editor')) return; const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === 'd') { e.preventDefault(); this.duplicate(); } else if (mod && k === 'c') this.copy(); else if (mod && k === 'v') this.paste(); else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); } else if (mod && k === 'y') { e.preventDefault(); this.redo(); }
      else if (k === 'delete' && this.view === 'scene') this.deleteObjects(this.sel);
    }
    vpNow() { return this.vp[this.is3d ? '3d' : '2d']; }
    onShow() { this.fitSoon(); this.applyCodeLook(); if (this.pendingLayoutFit) { this.pendingLayoutFit = false; setTimeout(() => { const v = this.vpNow(); v && v.fit && v.fit(); }, 60); } }
    dispose() { this.offs && this.offs.forEach((f) => f && f()); Object.values(this.vp).forEach((v) => v && v.dispose && v.dispose()); this.graph && this.graph.dispose && this.graph.dispose(); this.playPanel && this.playPanel.dispose(); this.docs && this.docs.dispose && this.docs.dispose(); }

    togglePanel(side) { const hid = this.root.classList.contains('hide-' + side); this._pan[side] = hid ? 'show' : 'hide'; this._panSticky = true; this.autoPanels(); }
    autoPanels() {
      const w = this.root.clientWidth; if (!w) return; const auto = { left: w < 760, right: w < 900 || (this.view === 'logic' && w < 1300) };
      for (const side of ['left', 'right']) { const hide = this._pan[side] ? this._pan[side] === 'hide' : auto[side]; this.root.classList.toggle('hide-' + side, hide); this.panBtns[side].classList.toggle('on', !hide); }
      clearTimeout(this._art); this._art = setTimeout(() => { for (const vp of [this.vp2d, this.vp3d]) if (vp && vp.resize) try { vp.resize(); } catch { /* ignore */ } window.dispatchEvent(new Event('resize')); }, 60);
    }
    setView(v) {
      this.view = v; if (this._pan) { for (const k of ['left', 'right']) if (!this._panSticky) delete this._pan[k]; this.autoPanels(); } ['scene', 'logic', 'assets', 'play'].forEach((k, i) => { this[k + 'View'].style.display = k === v ? '' : 'none'; this.tabBtns[i].classList.toggle('on', k === v); });
      if (v === 'play') { this.ensurePlay(); this.playPanel.start(); } else if (this.playPanel) this.playPanel.stop();
      if (v === 'logic') { this.renderBehList(); this.loadBehavior(); setTimeout(() => this.graph && this.graph.fit(), 30); }
      if (v === 'scene') { this.ensureViewport(); this.fitSoon(); }
      this.renderViewTools(); this.inspect(); this.opts.tab && VX.emit('toolbarRefresh');
    }
    refreshPaletteHosts() { if (VX.sidebar && VX.sidebar.current === 'create') VX.sidebar.refresh && VX.sidebar.refresh(); }

    /* ------------------------------------------------------------------ scenes */
    renderSceneList() {
      const box = this.sceneListEl; box.textContent = '';
      this.project.scenes.forEach((s, i) => {
        const row = h('div', { class: 'gl-row' + (i === this.sceneIdx ? ' on' : '') + (i === (this.project.settings.startScene || 0) ? ' start' : ''), onclick: () => { if (i !== this.sceneIdx) { this.sceneIdx = i; this.sel = []; this.loadScene(); this.renderSceneList(); this.renderBehList(); } } },
          h('span', { class: 'ico' }, s.dim === '3d' ? '🧊' : '🟦'), h('span', { class: 'nm' }, s.name), i === (this.project.settings.startScene || 0) ? h('span', { class: 'badge', title: 'Start scene' }, '★') : null);
        row.addEventListener('dblclick', async () => { const n = await VX.ui.ask('Scene name', s.name); if (n) { s.name = n; this.commit(); this.renderSceneList(); } });
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); VX.ui.menu(e.clientX, e.clientY, [{ label: 'Rename…', run: async () => { const n = await VX.ui.ask('Scene name', s.name); if (n) { s.name = n; this.commit(); this.renderSceneList(); } } }, { label: 'Set as start scene', run: () => { this.project.settings.startScene = i; this.commit(); this.renderSceneList(); } }, { label: 'Duplicate', run: () => { const c = clone(s); c.id = uid('s'); c.name = s.name + ' copy'; for (const o of c.objects) o.id = uid(); this.project.scenes.splice(i + 1, 0, c); this.commit(); this.renderSceneList(); } }, '-', { label: 'Delete', danger: true, disabled: this.project.scenes.length < 2, run: async () => { if (await VX.ui.confirm(`Delete scene “${s.name}” and its objects?`, 'Delete', { danger: true })) { this.project.scenes.splice(i, 1); this.sceneIdx = Math.min(this.sceneIdx, this.project.scenes.length - 1); this.sel = []; this.commit(); this.loadScene(); this.renderSceneList(); } } }]); });
        box.append(row);
      });
    }
    async addScene() {
      const v = await VX.ui.form({ title: 'New scene', fields: [{ key: 'name', label: 'Name', value: 'Level ' + (this.project.scenes.length + 1), required: true }, { key: 'dim', label: 'Type', type: 'select', value: this.scene.dim, options: [['2d', '2D scene'], ['3d', '3D scene']] }], submit: 'Add scene' }); if (!v) return;
      const sc = GP.blankScene(v.dim, v.name); if (v.dim === '3d') { sc.objects.push(Object.assign(GP.newObject('light', '3d', 4, 8, 4, []), { name: 'Sun' }), Object.assign(GP.newObject('camera', '3d', 8, 6, 10, []), { name: 'Camera' })); } this.project.scenes.push(sc); this.sceneIdx = this.project.scenes.length - 1; this.sel = []; this.commit(); this.loadScene(); this.renderSceneList();
    }
    loadScene() {
      const is3 = this.is3d; this.ensureViewport(); this.vpHost && [...this.vpHost.children].forEach((c) => { c.style.display = 'none'; });
      const v = this.vpNow(); if (v) { v.el.style.display = ''; v.setScene(this.scene, this.project); if (v.select) v.sel = this.sel.slice(); v.syncSel ? v.syncSel() : v.render && v.render(); }
      this.renderHierarchy(); this.inspect(); this.renderViewTools(); this.pendingLayoutFit = true; if (this.root.isConnected) this.onShow();
    }
    ensureViewport() {
      if (!this.vpHost) { this.vpHost = h('div', { class: 'gl-vps' }); this.sceneView.append(this.vpHost); }
      const key = this.is3d ? '3d' : '2d'; if (this.vp[key]) return;
      const ctx = {
        onSelect: (ids) => this.setSel(ids, true), onChange: () => this.commit(), onLiveChange: () => { this.liveUpdate(); }, onDropType: (d, x, y, z) => this.dropOnScene(d, x, y, z), onDelete: (ids) => this.deleteObjects(ids), onDuplicate: () => this.duplicate(), onCopy: () => this.copy(), onPaste: () => this.paste(), onUndo: () => this.undo(), onRedo: () => this.redo(), onView: () => {}, onTool: (t) => { this.vpTool = t; this.renderViewTools(); },
      };
      this.vp[key] = key === '3d' ? new VX.Viewport3D(ctx) : new VX.Viewport2D(ctx); this.vpHost.append(this.vp[key].el);
    }
    liveUpdate() { this.opts.onChange && this.opts.onChange(); this.updateInspectorValues(); }
    renderViewTools() {
      const t = this.viewTools; t.textContent = ''; const v = this.vpNow(), b = (l, fn, cls, title) => h('button', { class: 'btn sm ' + (cls || ''), title: title || '', onclick: fn }, l);
      if (this.view === 'scene' && v) {
        if (this.is3d) { for (const [k, l, ti] of [['translate', '✥ Move', 'W'], ['rotate', '⟳ Rotate', 'E'], ['scale', '⤢ Scale', 'R']]) t.append(b(l, () => { v.setTool(k); this.renderViewTools(); }, v.tool === k ? 'on' : '', ti)); t.append(b('Snap', () => { v.setSnap(!v.snap); this.renderViewTools(); }, v.snap ? 'on' : '', 'Snap to 0.5 / 15° / 0.25'), b('Grid', () => { v.setGrid(!v.showGrid); this.renderViewTools(); }, v.showGrid ? 'on' : ''), b('Focus', () => v.focusSelection(), '', 'F'), b('Reset view', () => v.fit())); }
        else t.append(b('Snap', () => { v.snap = !v.snap; this.renderViewTools(); }, v.snap ? 'on' : '', 'Snap to grid (hold Alt to bypass)'), b('Grid', () => { v.showGrid = !v.showGrid; v.render(); this.renderViewTools(); }, v.showGrid ? 'on' : ''), b('Colliders', () => { v.showColliders = !v.showColliders; v.render(); this.renderViewTools(); }, v.showColliders ? 'on' : ''), b('Camera', () => { v.showCam = !v.showCam; v.render(); this.renderViewTools(); }, v.showCam ? 'on' : ''), b('Fit', () => v.fit(), '', 'Fit the game area'), b('Focus', () => v.focusSelection(), '', 'F'));
      }
    }
    toolbar() {
      const b = (l, fn, cls, title) => h('button', { class: 'btn sm ' + (cls || ''), title: title || '', onclick: fn }, l);
      return [b([VX.icon('undo', 14), 'Undo'], () => this.undo(), '', 'Ctrl+Z'), b([VX.icon('redo', 14), 'Redo'], () => this.redo(), '', 'Ctrl+Shift+Z'), h('span', { class: 'sep' }),
        h('span', { class: 'tag' }, this.project.settings.title), h('span', { class: 'spacer' }),
        b('⚙ Game settings', () => this.gameSettings()), b('📖 Blocks docs', () => this.opts.openDocs && this.opts.openDocs('logic')), b('⬇ Export HTML', () => this.exportHTML()), b('🌐 Publish', () => VX.cloudUI && VX.cloudUI.publish(), '', 'Host it on a public URL'), b('📦 Store export', () => { const c = window.Forge && Forge.commands.get('store-export.package'); c ? c.run() : VX.ui.toast('Enable the “Store Export” plugin (Plugins panel) to package for Steam, Google Play and the App Store.', 'warn'); }, 'adv', 'Package for Steam / Google Play / App Store'), b([VX.icon('play', 13), 'Play'], () => this.play(), 'primary', 'Run the game')];
    }
    play() { this.setView('play'); }
    ensurePlay() {
      if (this.playPanel) return;
      this.playPanel = new VX.PlayPanel({ project: () => this.project, onLog: (l, t) => VX.bottom && VX.bottom.log && VX.bottom.log(l, t, 'game'), onStop: () => this.setView('scene') }); this.playView.append(this.playPanel.el);
    }
    async exportHTML() {
      try { const name = (this.project.settings.title || 'game').replace(/[^\w.-]+/g, '_') + '.html'; const html = await VX.gameExport.toHTML(this.project); if (window.native && native.saveAs) { const r = await native.saveAs(name, html); if (r) VX.ui.toast('Exported ' + (r.split ? r.split(/[\\/]/).pop() : name), 'ok'); } else VX.download(name, html, 'text/html'); } catch (e) { VX.ui.toast('Export failed: ' + e.message, 'error'); }
    }
    async gameSettings() {
      const s = this.project.settings; const v = await VX.ui.form({ title: 'Game settings', fields: [{ key: 'title', label: 'Title', value: s.title, required: true }, { key: 'width', label: 'Design width (2D)', type: 'number', value: s.width }, { key: 'height', label: 'Design height (2D)', type: 'number', value: s.height }, { key: 'bg', label: 'Background', type: 'color', value: s.bg }, { key: 'pixelArt', label: 'Pixel-art mode (crisp scaling)', type: 'checkbox', value: s.pixelArt }, { key: 'cloudUrl', label: 'Cloud server URL (leaderboards, cloud saves)', value: s.cloudUrl || '', placeholder: 'https://my-server.example.com', hint: 'Leave empty to use the server the game is published on.' }], submit: 'Save' }); if (!v) return;
      Object.assign(s, { title: v.title, width: VX.clamp(v.width | 0 || 960, 160, 4096), height: VX.clamp(v.height | 0 || 540, 90, 4096), bg: v.bg, pixelArt: v.pixelArt, cloudUrl: v.cloudUrl.trim() }); this.commit(); this.loadScene(); VX.emit('toolbarRefresh');
    }

    /* ------------------------------------------------------------------ selection / hierarchy */
    setSel(ids, fromVp) {
      this.sel = ids.filter((id) => this.objById(id)); const v = this.vpNow();
      if (!fromVp && v) { if (v.select) { v.sel = this.sel.slice(); v.syncSel ? v.syncSel() : v.render(); } }
      this.renderHierarchy(true); this.inspect(); if (this.view === 'logic') this.renderBehList();
    }
    renderHierarchy(keepScroll) {
      const box = this.hierEl, st = box.scrollTop; box.textContent = ''; const objs = this.scene.objects;
      if (!objs.length) box.append(h('div', { class: 'empty left', style: 'padding:10px;font-size:12px' }, 'Empty scene. Drag objects from the Create panel (left activity bar → Create) or press ＋ below.'));
      objs.forEach((o) => {
        const T = GP.type(o.type) || {}; const row = h('div', { class: 'gl-row obj' + (this.sel.includes(o.id) ? ' on' : '') + (o.hidden ? ' dim' : '') + (o.prefab ? ' prefab' : ''), title: T.label || o.type, 'data-id': o.id },
          h('span', { class: 'ico' }, T.icon || '◻'), h('span', { class: 'nm' }, o.name), o.behaviors && o.behaviors.length ? h('span', { class: 'badge', title: o.behaviors.length + ' behaviour(s)' }, '🧩' + o.behaviors.length) : null, o.prefab ? h('span', { class: 'badge', title: 'Prefab (spawned at runtime)' }, 'P') : null,
          h('button', { class: 'mini-btn', title: 'Hide in editor', onclick: (e) => { e.stopPropagation(); o.hidden = !o.hidden; this.refreshView(); this.renderHierarchy(true); } }, o.hidden ? '🚫' : '👁'), h('button', { class: 'mini-btn', title: 'Lock', onclick: (e) => { e.stopPropagation(); o.locked = !o.locked; this.commit(); this.renderHierarchy(true); } }, o.locked ? '🔒' : '🔓'));
        row.addEventListener('click', (e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) this.setSel(this.sel.includes(o.id) ? this.sel.filter((i) => i !== o.id) : [...this.sel, o.id]); else this.setSel([o.id]); });
        row.addEventListener('dblclick', async () => { const n = await VX.ui.ask('Object name', o.name); if (n) { o.name = n; this.commit(); this.renderHierarchy(true); this.inspect(); } });
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!this.sel.includes(o.id)) this.setSel([o.id]); VX.ui.menu(e.clientX, e.clientY, [{ label: 'Rename…', run: async () => { const n = await VX.ui.ask('Object name', o.name); if (n) { o.name = n; this.commit(); this.renderHierarchy(true); this.inspect(); } } }, { label: 'Duplicate', run: () => this.duplicate() }, { label: 'Copy', run: () => this.copy() }, { label: 'Paste', run: () => this.paste(), disabled: !this.clip }, { label: o.prefab ? 'Unmark prefab' : 'Mark as prefab', run: () => { o.prefab = !o.prefab; this.commit(true); this.inspect(); } }, { label: 'Focus', run: () => { const v = this.vpNow(); v && v.focusSelection(); } }, '-', { label: 'Delete', danger: true, run: () => this.deleteObjects(this.sel) }]); });
        VX.dnd.draggable(row, () => ({ kind: 'obj-ref', id: o.id }), o.name); box.append(row);
      });
      box.scrollTop = keepScroll ? st : 0;
    }
    refreshView() { const v = this.vpNow(); if (!v) return; if (this.is3d) { v.refreshAll(); } else v.refresh(); }
    /* ------------------------------------------------------------------ object operations */
    names() { return this.scene.objects.map((o) => o.name); }
    addObject(type, x, y, z, extra) {
      const dim = this.scene.dim; const v = this.vpNow(); const t = GP.type(type); if (!t) return null;
      if (x === undefined) { if (dim === '3d') { const tg = v && v.orbit ? v.orbit.target : { x: 0, z: 0 }; x = Math.round(tg.x * 2) / 2; y = t.type === 'light' ? 6 : (t.h || 1) / 2 + (t.type === 'plane' ? -(t.h || 1) / 2 : 0); z = Math.round(tg.z * 2) / 2; } else { const r = v ? v.canvas.getBoundingClientRect() : { left: 0, top: 0, width: 400, height: 300 }; const p = v ? v.toWorld(r.left + r.width / 2, r.top + r.height / 2) : { x: 200, y: 200 }; x = v ? v._snapv(p.x) : p.x; y = v ? v._snapv(p.y) : p.y; } }
      else if (dim === '3d' && t.type !== 'plane') y = (extra && extra.y) ?? Math.max(y, (t.h || 1) / 2);
      const o = GP.newObject(type, dim, x, y, z || 0, this.names()); if (extra) Object.assign(o, extra); this.scene.objects.push(o); this.commit(true); this.refreshView(); this.setSel([o.id]); return o;
    }
    dropOnScene(d, x, y, z) {
      if (d.kind === 'obj') { if (GP.type(d.type) && GP.type(d.type).dim === '3d' && !this.is3d) return VX.ui.toast('That object is 3D – add a 3D scene (＋ next to Scenes).', 'warn'); if (this.is3d && GP.type(d.type) && GP.type(d.type).dim === '2d' && !['sprite', 'text'].includes(d.type)) VX.ui.toast('Note: 2D shapes in a 3D scene render as flat planes.', 'warn'); this.addObject(d.type, this.is3d ? x : Math.round(x / 8) * 8, this.is3d ? y : Math.round(y / 8) * 8, z); }
      else if (d.kind === 'asset-sprite') { const a = this.project.assets.sprites[d.id]; if (!a) return; if (this.is3d) { this.addObject('sprite', x, Math.max(y, 0.5), z, { props: { sprite: a.id, emoji: '' }, w: a.w / 32, h: a.h / 32, d: 0.05 }); } else this.addObject('sprite', Math.round(x), Math.round(y), 0, { name: a.name, w: a.w, h: a.h, color: '#ffffff', props: { sprite: a.id, emoji: '' } }); }
      else if (d.kind === 'asset-model') { const a = this.project.assets.models[d.id]; if (!a) return; if (!this.is3d) return VX.ui.toast('3D models need a 3D scene.', 'warn'); this.addObject('model', x, 0.5, z, { name: a.name, props: { model: a.id }, color: '#ffffff', y: 0.5 }); }
      else if (d.kind === 'prefab-obj') { const src = this.objById(d.id); if (src) { const c = clone(src); c.id = uid(); c.prefab = false; c.x = x; c.y = y; if (this.is3d) c.z = z; this.scene.objects.push(c); this.commit(true); this.refreshView(); this.setSel([c.id]); } }
    }
    deleteObjects(ids) { if (!ids || !ids.length) return; this.scene.objects = this.scene.objects.filter((o) => !ids.includes(o.id)); this.sel = this.sel.filter((i) => !ids.includes(i)); this.commit(true); this.refreshView(); this.setSel([]); }
    duplicate() { const objs = this.selObjs(); if (!objs.length) return; const out = []; for (const o of objs) { const c = clone(o); c.id = uid(); c.name = this.uniqueName(o.name); if (this.is3d) { c.x += 1; c.z += 1; } else { c.x += 24; c.y += 24; } this.scene.objects.push(c); out.push(c.id); } this.commit(true); this.refreshView(); this.setSel(out); }
    uniqueName(base) { const names = this.names(); const b = base.replace(/ \d+$/, ''); let n = 2, nm = b + ' ' + n; while (names.includes(nm)) nm = b + ' ' + ++n; return nm; }
    copy() { const o = this.selObjs(); if (o.length) { this.clip = clone(o); VX.ui.toast('Copied ' + o.length + ' object' + (o.length > 1 ? 's' : '')); } }
    paste() { if (!this.clip) return; const out = []; for (const o of this.clip) { const c = clone(o); c.id = uid(); c.name = this.uniqueName(o.name); if (this.is3d) { c.x += 1; c.z += 1; } else { c.x += 24; c.y += 24; } this.scene.objects.push(c); out.push(c.id); } this.commit(true); this.refreshView(); this.setSel(out); }

    /** Create-panel palette (hosted in the sidebar). */
    renderPalette(container) {
      const dim = this.scene.dim, types = GP.types().filter((t) => t.dim === dim || t.dim === 'both' || (dim === '3d' && ['sprite', 'text'].includes(t.type))); const cats = new Map(); for (const t of types) { if (!cats.has(t.category)) cats.set(t.category, []); cats.get(t.category).push(t); }
      container.append(h('div', { class: 'pal-note' }, dim === '3d' ? '3D scene – drag onto the viewport (placed on the ground) or click to add.' : '2D scene – drag onto the canvas or click to add.'));
      for (const [cat, list] of cats) {
        container.append(h('div', { class: 'pal-head' }, cat));
        const grid = h('div', { class: 'pal-grid' }); for (const t of list) { const it = h('div', { class: 'pal-item', title: t.label + (t.plugin ? ' (plugin: ' + t.plugin + ')' : '') }, h('div', { class: 'pi' }, t.icon), h('div', { class: 'pl' }, t.label)); it.addEventListener('click', () => this.addObject(t.type)); VX.dnd.draggable(it, () => ({ kind: 'obj', type: t.type }), t.label); grid.append(it); } container.append(grid);
      }
      const A = this.project.assets; const sp = Object.values(A.sprites), md = Object.values(A.models);
      if (sp.length || (dim === '3d' && md.length)) { container.append(h('div', { class: 'pal-head' }, 'Your assets')); const grid = h('div', { class: 'pal-grid' }); for (const a of sp) { const it = h('div', { class: 'pal-item', title: a.name }, h('img', { class: 'pi-img', src: a.frames[0], draggable: 'false' }), h('div', { class: 'pl' }, a.name)); it.addEventListener('click', () => this.dropOnScene({ kind: 'asset-sprite', id: a.id }, ...(dim === '3d' ? [0, 1, 0] : [this.project.settings.width / 2, this.project.settings.height / 2]))); VX.dnd.draggable(it, () => ({ kind: 'asset-sprite', id: a.id }), a.name); grid.append(it); } if (dim === '3d') for (const a of md) { const it = h('div', { class: 'pal-item', title: a.name }, h('div', { class: 'pi' }, '🧊'), h('div', { class: 'pl' }, a.name)); it.addEventListener('click', () => this.dropOnScene({ kind: 'asset-model', id: a.id }, 0, 0.5, 0)); VX.dnd.draggable(it, () => ({ kind: 'asset-model', id: a.id }), a.name); grid.append(it); } container.append(grid); }
      const pf = this.scene.objects.filter((o) => o.prefab); if (pf.length) { container.append(h('div', { class: 'pal-head' }, 'Prefabs in this scene')); const grid = h('div', { class: 'pal-grid' }); for (const o of pf) { const it = h('div', { class: 'pal-item', title: o.name }, h('div', { class: 'pi' }, (GP.type(o.type) || {}).icon || '◻'), h('div', { class: 'pl' }, o.name)); VX.dnd.draggable(it, () => ({ kind: 'prefab-obj', id: o.id }), o.name); grid.append(it); } container.append(grid); }
    }

    /* ------------------------------------------------------------------ inspector */
    touch(o, transform) { const v = this.vpNow(); if (!v) return; if (this.is3d) { transform ? v.syncPositions() : (o ? v.refreshObject(o.id) : v.refreshAll()); if (transform) v.syncSel && v.syncSel(); } else v.refresh(); this.opts.onChange && this.opts.onChange(); }
    numIn(o, key, { step = 1, min, max, tr = false, scope = 'obj', target, label } = {}) {
      const t = target || o; const inp = h('input', { type: 'number', step, class: 'n', value: Number.isFinite(+t[key]) ? +(+t[key]).toFixed(3) : 0 });
      if (min !== undefined) inp.min = min; if (max !== undefined) inp.max = max;
      inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (Number.isNaN(v)) return; t[key] = v; if (scope === 'ph') this.opts.onChange && this.opts.onChange(); else this.touch(scope === 'obj' ? o : null, tr); });
      inp.addEventListener('change', () => { this.commit(); }); if (scope === 'obj' && !target) (this.inspIn[key] ||= []).push(inp); return inp;
    }
    updateInspectorValues() { const o = this.selObjs()[0]; if (!o || !this.inspIn) return; for (const [k, list] of Object.entries(this.inspIn)) for (const i of list) if (document.activeElement !== i && o[k] !== undefined) i.value = +(+o[k]).toFixed(3); }
    row(label, ...ctrls) { return h('div', { class: 'ins-row' }, h('label', {}, label), h('div', { class: 'ctl' }, ctrls)); }
    sec(title, ...kids) { return h('div', { class: 'ins-sec' + (/^(Data|Environment|Game camera)$/.test(title) ? ' adv' : '') }, h('div', { class: 'ins-h' }, title), ...kids); }
    txtIn(t, key, { ph, onSet } = {}) { const i = h('input', { value: t[key] ?? '', placeholder: ph || '' }); i.addEventListener('input', () => { t[key] = i.value; onSet && onSet(); }); i.addEventListener('change', () => this.commit(true)); return i; }
    colorIn(o, key, { target, scope } = {}) { const t = target || o; const i = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(t[key]) ? t[key] : '#ffffff' }); i.addEventListener('input', () => { t[key] = i.value; this.touch(scope === 'scene' ? null : o); }); i.addEventListener('change', () => this.commit()); return i; }
    boolIn(t, key, after) { const c = h('input', { type: 'checkbox' }); c.checked = !!t[key]; c.addEventListener('change', () => { t[key] = c.checked; this.commit(); after && after(); }); return c; }
    selIn(t, key, opts, after) { const s = h('select', {}, opts.map((x) => { const [v, l] = Array.isArray(x) ? x : [x, x]; return h('option', { value: v }, l); })); s.value = t[key] ?? opts[0]; s.addEventListener('change', () => { t[key] = s.value; this.commit(); after && after(); }); return s; }

    inspect() {
      const box = this.rightEl; box.textContent = ''; this.inspIn = {}; const objs = this.selObjs();
      if (this.view === 'logic') return this.inspectBehavior(box);
      if (this.view === 'assets') { box.append(this.sec('Assets', h('div', { class: 'ins-note' }, 'Everything you create here is stored inside the game file. Sprites are pixel art you draw, sounds are synthesized (or imported), models are voxel / shape groups / OBJ meshes.'), h('div', { class: 'ins-note' }, 'Drag a sprite or model onto the Scene tab to place it. Use asset names in blocks (e.g. the Sound block).'))); return; }
      if (this.view === 'play') { box.append(this.sec('Playing', h('div', { class: 'ins-note' }, 'This is the exported game running in a sandbox. Use the toolbar to simulate phones and tablets, shake and tilt. Game logs appear in the Console.'), h('button', { class: 'btn block', onclick: () => VX.bottom.show('console') }, 'Open Console'))); return; }
      if (!objs.length) return this.inspectScene(box);
      if (objs.length > 1) { box.append(this.sec(objs.length + ' objects selected', h('div', { class: 'row wrap' }, h('button', { class: 'btn sm', onclick: () => this.duplicate() }, 'Duplicate'), h('button', { class: 'btn sm danger', onclick: () => this.deleteObjects(this.sel) }, 'Delete')), this.row('Tag all', (() => { const i = h('input', { placeholder: 'add tag + Enter' }); i.addEventListener('keydown', (e) => { if (e.key === 'Enter' && i.value.trim()) { for (const o of objs) { o.tags = o.tags || []; if (!o.tags.includes(i.value.trim())) o.tags.push(i.value.trim()); } i.value = ''; this.commit(); } }); return i; })()))); return; }
      const o = objs[0], T = GP.type(o.type) || { label: o.type, schema: [] }, is3 = this.is3d;
      box.append(h('div', { class: 'ins-title' }, h('span', { class: 'ico' }, T.icon || '◻'), this.txtIn(o, 'name', { onSet: () => { const n = this.hierEl.querySelector(`[data-id="${o.id}"] .nm`); if (n) n.textContent = o.name; } }), h('span', { class: 'tag' }, T.label || o.type)));
      /* transform */
      const nums = (keys, labels, extra = {}) => keys.map((k, i) => h('div', { class: 'nf' }, h('span', {}, labels[i]), this.numIn(o, k, Object.assign({ tr: true }, extra))));
      const tr = [this.row('Position', ...(is3 ? nums(['x', 'y', 'z'], ['X', 'Y', 'Z'], { step: 0.25 }) : nums(['x', 'y'], ['X', 'Y'])))];
      if (is3) tr.push(this.row('Rotation', ...nums(['rx', 'ry', 'rz'], ['X', 'Y', 'Z'], { step: 5 })), this.row('Size', ...nums(['w', 'h', 'd'], ['W', 'H', 'D'], { step: 0.25, min: 0.01 }))); else tr.push(this.row('Rotation', ...nums(['rot'], ['°'], { step: 5 })), this.row('Size', ...nums(['w', 'h'], ['W', 'H'], { min: 1 })));
      box.append(this.sec('Transform', ...tr));
      /* appearance */
      const ap = [this.row('Colour', this.colorIn(o, 'color')), this.row('Opacity', (() => { const r = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: o.alpha ?? 1 }); r.addEventListener('input', () => { o.alpha = +r.value; this.touch(o); }); r.addEventListener('change', () => this.commit()); return r; })()), this.row('Visible', this.boolIn(o, 'visible', () => this.touch(o))), this.row('Enabled', this.boolIn(o, 'enabled'))];
      if (!is3) ap.push(this.row('Draw order', this.numIn(o, 'order', { step: 1 })), this.row('Flip', h('label', { class: 'chk' }, this.boolIn(o, 'flipX', () => this.touch(o)), ' X'), h('label', { class: 'chk' }, this.boolIn(o, 'flipY', () => this.touch(o)), ' Y'))); else { o.material = o.material || {}; ap.push(this.row('Metalness', this.numIn(null, 'metalness', { target: o.material, step: 0.1, min: 0, max: 1, scope: 'mat' })), this.row('Roughness', this.numIn(null, 'roughness', { target: o.material, step: 0.1, min: 0, max: 1, scope: 'mat' })), this.row('Emissive', this.colorIn(null, 'emissive', { target: o.material })), this.row('Wireframe', this.boolIn(o.material, 'wireframe', () => this.touch(o))), this.row('Cast shadow', (() => { const c = h('input', { type: 'checkbox' }); c.checked = o.castShadow !== false; c.addEventListener('change', () => { o.castShadow = c.checked; this.commit(); this.touch(o); }); return c; })())); if (o.castShadow === undefined) { /* default on */ } }
      const shaders = is3 ? VXRT.SHADERS_3D : VXRT.SHADERS_2D; o.shader = o.shader || null; ap.push(this.row('Shader', (() => { const s = h('select', {}, shaders.map((n) => h('option', { value: n }, n))); s.value = (o.shader && o.shader.name) || 'none'; s.addEventListener('change', () => { o.shader = s.value === 'none' ? null : Object.assign({}, o.shader || {}, { name: s.value }); this.touch(o); this.commit(); }); return s; })()));
      box.append(this.sec('Appearance', ...ap));
      /* type-specific props */
      if (T.schema && T.schema.length) box.append(this.sec(T.label + ' settings', ...T.schema.map((f) => this.propField(o, f))));
      /* physics */
      if (!['light', 'camera', 'empty'].includes(o.type)) { o.physics = o.physics || { body: 'none', shape: 'box' }; const ph = o.physics; const body = this.selIn(ph, 'body', [['none', 'None (no physics)'], ['static', 'Static (walls, ground)'], ['dynamic', 'Dynamic (falls, collides)'], ['kinematic', 'Kinematic (moved by blocks)']], () => this.inspect());
        const rows = [this.row('Body', body)]; if (ph.body !== 'none') { rows.push(this.row('Shape', this.selIn(ph, 'shape', is3 ? ['box', 'sphere', 'capsule'] : ['box', 'circle'])), this.row('Sensor', this.boolIn(ph, 'sensor')), this.row('Bounce', this.numIn(null, 'bounce', { target: ph, step: 0.1, min: 0, max: 1.5, scope: 'ph' })), this.row('Friction', this.numIn(null, 'friction', { target: ph, step: 0.05, min: 0, max: 2, scope: 'ph' }))); if (ph.body === 'dynamic') rows.push(this.row('Mass', this.numIn(null, 'mass', { target: ph, step: 0.5, min: 0.01, scope: 'ph' })), this.row('Gravity ×', this.numIn(null, 'gravityScale', { target: ph, step: 0.1, scope: 'ph' })), this.row('Lock rotation', this.boolIn(ph, 'fixedRotation'))); }
        box.append(this.sec('Physics', ...rows, ph.body !== 'none' ? h('div', { class: 'ins-note' }, 'Sensors detect overlaps (Collision block) without bouncing off.') : null)); }
      /* behaviours */
      box.append(this.behaviorSection(o));
      /* tags / variables / prefab */
      const tags = h('input', { value: (o.tags || []).join(', '), placeholder: 'player, enemy …' }); tags.addEventListener('change', () => { o.tags = tags.value.split(/[ ,]+/).filter(Boolean); this.commit(); });
      const vars = o.vars = o.vars || {}; const vbox = h('div', {}); const drawVars = () => { vbox.textContent = ''; for (const [k, v] of Object.entries(vars)) { const val = h('input', { value: v }); val.addEventListener('change', () => { const n = Number(val.value); vars[k] = val.value !== '' && !Number.isNaN(n) ? n : val.value; this.commit(); }); vbox.append(h('div', { class: 'ins-row' }, h('label', {}, k), h('div', { class: 'ctl' }, val, h('button', { class: 'btn sm ghost', onclick: () => { delete vars[k]; drawVars(); this.commit(); } }, '✕')))); } vbox.append(h('button', { class: 'btn sm', onclick: async () => { const n = await VX.ui.ask('Variable name'); if (n) { vars[n.replace(/\W+/g, '_')] = 0; drawVars(); this.commit(); } } }, '＋ Variable')); }; drawVars();
      box.append(this.sec('Data', this.row('Tags', tags), this.row('Prefab', this.boolIn(o, 'prefab', () => { this.commit(true); this.refreshPaletteHosts(); })), h('div', { class: 'ins-note' }, 'Prefab objects are hidden at start and used as templates for the Spawn block.'), h('div', { class: 'ins-sub' }, 'Object variables'), vbox));
    }
    propField(o, f) {
      const p = o.props = o.props || {}; const A = this.project.assets; const set = (v) => { p[f.key] = v; this.touch(o); }; let ctl;
      if (f.type === 'number') { ctl = h('input', { type: 'number', class: 'n', step: f.step || 1, value: p[f.key] ?? 0 }); ctl.addEventListener('input', () => { set(parseFloat(ctl.value) || 0); }); ctl.addEventListener('change', () => this.commit()); }
      else if (f.type === 'color') { ctl = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(p[f.key]) ? p[f.key] : '#ffffff' }); ctl.addEventListener('input', () => set(ctl.value)); ctl.addEventListener('change', () => this.commit()); }
      else if (f.type === 'bool') { ctl = h('input', { type: 'checkbox' }); ctl.checked = !!p[f.key]; ctl.addEventListener('change', () => { set(ctl.checked); this.commit(); }); }
      else if (f.type === 'select') { ctl = h('select', {}, (f.options || []).map((x) => { const [v, l] = Array.isArray(x) ? x : [x, x]; return h('option', { value: v }, l); })); ctl.value = p[f.key] ?? f.options[0]; ctl.addEventListener('change', () => { set(ctl.value); this.commit(); }); }
      else if (f.type === 'multiline') { ctl = h('textarea', { rows: 3 }, p[f.key] ?? ''); ctl.addEventListener('input', () => set(ctl.value)); ctl.addEventListener('change', () => this.commit()); }
      else if (f.type === 'sprite' || f.type === 'model') { const list = Object.values(f.type === 'sprite' ? A.sprites : A.models); ctl = h('select', {}, h('option', { value: '' }, '— none —'), list.map((a) => h('option', { value: a.id }, a.name))); ctl.value = p[f.key] || ''; ctl.addEventListener('change', () => { set(ctl.value); if (f.type === 'sprite' && ctl.value && A.sprites[ctl.value] && !this.is3d && (!o.w || o.w < 2)) { o.w = A.sprites[ctl.value].w; o.h = A.sprites[ctl.value].h; } this.commit(); this.inspect(); }); }
      else { ctl = h('input', { value: p[f.key] ?? '' }); ctl.addEventListener('input', () => set(ctl.value)); ctl.addEventListener('change', () => this.commit()); }
      return this.row(f.label, ctl);
    }
    behaviorSection(holder, isScene) {
      const B = this.project.behaviors; holder.behaviors = holder.behaviors || []; const list = h('div', { class: 'beh-list' });
      for (const id of holder.behaviors) { const b = B[id]; list.append(h('div', { class: 'beh-chip' + (b ? '' : ' missing') }, h('span', { class: 'nm', onclick: () => b && this.openBehavior(id), title: 'Open in Logic view' }, '🧩 ' + (b ? b.name : id + ' (missing)')), h('button', { class: 'mini-btn', title: 'Detach', onclick: () => { holder.behaviors = holder.behaviors.filter((x) => x !== id); this.commit(true); this.inspect(); } }, '✕'))); }
      const others = Object.values(B).filter((b) => !holder.behaviors.includes(b.id)); const sel = h('select', {}, h('option', { value: '' }, 'Attach existing…'), others.map((b) => h('option', { value: b.id }, b.name))); sel.addEventListener('change', () => { if (sel.value) { holder.behaviors.push(sel.value); this.commit(true); this.inspect(); } });
      return this.sec(isScene ? 'Scene behaviours' : 'Behaviours (logic)', list, h('div', { class: 'row' }, sel, h('button', { class: 'btn sm primary', onclick: async () => { const n = await VX.ui.ask('Behaviour name', (holder.name || 'Scene') + ' logic'); if (!n) return; const b = GP.newBehavior(n); B[b.id] = b; holder.behaviors.push(b.id); this.commit(true); this.openBehavior(b.id); } }, '＋ New')), holder.behaviors.length ? null : h('div', { class: 'ins-note' }, 'Behaviours are block graphs (or code) that give this ' + (isScene ? 'scene' : 'object') + ' its game logic.'));
    }
    inspectScene(box) {
      const s = this.scene, is3 = this.is3d; box.append(h('div', { class: 'ins-title' }, h('span', { class: 'ico' }, is3 ? '🧊' : '🟦'), this.txtIn(s, 'name', { onSet: () => this.renderSceneList() }), h('span', { class: 'tag' }, is3 ? '3D scene' : '2D scene')));
      const rows = [this.row('Background', this.colorIn(null, 'bg', { target: s, scope: 'scene' }))];
      if (!is3) { s.camera2d = s.camera2d || { x: 480, y: 270, zoom: 1 }; s.gravity = s.gravity || { x: 0, y: 980, z: 0 }; rows.push(this.row('Camera', ...['x', 'y'].map((k) => h('div', { class: 'nf' }, h('span', {}, k.toUpperCase()), this.numIn(null, k, { target: s.camera2d, scope: 'scene' }))), h('div', { class: 'nf' }, h('span', {}, 'Zoom'), this.numIn(null, 'zoom', { target: s.camera2d, step: 0.1, min: 0.1, scope: 'scene' }))), this.row('View size', ...[['viewW', 'W'], ['viewH', 'H']].map(([k, l]) => h('div', { class: 'nf' }, h('span', {}, l), this.numIn(null, k, { target: s.camera2d, step: 10, min: 0, scope: 'scene' }))), h('div', { class: 'hint' }, '0 = use zoom')), this.row('Gravity Y', this.numIn(null, 'y', { target: s.gravity, step: 20, scope: 'scene' }))); }
      box.append(this.sec('Scene', ...rows));
      if (is3) { s.env = s.env || {}; const e = s.env; s.camera3d = s.camera3d || { mode: 'fixed', fov: 60, pos: { x: 8, y: 6, z: 10 }, target: { x: 0, y: 1, z: 0 } }; const c = s.camera3d; s.gravity = s.gravity || { x: 0, y: -25, z: 0 };
        box.append(this.sec('Environment', this.row('Sky colour', this.colorIn(null, 'sky', { target: e })), this.row('Ambient', this.colorIn(null, 'ambientColor', { target: e }), this.numIn(null, 'ambientIntensity', { target: e, step: 0.05, min: 0, scope: 'scene' })), this.row('Fog', this.boolIn(e, 'fog', () => this.refreshView()), this.colorIn(null, 'fogColor', { target: e })), this.row('Fog range', this.numIn(null, 'fogNear', { target: e, scope: 'scene' }), this.numIn(null, 'fogFar', { target: e, scope: 'scene' })), this.row('Gravity Y', this.numIn(null, 'y', { target: s.gravity, step: 1, scope: 'scene' }))),
          this.sec('Game camera', this.row('Mode', this.selIn(c, 'mode', [['fixed', 'Fixed'], ['follow', 'Follow object'], ['orbit', 'Orbit object'], ['fps', 'First person']], () => this.inspect())), this.row('FOV', this.numIn(null, 'fov', { target: c, min: 20, max: 120, scope: 'scene' })), c.mode === 'fixed' ? this.row('Position', ...['x', 'y', 'z'].map((k) => this.numIn(null, k, { target: (c.pos = c.pos || { x: 8, y: 6, z: 10 }), step: 0.5, scope: 'scene' }))) : null, c.mode === 'fixed' ? this.row('Look at', ...['x', 'y', 'z'].map((k) => this.numIn(null, k, { target: (c.target = c.target || { x: 0, y: 1, z: 0 }), step: 0.5, scope: 'scene' }))) : null, c.mode !== 'fixed' ? this.row('Follow', this.txtIn(c, 'follow', { ph: 'object name or tag:player' })) : null, c.mode === 'follow' || c.mode === 'orbit' ? this.row('Distance', this.numIn(null, 'distance', { target: c, step: 0.5, scope: 'scene' })) : null, c.mode === 'follow' ? this.row('Height', this.numIn(null, 'height', { target: c, step: 0.5, scope: 'scene' })) : null, h('div', { class: 'ins-note' }, 'Or use the Camera block in logic to control it at run time.'))); }
      box.append(this.behaviorSection(s, true));
      box.append(this.sec('Game', h('div', { class: 'ins-note' }, `“${this.project.settings.title}” – ${this.project.scenes.length} scene(s), ${Object.keys(this.project.behaviors).length} behaviour(s), ${Object.values(this.project.assets).reduce((n, a) => n + Object.keys(a).length, 0)} asset(s).`), h('button', { class: 'btn block', onclick: () => this.gameSettings() }, '⚙ Game settings…')));
    }

    /* ------------------------------------------------------------------ logic (behaviours: blocks + code) */
    buildLogic() {
      this.begList = h('div', { class: 'lg-list' }); this.begToolbar = h('div', { class: 'lg-bar' }); this.graphHost = h('div', { class: 'lg-graph' }); this.codeHost = h('div', { class: 'lg-code' }); this.codeStatus = h('div', { class: 'lg-status' }); this.codeWrap = h('div', { class: 'lg-codewrap' }, this.codeHost, this.codeStatus);
      this.lgBody = h('div', { class: 'lg-body' }, this.graphHost, this.codeWrap);
      const left = h('div', { class: 'lg-left' }, h('div', { class: 'gl-sec-h' }, h('span', {}, 'BEHAVIOURS'), h('button', { class: 'btn sm ghost', title: 'New behaviour', onclick: () => this.newBehavior() }, '＋')), this.begList);
      this.logicView.append(left, h('div', { class: 'lg-main' }, this.begToolbar, this.lgBody));
      this.graph = new VX.GraphEditor({ onChange: (root) => { const b = this.curB(); if (b && b.mode === 'graph') { b.graph = root; this.commit(); this.regenCode(); } }, assets: () => this.project.assets, objectNames: () => this.project.scenes.flatMap((s) => s.objects.map((o) => o.name)), tags: () => [...new Set(this.project.scenes.flatMap((s) => s.objects.flatMap((o) => o.tags || [])))], onSelectNode: (id) => this.onNodeSelected(id) });
      this.graphHost.append(this.graph.el);
      this.code = window.CodeEditor.create(this.codeHost, { onChange: () => this.onCodeEdited(), onCursor: (l) => this.onCodeCursor(l) });
    }
    curB() { return this.curBeh ? this.project.behaviors[this.curBeh] : null; }
    behMode() { const b = this.curB(); return b ? b.mode : 'graph'; }
    usersOf(id) { const out = []; for (const s of this.project.scenes) { if ((s.behaviors || []).includes(id)) out.push({ scene: s, obj: null }); for (const o of s.objects) if ((o.behaviors || []).includes(id)) out.push({ scene: s, obj: o }); } return out; }
    renderBehList() {
      const box = this.begList; box.textContent = ''; const B = Object.values(this.project.behaviors); const mine = new Set([...(this.selObjs().flatMap((o) => o.behaviors || [])), ...(this.sel.length ? [] : this.scene.behaviors || [])]);
      if (!B.length) box.append(h('div', { class: 'empty left', style: 'padding:10px;font-size:12px' }, 'No behaviours yet. Press ＋ to make one, then drag blocks together to build game logic.'));
      for (const b of B) { const n = this.usersOf(b.id).length; const row = h('div', { class: 'gl-row' + (b.id === this.curBeh ? ' on' : '') + (mine.has(b.id) ? ' mine' : ''), onclick: () => this.openBehavior(b.id) }, h('span', { class: 'ico' }, b.mode === 'code' ? '﹛﹜' : '🧩'), h('span', { class: 'nm' }, b.name), h('span', { class: 'badge', title: 'Used by ' + n }, n ? '×' + n : '—'));
        row.addEventListener('contextmenu', (e) => { e.preventDefault(); VX.ui.menu(e.clientX, e.clientY, [{ label: 'Rename…', run: () => this.renameBehavior(b) }, { label: 'Duplicate', run: () => { const c = clone(b); c.id = uid('b'); c.name = b.name + ' copy'; this.project.behaviors[c.id] = c; this.commit(); this.openBehavior(c.id); } }, { label: 'Attach to selection', run: () => this.attachCurrent(b.id) }, '-', { label: 'Delete', danger: true, run: () => this.deleteBehavior(b) }]); }); box.append(row); }
    }
    async newBehavior() { const n = await VX.ui.ask('Behaviour name', 'Behaviour ' + (Object.keys(this.project.behaviors).length + 1)); if (!n) return; const b = GP.newBehavior(n); this.project.behaviors[b.id] = b; this.commit(true); this.curBeh = b.id; this.renderBehList(); this.loadBehavior(); }
    async renameBehavior(b) { const n = await VX.ui.ask('Behaviour name', b.name); if (n) { b.name = n; this.commit(); this.renderBehList(); this.loadBehavior(); } }
    async deleteBehavior(b) { const n = this.usersOf(b.id).length; if (!(await VX.ui.confirm(`Delete “${b.name}”?` + (n ? ` It is attached to ${n} object(s)/scene(s); they will lose it.` : ''), 'Delete', { danger: true }))) return; delete this.project.behaviors[b.id]; for (const s of this.project.scenes) { s.behaviors = (s.behaviors || []).filter((x) => x !== b.id); for (const o of s.objects) o.behaviors = (o.behaviors || []).filter((x) => x !== b.id); } if (this.curBeh === b.id) this.curBeh = null; this.commit(true); this.renderBehList(); this.loadBehavior(); }
    attachCurrent(id) { const objs = this.selObjs(); const targets = objs.length ? objs : [this.scene]; for (const t of targets) { t.behaviors = t.behaviors || []; if (!t.behaviors.includes(id)) t.behaviors.push(id); } this.commit(true); this.renderBehList(); this.inspect(); VX.ui.toast('Attached to ' + (objs.length ? objs.map((o) => o.name).join(', ') : 'the scene'), 'ok'); }
    openBehavior(id) { this.curBeh = id; if (this.view !== 'logic') this.setView('logic'); else { this.renderBehList(); this.loadBehavior(); } }
    autoLayout(g) {
      if (!g.nodes.length) return; const flat = g.nodes.every((n) => !n.x && !n.y); for (const n of g.nodes) if (n.graph) this.autoLayout(n.graph); if (!flat) return;
      const inc = new Map(g.nodes.map((n) => [n.id, 0])); for (const w of g.wires) inc.set(w.to, (inc.get(w.to) || 0) + 1); const depth = new Map(); let q = g.nodes.filter((n) => !inc.get(n.id)).map((n) => n.id); q.forEach((id) => depth.set(id, 0));
      for (let i = 0; i < q.length; i++) { for (const w of g.wires) if (w.from === q[i] && !(depth.get(w.to) >= depth.get(q[i]) + 1)) { depth.set(w.to, depth.get(q[i]) + 1); if (depth.get(w.to) < 30) q.push(w.to); } if (q.length > 500) break; }
      const col = {}; for (const n of g.nodes) { const d = depth.get(n.id) || 0; (col[d] ||= []).push(n); } for (const [d, ns] of Object.entries(col)) ns.forEach((n, i) => { n.x = 40 + d * 300; n.y = 40 + i * 150; });
    }
    loadBehavior() {
      const b = this.curB(); this.begToolbar.textContent = ''; this.renderBehList(); if (this.doc) { this.code.releaseDoc && this.code.releaseDoc(this.doc); this.doc = null; }
      if (!b) { this.graph.setGraph({ nodes: [], wires: [] }, { readOnly: true }); this.begToolbar.append(h('span', { class: 'lg-hint' }, 'Select or create a behaviour on the left.')); this.lgBody.className = 'lg-body m-blocks'; this.codeStatus.textContent = ''; this.inspect(); return; }
      const modeBtn = (k, l) => h('button', { class: 'btn sm' + (this.logicMode === k ? ' on' : ''), onclick: () => { this.logicMode = k; this.loadBehavior(); setTimeout(() => this.graph.fit(), 20); } }, l);
      this.begToolbar.append(h('b', { class: 'lg-name', title: 'Click to rename', onclick: () => this.renameBehavior(b) }, b.name), h('span', { class: 'tag' }, b.mode === 'code' ? 'code script' : 'blocks'), h('span', { class: 'sp' }), h('span', { class: 'adv', style: 'display:inline-flex;gap:4px' }, modeBtn('blocks', '🧩 Blocks'), modeBtn('split', '◫ Split'), modeBtn('code', '﹛﹜ Code'), h('span', { class: 'sep' })),
        ...(b.mode === 'graph' ? [h('button', { class: 'btn sm adv', title: 'Turn this block graph into an editable script', onclick: () => this.toCode() }, '→ Convert to code')] : [b.graphBackup ? h('button', { class: 'btn sm', title: 'Discard script edits and restore the blocks', onclick: () => this.revertToBlocks() }, '↩ Revert to blocks') : null, h('button', { class: 'btn sm primary', title: 'Rebuild blocks from this script (dry run)', onclick: () => this.applyCode() }, '→ Apply code to blocks')]),
        h('button', { class: 'btn sm', onclick: () => this.attachCurrent(b.id), title: 'Attach to the selected object (or this scene)' }, '📎 Attach'), h('button', { class: 'btn sm', onclick: () => this.opts.openDocs && this.opts.openDocs(b.mode === 'code' ? 'scripting' : 'logic') }, '📖'));
      this.lgBody.className = 'lg-body m-' + this.logicMode + (b.mode === 'code' ? ' codemode' : '');
      if (b.mode === 'graph') { this.graph.setGraph(b.graph, { readOnly: false }); this.regenCode(true); }
      else { this.doc = this.code.createDoc(b.code || '', 'javascript', false, { gameScript: true }); this.code.setDoc(this.doc); this.previewFromCode(); this.applyCodeLook(); }
      this.inspect(); setTimeout(() => this.graph && this.graph.fit(), 40);
    }
    regenCode(fresh) {
      const b = this.curB(); if (!b || b.mode !== 'graph') return; const res = VX.codegen.graphToCode(b.graph, b.name); this.genMap = res;
      if (fresh || !this.doc) { if (this.doc) this.code.releaseDoc(this.doc); this.doc = this.code.createDoc(res.code, 'javascript', true, { gameScript: true }); this.code.setDoc(this.doc); this.applyCodeLook(); } else { this.suppress = true; this.code.setValue(res.code); this.suppress = false; }
      this.codeStatus.textContent = 'Generated from the blocks – read only. Use “Convert to code” to edit as a script.'; this.codeStatus.className = 'lg-status';
    }
    onNodeSelected(id) {
      const b = this.curB(); if (!b || !id || this.logicMode === 'blocks') return; const map = b.mode === 'graph' ? this.genMap && this.genMap.nodeLine : this.codeMap && this.codeMap.nodeLine; const line = map && map[id]; if (!line) return;
      this.code.goto(line, 1); const ed = this.code.ed, Range = ace.require('ace/range').Range; if (this._mk) ed.session.removeMarker(this._mk); this._mk = ed.session.addMarker(new Range(line - 1, 0, line - 1, 1), 'ace-node-line', 'fullLine'); setTimeout(() => this._mk && ed.session.removeMarker(this._mk), 1500);
    }
    onCodeCursor(line) { const b = this.curB(); if (!b || this.view !== 'logic' || this.logicMode === 'blocks') return; const lm = b.mode === 'graph' ? this.genMap && this.genMap.lineNode : this.codeMap && this.codeMap.lineNode; const id = lm && lm[line - 1]; if (id) { this._noEcho = true; this.graph.selectNode(id); this._noEcho = false; } }
    onCodeEdited() {
      const b = this.curB(); if (!b || b.mode !== 'code' || this.suppress || !this.doc) return; b.code = this.code.text(this.doc); clearTimeout(this._ct); this._ct = setTimeout(() => { this.commit(); this.previewFromCode(); }, 350);
    }
    previewFromCode() {
      const b = this.curB(); if (!b || b.mode !== 'code') return; const res = VX.codegen.codeToGraph(b.code || '');
      if (res.error) { this.codeStatus.textContent = '⚠ ' + res.error; this.codeStatus.className = 'lg-status err'; this.graph.setGraph({ nodes: [], wires: [] }, { readOnly: true, keepView: true }); return; }
      const g = JSON.parse(JSON.stringify(res.graph)); this.autoLayout(g); this.codeMap = VX.codegen.codeLineMap(b.code, g); this.graph.setGraph(g, { readOnly: true, keepView: true });
      const n = g.nodes.length; const dyn = /\b(on|after|every)\s*\(/.test(noComments(b.code)); this.codeStatus.textContent = `✓ Script OK – ${n} block${n === 1 ? '' : 's'} found in the dry run.` + (dyn ? ' Event handlers (on / after / every) only run in the game, not in the block preview.' : ''); this.codeStatus.className = 'lg-status ok';
    }
    toCode() { const b = this.curB(); if (!b) return; const res = VX.codegen.graphToCode(b.graph, b.name); b.graphBackup = clone(b.graph); b.code = res.code; b.mode = 'code'; this.commit(true); this.loadBehavior(); VX.ui.toast('Converted to code. “Revert to blocks” restores the original.', 'ok'); }
    revertToBlocks() { const b = this.curB(); if (!b || !b.graphBackup) return; b.graph = b.graphBackup; delete b.graphBackup; b.mode = 'graph'; this.commit(true); this.loadBehavior(); }
    async applyCode() {
      const b = this.curB(); if (!b) return; const res = VX.codegen.codeToGraph(b.code || ''); if (res.error) return VX.ui.toast('Fix the script first: ' + res.error, 'error');
      if (/\b(on|after|every|emit|fire)\s*\(/.test(noComments(b.code)) && !(await VX.ui.confirm('This script uses event handlers (on / after / every / emit). They cannot be shown as blocks and will be dropped.', 'Convert anyway', { danger: true, title: 'Some code has no block form' }))) return;
      const g = JSON.parse(JSON.stringify(res.graph)); this.autoLayout(g); b.graph = g; delete b.graphBackup; b.mode = 'graph'; this.commit(true); this.loadBehavior();
    }
    inspectBehavior(box) {
      const b = this.curB(); if (!b) { box.append(this.sec('Logic', h('div', { class: 'ins-note' }, 'Behaviours are the game logic. Build them with blocks (Triggers → Logic → Components…) or switch to code. Select a block to edit its settings here.'), h('button', { class: 'btn block primary', onclick: () => this.newBehavior() }, '＋ New behaviour'))); return; }
      const users = this.usersOf(b.id); const list = users.map((u) => h('div', { class: 'gl-row', onclick: () => { if (u.scene !== this.scene) { this.sceneIdx = this.project.scenes.indexOf(u.scene); this.sel = []; this.loadScene(); this.renderSceneList(); } if (u.obj) this.setSel([u.obj.id]); } }, h('span', { class: 'ico' }, u.obj ? ((GP.type(u.obj.type) || {}).icon || '◻') : '🎬'), h('span', { class: 'nm' }, (u.obj ? u.obj.name : 'Scene: ') + (u.obj ? '' : u.scene.name)), h('span', { class: 'badge' }, u.scene.name)));
      box.append(this.sec('Behaviour', this.row('Name', this.txtIn(b, 'name', { onSet: () => { this.renderBehList(); const n = this.begToolbar.querySelector('.lg-name'); if (n) n.textContent = b.name; } })), this.row('Type', h('span', { class: 'tag' }, b.mode === 'code' ? 'script' : 'blocks')), h('button', { class: 'btn block', onclick: () => this.attachCurrent(b.id) }, '📎 Attach to selected ' + (this.sel.length ? 'object' : 'scene'))), this.sec('Used by (' + users.length + ')', ...(list.length ? list : [h('div', { class: 'ins-note' }, 'Not attached to anything yet.')])));
      if (this.graph.sel.size !== 1 || b.mode === 'code') box.append(this.sec('Tip', h('div', { class: 'ins-note' }, 'Click a block to see its settings on the canvas’s right-hand side. Drag from an output dot to an input dot to wire blocks. Double-click empty space (or press Space) to search blocks.')));
    }

    /* ------------------------------------------------------------------ assets */
    buildAssets() {
      this.assets = new VX.AssetManager({ project: this.project, onChange: (final) => { this.commit(); if (final) { this.refreshView(); this.refreshPaletteHosts(); } }, openStudio: (kind, id) => { const a = this.project.assets[kind][id]; if (a) VX.openStudio(kind, a, this.project, (final) => { this.commit(); if (final) { this.assets.renderGrid(); this.refreshView(); this.refreshPaletteHosts(); } }); } });
      this.assetView.append(this.assets.el);
    }
  }
  VX.GameEditor = GameEditor;
})();
