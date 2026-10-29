/* Vextra Studio – boot, command palette, quick open, status bar, bottom panel, shortcuts. */
(function () {
  const { h, $ } = VX;
  const S = VX.app.S, app = VX.app;

  /* ---------- bottom panel: Console / Problems / Output ---------- */
  const BP = (VX.bottom = { tab: 'console', logs: [], out: [] });
  BP.log = (level, text, src) => { BP.logs.push({ level, text, src, t: new Date() }); if (BP.logs.length > 800) BP.logs.shift(); if (BP.tab === 'console') BP.render(); };
  BP.output = (text) => { BP.out.push(text); if (BP.tab === 'output') BP.render(); };
  BP.clear = () => { BP.logs = []; BP.out = []; BP.render(); };
  BP.show = (tab) => { BP.tab = tab || BP.tab; $('#bottom').classList.remove('collapsed'); BP.render(); };
  BP.toggle = () => { $('#bottom').classList.toggle('collapsed'); BP.render(); };
  BP.render = () => {
    const tabs = $('#bp-tabs'), body = $('#bp-body'); if ($('#bottom').classList.contains('collapsed')) return;
    const probs = [...VX.tabs.problems.entries()].flatMap(([id, l]) => l.map((p) => ({ ...p, tab: id })));
    const defs = [['console', 'Console', BP.logs.length], ['problems', 'Problems', probs.length], ['output', 'Output', 0]];
    tabs.textContent = ''; for (const [id, l, n] of defs) tabs.append(h('button', { class: 'bp-tab' + (id !== 'console' ? ' adv' : '') + (BP.tab === id ? ' on' : ''), onclick: () => { BP.tab = id; BP.render(); } }, l, n ? h('span', { class: 'tag' }, n) : null));
    tabs.append(h('span', { class: 'spacer' }), h('button', { class: 'iconbtn', title: 'Clear', onclick: BP.clear }, VX.icon('trash', 14)), h('button', { class: 'iconbtn', title: 'Close panel', onclick: BP.toggle }, VX.icon('x', 14)));
    const stick = body.scrollTop + body.clientHeight >= body.scrollHeight - 30; body.textContent = '';
    if (BP.tab === 'console') { if (!BP.logs.length) body.append(h('div', { class: 'empty' }, 'Console output from live previews and games appears here.')); for (const l of BP.logs) body.append(h('div', { class: 'log ' + l.level }, h('small', {}, l.t.toLocaleTimeString()), l.src ? h('small', {}, '[' + l.src + ']') : null, l.text)); }
    else if (BP.tab === 'problems') { if (!probs.length) body.append(h('div', { class: 'empty' }, 'No problems detected in open files.')); for (const p of probs) { const t = VX.tabs.get(p.tab); body.append(h('div', { class: 'prob ' + p.type, onclick: () => { VX.tabs.activate(p.tab); setTimeout(() => VX.tabs.code().goto(p.row, p.col), 30); } }, VX.icon(p.type === 'error' ? 'x' : 'warn', 14), h('span', {}, p.text), h('small', {}, `${t ? t.title : ''}:${p.row}`))); } }
    else { for (const o of BP.out) body.append(h('div', { class: 'log' }, o)); if (!BP.out.length) body.append(h('div', { class: 'empty' }, 'Nothing here yet.')); }
    if (stick) body.scrollTop = body.scrollHeight;
  };
  VX.on('problems', () => BP.render());

  /* ---------- status bar ---------- */
  let cur = { l: 1, c: 1 };
  function renderStatus() {
    const l = $('#st-left'), r = $('#st-right'); l.textContent = ''; r.textContent = '';
    const item = (txt, fn, title, adv) => h('span', { class: 'sb-item' + (adv ? ' adv' : '') + (fn ? ' click' : ''), title: title || '', onclick: fn }, txt);
    l.append(item([VX.icon('folder', 12), S.root ? VX.path.base(S.root) : 'No folder'], () => app.openFolder(), 'Open folder'));
    const probs = [...VX.tabs.problems.values()].flat(); l.append(item(`⊘ ${probs.filter((p) => p.type === 'error').length}  ⚠ ${probs.filter((p) => p.type === 'warning').length}`, () => BP.show('problems'), 'Problems', true));
    for (const it of Forge.statusItems.values()) (it.align === 'right' ? r : l).append(item(it.text, it.onClick, it.tooltip));
    const t = VX.tabs.active(); if (t && t.kind === 'code') { r.append(item(`Ln ${cur.l}, Col ${cur.c}`), item(t.lang || 'text', null, '', true), item('Spaces: ' + app.settings.tabSize, null, '', true)); }
    const u = VX.cloud && VX.cloud.user; r.append(item([VX.icon('user', 12), u ? u.username : 'Sign in'], () => VX.sidebar.show('cloud'), 'Account'), item(app.settings.mode === 'simple' ? 'Simple mode' : 'Advanced mode', () => { const m = app.settings.mode === 'simple' ? 'advanced' : 'simple'; app.set('mode', m); document.body.dataset.mode = m; renderStatus(); }, 'Toggle simple / advanced mode'), item('v' + app.version));
  }
  VX.on('cursor', (l, c) => { cur = { l, c }; renderStatus(); }); VX.on('status', renderStatus); VX.on('tabChange', renderStatus); VX.on('registry', renderStatus); VX.on('root', renderStatus); VX.on('cloud', renderStatus);

  /* ---------- command palette & quick open ---------- */
  function commands() {
    const C = [];
    const add = (title, run, hint) => C.push({ title, run, hint });
    add('New web project…', () => app.newProject()); add('New UI design', () => app.newUI()); add('New 2D game', () => app.newGame('2d')); add('New 3D game', () => app.newGame('3d')); add('Open 2D demo game', () => app.newGame('2d', true)); add('Open 3D demo game (first person)', () => app.newGame('3d', true)); add('Open UI example', () => app.newUIExample()); add('New file…', () => VX.sidebar.newFile()); add('Export website (ZIP / tar.gz)…', () => VX.web.exportSite()); add('Open project database', () => VX.web.openDatabase()); add('Run PHP site (desktop app)', () => { const t = VX.tabs.active(); VX.web.openPhp(t && t.path ? t : null); });
    add('Open folder…', () => app.openFolder(), 'Ctrl+O'); add('Close workspace', () => app.closeWorkspace()); add('Clear recent list', () => app.clearRecent()); add('Save', () => VX.tabs.save(), 'Ctrl+S'); add('Save as…', () => VX.tabs.save(VX.tabs.active(), true), 'Ctrl+Shift+S'); add('Save all', () => VX.tabs.saveAll()); add('Close tab', () => S.active && VX.tabs.close(S.active), 'Ctrl+W');
    add('Quick open file…', () => quickOpen(), 'Ctrl+P'); add('Find in files', () => { VX.sidebar.show('search'); }, 'Ctrl+Shift+F'); add('Toggle sidebar', () => VX.sidebar.collapse(!$('#sidebar').classList.contains('collapsed')), 'Ctrl+B'); add('Toggle bottom panel', () => BP.toggle(), 'Ctrl+J');
    add('Show explorer', () => VX.sidebar.show('explorer')); add('Show create palette', () => VX.sidebar.show('create')); add('Show plugins', () => VX.sidebar.show('plugins')); add('Show themes', () => VX.sidebar.show('themes')); add('Account & sharing', () => VX.sidebar.show('cloud'));
    add('Documentation', () => VX.docs.open(), 'F1'); add('Docs: Block reference', () => VX.docs.open('blocks')); add('Docs: Plugin API', () => VX.docs.open('plugin-api')); add('Welcome page', () => app.showWelcome()); add('Settings', () => app.openSettings(), 'Ctrl+,');
    add('Preview current file', () => { const t = VX.tabs.active(); if (t) VX.web.openPreview(t); }, 'F5'); add('Design a theme…', () => VX.sidebar.themeDesigner()); add('Toggle simple / advanced mode', () => { const m = app.settings.mode === 'simple' ? 'advanced' : 'simple'; app.set('mode', m); document.body.dataset.mode = m; renderStatus(); });
    add('Publish to the web…', () => VX.cloudUI.publish()); add('Share / collaborate…', () => VX.cloudUI.share()); add('Sign in / account…', () => VX.sidebar.show('cloud'));
    for (const t of VX.theme.list()) add('Theme: ' + t.name, () => { app.set('theme', t.id); VX.theme.apply(t.id); });
    for (const c of Forge.commands.values()) add(c.title, c.run, c.hint);
    return C;
  }
  function palette(items, placeholder, onPick, render) {
    const input = h('input', { class: 'big', placeholder }); const list = h('div', { class: 'cmd-list' });
    const box = h('div', { class: 'modal' }, input, list); const rec = VX.ui.layer(box, { align: 'top' });
    let sel = 0, shown = [];
    const draw = () => {
      const q = input.value.toLowerCase().trim(); shown = items.filter((i) => !q || render(i).title.toLowerCase().includes(q) || q.split(/\s+/).every((w) => render(i).title.toLowerCase().includes(w))).slice(0, 80); sel = Math.min(sel, Math.max(0, shown.length - 1)); list.textContent = '';
      shown.forEach((i, n) => { const r = render(i); list.append(h('div', { class: 'cmd' + (n === sel ? ' sel' : ''), onmouseenter: () => { sel = n; list.querySelectorAll('.cmd').forEach((e, k) => e.classList.toggle('sel', k === n)); }, onclick: () => pick(i) }, h('span', {}, r.title), r.hint ? h('small', {}, r.hint) : null)); });
      if (!shown.length) list.append(h('div', { class: 'empty' }, 'No matches'));
    };
    const pick = (i) => { rec.close(); setTimeout(() => onPick(i), 0); };
    input.addEventListener('input', () => { sel = 0; draw(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter' && shown[sel]) pick(shown[sel]); });
    draw(); input.focus();
  }
  const openPalette = () => palette(commands(), 'Type a command…', (c) => { try { c.run(); } catch (e) { VX.ui.toast(e.message, 'error'); } }, (c) => c);
  async function quickOpen() { if (!S.root) return VX.ui.toast('Open a folder first', 'warn'); const files = await window.native.listFiles(S.root, 3000); palette(files.filter((f) => !/(^|\/)(node_modules|\.git|target)\//.test(f)), 'Go to file…', (f) => VX.tabs.open({ path: VX.path.join(S.root, f) }), (f) => ({ title: f })); }
  app.palette = openPalette; app.quickOpen = quickOpen;

  /* ---------- shortcuts ---------- */
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    const inGame = e.target.closest && e.target.closest('.vx-play'); if (inGame && !mod) return;
    if (mod && e.shiftKey && k === 'p') { e.preventDefault(); openPalette(); }
    else if (mod && !e.shiftKey && k === 'p') { e.preventDefault(); quickOpen(); }
    else if (mod && e.shiftKey && k === 's') { e.preventDefault(); VX.tabs.save(VX.tabs.active(), true); }
    else if (mod && k === 's') { e.preventDefault(); VX.tabs.save(); }
    else if (mod && k === 'w') { e.preventDefault(); S.active && VX.tabs.close(S.active); }
    else if (mod && k === 'b') { e.preventDefault(); VX.sidebar.collapse(!$('#sidebar').classList.contains('collapsed')); }
    else if (mod && k === 'j') { e.preventDefault(); BP.toggle(); }
    else if (mod && k === 'o') { e.preventDefault(); app.openFolder(); }
    else if (mod && k === ',') { e.preventDefault(); app.openSettings(); }
    else if (mod && e.shiftKey && k === 'f') { e.preventDefault(); VX.sidebar.show('search'); }
    else if (mod && e.shiftKey && k === 'e') { e.preventDefault(); VX.sidebar.show('explorer'); }
    else if (e.key === 'F1') { e.preventDefault(); VX.docs.open(); }
    else if (e.key === 'F5') { e.preventDefault(); const t = VX.tabs.active(); if (t && t.kind === 'game' && t.ctl) t.ctl.play(); else if (t) VX.web.openPreview(t); }
    else if (e.shiftKey && e.altKey && k === 'f') { const t = VX.tabs.active(); if (t && t.kind === 'code') VX.tabs.code().format(); }
  }, true);

  /* ---------- resizers ---------- */
  function drag(el, onMove) { el.addEventListener('mousedown', (e) => { e.preventDefault(); el.classList.add('drag'); const mv = (ev) => onMove(ev); const up = () => { el.classList.remove('drag'); removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); }); }

  /* ---------- host API for plugins ---------- */
  Object.assign(Forge.host, { get settings() { return app.settings; }, saveSettings: () => app.saveSettings(), applyTheme: (id) => { app.set('theme', id); VX.theme.apply(id); }, openDocs: (id) => VX.docs.open(id), account: () => (VX.cloud ? VX.cloud.user : null), root: () => S.root, setPluginSetting(pid, k, v) { (app.settings.plugins[pid] ||= {})[k] = v; app.saveSettings(); } });

  /* ---------- boot ---------- */
  async function boot() {
    await app.loadSettings(); document.body.dataset.mode = app.settings.mode;
    await VX.theme.load(); VX.theme.apply(app.settings.theme);
    $('#app').style.setProperty('--sidew', app.settings.sidebarWidth + 'px'); $('#app').style.setProperty('--bottomh', app.settings.bottomHeight + 'px');
    drag($('#side-resizer'), (e) => { const w = VX.clamp(e.clientX - 52, 180, 560); $('#app').style.setProperty('--sidew', w + 'px'); app.set('sidebarWidth', w); });
    drag($('#bottom-resizer'), (e) => { const w = VX.clamp(innerHeight - e.clientY - 24, 80, innerHeight * 0.7); $('#app').style.setProperty('--bottomh', w + 'px'); app.set('bottomHeight', w); });
    await Forge.plugins_.loadAll();
    VX.cloud && VX.cloud.init();
    VX.sidebar.show(app.settings.lastView && VX.sidebar.views[app.settings.lastView] ? app.settings.lastView : 'explorer'); renderStatus();
    if (window.native.onMenu) window.native.onMenu((id) => menu(id));
    if (!S.root) { try { const last = app.settings.autoOpen === false ? null : (app.settings.recent || []).find((r) => r.kind === 'folder'); if (last && window.native.isDesktop && (await window.native.exists(last.path))) await app.openRoot(last.path); } catch { /* ignore */ } }
    if (app.settings.welcome !== false) app.showWelcome();
    $('#splash').style.opacity = 0; setTimeout(() => $('#splash').remove(), 350);
    window.__vxReady = true;
  }
  function menu(id) {
    const m = { newFile: () => VX.sidebar.newFile(), newProject: () => app.newProject(), newUI: () => app.newUI(), newGame: () => app.newGame('2d'), openFile: async () => { const ps = await window.native.openFile(); for (const p of ps || []) await VX.tabs.open({ path: p }); }, openFolder: () => app.openFolder(), save: () => VX.tabs.save(), saveAs: () => VX.tabs.save(VX.tabs.active(), true), closeTab: () => S.active && VX.tabs.close(S.active), findInFiles: () => VX.sidebar.show('search'), palette: openPalette, quickOpen, toggleSidebar: () => VX.sidebar.collapse(!$('#sidebar').classList.contains('collapsed')), togglePanel: () => BP.toggle(), preview: () => { const t = VX.tabs.active(); if (t) VX.web.openPreview(t); }, account: () => VX.sidebar.show('cloud'), publish: () => VX.cloudUI.publish(), share: () => VX.cloudUI.share(), docs: () => VX.docs.open(), welcome: () => app.showWelcome(), openExtensions: () => VX.sidebar.show('plugins') }[id];
    m && m();
  }
  window.addEventListener('DOMContentLoaded', () => { boot().catch((e) => { console.error(e); document.body.append(h('pre', { style: 'position:fixed;inset:0;background:#200;color:#fcc;padding:20px;z-index:99999;white-space:pre-wrap' }, 'Vextra failed to start:\n' + (e.stack || e))); }); });
})();
