#!/usr/bin/env node
/* Prepares the local Vextra server that ships inside the desktop app (so users never need a terminal):
     1. bundles server/server.js + mfa.js with esbuild and turns the bundle into ONE self-contained executable using Node's built-in
        "single executable application" feature (Node 20+, plus the tiny `postject` helper) – no Node.js needed on the user's PC
     2. if that is not possible it copies server.js + mfa.js so the app runs them with the Node.js installed on the PC
   The executable is built for the OS you build on (run build:win on Windows, build:linux on Linux, build:mac on macOS).
   Output: src-tauri/resources/server/   (bundled by tauri.conf.json → bundle.resources)
   Usage: node scripts/build-server.js [--copy-only] */
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const root = path.join(__dirname, '..'), out = path.join(root, 'src-tauri', 'resources', 'server');
const copyOnly = process.argv.includes('--copy-only');
const exe = process.platform === 'win32' ? 'vextra-server.exe' : 'vextra-server';
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const copySource = (why) => { for (const f of ['server.js', 'mfa.js', 'host.js', 'helpdesk.js']) fs.copyFileSync(path.join(root, 'server', f), path.join(out, f)); console.log(`[server] copied the server source (${why}) – the app will run it with Node.js.`); };
if (copyOnly) { copySource('--copy-only'); process.exit(0); }
const major = +process.versions.node.split('.')[0];
let esbuild, postject; try { esbuild = require('esbuild'); postject = require.resolve('postject/dist/cli.js'); } catch { /* not installed */ }
if (major < 20 || !esbuild || !postject) { copySource(major < 20 ? 'Node 20+ is needed to compile the server' : 'esbuild/postject are not installed – run npm install'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-sea-'));
try {
  const bundle = path.join(tmp, 'server.cjs'), blob = path.join(tmp, 'sea.blob'), bin = path.join(out, exe);
  esbuild.buildSync({ entryPoints: [path.join(root, 'server', 'server.js')], bundle: true, platform: 'node', target: 'node20', outfile: bundle, logLevel: 'error' });
  fs.writeFileSync(path.join(tmp, 'sea-config.json'), JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true }));
  const run = (cmd, args) => { const r = cp.spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', cwd: tmp }); if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'failed').trim().split('\n').slice(-3).join(' ')); };
  run(process.execPath, ['--experimental-sea-config', 'sea-config.json']);
  fs.copyFileSync(process.execPath, bin); try { fs.chmodSync(bin, 0o755); } catch { /* windows */ }
  if (process.platform === 'darwin') { try { run('codesign', ['--remove-signature', bin]); } catch { /* unsigned already */ } }
  const args = [postject, bin, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2']; if (process.platform === 'darwin') args.push('--macho-segment-name', 'NODE_SEA');
  run(process.execPath, args);
  if (process.platform === 'darwin') { try { run('codesign', ['--sign', '-', bin]); } catch { /* ad-hoc signing is best effort */ } }
  copySource('also kept as a fallback'); console.log(`[server] compiled ${exe} with Node's single-executable support.`);
} catch (e) { console.log('[server] compiling failed (' + e.message + ')'); fs.rmSync(path.join(out, exe), { force: true }); copySource('compile failed – the build continues without a compiled binary'); }
finally { fs.rmSync(tmp, { recursive: true, force: true }); }
