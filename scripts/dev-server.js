// `npm run web` – serves renderer/ in a normal browser (virtual file system, no Rust needed).
// Handy for UI work and automated tests. The real app is `npm start` (Tauri).
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'renderer'), ext = (k) => path.join(__dirname, '..', k);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/markdown', '.wasm': 'application/wasm' };
const port = +process.env.PORT || 5173;
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const m = /^\/__ext\/(plugins|themes)$/.exec(u);
  if (m) { const d = ext(m[1]); const out = fs.existsSync(d) ? fs.readdirSync(d).map((f) => ({ file: f, content: fs.readFileSync(path.join(d, f), 'utf8') })) : []; res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(out)); }
  let f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); res.setHeader('cache-control', 'no-store'); fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`Vextra Studio (browser mode) → http://localhost:${port}`));
