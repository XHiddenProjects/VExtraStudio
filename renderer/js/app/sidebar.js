/* Vextra Studio – activity bar and side views: Explorer, Search, Create, Plugins, Themes, Cloud + plugin panels. */
(function () {
  const { h, $ } = VX;
  const S = VX.app.S;
  const SB = (VX.sidebar = { views: {}, current: null });

  /* ---------- activity bar ---------- */
  const BUILTIN = [
    { id: 'explorer', icon: 'files', title: 'Explorer (Ctrl+Shift+E)' }, { id: 'search', icon: 'search', title: 'Search in files (Ctrl+Shift+F)' },
    { id: 'create', icon: 'create', title: 'Create – drag items onto the canvas' }, { id: 'cloud', icon: 'cloud', title: 'Account, sharing & publishing' }, '-',
    { id: 'plugins', icon: 'plugin', title: 'Plugins', adv: true }, { id: 'themes', icon: 'theme', title: 'Themes', adv: true },
  ];
  SB.renderActivity = function () {
    const bar = $('#activity'); bar.textContent = '';
    const add = (v) => {
      if (v === '-') return bar.append(h('div', { class: 'act-sep adv' }));
      bar.append(h('button', { class: 'act' + (v.adv ? ' adv' : '') + (SB.current === v.id ? ' active' : ''), title: v.title, 'data-view': v.id, onclick: () => (SB.current === v.id && !$('#sidebar').classList.contains('collapsed') ? SB.collapse(true) : SB.show(v.id)) }, VX.icon(v.icon)));
    };
    BUILTIN.forEach(add);
    for (const p of Forge.panels.values()) add({ id: 'panel:' + p.id, icon: p.icon, title: p.title + ' (plugin)' });
    bar.append(h('div', { class: 'spacer' }));
    bar.append(h('button', { class: 'act', title: 'Documentation (F1)', onclick: () => VX.docs.open() }, VX.icon('docs')));
    bar.append(h('button', { class: 'act', title: 'Settings (Ctrl+,)', onclick: () => VX.app.openSettings() }, VX.icon('settings')));
  };
  SB.collapse = (v) => { $('#sidebar').classList.toggle('collapsed', v); $('#side-resizer').classList.toggle('collapsed', v); };
  SB.show = function (id) {
    SB.collapse(false); SB.current = id; VX.app.set('lastView', id); SB.renderActivity();
    let def = SB.views[id];
    if (id.startsWith('panel:')) { const p = Forge.panels.get(id.slice(6)); def = p && { title: p.title, render: (c) => p.render(c) }; }
    if (!def) return; $('#side-title').textContent = def.title; const act = $('#side-actions'); act.textContent = ''; (def.actions ? def.actions() : []).forEach((a) => act.append(a));
    const body = $('#side-body'); body.textContent = ''; try { def.render(body); } catch (e) { body.append(h('div', { class: 'empty' }, 'View failed: ' + e.message)); console.error(e); }
  };
  SB.refresh = () => { if (SB.current) SB.show(SB.current); };
  const abtn = (icon, title, fn) => h('button', { title, onclick: fn }, VX.icon(icon, 15));

  /* ---------- explorer ---------- */
  const expanded = new Set();
  let treeEl = null;
  async function renderDir(dir, container, depth) {
    let items = []; try { items = await window.native.readDir(dir); } catch (e) { container.append(h('div', { class: 'empty' }, e.message)); return; }
    const hide = new Set(['node_modules', '.git', 'target', '.DS_Store']);
    for (const it of items) {
      if (hide.has(it.name)) continue;
      const [ic, cls] = VX.app.fileIcon(it.name, it.isDir);
      const open = expanded.has(it.path);
      const chev = h('span', { class: 'chev' + (open ? ' open' : '') }, it.isDir ? VX.icon('right') : null);
      const row = h('div', { class: 'tree-row ft-' + (cls ? cls.slice(3) : '') + (S.active && VX.tabs.get(S.active)?.path === it.path ? ' active' : ''), style: `padding-left:${8 + depth * 14}px`, 'data-path': it.path, title: it.path,
        onclick: async () => { if (it.isDir) { open ? expanded.delete(it.path) : expanded.add(it.path); SB.refresh(); } else VX.tabs.open({ path: it.path }); },
        oncontextmenu: (e) => { e.preventDefault(); e.stopPropagation(); fileMenu(e, it); } }, chev, VX.icon(ic), h('span', { class: 'name' }, it.name));
      row.classList.add(cls);
      container.append(row);
      if (it.isDir) { VX.dnd.target(row, (d) => moveInto(d, it.path), (d) => d && d.kind === 'file' && d.path !== it.path); }
      else VX.dnd.draggable(row, () => ({ kind: 'file', path: it.path, name: it.name }), it.name);
      if (it.isDir && open) await renderDir(it.path, container, depth + 1);
    }
    if (!items.length && depth === 0) container.append(h('div', { class: 'empty' }, 'This folder is empty.'));
  }
  async function moveInto(d, dir) {
    try { const nm = d.name; const src = d.path; const dst = VX.path.join(dir, nm); if (VX.path.dir(src) === dir) return; const txt = await window.native.readBase64(src); await window.native.writeBase64(dst, txt); await window.native.remove(src); VX.tabs.rename(src, dst); SB.refresh(); VX.ui.toast(`Moved ${nm}`, 'ok'); } catch (e) { VX.ui.toast('Move failed: ' + e.message, 'error'); }
  }
  async function fileMenu(e, it) {
    const dir = it.isDir ? it.path : VX.path.dir(it.path);
    VX.ui.menu(e.clientX, e.clientY, [
      { label: 'New file…', run: () => SB.newFile(dir) }, { label: 'New folder…', run: () => SB.newFolder(dir) }, '-',
      !it.isDir && /\.html?$/i.test(it.name) ? { label: 'Live preview', run: async () => { const t = await VX.tabs.open({ path: it.path }); t && VX.web.openPreview(t); } } : null,
      !it.isDir ? { label: 'Open as text', run: () => VX.tabs.open({ kind: 'code', key: 'text:' + it.path, path: it.path, title: it.name }) } : null,
      { label: 'Rename…', run: async () => { const n = await VX.ui.ask('New name', it.name); if (n && n !== it.name) { try { const np = await window.native.rename(it.path, n); VX.tabs.rename(it.path, np); SB.refresh(); } catch (er) { VX.ui.toast(er.message, 'error'); } } } },
      { label: 'Delete', danger: true, run: async () => { if (await VX.ui.confirm(`Delete ${it.name}${it.isDir ? ' and everything in it' : ''}? This cannot be undone.`, 'Delete', { danger: true })) { try { await VX.tabs.closePath(it.path); await window.native.remove(it.path); SB.refresh(); } catch (er) { VX.ui.toast(er.message, 'error'); } } } }, '-',
      { label: 'Reveal in folder', run: () => window.native.reveal(it.path) }, { label: 'Copy path', run: () => navigator.clipboard && navigator.clipboard.writeText(it.path) },
    ].filter(Boolean));
  }
  SB.newFile = async (dir) => { dir = dir || S.root; if (!dir) return VX.app.openFolder(); const n = await VX.ui.ask('New file name', '', { hint: 'Any file type: index.php, schema.sql, .htaccess, nginx.conf, app.py, config.yml … (or player.vxgame, menu.vxui)' }); if (!n) return; try { const p = await window.native.create(dir, n, false); const starter = VX.templates && VX.templates.starter && VX.templates.starter(n); if (starter) await window.native.writeFile(p, starter); if (VX.path.ext(n) === 'vxgame') await window.native.writeFile(p, JSON.stringify(VX.GameProject.blank({ name: VX.path.stem(n) }), null, 2)); else if (VX.path.ext(n) === 'vxui') await window.native.writeFile(p, VX.Designer.blank().serialize()); expanded.add(dir); SB.refresh(); VX.tabs.open({ path: p }); } catch (e) { VX.ui.toast(e.message, 'error'); } };
  SB.newFolder = async (dir) => { dir = dir || S.root; if (!dir) return VX.app.openFolder(); const n = await VX.ui.ask('New folder name'); if (!n) return; try { await window.native.create(dir, n, true); expanded.add(dir); expanded.add(VX.path.join(dir, n)); SB.refresh(); } catch (e) { VX.ui.toast(e.message, 'error'); } };

  SB.views.explorer = {
    title: 'Explorer',
    actions: () => [abtn('file', 'New file', () => SB.newFile()), abtn('folder', 'New folder', () => SB.newFolder()), abtn('refresh', 'Refresh', () => SB.refresh()), abtn('plus', 'New project…', () => VX.app.newProject()), abtn('files', 'Database', () => VX.web.openDatabase()), abtn('globe', 'Export website (ZIP / tar.gz)', () => VX.web.exportSite()), ...(S.root ? [abtn('close', 'Close workspace', () => VX.app.closeWorkspace())] : [])],
    render(c) {
      if (!S.root) { c.append(h('div', { class: 'empty' }, h('p', {}, 'No folder open.'), h('button', { class: 'btn primary', onclick: () => VX.app.openFolder() }, VX.icon('folder', 14), 'Open folder'), h('div', {}, h('button', { class: 'btn', onclick: () => VX.app.newProject() }, VX.icon('plus', 14), 'New project')))); return; }
      c.append(h('div', { class: 'group-title', title: S.root }, VX.path.base(S.root), h('span', { class: 'tag' }, VX.app.settings.mode)));
      treeEl = h('div', { class: 'tree' }); c.append(treeEl); renderDir(S.root, treeEl, 0);
      VX.dnd.target(treeEl, (d) => moveInto(d, S.root), (d) => d && d.kind === 'file');
    },
  };
  VX.on('fsChange', () => { if (SB.current === 'explorer') SB.refresh(); });
  VX.on('root', () => { expanded.clear(); if (SB.current === 'explorer') SB.refresh(); });
  VX.on('tabChange', () => { if (SB.current === 'explorer' && treeEl) { treeEl.querySelectorAll('.tree-row').forEach((r) => r.classList.toggle('active', r.dataset.path === VX.tabs.active()?.path)); } if (SB.current === 'create') SB.refresh(); });

  /* ---------- search ---------- */
  let sq = { q: '', cs: false, rx: false, res: null };
  SB.views.search = {
    title: 'Search', actions: () => [],
    render(c) {
      const inp = h('input', { class: 'search-input', placeholder: 'Find in files', value: sq.q });
      const cs = h('button', { class: 'btn sm' + (sq.cs ? ' on' : ''), title: 'Match case', onclick: () => { sq.cs = !sq.cs; cs.classList.toggle('on', sq.cs); } }, 'Aa');
      const rx = h('button', { class: 'btn sm' + (sq.rx ? ' on' : ''), title: 'Regular expression', onclick: () => { sq.rx = !sq.rx; rx.classList.toggle('on', sq.rx); } }, '.*');
      const out = h('div', {});
      const run = async () => {
        sq.q = inp.value; out.textContent = ''; if (!sq.q) return; if (!S.root) { out.append(h('div', { class: 'empty' }, 'Open a folder first.')); return; }
        try { const hits = await window.native.search(S.root, sq.q, sq.cs, sq.rx); sq.res = hits; drawHits(out, hits); } catch (e) { out.append(h('div', { class: 'empty' }, e.message)); }
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
      c.append(inp, h('div', { class: 'row', style: 'display:flex;gap:6px;margin-bottom:8px' }, cs, rx, h('button', { class: 'btn sm primary', onclick: run }, 'Search')), out);
      if (sq.res) drawHits(out, sq.res); setTimeout(() => inp.focus(), 0);
    },
  };
  function drawHits(out, hits) {
    out.textContent = ''; if (!hits.length) { out.append(h('div', { class: 'empty' }, 'No results.')); return; }
    out.append(h('div', { class: 'tag', style: 'margin:0 4px 6px' }, hits.length + ' result' + (hits.length > 1 ? 's' : '')));
    const byFile = new Map(); for (const hit of hits) (byFile.get(hit.path) || byFile.set(hit.path, []).get(hit.path)).push(hit);
    for (const [p, list] of byFile) {
      out.append(h('div', { class: 'hit-file' }, VX.app.rel(p)));
      for (const hit of list.slice(0, 80)) out.append(h('div', { class: 'hit', onclick: async () => { const t = await VX.tabs.open({ path: p }); if (t && t.kind === 'code') setTimeout(() => VX.tabs.code().goto(hit.line, hit.col), 30); } }, h('span', { class: 'loc' }, hit.line), hit.text.trim().slice(0, 140)));
    }
  }

  /* ---------- create ---------- */
  SB.views.create = {
    title: 'Create',
    render(c) {
      const t = VX.tabs.active();
      const heading = (txt) => c.append(h('div', { class: 'pal-cat' }, txt));
      if (t && t.kind === 'ui') {
        c.append(h('div', { class: 'empty left', style: 'padding:8px 6px;font-size:12px' }, 'Drag a component onto the canvas — or click it to add it in the middle.'));
        const cats = {}; for (const d of Object.values(VX.components.registry.ui)) (cats[d.category] ||= []).push(d);
        for (const [cat, defs] of Object.entries(cats)) {
          heading(cat); const g = h('div', { class: 'pal-grid' });
          for (const d of defs) { const it = h('div', { class: 'pal-item', title: d.label, onclick: () => t.ctl.addItem(d.type, t.ctl.doc.width / 2, t.ctl.doc.height / 2, true) }, h('span', { class: 'pi' }, d.icon), d.label); VX.dnd.draggable(it, () => ({ kind: 'ui', type: d.type }), d.label); g.append(it); }
          c.append(g);
        }
        return;
      }
      if (t && t.kind === 'game' && t.ctl) { t.ctl.renderPalette(c); return; }
      c.append(h('div', { class: 'empty left', style: 'padding:8px 6px;font-size:12px' }, 'Start something new. Open a UI design to get a component palette you can drag onto the canvas, or a game to drag in objects.'));
      heading('New');
      const items = [['New UI design', 'blocks', () => VX.app.newUI()], ['New 2D game', 'game', () => VX.app.newGame('2d')], ['New 3D game', 'cube', () => VX.app.newGame('3d')], ['New web project', 'globe', () => VX.app.newProject()], ['New file…', 'file', () => SB.newFile()]];
      for (const [l, ic, fn] of items) c.append(h('button', { class: 'btn block', style: 'margin:4px 0;justify-content:flex-start', onclick: fn }, VX.icon(ic, 15), l));
    },
  };

  /* ---------- plugins ---------- */
  SB.views.plugins = {
    title: 'Plugins',
    actions: () => [abtn('plus', 'New plugin from template', newPlugin), abtn('folder', 'Import plugin file', async () => { try { const r = await window.native.ext.import('plugins'); if (r && r.length) { await Forge.plugins_.loadAll(); SB.refresh(); VX.ui.toast('Imported ' + r.length + ' plugin(s)', 'ok'); } } catch (e) { VX.ui.toast(e.message, 'error'); } }), abtn('docs', 'Plugin documentation', () => VX.docs.open('plugins'))],
    render(c) {
      const list = [...Forge.plugins.values()];
      c.append(h('div', { class: 'empty left', style: 'padding:6px;font-size:12px' }, 'Plugins add commands, UI components, themes, game objects and logic blocks. Every plugin has its own documentation page.'));
      for (const rec of list) {
        const m = rec.manifest; const contribs = Object.entries(rec.contrib || {}).filter(([, v]) => v.length).map(([k, v]) => `${v.length} ${k}`);
        c.append(h('div', { class: 'card' },
          h('h4', {}, h('span', {}, m.name, ' ', h('small', { style: 'color:var(--muted);font-weight:400' }, 'v' + m.version)), VX.ui.sw(rec.enabled, (on) => { Forge.plugins_.setEnabled(m.id, on); SB.refresh(); })),
          h('p', {}, m.description || 'No description'),
          rec.error ? h('p', { style: 'color:var(--danger)' }, '⚠ ' + rec.error) : null,
          h('div', { class: 'row' }, h('span', { class: 'tag' + (rec.source === 'builtin' ? '' : ' acc') }, rec.source === 'builtin' ? 'built-in' : 'yours'), ...contribs.map((x) => h('span', { class: 'tag' }, x)),
            h('span', { class: 'spacer' }),
            h('button', { class: 'btn sm', onclick: () => VX.docs.open('plugin:' + m.id) }, VX.icon('docs', 13), 'Docs'),
            rec.source === 'user' ? h('button', { class: 'btn sm', title: 'Edit source', onclick: () => VX.tabs.open({ kind: 'code', key: 'plugin:' + m.id, title: rec.file, path: rec.path || undefined, text: rec.code, lang: 'javascript' }) }, 'Edit') : h('button', { class: 'btn sm', title: 'Copy to your plugins to modify', onclick: () => copyPlugin(rec) }, 'Copy'),
            rec.source === 'user' ? h('button', { class: 'btn sm danger', onclick: async () => { if (await VX.ui.confirm(`Remove plugin “${m.name}”?`, 'Remove', { danger: true })) { await window.native.ext.remove('plugins', rec.file); await Forge.plugins_.loadAll(); SB.refresh(); } } }, VX.icon('trash', 13)) : null)));
      }
      c.append(h('button', { class: 'btn block', style: 'margin-top:8px', onclick: newPlugin }, VX.icon('plus', 14), 'Create a plugin'), h('button', { class: 'btn block', style: 'margin-top:6px', onclick: () => window.native.ext.openDir('plugins') }, VX.icon('folder', 14), 'Open plugins folder'));
    },
  };
  async function newPlugin() {
    const v = await VX.ui.form({ title: 'New plugin', fields: [{ key: 'name', label: 'Plugin name', required: true, placeholder: 'My Plugin' }], submit: 'Create' }); if (!v) return;
    const tpl = Forge.plugins_.template(v.name); await window.native.ext.save('plugins', tpl.file, tpl.code); await Forge.plugins_.loadAll(); SB.refresh();
    const rec = Forge.plugins.get(tpl.id); VX.tabs.open({ kind: 'code', key: 'plugin:' + tpl.id, title: tpl.file, path: rec && rec.path || undefined, text: tpl.code, lang: 'javascript' }); VX.ui.toast('Plugin created – edit and save to hot-reload it.', 'ok');
  }
  async function copyPlugin(rec) { const id = rec.manifest.id + '-copy'; const code = rec.code.replace(/"id"\s*:\s*"[^"]*"/, `"id":"${id}"`).replace(/"name"\s*:\s*"([^"]*)"/, '"name":"$1 (copy)"'); await window.native.ext.save('plugins', id + '.js', code); await Forge.plugins_.loadAll(); SB.refresh(); VX.ui.toast('Copied to your plugins', 'ok'); }
  VX.on('saved', async (t) => { if (t.key && String(t.key).startsWith('plugin:') && t.kind === 'code') { try { await window.native.ext.save('plugins', t.title, VX.tabs.kinds.code.text(t)); await Forge.plugins_.loadAll(); SB.current === 'plugins' && SB.refresh(); VX.ui.toast('Plugin reloaded', 'ok'); } catch (e) { VX.ui.toast(e.message, 'error'); } } });

  /* ---------- themes ---------- */
  SB.views.themes = {
    title: 'Themes',
    actions: () => [abtn('plus', 'Design a new theme', () => themeDesigner()), abtn('folder', 'Import theme (.json)', async () => { try { const r = await window.native.ext.import('themes'); if (r && r.length) { await VX.theme.load(); SB.refresh(); } } catch (e) { VX.ui.toast(e.message, 'error'); } })],
    render(c) {
      const cur = VX.theme.current();
      for (const t of VX.theme.list()) {
        const sw_ = h('div', { style: 'display:flex;height:20px;border-radius:5px;overflow:hidden;margin:6px 0 4px' }, ...['bg', 'bg2', 'bg3', 'accent', 'text'].map((k) => h('div', { style: `flex:1;background:${t.colors[k]}` })));
        c.append(h('div', { class: 'card', style: 'cursor:pointer;' + (cur && cur.id === t.id ? 'border-color:var(--accent)' : ''), onclick: () => { VX.app.set('theme', t.id); VX.theme.apply(t.id); SB.refresh(); } },
          h('h4', {}, t.name, cur && cur.id === t.id ? h('span', { class: 'tag ok' }, 'active') : h('span', { class: 'tag' }, t.type)), sw_,
          h('div', { class: 'row' }, h('span', { class: 'tag' }, t.source === 'builtin' ? 'built-in' : t.source === 'user' ? 'yours' : t.source || ''), h('span', { class: 'spacer' }),
            h('button', { class: 'btn sm', onclick: (e) => { e.stopPropagation(); themeDesigner(t); } }, 'Customize'),
            t.source === 'user' ? h('button', { class: 'btn sm danger', onclick: async (e) => { e.stopPropagation(); await window.native.ext.remove('themes', t.file); await VX.theme.load(); SB.refresh(); } }, VX.icon('trash', 13)) : null)));
      }
    },
  };
  async function themeDesigner(base) {
    const src = base || VX.theme.current(); const t = VX.clone({ id: '', name: (base ? base.name : 'My theme') + (base ? ' copy' : ''), type: src.type, colors: src.colors, editor: src.editor });
    const keys = [['bg', 'Background'], ['bg2', 'Panels'], ['bg3', 'Raised'], ['border', 'Borders'], ['text', 'Text'], ['muted', 'Muted text'], ['accent', 'Accent']];
    const orig = VX.theme.current(); const prev = () => { VX.theme.register({ ...t, id: '__draft', name: 'draft', source: 'draft' }); VX.theme.apply('__draft', { draft: true }); };
    const name = h('input', { value: t.name }); name.oninput = () => { t.name = name.value; };
    const kind = h('select', {}, h('option', { value: 'dark' }, 'Dark'), h('option', { value: 'light' }, 'Light')); kind.value = t.type; kind.onchange = () => { t.type = kind.value; prev(); };
    const body = h('div', {}, VX.ui.field('Name', name), VX.ui.field('Base', kind), ...keys.map(([k, l]) => { const i = h('input', { type: 'color', value: String(t.colors[k]).slice(0, 7) }); i.oninput = () => { t.colors[k] = i.value; prev(); }; return VX.ui.field(l, i); }), h('p', { style: 'color:var(--muted);font-size:12px' }, 'Changes preview live across the whole app.'));
    let m; const done = (save) => { VX.theme.unregister('__draft'); VX.theme.apply(orig.id); if (save) VX.theme.apply(t.id); m.close(); };
    m = VX.ui.modal({ title: 'Theme designer', size: 'small', body, onClose: () => { VX.theme.unregister('__draft'); VX.theme.apply(VX.app.settings.theme); }, actions: [h('button', { class: 'btn', onclick: () => done(false) }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { t.id = (t.name || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 5); t.colors.accentFg = t.type === 'light' ? '#ffffff' : t.colors.accentFg || '#ffffff'; await window.native.ext.save('themes', t.id + '.json', JSON.stringify(t, null, 2)); await VX.theme.load(); VX.app.set('theme', t.id); done(true); SB.refresh(); } }, 'Save theme')] });
    prev();
  }
  SB.themeDesigner = themeDesigner;

  /* ---------- cloud (account / share / publish) ---------- */
  SB.views.cloud = { title: 'Account & Sharing', actions: () => [], render: (c) => VX.cloudUI.renderPanel(c) };
  VX.on('registry', () => { SB.renderActivity(); });
})();
