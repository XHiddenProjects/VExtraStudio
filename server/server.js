#!/usr/bin/env node
/* Vextra server – accounts, project sync/collaboration, public hosting, leaderboards and cloud saves.
   Zero dependencies (Node 18+).  Usage:  node server/server.js [--port 8787] [--data ./server/data] [--public-url https://example.com]
   Environment: PORT, DATA_DIR, PUBLIC_URL, MAX_BODY_MB, ALLOW_REGISTER=0 to close sign-ups. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : d; };
const PORT = +(arg('port', process.env.PORT || 8787));
const DATA = path.resolve(arg('data', process.env.DATA_DIR || path.join(__dirname, 'data')));
const PUBLIC_URL = (arg('public-url', process.env.PUBLIC_URL || '')).replace(/\/$/, '');
const MAX_BODY = (+process.env.MAX_BODY_MB || 40) * 1024 * 1024;
const ALLOW_REGISTER = process.env.ALLOW_REGISTER !== '0';
const MAX_PROJECT_BYTES = 120 * 1024 * 1024;

fs.mkdirSync(DATA, { recursive: true });
const F = (n) => path.join(DATA, n);

/* ------------------------------------------------------------------ tiny JSON store */
const store = {};
function load(name, def) { try { return JSON.parse(fs.readFileSync(F(name + '.json'), 'utf8')); } catch { return def; } }
function save(name) { const tmp = F(name + '.json.tmp'); fs.writeFileSync(tmp, JSON.stringify(store[name])); fs.renameSync(tmp, F(name + '.json')); }
store.users = load('users', {});          // username -> {id, username, display, salt, hash, created}
store.sessions = load('sessions', {});    // sha256(token) -> {user, created, ua}
store.projects = load('projects', {});    // id -> {id, name, owner, members:{user:role}, invite, rev, created, files:{path:{rev, by, at, size, deleted}}}
store.published = load('published', {});  // user/slug -> {user, slug, kind, title, updated, files:int}
store.boards = load('boards', {});        // gameId -> board -> [{name, score, user, at}]
store.saves = load('saves', {});          // user/gameId/slot -> {data, at}
const flushers = {}; const dirty = (n) => { clearTimeout(flushers[n]); flushers[n] = setTimeout(() => save(n), 150); };
process.on('SIGINT', () => { for (const n of Object.keys(store)) save(n); process.exit(0); });
process.on('SIGTERM', () => { for (const n of Object.keys(store)) save(n); process.exit(0); });

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const rid = (n = 9) => crypto.randomBytes(n).toString('hex');
const safeName = (s) => /^[a-z0-9][a-z0-9_-]{1,30}$/.test(s);
const safeSlug = (s) => /^[a-z0-9][a-z0-9._-]{0,48}$/.test(s);
function safePath(p) { p = String(p || '').replace(/\\/g, '/').replace(/^\/+/, ''); if (!p || p.length > 300 || p.split('/').some((s) => s === '..' || s === '' || s === '.')) return null; if (/[\0:*?"<>|]/.test(p)) return null; return p; }
const projDir = (id) => path.join(DATA, 'projects', id);
const pubDir = (u, s) => path.join(DATA, 'published', u, s);

/* ------------------------------------------------------------------ http helpers */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Max-Age': '600' };
function send(res, code, body, headers = {}) { const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body); const data = isObj ? JSON.stringify(body) : body ?? ''; res.writeHead(code, { ...CORS, 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...headers }); res.end(data); }
const fail = (res, code, msg) => send(res, code, { error: msg });
function readBody(req) { return new Promise((resolve, reject) => { let size = 0; const chunks = []; req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); } else chunks.push(c); }); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); }); }
async function readJson(req) { const b = await readBody(req); if (!b.length) return {}; try { return JSON.parse(b.toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); } }
const MIME = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8', wasm: 'application/wasm', mp4: 'video/mp4', webm: 'video/webm' };

/* ------------------------------------------------------------------ rate limiting */
const hits = new Map();
function limited(ip, key, max, windowMs) { const k = ip + '|' + key, now = Date.now(); const a = (hits.get(k) || []).filter((t) => now - t < windowMs); a.push(now); hits.set(k, a); return a.length > max; }
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some((t) => now - t < 3600e3)) hits.delete(k); }, 600e3).unref();

