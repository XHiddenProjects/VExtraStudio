/* Vextra Studio – project packs (.vxpack).
   A pack is a ZIP with a `vextra-pack.json` manifest plus the project's files (code, assets, levels, scripts).
   Opening one (double-click, File → Open, or the Command Palette) unpacks it into a new folder and BUILDS it:
     • every .vxs script is compiled to block behaviours and added to the game it belongs to,
     • every .vxgame is checked and counted (levels, objects, assets, behaviours),
     • every game gets a playable web build in  build/<name>.html,
   then the entry file is opened and a short report is shown. Nothing from the pack is ever run during this – scripts are compiled, not executed;
   game code only runs when you press Play (inside the sandbox). Programs (.exe, .dll, .bat, .sh …) and unsafe paths are never written. */
(function () {
  const { h } = VX; const N = () => window.native;
  const P = (VX.pack = {});
  const SKIP = /^(_backups|node_modules|\.git|dist|target|vendor|\.next|build)(\/|$)/;
  const BLOCKED = /\.(exe|dll|bat|cmd|com|msi|scr|ps1|vbs|jar|sh|app|dmg|pkg|deb|rpm|appimage|lnk|so|dylib)$/i;
  const MANIFEST = 'vextra-pack.json';
  const LIMITS = { files: 20000, bytes: 600 * 1048576 };
  const safeRel = (p) => { const q = String(p).replace(/\\/g, '/'); return !q || q.startsWith('/') || /^[a-z]:/i.test(q) || q.split('/').some((x) => x === '..' || x === '' || x === '.') ? null : q; };
  const safeName = (n) => (String(n || 'project').replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(0, 60) || 'project');
  const size = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const base = (p) => p.replace(/^.*\//, '');
  const dir = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  const noExt = (p) => base(p).replace(/\.[^.]+$/, '');

  /** Packs the open folder and offers it as a download / save dialog. */
  P.create = async function () {
    const root = VX.app.S.root; if (!root) { VX.ui.toast('Open a folder first', 'warn'); return; }
    const name = safeName(VX.path.base(root)); const all = (await N().listFiles(root, 20000)).filter((f) => !SKIP.test(f) && !BLOCKED.test(f));
    if (!all.length) { VX.ui.toast('Nothing to pack', 'warn'); return; }
    const prog = VX.ui.progress('Packing …'); const entries = []; let total = 0, skipped = 0;
    try {
      for (let i = 0; i < all.length; i++) {
        if (prog.cancelled) throw new Error('Cancelled'); let b64; try { b64 = await N().readBase64(root + '/' + all[i]); } catch { skipped++; continue; }
        const bytes = Math.floor(b64.length * 3 / 4); if (bytes > 50 * 1048576) { skipped++; continue; } total += bytes; if (total > LIMITS.bytes) throw new Error('The folder is larger than ' + size(LIMITS.bytes));
        entries.push({ path: all[i], data: VX.archive.fromB64(b64) }); if (i % 25 === 0) { prog.set(90 * i / all.length, all[i]); await new Promise((r) => setTimeout(r, 0)); }
      }
      const games = all.filter((f) => /\.vxgame$/i.test(f)); const entry = games.find((f) => /(^|\/)(main|game|index)\.vxgame$/i.test(f)) || games[0] || (all.includes('index.html') ? 'index.html' : all[0]);
      const manifest = { format: 'vextra-pack', version: 1, name, kind: games.length ? 'game' : 'web', entry, files: entries.length, createdWith: String(VX.app.version || ''), created: new Date().toISOString() };
      entries.unshift({ path: MANIFEST, data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
      prog.set(95, 'Compressing …'); const zip = await VX.archive.zip(entries); const out = await N().saveBinary(name + '.vxpack', VX.archive.toB64(zip));
      prog.set(100, `${entries.length - 1} files · ${size(zip.length)}${skipped ? ` · ${skipped} skipped` : ''}`); prog.done('Close'); if (out) VX.ui.toast('Pack saved: ' + out, 'ok');
    } catch (e) { prog.close(); VX.ui.toast('Could not make the pack: ' + (e.message || e), 'error'); }
  };

  P.read = async function (bytes) {
    const files = await VX.archive.unzip(bytes, LIMITS); const m = files.find((f) => !f.dir && f.path === MANIFEST); let manifest = null;
    if (m) { try { manifest = JSON.parse(new TextDecoder().decode(m.data)); } catch { /* handled below */ } }
    if (!manifest || manifest.format !== 'vextra-pack') throw new Error('This is not a Vextra project pack (no ' + MANIFEST + ').');
    return { manifest, files: files.filter((f) => !f.dir && f.path !== MANIFEST) };
  };

  P.pick = async function () {
    if (N().isDesktop) { const ps = await N().openFile(); const p = ps && (Array.isArray(ps) ? ps[0] : ps); if (p) return P.openPath(p); return; }
    const f = (await VX.pickBrowserFile('.vxpack', false))[0]; if (f) return P.openBytes(new Uint8Array(await f.arrayBuffer()), f.name);
  };
  P.openPath = async function (path) { try { return await P.openBytes(VX.archive.fromB64(await N().readBase64(path)), VX.path.base(path)); } catch (e) { VX.ui.toast('Could not open the pack: ' + (e.message || e), 'error'); } };

  P.openBytes = async function (bytes, fileName) {
    let pk; try { pk = await P.read(bytes); } catch (e) { VX.ui.toast(e.message || String(e), 'error'); return null; }
    const files = []; let unsafe = 0, blocked = 0, total = 0; for (const f of pk.files) { const rel = safeRel(f.path); if (!rel) { unsafe++; continue; } if (BLOCKED.test(rel)) { blocked++; continue; } files.push({ path: rel, data: f.data }); total += f.data.length; }
    const name = safeName(pk.manifest.name || String(fileName).replace(/\.vxpack$/i, ''));
    const ok = await VX.ui.confirm(`Unpack “${name}”?\n\n${files.length} files · ${size(total)}${pk.manifest.kind ? ' · ' + pk.manifest.kind : ''}\n${blocked ? `${blocked} program file(s) will NOT be unpacked.\n` : ''}${unsafe ? `${unsafe} file(s) with unsafe paths will be ignored.\n` : ''}\nIt gets its own new folder, then Vextra compiles the scripts and builds every game inside. Nothing runs until you press Play.`, 'Unpack and build');
    if (!ok) return null;
    let parent = '/projects'; if (N().isDesktop) { parent = await N().openFolder(); if (!parent) return null; }
    let dest = (parent + '/' + name).replace(/\/+/g, '/'); for (let i = 2; await N().exists(dest) && i < 99; i++) dest = `${parent}/${name}-${i}`.replace(/\/+/g, '/');
    const prog = VX.ui.progress('Unpacking …');
    try { for (let i = 0; i < files.length; i++) { await N().writeBase64(dest + '/' + files[i].path, VX.archive.toB64(files[i].data)); if (i % 20 === 0) { prog.set(70 * i / files.length, files[i].path); await new Promise((r) => setTimeout(r, 0)); } }
      prog.set(75, 'Building …'); const report = await P.build(dest, files, pk.manifest); prog.set(100, 'Done'); prog.close();
      await VX.app.openRoot(dest); if (report.entry) { try { await VX.tabs.open({ path: dest + '/' + report.entry }); } catch { /* the folder is open anyway */ } }
      P.showReport(name, dest, report); return { dest, report };
    } catch (e) { prog.close(); VX.ui.toast('Unpacking failed: ' + (e.message || e), 'error'); return null; }
  };

  /** Compiles .vxs scripts into their games and writes a playable build of every game. Reads from the unpacked `files` (no disk re-read needed for scripts). */
  P.build = async function (dest, files, manifest) {
    const rep = { entry: null, games: [], scripts: [], web: files.filter((f) => /\.(html?|css|js|mjs)$/i.test(f.path)).length, assets: files.filter((f) => /\.(png|jpe?g|gif|webp|svg|mp3|ogg|wav|glb|gltf|obj|ttf|woff2?)$/i.test(f.path)).length, errors: [], warnings: [] };
    const dec = new TextDecoder(); const games = files.filter((f) => /\.vxgame$/i.test(f.path)); const scripts = files.filter((f) => /\.vxs$/i.test(f.path));
    const entryGame = (manifest.entry && games.find((g) => g.path === manifest.entry)) || games.find((g) => /(^|\/)(main|game|index)\.vxgame$/i.test(g.path)) || games[0] || null;
    const owner = (s) => games.length === 1 ? games[0] : games.find((g) => dir(g.path) === dir(s.path) && noExt(g.path) === noExt(s.path)) || games.find((g) => dir(g.path) === dir(s.path)) || entryGame;
    const byGame = new Map(); for (const s of scripts) { const g = owner(s); if (!g) { rep.warnings.push(`${s.path}: no game in this pack to attach it to`); continue; } (byGame.get(g.path) || byGame.set(g.path, []).get(g.path)).push(s); }
    for (const g of games) {
      const info = { path: g.path, title: '', levels: 0, objects: 0, behaviors: 0, assets: 0, scripts: 0, build: '' };
      try {
        let proj = VX.GameProject.normalize(JSON.parse(dec.decode(g.data))); let changed = false;
        for (const s of byGame.get(g.path) || []) { const r = VX.vxs.addTo(proj, dec.decode(s.data)); if (r.errors.length) { for (const e of r.errors) rep.errors.push(`${s.path}:${e.line}  ${e.message}`); } else { info.scripts++; changed = true; rep.scripts.push(`${s.path} → ${r.behaviors.length} behaviour${r.behaviors.length === 1 ? '' : 's'}, ${r.behaviors.reduce((a, b) => a + b.graph.nodes.length, 0)} blocks`); for (const w of r.warnings) rep.warnings.push(`${s.path}:${w.line}  ${w.message}`); } }
        if (changed) await N().writeFile(dest + '/' + g.path, JSON.stringify(proj));
        info.title = proj.settings.title; info.levels = (proj.scenes || []).length; info.objects = (proj.scenes || []).reduce((a, s) => a + (s.objects || []).length, 0); info.behaviors = Object.keys(proj.behaviors || {}).length; info.assets = Object.values(proj.assets || {}).reduce((a, m) => a + (m && typeof m === 'object' ? Object.keys(m).length : 0), 0);
        try { const out = `${dest}/build/${noExt(g.path)}.html`; await VX.gameExport.toFile(proj, out); info.build = `build/${noExt(g.path)}.html`; } catch (e) { rep.errors.push(`${g.path}: the web build failed – ${e.message || e}`); }
      } catch (e) { rep.errors.push(`${g.path}: ${e.message || e}`); }
      rep.games.push(info);
    }
    for (const s of scripts) if (!games.length) rep.warnings.push(`${s.path}: this pack has no game, so the script was only unpacked`);
    rep.entry = (manifest.entry && files.some((f) => f.path === manifest.entry) ? manifest.entry : null) || (entryGame && entryGame.path) || (files.find((f) => f.path === 'index.html') ? 'index.html' : null);
    return rep;
  };

  P.showReport = function (name, dest, rep) {
    const row = (l, v) => h('div', { style: 'display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border)' }, h('span', { style: 'color:var(--muted)' }, l), h('b', {}, String(v)));
    const body = h('div', { style: 'font-size:13px' }, h('p', { style: 'margin-top:0' }, `Unpacked to ${dest}`));
    if (rep.games.length) for (const g of rep.games) body.append(h('div', { style: 'margin:8px 0;padding:8px 10px;border:1px solid var(--border);border-radius:8px' }, h('b', {}, g.title || g.path), row('Levels', g.levels), row('Objects', g.objects), row('Behaviours', g.behaviors), row('Assets', g.assets), g.scripts ? row('VXScript files compiled', g.scripts) : null, row('Web build', g.build || 'failed')));
    else body.append(row('Web files (html/css/js)', rep.web), row('Images, audio, models, fonts', rep.assets));
    for (const e of rep.errors) body.append(h('div', { style: 'color:var(--danger,#e55);margin-top:4px' }, '✗ ' + e)); for (const w of rep.warnings) body.append(h('div', { style: 'color:var(--muted);margin-top:4px' }, '! ' + w));
    const play = rep.games.find((g) => g.build); const acts = [];
    if (play) acts.push(h('button', { class: 'btn primary', onclick: async () => { try { VX.ui.preview(await N().readFile(dest + '/' + play.build), play.title || name); } catch (e) { VX.ui.toast(e.message || String(e), 'error'); } } }, '▶ Play the build'));
    VX.ui.modal({ title: rep.errors.length ? `“${name}” built with problems` : `“${name}” is ready`, body, actions: acts });
  };

  /** Called for files the operating system asked us to open. */
  P.handleFile = async function (p) {
    const l = String(p).toLowerCase();
    if (l.endsWith('.vxpack')) return P.openPath(p);
    try { await VX.tabs.open({ path: p }); } catch (e) { VX.ui.toast('Could not open ' + VX.path.base(p) + ': ' + (e.message || e), 'error'); }
  };
})();
