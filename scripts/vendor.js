// Copies third-party browser files (Ace editor, three.js) from node_modules into renderer/vendor.
// Runs automatically after `npm install`. Safe to run again at any time (`npm run vendor`).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const nm = (...p) => path.join(root, 'node_modules', ...p);
const out = (...p) => path.join(root, 'renderer', 'vendor', ...p);
const mk = (d) => fs.mkdirSync(d, { recursive: true });
const cp = (a, b) => { mk(path.dirname(b)); fs.copyFileSync(a, b); };
let n = 0;

if (!fs.existsSync(nm('ace-builds')) || !fs.existsSync(nm('three'))) {
  console.log('[vendor] node_modules not installed yet – run `npm install` first.'); process.exit(0);
}

/* Ace */
const aceSrc = nm('ace-builds', 'src-min-noconflict'), aceDst = out('ace');
fs.rmSync(aceDst, { recursive: true, force: true }); mk(path.join(aceDst, 'snippets'));
const keep = (f) => f === 'ace.js' || /^ext-(language_tools|searchbox|beautify|whitespace|modelist)\.js$/.test(f) || /^(mode|worker)-.*\.js$/.test(f);
for (const f of fs.readdirSync(aceSrc)) if (keep(f)) { cp(path.join(aceSrc, f), path.join(aceDst, f)); n++; }
for (const f of fs.readdirSync(path.join(aceSrc, 'snippets'))) if (f.endsWith('.js')) { cp(path.join(aceSrc, 'snippets', f), path.join(aceDst, 'snippets', f)); n++; }
const lic = nm('ace-builds', 'LICENSE'); if (fs.existsSync(lic)) cp(lic, path.join(aceDst, 'LICENSE'));

/* three.js (single-file module build, pinned) */
const t = out('three'); fs.rmSync(t, { recursive: true, force: true });
cp(nm('three', 'build', 'three.module.min.js'), path.join(t, 'three.module.min.js')); n++;
for (const f of ['OrbitControls', 'TransformControls']) { cp(nm('three', 'examples', 'jsm', 'controls', f + '.js'), path.join(t, f + '.js')); n++; }
const lic3 = nm('three', 'LICENSE'); if (fs.existsSync(lic3)) cp(lic3, path.join(t, 'LICENSE'));
// examples import from the bare specifier 'three'; index.html maps that to ./vendor/three/three.module.min.js
console.log('[vendor] copied', n, 'files into renderer/vendor');
