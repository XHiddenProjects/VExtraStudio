'use strict';
/* Vextra Site server – made by the Vextra Studio website builder. No dependencies: needs Node.js 18 or newer.  Start it with:  node server.js
 * It serves your pages from ./public, keeps form entries, members and sessions in ./data/db.json, and has an admin area at /admin.
 * Settings: config.json (port, host, forceHttps, trustProxy) and environment variables PORT, HOST, DATA_DIR, ADMIN_PASSWORD, PUBLIC_URL. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = __dirname, PUB = path.join(ROOT, 'public'), DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return d; } };
const SITE = readJson('site.json', { pages: [], collections: [], security: {} });
const CFG = Object.assign({ port: 8080, host: '0.0.0.0', forceHttps: false, trustProxy: false, adminPasswordHash: '' }, readJson('config.json', {}));
const SEC = Object.assign({ rateLimit: 60, maxBodyKB: 64, honeypot: true, allowSignup: true, sessionHours: 168, passwordMin: 10, maxFails: 5 }, SITE.security || {});
/* embeds (video, map) may only come from this fixed list – whatever site.json says */
const FRAME_OK = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://www.openstreetmap.org'];
const FRAMES = (Array.isArray(SEC.frames) ? SEC.frames.filter((x) => FRAME_OK.includes(x)) : []).join(' ') || "'none'";
const PORT = +(process.env.PORT || CFG.port), HOST = process.env.HOST || CFG.host;
const COLL = Object.fromEntries((SITE.collections || []).map((c) => [c.name, c]));
const PAGES = Object.fromEntries((SITE.pages || []).map((p) => [p.file, p]));

/* ---------- storage: one JSON file, written atomically ---------- */
fs.mkdirSync(DATA, { recursive: true });
const DBF = path.join(DATA, 'db.json');
let db = { users: [], records: {}, sessions: {}, adminHash: '' };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DBF, 'utf8'))); } catch { /* new site */ }
let saving = null;
const save = () => { if (saving) return; saving = setTimeout(() => { saving = null; const t = DBF + '.tmp'; fs.writeFileSync(t, JSON.stringify(db)); fs.renameSync(t, DBF); }, 150); };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { fs.writeFileSync(DBF, JSON.stringify(db)); } catch { /* ignore */ } process.exit(0); });   // docker stop / Ctrl+C keep the latest entries

