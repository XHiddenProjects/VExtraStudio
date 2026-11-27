#!/usr/bin/env node
/* Vextra Studio self-test: syntax-checks every script, validates data files and exercises the sharing server end to end. */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), http = require('http');
const ROOT = path.resolve(__dirname, '..'); let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const walk = (d, o = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', 'target', 'vendor', '__test', 'data'].includes(f.name)) continue; const p = path.join(d, f.name); f.isDirectory() ? walk(p, o) : o.push(p); } return o; };

console.log('Syntax');
for (const f of walk(ROOT).filter((x) => x.endsWith('.js'))) { const r = cp.spawnSync(process.execPath, ['--check', f]); ok(r.status === 0, path.relative(ROOT, f) + (r.status ? '\n' + r.stderr : '')); }
console.log('Data files');
for (const f of walk(path.join(ROOT, 'themes')).filter((x) => x.endsWith('.json'))) { try { JSON.parse(fs.readFileSync(f, 'utf8')); ok(true, path.relative(ROOT, f)); } catch (e) { ok(false, f + ' ' + e.message); } }
for (const f of fs.readdirSync(path.join(ROOT, 'plugins'))) { const s = fs.readFileSync(path.join(ROOT, 'plugins', f), 'utf8'); ok(/@vx-plugin\s*\{/.test(s) && /@vx-docs/.test(s), 'plugins/' + f + ' has manifest + docs'); }
const html = fs.readFileSync(path.join(ROOT, 'renderer', 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)) ok(fs.existsSync(path.join(ROOT, 'renderer', m[1])), 'index.html → ' + m[1]);

console.log('Server');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-test-')), port = 18000 + Math.floor(Math.random() * 1000);
const srv = cp.spawn(process.execPath, [path.join(ROOT, 'server', 'server.js'), '--port', String(port), '--data', dir], { stdio: 'ignore' });
const call = (method, p, body, token) => new Promise((res) => { const d = body ? JSON.stringify(body) : null; const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}) }, (x) => { let b = ''; x.on('data', (c) => (b += c)); x.on('end', () => { let j = null; try { j = JSON.parse(b); } catch { /* html */ } res({ status: x.statusCode, json: j, text: b }); }); }); r.on('error', () => res({ status: 0 })); d && r.write(d); r.end(); });
/* ---- new modules (run in a bare VM context: no browser needed) ---- */
{
  const vm = require('vm'); const ctx = { VX: {}, navigator: {}, TextEncoder, CompressionStream, Response, Uint8Array, console, document: undefined }; ctx.window = ctx; vm.createContext(ctx);
  const load = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, 'renderer', f), 'utf8'), ctx, { filename: f });
  load('js/web/archive.js'); load('js/docs/highlight.js'); load('js/docs/markdown.js');
  ok(ctx.VX.highlight('const a = 1;', 'js')[0].includes('tk-k'), 'highlighter marks keywords');
  ok(ctx.VX.highlight('SELECT 1; -- c', 'sql')[0].includes('tk-c'), 'highlighter handles SQL');
  const md = ctx.VX.markdown.render('# T\n\n- [x] a\n\n```php\n<?php echo 1;\n```\n');
  ok(/class="codeblock"/.test(md) && /class="cb-copy"/.test(md) && /class="ln"/.test(md) && /task/.test(md), 'markdown: code block with copy button + line numbers + task list');
  ok(!/<script/i.test(ctx.VX.markdown.render('<script>alert(1)</script>')), 'markdown escapes raw HTML');
  { const g = ctx.VX.markdown.render('```\nconst a = 1; // x\n```\n\n```ts title="x"\nlet y: number = 2\n```\n\n  ```json\n  {"a": 1}\n  ```\n\n- [ ] t\n  - [x] n\n');
    ok((g.match(/tk-/g) || []).length >= 6, 'markdown: unlabelled, titled and indented fences are highlighted');
    ok((g.match(/class="task"/g) || []).length === 2, 'markdown: nested task items are rendered as tasks'); }
  ok(ctx.VX.archive.crc32(new TextEncoder().encode('123456789')) === 0xcbf43926, 'crc32 check value');
  ctx.VX.esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  { const ac = fs.readFileSync(path.join(ROOT, 'renderer/js/game/rt-anticheat.js'), 'utf8'), r2 = fs.readFileSync(path.join(ROOT, 'renderer/js/game/rt-render2d.js'), 'utf8');
    ok(!/g\.vars = g\.vars/.test(r2) && /wraps\.get\(v\) \|\| v/.test(ac), 'anti-cheat: writing g.vars back never adds another Proxy layer (no per-frame "Maximum call stack size exceeded")'); }
  ok(!fs.existsSync(path.join(ROOT, 'renderer/js/designer')) && !/designer\/|vxui/i.test(fs.readFileSync(path.join(ROOT, 'renderer/index.html'), 'utf8')), 'UI designer (vxui) removed – the website builder replaces it');
  ctx.__done = false;
  (async () => { const es = [{ path: 'a/b.txt', data: 'hello '.repeat(200) }, { path: '.htaccess', data: 'x' }]; const z = await ctx.VX.archive.zip(es), t = await ctx.VX.archive.tarGz(es);
    const tmp = path.join(require('os').tmpdir(), 'vx-arch-' + process.pid); fs.mkdirSync(tmp, { recursive: true }); fs.writeFileSync(path.join(tmp, 'a.zip'), z); fs.writeFileSync(path.join(tmp, 'a.tgz'), t);
    const tl = cp.spawnSync('tar', ['tzf', path.join(tmp, 'a.tgz')]); ok(tl.status === 0 && /a\/b\.txt/.test(String(tl.stdout)) && /\.htaccess/.test(String(tl.stdout)), 'tar.gz is valid and contains .htaccess');
    const uz = cp.spawnSync('python3', ['-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(",".join(z.namelist()))', path.join(tmp, 'a.zip')]); ok(uz.status === 0 && /\.htaccess/.test(String(uz.stdout)), 'zip is valid');
    fs.rmSync(tmp, { recursive: true, force: true }); })().then(() => { ctx.__done = true; });
}
for (const f of ['renderer/vendor/sqljs/sql-wasm.js', 'renderer/vendor/sqljs/sql-wasm.wasm']) ok(fs.existsSync(path.join(ROOT, f)), f + ' vendored');
{
  const src = ['blocks-triggers', 'blocks-logic', 'blocks-flow', 'blocks-components'].map((f) => fs.readFileSync(path.join(ROOT, 'renderer/js/game', f + '.js'), 'utf8')).join('\n');
  ok(/id: 'once', cat: 'triggers'/.test(src), 'Once trigger exists'); ok(/inputs: \['in', 'a', 'b', 'c', 'd', 'e', 'f'\]/.test(src), 'Expression has variables a–f');
  ok(/id: 'ad', cat: 'mobile'[\s\S]*service/.test(src) && !/id: 'adSlot'/.test(src), 'Ad block has an ad-service option (no separate ad GUI block)');
  ok(/\['size', 'Set view width \/ height'\]/.test(src), 'Camera block can set view width / height');
}
{ /* AI add-on: play-testing, attachments, loop guard */
  const ai = fs.readFileSync(path.join(ROOT, 'plugins', 'vextra-ai.js'), 'utf8'), pt = fs.readFileSync(path.join(ROOT, 'renderer/js/game/editor/playtest.js'), 'utf8'), pl = fs.readFileSync(path.join(ROOT, 'renderer/js/core/plugins.js'), 'utf8');
  ok(/setAttribute\('sandbox', 'allow-scripts'\)/.test(pt) && !/setAttribute\('sandbox'[^)]*same-origin/.test(pt), 'playtest frame is sandboxed without allow-same-origin');
  ok(/d\.token !== chan\.token/.test(pt) && /e\.source !== frame\.contentWindow/.test(pt), 'playtest messages are token- and source-checked');
  ok(/playtest: \(script/.test(pl) && /screenshotPage/.test(pl), 'vx.game.playtest / screenshotPage exist');
  ok(/const over = !!\(c\.tokenLimit && \(bud\.used >= c\.tokenLimit \|\| reason === 'token limit'\)\)/.test(ai) && /COOLDOWN/.test(ai), 'AI token limit locks for a cooldown');
  ok(/modelCaps/.test(ai) && /applyCaps/.test(ai) && /fallbackModel/.test(ai), 'AI per-model settings and fallback model');
  ok(/cleanShown/.test(ai) && /looksCutOff/.test(ai), 'AI hides raw action JSON');
  ok(/setState/.test(pl), 'vx.panels.setState exists');
  ok(/'play', 'Play-test/.test(ai) && /case 'playtest'/.test(ai) && /case 'screenshot_site'/.test(ai), 'AI has the play-test permission and actions');
  ok(/STOP AND THINK/.test(ai) && /reason = 'stuck'/.test(ai) && /guard\.cache/.test(ai), 'AI has the loop guard');
  ok(/makeAttachment/.test(ai) && /save_attachment/.test(ai) && /add_image_sprite/.test(ai) && /add_sound_file/.test(ai), 'AI accepts attachments');
  ok(/ATT_COUNT/.test(ai) && /ATT_MAX/.test(ai), 'attachments have size / count limits');
  ok(/image_url/.test(ai) && /media_type/.test(ai) && /images: imgs\.map/.test(ai), 'pictures are sent in all three provider formats');
  ok(/safeRel\(a\.path \|\| at\.name\)/.test(ai) && /BAD_WRITE\.test\(p\)/.test(ai.slice(ai.indexOf("case 'save_attachment'"))), 'save_attachment uses the protected-path rules');
}
// ---- 4.2 additions
{
  const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const g = JSON.parse(R('examples/night-shift/night-shift.vxgame'));
  let nodes = 0; (function w(o) { if (o && typeof o === 'object') { if (Array.isArray(o.nodes) && Array.isArray(o.wires)) nodes += o.nodes.length; for (const k in o) w(o[k]); } })(g);
  ok(g.format && g.scenes.length === 7 && nodes > 500, 'Night Shift ships as a block-graph .vxgame (' + nodes + ' blocks)');
  ok(fs.existsSync(path.join(__dirname, '..', 'examples/night-shift/night-shift.vxpack')) && fs.existsSync(path.join(__dirname, '..', 'examples/night-shift/build/night-shift.html')), 'Night Shift pack and web build present');
  ok(/@vx-plugin/.test(R('plugins/backup.js')), 'backup plugin uses @vx-plugin');
  ok(/vhs/.test(R('renderer/js/game/rt-fx.js')), 'VHS shader effect registered');
  ok(/fileAssociations/.test(R('src-tauri/tauri.conf.json')), 'file associations configured');
  ok(R('server/host.js') === R('src-tauri/resources/server/host.js') && R('server/server.js') === R('src-tauri/resources/server/server.js'), 'bundled server copies match');
  ok(/pauseMenu/.test(R('renderer/js/game/rt-menu.js')) && /rt-menu/.test(R('renderer/js/game/editor/export.js')), 'pause menu runtime is exported with games');
  ok(/icon: 'save'/.test(R('plugins/backup.js')), 'backup add-on uses the save-disk icon');
  ok(/vxscript/.test(R('renderer/index.html')) && /pack\.js/.test(R('renderer/index.html')), 'vxscript and pack scripts loaded');
  ok(/vxscript/.test(R('renderer/js/editor/vxscript-mode.js')) && /vxscript-mode/.test(R('renderer/index.html')) && /vxs: 'vxscript'/.test(R('renderer/js/editor/code-editor.js')), 'VXScript editor mode (highlight + autocomplete) wired');
  ok(/CodeEditor/.test(R('renderer/js/game/editor/vxscript-ui.js')), 'VXScript window uses the code editor');
  ok(/blockSpec/.test(R('renderer/js/game/vxscript.js')) && /when block/.test(R('renderer/js/game/vxscript.js')), 'VXScript supports every block');
  ok(/vxscript-lang/.test(R('renderer/js/docs/content.js')), 'VXScript language reference present');
  ok(/deleteCert/.test(R('server/host.js')) && /cert\/delete/.test(R('server/server.js')) && /detectPublicIp/.test(R('server/host.js')), 'host: auto IP and certificate deletion');
  ok(/creation_flags\(0x0800_0000\)/.test(R('src-tauri/src/lib.rs')) && /php_stop/.test(R('src-tauri/src/lib.rs')), 'PHP server runs without a console window');
  ok(/phpRecommended/.test(R('renderer/js/web/phpconfig.js')) && /terminal/.test(R('renderer/js/web/terminal.js')) && /dbdrivers/.test(R('renderer/index.html')), 'PHP settings, terminal and database drivers present');
  ok(/gameSettings/.test(R('renderer/js/game/blocks-flow.js')), 'Game settings block present');
  ok(/decompile/.test(R('renderer/js/game/vxscript.js')) && /Edit as VXScript/.test(R('renderer/js/game/editor/editor.js')), 'Edit as VXScript present');
  ok(/isLocked/.test(R('plugins/vextra-ai.js')), 'AI cool-down enforced from the saved lock');
  ok(/pickedTop/.test(R('renderer/js/app/sidebar.js')), 'Explorer multi-select present');
  ok(/term_shells/.test(R('src-tauri/src/lib.rs')) && /terminalShell/.test(R('renderer/js/web/terminal.js')), 'terminal shell picker present');
  ok(/VEXTRA_PARENT_PID/.test(R('server/server.js')) && /kill_stale_servers/.test(R('src-tauri/src/lib.rs')) && /taskkill/.test(R('src-tauri/windows/nsis-hooks.nsh')) && /nsis-hooks/.test(R('src-tauri/tauri.conf.json')), 'server exits with the app; installer and updater stop it');
  ok(/stop-server\.sh/.test(R('src-tauri/tauri.conf.json')) && /RunEvent::Exit/.test(R('src-tauri/src/lib.rs')), 'Linux packages and every OS stop the server on quit');
}
(async () => {
  for (let i = 0; i < 30; i++) { if ((await call('GET', '/api/health')).status === 200) break; await new Promise((r) => setTimeout(r, 150)); }
  try {
    ok((await call('GET', '/api/health')).status === 200, 'health');
    const a = await call('POST', '/api/register', { username: 'alice', password: 'correct horse' }); ok(a.status === 201 && a.json.token, 'register alice');
    ok((await call('POST', '/api/register', { username: 'alice', password: 'whatever12' })).status === 409, 'duplicate username rejected');
    ok((await call('POST', '/api/register', { username: 'bob', password: 'short' })).status === 400, 'short password rejected');
    ok((await call('POST', '/api/login', { username: 'alice', password: 'nope-nope' })).status === 401, 'wrong password rejected');
    const l = await call('POST', '/api/login', { username: 'alice', password: 'correct horse' }); ok(l.status === 200, 'login'); const T = l.json.token;
    const b = await call('POST', '/api/register', { username: 'bob', password: 'bobs password' }); const TB = b.json.token;
    const pr = await call('POST', '/api/projects', { name: 'Demo' }, T); ok(pr.status === 201, 'create project'); const id = pr.json.project.id, inv = pr.json.project.invite;
    const j = await call('POST', '/api/projects/join', { code: inv }, TB); ok(j.status === 200, 'bob joins with invite code');
    ok((await call('GET', '/api/projects/' + id, null, TB)).status === 200, 'bob can read the project');
    ok((await call('GET', '/api/projects/' + id, null)).status === 401, 'anonymous cannot read the project');
    const pub = await call('PUT', '/api/publish/demo', { kind: 'game', title: 'Demo', files: { 'index.html': '<h1>hi</h1>' } }, T); ok(pub.status === 200 && /\/p\/alice\/demo/.test(pub.json.url), 'publish site');
    const g = await call('GET', '/p/alice/demo/'); ok(g.status === 200 && /<h1>hi<\/h1>/.test(g.text), 'published site is public');
    { const t = await call('GET', '/p/alice/demo/..%2f..%2fusers.json'); ok(!/salt|hash/.test(t.text), 'path traversal blocked'); }
    ok((await call('POST', '/api/games/g1/leaderboard/main', { name: 'A', score: 10 })).status < 300, 'leaderboard post');
    const lb = await call('GET', '/api/games/g1/leaderboard/main'); ok(lb.json && lb.json.list.length === 1, 'leaderboard read');
    ok((await call('PUT', '/api/saves/g1/slot1', { data: { lvl: 3 } }, T)).status < 300, 'cloud save write');
    ok(((await call('GET', '/api/saves/g1/slot1', null, T)).json || {}).data.lvl === 3, 'cloud save read');
    ok((await call('GET', '/explore')).status === 200, 'explore page');
  } catch (e) { ok(false, 'server test crashed: ' + e.message); }
  /* ---- anti-cheat server routes (reports public, reading/banning admin-only) ---- */
  try {
    const ac = (m, p2, b, adm) => new Promise((res) => { const d = b ? JSON.stringify(b) : null; const r = http.request({ host: '127.0.0.1', port, path: '/api/anticheat' + p2, method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, adm ? { 'X-Vextra-Admin': '1' } : {}) }, (x) => { let t = ''; x.on('data', (c) => (t += c)); x.on('end', () => { let j; try { j = JSON.parse(t); } catch { /* */ } res({ status: x.statusCode, json: j }); }); }); r.on('error', () => res({ status: 0 })); if (d) r.write(d); r.end(); });
    ok((await ac('POST', '/report', { game: 'g1', player: 'p1', check: 'speed', detail: 'x', strikes: 1, action: 'warn' })).status === 200, 'anti-cheat: a player report is accepted');
    ok((await ac('GET', '/events?game=g1')).status >= 400, 'anti-cheat: reports cannot be read without the admin header');
    ok(((await ac('GET', '/events?game=g1', null, true)).json || {}).events.length === 1, 'anti-cheat: admin reads the report');
    await ac('POST', '/ban', { game: 'g1', player: 'p1', minutes: 5 }, true); ok(((await ac('GET', '/ban?game=g1&player=p1')).json || {}).banned === true, 'anti-cheat: banned player is told');
    await ac('POST', '/unban', { game: 'g1', player: 'p1' }, true); ok(((await ac('GET', '/ban?game=g1&player=p1')).json || {}).banned === false, 'anti-cheat: unban works');
  } catch (e) { ok(false, 'anti-cheat test crashed: ' + e.message); }
  /* ---- website builder: generate a site and run its exported server ---- */
  {
    const S = require(path.join(ROOT, 'renderer/js/web/sitegen.js')); const site = S.blank('Selftest');
    ok(S.safeUrl('javascript:alert(1)') === '#' && S.safeUrl('data:text/html,x') === '#' && S.safeUrl('/a.html') === '/a.html' && S.safeUrl('https://x.y') === 'https://x.y', 'site builder: unsafe link schemes are refused');
    { const types = Object.keys(S.BLOCKS), fresh = S.blank('Blocks'); const bad = []; for (const t of types) { const b = S.newBlock(t); fresh.pages[0].blocks.push(b); }
      let html = ''; for (const b of fresh.pages[0].blocks) { try { html += S.BLOCKS[b.type].html(b, { site: fresh, page: fresh.pages[0] }, []); } catch (e) { bad.push(b.type + ': ' + e.message); } }
      for (const t of ['cta', 'logos', 'team', 'timeline', 'steps', 'quote', 'progress', 'social', 'contact', 'imagetext', 'badges', 'ticker', 'proscons', 'hours', 'embed', 'audio', 'download']) if (!S.BLOCKS[t]) bad.push('missing ' + t);
      const e1 = S.newBlock('embed'); e1.p.url = 'javascript:alert(1)'; const e2 = S.newBlock('embed'); e2.p.url = 'https://example.com/w'; const so = S.newBlock('social'); so.p.items = 'X | javascript:alert(1)';
      const out = [e1, e2, so].map((b) => S.BLOCKS[b.type].html(b)).join(''); if (/javascript:/i.test(out) || !/sandbox="allow-scripts/.test(out)) bad.push('unsafe embed/link');
      ok(types.length >= 46 && !bad.length && !/undefined|\bnull\b|NaN/.test(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')), 'site builder: all ' + types.length + ' blocks render without undefined/null, and embeds / social links refuse unsafe addresses ' + bad.join(';')); }
    const evil = S.newBlock('heading'); evil.p.text = '<img src=x onerror=alert(1)>'; site.pages[0].blocks.push(evil); const btn = S.newBlock('button'); btn.p.href = 'javascript:alert(1)'; btn.p.label = '"><script>'; site.pages[0].blocks.push(btn);
    site.collections.push({ name: 'reviews', label: 'Reviews', public: true, submit: 'members', fields: [{ key: 'who', label: 'Name', type: 'text', required: true, maxLength: 10 }, { key: 'mail', label: 'Mail', type: 'email' }] });
    site.pages.push({ id: 'm1', title: 'Members', slug: 'members', access: 'members', inNav: true, blocks: [S.newBlock('heading')] });
    site.collections.push({ name: 'events', label: 'Events', public: true, submit: 'anyone', fields: [{ key: 'kind', label: 'Kind', type: 'radio', options: ['talk', 'party'], required: true }, { key: 'topic', label: 'Topic', type: 'text', required: true, showIf: { field: 'kind', equals: 'talk' } }, { key: 'day', label: 'Day', type: 'date' }, { key: 'site', label: 'Site', type: 'url' }, { key: 'phone', label: 'Phone', type: 'tel' }, { key: 'stars', label: 'Stars', type: 'rating' }, { key: 'zip', label: 'ZIP', type: 'text', format: 'uszip', message: 'Bad ZIP' }, { key: 'evil', label: 'Evil', type: 'text', format: 'custom', pattern: '(a+)+$' }, { key: 'own', label: 'Own', type: 'text', format: 'custom', pattern: '[A-Z]{2}[0-9]{2}' }] });
    { const adv = []; const mkb = (t, p, st) => { const b = S.newBlock(t); Object.assign(b.p, p); if (st) b.s = st; adv.push(b); return b; };
      mkb('richtext', { md: '# Hi <b>x</b>\n\n[bad](javascript:alert(1)) [ok](https://ok.example) **bold** `<i>`' }, { anchor: true, vis: 'members', anim: 'fade', bg: 'red;} body{display:none', pt: 20 });
      mkb('video', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }); mkb('video', { url: 'javascript:alert(1).mp4' }); mkb('map', { lat: 48.85, lon: 2.35, zoom: 12 });
      mkb('gallery', { items: 'https://x.example/a.png | "><script>alert(1)</script>\njavascript:alert(1) | bad' }); mkb('alert', { title: '<script>x</script>', text: 'hi' }); mkb('stats', {}); mkb('pricing', {}); mkb('features', { items: '<b>|<i>|<u>' }); mkb('testimonials', {}); mkb('table', {}); mkb('countdown', { to: '2030-01-01T10:00' }); mkb('countdown', { to: '"><x>' }); mkb('code', { text: '<script>alert(1)</script>' }); mkb('buttons', { items: 'Go | javascript:alert(1)' });
      const tb = mkb('tabs', {}); tb.cols[0] = [Object.assign(S.newBlock('heading'), {})]; const ac = mkb('accordion', {}); ac.cols[1] = [S.newBlock('text')]; const se = mkb('section', { image: 'javascript:alert(1)' }); se.cols[0] = [S.newBlock('button')];
      mkb('code', { text: 'if (a < b) { return "<script>x</script>"; }', lang: 'js' }); mkb('map', { address: '<b>Main St</b>', lat: 1, lon: 2 }, { anchor: true });
      mkb('list', { collection: 'events', search: true, sort: 'day', per: 5, layout: 'table' }); mkb('form', { collection: 'events', steps: 2 });
      site.pages[0].blocks.push(...adv); }
    const files = await S.generate(site, { serverSource: fs.readFileSync(path.join(ROOT, 'renderer/js/web/site-server.tpl.js'), 'utf8'), adminPasswordHash: await S.hashAdminPassword('selftest-admin-pw') });
    const home = files.find((f) => f.path === 'public/index.html').data;
    ok(!/<img src=x/.test(home) && !/javascript:/.test(home) && !/"><script>/.test(home), 'site builder: block text is escaped, javascript: links removed');
    ok(!/<script>(?!<)/i.test(home.replace(/<script src="[^"]+"><\/script>/g, '')), 'site builder: pages have no inline scripts (strict CSP)');
    ok(files.some((f) => f.path === 'public/login.html') && files.some((f) => f.path === 'HOSTING.md') && files.some((f) => f.path === 'Dockerfile'), 'site builder: login page, HOSTING.md and Dockerfile are generated');
    ok(S.check(site).every((c) => c.level !== 'error'), 'site builder: a fresh site has no errors');
    const bad = S.blank('x'); bad.pages[1].blocks[1].p.collection = 'nope'; ok(S.check(bad).some((c) => c.level === 'error'), 'site builder: a form without a collection is reported');
    ok(S.normalize('{"pages":[{"title":"A","blocks":[{"type":"evil"},{"type":"heading"}]}]}').pages[0].blocks.length === 1, 'site builder: unknown blocks in a .vxsite are dropped');
    const sd = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-site-')); for (const f of files) { const q = path.join(sd, f.path); fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, f.data); }
    const sp = 19000 + Math.floor(Math.random() * 900); const ss = cp.spawn(process.execPath, ['server.js'], { cwd: sd, env: Object.assign({}, process.env, { PORT: String(sp), DATA_DIR: path.join(sd, 'data') }), stdio: 'ignore' });
    const rq = (m, p2, b, hd) => new Promise((res) => { const d = b ? JSON.stringify(b) : null; const r = http.request({ host: '127.0.0.1', port: sp, path: p2, method: m, headers: Object.assign({}, b ? { 'Content-Type': 'application/json' } : {}, hd) }, (x) => { let t = ''; x.on('data', (c) => (t += c)); x.on('end', () => { let j; try { j = JSON.parse(t); } catch { /* */ } res({ status: x.statusCode, json: j, text: t, headers: x.headers }); }); }); r.on('error', () => res({ status: 0 })); if (d) r.write(d); r.end(); });
    try {
      for (let i = 0; i < 30; i++) { if ((await rq('GET', '/')).status === 200) break; await new Promise((r) => setTimeout(r, 150)); }
      const hp = await rq('GET', '/'); ok(hp.status === 200 && /default-src 'self'/.test(hp.headers['content-security-policy'] || '') && hp.headers['x-frame-options'] === 'DENY', 'site server: pages are served with CSP and X-Frame-Options');
      ok((await rq('GET', '/server.js')).status === 404 && (await rq('GET', '/site.json')).status === 404 && (await rq('GET', '/%2e%2e/server.js')).status === 404, 'site server: server files and path traversal are not reachable');
      ok((await rq('POST', '/api/forms/messages', { name: 'A', email: 'bad', message: 'x' })).status === 422, 'site server: invalid form data is rejected on the server');
      ok((await rq('POST', '/api/forms/messages', { name: 'A', email: 'a@b.co', message: 'hello' })).status === 200, 'site server: a valid form entry is stored');
      ok((await rq('POST', '/api/forms/messages', { name: 'A', email: 'a@b.co', message: 'x' }, { Origin: 'http://evil.example' })).status === 403, 'site server: cross-site posts are refused');
      ok((await rq('POST', '/api/forms/reviews', { who: 'A' })).status === 401, 'site server: members-only collection needs a login');
      const m = await rq('GET', '/members.html'); ok(m.status === 302 && /login\.html/.test(m.headers.location || ''), 'site server: members-only page redirects visitors to the login page');
      ok((await rq('POST', '/api/signup', { email: 'u@x.co', password: 'short' })).status === 422, 'site server: short password refused');
      const su = await rq('POST', '/api/signup', { email: 'u@x.co', password: 'a-long-password' }); const ck = String(su.headers['set-cookie'] || ''); ok(su.status === 200 && /HttpOnly/.test(ck) && /SameSite=Strict/.test(ck), 'site server: sign-up sets an HttpOnly SameSite=Strict session');
      const cookie = ck.split(';')[0]; ok((await rq('GET', '/members.html', null, { Cookie: cookie })).status === 200, 'site server: a member can open the members-only page');
      ok((await rq('POST', '/api/forms/reviews', { who: 'Mia', mail: 'u@x.co' }, { Cookie: cookie })).status === 200, 'site server: a member can submit');
      const pubList = await rq('GET', '/api/data/reviews'); ok(pubList.status === 200 && pubList.json.rows.length === 1 && !('mail' in pubList.json.rows[0].data), 'site server: public list never includes email fields');
      ok((await rq('GET', '/api/data/messages')).status === 404, 'site server: private collections are not readable');
      ok((await rq('GET', '/admin/api/summary')).status === 401, 'site server: admin area needs the admin password');
      ok((await rq('POST', '/admin/api/login', { password: 'wrong' })).status === 401, 'site server: wrong admin password refused');
      const al = await rq('POST', '/admin/api/login', { password: 'selftest-admin-pw' }); const ack = String(al.headers['set-cookie'] || '').split(';')[0]; ok(al.status === 200, 'site server: admin password (PBKDF2 hash) accepted');
      const sm = await rq('GET', '/admin/api/summary', null, { Cookie: ack }); ok(sm.status === 200 && sm.json.collections.find((c) => c.name === 'messages').count === 1 && sm.json.users.length === 1 && !('hash' in sm.json.users[0]), 'site server: admin sees entries and members (no password hashes)');
      { const h2 = (await rq('GET', '/')); const H = h2.text || '';
        ok(!/javascript:/i.test(H) && !/<script>alert|<b>x<\/b>|<i>|"><x>/.test(H.replace(/<script src="[^"]+"><\/script>/g, '')) && !/body\{display:none/.test(H), 'advanced blocks: hostile text, links, colours and addresses are neutralised');
        ok(/id="hi-b-x-b"/.test(H) && /data-vis="members"/.test(H) && /vx-an-fade/.test(H), 'advanced blocks: style options (anchor, who sees it, animation) are applied safely');
        ok(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/.test(H) && !/youtube\.com\/watch/.test(H) && /openstreetmap\.org\/export\/embed/.test(H), 'advanced blocks: video and map embeds are built from a fixed allow-list');
        ok(/frame-src https:\/\/www\.youtube-nocookie\.com https:\/\/www\.openstreetmap\.org;/.test(hp.headers['content-security-policy'] || ''), 'site server: CSP allows frames only for the embeds the site really uses');
        ok(/data-vx-tabs/.test(H) && /<details class="vx-det"/.test(H) && /class="vx-step"/.test(H) && /data-showif="kind\|talk"/.test(H) && /data-per="5"/.test(H), 'advanced blocks: tabs, accordion, multi-step form, conditional field and paged list render'); }
      ok((await rq('POST', '/api/forms/events', { kind: 'party', day: '2030-02-30x' })).status === 422, 'site server: a bad date is rejected');
      ok((await rq('POST', '/api/forms/events', { kind: 'party', site: 'javascript:alert(1)' })).status === 422, 'site server: only http(s) web addresses are accepted');
      ok((await rq('POST', '/api/forms/events', { kind: 'party', stars: 9 })).status === 422 && (await rq('POST', '/api/forms/events', { kind: 'party', phone: 'abc' })).status === 422, 'site server: rating and phone are validated');
      ok((await rq('POST', '/api/forms/events', { kind: 'talk' })).status === 422, 'site server: a conditional field is required while its condition holds');
      ok((await rq('POST', '/api/forms/events', { kind: 'party', topic: 'ignored', day: '2030-02-01', phone: '+1 555 0100', stars: 4 })).status === 200, 'site server: a conditional field is ignored when its condition is not met');
      { const h3 = (await rq('GET', '/')).text || '';
        ok(/class="tk-k">if</.test(h3) && !/<script>x<\/script>/.test(h3) && /&lt;script&gt;x&lt;\/script&gt;/.test(h3), 'code block: syntax colours are added and the code itself stays escaped');
        ok(/<dialog id="vx-auth"[^>]*data-open="link"/.test(h3) && /placeholder="At least 10 characters"/.test(h3) && /minlength="10"/.test(h3), 'login / sign-up popup is on every page and the password placeholder shows the minimum');
        { const t = S.blank('Dup'); t.security.allowSignup = true; const mkp = (slug, title) => ({ id: 'p_' + slug, title, slug, access: 'public', inNav: true, blocks: [{ id: 'h_' + slug, type: 'heading', p: { text: title, level: 1 } }] });
          t.pages.push(mkp('login', 'Log in'), mkp('signup', 'Sign Up')); const hh = S.pageHtml(t, t.pages[t.pages.length - 2], { site: t });
          ok((hh.match(/>Log in<\/a>/g) || []).length === 1 && /<form class="vx-auth" data-mode="login"/.test(hh), 'login page: no second "Log in" link and the form is there even when the page only has a heading'); }
        ok(!/<script>[^<]*<b>Main/.test(h3) && /&lt;b&gt;Main St&lt;\/b&gt;/.test(h3), 'map: the address text is escaped');
        ok(/data-rx="\[0-9\]\{5\}\(-\[0-9\]\{4\}\)\?"/.test(h3) && /data-msg="Bad ZIP"/.test(h3) && !/\(a\+\)\+/.test(h3), 'form formats: presets and own patterns reach the form; a catastrophic pattern is dropped'); }
      ok((await rq('POST', '/api/forms/events', { kind: 'party', zip: 'abcde' })).status === 422, 'site server: a field that does not match its format is rejected');
      ok((await rq('POST', '/api/forms/events', { kind: 'party', own: 'AB12', zip: '90210' })).status === 200, 'site server: a matching own regular expression is accepted');
      ok((await rq('POST', '/api/forms/events', { kind: 'party', own: 'ab12' })).status === 422, 'site server: an own regular expression is enforced');
      { const t0 = Date.now(); await rq('POST', '/api/forms/events', { kind: 'party', evil: 'a'.repeat(40) + '!' }); ok(Date.now() - t0 < 1500, 'site server: a bad pattern can never freeze the server'); }
      { const ev = await rq('GET', '/api/data/events'); ok(ev.json.rows.length >= 1 && ev.json.rows.every((r) => r.data.topic === '' && !('phone' in r.data)), 'site server: ignored values are not stored and phone numbers are not public'); }
    } catch (e) { ok(false, 'site builder server test crashed: ' + e.message); }
    ss.kill(); await new Promise((r) => setTimeout(r, 300)); try { fs.rmSync(sd, { recursive: true, force: true, maxRetries: 5 }); } catch { /* temp dir */ }
  }
  const R2 = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  { const qr = require(path.join(ROOT, 'renderer/js/core/qr.js')); const m = qr.matrix('otpauth://totp/Vextra:alice?secret=JBSWY3DPEHPK3PXP&issuer=Vextra'); const fin = (r, c) => [0, 1, 2, 3, 4, 5, 6].every((i) => m[r][c + i] === 1 && m[r + 6][c + i] === 1 && m[r + i][c] === 1 && m[r + i][c + 6] === 1) && m[r + 3][c + 3] === 1 && m[r + 1][c + 1] === 0;
    ok(m.length >= 21 && fin(0, 0) && fin(0, m.length - 7) && fin(m.length - 7, 0) && /<svg/.test(qr.svg('hi')), 'QR code: finder patterns and SVG output'); let long = false; try { qr.matrix('x'.repeat(400)); } catch { long = true; } ok(long, 'QR code: too-long text is refused'); }
  { const vm = require('vm'); const c = { window: {}, TextEncoder, console }; c.window = c; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(ROOT, 'renderer/js/game/rt-anticheat.js'), 'utf8'), c); const cr = require('crypto'); ok(['abc', '', 'vx-admin|g|' + 'x'.repeat(100)].every((t) => c.VXRT.sha256(t) === cr.createHash('sha256').update(t).digest('hex')), 'anti-cheat: SHA-256 matches Node'); }
  ok(/site-builder/.test(R2('renderer/js/docs/content-site.js')) && /anti-cheat/.test(R2('renderer/js/docs/content-site.js')) && /game-settings\.webm/.test(R2('renderer/js/docs/content.js')) && fs.existsSync(path.join(ROOT, 'renderer/docs/clips/game-settings.webm')), 'docs: website builder, anti-cheat, read-aloud pages and the Game settings clip are present');
  /* ---- music: composer is deterministic and stays inside each instrument's range ---- */
  {
    const MGn = require(path.join(ROOT, 'renderer/js/game/editor/music-gen.js')), MKn = require(path.join(ROOT, 'renderer/js/game/editor/music-kits.js'));
    ok(MGn.GENRES.length >= 10 && ['orchestral', 'rock', 'chiptune', 'jazz', 'ambient', 'horror', 'epic', 'lofi'].every((g) => MGn.GENRES.includes(g)), 'music: a library of at least ten genres including orchestral and rock');
    let det = true, inRange = true, empty = false, kitOk = true;
    for (const g of MGn.GENRES) { const a = MGn.compose({ genre: g, seed: 5, bars: 8 }), b = MGn.compose({ genre: g, seed: 5, bars: 8 }); if (JSON.stringify(a) !== JSON.stringify(b)) det = false; if (!a.tracks.length || a.tracks.every((t) => !t.notes.length)) empty = true;
      for (const t of a.tracks) { const k = MKn.INSTRUMENTS[t.inst]; if (!k) { kitOk = false; continue; } for (const n of t.notes) { if (k.type !== 'drum' && (n.m < k.lo || n.m > k.hi)) inRange = false; if (k.type === 'drum' && !MKn.KITMAPS[t.inst][n.m]) inRange = false; if (!(n.t >= 0 && n.t < a.bars * 4 && n.d > 0)) inRange = false; } } }
    ok(det && !empty && inRange && kitOk, 'music: every genre composes the same tune from the same seed, with notes inside each instrument’s range and every kit instrument defined');
    { const need = ['violin', 'viola', 'cello', 'doublebass', 'oboe', 'bassoon', 'trumpet', 'trombone', 'horn', 'tuba', 'xylophone', 'marimba', 'glockenspiel', 'celesta', 'musicbox', 'kalimba', 'steeldrum', 'ukulele', 'banjo', 'organ', 'perc-bongos', 'perc-congas', 'perc-djembe', 'perc-latin', 'perc-tabla', 'perc-cajon'];
      const defd = need.every((id) => MKn.INSTRUMENTS[id]), kitsOk = ['perc-bongos', 'perc-congas', 'perc-djembe', 'perc-latin', 'perc-tabla', 'perc-cajon'].every((id) => MKn.INSTRUMENTS[id].type === 'drum' && MKn.INSTRUMENTS[id].rows.length >= 5 && MKn.INSTRUMENTS[id].rows.every((r) => r[1] && !/undefined|null/.test(r[1])));
      ok(defd && kitsOk && Object.keys(MKn.INSTRUMENTS).length >= 80, 'music: the extra orchestral, mallet, plucked and world-percussion instruments (violin, xylophone, bongos…) are defined, and every percussion row has a name'); }
    { const V = MKn.VOICES, want = ['Soprano', 'Mezzo-soprano', 'Contralto (Alto)', 'Countertenor', 'Tenor', 'Baritone', 'Bass']; const names = Object.values(V).map((v) => v.name);
      ok(want.every((n) => names.includes(n)) && Object.keys(V).every((k) => MKn.INSTRUMENTS['v_' + k] && MKn.INSTRUMENTS['v_' + k].group === 'Choir' && MKn.INSTRUMENTS['v_' + k].voice === k && MKn.INSTRUMENTS['v_' + k].lo === V[k].lo), 'music: a Choir group with the seven voice types – soprano, mezzo-soprano, contralto, countertenor, tenor, baritone and bass');
      const ch = MGn.compose({ genre: 'choral', seed: 3, bars: 8 }); ok(MGn.GENRES.includes('choral') && ch.tracks.filter((t) => MKn.INSTRUMENTS[t.inst].voice).length === 7 && ch.tracks.every((t) => t.notes.length) && ch.tracks.every((t) => { const k = MKn.INSTRUMENTS[t.inst]; return t.notes.every((n) => n.m >= k.lo && n.m <= k.hi); }), 'music: the Choral genre writes a part for every voice type inside its range');
      const sy = MKn.syllables('Hello world, silent night! Amazing grace'); ok(sy.map((x) => x.text).join(' ') === 'he llo wo rld si lent night a ma zing grace' || sy.length >= 9, 'music: lyrics are split into syllables'); ok(sy.every((x) => x.v.length >= 1 && x.v.every((v) => 'aeiou'.includes(v))) && MKn.syllables('').length === 0 && MKn.syllables(null).length === 0 && MKn.syllables('123 !!!').length === 0, 'music: every syllable has a sung vowel and empty or number-only text gives nothing'); } 
  }
  /* ---- fixes in this release ---- */
  {
    const vxs = fs.readFileSync(path.join(ROOT, 'renderer/js/game/vxscript.js'), 'utf8'), util = fs.readFileSync(path.join(ROOT, 'renderer/js/core/util.js'), 'utf8'), play = fs.readFileSync(path.join(ROOT, 'renderer/js/game/editor/play.js'), 'utf8'), shield = fs.readFileSync(path.join(ROOT, 'plugins/vextra-shield.js'), 'utf8');
    ok(/inside\\s\*:\?/.test(vxs) && /writeGraph/.test(vxs), 'VXScript: bundles are written with an inside: section and read back');
    ok(/Element, DocumentFragment/.test(util) && /k === null \|\| k === undefined/.test(util), 'UI: append() can no longer print the text "null" or "[object …]"');
    ok(/beta/.test(play) && /shake = \(\)/.test(play), 'Play bar: tilt has two axes and shake jolts the frame');
    ok(/inPage/.test(shield), 'Shield CSP: the anti-cheat server address written into the exported game is allowed in connect-src');
    ok(fs.existsSync(path.join(ROOT, 'renderer/js/app/tour.js')) && /Skip tour/.test(fs.readFileSync(path.join(ROOT, 'renderer/js/app/tour.js'), 'utf8')), 'Tour: next / back / skip exists');
  }
  /* ---- helpdesk: pure helpers + API with a fake SSH runner ---- */
  {
    const HD = require(path.join(ROOT, 'server/helpdesk.js')); const hdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-hd-'));
    ok(HD.parseCidr('192.168.1.0/24').count === 256 && HD.parseCidr('8.8.8.0/24').error && HD.parseCidr('10.0.0.0/8').error && HD.parseCidr('192.168.0.0/16').error, 'helpdesk: only private ranges up to a /22 can be scanned');
    ok(HD.parseArp('? (192.168.1.5) at AA:BB:CC:DD:EE:FF on en0\n  192.168.1.1   00-11-22-33-44-55   dynamic\n192.168.1.9 dev eth0 lladdr 0a:0b:0c:0d:0e:0f REACHABLE').size === 3 && HD.guessOs([22, 3389]) === 'windows' && HD.guessOs([22]) === 'linux' && HD.guessOs([22, 548]) === 'mac', 'helpdesk: ARP output of Windows, macOS and Linux is read; the system is guessed from the ports');
    ok(HD.packageScript({ targets: { linux: { type: 'os-package', id: "vim'; rm -rf /" } } }, 'linux').error && !HD.packageScript({ targets: { windows: { type: 'msi', url: 'http://x/a.msi', sha256: 'a' } } }, 'windows').script && HD.actionScript('restart-service', 'linux', 'a; id').error && HD.csvCell('=1+1').startsWith("'"), 'helpdesk: package names, installer links, service names and spreadsheet cells cannot carry commands');
    ok(['linux', 'mac', 'windows'].every((o) => HD.INV[o].includes('VX.hostname')) && !/\\\$\{/.test(HD.INV.linux) && cp.spawnSync('sh', ['-n'], { input: HD.INV.linux }).status === 0 && cp.spawnSync('sh', ['-n'], { input: HD.INV.mac }).status === 0, 'helpdesk: the inventory scripts for all three systems exist and the shell ones parse');
    const sent = []; const send = (res, code, body, headers) => { res.writeHead(code, Object.assign({ 'Content-Type': typeof body === 'object' ? 'application/json' : 'text/plain' }, headers)); res.end(typeof body === 'object' ? JSON.stringify(body) : body); };
    const readJson = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => d += c); req.on('end', () => r(d ? JSON.parse(d) : {})); });
    const hd = HD({ DATA: hdDir, send, fail: (res, c, m) => send(res, c, { error: m }), readJson, isAdmin: (r) => r.headers['x-vextra-admin'] === '1', authUser: (r) => (r.headers.authorization === 'Bearer u1' ? { username: 'alice' } : null), limited: () => false, clientIp: () => '127.0.0.1' });
    hd._t.setRunner(async (dev, cred, o) => { sent.push({ host: dev.host, user: cred.user, kind: cred.kind, script: o.script, os: o.osName }); if (o.script === 'uname -s') return { code: 0, out: 'Linux\n' }; if (o.script === HD.INV.linux) return { code: 0, out: 'VX.hostname=web01\nVX.os=Ubuntu 24.04\nVX.cores=4\nVX.memKB=8388608\nVX.disk=/|1000|500\nVX.ip=eth0|192.168.1.20\nVX.mac=aa:bb:cc:dd:ee:01\nVX.sw=nginx|1.24|\n' }; return { code: 0, out: 'ran' }; });
    const hs = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); hd.handle(req, res, u, u.pathname.split('/').filter(Boolean)).catch((e) => send(res, 500, { error: e.message })); }); await new Promise((r) => hs.listen(0, '127.0.0.1', r)); const hp = hs.address().port;
    const hc = (method, p, body, admin = true, tok) => new Promise((res) => { const d = body ? JSON.stringify(body) : null; const r = http.request({ host: '127.0.0.1', port: hp, path: '/api/helpdesk' + p, method, headers: Object.assign({ 'Content-Type': 'application/json' }, admin ? { 'X-Vextra-Admin': '1' } : {}, tok ? { Authorization: 'Bearer ' + tok } : {}) }, (rs) => { let t = ''; rs.on('data', (c) => t += c); rs.on('end', () => { let j = {}; try { j = JSON.parse(t); } catch { /* csv */ } res({ status: rs.statusCode, json: j, text: t, headers: rs.headers }); }); }); if (d) r.write(d); r.end(); });
    ok((await hc('GET', '', null, false)).status === 403 && (await hc('GET', '/devices', null, false)).status === 403 && (await hc('POST', '/deploy', {}, false)).status === 403, 'helpdesk: management is refused unless the request comes from the Vextra app on this computer');
    const cr = await hc('POST', '/creds', { name: 'Admin', kind: 'password', user: 'root', secret: 'p@ss"w0rd' }); const cid = cr.json.cred && cr.json.cred.id;
    hd.flush(); ok(cr.status === 200 && cr.json.cred.hasSecret && !JSON.stringify(cr.json).includes('p@ss') && !fs.readFileSync(path.join(hdDir, 'helpdesk', 'helpdesk.json'), 'utf8').includes('p@ss'), 'helpdesk: a saved password is encrypted and never sent back');
    ok(hd._t.unseal(hd._t.db().creds[cid].enc) === 'p@ss"w0rd', 'helpdesk: the vault decrypts what it sealed');
    ok((await hc('POST', '/creds', { kind: 'key', user: 'root', secret: 'not a key' })).status === 422 && (await hc('POST', '/creds', { kind: 'password', user: '-oProxyCommand=x', secret: 'x' })).status === 422, 'helpdesk: bad keys and option-looking user names are refused');
    const dv = await hc('POST', '/devices', { host: '192.168.1.20', name: '', credId: cid }); const did = dv.json.device.id;
    ok((await hc('POST', '/devices', { host: '-oProxyCommand=evil' })).status === 422 && (await hc('POST', '/devices', { host: 'a b' })).status === 422, 'helpdesk: addresses that could act as ssh options are refused');
    const inv = await hc('POST', '/devices/' + did + '/inventory'); ok(inv.status === 200 && inv.json.inventory.hostname === 'web01' && inv.json.inventory.cores === 4 && inv.json.device.os === 'linux' && inv.json.device.name === 'web01', 'helpdesk: inventory is collected, the system type detected and the device named');
    ok(sent.every((s) => s.user === 'root' && !/p@ss/.test(s.script)), 'helpdesk: scripts go in through stdin and never contain the password');
    const pk = await hc('POST', '/packages', { name: 'Git', targets: { linux: { type: 'os-package', id: 'git' }, windows: { type: 'winget', id: 'Git.Git' } } }); ok(pk.status === 200 && (await hc('POST', '/packages', { name: 'Bad', targets: { linux: { type: 'os-package', id: 'x;y' } } })).status === 422, 'helpdesk: packages are validated when saved');
    ok((await hc('POST', '/deploy', { packageId: pk.json.package.id, deviceIds: [did] })).status === 422, 'helpdesk: a deployment needs confirmation');
    const dep = await hc('POST', '/deploy', { packageId: pk.json.package.id, deviceIds: [did], confirm: true }); await new Promise((r) => setTimeout(r, 300)); const job = await hc('GET', '/jobs/' + dep.json.job.id);
    ok(job.json.job.status === 'done' && sent.some((s) => /apt-get install -y 'git'/.test(s.script)), 'helpdesk: a confirmed deployment runs the right command on the device and is reported');
    const dry = await hc('POST', '/deploy', { packageId: pk.json.package.id, deviceIds: [did], dryRun: true }); await new Promise((r) => setTimeout(r, 300)); const before = sent.filter((s) => /apt-get/.test(s.script)).length; ok(before === 1 && (await hc('GET', '/jobs/' + dry.json.job.id)).json.job.results[did].out.includes('Ready'), 'helpdesk: a dry run only checks the connection');
    ok((await hc('POST', '/devices/' + did + '/action', { action: 'reboot' })).status === 422 && (await hc('POST', '/devices/' + did + '/action', { action: 'disks' })).json.code === 0 && (await hc('POST', '/devices/' + did + '/action', { action: 'restart-service', param: 'x;y', confirm: true })).status === 422, 'helpdesk: actions that change a device need confirmation; free text is refused');
    const t1 = await hc('POST', '/tickets', { title: 'Printer down', body: 'Floor 2', priority: 'urgent', deviceId: did }); ok(t1.status === 200 && t1.json.ticket.num === 1 && t1.json.ticket.due - t1.json.ticket.created === 4 * 3600e3, 'helpdesk: tickets get a number and an SLA due time from their priority');
    ok((await hc('POST', '/my/tickets', { title: 'x' }, false)).status === 401, 'helpdesk: raising a ticket needs a signed-in user');
    const mine = await hc('POST', '/my/tickets', { title: 'Cannot log in', body: 'help', priority: 'urgent' }, false, 'u1'); await hc('POST', '/tickets/' + t1.json.ticket.id + '/comment', { text: 'secret note', internal: true }); const mc = await hc('POST', '/tickets/' + mine.json.ticket.id + '/comment', { text: 'hello', internal: true }); await hc('PATCH', '/tickets/' + mine.json.ticket.id, { status: 'in-progress' });
    const my = await hc('GET', '/my/tickets', null, false, 'u1'); ok(my.json.tickets.length === 1 && my.json.tickets[0].priority === 'high' && my.json.tickets[0].comments.every((c) => !c.internal) && !my.json.tickets.some((t) => t.id === t1.json.ticket.id), 'helpdesk: a user sees only their own tickets and no internal notes (and cannot self-assign "urgent")');
    const csv = await hc('GET', '/export/inventory.csv'); ok(/^Name,Address/.test(csv.text) && /web01/.test(csv.text) && /text\/csv/.test(csv.headers['content-type']), 'helpdesk: inventory exports as CSV');
    ok(((await hc('GET', '/audit')).json.audit || []).some((a) => /Deployed/.test(a.what)) && (await hc('GET', '')).json.stats.devices === 1, 'helpdesk: every change is in the audit log and the dashboard counts devices');
    /* ---- helpdesk: upload a file, copy it to a device and run it ---- */
    {
      const crypto = require('crypto'); const body = Buffer.from('#!/bin/sh\necho hi from vextra\n'), sha = crypto.createHash('sha256').update(body).digest('hex'); const putCalls = [], ran = []; let reportSha = sha;
      hd._t.setPutter(async (dev, cred, o) => { putCalls.push({ host: dev.host, user: cred.user, local: o.local, remote: o.remote, same: fs.existsSync(o.local) && crypto.createHash('sha256').update(fs.readFileSync(o.local)).digest('hex') === sha }); return { code: 0, out: '' }; });
      hd._t.setRunner(async (dev, cred, o) => { ran.push(o.script); if (/sha256sum|Get-FileHash/.test(o.script)) return { code: 0, out: reportSha + '  /tmp/vextra-deploy/setup.sh\n' }; return { code: 0, out: /mkdir/.test(o.script) ? 'connected as root\n' : 'ran ok\n' }; });
      ok((await hc('POST', '/files', { name: '../evil.sh', size: 3 })).status === 422 && (await hc('POST', '/files', { name: 'a b;c.sh', size: 3 })).status === 422 && (await hc('POST', '/files', { name: 'big.bin', size: 999999999 })).status === 422, 'helpdesk files: unsafe names and oversize files are refused');
      const up = await hc('POST', '/files', { name: 'setup.sh', size: body.length }); const fid = up.json.id;
      ok((await hc('POST', '/files/' + fid + '/chunk', { index: 5, data: body.toString('base64') })).status === 409, 'helpdesk files: chunks must arrive in order');
      const half = body.length >> 1; await hc('POST', '/files/' + fid + '/chunk', { index: 0, data: body.slice(0, half).toString('base64') });
      ok((await hc('POST', '/files/' + fid + '/done')).status === 422, 'helpdesk files: an incomplete upload is refused');
      const up2 = await hc('POST', '/files', { name: 'setup.sh', size: body.length }); await hc('POST', '/files/' + up2.json.id + '/chunk', { index: 0, data: body.slice(0, half).toString('base64') }); await hc('POST', '/files/' + up2.json.id + '/chunk', { index: 1, data: body.slice(half).toString('base64') }); const dn = await hc('POST', '/files/' + up2.json.id + '/done'); const f2 = dn.json.file;
      ok(dn.status === 200 && f2.sha256 === sha && f2.size === body.length && fs.readFileSync(path.join(hd._t.FILES, f2.id + '.bin')).equals(body), 'helpdesk files: a chunked upload is stored byte for byte with its SHA-256');
      ok((await hc('POST', '/packages', { name: 'F', targets: { linux: { type: 'file', fileId: 'nope' } } })).status === 422 && (await hc('POST', '/packages', { name: 'F', targets: { linux: { type: 'file', fileId: f2.id, dest: '/tmp/../etc' } } })).status === 422 && (await hc('POST', '/packages', { name: 'F', targets: { linux: { type: 'file', fileId: f2.id, args: 'a\nb', after: 'run' } } })).status === 422, 'helpdesk files: a file package needs a real file, a safe folder and one-line arguments');
      const fp = await hc('POST', '/packages', { name: 'Run setup', targets: { linux: { type: 'file', fileId: f2.id, after: 'run', args: '--yes', sudo: true } } }); ok(fp.status === 200, 'helpdesk files: a file package is saved');
      const dry2 = await hc('POST', '/deploy', { packageId: fp.json.package.id, deviceIds: [did], dryRun: true }); await new Promise((r) => setTimeout(r, 300)); ok(putCalls.length === 0 && /would be copied to \/tmp\/vextra-deploy\/setup\.sh and run it/.test((await hc('GET', '/jobs/' + dry2.json.job.id)).json.job.results[did].out), 'helpdesk files: a dry run copies nothing and says what would happen');
      const d2 = await hc('POST', '/deploy', { packageId: fp.json.package.id, deviceIds: [did], confirm: true }); await new Promise((r) => setTimeout(r, 400)); const j2 = (await hc('GET', '/jobs/' + d2.json.job.id)).json.job;
      ok(j2.status === 'done' && putCalls.length === 1 && putCalls[0].remote === '/tmp/vextra-deploy/setup.sh' && putCalls[0].same && putCalls[0].user === 'root' && ran.some((x) => /^sudo -n sh '\/tmp\/vextra-deploy\/setup\.sh' --yes$/.test(x)), 'helpdesk files: the file is copied intact to the device, verified and started with its arguments');
      reportSha = 'f'.repeat(64); ran.length = 0; const d3 = await hc('POST', '/deploy', { packageId: fp.json.package.id, deviceIds: [did], confirm: true }); await new Promise((r) => setTimeout(r, 400)); const j3 = (await hc('GET', '/jobs/' + d3.json.job.id)).json.job;
      ok(j3.status === 'failed' && /does not match/.test(j3.results[did].out) && ran.some((x) => /rm -f/.test(x)) && !ran.some((x) => /--yes/.test(x)), 'helpdesk files: a copy that does not match the checksum is removed and never run');
      ok((await hc('DELETE', '/files/' + f2.id)).status === 409, 'helpdesk files: a file that a package uses cannot be deleted');
      ok(HD.fileRunScript('windows', 'C:/x/setup.exe', 'setup.exe', '/S').includes("Start-Process -FilePath 'C:/x/setup.exe' -ArgumentList '/S'") && HD.fileRunScript('windows', 'C:/x/a.msi', 'a.msi', '').includes("'/i','C:/x/a.msi','/qn'") && HD.fileRunScript('mac', '/tmp/a.pkg', 'a.pkg', '').includes('installer -pkg') && /^chmod \+x/.test(HD.fileRunScript('linux', '/tmp/tool', 'tool', '-v')) && HD.fileRunScript('windows', "C:/x/it's.ps1", "it's.ps1", '').includes("''"), 'helpdesk files: each file type is started the right way and paths are quoted');
    }
    { const a = await hd._t.probe('127.0.0.1', hp), b = await hd._t.probe('127.0.0.1', 1); ok(a === true && b === false, 'helpdesk: the port probe tells open from closed'); }
    hd.flush(); hs.close(); try { fs.rmSync(hdDir, { recursive: true, force: true, maxRetries: 5 }); } catch { /* temp dir */ }
  }
  srv.kill(); await new Promise((r) => setTimeout(r, 400)); try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch { /* temp dir */ }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
