'use strict';
/* Vextra Studio – hosting for collaboration (zero dependencies, Node 18+).

   PRIVATE (default, and what the server always starts in): only this computer can reach the server.
   PUBLIC has two ways, both started and stopped from Settings → Hosting & collaboration:
     • "ghost" tunnel (recommended) – Cloudflare's `cloudflared` makes an outbound connection and gives the server an https:// address
       (random *.trycloudflare.com, or your own domain with a Cloudflare tunnel token). Visitors only ever see that address – your IP stays hidden
       and no router setting is needed.
     • direct port forward – opens a second port to the network (UPnP, if the router allows it) and shows your public address. Your IP is visible.
   While public: sign-up needs an invite code, the admin routes below only answer this computer, and sharing can stop by itself after N hours.
   Nothing here ever starts by itself: after a restart the server is private again. */
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), https = require('https'), dgram = require('dgram'), crypto = require('crypto');
const cp = require('child_process');

const LOOP = /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/;
const FORWARDED = ['x-forwarded-for', 'cf-connecting-ip', 'cf-ray', 'forwarded', 'x-real-ip', 'via', 'true-client-ip'];

/* ---------------------------------------------------------------- self-signed certificate (no OpenSSL needed) */
const der = {
  len: (n) => (n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255])),
  tlv(tag, ...b) { const body = Buffer.concat(b); return Buffer.concat([Buffer.from([tag]), der.len(body.length), body]); },
  seq: (...b) => der.tlv(0x30, ...b), set: (...b) => der.tlv(0x31, ...b),
  oid(s) { const a = s.split('.').map(Number); const out = [40 * a[0] + a[1]]; for (const n of a.slice(2)) { const t = [n & 127]; let v = n >> 7; while (v) { t.unshift((v & 127) | 128); v >>= 7; } out.push(...t); } return der.tlv(0x06, Buffer.from(out)); },
  utf8: (s) => der.tlv(0x0c, Buffer.from(s, 'utf8')), time(d) { const p = (n) => String(n).padStart(2, '0'); return der.tlv(0x17, Buffer.from(`${String(d.getUTCFullYear()).slice(2)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`)); },
  bits: (b) => der.tlv(0x03, Buffer.from([0]), b), octets: (b) => der.tlv(0x04, b),
};
/** Self-signed server certificate for `names` (host names and IP addresses). Returns { cert, key, fingerprint, notAfter } as PEM strings. */
function selfSigned(names, days = 365) { // `days` may be fractional (e.g. 0.5 = 12 h)
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serial = crypto.randomBytes(16); serial[0] &= 0x7f; if (!serial[0]) serial[0] = 1;
  const alg = der.seq(der.oid('1.2.840.113549.1.1.11'), Buffer.from([5, 0]));
  const name = der.seq(der.set(der.seq(der.oid('2.5.4.3'), der.utf8('Vextra Studio local server'))));
  const from = new Date(Date.now() - 300e3), to = new Date(Date.now() + Math.max(days, 0.01) * 86400e3);
  const san = names.map((n) => { const ip = /^\d+\.\d+\.\d+\.\d+$/.test(n) ? Buffer.from(n.split('.').map(Number)) : null; return ip ? der.tlv(0x87, ip) : der.tlv(0x82, Buffer.from(n)); });
  const ext = der.tlv(0xa3, der.seq(
    der.seq(der.oid('2.5.29.19'), Buffer.from([1, 1, 0xff]), der.octets(der.seq())),
    der.seq(der.oid('2.5.29.37'), der.octets(der.seq(der.oid('1.3.6.1.5.5.7.3.1')))),
    der.seq(der.oid('2.5.29.17'), der.octets(der.seq(...san)))));
  const tbs = der.seq(Buffer.from([0xa0, 3, 2, 1, 2]), der.tlv(2, serial), alg, name, der.seq(der.time(from), der.time(to)), name, publicKey.export({ type: 'spki', format: 'der' }), ext);
  const sig = crypto.sign('sha256', tbs, privateKey), cert = der.seq(tbs, alg, der.bits(sig));
  const pem = (t, b) => `-----BEGIN ${t}-----\n${b.toString('base64').replace(/(.{64})/g, '$1\n')}\n-----END ${t}-----\n`;
  return { cert: pem('CERTIFICATE', cert), key: privateKey.export({ type: 'pkcs8', format: 'pem' }), fingerprint: crypto.createHash('sha256').update(cert).digest('hex').match(/../g).join(':').toUpperCase(), notAfter: to.getTime() };
}

