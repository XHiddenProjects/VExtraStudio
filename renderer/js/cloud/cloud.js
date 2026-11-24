/* Vextra Studio – cloud client: accounts, project sync (collaboration) and publishing against a Vextra server. */
(function () {
  const S = VX.app.S;
  const BIN = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'mp3', 'wav', 'ogg', 'm4a', 'flac', 'woff', 'woff2', 'ttf', 'otf', 'pdf', 'mp4', 'webm', 'zip', 'wasm', 'bin']);
  const SKIP = /(^|\/)(node_modules|\.git|target|\.vextra|\.DS_Store)(\/|$)/;
  const hashStr = (s) => { let h1 = 5381, h2 = 52711; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c; } return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length; };

  const C = (VX.cloud = {
    user: null, token: null, status: 'unknown', link: null, online: [], syncing: false, lastSync: 0, error: null,
    base() { return (VX.app.settings.serverUrl || 'http://localhost:8787').replace(/\/+$/, ''); },
    /** true when the configured server address is this computer */
    isLocal() { try { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(C.base()).hostname); } catch { return false; } },
    localPort() { try { return +new URL(C.base()).port || 8787; } catch { return 8787; } },
    /** Starts the Vextra server bundled with the desktop app (no terminal needed). */
    async startLocalServer(quiet) {
      if (!window.__TAURI__) throw new Error('Starting the server from here needs the desktop app. In a browser run: npm run server');
      const r = await window.native.server.start(C.localPort()); C._autoTried = true; await C.init(); if (!quiet) VX.ui.toast(r.mode === 'external' ? 'A server was already running – connected' : 'Local server started', 'ok'); return r;
    },
    /** Starts the bundled local server when something needs it and it is not running (on by default; Settings → Local server). */
    async ensureLocal() {
      if (!window.__TAURI__ || !C.isLocal() || VX.app.settings.autoServerOnDemand === false) return false;
      if (C._ensuring) return C._ensuring;
      C._ensuring = (async () => { try { await window.native.server.start(C.localPort()); C.status = 'online'; return true; } catch { return false; } finally { setTimeout(() => { C._ensuring = null; }, 4000); } })();
      return C._ensuring;
    },
    /** The version the server on this address reports (null = unreachable, '' = too old to say). */
    minPassword: 8,
    /** the server's own rules (password minimum), so forms can show them before anything is sent */
    async health() { try { const h = await C.request('GET', '/api/health', null, false); C.minPassword = Math.min(64, Math.max(6, +h.minPassword || 8)); return h; } catch { return null; } },
    async serverVersion() { try { const r = await window.native.http({ method: 'GET', url: C.base() + '/api/health' }); return (JSON.parse(r.body) || {}).version || ''; } catch { return null; } },
    /** true when `a` is an older version than `b` (1.2.3 style; an empty version counts as older). */
    olderThan(a, b) { const n = (x) => String(x || '0').split('.').map((p) => parseInt(p, 10) || 0); const x = n(a), y = n(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; },
    /** Replaces a local server that is older than this app (it is stopped and the bundled one starts). Returns true when the running server is now current. */
    async refreshServer() {
      if (!window.__TAURI__ || !C.isLocal()) return false;
      let v = await C.serverVersion(); if (v !== null && !C.olderThan(v, VX.app.version)) return true;
      try { await window.native.server.stop(); } catch { /* not ours */ }
      try { await window.native.server.start(C.localPort()); } catch { return false; }
      for (let i = 0; i < 10; i++) { v = await C.serverVersion(); if (v !== null && !C.olderThan(v, VX.app.version)) break; await new Promise((r) => setTimeout(r, 400)); }
      await C.init(); return v !== null && !C.olderThan(v, VX.app.version);
    },
    async stopLocalServer() { await window.native.server.stop(); await C.init(); },
    configure() { C.token = null; C.user = null; C.init(); },
    async init() {
      try { C.token = await window.native.secret.get('cloudToken:' + C.base()); } catch { C.token = null; }
      if (C.token) { try { const r = await C.request('GET', '/api/me'); C.user = r.user; C.status = 'online'; } catch (e) { if (e.status === 401) { C.token = null; await window.native.secret.set('cloudToken:' + C.base(), null); } C.status = e.status ? 'online' : 'offline'; } }
      else if (window.__VX_DEMO && !(VX.app.settings && VX.app.settings.serverUrl)) C.status = 'offline'; /* live demo: there is no server to ask */
      else { C.status = (await C.health()) ? 'online' : 'offline'; }
      if (C.status === 'offline' && VX.app.settings.autoServer && C.isLocal() && !C._autoTried) { C._autoTried = true; try { await C.startLocalServer(true); return; } catch { /* the Cloud panel shows the Start button and the reason */ } }
      VX.emit('cloud'); C.loadLink();
      /* after an update the old server may still be running – replace it by itself (once per start; Settings shows the result) */
      if (C.status === 'online' && !C._refreshTried && window.__TAURI__ && C.isLocal()) { C._refreshTried = true; C.serverVersion().then((v) => { if (v !== null && C.olderThan(v, VX.app.version)) C.refreshServer(); }); }
    },
    async request(method, path, body, auth = true) {
      const headers = { 'Content-Type': 'application/json' }; if (auth && C.token) headers.Authorization = 'Bearer ' + C.token;
      const send = () => window.native.http({ method, url: C.base() + path, headers, body: body === undefined || body === null ? undefined : JSON.stringify(body) });
      let r; try { r = await send(); } catch (e) {
        /* the local server is not running (after an update, a restart or a crash): start the bundled one and try again, so publishing and sharing just work */
        let again = false; if (!path.startsWith('/api/health') && (await C.ensureLocal())) { try { r = await send(); again = true; } catch { /* fall through to the message below */ } }
        if (!again) { const er = new Error(`Cannot reach the server at ${C.base()}. Is it running? ${C.isLocal() ? (window.__TAURI__ ? 'Vextra tried to start it but could not – see Settings → Cloud, sharing & publishing.' : 'Start it with: npm run server') : ''} (${e.message || e})`.replace(/\s+\(/, ' (')); er.offline = true; throw er; }
      }
      let j = {}; try { j = r.body ? JSON.parse(r.body) : {}; } catch { j = { error: r.body }; }
      if (r.status >= 400) { const er = new Error(j.error || 'Server error ' + r.status); er.status = r.status; throw er; } return j;
    },
    async _session(j) { C.token = j.token; C.user = j.user; C.status = 'online'; await window.native.secret.set('cloudToken:' + C.base(), j.token); VX.emit('cloud'); C.loadLink(); return j.user; },
    async register(username, password, displayName) { await VX.hooks.run('account.register', { username, password, displayName, server: C.base() }); let invite; for (;;) { try { return C._session(await C.request('POST', '/api/register', { username, password, displayName, invite }, false)); } catch (e) { if (e.status === 403 && /invite code/i.test(e.message) && invite === undefined) { invite = await VX.ui.ask('This server is shared publicly. Enter the invite code from the host:', ''); if (invite) continue; } throw e; } } },
    async login(username, password) {
      await VX.hooks.run('account.login', { username, server: C.base() });
      try {
        let j = await C.request('POST', '/api/login', { username, password }, false);
        if (j.mfa) j = await C._secondStep(j); // two-step sign-in: authenticator code, recovery code or security key
        const r = await C._session(j); VX.hooks.notify('account.loginOk', { username }); return r;
      } catch (e) { VX.hooks.notify('account.loginFailed', { username, error: e.message, status: e.status }); throw e; }
    },
    /** The sign-in dialog sets C.mfaPrompt(challenge) → { code } | { recovery } | { key: true }. Wrong codes can be retried until the ticket runs out. */
    async _secondStep(ch) {
      for (let tries = 0; tries < 6; tries++) {
        const a = C.mfaPrompt ? await C.mfaPrompt(ch, tries ? 'That code was not accepted – try again.' : '') : null; if (!a) throw Object.assign(new Error('Sign-in cancelled'), { status: 0 });
        const body = { ticket: ch.ticket };
        if (a.key) { try { body.assertion = await C._keyAssertion(ch); } catch (e) { if (tries >= 5) throw e; ch.__msg = e.message; continue; } } else if (a.recovery) body.recovery = a.recovery; else body.code = a.code;
        try { return await C.request('POST', '/api/login/mfa', body, false); } catch (e) { if (e.status === 401 && /expired|again/i.test(e.message) === false) { if (tries >= 5) throw e; continue; } throw e; }
      }
      throw new Error('Too many wrong codes');
    },
    _b64u: { enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)) },
    async _keyAssertion(ch) {
      if (!navigator.credentials || !window.PublicKeyCredential) throw new Error('This app window cannot use security keys – use an authenticator code instead.');
      const B = C._b64u, ids = ch.keys.filter((k) => k.rpId === location.hostname); if (!ids.length) throw new Error('None of your keys were added from this app/address (' + location.hostname + ') – use an authenticator or recovery code.');
      const cred = await navigator.credentials.get({ publicKey: { challenge: B.dec(ch.challenge), rpId: location.hostname, allowCredentials: ids.map((k) => ({ type: 'public-key', id: B.dec(k.id) })), userVerification: 'discouraged', timeout: 60000 } });
      const r = cred.response; return { id: B.enc(cred.rawId), authenticatorData: B.enc(r.authenticatorData), clientDataJSON: B.enc(r.clientDataJSON), signature: B.enc(r.signature) };
    },
    /* ----- account security (profile) ----- */
    security: () => C.request('GET', '/api/me/security'),
    mfaSetup: (password) => C.request('POST', '/api/me/mfa/setup', { password }),
    mfaEnable: (password, code) => C.request('POST', '/api/me/mfa/enable', { password, code }),
    mfaDisable: (password) => C.request('POST', '/api/me/mfa/disable', { password }),
    mfaRecovery: (password) => C.request('POST', '/api/me/mfa/recovery', { password }),
    removeKey: (password, id) => C.request('POST', '/api/me/keys/remove', { password, id }),
    async addKey(password, name) {
      if (!navigator.credentials || !window.PublicKeyCredential) throw new Error('This app window cannot use security keys. Use an authenticator app instead.');
      const B = C._b64u, o = await C.request('POST', '/api/me/keys/options', { password });
      const cred = await navigator.credentials.create({ publicKey: { challenge: B.dec(o.challenge), rp: { id: location.hostname, name: 'Vextra Studio' }, user: { id: B.dec(o.user.id), name: o.user.name, displayName: o.user.displayName }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }], authenticatorSelection: { userVerification: 'discouraged' }, attestation: 'none', excludeCredentials: o.exclude.map((id) => ({ type: 'public-key', id: B.dec(id) })), timeout: 60000 } });
      const r = cred.response; return C.request('POST', '/api/me/keys/register', { password, name, origin: location.origin, rpId: location.hostname, credentialId: B.enc(cred.rawId), attestationObject: B.enc(r.attestationObject), clientDataJSON: B.enc(r.clientDataJSON) });
    },
    async logout() { try { await C.request('POST', '/api/logout'); } catch { /* ignore */ } C.stopSync(); C.token = null; C.user = null; await window.native.secret.set('cloudToken:' + C.base(), null); VX.emit('cloud'); },
    async changePassword(o, n) { await VX.hooks.run('account.password', { password: n, username: C.user && C.user.username }); return C.request('POST', '/api/me/password', { old: o, new: n }); },
    async logoutOthers() { return C.request('POST', '/api/me/logout-all'); },
    async updateProfile(displayName) { const r = await C.request('PATCH', '/api/me', { displayName }); C.user = r.user; VX.emit('cloud'); return r.user; },
    async deleteAccount(password) { await C.request('DELETE', '/api/me', { password }); C.stopSync(); C.token = null; C.user = null; await window.native.secret.set('cloudToken:' + C.base(), null); VX.emit('cloud'); },

    /* ----- sites ----- */
    sites: async () => (await C.request('GET', '/api/publish')).sites,
    async publish(slug, { kind, title, files, gameId }) { await VX.hooks.run('publish.before', { slug, kind, title, files }); return C.request('PUT', '/api/publish/' + encodeURIComponent(slug), { kind, title, files, gameId }); },
    unpublish: (slug) => C.request('DELETE', '/api/publish/' + encodeURIComponent(slug)),
    /** Collect a folder's files for upload (text as string, binary as {b64}). */
    async collect(root, { max = 1500, maxBytes = 70 * 1024 * 1024 } = {}) {
      const list = (await window.native.listFiles(root, max + 200)).filter((f) => !SKIP.test(f)); const out = {}; let total = 0;
      for (const rel of list.slice(0, max)) { const full = VX.path.join(root, rel); const ext = VX.path.ext(rel); try { if (BIN.has(ext)) { const b64 = await window.native.readBase64(full); total += b64.length * 0.75; out[rel] = { b64 }; } else { const t = await window.native.readFile(full); total += t.length; out[rel] = t; } } catch { /* skip unreadable */ } if (total > maxBytes) throw new Error('The folder is too large to publish (limit about 70 MB).'); }
      return out;
    },

    /* ----- collaboration ----- */
    projects: async () => (await C.request('GET', '/api/projects')).projects,
    async linkPath() { return S.root ? VX.path.join(S.root, '.vextra/cloud.json') : null; },
    async loadLink() { C.link = null; const p = await C.linkPath(); if (!p) return VX.emit('cloud'); try { if (await window.native.exists(p)) C.link = JSON.parse(await window.native.readFile(p)); } catch { C.link = null; } if (C.link && C.link.server !== C.base()) C.link = null; VX.emit('cloud'); if (C.link && C.user) C.startSync(); },
    async saveLink() { const p = await C.linkPath(); if (p && C.link) await window.native.writeFile(p, JSON.stringify(C.link, null, 2)); },
    async uploadProject(name) {
      if (!S.root) throw new Error('Open a project folder first'); const r = await C.request('POST', '/api/projects', { name: name || VX.path.base(S.root) });
      C.link = { server: C.base(), id: r.project.id, name: r.project.name, rev: 0, hashes: {} }; await C.saveLink(); await C.syncNow(true); C.startSync(); VX.emit('cloud'); return r.project;
    },
    async joinProject(code, parentDir) {
      const r = await C.request('POST', '/api/projects/join', { code }); const proj = r.project; const dir = VX.path.join(parentDir, proj.name.replace(/[^\w.-]+/g, '-'));
      await window.native.writeFile(VX.path.join(dir, '.vextra/cloud.json'), JSON.stringify({ server: C.base(), id: proj.id, name: proj.name, rev: 0, hashes: {} }, null, 2)); await VX.app.openRoot(dir); return proj;
    },
    async unlink() { C.stopSync(); const p = await C.linkPath(); if (p) { try { await window.native.remove(p); } catch { /* ok */ } } C.link = null; VX.emit('cloud'); },
    startSync() { C.stopSync(); if (!C.link || !C.user) return; C._t = setInterval(() => C.syncNow(), 4000); C.syncNow(); },
    stopSync() { clearInterval(C._t); C._t = null; },
    async fileHash(full, rel) { const ext = VX.path.ext(rel); if (BIN.has(ext)) return hashStr(await window.native.readBase64(full)); return hashStr(await window.native.readFile(full)); },
    async syncNow() {
      if (!C.link || !C.user || C.syncing || !S.root) return; C.syncing = true; const L = C.link; const root = S.root; const pid = L.id;
      try {
        /* 1) pull */
        const act = VX.tabs.active(); await C.request('POST', `/api/projects/${pid}/presence`, { file: act && act.path ? VX.app.rel(act.path) : '' }).catch(() => {});
        const ch = await C.request('GET', `/api/projects/${pid}/changes?since=${L.rev}`); C.online = ch.online || []; C.role = ch.role; let changed = false; const touched = [];
        for (const f of ch.changes) {
          const full = VX.path.join(root, f.path); let local = null; try { if (await window.native.exists(full)) local = await C.fileHash(full, f.path); } catch { /* none */ }
          const localModified = local !== null && local !== L.hashes[f.path];
          if (f.deleted) { if (local !== null && !localModified) { await VX.tabs.closePath(full); await window.native.remove(full); changed = true; } delete L.hashes[f.path]; continue; }
          const content = f.content; const rh = typeof content === 'string' ? hashStr(content) : hashStr(content.b64);
          if (local === rh) { L.hashes[f.path] = rh; continue; }
          if (localModified && f.by !== C.user.username) { const cp = f.path.replace(/(\.[^./]+)?$/, `.conflict-${f.by}$1`); await writeContent(VX.path.join(root, cp), content); VX.ui.toast(`Conflict in ${f.path}: kept yours, saved ${f.by}'s version as ${cp}`, 'warn'); changed = true; continue; }
          await writeContent(full, content); L.hashes[f.path] = rh; touched.push(full); changed = true;
        }
        L.rev = Math.max(L.rev, ch.rev);
        /* 2) push local changes */
        if (C.role !== 'viewer') {
          const local = (await window.native.listFiles(root, 2500)).filter((f) => !SKIP.test(f)); const seen = new Set(local); const batch = []; const pend = {};
          for (const rel of local) { const full = VX.path.join(root, rel); let hsh; try { hsh = await C.fileHash(full, rel); } catch { continue; } if (L.hashes[rel] === hsh) continue; const dirtyTab = VX.tabs.list().find((t) => t.path === full && t.dirty); if (dirtyTab) continue; const bin = BIN.has(VX.path.ext(rel)); const content = bin ? { b64: await window.native.readBase64(full) } : await window.native.readFile(full); if (bin && content.b64.length > 12e6) continue; batch.push({ path: rel, content, baseRev: L.rev }); pend[rel] = hsh; }
          for (const rel of Object.keys(L.hashes)) if (!seen.has(rel)) { batch.push({ path: rel, deleted: true }); pend[rel] = null; }
          for (let i = 0; i < batch.length; i += 20) {
            const part = batch.slice(i, i + 20); const r = await C.request('PUT', `/api/projects/${pid}/files`, { files: part }); L.rev = Math.max(L.rev, r.rev);
            for (const res of r.results) { if (res.error) { VX.ui.toast(`Could not upload ${res.path}: ${res.error}`, 'error'); continue; } if (res.conflict) { const cp = res.path.replace(/(\.[^./]+)?$/, `.conflict-${res.by}$1`); await writeContent(VX.path.join(root, cp), res.content); VX.ui.toast(`Conflict in ${res.path}: ${res.by} changed it too. Their version is in ${cp}`, 'warn'); changed = true; delete L.hashes[res.path]; continue; } if (pend[res.path] === null) delete L.hashes[res.path]; else L.hashes[res.path] = pend[res.path]; }
          }
        }
        await C.saveLink(); C.lastSync = Date.now(); C.error = null;
        if (changed) { VX.emit('fsChange'); for (const full of touched) await refreshOpen(full); }
      } catch (e) { C.error = e.message; if (e.status === 401) C.stopSync(); } finally { C.syncing = false; VX.emit('cloud'); }
    },
  });
  async function writeContent(full, content) { if (typeof content === 'string') await window.native.writeFile(full, content); else await window.native.writeBase64(full, content.b64); }
  async function refreshOpen(full) {
    const t = VX.tabs.list().find((x) => x.path === full); if (!t || t.dirty) return;
    if (t.kind === 'code') return VX.tabs.reloadFromDisk(full);
    if (t.kind === 'ui' || t.kind === 'game') { await VX.tabs.close(t.id, true); await VX.tabs.open({ path: full }); }
  }
  VX.on('saved', () => { if (C.link) setTimeout(() => C.syncNow(), 300); });
  VX.on('root', () => { C.stopSync(); C.loadLink(); });
})();
