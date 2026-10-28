/* Vextra Studio – cloud client: accounts, project sync (collaboration) and publishing against a Vextra server. */
(function () {
  const S = VX.app.S;
  const BIN = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'mp3', 'wav', 'ogg', 'm4a', 'flac', 'woff', 'woff2', 'ttf', 'otf', 'pdf', 'mp4', 'webm', 'zip', 'wasm', 'bin']);
  const SKIP = /(^|\/)(node_modules|\.git|target|\.vextra|\.DS_Store)(\/|$)/;
  const hashStr = (s) => { let h1 = 5381, h2 = 52711; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 33) ^ c; } return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + s.length; };

  const C = (VX.cloud = {
    user: null, token: null, status: 'unknown', link: null, online: [], syncing: false, lastSync: 0, error: null,
    base() { return (VX.app.settings.serverUrl || 'http://localhost:8787').replace(/\/+$/, ''); },
    configure() { C.token = null; C.user = null; C.init(); },
    async init() {
      try { C.token = await window.native.secret.get('cloudToken:' + C.base()); } catch { C.token = null; }
      if (C.token) { try { const r = await C.request('GET', '/api/me'); C.user = r.user; C.status = 'online'; } catch (e) { if (e.status === 401) { C.token = null; await window.native.secret.set('cloudToken:' + C.base(), null); } C.status = e.status ? 'online' : 'offline'; } }
      else { try { await C.request('GET', '/api/health', null, false); C.status = 'online'; } catch { C.status = 'offline'; } }
      VX.emit('cloud'); C.loadLink();
    },
    async request(method, path, body, auth = true) {
      const headers = { 'Content-Type': 'application/json' }; if (auth && C.token) headers.Authorization = 'Bearer ' + C.token;
      let r; try { r = await window.native.http({ method, url: C.base() + path, headers, body: body === undefined || body === null ? undefined : JSON.stringify(body) }); } catch (e) { const er = new Error(`Cannot reach the server at ${C.base()}. Is it running? (${e.message || e})`); er.offline = true; throw er; }
      let j = {}; try { j = r.body ? JSON.parse(r.body) : {}; } catch { j = { error: r.body }; }
      if (r.status >= 400) { const er = new Error(j.error || 'Server error ' + r.status); er.status = r.status; throw er; } return j;
    },
    async _session(j) { C.token = j.token; C.user = j.user; C.status = 'online'; await window.native.secret.set('cloudToken:' + C.base(), j.token); VX.emit('cloud'); C.loadLink(); return j.user; },
    async register(username, password, displayName) { return C._session(await C.request('POST', '/api/register', { username, password, displayName }, false)); },
    async login(username, password) { return C._session(await C.request('POST', '/api/login', { username, password }, false)); },
    async logout() { try { await C.request('POST', '/api/logout'); } catch { /* ignore */ } C.stopSync(); C.token = null; C.user = null; await window.native.secret.set('cloudToken:' + C.base(), null); VX.emit('cloud'); },
    async changePassword(o, n) { return C.request('POST', '/api/me/password', { old: o, new: n }); },
    async logoutOthers() { return C.request('POST', '/api/me/logout-all'); },
    async updateProfile(displayName) { const r = await C.request('PATCH', '/api/me', { displayName }); C.user = r.user; VX.emit('cloud'); return r.user; },
    async deleteAccount(password) { await C.request('DELETE', '/api/me', { password }); C.stopSync(); C.token = null; C.user = null; await window.native.secret.set('cloudToken:' + C.base(), null); VX.emit('cloud'); },

    /* ----- sites ----- */
    sites: async () => (await C.request('GET', '/api/publish')).sites,
    async publish(slug, { kind, title, files, gameId }) { return C.request('PUT', '/api/publish/' + encodeURIComponent(slug), { kind, title, files, gameId }); },
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
