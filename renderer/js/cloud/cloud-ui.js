/* Vextra Studio – account, sharing and publishing UI (sidebar panel + dialogs). */
(function () {
  const { h } = VX;
  const S = VX.app.S;
  const U = (VX.cloudUI = {});
  const err = (e) => VX.ui.toast(e.message || String(e), 'error');
  const copy = (t) => { navigator.clipboard && navigator.clipboard.writeText(t); VX.ui.toast('Copied', 'ok'); };
  const openUrl = (u) => window.open(u, '_blank');

  U.testConnection = async () => { try { const r = await VX.cloud.request('GET', '/api/health', null, false); VX.ui.toast(`Connected to ${VX.cloud.base()} (v${r.version}${r.register ? '' : ', sign-ups closed'})`, 'ok'); } catch (e) { err(e); } };

  let authMode = 'login';
  U.renderPanel = function (c) {
    const C = VX.cloud;
    const redraw = () => { const body = document.getElementById('side-body'); if (body && c.isConnected) { body.textContent = ''; U.renderPanel(body); } };
    const stat = h('div', { class: 'tag ' + (C.status === 'online' ? 'ok' : C.status === 'offline' ? 'err' : '') , style: 'margin:6px 4px;display:inline-block' }, C.status === 'online' ? 'Server: ' + C.base() : C.status === 'offline' ? 'Server unreachable: ' + C.base() : 'Checking server…');
    c.append(stat, h('button', { class: 'btn sm ghost', title: 'Change server address', onclick: () => VX.app.openSettings() }, VX.icon('settings', 13)));
    if (C.status === 'offline') c.append(h('div', { class: 'card' }, h('p', {}, 'Start a Vextra server on this computer with ', h('code', {}, 'npm run server'), ' or set the address of one you have access to in Settings.'), h('button', { class: 'btn sm', onclick: async () => { await C.init(); redraw(); } }, 'Retry')));
    if (!C.user) {
      const user = h('input', { placeholder: 'Username', autocomplete: 'username' }), pass = h('input', { type: 'password', placeholder: 'Password (min 8 characters)', autocomplete: authMode === 'login' ? 'current-password' : 'new-password' }), disp = h('input', { placeholder: 'Display name (optional)' }), msg = h('div', { class: 'form-error hidden' });
      const go = async () => { msg.classList.add('hidden'); try { if (authMode === 'login') await C.login(user.value, pass.value); else await C.register(user.value, pass.value, disp.value || undefined); VX.ui.toast('Signed in as ' + C.user.username, 'ok'); redraw(); } catch (e) { msg.textContent = e.message; msg.classList.remove('hidden'); } };
      [user, pass, disp].forEach((i) => i.addEventListener('keydown', (e) => e.key === 'Enter' && go()));
      c.append(h('div', { class: 'card' }, h('h4', {}, authMode === 'login' ? 'Sign in' : 'Create your account'),
        VX.ui.segmented([['login', 'Sign in'], ['register', 'Create account']], authMode, (v) => { authMode = v; redraw(); }), h('div', { style: 'height:10px' }), user, h('div', { style: 'height:6px' }), pass, authMode === 'register' ? [h('div', { style: 'height:6px' }), disp] : null, msg, h('div', { style: 'height:8px' }), h('button', { class: 'btn primary block', onclick: go }, authMode === 'login' ? 'Sign in' : 'Create account')),
        h('div', { class: 'empty left', style: 'font-size:12px' }, 'An account lets you publish sites and games to a public link, collaborate on projects and keep cloud saves and leaderboards.'));
      return;
    }
    const u = C.user;
    c.append(h('div', { class: 'card' }, h('div', { style: 'display:flex;gap:12px;align-items:center' }, h('div', { class: 'avatar lg' }, u.username[0].toUpperCase()), h('div', { style: 'flex:1;min-width:0' }, h('b', {}, u.displayName), h('div', { style: 'color:var(--muted)' }, '@' + u.username))),
      h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn sm', onclick: () => account() }, 'Manage account'), h('button', { class: 'btn sm', onclick: async () => { await C.logout(); redraw(); } }, 'Sign out'))));

    /* publishing */
    c.append(h('div', { class: 'group-title' }, 'Published'));
    const sites = h('div', {}, h('div', { class: 'empty' }, 'Loading…')); c.append(sites);
    C.sites().then((list) => {
      sites.textContent = ''; if (!list.length) sites.append(h('div', { class: 'empty left', style: 'font-size:12px' }, 'Nothing published yet.'));
      for (const s of list) sites.append(h('div', { class: 'card' }, h('h4', {}, s.title, h('span', { class: 'tag acc' }, s.kind)), h('div', { class: 'url-box' }, h('input', { readonly: true, value: s.url }), h('button', { class: 'btn sm', title: 'Copy link', onclick: () => copy(s.url) }, VX.icon('link', 13)), h('button', { class: 'btn sm', title: 'Open', onclick: () => openUrl(s.url) }, VX.icon('globe', 13))),
        h('div', { class: 'row', style: 'margin-top:8px' }, h('small', { style: 'color:var(--muted)' }, new Date(s.updated).toLocaleString()), h('span', { class: 'spacer' }), h('button', { class: 'btn sm danger', onclick: async () => { if (await VX.ui.confirm(`Unpublish “${s.title}”? The link will stop working.`, 'Unpublish', { danger: true })) { try { await C.unpublish(s.slug); redraw(); } catch (e) { err(e); } } } }, 'Unpublish'))));
    }).catch((e) => { sites.textContent = ''; sites.append(h('div', { class: 'empty' }, e.message)); });
    c.append(h('button', { class: 'btn primary block', style: 'margin-top:8px', onclick: () => U.publish().then(redraw) }, VX.icon('globe', 14), 'Publish current project…'));

    /* collaboration */
    c.append(h('div', { class: 'group-title' }, 'Collaboration'));
    if (C.link) {
      const box = h('div', { class: 'card' }, h('h4', {}, C.link.name, h('span', { class: 'tag ok' }, C.role || 'synced')), h('p', {}, C.error ? '⚠ ' + C.error : C.lastSync ? 'Last synced ' + new Date(C.lastSync).toLocaleTimeString() : 'Syncing…'));
      box.append(h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => C.syncNow().then(redraw) }, VX.icon('refresh', 13), 'Sync now'), h('button', { class: 'btn sm', onclick: () => U.share() }, VX.icon('share', 13), 'Invite / members'), h('button', { class: 'btn sm danger', onclick: async () => { if (await VX.ui.confirm('Stop syncing this folder? Your files stay as they are.', 'Stop sharing')) { await C.unlink(); redraw(); } } }, 'Unlink')));
      if (C.online.length) box.append(h('div', { style: 'margin-top:8px;color:var(--muted);font-size:12px' }, 'Online now: ', C.online.map((o) => h('span', { class: 'tag ok', style: 'margin-right:4px' }, o.user + (o.file ? ' · ' + o.file.split('/').pop() : '')))));
      c.append(box);
    } else {
      c.append(h('div', { class: 'empty left', style: 'font-size:12px' }, 'Work on the same project with other people. Changes sync every few seconds.'), h('button', { class: 'btn block', style: 'margin:4px 0', disabled: !S.root, onclick: () => U.share() }, VX.icon('share', 14), S.root ? 'Share this project…' : 'Open a folder to share'), h('button', { class: 'btn block', style: 'margin:4px 0', onclick: () => U.join() }, VX.icon('plus', 14), 'Join with invite code…'));
    }
  };
  VX.on('cloud', () => { const sb = document.querySelector('#side-title'); if (sb && VX.sidebar.current === 'cloud') { const body = document.getElementById('side-body'); body.textContent = ''; U.renderPanel(body); } });

  async function account() {
    const C = VX.cloud, u = C.user; if (!u) return;
    const dn = h('input', { value: u.displayName });
    const body = h('div', {}, h('div', { style: 'display:flex;gap:14px;align-items:center;margin-bottom:14px' }, h('div', { class: 'avatar lg' }, u.username[0].toUpperCase()), h('div', {}, h('b', {}, '@' + u.username), h('div', { style: 'color:var(--muted)' }, 'Member since ' + new Date(u.created).toLocaleDateString()))),
      VX.ui.field('Display name', dn), h('div', { class: 'row', style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px' },
        h('button', { class: 'btn', onclick: async () => { try { await C.updateProfile(dn.value.trim() || u.username); VX.ui.toast('Profile updated', 'ok'); } catch (e) { err(e); } } }, 'Save profile'),
        h('button', { class: 'btn', onclick: async () => { const v = await VX.ui.form({ title: 'Change password', fields: [{ key: 'old', label: 'Current password', type: 'password', required: true }, { key: 'n1', label: 'New password', type: 'password', required: true, hint: 'At least 8 characters' }, { key: 'n2', label: 'Repeat new password', type: 'password', required: true }], validate: (x) => (x.n1 !== x.n2 ? 'The new passwords do not match' : x.n1.length < 8 ? 'Use at least 8 characters' : null), submit: 'Change password' }); if (!v) return; try { await C.changePassword(v.old, v.n1); VX.ui.toast('Password changed', 'ok'); } catch (e) { err(e); } } }, 'Change password…'),
        h('button', { class: 'btn', onclick: async () => { try { await C.logoutOthers(); VX.ui.toast('Signed out of all other devices', 'ok'); } catch (e) { err(e); } } }, 'Sign out other devices')),
      h('div', { class: 'group-title' }, 'Danger zone'), h('button', { class: 'btn danger', onclick: async () => { const v = await VX.ui.form({ title: 'Delete account', danger: true, submit: 'Delete my account', intro: 'This permanently deletes your account, your cloud projects, published sites and cloud saves. Local files on this computer are not affected.', fields: [{ key: 'pw', label: 'Enter your password to confirm', type: 'password', required: true }] }); if (!v) return; try { await C.deleteAccount(v.pw); VX.ui.toast('Account deleted', 'ok'); } catch (e) { err(e); } } }, VX.icon('trash', 14), 'Delete account…'));
    VX.ui.modal({ title: 'Your account', size: 'small', body });
  }

  /* ---------- publish ---------- */
  U.publish = async function () {
    const C = VX.cloud; if (!C.user) { VX.sidebar.show('cloud'); VX.ui.toast('Sign in first to publish', 'warn'); return; }
    const t = VX.tabs.active(); const isGame = t && t.kind === 'game' && t.ctl;
    if (!isGame && !S.root) return VX.ui.toast('Open a project folder (or a game) to publish', 'warn');
    const title0 = isGame ? t.ctl.project.settings.title : VX.path.base(S.root); const slug0 = (isGame ? t.ctl.project.settings.title : VX.path.base(S.root)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'my-site';
    const v = await VX.ui.form({ title: isGame ? 'Publish game' : 'Publish website', submit: 'Publish', intro: isGame ? 'Your game is exported as one HTML page and hosted at a public link.' : 'Every file in the project folder is uploaded and hosted at a public link. index.html is the home page.', fields: [{ key: 'title', label: 'Title', value: title0, required: true }, { key: 'slug', label: 'Address name', value: slug0, required: true, hint: `Your link will be ${C.base()}/p/${C.user.username}/<name>/` }], validate: (x) => (/^[a-z0-9][a-z0-9._-]{0,48}$/.test(x.slug) ? null : 'Address: lowercase letters, numbers, - _ . only') });
    if (!v) return;
    const note = VX.ui.toast('Publishing…'); try {
      let files, kind = 'site', gameId;
      if (isGame) { files = { 'index.html': await VX.gameExport.toHTML(t.ctl.project, { cloudUrl: C.base() }) }; kind = 'game'; gameId = t.ctl.project.settings.id; }
      else { if (t.dirty) await VX.tabs.saveAll(); files = await C.collect(S.root); if (!files['index.html']) { const html = Object.keys(files).find((f) => /\.html?$/i.test(f)); if (!html) throw new Error('No index.html found in this folder.'); } }
      const r = await C.publish(v.slug, { kind, title: v.title, files, gameId }); note.remove();
      VX.ui.modal({ title: '🎉 Published', size: 'small', body: h('div', {}, h('p', {}, 'Your ' + (isGame ? 'game' : 'site') + ' is live:'), h('div', { class: 'url-box' }, h('input', { readonly: true, value: r.url }), h('button', { class: 'btn', onclick: () => copy(r.url) }, 'Copy')), h('p', { style: 'color:var(--muted);font-size:12px' }, 'Anyone with this link can see it. Publish again to update it, or unpublish it from the cloud panel.')), actions: [h('button', { class: 'btn primary', onclick: () => openUrl(r.url) }, 'Open')] });
    } catch (e) { note.remove(); err(e); }
  };

  /* ---------- share / collaborate ---------- */
  U.share = async function () {
    const C = VX.cloud; if (!C.user) { VX.sidebar.show('cloud'); return VX.ui.toast('Sign in first', 'warn'); } if (!S.root) return VX.ui.toast('Open the project folder you want to share', 'warn');
    if (!C.link) { if (!(await VX.ui.confirm(`Upload “${VX.path.base(S.root)}” to ${C.base()} so others can join? Everything in the folder (except node_modules and build folders) is synced.`, 'Upload & share'))) return; try { await C.uploadProject(VX.path.base(S.root)); } catch (e) { return err(e); } }
    let proj; try { proj = (await C.request('GET', '/api/projects/' + C.link.id)).project; } catch (e) { return err(e); }
    const body = h('div', {});
    const draw = () => {
      body.textContent = ''; const owner = proj.role === 'owner';
      body.append(owner ? h('div', {}, h('div', { class: 'group-title' }, 'Invite code'), h('div', { class: 'url-box' }, h('input', { readonly: true, value: proj.invite, style: 'font-size:16px;letter-spacing:.12em' }), h('button', { class: 'btn', onclick: () => copy(proj.invite) }, 'Copy'), h('button', { class: 'btn', title: 'Invalidate the old code', onclick: async () => { proj = (await C.request('PATCH', '/api/projects/' + proj.id, { newInvite: true })).project; draw(); } }, 'New code')), h('p', { style: 'color:var(--muted);font-size:12px' }, 'Send this code to a friend. In their Vextra: cloud panel → Join with invite code. They become an editor.')) : h('p', {}, 'You are an ' + proj.role + ' of this project.'));
      body.append(h('div', { class: 'group-title' }, 'Members'));
      const list = h('div', { class: 'members' });
      for (const m of proj.members) list.append(h('div', { class: 'tree-row' }, h('div', { class: 'avatar', style: 'width:24px;height:24px;font-size:12px' }, m.username[0].toUpperCase()), h('span', { class: 'name' }, m.username), m.role === 'owner' || !owner ? h('span', { class: 'tag' }, m.role) : [(() => { const s = h('select', {}, h('option', { value: 'editor' }, 'Editor'), h('option', { value: 'viewer' }, 'Viewer')); s.value = m.role; s.onchange = async () => { proj = (await C.request('POST', `/api/projects/${proj.id}/members`, { username: m.username, role: s.value })).project; draw(); }; return s; })(), h('button', { class: 'iconbtn', title: 'Remove', onclick: async () => { proj = (await C.request('DELETE', `/api/projects/${proj.id}/members`, { username: m.username })).project; draw(); } }, VX.icon('x', 13))]));
      body.append(list);
      if (owner) { const un = h('input', { placeholder: 'username' }); body.append(h('div', { class: 'url-box', style: 'margin-top:8px' }, un, h('button', { class: 'btn', onclick: async () => { try { proj = (await C.request('POST', `/api/projects/${proj.id}/members`, { username: un.value.trim(), role: 'editor' })).project; draw(); } catch (e) { err(e); } } }, 'Add editor'))); }
    };
    draw(); VX.ui.modal({ title: 'Share “' + proj.name + '”', body });
  };
  U.join = async function () {
    const C = VX.cloud; if (!C.user) { VX.sidebar.show('cloud'); return VX.ui.toast('Sign in first', 'warn'); }
    const v = await VX.ui.form({ title: 'Join a project', fields: [{ key: 'code', label: 'Invite code', required: true, placeholder: 'ABCDE12345' }], submit: 'Join' }); if (!v) return;
    let parent = window.native.isDesktop ? await window.native.openFolder() : '/projects'; if (!parent) return;
    try { const p = await C.joinProject(v.code, parent); VX.ui.toast('Joined ' + p.name + ' – downloading files…', 'ok'); C.startSync(); } catch (e) { err(e); }
  };
})();
