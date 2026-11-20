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
  { ctx.VX.esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); load('js/designer/components.js');
    const out = ctx.VX.components.uiToHTML({ width: 1000, height: 600, bg: '#101010', items: [
      { id: 'a', type: 'navbar', x: 0, y: 0, w: 1000, h: 56, rot: 0, props: { brand: 'B', links: 'Home|#home, About|#about', bg: '#111', color: '#fff' } },
      { id: 'b', type: 'heading', x: 10, y: 80, w: 200, h: 40, rot: 0, page: 'about', anchor: 'top', mobile: 'hide', props: { text: 'x', size: 20, color: '#fff', weight: 700, align: 'left' } },
      { id: 'c', type: 'heading', x: 10, y: 90, w: 200, h: 40, rot: 0, hidden: true, props: { text: 'SECRET', size: 20, color: '#fff', weight: 700, align: 'left' } }] }, 't');
    ok(/name="viewport"/.test(out) && /class="fit"/.test(out) && /\.stack \.it/.test(out), 'vxui export: responsive viewport, scaling stage and phone stacking');
    ok(/href="#about"/.test(out) && /data-p="about"/.test(out) && /id="top"/.test(out) && /data-m="hide"/.test(out), 'vxui export: #links, pages, anchors and phone options');
    ok(!/SECRET/.test(out), 'vxui export: hidden layers are not exported');
    { const o2 = ctx.VX.components.uiToHTML({ width: 800, height: 500, bg: '#fff', pages: ['home', 'about', 'x</script><b>'], items: [{ id: 'q', type: 'heading', x: 0, y: 0, w: 100, h: 30, rot: 0, page: 'home', props: { text: 'h', size: 20, color: '#000', weight: 700, align: 'left' } }] }, 't');
      ok(/P=\["home","about"/.test(o2) && !/<\/script><b>/.test(o2.split('<script>')[1] || ''), 'vxui export: page list comes from the design and is escaped inside the script'); }
    ok(!/javascript:/i.test(ctx.VX.components.uiToHTML({ width: 100, height: 100, bg: '#000', items: [{ id: 'z', type: 'link', x: 0, y: 0, w: 50, h: 20, rot: 0, props: { text: 'x', href: '#', color: '#fff', size: 12 } }] }, 't')), 'vxui export: no javascript: links'); }
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
  ok(/vxscript/.test(R('renderer/index.html')) && /pack\.js/.test(R('renderer/index.html')), 'vxscript and pack scripts loaded');
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
  srv.kill(); await new Promise((r) => setTimeout(r, 400)); try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch { /* temp dir */ }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
