/* Bridge to the native side. Inside Tauri every call goes to Rust (src-tauri/src/lib.rs).
   Opened in a normal browser (npm run web) a virtual in-memory file system is used instead,
   which keeps the whole UI usable for development and automated testing. */
(function () {
  const T = window.__TAURI__;
  const b64ToDataURL = (b64, name) => `data:${VX.mime(name)};base64,${b64}`;
  const b64ToText = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const textToB64 = (t) => { const u = new TextEncoder().encode(t); let s = ''; u.forEach((b) => (s += String.fromCharCode(b))); return btoa(s); };

  if (T) {
    const inv = async (cmd, args) => { try { return await T.core.invoke(cmd, args); } catch (e) { throw e instanceof Error ? e : new Error(String(e)); } };
    window.native = {
      isDesktop: true,
      openFolder: () => inv('fs_open_folder'),
      openFile: () => inv('fs_open_file'),
      readDir: (dir) => inv('fs_read_dir', { dir }),
      readFile: (path) => inv('fs_read_file', { path }),
      readBase64: (path) => inv('fs_read_base64', { path }),
      writeFile: (path, content) => inv('fs_write_file', { path, content }),
      writeBase64: (path, data) => inv('fs_write_base64', { path, data }),
      saveAs: (defaultName, content) => inv('fs_save_as', { defaultName, content }),
      create: (dir, name, isDir) => inv('fs_create', { dir, name, isDir }),
      remove: (path) => inv('fs_remove', { path }),
      rename: (path, newName) => inv('fs_rename', { path, newName }),
      exists: (path) => inv('fs_exists', { path }),
      reveal: (path) => inv('fs_reveal', { path }),
      listFiles: (root, limit) => inv('fs_list_files', { root, limit }),
      search: (root, query, caseSensitive, useRegex) => inv('fs_search', { root, query, caseSensitive: !!caseSensitive, useRegex: !!useRegex }),
      async importAssets(extensions) {
        const paths = await inv('fs_pick_files', { extensions: extensions || [] });
        const out = [];
        for (const p of paths) { const name = VX.path.base(p); const b64 = await inv('fs_read_base64', { path: p }); out.push({ name, path: p, dataURL: b64ToDataURL(b64, name), text: () => b64ToText(b64) }); }
        return out;
      },
      async saveBinary(defaultName, b64) { const p = await inv('fs_save_as', { defaultName, content: '' }); if (!p) return null; await inv('fs_write_base64', { path: p, data: b64 }); return p; },
      ext: {
        list: (kind) => inv('ext_list', { kind }), save: (kind, file, content) => inv('ext_save', { kind, file, content }),
        remove: (kind, file) => inv('ext_remove', { kind, file }), import: (kind) => inv('ext_import', { kind }), openDir: (kind) => inv('ext_open_dir', { kind }),
      },
      settings: { load: () => inv('settings_load'), save: (data) => inv('settings_save', { data }) },
      secret: { get: (key) => inv('secret_get', { key }), set: (key, value) => inv('secret_set', { key, value: value ?? null }) },
      info: () => inv('app_info'),
      clean: (what) => inv('app_clean', { what }),
      http: (req) => inv('http_request', { req }),
      onMenu: (cb) => T.event.listen('menu:action', (e) => cb(e.payload)),
    };
    return;
  }

  /* ---------------- browser fallback: virtual file system ---------------- */
  const KEY = 'vx-mockfs-v1';
  let store = {}; try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { store = {}; }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* quota */ } };
  const norm = (p) => '/' + String(p).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const dirs = () => { const s = new Set(['/']); for (const p of Object.keys(store)) { const parts = p.split('/'); for (let i = 1; i < parts.length; i++) s.add(parts.slice(0, i).join('/') || '/'); } for (const d of (store.__dirs || [])) s.add(d); return s; };
  const files = () => Object.keys(store).filter((k) => k.startsWith('/'));
  const setFile = (p, v) => { store[norm(p)] = v; persist(); };
  const ls = (dir) => {
    dir = norm(dir); const pre = dir === '/' ? '/' : dir + '/'; const seen = new Map();
    for (const p of files()) if (p.startsWith(pre)) { const rest = p.slice(pre.length); const [first, ...more] = rest.split('/'); if (!seen.has(first)) seen.set(first, more.length > 0); }
    for (const d of (store.__dirs || [])) if (d.startsWith(pre) && d !== dir) { const first = d.slice(pre.length).split('/')[0]; if (first && !seen.has(first)) seen.set(first, true); }
    return [...seen].map(([name, isDir]) => ({ name, path: pre + name, isDir })).sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name));
  };
  let lsSettings = {}; try { lsSettings = JSON.parse(localStorage.getItem('vx-settings') || '{}'); } catch { /* ignore */ }
  const userExt = (kind) => { try { return JSON.parse(localStorage.getItem('vx-ext-' + kind) || '{}'); } catch { return {}; } };
  const saveExt = (kind, o) => localStorage.setItem('vx-ext-' + kind, JSON.stringify(o));
  const readText = (p) => { const v = store[norm(p)]; if (v === undefined) throw new Error('File not found: ' + p); return typeof v === 'string' ? v : b64ToText(v.b64); };

  window.__mockFS = { store, files, setFile, reset() { localStorage.removeItem(KEY); store = {}; window.__mockFS.store = store; } };
  window.native = {
    isDesktop: false,
    async openFolder() { if (!dirs().has('/projects/demo')) { (store.__dirs ||= []).push('/projects/demo'); persist(); } return localStorage.getItem('vx-mock-folder') || '/projects/demo'; },
    async openFile() { const fs = await VX.pickBrowserFile('', true); const out = []; for (const f of fs) { const p = '/uploads/' + f.name; setFile(p, await VX.readFileAsText(f)); out.push(p); } return out; },
    async readDir(dir) { return ls(dir); },
    async readFile(path) { return readText(path); },
    async readBase64(path) { const v = store[norm(path)]; if (v === undefined) throw new Error('File not found'); return typeof v === 'string' ? textToB64(v) : v.b64; },
    async writeFile(path, content) { setFile(path, content); },
    async writeBase64(path, data) { setFile(path, { b64: data }); },
    async saveAs(defaultName, content) { const p = '/projects/saved/' + defaultName; setFile(p, content); VX.download(defaultName, content); return p; },
    async create(dir, name, isDir) { const p = norm(dir + '/' + name); if (store[p] !== undefined || dirs().has(p)) throw new Error(VX.path.base(p) + ' already exists'); if (isDir) { (store.__dirs ||= []).push(p); persist(); } else setFile(p, ''); return p; },
    async remove(path) { const p = norm(path); for (const k of files()) if (k === p || k.startsWith(p + '/')) delete store[k]; store.__dirs = (store.__dirs || []).filter((d) => d !== p && !d.startsWith(p + '/')); persist(); return true; },
    async rename(path, newName) { const p = norm(path), np = norm(VX.path.dir(p) + '/' + newName); for (const k of files()) if (k === p || k.startsWith(p + '/')) { store[np + k.slice(p.length)] = store[k]; delete store[k]; } persist(); return np; },
    async exists(path) { const p = norm(path); return store[p] !== undefined || dirs().has(p); },
    async reveal() { /* nothing to reveal in a browser */ },
    async listFiles(root) { const r = norm(root); return files().filter((k) => k.startsWith(r + '/')).map((k) => k.slice(r.length + 1)); },
    async search(root, query, cs, rx) {
      const r = norm(root), hits = []; let re = null; if (rx) re = new RegExp(query, cs ? '' : 'i');
      for (const k of files().filter((x) => x.startsWith(r + '/'))) { const v = store[k]; if (typeof v !== 'string') continue; v.split('\n').forEach((line, i) => { const idx = re ? line.search(re) : (cs ? line : line.toLowerCase()).indexOf(cs ? query : query.toLowerCase()); if (idx >= 0 && hits.length < 600) hits.push({ path: k, line: i + 1, col: idx + 1, text: line.trim().slice(0, 200) }); }); }
      return hits;
    },
    async importAssets(extensions) {
      const accept = (extensions || []).map((e) => '.' + e).join(',');
      const fs = await VX.pickBrowserFile(accept, true); const out = [];
      for (const f of fs) out.push({ name: f.name, path: f.name, dataURL: await VX.readFileAsDataURL(f), text: () => VX.readFileAsText(f) });
      return out;
    },
    async saveBinary(defaultName, b64) { const a = document.createElement('a'); a.href = 'data:application/octet-stream;base64,' + b64; a.download = defaultName; a.click(); return defaultName; },
    ext: {
      async list(kind) {
        let builtin = []; try { builtin = await (await fetch('/__ext/' + kind)).json(); } catch { /* no dev server */ }
        const mine = userExt(kind);
        return [...builtin.map((b) => ({ ...b, path: '', source: 'builtin' })), ...Object.entries(mine).map(([file, content]) => ({ file, path: '/ext/' + kind + '/' + file, content, source: 'user' }))];
      },
      async save(kind, file, content) { const o = userExt(kind); o[file] = content; saveExt(kind, o); setFile('/ext/' + kind + '/' + file, content); return '/ext/' + kind + '/' + file; },
      async remove(kind, file) { const o = userExt(kind); delete o[file]; saveExt(kind, o); delete store['/ext/' + kind + '/' + file]; persist(); },
      async import(kind) { const fs = await VX.pickBrowserFile(kind === 'plugins' ? '.js' : '.json', true); const o = userExt(kind); for (const f of fs) o[f.name] = await VX.readFileAsText(f); saveExt(kind, o); return fs.map((f) => f.name); },
      async openDir() { /* n/a */ },
    },
    settings: { async load() { return lsSettings; }, async save(data) { lsSettings = data; localStorage.setItem('vx-settings', JSON.stringify(data)); } },
    secret: { async get(k) { return localStorage.getItem('vx-secret-' + k); }, async set(k, v) { v == null ? localStorage.removeItem('vx-secret-' + k) : localStorage.setItem('vx-secret-' + k, v); } },
    async info() { return { name: 'Vextra Studio', version: '2.0.0', platform: 'browser', arch: 'wasm', userDir: '(browser storage)' }; },
    async clean(what) { const removed = []; const all = what.includes('all'); if (all || what.includes('settings')) { localStorage.removeItem('vx-settings'); removed.push('settings'); } for (const k of ['plugins', 'themes']) if (all || what.includes(k)) { localStorage.removeItem('vx-ext-' + k); removed.push(k); } if (all || what.includes('secrets')) { Object.keys(localStorage).filter((k) => k.startsWith('vx-secret-')).forEach((k) => localStorage.removeItem(k)); removed.push('secrets'); } return removed; },
    async http({ method, url, headers, body }) { const r = await fetch(url, { method, headers, body }); return { status: r.status, body: await r.text() }; },
    onMenu() { return Promise.resolve(() => {}); },
  };
})();
