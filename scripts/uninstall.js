#!/usr/bin/env node
/* Vextra Studio – clean-up / uninstall helper.
 *
 *   npm run clean            remove build artefacts (node_modules, src-tauri/target, renderer/vendor)   [= autoclean]
 *   npm run uninstall        interactive: choose what to remove
 *   npm run uninstall:auto   no questions: build artefacts + Vextra's user data (settings, plugins, themes, secrets)
 *
 * Flags:  --mode=clean|full   --auto (or --yes)   --dry-run   --keep-data   --toolchain   --installed
 *   --mode=clean   build artefacts only (default for `clean`)
 *   --mode=full    also deletes Vextra's per-user data folder (settings, installed plugins & themes, saved sign-in)
 *   --installed    also try to remove an installed copy of the app (Windows/macOS/Linux packages)
 *   --toolchain    ALSO uninstall rustup + Rust (asks first, even with --auto – other projects use it!)
 *   --keep-data    never touch user data, even in full mode
 *   --dry-run      show what would be removed and do nothing
 * Your own projects, game files and published sites are NEVER touched.
 */
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), readline = require('readline');
const ROOT = path.resolve(__dirname, '..');
const arg = (n) => process.argv.some((a) => a === '--' + n);
const val = (n, d) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : d; };
const DRY = arg('dry-run'), AUTO = arg('auto') || arg('yes') || arg('y'), KEEP = arg('keep-data');
let MODE = val('mode', 'ask');
const ID = 'studio.vextra.app';
const C = (c, s) => (process.stdout.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s);

function userDataDirs() {
  const h = os.homedir(), p = process.platform, out = [];
  if (p === 'win32') { const a = process.env.APPDATA || path.join(h, 'AppData', 'Roaming'), l = process.env.LOCALAPPDATA || path.join(h, 'AppData', 'Local'); out.push(path.join(a, ID), path.join(l, ID)); }
  else if (p === 'darwin') out.push(path.join(h, 'Library', 'Application Support', ID), path.join(h, 'Library', 'Caches', ID), path.join(h, 'Library', 'WebKit', ID), path.join(h, 'Library', 'Saved Application State', ID + '.savedState'));
  else { const d = process.env.XDG_DATA_HOME || path.join(h, '.local', 'share'), c = process.env.XDG_CACHE_HOME || path.join(h, '.cache'), g = process.env.XDG_CONFIG_HOME || path.join(h, '.config'); out.push(path.join(d, ID), path.join(c, ID), path.join(g, ID)); }
  return out;
}
function installedApps() {
  const h = os.homedir(), p = process.platform;
  if (p === 'win32') { const l = process.env.LOCALAPPDATA || path.join(h, 'AppData', 'Local'); return [path.join(l, 'Vextra Studio'), path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Vextra Studio')]; }
  if (p === 'darwin') return ['/Applications/Vextra Studio.app', path.join(h, 'Applications', 'Vextra Studio.app')];
  return [path.join(h, '.local', 'bin', 'vextra-studio'), '/usr/local/bin/vextra-studio', path.join(h, '.local', 'share', 'applications', 'vextra-studio.desktop')];
}
function size(p) { try { const st = fs.lstatSync(p); if (!st.isDirectory()) return st.size; let n = 0; for (const f of fs.readdirSync(p)) n += size(path.join(p, f)); return n; } catch { return 0; } }
const fmt = (n) => (n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
function ask(q) { if (AUTO) return Promise.resolve(true); if (!process.stdin.isTTY) return Promise.resolve(false); const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); return new Promise((r) => rl.question(q + ' [y/N] ', (a) => { rl.close(); r(/^y(es)?$/i.test(a.trim())); })); }
function remove(p) {
  if (!fs.existsSync(p)) return false; const sz = size(p);
  if (DRY) { console.log(C(33, '  would remove ') + p + C(90, '  (' + fmt(sz) + ')')); return true; }
  try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 }); console.log(C(32, '  removed ') + p + C(90, '  (' + fmt(sz) + ')')); return true; } catch (e) { console.log(C(31, '  failed  ') + p + ' – ' + e.message); return false; }
}
function run(cmd, args) { if (DRY) { console.log(C(33, '  would run ') + cmd + ' ' + args.join(' ')); return 0; } const r = cp.spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' }); return r.status; }

(async () => {
  console.log(C(36, '\nVextra Studio – ' + (DRY ? 'dry run: ' : '') + 'clean-up'));
  if (MODE === 'ask') { if (AUTO) MODE = 'clean'; else { console.log('\n  1) clean  – remove build artefacts (node_modules, target, vendor)\n  2) full   – clean + Vextra\'s settings, plugins, themes and saved sign-in\n'); const full = await ask('Also remove Vextra\'s user data (full uninstall)?'); MODE = full ? 'full' : 'clean'; } }
  console.log(C(90, '  mode: ' + MODE + (AUTO ? ' (automatic)' : '')));

  console.log('\nBuild artefacts');
  const arts = ['node_modules', path.join('src-tauri', 'target'), path.join('renderer', 'vendor'), path.join('src-tauri', 'gen')].map((x) => path.join(ROOT, x));
  const present = arts.filter((a) => fs.existsSync(a)); const total = present.reduce((n, a) => n + size(a), 0);
  if (!present.length) console.log(C(90, '  nothing to clean'));
  else if (await ask(`  Remove ${present.length} folder(s), about ${fmt(total)}?`)) present.forEach(remove);

  if (MODE === 'full' && !KEEP) {
    console.log('\nVextra user data (settings, plugins, themes, sign-in)');
    const dirs = userDataDirs().filter((d) => fs.existsSync(d));
    if (!dirs.length) console.log(C(90, '  none found'));
    else { dirs.forEach((d) => console.log('  ' + d + C(90, '  ' + fmt(size(d))))); if (await ask('  Delete this data? Your own project files are not affected.')) dirs.forEach(remove); }
  } else if (MODE === 'full') console.log(C(90, '\n--keep-data: user data left untouched'));

  if (arg('installed')) {
    console.log('\nInstalled application');
    const apps = installedApps().filter((d) => fs.existsSync(d)); if (!apps.length) console.log(C(90, '  no installed copy found (Windows: use Settings → Apps; Linux packages: use your package manager)'));
    else if (await ask('  Remove ' + apps.join(', ') + '?')) apps.forEach(remove);
  }

  if (arg('toolchain')) {
    console.log(C(33, '\nRust toolchain (rustup)'));
    console.log('  rustup and Rust are shared by every Rust project on this computer. Removing them is optional and cannot be undone.');
    if (!process.stdin.isTTY && !DRY) console.log(C(90, '  skipped: needs an interactive terminal to confirm'));
    else { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); const ans = DRY ? 'yes' : await new Promise((r) => rl.question('  Type "remove rust" to continue: ', (a) => { rl.close(); r(a.trim().toLowerCase()); })); if (ans === 'remove rust' || DRY) run('rustup', ['self', 'uninstall', '-y']); else console.log(C(90, '  skipped')); }
  } else console.log(C(90, '\nRust (rustup) was left installed. Add --toolchain to remove it as well.'));

  console.log(C(32, '\nDone.') + (DRY ? ' (dry run – nothing was deleted)' : '') + '\nTo reinstall later:  npm install  →  npm start\n');
})();