/* ------------------------------------------------------------------ auth */
function hashPw(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }
function newSession(user, ua) { const token = rid(32); store.sessions[sha(token)] = { user, created: Date.now(), ua: String(ua || '').slice(0, 120) }; dirty('sessions'); return token; }
function authUser(req) { const h = req.headers.authorization || ''; const m = /^Bearer\s+(\S+)/.exec(h); if (!m) return null; const s = store.sessions[sha(m[1])]; if (!s) return null; const u = store.users[s.user]; return u ? u : null; }
const pub = (u) => ({ id: u.id, username: u.username, displayName: u.display || u.username, created: u.created });
function need(req, res) { const u = authUser(req); if (!u) { fail(res, 401, 'Please sign in'); return null; } return u; }
function role(p, user) { return p.owner === user ? 'owner' : p.members[user] || null; }

/* ------------------------------------------------------------------ project file storage */
function writeProjFile(pid, rel, buf) { const full = path.join(projDir(pid), rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, buf); }
function readProjFile(pid, rel) { try { return fs.readFileSync(path.join(projDir(pid), rel)); } catch { return null; } }
const decode = (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : v && typeof v.b64 === 'string' ? Buffer.from(v.b64, 'base64') : null);
const encode = (buf) => { if (!buf.includes(0)) { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { /* binary */ } } return { b64: buf.toString('base64') }; };
function projSize(p) { return Object.values(p.files).reduce((a, f) => a + (f.deleted ? 0 : f.size || 0), 0); }
function projectView(p, user) { return { id: p.id, name: p.name, owner: p.owner, role: role(p, user), members: Object.entries(p.members).map(([u, r]) => ({ username: u, role: r })).concat([{ username: p.owner, role: 'owner' }]), invite: role(p, user) === 'owner' ? p.invite : undefined, rev: p.rev, created: p.created, files: Object.keys(p.files).filter((k) => !p.files[k].deleted).length }; }
const presence = {}; // pid -> user -> {file, at}

