/* Vextra Studio – welcome page, settings, project creation and other app-level actions. */
(function () {
  const { h, $ } = VX;
  const S = VX.app.S;
  const app = VX.app;

  /* ---------- project / folder actions ---------- */
  app.openFolder = async function () {
    try { const p = await window.native.openFolder(); if (!p) return; await app.openRoot(p); } catch (e) { VX.ui.toast('Could not open folder: ' + e.message, 'error'); }
  };
  app.openRoot = async function (p) { app.settings.autoOpen = true; app.setRoot(p); app.addRecent(p, VX.path.base(p), 'folder'); VX.sidebar.show('explorer'); VX.emit('status'); };
  app.newProject = async function (preselect) {
    const T = VX.templates.list(); let chosen = preselect || T[0].id;
    const name = h('input', { value: 'my-project', placeholder: 'project-name' });
    const grid = h('div', { class: 'tiles', style: 'grid-template-columns:repeat(auto-fill,minmax(180px,1fr));margin:10px 0' });
    const draw = () => { grid.textContent = ''; for (const t of T) grid.append(h('div', { class: 'tile', style: chosen === t.id ? 'border-color:var(--accent);background:var(--sel)' : '', onclick: () => { chosen = t.id; draw(); } }, h('div', { class: 'ti' }, VX.icon(t.icon)), h('b', {}, t.name), h('span', { class: 'd' }, t.desc))); };
    draw();
    const body = h('div', {}, VX.ui.field('Name', name), h('div', { class: 'group-title' }, 'Template'), grid, h('p', { style: 'color:var(--muted);font-size:12px' }, window.native.isDesktop ? 'You will be asked where to create the project folder.' : 'Browser mode: the project is stored in this browser.'));
    let m; const go = async () => {
      const nm = name.value.trim().replace(/[^\w.-]+/g, '-'); if (!nm) return name.focus(); const tpl = VX.templates.get(chosen);
      let parent = S.root && !window.native.isDesktop ? VX.path.dir(S.root) : null;
      if (window.native.isDesktop) { parent = await window.native.openFolder(); if (!parent) return; } else parent = '/projects';
      const dir = VX.path.join(parent, nm);
      try { if (await window.native.exists(dir)) { if (!(await VX.ui.confirm(`${nm} already exists in that folder. Add the template files to it anyway?`, 'Continue'))) return; } const files = tpl.files(nm); for (const [rel, content] of Object.entries(files)) await window.native.writeFile(VX.path.join(dir, rel), typeof content === 'string' ? content : JSON.stringify(content, null, 2)); m.close(); await VX.tabs.closeAll(); await app.openRoot(dir); if (tpl.open) for (const f of [].concat(tpl.open)) await VX.tabs.open({ path: VX.path.join(dir, f) }); VX.ui.toast('Project created', 'ok'); } catch (e) { VX.ui.toast('Could not create project: ' + e.message, 'error'); }
    };
    m = VX.ui.modal({ title: 'New project', wide: false, body, actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: go }, 'Create project')] });
    name.focus(); name.select();
  };
  app.newUIExample = async function () { const t = await VX.tabs.open({ kind: 'ui', key: VX.uid('ui'), title: 'example.vxui', text: VX.Designer.example().serialize(), startDirty: true }); t && VX.sidebar.show('create'); };
  app.newUI = async function () { const t = await VX.tabs.open({ kind: 'ui', key: VX.uid('ui'), title: 'untitled.vxui', text: VX.Designer.blank().serialize(), startDirty: true }); t && VX.sidebar.show('create'); };
  app.newGame = async function (dim, example) {
    const proj = VX.GameProject.blank({ name: (example ? 'Demo ' : 'My ') + (dim === '3d' ? '3D game' : '2D game'), dim, sample: !!example });
    const t = await VX.tabs.open({ kind: 'game', key: VX.uid('game'), title: 'untitled.vxgame', text: JSON.stringify(proj, null, 2), startDirty: true }); t && VX.sidebar.show('create');
  };
  app.openSettings = () => VX.tabs.open({ kind: 'page', key: 'page:settings', title: 'Settings', icon: 'settings', render: renderSettings });
  app.showWelcome = () => VX.tabs.open({ kind: 'page', key: 'page:welcome', title: 'Welcome', icon: 'game', render: renderWelcome });

  /* ---------- welcome ---------- */
  function renderWelcome(c) {
    if (!c._vxRecent) { c._vxRecent = true; VX.on('recent', () => { if (c.isConnected) redraw(); }); }
    const redraw = () => { const p = c.querySelector('.page.welcome'); if (p) p.remove(); renderWelcome(c); };
    const recent = VX.app.settings.recent || []; const acct = VX.cloud && VX.cloud.user;
    const tile = (icon, title, desc, fn) => h('div', { class: 'tile', onclick: fn }, h('div', { class: 'ti' }, VX.icon(icon)), h('b', {}, title), h('span', { class: 'd' }, desc));
    c.append(h('div', { class: 'page welcome' },
      h('h1', {}, h('img', { src: 'icon.png', alt: '' }), h('span', {}, 'Vextra'), ' Studio'),
      h('p', { class: 'lead' }, 'Build websites and make games — 2D or 3D — in one workspace. Design visually, wire up block logic or write code, then share a link with the world.'),
      h('div', { class: 'tiles' },
        tile('game', 'New 2D game', 'Sprites, physics, block coding', () => app.newGame('2d')), tile('cube', 'New 3D game', 'Primitives, voxels, shaders, cameras', () => app.newGame('3d')),
        tile('blocks', 'UI designer', 'Drag components onto a canvas', () => app.newUI()), tile('globe', 'Web project', 'Templates, live preview, devices', () => app.newProject()),
        tile('folder', 'Open folder', 'Work on an existing project', () => app.openFolder()), tile('docs', 'Documentation', 'Guides, block reference, plugins', () => VX.docs.open()),
        tile('cloud', acct ? 'Signed in as ' + acct.username : 'Account', acct ? 'Share, collaborate & publish' : 'Create an account to publish & collaborate', () => VX.sidebar.show('cloud')), tile('plugin', 'Plugins', 'Extend the editor, add blocks & objects', () => VX.sidebar.show('plugins'))),
      recent.length ? h('div', {}, h('h2', {}, 'Recent ', h('button', { class: 'btn', style: 'font-size:11px;margin-left:8px', title: 'Remove every item from the recent list (files on disk are not touched)', onclick: () => { app.clearRecent(); redraw(); } }, 'Clear all')), h('div', { class: 'recent' }, recent.map((r) => h('div', { class: 'tree-row', onclick: () => (r.kind === 'folder' ? app.openRoot(r.path) : VX.tabs.open({ path: r.path })) }, VX.icon(r.kind === 'folder' ? 'folder' : 'file'), h('span', { class: 'name' }, r.name), h('small', { style: 'color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis' }, r.path), h('button', { class: 'icon-btn', title: 'Remove from recent', 'aria-label': 'Remove from recent', style: 'margin-left:auto', onclick: (ev) => { ev.stopPropagation(); app.removeRecent(r.path); redraw(); } }, '✕'))))) : null,
      h('h2', {}, 'Handy shortcuts'),
      h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px 24px;color:var(--muted)' }, [['Command palette', 'Ctrl+Shift+P'], ['Quick open file', 'Ctrl+P'], ['Save', 'Ctrl+S'], ['Find in files', 'Ctrl+Shift+F'], ['Play game / preview', 'F5'], ['Toggle sidebar', 'Ctrl+B'], ['Bottom panel', 'Ctrl+J'], ['Documentation', 'F1']].map(([a, b]) => h('div', { style: 'display:flex;justify-content:space-between' }, a, h('span', { class: 'kbd' }, b)))),
      h('div', { style: 'margin-top:22px' }, h('label', { style: 'display:flex;gap:8px;align-items:center;color:var(--muted)' }, (() => { const i = h('input', { type: 'checkbox' }); i.checked = VX.app.settings.welcome !== false; i.onchange = () => app.set('welcome', i.checked); return i; })(), 'Show this page on start'))));
  }

  /* ---------- settings ---------- */
  function renderSettings(c) {
    const s = VX.app.settings;
    const row = (title, desc, ctl) => h('div', { class: 'srow' }, h('div', { class: 'l' }, h('b', {}, title), desc ? h('span', {}, desc) : null), ctl);
    const num = (k, min, max) => { const i = h('input', { type: 'number', value: s[k], min, max }); i.onchange = () => app.set(k, VX.clamp(parseFloat(i.value) || s[k], min, max)); return i; };
    const txt = (k, ph) => { const i = h('input', { value: s[k] || '', placeholder: ph || '' }); i.onchange = () => app.set(k, i.value.trim()); return i; };
    const themeSel = h('select', {}, VX.theme.list().map((t) => h('option', { value: t.id }, t.name))); themeSel.value = s.theme; themeSel.onchange = () => { app.set('theme', themeSel.value); VX.theme.apply(themeSel.value); };
    const info = h('div', { style: 'color:var(--muted);font-size:12px;line-height:1.7' }, 'Loading…');
    window.native.info().then((i) => { info.innerHTML = `<b>${VX.esc(i.name)}</b> ${VX.esc(i.version)} · ${VX.esc(i.platform)}/${VX.esc(i.arch)}<br>Your data lives in <code>${VX.esc(i.userDir)}</code>`; });
    const clean = (what, label) => h('button', { class: 'btn sm danger', onclick: async () => { if (!(await VX.ui.confirm(`Delete ${label}? This cannot be undone.`, 'Delete', { danger: true }))) return; try { const r = await window.native.clean(what); VX.ui.toast(`Removed: ${r.length ? r.map((x) => VX.path.base(x)).join(', ') : 'nothing to remove'}`, 'ok'); if (what.includes('all') || what.includes('settings')) setTimeout(() => location.reload(), 900); else { await Forge.plugins_.loadAll(); await VX.theme.load(); VX.sidebar.refresh(); } } catch (e) { VX.ui.toast(e.message, 'error'); } } }, label);
    c.append(h('div', { class: 'page', style: 'max-width:760px' },
      h('h1', { style: 'margin:0 0 18px' }, 'Settings'),
      h('div', { class: 'settings-sec' }, h('h3', {}, 'Interface'),
        row('Mode', 'Simple hides advanced tools (code views, problems, raw JSON). Advanced shows everything.', VX.ui.segmented([['simple', 'Simple'], ['advanced', 'Advanced']], s.mode, (v) => { app.set('mode', v); document.body.dataset.mode = v; })),
        row('Theme', '', themeSel),
        row('Check for updates', 'Reads the VERSION file of the Vextra Studio GitHub repository on start-up (one small request, nothing is sent about you).', h('div', { style: 'display:flex;gap:8px;align-items:center' }, h('button', { class: 'btn sm', onclick: () => VX.update.check({}).then(() => VX.update.dialog()) }, 'Check now'), VX.ui.sw(s.updateCheck !== false, (v) => app.set('updateCheck', v))))),
      h('div', { class: 'settings-sec' }, h('h3', {}, 'Code editor'),
        row('Font size', '', num('fontSize', 9, 28)), row('Tab size', '', num('tabSize', 1, 8)), row('Font family', 'Leave empty for the default monospace stack', txt('fontFamily', 'JetBrains Mono')),
        row('Word wrap', '', VX.ui.sw(s.wrap, (v) => app.set('wrap', v))), row('Auto-save', 'Save a second after you stop typing', VX.ui.sw(s.autosave, (v) => app.set('autosave', v))), row('Format on save', 'Beautify HTML, CSS, JS and JSON when saving', VX.ui.sw(s.formatOnSave, (v) => app.set('formatOnSave', v))),
        row('Live preview delay', 'Milliseconds to wait before refreshing the preview while typing', num('previewDelay', 100, 3000))),
      h('div', { class: 'settings-sec' }, h('h3', {}, 'Cloud, sharing & publishing'),
        row('Server address', 'The Vextra server used for accounts, collaboration and publishing. Run your own with “npm run server”.', (() => { const i = txt('serverUrl', 'http://localhost:8787'); i.addEventListener('change', () => VX.cloud && VX.cloud.configure()); return i; })()),
        row('Connection', '', h('button', { class: 'btn sm', onclick: () => VX.cloudUI.testConnection() }, 'Test connection'))),
      h('div', { class: 'settings-sec' }, h('h3', {}, 'About & maintenance'), info,
        h('div', { class: 'srow' }, h('div', { class: 'l' }, h('b', {}, 'Clean up app data'), h('span', {}, 'Removes data Vextra stored on this computer. Your projects are never touched.')), h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end' }, clean(['plugins'], 'my plugins'), clean(['themes'], 'my themes'), clean(['secrets'], 'sign-in data'), clean(['all'], 'everything'))),
        h('div', { class: 'srow' }, h('div', { class: 'l' }, h('b', {}, 'Uninstall'), h('span', {}, 'From the project folder run npm run uninstall (interactive) or npm run uninstall:auto. See Docs → Uninstalling.')), h('button', { class: 'btn sm', onclick: () => VX.docs.open('uninstall') }, 'Instructions')))));
  }
  VX.on('theme', () => { const t = VX.tabs.get('x'); void t; });
})();
