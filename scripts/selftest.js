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
for (const f of fs.readdirSync(path.join(ROOT, 'plugins'))) { const s = fs.readFileSync(path.join(ROOT, 'plugins', f), 'utf8'); ok(/@forge-plugin\s*\{/.test(s) && /@forge-docs/.test(s), 'plugins/' + f + ' has manifest + docs'); }
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
  ok(ctx.VX.archive.crc32(new TextEncoder().encode('123456789')) === 0xcbf43926, 'crc32 check value');
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