/* ---------- passwords ---------- */
const scrypt = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');
const hashPw = (pw) => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + scrypt(pw, s); };
const checkPw = (pw, stored) => { const [s, h] = String(stored || '').split(':'); if (!s || !h) return false; const a = Buffer.from(scrypt(pw, s), 'hex'), b = Buffer.from(h, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const checkPbkdf2 = (pw, stored) => { const m = /^pbkdf2\$(\d+)\$([0-9a-f]+)\$([0-9a-f]+)$/.exec(stored || ''); if (!m) return false; const a = crypto.pbkdf2Sync(String(pw), Buffer.from(m[2], 'hex'), +m[1], 32, 'sha256'), b = Buffer.from(m[3], 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const adminOk = (pw) => { if (process.env.ADMIN_PASSWORD) return safeEq(pw, process.env.ADMIN_PASSWORD); if (CFG.adminPasswordHash) return checkPbkdf2(pw, CFG.adminPasswordHash); return checkPw(pw, db.adminHash); };
const PEPPER = crypto.randomBytes(16);   // both sides go through scrypt with the same random salt, so the comparison is constant-time and equal-length
const safeEq = (x, y) => crypto.timingSafeEqual(crypto.scryptSync(String(x), PEPPER, 32), crypto.scryptSync(String(y), PEPPER, 32));
if (!process.env.ADMIN_PASSWORD && !CFG.adminPasswordHash && !db.adminHash) {
  const pw = crypto.randomBytes(9).toString('base64url'); db.adminHash = hashPw(pw); save();
  console.log('\n  First start – your admin password (shown once, change it with ADMIN_PASSWORD):\n  ' + pw + '\n');
}

/* ---------- helpers ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg' };
const isHttps = (req) => !!req.socket.encrypted || (CFG.trustProxy && String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https');
const ipOf = (req) => (CFG.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
function headers(req, extra) {
  const h = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cross-Origin-Opener-Policy': 'same-origin' };
  if (SEC.csp !== false) h['Content-Security-Policy'] = "default-src 'self'; img-src 'self' data: https:; media-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src "+FRAMES+"; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
  if (isHttps(req)) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return Object.assign(h, extra);
}
function send(req, res, code, body, type, extra) { const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); res.writeHead(code, headers(req, Object.assign({ 'Content-Type': type || 'application/json', 'Content-Length': buf.length, 'Cache-Control': 'no-store' }, extra))); res.end(req.method === 'HEAD' ? undefined : buf); }
const json = (req, res, code, o, extra) => send(req, res, code, o, 'application/json', extra);
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split(/=(.*)/s).slice(0, 2)).filter((x) => x[0]));
const setCookie = (req, name, val, maxAge) => `${name}=${val}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
/* session tokens are 256 random bits (not passwords), so a fast hash is the right tool here */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hits = new Map(), fails = new Map(), adminSess = new Map();
function limited(req, key, max, windowMs) { const k = key + ipOf(req), now = Date.now(); let e = hits.get(k); if (!e || e.reset < now) { e = { n: 0, reset: now + windowMs }; hits.set(k, e); } e.n++; return e.n > max; }
setInterval(() => { const now = Date.now(); for (const [k, e] of hits) if (e.reset < now) hits.delete(k); for (const [k, e] of fails) if (e.reset < now) fails.delete(k); for (const [k, s] of adminSess) if (s < now) adminSess.delete(k); for (const [k, s] of Object.entries(db.sessions)) if (s.exp < now) delete db.sessions[k]; }, 60000).unref();
function body(req, max) {
  return new Promise((ok, no) => {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return no(Object.assign(new Error('Send JSON'), { code: 415 }));
    let n = 0; const parts = [];
    req.on('data', (c) => { n += c.length; if (n > max) { no(Object.assign(new Error('Too large'), { code: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { const o = JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); ok(o && typeof o === 'object' && !Array.isArray(o) ? o : {}); } catch { no(Object.assign(new Error('Invalid JSON'), { code: 400 })); } });
    req.on('error', no);
  });
}
function sameOrigin(req) { const o = req.headers.origin; if (o) { try { if (new URL(o).host !== req.headers.host) return false; } catch { return false; } } const f = req.headers['sec-fetch-site']; return !f || f === 'same-origin' || f === 'none'; }
function userOf(req) { const t = cookies(req).vxs; if (!t) return null; const s = db.sessions[sha(t)]; if (!s || s.exp < Date.now()) return null; return db.users.find((u) => u.id === s.uid) || null; }
const isAdmin = (req) => { const t = cookies(req).vxa; const e = t && adminSess.get(sha(t)); return !!e && e > Date.now(); };
const emailOk = (s) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s) && s.length <= 254;

/* ---------- form validation against the collection you designed ---------- */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TEL_RE = /^[+()\d][\d\s().\-+]{3,28}$/;
function validate(c, input) {
  const out = {}, errs = [];
  for (const f of c.fields) {
    let v = input[f.key]; const label = f.label || f.key;
    /* conditional field: only checked (and only stored) while the field it depends on has the wanted value – decided here, never by the browser */
    if (f.showIf && f.showIf.field) { const dep = input[f.showIf.field]; const have = dep === true ? 'true' : dep === false || dep == null ? '' : String(dep); if (have !== String(f.showIf.equals == null ? '' : f.showIf.equals)) { out[f.key] = f.type === 'checkbox' ? false : ''; continue; } }
    if (f.type === 'checkbox') { out[f.key] = v === true || v === 'true' || v === 'on'; if (f.required && !out[f.key]) errs.push(label + ' must be ticked'); continue; }
    if (v === undefined || v === null || v === '') { if (f.required) errs.push(label + ' is required'); out[f.key] = ''; continue; }
    if (f.type === 'number' || f.type === 'rating') { v = Number(v); if (!Number.isFinite(v)) { errs.push(label + ' must be a number'); continue; } if (f.type === 'rating' && (v < 1 || v > 5 || !Number.isInteger(v))) { errs.push(label + ' must be 1 to 5'); continue; } out[f.key] = v; continue; }
    if (typeof v !== 'string') { errs.push(label + ' is not valid'); continue; }
    v = v.replace(/\r\n/g, '\n').trim(); const max = f.maxLength || (f.type === 'textarea' ? 5000 : 300);
    if (v.length > max) { errs.push(label + ' is too long (max ' + max + ')'); continue; }
    if (f.type === 'email' && !emailOk(v)) { errs.push(label + ' must be an email address'); continue; }
    if ((f.type === 'select' || f.type === 'radio') && f.options && !f.options.includes(v)) { errs.push(label + ' is not one of the choices'); continue; }
    if (f.type === 'date' && (!DATE_RE.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z')))) { errs.push(label + ' must be a date'); continue; }
    if (f.type === 'url') { let ok = false; try { const u = new URL(v); ok = u.protocol === 'https:' || u.protocol === 'http:'; } catch (e) { ok = false; } if (!ok) { errs.push(label + ' must be a web address (http or https)'); continue; } }
    if (f.type === 'tel' && !TEL_RE.test(v)) { errs.push(label + ' must be a phone number'); continue; }
    out[f.key] = v;
  }
  return { out, errs };
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const p = url.pathname, m = req.method;
  if (limited(req, 'api', SEC.rateLimit, 60000)) return json(req, res, 429, { error: 'Too many requests – please wait a minute.' });
  if (m !== 'GET' && m !== 'HEAD' && !sameOrigin(req)) return json(req, res, 403, { error: 'Cross-site request refused' });
  const max = SEC.maxBodyKB * 1024;
  let mt;
  if ((mt = /^\/api\/forms\/([\w-]{1,40})$/.exec(p)) && m === 'POST') {
    const c = COLL[mt[1]]; if (!c) return json(req, res, 404, { error: 'Unknown form' });
    const b = await body(req, max); const u = userOf(req);
    if (c.submit === 'members' && !u) return json(req, res, 401, { error: 'Please log in first.' });
    if (SEC.honeypot && b._hp) return json(req, res, 200, { ok: true });           // bots fill the hidden field; pretend it worked
    if (limited(req, 'form' + c.name, 10, 60000)) return json(req, res, 429, { error: 'Too many submissions – please wait a minute.' });
    const { out, errs } = validate(c, b); if (errs.length) return json(req, res, 422, { error: errs[0], errors: errs });
    const list = db.records[c.name] || (db.records[c.name] = []);
    if (list.length >= (SEC.maxRecords || 50000)) return json(req, res, 507, { error: 'This form is full.' });
    list.push({ id: crypto.randomBytes(6).toString('hex'), at: Date.now(), user: u ? u.email : '', data: out }); save();
    return json(req, res, 200, { ok: true });
  }
  if ((mt = /^\/api\/data\/([\w-]{1,40})$/.exec(p)) && m === 'GET') {
    const c = COLL[mt[1]]; if (!c || c.public !== true) return json(req, res, 404, { error: 'Not available' });
    const lim = Math.min(200, Math.max(1, +url.searchParams.get('limit') || 50)); const hide = new Set(c.fields.filter((f) => f.private || f.type === 'email' || f.type === 'tel').map((f) => f.key));
    const rows = (db.records[c.name] || []).slice(-lim).reverse().map((r) => ({ at: r.at, data: Object.fromEntries(Object.entries(r.data).filter(([k]) => !hide.has(k))) }));
    return json(req, res, 200, { rows });
  }
  if (p === '/api/me' && m === 'GET') { const u = userOf(req); return json(req, res, 200, u ? { user: { name: u.name, email: u.email } } : { user: null }); }
  if (p === '/api/signup' && m === 'POST') {
    if (!SEC.allowSignup) return json(req, res, 403, { error: 'Sign-ups are closed.' });
    if (limited(req, 'signup', 5, 600000)) return json(req, res, 429, { error: 'Too many sign-ups from this address.' });
    const b = await body(req, max); const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || ''), name = String(b.name || '').trim().slice(0, 60);
    if (!emailOk(email)) return json(req, res, 422, { error: 'Enter a valid email address.' });
    if (pw.length < SEC.passwordMin) return json(req, res, 422, { error: 'Password needs at least ' + SEC.passwordMin + ' characters.' });
    if (pw.length > 200) return json(req, res, 422, { error: 'Password is too long.' });
    if (db.users.some((u) => u.email === email)) return json(req, res, 409, { error: 'That email is already registered.' });
    const u = { id: crypto.randomBytes(8).toString('hex'), email, name: name || email.split('@')[0], hash: hashPw(pw), at: Date.now() }; db.users.push(u); save();
    return startSession(req, res, u);
  }
  if (p === '/api/login' && m === 'POST') {
    const b = await body(req, max); const email = String(b.email || '').trim().toLowerCase(), key = ipOf(req) + '|' + email; const now = Date.now(); const f = fails.get(key);
    if (f && f.n >= SEC.maxFails && f.reset > now) return json(req, res, 429, { error: 'Too many wrong attempts. Try again in a few minutes.' });
    const u = db.users.find((x) => x.email === email);
    const good = checkPw(String(b.password || ''), u ? u.hash : '00:00');                     // same work for unknown users (no timing hint)
    if (!u || !good) { const e = f && f.reset > now ? f : { n: 0, reset: now + 600000 }; e.n++; fails.set(key, e); return json(req, res, 401, { error: 'Wrong email or password.' }); }
    fails.delete(key); return startSession(req, res, u);
  }
  if (p === '/api/logout' && m === 'POST') { const t = cookies(req).vxs; if (t) { delete db.sessions[sha(t)]; save(); } return json(req, res, 200, { ok: true }, { 'Set-Cookie': setCookie(req, 'vxs', '', 0) }); }
  return json(req, res, 404, { error: 'Not found' });
}
function startSession(req, res, u) {
  const t = crypto.randomBytes(32).toString('base64url'); db.sessions[sha(t)] = { uid: u.id, exp: Date.now() + SEC.sessionHours * 3600e3 }; save();
  return json(req, res, 200, { ok: true, user: { name: u.name, email: u.email } }, { 'Set-Cookie': setCookie(req, 'vxs', t, SEC.sessionHours * 3600) });
}

/* ---------- admin area ---------- */
const ADMIN_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/admin.css"></head><body><main id="app"></main><script src="/admin.js"></script></body></html>';
const ADMIN_CSS = 'body{font:15px system-ui,sans-serif;margin:0;background:#f4f6fa;color:#1b2333}main{max-width:1000px;margin:0 auto;padding:24px 16px}h1{margin:0 0 16px}section{background:#fff;border:1px solid #dde3ee;border-radius:10px;padding:16px;margin:0 0 16px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e8ecf3;padding:6px 8px;text-align:left;vertical-align:top;word-break:break-word}input,button{font:inherit;padding:8px 10px;border-radius:6px;border:1px solid #b9c3d6}button{background:#2457d6;color:#fff;border-color:#2457d6;cursor:pointer}button.x{background:#fff;color:#b3261e;border-color:#e0b4b0}.msg{color:#b3261e}a{color:#2457d6}';
const ADMIN_JS = `(()=>{const app=document.getElementById('app');const el=(t,a,...k)=>{const e=document.createElement(t);for(const[x,v]of Object.entries(a||{}))x.startsWith('on')?e.addEventListener(x.slice(2),v):e.setAttribute(x,v);for(const c of k.flat())e.append(c&&c.nodeType?c:document.createTextNode(c==null?'':c));return e};
const call=async(m,p,b)=>{const r=await fetch(p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined,credentials:'same-origin'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Error '+r.status);return j};
function login(msg){const pw=el('input',{type:'password',placeholder:'Admin password',autocomplete:'current-password'});const m=el('p',{class:'msg'},msg||'');app.replaceChildren(el('h1',{},'Admin'),el('section',{},el('form',{onsubmit:async e=>{e.preventDefault();try{await call('POST','/admin/api/login',{password:pw.value});home()}catch(x){m.textContent=x.message}}},pw,' ',el('button',{},'Log in'),m)))}
async function home(){let d;try{d=await call('GET','/admin/api/summary')}catch{return login()}
app.replaceChildren(el('h1',{},'Admin'),el('p',{},el('button',{class:'x',onclick:async()=>{await call('POST','/admin/api/logout');login()}},'Log out')),...d.collections.map(c=>el('section',{},el('h2',{},c.label+' ('+c.count+')'),el('a',{href:'/admin/api/csv?c='+encodeURIComponent(c.name)},'Download CSV'),table(c))),el('section',{},el('h2',{},'Members ('+d.users.length+')'),el('table',{},el('tr',{},el('th',{},'Name'),el('th',{},'Email'),el('th',{},'Joined'),el('th',{})),d.users.map(u=>el('tr',{},el('td',{},u.name),el('td',{},u.email),el('td',{},new Date(u.at).toLocaleString()),el('td',{},el('button',{class:'x',onclick:async()=>{if(confirm('Delete this member?')){await call('DELETE','/admin/api/user?id='+u.id);home()}}},'Delete')))))))}
function table(c){return el('table',{},el('tr',{},el('th',{},'When'),c.fields.map(f=>el('th',{},f.label||f.key)),el('th',{})),c.rows.map(r=>el('tr',{},el('td',{},new Date(r.at).toLocaleString()),c.fields.map(f=>el('td',{},String(r.data[f.key]??''))),el('td',{},el('button',{class:'x',onclick:async()=>{if(confirm('Delete this entry?')){await call('DELETE','/admin/api/record?c='+encodeURIComponent(c.name)+'&id='+r.id);home()}}},'Delete')))))}
home()})();`;
const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
async function admin(req, res, url) {
  const p = url.pathname, m = req.method;
  if (p === '/admin') return send(req, res, 200, ADMIN_HTML, TYPES['.html']);
  if (p === '/admin.js') return send(req, res, 200, ADMIN_JS, TYPES['.js']);
  if (p === '/admin.css') return send(req, res, 200, ADMIN_CSS, TYPES['.css']);
  if (m !== 'GET' && !sameOrigin(req)) return json(req, res, 403, { error: 'Cross-site request refused' });
  if (p === '/admin/api/login' && m === 'POST') {
    if (limited(req, 'admin', 8, 600000)) return json(req, res, 429, { error: 'Too many attempts. Try again later.' });
    const b = await body(req, 4096); if (!adminOk(b.password || '')) return json(req, res, 401, { error: 'Wrong password.' });
    const t = crypto.randomBytes(32).toString('base64url'); adminSess.set(sha(t), Date.now() + 2 * 3600e3);
    return json(req, res, 200, { ok: true }, { 'Set-Cookie': setCookie(req, 'vxa', t, 7200) });
  }
  if (!isAdmin(req)) return json(req, res, 401, { error: 'Log in first.' });
  if (p === '/admin/api/logout') { const t = cookies(req).vxa; if (t) adminSess.delete(sha(t)); return json(req, res, 200, { ok: true }, { 'Set-Cookie': setCookie(req, 'vxa', '', 0) }); }
  if (p === '/admin/api/summary') return json(req, res, 200, { collections: (SITE.collections || []).map((c) => { const l = db.records[c.name] || []; return { name: c.name, label: c.label || c.name, fields: c.fields, count: l.length, rows: l.slice(-100).reverse() }; }), users: db.users.map((u) => ({ id: u.id, name: u.name, email: u.email, at: u.at })) });
  if (p === '/admin/api/csv') { const c = COLL[url.searchParams.get('c')]; if (!c) return json(req, res, 404, { error: 'Unknown' }); const rows = db.records[c.name] || []; const csv = [['when', 'member'].concat(c.fields.map((f) => f.key)).map(csvCell).join(',')].concat(rows.map((r) => [new Date(r.at).toISOString(), r.user].concat(c.fields.map((f) => r.data[f.key])).map(csvCell).join(','))).join('\r\n'); return send(req, res, 200, csv, 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="' + c.name + '.csv"' }); }
  if (p === '/admin/api/record' && m === 'DELETE') { const c = COLL[url.searchParams.get('c')]; if (!c) return json(req, res, 404, { error: 'Unknown' }); const id = url.searchParams.get('id'); db.records[c.name] = (db.records[c.name] || []).filter((r) => r.id !== id); save(); return json(req, res, 200, { ok: true }); }
  if (p === '/admin/api/user' && m === 'DELETE') { const id = url.searchParams.get('id'); db.users = db.users.filter((u) => u.id !== id); for (const [k, s] of Object.entries(db.sessions)) if (s.uid === id) delete db.sessions[k]; save(); return json(req, res, 200, { ok: true }); }
  return json(req, res, 404, { error: 'Not found' });
}

/* ---------- static pages ---------- */
function serveStatic(req, res, url) {
  let rel; try { rel = decodeURIComponent(url.pathname); } catch { return send(req, res, 400, 'Bad request', 'text/plain'); }
  if (rel.includes('\0')) return send(req, res, 400, 'Bad request', 'text/plain');
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.resolve(PUB, '.' + rel); if (file !== PUB && !file.startsWith(PUB + path.sep)) return send(req, res, 403, 'Forbidden', 'text/plain');
  if (path.basename(file).startsWith('.')) return send(req, res, 404, 'Not found', 'text/plain');
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  let st; try { st = fs.statSync(file); } catch { st = null; }
  if (!st || !st.isFile()) { const nf = path.join(PUB, '404.html'); return fs.existsSync(nf) ? send(req, res, 404, fs.readFileSync(nf), TYPES['.html']) : send(req, res, 404, 'Not found', 'text/plain'); }
  const name = path.relative(PUB, file).split(path.sep).join('/'); const pg = PAGES[name];
  if (pg && pg.access === 'members' && !userOf(req)) { res.writeHead(302, headers(req, { Location: '/login.html?next=' + encodeURIComponent(url.pathname), 'Cache-Control': 'no-store' })); return res.end(); }
  const ext = path.extname(file).toLowerCase(); const data = fs.readFileSync(file);
  return send(req, res, 200, data, TYPES[ext] || 'application/octet-stream', { 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600' });
}

const server = http.createServer(async (req, res) => {
  try {
    if (CFG.forceHttps && !isHttps(req)) { res.writeHead(301, { Location: 'https://' + String(req.headers.host || '').replace(/:\d+$/, '') + req.url }); return res.end(); }
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname === '/admin.js' || url.pathname === '/admin.css') return await admin(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, 'Method not allowed', 'text/plain');
    return serveStatic(req, res, url);
  } catch (e) { if (!res.headersSent) { const c = e && [400, 413, 415].includes(e.code) ? e.code : 500; json(req, res, c, { error: ({ 400: 'Invalid request', 413: 'The request is too large', 415: 'Send JSON', 500: 'Something went wrong' })[c] }); } else res.end(); }
});
server.listen(PORT, HOST, () => console.log('Your site is running at http://localhost:' + PORT + '   (admin: /admin)'));