/* ------------------------------------------------------------------ routes */
async function api(req, res, url, ip) {
  const m = req.method, p = url.pathname, seg = p.split('/').filter(Boolean); // ['api', ...]
  if (p === '/api/health') return send(res, 200, { ok: true, name: 'vextra-server', version: '2.0.0', time: Date.now(), register: ALLOW_REGISTER });

  /* --- accounts --- */
  if (p === '/api/register' && m === 'POST') {
    if (!ALLOW_REGISTER) return fail(res, 403, 'Registration is closed on this server'); if (limited(ip, 'reg', 8, 3600e3)) return fail(res, 429, 'Too many sign-ups from your network, try later');
    const b = await readJson(req); const un = String(b.username || '').toLowerCase().trim(); const pw = String(b.password || '');
    if (!safeName(un)) return fail(res, 400, 'Username: 2–31 characters, letters, numbers, - and _ (start with a letter or number)'); if (pw.length < 8 || pw.length > 200) return fail(res, 400, 'Password must be 8–200 characters');
    if (store.users[un]) return fail(res, 409, 'That username is taken');
    const salt = rid(16); store.users[un] = { id: rid(6), username: un, display: String(b.displayName || un).slice(0, 40), salt, hash: hashPw(pw, salt), created: Date.now() }; dirty('users');
    return send(res, 201, { token: newSession(un, req.headers['user-agent']), user: pub(store.users[un]) });
  }
  if (p === '/api/login' && m === 'POST') {
    if (limited(ip, 'login', 20, 600e3)) return fail(res, 429, 'Too many attempts, wait a few minutes');
    const b = await readJson(req); const u = store.users[String(b.username || '').toLowerCase().trim()]; const pw = String(b.password || '');
    const ok = u && crypto.timingSafeEqual(Buffer.from(hashPw(pw, u.salt), 'hex'), Buffer.from(u.hash, 'hex')); if (!ok) return fail(res, 401, 'Wrong username or password');
    return send(res, 200, { token: newSession(u.username, req.headers['user-agent']), user: pub(u) });
  }
  if (p === '/api/logout' && m === 'POST') { const h = /^Bearer\s+(\S+)/.exec(req.headers.authorization || ''); if (h) { delete store.sessions[sha(h[1])]; dirty('sessions'); } return send(res, 200, { ok: true }); }
  if (p === '/api/me') {
    const u = need(req, res); if (!u) return;
    if (m === 'GET') { const sess = Object.values(store.sessions).filter((s) => s.user === u.username).length; return send(res, 200, { user: pub(u), sessions: sess }); }
    if (m === 'PATCH') { const b = await readJson(req); if (b.displayName !== undefined) u.display = String(b.displayName).slice(0, 40) || u.username; dirty('users'); return send(res, 200, { user: pub(u) }); }
    if (m === 'DELETE') {
      const b = await readJson(req); if (!crypto.timingSafeEqual(Buffer.from(hashPw(String(b.password || ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'))) return fail(res, 403, 'Password is incorrect');
      for (const [k, s] of Object.entries(store.sessions)) if (s.user === u.username) delete store.sessions[k];
      for (const [id, pr] of Object.entries(store.projects)) { if (pr.owner === u.username) { fs.rmSync(projDir(id), { recursive: true, force: true }); delete store.projects[id]; } else delete pr.members[u.username]; }
      for (const [k, v] of Object.entries(store.published)) if (v.user === u.username) delete store.published[k]; fs.rmSync(path.join(DATA, 'published', u.username), { recursive: true, force: true });
      for (const k of Object.keys(store.saves)) if (k.startsWith(u.username + '/')) delete store.saves[k];
      delete store.users[u.username]; for (const n of ['users', 'sessions', 'projects', 'published', 'saves']) dirty(n); return send(res, 200, { ok: true });
    }
  }
  if (p === '/api/me/password' && m === 'POST') {
    const u = need(req, res); if (!u) return; const b = await readJson(req); if (!crypto.timingSafeEqual(Buffer.from(hashPw(String(b.old || ''), u.salt), 'hex'), Buffer.from(u.hash, 'hex'))) return fail(res, 403, 'Current password is incorrect');
    const np = String(b.new || ''); if (np.length < 8 || np.length > 200) return fail(res, 400, 'New password must be 8–200 characters'); u.salt = rid(16); u.hash = hashPw(np, u.salt); dirty('users'); return send(res, 200, { ok: true });
  }
  if (p === '/api/me/logout-all' && m === 'POST') { const u = need(req, res); if (!u) return; const cur = sha((/^Bearer\s+(\S+)/.exec(req.headers.authorization) || [])[1] || ''); for (const [k, s] of Object.entries(store.sessions)) if (s.user === u.username && k !== cur) delete store.sessions[k]; dirty('sessions'); return send(res, 200, { ok: true }); }

  /* --- projects (sync / collaboration) --- */
  if (p === '/api/projects' && m === 'GET') { const u = need(req, res); if (!u) return; return send(res, 200, { projects: Object.values(store.projects).filter((x) => role(x, u.username)).map((x) => projectView(x, u.username)) }); }
  if (p === '/api/projects' && m === 'POST') {
    const u = need(req, res); if (!u) return; const b = await readJson(req); const name = String(b.name || '').trim().slice(0, 60); if (!name) return fail(res, 400, 'Project name required');
    if (Object.values(store.projects).filter((x) => x.owner === u.username).length >= 50) return fail(res, 403, 'Project limit reached');
    const id = rid(6); const pr = { id, name, owner: u.username, members: {}, invite: rid(5).toUpperCase(), rev: 0, created: Date.now(), files: {} }; store.projects[id] = pr; dirty('projects'); return send(res, 201, { project: projectView(pr, u.username) });
  }
  if (p === '/api/projects/join' && m === 'POST') {
    const u = need(req, res); if (!u) return; if (limited(ip, 'join', 20, 600e3)) return fail(res, 429, 'Too many tries'); const b = await readJson(req); const code = String(b.code || '').trim().toUpperCase();
    const pr = Object.values(store.projects).find((x) => x.invite === code); if (!pr) return fail(res, 404, 'Invite code not found'); if (pr.owner !== u.username && !pr.members[u.username]) { pr.members[u.username] = 'editor'; dirty('projects'); } return send(res, 200, { project: projectView(pr, u.username) });
  }
  if (seg[1] === 'projects' && seg[2]) {
    const u = need(req, res); if (!u) return; const pr = store.projects[seg[2]]; if (!pr) return fail(res, 404, 'Project not found'); const r = role(pr, u.username); if (!r) return fail(res, 403, 'You are not a member of this project');
    if (seg.length === 3) {
      if (m === 'GET') return send(res, 200, { project: projectView(pr, u.username) });
      if (m === 'PATCH') { if (r !== 'owner') return fail(res, 403, 'Only the owner can do that'); const b = await readJson(req); if (b.name) pr.name = String(b.name).slice(0, 60); if (b.newInvite) pr.invite = rid(5).toUpperCase(); dirty('projects'); return send(res, 200, { project: projectView(pr, u.username) }); }
      if (m === 'DELETE') { if (r !== 'owner') { delete pr.members[u.username]; dirty('projects'); return send(res, 200, { ok: true, left: true }); } fs.rmSync(projDir(pr.id), { recursive: true, force: true }); delete store.projects[pr.id]; dirty('projects'); return send(res, 200, { ok: true }); }
    }
    if (seg[3] === 'changes' && m === 'GET') {
      const since = +url.searchParams.get('since') || 0; const out = []; const withContent = url.searchParams.get('content') !== '0';
      for (const [rel, f] of Object.entries(pr.files)) if (f.rev > since) { const o = { path: rel, rev: f.rev, by: f.by, at: f.at, deleted: !!f.deleted, size: f.size }; if (!f.deleted && withContent) { const buf = readProjFile(pr.id, rel); if (buf) o.content = encode(buf); } out.push(o); }
      const pres = presence[pr.id] || {}; const now = Date.now(); const online = Object.entries(pres).filter(([, v]) => now - v.at < 20000).map(([user, v]) => ({ user, file: v.file }));
      (presence[pr.id] ||= {})[u.username] = { file: (presence[pr.id][u.username] || {}).file, at: now };
      return send(res, 200, { rev: pr.rev, changes: out, online, role: r });
    }
    if (seg[3] === 'files' && m === 'PUT') {
      if (r === 'viewer') return fail(res, 403, 'You have view-only access'); const b = await readJson(req); const batch = Array.isArray(b.files) ? b.files : [b]; const results = [];
      for (const it of batch) {
        const rel = safePath(it.path); if (!rel) { results.push({ path: it.path, error: 'bad path' }); continue; } const cur = pr.files[rel];
        if (cur && !cur.deleted && it.baseRev !== undefined && it.baseRev !== null && cur.rev > it.baseRev && cur.by !== u.username) { const buf = readProjFile(pr.id, rel); results.push({ path: rel, conflict: true, rev: cur.rev, by: cur.by, content: buf ? encode(buf) : '' }); continue; }
        if (it.deleted) { if (cur) { cur.deleted = true; cur.rev = ++pr.rev; cur.by = u.username; cur.at = Date.now(); try { fs.rmSync(path.join(projDir(pr.id), rel)); } catch { /* ok */ } } results.push({ path: rel, rev: pr.rev, deleted: true }); continue; }
        const buf = decode(it.content); if (!buf) { results.push({ path: rel, error: 'bad content' }); continue; }
        if (projSize(pr) - ((cur && cur.size) || 0) + buf.length > MAX_PROJECT_BYTES) { results.push({ path: rel, error: 'Project size limit reached' }); continue; }
        writeProjFile(pr.id, rel, buf); pr.files[rel] = { rev: ++pr.rev, by: u.username, at: Date.now(), size: buf.length }; results.push({ path: rel, rev: pr.rev });
      }
      dirty('projects'); return send(res, 200, { rev: pr.rev, results });
    }
    if (seg[3] === 'presence' && m === 'POST') { const b = await readJson(req); (presence[pr.id] ||= {})[u.username] = { file: String(b.file || '').slice(0, 200), at: Date.now() }; return send(res, 200, { ok: true }); }
    if (seg[3] === 'members') {
      if (r !== 'owner') return fail(res, 403, 'Only the owner can manage members'); const b = await readJson(req);
      if (m === 'POST') { const un = String(b.username || '').toLowerCase(); if (!store.users[un]) return fail(res, 404, 'No such user'); if (!['editor', 'viewer'].includes(b.role)) return fail(res, 400, 'Role must be editor or viewer'); pr.members[un] = b.role; dirty('projects'); return send(res, 200, { project: projectView(pr, u.username) }); }
      if (m === 'DELETE') { delete pr.members[String(b.username || '').toLowerCase()]; dirty('projects'); return send(res, 200, { project: projectView(pr, u.username) }); }
    }
  }

  /* --- publishing --- */
  if (p === '/api/publish' && m === 'GET') { const u = need(req, res); if (!u) return; return send(res, 200, { sites: Object.values(store.published).filter((x) => x.user === u.username).map((x) => ({ ...x, url: siteUrl(req, x.user, x.slug) })) }); }
  if (seg[1] === 'publish' && seg[2]) {
    const u = need(req, res); if (!u) return; const slug = seg[2].toLowerCase(); if (!safeSlug(slug)) return fail(res, 400, 'Site name: letters, numbers, - _ . (max 49)'); const key = u.username + '/' + slug;
    if (m === 'PUT') {
      const b = await readJson(req); const files = b.files || {}; const names = Object.keys(files); if (!names.length) return fail(res, 400, 'Nothing to publish');
      if (names.length > 2000) return fail(res, 413, 'Too many files'); let total = 0; const bufs = {};
      for (const n of names) { const rel = safePath(n); if (!rel) return fail(res, 400, 'Invalid file name: ' + n); const buf = decode(files[n]); if (!buf) return fail(res, 400, 'Invalid content for ' + n); total += buf.length; bufs[rel] = buf; }
      if (total > 80 * 1024 * 1024) return fail(res, 413, 'Site is larger than 80 MB'); if (Object.values(store.published).filter((x) => x.user === u.username).length >= 30 && !store.published[key]) return fail(res, 403, 'Site limit reached');
      const dir = pubDir(u.username, slug), tmp = dir + '.tmp-' + rid(3); fs.mkdirSync(tmp, { recursive: true }); for (const [rel, buf] of Object.entries(bufs)) { const full = path.join(tmp, rel); fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, buf); }
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(path.dirname(dir), { recursive: true }); fs.renameSync(tmp, dir);
      store.published[key] = { user: u.username, slug, kind: b.kind === 'game' ? 'game' : 'site', title: String(b.title || slug).slice(0, 80), updated: Date.now(), files: names.length, bytes: total, gameId: b.gameId ? String(b.gameId).slice(0, 80) : undefined }; dirty('published');
      return send(res, 200, { url: siteUrl(req, u.username, slug), site: store.published[key] });
    }
    if (m === 'DELETE') { delete store.published[key]; fs.rmSync(pubDir(u.username, slug), { recursive: true, force: true }); dirty('published'); return send(res, 200, { ok: true }); }
  }

  /* --- game services: leaderboards & cloud saves --- */
  if (seg[1] === 'games' && seg[2] && seg[3] === 'leaderboard' && seg[4]) {
    const gid = seg[2].slice(0, 80), board = seg[4].slice(0, 40); const arr = ((store.boards[gid] ||= {})[board] ||= []);
    if (m === 'GET') { const top = [...arr].sort((a, b) => b.score - a.score).slice(0, Math.min(100, +url.searchParams.get('limit') || 10)); return send(res, 200, { list: top.map(({ name, score, at }) => ({ name, score, at })) }); }
    if (m === 'POST') { if (limited(ip, 'score', 60, 60e3)) return fail(res, 429, 'Slow down'); const b = await readJson(req); const score = Number(b.score); if (!Number.isFinite(score)) return fail(res, 400, 'Score must be a number'); const u = authUser(req); const name = String((u ? u.display || u.username : b.name) || 'Player').slice(0, 24).replace(/[<>]/g, ''); arr.push({ name, score, user: u && u.username, at: Date.now() }); arr.sort((a, b2) => b2.score - a.score); if (arr.length > 500) arr.length = 500; dirty('boards'); return send(res, 200, { rank: arr.findIndex((e) => e.score === score && e.name === name) + 1 }); }
  }
  if (seg[1] === 'saves' && seg[2] && seg[3]) {
    const u = need(req, res); if (!u) return; const key = `${u.username}/${seg[2].slice(0, 80)}/${seg[3].slice(0, 40)}`;
    if (m === 'GET') return send(res, 200, store.saves[key] || { data: null });
    if (m === 'PUT') { const b = await readJson(req); const s = JSON.stringify(b.data ?? null); if (s.length > 2e6) return fail(res, 413, 'Save is too large'); store.saves[key] = { data: b.data, at: Date.now() }; dirty('saves'); return send(res, 200, { ok: true }); }
    if (m === 'DELETE') { delete store.saves[key]; dirty('saves'); return send(res, 200, { ok: true }); }
  }
  /* auth for games hosted on this server: players sign in against the same account store */
  if (p === '/api/explore' && m === 'GET') return send(res, 200, { sites: Object.values(store.published).sort((a, b) => b.updated - a.updated).slice(0, 100).map((x) => ({ user: x.user, slug: x.slug, title: x.title, kind: x.kind, updated: x.updated, url: siteUrl(req, x.user, x.slug) })) });
  return fail(res, 404, 'Not found');
}
function siteUrl(req, user, slug) { const base = PUBLIC_URL || `http://${req.headers.host}`; return `${base}/p/${user}/${slug}/`; }

/* ------------------------------------------------------------------ public hosting */
function serveSite(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return ''; } }); const [, user, slug, ...rest] = parts; // p/user/slug/...
  if (!user || !slug || !store.published[user + '/' + slug]) return send(res, 404, 'Site not found');
  if (!rest.length && !url.pathname.endsWith('/')) { res.writeHead(301, { ...CORS, Location: url.pathname + '/' }); return res.end(); }
  const rel = safePath(rest.join('/')) || 'index.html'; const root = pubDir(user, slug); let full = path.join(root, rel);
  if (!full.startsWith(root + path.sep) && full !== root) return send(res, 403, 'Forbidden');
  try { if (fs.statSync(full).isDirectory()) full = path.join(full, 'index.html'); } catch { /* handled below */ }
  fs.readFile(full, (err, buf) => { if (err) { fs.readFile(path.join(root, '404.html'), (e2, b2) => (e2 ? send(res, 404, 'Not found') : send(res, 404, b2, { 'Content-Type': MIME.html }))); return; } const ext = path.extname(full).slice(1).toLowerCase(); send(res, 200, buf, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=30', 'X-Frame-Options': 'SAMEORIGIN' }); });
}
function explorePage(req, res) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const items = Object.values(store.published).sort((a, b) => b.updated - a.updated).slice(0, 60);
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vextra – Explore</title><style>body{font:16px system-ui;background:#0f1218;color:#e6e9ef;margin:0}main{max-width:900px;margin:0 auto;padding:40px 20px}h1{margin:0 0 4px}p{color:#8993a6}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-top:20px}a.c{display:block;background:#151921;border:1px solid #272d3a;border-radius:14px;padding:16px;color:inherit;text-decoration:none}a.c:hover{border-color:#6c8cff}small{color:#8993a6}.k{font-size:11px;background:#6c8cff22;color:#6c8cff;border-radius:99px;padding:1px 8px}</style><main><h1>Vextra Explore</h1><p>Games and sites published on this server.</p><div class="g">${items.map((x) => `<a class="c" href="/p/${esc(x.user)}/${esc(x.slug)}/"><b>${esc(x.title)}</b><br><small>by ${esc(x.user)}</small> <span class="k">${x.kind}</span></a>`).join('') || '<p>Nothing published yet.</p>'}</div></main>`;
  send(res, 200, html, { 'Content-Type': MIME.html });
}

/* ------------------------------------------------------------------ server */
const server = http.createServer(async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    if (url.pathname.startsWith('/api/')) return await api(req, res, url, ip);
    if (url.pathname.startsWith('/p/')) return serveSite(req, res, url);
    if (url.pathname === '/' || url.pathname === '/explore') return explorePage(req, res);
    return send(res, 404, 'Not found');
  } catch (e) { if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Server error'); if (!e.status) console.error('[error]', e); }
});
server.listen(PORT, () => console.log(`Vextra server listening on http://localhost:${PORT}\n  data: ${DATA}\n  sign-ups: ${ALLOW_REGISTER ? 'open' : 'closed'}`));
module.exports = { server };
