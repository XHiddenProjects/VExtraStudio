/* Vextra Studio – tabs and editors. Every tab has a `kind`; each kind knows how to mount itself into one of the stage hosts. */
(function () {
  const { h, $ } = VX;
  const S = VX.app.S;
  let code = null; // shared Ace wrapper
  const hosts = () => ({ editor: $('#editor-host'), designer: $('#designer-host'), game: $('#game-host'), view: $('#view-host') });
  const showHost = (name) => { const hs = hosts(); for (const [k, el] of Object.entries(hs)) el.classList.toggle('on', k === name); };
  const T = (VX.tabs = { kinds: {}, problems: new Map() });

  function ensureCode() {
    if (code) return code;
    code = CodeEditor.create($('#editor-host'), {
      onChange() { const t = S.active && byId(S.active); if (t && t.kind === 'code' && t.doc) { t.dirty = true; renderTabs(); VX.emit('editorChange', t); Forge.emit('editorChange', code.text(t.doc), t.path); queueAuto(t); } },
      onCursor(l, c) { VX.emit('cursor', l, c); },
    });
    code.onProblems = (doc) => { const t = S.tabs.find((x) => x.doc === doc); if (t) { T.problems.set(t.id, doc.problems || []); VX.emit('problems'); } };
    applyLook(); return code;
  }
  function applyLook() {
    if (!code) return; const s = VX.app.settings, th = VX.theme.current(); if (!th) return;
    code.setLook(th, { fontSize: s.fontSize, tabSize: s.tabSize, wrap: s.wrap, fontFamily: s.fontFamily || 'JetBrains Mono, Cascadia Code, Consolas, Menlo, monospace' });
  }
  VX.on('theme', applyLook); VX.on('settings', (k) => { if (['fontSize', 'tabSize', 'wrap', 'fontFamily'].includes(k)) applyLook(); });
  T.code = () => ensureCode();

  const byId = (id) => S.tabs.find((t) => t.id === id);
  const autoTimers = {};
  function queueAuto(t) { if (!VX.app.settings.autosave || !t.path) return; clearTimeout(autoTimers[t.id]); autoTimers[t.id] = setTimeout(() => T.save(t), 900); }

  /* ---------- kind handlers ---------- */
  T.kinds.code = {
    icon: 'file',
    async load(t) { if (t.doc) return; const text = t.text ?? (await window.native.readFile(t.path)); t.lang = t.lang || CodeEditor.langFromName(t.title || t.path || ''); t.doc = ensureCode().createDoc(text, t.lang); delete t.text; t.dirty = !!t.startDirty; },
    show(t) { showHost('editor'); const c = ensureCode(); c.setDoc(t.doc); setTimeout(() => c.focus(), 0); },
    text: (t) => code.text(t.doc),
    dispose(t) { if (t.doc && code) code.releaseDoc(t.doc); T.problems.delete(t.id); VX.emit('problems'); },
    toolbar(t) {
      const out = [h('button', { class: 'btn sm', onclick: () => T.save(t) }, VX.icon('save', 14), 'Save'), h('button', { class: 'btn sm', title: 'Format document (Shift+Alt+F)', onclick: () => { if (!code.format()) VX.ui.toast('No formatter for ' + t.lang, 'warn'); } }, VX.icon('wand', 14), 'Format')];
      const ext = VX.path.ext(t.path || t.title || '');
      if (['html', 'htm', 'md', 'markdown', 'svg'].includes(ext)) out.push(h('button', { class: 'btn sm primary', onclick: () => VX.web.openPreview(t) }, VX.icon('play', 13), 'Live preview'));
      if (['html', 'htm'].includes(ext)) out.push(h('button', { class: 'btn sm', title: 'Preview in a phone-sized frame', onclick: () => VX.web.openPreview(t, 'phone') }, VX.icon('phone', 14)));
      out.push(h('span', { class: 'spacer' }));
      for (const it of Forge.toolbarItems.values()) if (!it.when || it.when(t.lang, t.path)) out.push(h('button', { class: 'btn sm', onclick: () => { try { it.run(); } catch (e) { VX.ui.toast(e.message, 'error'); } } }, it.label));
      return out;
    },
  };

  T.kinds.ui = {
    icon: 'blocks',
    async load(t) { if (t.ctl) return; const text = t.text ?? (await window.native.readFile(t.path)); delete t.text; t.ctl = VX.Designer.fromText(text, { onChange: () => T.markDirty(t), preview: (d) => VX.ui.preview(d.toHTML(t.title), 'Preview – ' + t.title), exportCode: (d) => T.exportUI(d, t) }); t.dirty = !!t.startDirty; },
    show(t) { showHost('designer'); const host = $('#designer-host'); if (t.ctl.root.parentNode !== host) { host.textContent = ''; host.append(t.ctl.root); } t.ctl.fit && t.ctl.fit(); },
    text: (t) => t.ctl.serialize(),
    toolbar: (t) => t.ctl.toolbar(),
    dispose() {},
  };
  T.exportUI = async (d, t) => { const name = (VX.path.stem(t.title) || 'design') + '.html'; const html = d.toHTML(t.title); const base = S.root; if (base) { const p = VX.path.join(base, name); await window.native.writeFile(p, html); VX.ui.toast('Exported ' + name, 'ok'); VX.emit('fsChange'); T.open({ path: p }); } else { VX.download(name, html, 'text/html'); } };

  T.kinds.game = {
    icon: 'game',
    async load(t) {
      if (t.ctl) return; await VX.threeReady(); const text = t.text ?? (await window.native.readFile(t.path)); delete t.text;
      t.ctl = new VX.GameEditor(text, { path: t.path, title: t.title, onChange: () => T.markDirty(t), notify: (m, k) => VX.ui.toast(m, k), openDocs: (id) => VX.docs.open(id), saveRequest: () => T.save(t), tab: t }); t.dirty = !!t.startDirty;
    },
    show(t) { showHost('game'); const host = $('#game-host'); if (t.ctl.root.parentNode !== host) { host.textContent = ''; host.append(t.ctl.root); } t.ctl.onShow && t.ctl.onShow(); },
    text: (t) => t.ctl.serialize(),
    toolbar: (t) => t.ctl.toolbar(),
    dispose(t) { t.ctl && t.ctl.dispose && t.ctl.dispose(); },
  };

  T.kinds.image = {
    icon: 'image',
    async load(t) { if (t.url) return; const b64 = await window.native.readBase64(t.path); t.url = `data:${VX.mime(t.path)};base64,${b64}`; },
    show(t) { showHost('view'); $('#view-host').replaceChildren(h('div', { class: 'imgview' }, h('img', { src: t.url, alt: t.title }))); },
    toolbar(t) { const im = new Image(); im.src = t.url; const info = h('span', { class: 'tag' }, '…'); im.onload = () => { info.textContent = `${im.naturalWidth} × ${im.naturalHeight}`; }; return [info]; },
    dispose() {},
  };
  T.kinds.audio = {
    icon: 'sound',
    async load(t) { if (t.url) return; const b64 = await window.native.readBase64(t.path); t.url = `data:${VX.mime(t.path)};base64,${b64}`; },
    show(t) { showHost('view'); $('#view-host').replaceChildren(h('div', { class: 'imgview' }, h('audio', { src: t.url, controls: true }))); }, toolbar: () => [], dispose() {},
  };
  T.kinds.binary = { icon: 'file', async load() {}, show(t) { showHost('view'); $('#view-host').replaceChildren(h('div', { class: 'page' }, h('h2', {}, t.title), h('p', { style: 'color:var(--muted)' }, 'This file type cannot be shown in the editor.'), h('button', { class: 'btn', onclick: () => window.native.reveal(t.path) }, 'Show in folder'))); }, toolbar: () => [], dispose() {} };

  /* generic "page" tabs: welcome, settings, docs, account... render(container, tab) is supplied by the opener */
  T.kinds.page = {
    icon: 'file', async load() {},
    show(t) { showHost('view'); const c = $('#view-host'); if (t.container) { if (c.firstChild !== t.container) c.replaceChildren(t.container); } else { t.container = h('div', {}); c.replaceChildren(t.container); t.render(t.container, t); } t.onShow && t.onShow(t); },
    toolbar: (t) => (t.toolbar ? t.toolbar(t) : []), dispose(t) { t.onClose && t.onClose(t); },
  };
  T.kinds.preview = { icon: 'play', async load() {}, show(t) { showHost('view'); const c = $('#view-host'); if (c.firstChild !== t.container) c.replaceChildren(t.container); t.refresh && t.refresh(); }, toolbar: () => [], dispose(t) { t.onClose && t.onClose(t); } };

  /* ---------- tab API ---------- */
  T.list = () => S.tabs;
  T.get = byId;
  T.active = () => byId(S.active);
  T.markDirty = (t) => { if (!t.dirty) { t.dirty = true; renderTabs(); } VX.emit('editorChange', t); queueAuto(t); };

  /** Open or focus a tab. spec: {path} | {kind:'page', key, title, icon, render} | {kind:'code', title, text, lang} */
  T.open = async function (spec) {
    let kind = spec.kind || (spec.path ? VX.app.fileKind(spec.path) : 'code');
    const key = spec.key || spec.path;
    let t = key && S.tabs.find((x) => x.key === key);
    if (!t) {
      t = Object.assign({ id: VX.uid('tab'), kind, key, title: spec.title || (spec.path ? VX.path.base(spec.path) : 'untitled'), dirty: false }, spec);
      const h_ = T.kinds[kind]; if (!h_) { VX.ui.toast('Unknown tab type ' + kind, 'error'); return null; }
      try { await h_.load(t); } catch (e) { VX.ui.toast('Cannot open ' + t.title + ': ' + (e.message || e), 'error'); return null; }
      S.tabs.push(t);
      if (VX.app.settings.lastOpen !== undefined) { /* reserved */ }
    }
    T.activate(t.id); return t;
  };
  T.activate = function (id) {
    const t = byId(id); if (!t) return;
    S.active = id; T.kinds[t.kind].show(t); renderTabs(); renderToolbar(); VX.emit('tabChange', t); Forge.emit('tabChange', t);
    $('#statusbar') && VX.emit('status');
    VX.dnd.prune();
  };
  T.close = async function (id, force) {
    const t = byId(id); if (!t) return true;
    if (t.dirty && !force) {
      const r = await new Promise((resolve) => { let m; const done = (v) => { resolve(v); m.close(); }; m = VX.ui.modal({ title: 'Unsaved changes', size: 'small', body: h('div', {}, `Save changes to ${t.title} before closing?`), onClose: () => resolve('cancel'), actions: [h('button', { class: 'btn', onclick: () => done('discard') }, "Don't save"), h('button', { class: 'btn primary', onclick: () => done('save') }, 'Save')] }); });
      if (r === 'cancel') return false; if (r === 'save') { if (!(await T.save(t))) return false; }
    }
    const i = S.tabs.indexOf(t); S.tabs.splice(i, 1); T.kinds[t.kind].dispose && T.kinds[t.kind].dispose(t);
    if (S.active === id) { const n = S.tabs[Math.min(i, S.tabs.length - 1)]; S.active = null; if (n) T.activate(n.id); else { showHost('view'); $('#view-host').replaceChildren(); renderToolbar(); VX.emit('tabChange', null); VX.app.showWelcome && VX.app.showWelcome(); } }
    renderTabs(); return true;
  };
  T.closeAll = async () => { for (const t of [...S.tabs]) if (!(await T.close(t.id))) return false; return true; };
  T.save = async function (t = T.active(), as) {
    if (!t || !T.kinds[t.kind].text) return false;
    try {
      let text = T.kinds[t.kind].text(t);
      if (t.kind === 'code' && VX.app.settings.formatOnSave && code.format()) text = T.kinds.code.text(t);
      if (!t.path || as) {
        const def = t.title.includes('.') ? t.title : t.title + (t.kind === 'ui' ? '.vxui' : t.kind === 'game' ? '.vxgame' : '.txt');
        const p = S.root && !as ? VX.path.join(S.root, def) : await window.native.saveAs(def, text);
        if (!p) return false;
        if (S.root && !as && (await window.native.exists(p))) { if (!(await VX.ui.confirm(`${def} already exists. Overwrite it?`, 'Overwrite', { danger: true }))) { const q = await window.native.saveAs(def, text); if (!q) return false; t.path = q; } else t.path = p; } else t.path = p;
        t.key = t.path; t.title = VX.path.base(t.path); if (t.kind === 'code') { t.lang = CodeEditor.langFromName(t.title); code.setLang(t.doc, t.lang); }
      }
      await window.native.writeFile(t.path, text); t.dirty = false; renderTabs(); VX.emit('fsChange'); VX.emit('saved', t);
      if (t.kind === 'code') Forge.emit('save', text, t.path);
      if (t.ctl && t.ctl.setPath) t.ctl.setPath(t.path);
      return true;
    } catch (e) { VX.ui.toast('Save failed: ' + (e.message || e), 'error'); return false; }
  };
  T.saveAll = async () => { for (const t of S.tabs) if (t.dirty && t.path) await T.save(t); };
  T.rename = (oldPath, newPath) => { for (const t of S.tabs) if (t.path === oldPath) { t.path = newPath; t.key = newPath; t.title = VX.path.base(newPath); } else if (t.path && t.path.startsWith(oldPath + '/')) { t.path = newPath + t.path.slice(oldPath.length); t.key = t.path; } renderTabs(); };
  T.closePath = async (p) => { for (const t of [...S.tabs]) if (t.path && (t.path === p || t.path.startsWith(p + '/'))) await T.close(t.id, true); };
  T.newFile = async (name, content, lang) => T.open({ kind: 'code', key: VX.uid('new'), title: name || 'untitled.txt', text: content || '', lang, startDirty: true });
  T.reloadFromDisk = async (path) => { const t = S.tabs.find((x) => x.path === path && x.kind === 'code'); if (t && !t.dirty) { try { code.setValue && 0; const txt = await window.native.readFile(path); if (txt !== code.text(t.doc)) { const c = ensureCode(); const cur = S.active === t.id; t.doc.session.setValue(txt); t.dirty = false; renderTabs(); void cur; } } catch { /* ignore */ } } };

  /* ---------- rendering ---------- */
  function renderTabs() {
    const bar = $('#tabbar'); bar.textContent = '';
    for (const t of S.tabs) {
      const icon = t.icon || (t.kind === 'code' ? VX.app.fileIcon(t.title)[0] : T.kinds[t.kind].icon);
      const el = h('div', { class: 'tab' + (t.id === S.active ? ' active' : ''), title: t.path || t.title, onclick: () => T.activate(t.id), onauxclick: (e) => { if (e.button === 1) T.close(t.id); },
        oncontextmenu: (e) => { e.preventDefault(); VX.ui.menu(e.clientX, e.clientY, [{ label: 'Close', run: () => T.close(t.id) }, { label: 'Close others', run: async () => { for (const o of [...S.tabs]) if (o.id !== t.id) await T.close(o.id); } }, { label: 'Close all', run: () => T.closeAll() }, '-', { label: 'Save', run: () => T.save(t), disabled: !T.kinds[t.kind].text }, { label: 'Reveal in folder', run: () => t.path && window.native.reveal(t.path), disabled: !t.path }]); } },
        VX.icon(icon), h('span', {}, t.title), t.dirty ? h('span', { class: 'dot', title: 'Unsaved changes' }) : null,
        h('button', { class: 'x', title: 'Close (Ctrl+W)', onclick: (e) => { e.stopPropagation(); T.close(t.id); } }, VX.icon('x', 12)));
      bar.append(el);
    }
    const act = bar.querySelector('.tab.active'); act && act.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function renderToolbar() { const tb = $('#toolbar'); tb.textContent = ''; const t = T.active(); if (!t) return; const items = T.kinds[t.kind].toolbar ? T.kinds[t.kind].toolbar(t) : []; tb.append(...items.filter(Boolean)); }
  T.renderTabs = renderTabs; T.renderToolbar = renderToolbar;
  VX.on('toolbarRefresh', () => renderToolbar());
  VX.on('registry', () => { const t = T.active(); if (t && t.kind === 'code') renderToolbar(); });
  window.addEventListener('beforeunload', (e) => { if (S.tabs.some((t) => t.dirty)) { e.preventDefault(); e.returnValue = ''; } });

  /* editor access for plugins */
  Forge.host.editorGet = () => { const t = T.active(); return t && t.kind === 'code' ? code.text(t.doc) : ''; };
  Forge.host.editorSet = (v) => { const t = T.active(); if (t && t.kind === 'code') code.setValue(v); };
  Forge.host.editorSelection = () => (code ? code.getSelection() : '');
  Forge.host.editorInsert = (txt) => { const t = T.active(); if (t && t.kind === 'code') code.replaceSelection(txt); };
  Forge.host.editorLang = () => { const t = T.active(); return t ? t.lang || t.kind : 'plaintext'; };
  Forge.host.editorPath = () => (T.active() ? T.active().path || null : null);
  Forge.host.openPath = (p) => T.open({ path: p });
  Forge.host.newFile = (n, c, l) => T.newFile(n, c, l);
})();
