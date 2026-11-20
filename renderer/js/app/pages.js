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
        tile('library', 'Library', 'Install templates & games, or add your own from a link', () => VX.sidebar.show('library')), tile('cloud', acct ? 'Signed in as ' + acct.username : 'Account', acct ? 'Share, collaborate & publish' : 'Create an account to publish & collaborate', () => VX.sidebar.show('cloud')), tile('plugin', 'Plugins', 'Extend the editor, add blocks & objects', () => VX.sidebar.show('plugins'))),
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
    const modeSeg = VX.ui.segmented([['simple', 'Simple'], ['advanced', 'Advanced']], s.mode, (v) => { app.set('mode', v); document.body.dataset.mode = v; }); const syncMode = (m) => { if (modeSeg.isConnected) modeSeg.set(m); else offMode(); }; const offMode = VX.on('modeChanged', syncMode);
    const info = h('div', { style: 'color:var(--muted);font-size:12px;line-height:1.7' }, 'Loading…');
    window.native.info().then((i) => { info.innerHTML = `<b>${VX.esc(i.name)}</b> ${VX.esc(i.version)} · ${VX.esc(i.platform)}/${VX.esc(i.arch)}<br>Your data lives in <code>${VX.esc(i.userDir)}</code>`; });
    const clean = (what, label) => h('button', { class: 'btn sm danger', onclick: async () => { if (!(await VX.ui.confirm(`Delete ${label}? This cannot be undone.`, 'Delete', { danger: true }))) return; try { const r = await window.native.clean(what); VX.ui.toast(`Removed: ${r.length ? r.map((x) => VX.path.base(x)).join(', ') : 'nothing to remove'}`, 'ok'); if (what.includes('all') || what.includes('settings')) setTimeout(() => location.reload(), 900); else { await VXHost.plugins_.loadAll(); await VX.theme.load(); VX.sidebar.refresh(); } } catch (e) { VX.ui.toast(e.message, 'error'); } } }, label);
    c.append(h('div', { class: 'page', style: 'max-width:760px' },
      h('h1', { style: 'margin:0 0 18px' }, 'Settings'),
      h('div', { class: 'settings-sec' }, h('h3', {}, 'Interface'),
        row('Mode', 'Simple hides advanced tools (code views, problems, raw JSON). Advanced shows everything.', modeSeg),
        row('Theme', '', themeSel),
        row('Language', 'Interface language. “Automatic” follows your system. Text without a translation stays in English.', (() => { const sel = h('select', {}, h('option', { value: 'auto' }, 'Automatic'), VX.i18n.list().map((l) => h('option', { value: l.code, 'data-no-i18n': '' }, l.name))); sel.value = s.language || 'auto'; sel.onchange = () => { app.set('language', sel.value); VX.i18n.set(sel.value); }; return sel; })()),
        row('Check for updates', 'Asks the Vextra Studio GitHub releases whether a newer, signed version exists (on start-up; one small request, nothing is sent about you). The desktop app can then install it for you.', h('div', { style: 'display:flex;gap:8px;align-items:center' }, h('button', { class: 'btn sm', onclick: () => VX.update.check({}).then(() => VX.update.dialog()) }, 'Check now'), VX.ui.sw(s.updateCheck !== false, (v) => app.set('updateCheck', v))))),
      h('div', { class: 'settings-sec' }, h('h3', {}, 'Accessibility'),
        row('Reduce motion', 'Turns off animations and transitions, and tones down screen shake in games you play here. “System” follows your operating system setting.', (() => { const sel = h('select', {}, [['system', 'System'], ['reduce', 'Always reduce'], ['full', 'Never reduce']].map(([v, t]) => h('option', { value: v }, t))); sel.value = s.motion || 'system'; sel.onchange = () => app.set('motion', sel.value); return sel; })()),
        row('Interface zoom (%)', 'Makes the whole interface larger or smaller (70–200).', num('uiZoom', 70, 200)),
        row('Extra-thick focus outline', 'A larger outline around the control you are on with the keyboard.', VX.ui.sw(!!s.bigFocus, (v) => app.set('bigFocus', v))),
        row('High-contrast theme', 'Pick “High Contrast Dark” or “High Contrast Light” in Theme above. Press Ctrl+Shift+P → “Theme:” to switch quickly.', h('button', { class: 'btn sm', onclick: () => { const id = VX.theme.get(s.theme) && VX.theme.get(s.theme).type === 'light' ? 'vextra-high-contrast-light' : 'vextra-high-contrast-dark'; if (VX.theme.get(id)) { app.set('theme', id); VX.theme.apply(id); themeSel.value = id; } } }, 'Use high contrast'))),
      h('div', { class: 'settings-sec' }, h('h3', {}, 'Code editor'),
        row('Font size', '', num('fontSize', 9, 28)), row('Tab size', '', num('tabSize', 1, 8)), row('Font family', 'Leave empty for the default monospace stack', txt('fontFamily', 'JetBrains Mono')),
        row('Word wrap', '', VX.ui.sw(s.wrap, (v) => app.set('wrap', v))), row('Suggest while typing', 'Off by default: variable and word suggestions only open when you press Ctrl+Space', VX.ui.sw(!!s.liveSuggest, (v) => app.set('liveSuggest', v))), row('Auto-save', 'Save a second after you stop typing', VX.ui.sw(s.autosave, (v) => app.set('autosave', v))), row('Format on save', 'Beautify HTML, CSS, JS and JSON when saving', VX.ui.sw(s.formatOnSave, (v) => app.set('formatOnSave', v))),
        row('Live preview delay', 'Milliseconds to wait before refreshing the preview while typing', num('previewDelay', 100, 3000))),
      h('div', { class: 'settings-sec' }, h('h3', {}, 'Voice commands (games)'),
        row('How to listen', 'Automatic uses the engine\'s own speech recognition and falls back to your local model, then your cloud service, when the engine has none (the desktop app\'s engine usually has none – it reports "network" even when you are online). A Voice Command block can override this.', (() => { const x = h('select', { onchange: (e) => app.set('speechMode', e.target.value) }, [['auto', 'Automatic'], ['browser', 'Engine only'], ['local', 'Local model only'], ['cloud', 'Cloud service only']].map(([v, l]) => h('option', { value: v, selected: ((VX.app.settings.speechMode === 'service' ? 'cloud' : VX.app.settings.speechMode) || 'auto') === v }, l))); return x; })()),
        ...(() => {
          const PRE = {
            local: [['whispercpp', 'whisper.cpp server', 'http://localhost:8080/inference', ''], ['speaches', 'Speaches / faster-whisper-server', 'http://localhost:8000/v1/audio/transcriptions', 'Systran/faster-whisper-small'], ['localai', 'LocalAI', 'http://localhost:8080/v1/audio/transcriptions', 'whisper-1'], ['lmstudio', 'LM Studio / other OpenAI-style server', 'http://localhost:1234/v1/audio/transcriptions', 'whisper-1'], ['custom', 'Custom (localhost)', '', '']],
            cloud: [['openai', 'OpenAI (Whisper)', 'https://api.openai.com/v1/audio/transcriptions', 'whisper-1'], ['groq', 'Groq (Whisper)', 'https://api.groq.com/openai/v1/audio/transcriptions', 'whisper-large-v3-turbo'], ['mistral', 'Mistral (Voxtral)', 'https://api.mistral.ai/v1/audio/transcriptions', 'voxtral-mini-latest'], ['custom', 'Custom (https)', '', '']]
          };
          const sec = (kind) => {
            const pk = kind === 'local' ? 'speechLocalProvider' : 'speechCloudProvider', uk = kind === 'local' ? 'speechLocalUrl' : 'speechCloudUrl', mk = kind === 'local' ? 'speechLocalModel' : 'speechCloudModel', kk = 'speechCloudKey';
            const url = txt(uk, PRE[kind][0][2]), model = txt(mk, PRE[kind][0][3] || 'model name'); if (kind === 'cloud' && !s.speechCloudUrl && s.speechUrl) url.value = s.speechUrl; if (kind === 'cloud' && !s.speechCloudModel && s.speechModel) model.value = s.speechModel;
            const prov = h('select', { onchange: (e) => { const p = PRE[kind].find((x) => x[0] === e.target.value); app.set(pk, e.target.value); if (p && p[2]) { url.value = p[2]; app.set(uk, p[2]); model.value = p[3]; app.set(mk, p[3]); } } }, PRE[kind].map(([v, l]) => h('option', { value: v, selected: (s[pk] || PRE[kind][0][0]) === v }, l)));
            const status = h('span', { class: 'mini' }, '');
            const test = h('button', { class: 'btn sm', onclick: async () => { status.textContent = 'Checking…'; try { const u = new URL(url.value.trim()); if (kind === 'local' && !/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(u.hostname)) throw new Error('a local model must be on this computer (localhost)'); if (kind === 'cloud' && u.protocol !== 'https:' && !/^(localhost|127\.)/.test(u.hostname)) throw new Error('use an https:// address'); const r = await fetch(u.origin + '/', { mode: 'no-cors' }); status.textContent = '✓ the server answered'; } catch (e) { status.textContent = '✗ ' + (e.message || 'not reachable') + (kind === 'local' ? ' – is the server running?' : ''); } } }, 'Test');
            const out = [row(kind === 'local' ? 'Local model' : 'Cloud service', kind === 'local' ? 'A speech-to-text server running on this computer (whisper.cpp, Speaches, LocalAI, LM Studio…). Your voice never leaves the computer. The address must be localhost and the server must allow browser requests (CORS).' : 'A hosted speech-to-text service. Your voice is sent to it (over https) only while a Voice Command block is listening.', prov), row('Address', '', url), row('Model', kind === 'local' ? 'The model the server should use (empty if it has only one)' : 'For example whisper-1', model)];
            if (kind === 'cloud') out.push(row('Service key', 'Stored on this computer only, sent only to the address above.', (() => { const i = txt(kk, 'sk-…'); i.type = 'password'; i.autocomplete = 'off'; return i; })()));
            out.push(row('Check', '', h('div', { style: 'display:flex;gap:8px;align-items:center' }, test, status))); return out;
          };
          return [...sec('local'), ...sec('cloud')];
        })()),
      h('div', { class: 'settings-sec' }, h('h3', {}, 'Cloud, sharing & publishing'),
        row('Server address', 'The Vextra server used for accounts, collaboration and publishing. Run your own with “npm run server”.', (() => { const i = txt('serverUrl', 'http://localhost:8787'); i.addEventListener('change', () => VX.cloud && VX.cloud.configure()); return i; })()),
        row('Local server', 'Start or stop the Vextra server that comes with the desktop app (no terminal needed).', h('div', { style: 'display:flex;gap:6px' }, h('button', { class: 'btn sm', onclick: async () => { try { await VX.cloud.startLocalServer(); } catch (e) { VX.ui.toast(e.message, 'error'); } } }, 'Start'), h('button', { class: 'btn sm', onclick: async () => { try { await VX.cloud.stopLocalServer(); VX.ui.toast('Local server stopped', 'ok'); } catch (e) { VX.ui.toast(e.message, 'error'); } } }, 'Stop'))),
        row('Auto-start local server', 'Start it when Vextra opens, if the server address is this computer and nothing is running.', VX.ui.sw(!!VX.app.settings.autoServer, (v) => { VX.app.set('autoServer', v); })),
        row('Connection', '', h('button', { class: 'btn sm', onclick: () => VX.cloudUI.testConnection() }, 'Test connection'))),
      VX.hostUI.section(),
      h('div', { class: 'settings-sec' }, h('h3', {}, 'About & maintenance'), info,
        h('div', { class: 'srow' }, h('div', { class: 'l' }, h('b', {}, 'Uninstall Vextra'), h('span', {}, 'Windows: Settings → Apps → Vextra Studio → Uninstall (the .exe uninstaller has a “delete application data” box; the .msi asks the same question – or run msiexec /x Vextra.msi REMOVEUSERDATA=1). macOS: drag Vextra Studio to the Bin. Linux: apt remove vextra-studio (or delete the AppImage). This button deletes everything Vextra keeps – settings, sign-in data, plugins, themes, local server data and this app\'s own browser storage – so nothing is left behind. Your project folders are never touched.')), h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end' }, h('button', { class: 'btn sm danger', onclick: async () => {
          if (!(await VX.ui.confirm('Delete ALL data Vextra Studio keeps on this computer and get ready to uninstall? This cannot be undone. Project folders you opened from your disk are not touched.', 'Delete everything', { danger: true }))) return;
          const left = [];
          try {
            const i = await window.native.info();
            try { await window.native.server.stop(); } catch (e) { /* not running */ }
            await window.native.clean(['all']);
            if (i.platform !== 'browser' && i.userDir) { try { await window.native.fs.remove(VX.path.join(i.userDir, 'server-data')); } catch (e) { /* none */ } }
            try { localStorage.clear(); sessionStorage.clear(); } catch (e) { left.push('browser storage'); }
            try { if (indexedDB.databases) for (const d of await indexedDB.databases()) if (d.name) indexedDB.deleteDatabase(d.name); } catch (e) { left.push('databases'); }
            try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) { /* none */ }
          } catch (e) { VX.ui.toast(e.message, 'error'); return; }
          document.body.textContent = ''; document.body.style.cssText = 'font:15px/1.6 system-ui,sans-serif;padding:48px;max-width:640px;margin:auto;color:#ddd;background:#14161b';
          document.body.append(h('h2', {}, 'Vextra Studio is ready to uninstall'), h('p', {}, 'All app data was deleted' + (left.length ? ' (could not clear: ' + left.join(', ') + ')' : '') + '. Close this window, then uninstall the app from your system. If you reopen it, it starts fresh.'));
        } }, 'Delete everything & prepare to uninstall'))),
        h('div', { class: 'srow' }, h('div', { class: 'l' }, h('b', {}, 'Clean up app data'), h('span', {}, 'Removes data Vextra stored on this computer. Your projects are never touched.')), h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end' }, clean(['plugins'], 'my plugins'), clean(['themes'], 'my themes'), clean(['secrets'], 'sign-in data'), clean(['all'], 'everything'))),
        h('div', { class: 'srow' }, h('div', { class: 'l' }, h('b', {}, 'Uninstall'), h('span', {}, 'From the project folder run npm run uninstall (interactive) or npm run uninstall:auto. See Docs → Uninstalling.')), h('button', { class: 'btn sm', onclick: () => VX.docs.open('uninstall') }, 'Instructions')))));
  }
  VX.on('theme', () => { const t = VX.tabs.get('x'); void t; });
})();