/* ---------------------------------------------------------------- UPnP (best effort; many routers have it switched off) */
const PRIVATE_IP = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.)/;
/** Finds this computer's public IPv4 address by asking a plain-text "what is my IP" service (the service sees your IP – that is the point). */
async function detectPublicIp() {
  for (const u of ['https://api.ipify.org', 'https://ipv4.icanhazip.com', 'https://ifconfig.me/ip']) {
    try {
      const t = await new Promise((res, rej) => { const r = https.get(u, { timeout: 4000, headers: { 'user-agent': 'vextra-studio' } }, (x) => { let b = ''; x.on('data', (d) => { b += d; if (b.length > 100) r.destroy(); }); x.on('end', () => res(b.trim())); }); r.on('timeout', () => r.destroy(new Error('timeout'))); r.on('error', rej); });
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(t) && !PRIVATE_IP.test(t)) return t;
    } catch { /* try the next one */ }
  }
  return '';
}
function lanIp() { for (const l of Object.values(os.networkInterfaces())) for (const a of l || []) if (a.family === 'IPv4' && !a.internal) return a.address; return ''; }
function httpText(url, opts = {}, body) { return new Promise((resolve, reject) => { const u = new URL(url); const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET', headers: opts.headers, timeout: 4000 }, (res) => { let s = ''; res.on('data', (c) => { s += c; if (s.length > 2e5) res.destroy(); }); res.on('end', () => resolve({ status: res.statusCode, body: s })); }); r.on('timeout', () => r.destroy(new Error('timeout'))); r.on('error', reject); if (body) r.write(body); r.end(); }); }
async function upnpFind() {
  const targets = ['urn:schemas-upnp-org:device:InternetGatewayDevice:1', 'urn:schemas-upnp-org:service:WANIPConnection:1'];
  const loc = await new Promise((resolve) => { const s = dgram.createSocket('udp4'); const done = (v) => { try { s.close(); } catch { /* closed */ } resolve(v); }; s.on('message', (m) => { const x = /^location:\s*(\S+)/im.exec(m.toString()); if (x) done(x[1]); }); s.on('error', () => done(null)); setTimeout(() => done(null), 2500); s.bind(0, () => { for (const st of targets) s.send(`M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`, 1900, '239.255.255.250'); }); });
  if (!loc) throw new Error('No router answered (UPnP is probably off). Forward the port in your router by hand, or use the tunnel.');
  const xml = (await httpText(loc)).body; const m = /<serviceType>(urn:schemas-upnp-org:service:WAN(?:IP|PPP)Connection:1)<\/serviceType>[\s\S]*?<controlURL>([^<]+)<\/controlURL>/.exec(xml);
  if (!m) throw new Error('The router does not offer port mapping.'); const base = new URL(loc); return { type: m[1], url: new URL(m[2], base.origin).toString(), internal: lanIp() };
}
const soap = (g, action, args) => httpText(g.url, { method: 'POST', headers: { 'content-type': 'text/xml; charset="utf-8"', soapaction: `"${g.type}#${action}"` } }, `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${g.type}">${args}</u:${action}></s:Body></s:Envelope>`);
async function upnpOpen(port) { const g = await upnpFind(); const r = await soap(g, 'AddPortMapping', `<NewRemoteHost></NewRemoteHost><NewExternalPort>${port}</NewExternalPort><NewProtocol>TCP</NewProtocol><NewInternalPort>${port}</NewInternalPort><NewInternalClient>${g.internal}</NewInternalClient><NewEnabled>1</NewEnabled><NewPortMappingDescription>Vextra Studio</NewPortMappingDescription><NewLeaseDuration>0</NewLeaseDuration>`); if (r.status !== 200) throw new Error('The router refused the port mapping.'); let ip = ''; try { ip = (/<NewExternalIPAddress>([^<]+)</.exec((await soap(g, 'GetExternalIPAddress', '')).body) || [])[1] || ''; } catch { /* optional */ } return { g, ip }; }
const upnpClose = (g, port) => soap(g, 'DeletePortMapping', `<NewRemoteHost></NewRemoteHost><NewExternalPort>${port}</NewExternalPort><NewProtocol>TCP</NewProtocol>`).catch(() => {});

/* ---------------------------------------------------------------- the host */
module.exports = function createHost({ DATA, PORT, handler }) {
  const CFG = path.join(DATA, 'host.json'), CERT = path.join(DATA, 'certs');
  let cfg = { mode: 'tunnel', directPort: 8788, publicHost: '', https: false, invite: '', hostname: '', token: '', hours: 4 };
  try { Object.assign(cfg, JSON.parse(fs.readFileSync(CFG, 'utf8'))); } catch { /* first run */ }
  const saveCfg = () => { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(cfg), { mode: 0o600 }); };
  const newInvite = () => crypto.randomBytes(5).toString('hex');
  if (!cfg.invite) { cfg.invite = newInvite(); try { saveCfg(); } catch { /* read-only data folder */ } }
  const st = { on: false, mode: '', url: '', ip: '', error: '', busy: '', upnp: '', since: 0, until: 0 };
  let tunnel = null, direct = null, mapping = null, stopTimer = 0, tail = [];
  const tailPush = (s) => { for (const l of String(s).split(/\r?\n/)) if (l.trim()) tail.push(l.trim().slice(0, 300)); tail = tail.slice(-12); };

  /** Admin routes answer only a request that really comes from this computer: loopback socket, no proxy headers (a tunnel connects from 127.0.0.1 too),
   *  a localhost Host header (blocks DNS rebinding) and a custom header (a web page on another site cannot send one). */
  function isAdmin(req) {
    if (!LOOP.test(req.socket.remoteAddress || '')) return false; if (FORWARDED.some((h) => req.headers[h])) return false;
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(req.headers.host || ''))) return false; return req.headers['x-vextra-admin'] === '1';
  }
  const fromLocal = (req) => LOOP.test(req.socket.remoteAddress || '') && !FORWARDED.some((h) => req.headers[h]);
  /** The address to rate-limit: forwarding headers count only when they come from our own tunnel process on this computer. */
  function clientIp(req) { const a = String(req.socket.remoteAddress || ''); if (LOOP.test(a)) { const f = req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0]; if (f) return String(f).trim(); } return a; }
  const requireInvite = (req) => st.on && !fromLocal(req);
  const checkInvite = (code) => { const a = Buffer.from(String(code || '').trim().toLowerCase()), b = Buffer.from(cfg.invite.toLowerCase()); return a.length === b.length && crypto.timingSafeEqual(a, b); };

  /* cloudflared */
  const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared', binDir = path.join(DATA, 'bin');
  function findCloudflared() { const own = path.join(binDir, exe); if (fs.existsSync(own)) return own; for (const d of String(process.env.PATH || '').split(path.delimiter)) { if (!d) continue; const p = path.join(d, exe); try { if (fs.statSync(p).isFile()) return p; } catch { /* next */ } } return ''; }
  function assetName() { const a = { x64: 'amd64', arm64: 'arm64', ia32: '386', arm: 'arm' }[process.arch]; if (!a) return ''; if (process.platform === 'win32') return `cloudflared-windows-${a}.exe`; if (process.platform === 'linux') return `cloudflared-linux-${a}`; return ''; }
  function get(url, hops = 0) {
    return new Promise((resolve, reject) => {
      const u = new URL(url); if (u.protocol !== 'https:' || !/(^|\.)(github\.com|githubusercontent\.com)$/.test(u.hostname)) return reject(new Error('Blocked download address'));
      https.get(u, { headers: { 'user-agent': 'vextra-studio' }, timeout: 20000 }, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && hops < 5) { r.resume(); return resolve(get(new URL(r.headers.location, u).toString(), hops + 1)); }
        if (r.statusCode !== 200) { r.resume(); return reject(new Error('Download failed (' + r.statusCode + ')')); }
        const chunks = []; let n = 0; r.on('data', (c) => { n += c.length; if (n > 120 * 1048576) r.destroy(new Error('Download too large')); else chunks.push(c); }); r.on('end', () => resolve(Buffer.concat(chunks))); r.on('error', reject);
      }).on('error', reject).on('timeout', function () { this.destroy(new Error('Download timed out')); });
    });
  }
  async function downloadCloudflared() {
    const a = assetName(); if (!a) throw new Error('Automatic download is not available for this system. Install cloudflared yourself (macOS: brew install cloudflared) and try again.');
    const buf = await get(`https://github.com/cloudflare/cloudflared/releases/latest/download/${a}`);
    if (buf.length < 5e6 || (process.platform === 'win32' ? buf.readUInt16LE(0) !== 0x5a4d : buf.readUInt32BE(0) !== 0x7f454c46)) throw new Error('The downloaded file does not look like a program – nothing was installed.');
    fs.mkdirSync(binDir, { recursive: true }); const p = path.join(binDir, exe), tmp = p + '.part'; fs.writeFileSync(tmp, buf, { mode: 0o755 }); fs.renameSync(tmp, p); return p;
  }

  /* start / stop */
  function stopAll() {
    clearTimeout(stopTimer); stopTimer = 0;
    if (tunnel) { try { tunnel.kill(); } catch { /* gone */ } tunnel = null; }
    if (direct) { try { direct.close(); direct.closeAllConnections && direct.closeAllConnections(); } catch { /* closed */ } direct = null; }
    if (mapping) { upnpClose(mapping.g, cfg.directPort); mapping = null; }
    deleteCert(); // the certificate only lives as long as the sharing does
    Object.assign(st, { on: false, mode: '', url: '', ip: '', busy: '', upnp: '', since: 0, until: 0 });
  }
  function startTunnel() {
    return new Promise((resolve, reject) => {
      const bin = findCloudflared(); if (!bin) return reject(Object.assign(new Error('cloudflared is not installed.'), { code: 'NO_CLOUDFLARED' }));
      const named = !!(cfg.token && cfg.hostname); const args = named ? ['tunnel', '--no-autoupdate', 'run'] : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`];
      const env = Object.assign({}, process.env); if (named) env.TUNNEL_TOKEN = cfg.token; else delete env.TUNNEL_TOKEN;
      tail = []; const child = cp.spawn(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); tunnel = child; let ok = false;
      const timer = setTimeout(() => { if (!ok) { try { child.kill(); } catch { /* gone */ } reject(new Error('The tunnel did not start in time. ' + tail.slice(-3).join(' '))); } }, 45000);
      const on = (d) => { const s = String(d); tailPush(s); if (ok) return; const m = named ? (/Registered tunnel connection|Connection [0-9a-f-]+ registered/i.test(s) ? [`https://${cfg.hostname.replace(/^https?:\/\//, '')}`] : null) : /https:\/\/[-a-z0-9]+\.trycloudflare\.com/i.exec(s); if (m) { ok = true; clearTimeout(timer); resolve(m[0]); } };
      child.stdout.on('data', on); child.stderr.on('data', on);
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('exit', (code) => { clearTimeout(timer); if (tunnel === child) { tunnel = null; if (st.on && st.mode === 'tunnel') { stopAll(); st.error = 'The tunnel stopped (' + code + '). ' + tail.slice(-2).join(' '); } } if (!ok) reject(new Error('The tunnel stopped (' + code + '). ' + tail.slice(-3).join(' '))); });
    });
  }
  async function startDirect() {
    const port = cfg.directPort; let opts = null;
    let ip = ''; let mapErr = '';
    try { mapping = await upnpOpen(port); ip = mapping.ip; st.upnp = 'Router port opened automatically (UPnP).'; } catch (e) { mapping = null; mapErr = e.message; }
    if (cfg.publicHost) ip = cfg.publicHost;   // an address you typed in wins
    else if (!ip || PRIVATE_IP.test(ip)) ip = (await detectPublicIp()) || '';   // the router may report a private address (double NAT / CGNAT): ask the internet instead
    if (mapErr) st.upnp = mapErr + ` Forward TCP port ${port} to this computer (${lanIp() || 'its LAN address'}) in your router.`;
    if (!ip) throw new Error('Could not find your public IP address automatically (no internet?). Type it into “Your public address” or check the connection.');
    if (cfg.https) { const c = makeCertFor(ip); opts = { cert: c.cert, key: c.key }; }
    const srv = opts ? https.createServer(opts, handler) : http.createServer(handler);
    try { await new Promise((res, rej) => { srv.once('error', (e) => rej(new Error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use.` : e.message))); srv.listen(port, '0.0.0.0', res); }); } catch (e) { if (mapping) { upnpClose(mapping.g, port); mapping = null; } deleteCert(); throw e; }
    direct = srv;
    return { url: `${opts ? 'https' : 'http'}://${ip}:${port}`, ip };
  }
  async function start(mode) {
    if (st.on || st.busy) throw new Error('Already ' + (st.on ? 'public' : 'starting') + '.'); mode = mode === 'direct' ? 'direct' : 'tunnel'; cfg.mode = mode; saveCfg(); st.error = ''; st.busy = mode;
    try {
      const r = mode === 'tunnel' ? { url: await startTunnel() } : await startDirect();
      Object.assign(st, { on: true, mode, url: r.url, ip: r.ip || '', since: Date.now(), until: cfg.hours > 0 ? Date.now() + cfg.hours * 3600e3 : 0 });
      if (cfg.hours > 0) { stopTimer = setTimeout(() => stopAll(), cfg.hours * 3600e3); stopTimer.unref && stopTimer.unref(); }
    } catch (e) { stopAll(); st.error = e.message; throw e; } finally { st.busy = ''; }
  }
  const certInfo = () => { try { const x = new crypto.X509Certificate(fs.readFileSync(path.join(CERT, 'server.crt'))); return { ready: true, fingerprint: x.fingerprint256, notAfter: Date.parse(x.validTo), names: x.subjectAltName || '' }; } catch { return { ready: false }; } };
  /** how long a certificate should live: exactly as long as the sharing (the "stop after" setting; 30 days at most when it never stops) */
  const certDays = () => (cfg.hours > 0 ? cfg.hours / 24 : 30);
  function makeCertFor(ip) {
    const names = ['localhost', '127.0.0.1', os.hostname(), lanIp(), ip].filter(Boolean); if (cfg.hostname) names.push(cfg.hostname.replace(/^https?:\/\//, '').replace(/[:/].*$/, ''));
    const c = selfSigned([...new Set(names)], certDays()); fs.mkdirSync(CERT, { recursive: true }); fs.writeFileSync(path.join(CERT, 'server.crt'), c.cert); fs.writeFileSync(path.join(CERT, 'server.key'), c.key, { mode: 0o600 }); return c;
  }
  function deleteCert() { let had = false; for (const f of ['server.crt', 'server.key']) { try { fs.unlinkSync(path.join(CERT, f)); had = true; } catch { /* not there */ } } return had; }
  function makeCert() {
    if (st.on) throw new Error('Make the server private first, then create the certificate.');
    makeCertFor(''); return certInfo();
  }
  function removeCert() { if (st.on && cfg.https && st.mode === 'direct') throw new Error('The certificate is in use. Make the server private first.'); deleteCert(); return status(); }
  function status() { const bin = findCloudflared(); return { ...st, config: { mode: cfg.mode, directPort: cfg.directPort, publicHost: cfg.publicHost, https: cfg.https, invite: cfg.invite, hostname: cfg.hostname, hasToken: !!cfg.token, hours: cfg.hours }, cloudflared: { found: !!bin, canDownload: !!assetName() }, cert: certInfo(), lan: lanIp() }; }
  function config(b) {
    if (st.on || st.busy) throw new Error('Make the server private before changing these settings.');
    if (b.mode != null) cfg.mode = b.mode === 'direct' ? 'direct' : 'tunnel';
    if (b.directPort != null) { const n = Math.round(+b.directPort); if (!(n >= 1024 && n <= 65535) || n === PORT) throw new Error('Pick a port between 1024 and 65535 (not ' + PORT + ').'); cfg.directPort = n; }
    if (b.publicHost != null) { const v = String(b.publicHost).trim(); if (v && !/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(v)) throw new Error('That is not a valid IP address or domain name.'); cfg.publicHost = v.toLowerCase(); }
    if (b.https != null) cfg.https = !!b.https; if (b.hours != null) { const h = Math.round(+b.hours); if (!(h >= 0 && h <= 168)) throw new Error('Stop-after must be 0 (never) to 168 hours.'); cfg.hours = h; }
    if (b.hostname != null) { const h = String(b.hostname).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''); if (h && !/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(h)) throw new Error('That is not a valid domain name.'); cfg.hostname = h.toLowerCase(); }
    if (b.token != null) { const t = String(b.token).trim(); if (t && !/^[A-Za-z0-9+/=_-]{20,2000}$/.test(t)) throw new Error('That does not look like a Cloudflare tunnel token.'); cfg.token = t; }
    if (b.newInvite) cfg.invite = newInvite(); saveCfg(); return status();
  }
  process.on('exit', stopAll);
  return { isAdmin, fromLocal, clientIp, requireInvite, checkInvite, status, config, start, stop: () => { stopAll(); return status(); }, makeCert, removeCert, detectPublicIp, downloadCloudflared, selfSigned };
};
module.exports.selfSigned = selfSigned;
