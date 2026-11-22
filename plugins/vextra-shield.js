/** @vx-plugin {"id":"vextra-shield","name":"Vextra Shield","version":"1.0.0","description":"Extra security for games, accounts and publishing: hardened game exports (CSP, save-tamper detection), password policy, sign-in lockout, idle sign-out, secret scanner and a project security audit. Has a ⚙ Configure button."} */
/** @vx-docs
 * ## What Vextra Shield does
 * Press **⚙ Configure** on the plugin card (or run **Shield: Configure…**) to choose what is active. Everything is on by default except the options marked *off*.
 *
 * | Area | Protection |
 * |---|---|
 * | **Game exports** | Adds a strict **Content-Security-Policy** to exported/published games: only the game's own scripts (pinned by SHA-256 hash) may run, no plugins/objects, no `<base>` or form hijacking, network limited to HTTPS/WSS. Optional: block right-click/drag, refuse to run inside other people's websites. |
 * | **Game saves** | Local saves (`vx:<game>:*` in localStorage) get a signature. A save edited by hand or by a cheat tool is ignored and the game starts that value fresh. |
 * | **Accounts** | Password policy (length, mixed characters, common-password list, not your username), **lockout** after repeated failed sign-ins, **idle sign-out**, and a warning before sending a password over plain `http://` to a remote server. |
 * | **Publishing** | Scans files before **Publish** for API keys, tokens, private keys and files such as `.env`, and asks before uploading them. |
 * | **Audit** | **Shield: Audit project** reviews the open folder (and the open game's code behaviours) for risky patterns and writes a report. |
 *
 * ### Honest limits
 * Anything that runs on the player's own computer can be changed by a determined player. Save signing and the CSP make casual tampering and injected scripts fail, they do not make cheating impossible – check scores and purchases on a server you control. The lockout and password policy run in the app; the Vextra server has its own rate limits and salted scrypt password hashing.
 */
const DEF = { csp: true, cspConnect: '', noContext: false, saveGuard: true, blockEmbed: false, embedHosts: '', pwMin: 10, pwMix: true, pwCommon: true, lockAttempts: 5, lockMinutes: 5, idleMinutes: 30, warnHttp: true, scanPublish: 'ask' };
const cfg = () => { const c = Object.assign({}, DEF); for (const k of Object.keys(DEF)) { const v = vx.settings.get(k); if (v !== undefined && v !== null && v !== '') c[k] = v; } return c; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const b64sha = async (text) => { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); let s = ''; new Uint8Array(d).forEach((x) => { s += String.fromCharCode(x); }); return btoa(s); };
const isLocal = (host) => /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i.test(host);

/* ------------------------------------------------------------------ game export hardening */
function secretKey() { let k = vx.settings.get('saveSecret'); if (!k) { const a = new Uint32Array(4); crypto.getRandomValues(a); k = [...a].map((n) => n.toString(36)).join(''); vx.settings.set('saveSecret', k); } return k; }
function saveGuardScript() {
  return `(function(){try{var D=document.currentScript.dataset,S=D.vxKey+':'+D.vxId,P='vx:'+D.vxId+':';
function h(s){var a=0xdeadbeef,b=0x41c6ce57;for(var i=0;i<s.length;i++){var c=s.charCodeAt(i);a=Math.imul(a^c,2654435761);b=Math.imul(b^c,1597334677)}a=Math.imul(a^(a>>>16),2246822507)^Math.imul(b^(b>>>13),3266489909);b=Math.imul(b^(b>>>16),2246822507)^Math.imul(a^(a>>>13),3266489909);return(4294967296*(2097151&b)+(a>>>0)).toString(36)}
var g=Storage.prototype.getItem,s=Storage.prototype.setItem,r=Storage.prototype.removeItem;
Storage.prototype.setItem=function(k,v){s.call(this,k,v);if(this===localStorage&&String(k).indexOf(P)===0)s.call(this,'__vxsig:'+k,h(S+k+v))};
Storage.prototype.removeItem=function(k){r.call(this,k);if(this===localStorage)r.call(this,'__vxsig:'+k)};
Storage.prototype.getItem=function(k){var v=g.call(this,k);if(this===localStorage&&v!==null&&String(k).indexOf(P)===0){var sg=g.call(this,'__vxsig:'+k);if(sg===null){s.call(this,'__vxsig:'+k,h(S+k+v))}else if(sg!==h(S+k+v)){console.warn('[Vextra Shield] a saved value was changed outside the game and was ignored: '+k);return null}}return v}}catch(e){}})();`;
}
const embedScript = () => `(function(){try{if(window.top!==window&&!window.__VX_CH){var ok=String(document.currentScript.dataset.vxHosts||'').split(',').filter(Boolean);var o=(location.ancestorOrigins&&location.ancestorOrigins[0])||document.referrer||'';if(!ok.some(function(h){return o.indexOf('//'+h)>-1})){document.documentElement.innerHTML='<p style="font:16px system-ui;padding:24px">This game can only be played on its own page.</p>';throw 0}}}catch(e){if(e===0)throw e}})();`;

vx.hooks.on('game.export.html', async (html, ctx) => {
  if (ctx.play) return html; // the editor preview is left alone so debugging keeps working
  const c = cfg(); const m = html.match(/<head[^>]*>/i); if (!m) return html;
  /* The scripts are fixed text. Their settings travel as HTML attributes (escaped), never spliced into code. */
  const attr = (v) => String(v).replace(/[&<>"'`]/g, (ch) => '&#' + ch.charCodeAt(0) + ';');
  const inject = [];
  if (c.saveGuard) inject.push(`<script data-vx-key="${attr(secretKey())}" data-vx-id="${attr(ctx.project?.settings?.id || 'game')}">${saveGuardScript()}</script>`);
  if (c.blockEmbed) inject.push(`<script data-vx-hosts="${attr(String(c.embedHosts).split(/[\s,]+/).filter(Boolean).join(','))}">${embedScript()}</script>`);
  if (c.noContext) inject.push("<script>addEventListener('contextmenu',function(e){e.preventDefault()});addEventListener('dragstart',function(e){e.preventDefault()});</script>");
  let out = html;
  if (inject.length) out = out.replace(m[0], () => m[0] + inject.join(''));
  if (c.csp) {
    const hashes = []; out.replace(/<script\b([^>]*)>([\s\S]*?)<\/script[^>]*>/gi, (all, attrs, body) => { if (!/\bsrc\s*=/.test(attrs)) hashes.push(body); return all; });
    const sums = []; for (const b of hashes) sums.push("'sha256-" + (await b64sha(b)) + "'");
    const connect = ['https:', 'wss:', 'data:', 'blob:'];
    const cloud = vx.game.current()?.settings?.cloudUrl; try { if (cloud) connect.push(new URL(cloud).origin); } catch (e) { /* ignore */ }
    for (const x of String(c.cspConnect).split(/[\s,]+/).filter(Boolean)) if (/^[\w:/.*\-\[\]]+$/.test(x)) connect.push(x);
    const policy = ["default-src 'none'", `script-src ${sums.join(' ')} 'unsafe-eval' blob:`, "style-src 'unsafe-inline'", "img-src data: blob: https:", "media-src data: blob: https:", "font-src data: https:", `connect-src ${[...new Set(connect)].join(' ')}`, "frame-src https: data: blob:", "worker-src blob:", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; ');
    const metas = `<meta http-equiv="Content-Security-Policy" content="${policy.replace(/"/g, '&quot;')}"><meta name="referrer" content="no-referrer">`;
    out = out.replace(/<head[^>]*>/i, (x) => x + metas);
  }
  return out;
});

/* ------------------------------------------------------------------ accounts */
const COMMON = 'password,password1,password123,123456,1234567,12345678,123456789,1234567890,qwerty,qwerty123,qwertyuiop,abc123,letmein,welcome,welcome1,admin,admin123,iloveyou,monkey,dragon,football,baseball,master,sunshine,princess,login,passw0rd,trustno1,starwars,minecraft,roblox,fortnite,whatever,000000,111111,121212,654321,zaq12wsx,1q2w3e4r,changeme,default,secret,vextra'.split(',');
function checkPassword(pw, username) {
  const c = cfg(); const u = String(username || '').toLowerCase(); const p = String(pw || '');
  if (p.length < c.pwMin) return `Use at least ${c.pwMin} characters (Vextra Shield policy).`;
  if (c.pwMix && !(/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p) && /[^A-Za-z0-9]/.test(p)) || (/[a-z]/i.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p)))) return 'Mix at least three kinds of characters: lower case, UPPER CASE, numbers, symbols.';
  if (/^(.)\1+$/.test(p) || /(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|qwer|asdf|zxcv)/i.test(p) && p.length < 14) return 'Avoid keyboard or number sequences like “1234” or “qwer”.';
  if (c.pwCommon && COMMON.includes(p.toLowerCase().replace(/[^a-z0-9]/g, ''))) return 'That password is on the list of the most common ones. Pick something unique.';
  if (u.length > 2 && p.toLowerCase().includes(u)) return 'The password must not contain your username.';
  return null;
}
vx.hooks.on('account.register', (x) => { const e = checkPassword(x.password, x.username); if (e) throw vx.hooks.block(e); });
vx.hooks.on('account.password', (x) => { const e = checkPassword(x.password, x.username); if (e) throw vx.hooks.block(e); });
const lockKey = (u, s) => 'vx-shield-lock:' + s + ':' + String(u).toLowerCase();
const readLock = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || { n: 0, until: 0 }; } catch (e) { return { n: 0, until: 0 }; } };
let httpOk = null;
async function warnPlain(server) {
  if (!cfg().warnHttp) return; let u; try { u = new URL(server); } catch (e) { return; } if (u.protocol !== 'http:' || isLocal(u.hostname) || httpOk === u.host) return;
  if (!(await vx.ui.confirm(`The server ${u.host} uses plain http:// – your password would travel unencrypted and could be read by anyone on the network. Continue anyway?`, 'Send anyway', { danger: true }))) throw vx.hooks.block('Cancelled: the server connection is not encrypted (use https://).');
  httpOk = u.host;
}
vx.hooks.on('account.register', (x) => warnPlain(x.server));
vx.hooks.on('account.login', async (x) => {
  const c = cfg(); const k = lockKey(x.username, x.server); const l = readLock(k);
  if (c.lockAttempts > 0 && l.until > Date.now()) throw vx.hooks.block(`Too many failed sign-ins. Try again in ${Math.ceil((l.until - Date.now()) / 60000)} min.`);
  await warnPlain(x.server);
});
vx.hooks.on('account.loginFailed', (x) => {
  const c = cfg(); if (c.lockAttempts <= 0 || x.status === undefined || x.status >= 500 || x.status === 429) return; const server = (window.VX && VX.cloud && VX.cloud.base()) || ''; const k = lockKey(x.username, server); const l = readLock(k); l.n++;
  if (l.n >= c.lockAttempts) { l.until = Date.now() + c.lockMinutes * 60000; l.n = 0; vx.ui.toast(`Sign-in locked for ${c.lockMinutes} min after ${c.lockAttempts} failed attempts.`, 'warn'); }
  localStorage.setItem(k, JSON.stringify(l));
});
vx.hooks.on('account.loginOk', (x) => { const server = (window.VX && VX.cloud && VX.cloud.base()) || ''; localStorage.removeItem(lockKey(x.username, server)); });

/* idle sign-out */
let lastActive = Date.now(); const bump = () => { lastActive = Date.now(); };
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, bump, true));
const idleTimer = setInterval(() => {
  const m = cfg().idleMinutes; if (!m || !vx.account.current()) return;
  if (Date.now() - lastActive > m * 60000) { lastActive = Date.now(); vx.account.signOut().then(() => vx.ui.toast(`Signed out after ${m} min of inactivity (Vextra Shield).`, 'warn')); }
}, 20000);
vx.onUnload(() => { clearInterval(idleTimer); ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.removeEventListener(ev, bump, true)); });

/* ------------------------------------------------------------------ secret scanner + audit */
const SECRETS = [
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/], ['Private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/], ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/], ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/], ['Stripe live key', /\b[sr]k_live_[0-9A-Za-z]{16,}\b/], ['JSON web token', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  ['Hard-coded credential', /\b(?:api[_-]?key|secret|passwd|password|token|auth)\w*\s*[:=]\s*['"][^'"\s]{8,}['"]/i],
];
const SENSITIVE_FILE = /(^|\/)(\.env(\..*)?|id_rsa|id_ed25519|credentials\.json|service-account.*\.json|.*\.(pem|key|p12|pfx|keystore|jks)|\.htpasswd|\.npmrc|\.git\/config)$/i;
const TEXT_EXT = /\.(html?|js|mjs|cjs|ts|jsx|tsx|php|json|css|md|txt|env|ya?ml|toml|ini|cfg|conf|sql|xml|vxgame)$/i;
const SKIP = /(^|\/)(node_modules|\.git|target|dist|vendor|store-export|\.vextra)(\/|$)/;
function scanText(rel, text) {
  const out = []; const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length && i < 20000; i++) { const ln = lines[i]; if (ln.length > 3000) continue; for (const [what, re] of SECRETS) if (re.test(ln)) out.push({ sev: 'high', what: 'Possible secret: ' + what, file: rel, line: i + 1, text: ln.trim().slice(0, 110).replace(/(['"])[^'"]{6,}\1/g, '$1••••$1') }); }
  return out;
}
const RISKS = [
  ['high', 'PHP runs user input as code / shell', /\b(?:eval|assert|system|exec|shell_exec|passthru|popen|proc_open)\s*\([^)]*\$_(?:GET|POST|REQUEST|COOKIE)/, /\.php$/i],
  ['high', 'SQL built from user input (use prepared statements)', /(?:SELECT|INSERT|UPDATE|DELETE)\b[^;\n]*\$_(?:GET|POST|REQUEST)|query\s*\([^)]*\.\s*\$_(?:GET|POST|REQUEST)/i, /\.php$/i],
  ['high', 'PHP include of user-controlled path', /\b(?:include|require)(?:_once)?\s*\(?[^;\n]*\$_(?:GET|POST|REQUEST)/, /\.php$/i],
  ['high', 'unserialize() of user input', /unserialize\s*\(\s*\$_/, /\.php$/i],
  ['medium', 'Weak password hash (use password_hash / bcrypt / argon2)', /\b(?:md5|sha1)\s*\(\s*\$?\w*pass/i, /\.(php|js|mjs)$/i],
  ['medium', 'eval() or new Function() runs text as code', /(?<![\w.])eval\s*\(|new\s+Function\s*\(/, /\.(js|mjs|html?|php)$/i],
  ['medium', 'innerHTML / insertAdjacentHTML with variable content (XSS risk)', /\.(?:innerHTML|outerHTML)\s*[+]?=\s*(?!['"`]\s*['"`;])[^;]*[a-zA-Z_$][\w$]*|insertAdjacentHTML\s*\(/, /\.(js|mjs|html?)$/i],
  ['medium', 'document.write()', /document\.write(?:ln)?\s*\(/, /\.(js|mjs|html?)$/i],
  ['medium', 'Token or password stored in localStorage', /localStorage\.setItem\s*\(\s*['"][^'"]*(?:token|password|passwd|secret)/i, /\.(js|mjs|html?)$/i],
  ['medium', 'Insecure http:// resource (blocked or flagged as mixed content on https)', /(?:src|href|action)\s*=\s*["']http:\/\/(?!localhost|127\.|0\.0\.0\.0)/i, /\.(html?|php)$/i],
  ['low', 'target="_blank" without rel="noopener"', /<a\b(?=[^>]*target\s*=\s*["']_blank["'])(?![^>]*rel\s*=\s*["'][^"']*noopener)[^>]*>/i, /\.(html?|php)$/i],
  ['low', 'Inline event handler (blocks a strict Content-Security-Policy)', /<[a-z][^>]*\son(?:click|load|error|mouseover|submit|change)\s*=/i, /\.(html?|php)$/i],
  ['low', 'Math.random() used for something that looks like a token or id', /(?:token|secret|session|nonce|csrf)\w*[^;\n]*Math\.random\s*\(/i, /\.(js|mjs|html?)$/i],
  ['low', 'CORS allows every origin', /Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]?\*/i, /\.(php|js|mjs|conf|htaccess)$/i],
];
function scanRisks(rel, text) {
  const out = []; const lines = text.split(/\r?\n/);
  for (const [sev, what, re, ext] of RISKS) { if (!ext.test(rel)) continue; let n = 0; for (let i = 0; i < lines.length && n < 8; i++) { if (lines[i].length > 3000) continue; if (re.test(lines[i])) { out.push({ sev, what, file: rel, line: i + 1, text: lines[i].trim().slice(0, 110) }); n++; } } }
  if (/\.html?$/i.test(rel) && !/Content-Security-Policy/i.test(text) && /<script|<form/i.test(text)) out.push({ sev: 'info', what: 'No Content-Security-Policy meta tag (add one, or serve the header)', file: rel, line: 1, text: '' });
  return out;
}
async function readText(rel) { try { const t = await vx.fs.readFile(vx.fs.root().replace(/[\\/]$/, '') + '/' + rel); return typeof t === 'string' ? t : ''; } catch (e) { return ''; } }
function auditGame(project) {
  const out = [];
  for (const b of Object.values(project.behaviors || {})) if (b.mode === 'code' || b.code) { const t = String(b.code || ''); for (const [what, re] of [['eval / Function in behaviour code', /\beval\s*\(|new\s+Function\s*\(/], ['Cookie access in behaviour code', /document\.cookie/], ['Direct localStorage access (use the Save blocks so saves are protected)', /\blocalStorage\b/], ['Network call to a plain http:// URL', /(?:fetch|XMLHttpRequest|open)\s*\([^)]*['"]http:\/\/(?!localhost|127\.)/]]) if (re.test(t)) out.push({ sev: 'medium', what, file: 'game behaviour “' + b.name + '”', line: 0, text: '' }); }
  for (const s of project.scenes || []) for (const o of s.objects || []) for (const n of (o.graph && o.graph.nodes) || []) if (n.type === 'ad' && n.params && /<script|onerror\s*=/i.test(String(n.params.html || n.params.tag || ''))) out.push({ sev: 'medium', what: 'Ad block contains a custom HTML tag with script – only paste tags from providers you trust', file: 'object “' + o.name + '”', line: 0, text: '' });
  return out;
}
async function audit() {
  const root = vx.fs.root(); const game = vx.game.current(); if (!root && !game) return vx.ui.toast('Open a folder (or a game) first.', 'warn');
  const ui = vx.ui.progress('Vextra Shield – auditing'); let findings = []; let scanned = 0;
  try {
    if (root) {
      const files = (await vx.fs.list(4000)).filter((f) => !SKIP.test(f));
      for (let i = 0; i < files.length; i++) { const f = files[i]; if (ui.cancelled) break; if (SENSITIVE_FILE.test(f)) findings.push({ sev: 'high', what: 'Sensitive file in the project folder (do not publish or commit it)', file: f, line: 0, text: '' });
        if (TEXT_EXT.test(f)) { const t = await readText(f); if (t && t.length < 600000) { scanned++; findings.push(...scanText(f, t), ...scanRisks(f, t)); } } if (i % 25 === 0) ui.set((i / files.length) * 100, `${f}`); }
    }
    if (game) findings.push(...auditGame(game));
  } finally { ui.close(); }
  const order = { high: 0, medium: 1, low: 2, info: 3 }; findings.sort((a, b) => order[a.sev] - order[b.sev]);
  const count = (s) => findings.filter((f) => f.sev === s).length; const score = Math.max(0, 100 - count('high') * 15 - count('medium') * 5 - count('low') * 1);
  const color = { high: '#ef5b5b', medium: '#f5a623', low: '#6c8cff', info: '#8b93a1' };
  const rows = findings.slice(0, 300).map((f) => `<tr><td><b style="color:${color[f.sev]}">${f.sev}</b></td><td>${esc(f.what)}<div style="color:var(--muted);font-size:11.5px">${esc(f.file)}${f.line ? ':' + f.line : ''}${f.text ? ' — <code>' + esc(f.text) + '</code>' : ''}</div></td></tr>`).join('');
  const html = `<div style="min-width:min(760px,86vw)"><div style="display:flex;gap:18px;align-items:center;margin-bottom:10px"><div style="font-size:34px;font-weight:800">${score}<small style="font-size:14px;color:var(--muted)">/100</small></div><div>${scanned} file(s) scanned · <b style="color:${color.high}">${count('high')} high</b> · <b style="color:${color.medium}">${count('medium')} medium</b> · ${count('low')} low · ${count('info')} info</div></div>${findings.length ? `<div style="max-height:56vh;overflow:auto"><table style="width:100%;border-collapse:collapse"><tbody>${rows}</tbody></table></div>${findings.length > 300 ? '<p>…and ' + (findings.length - 300) + ' more (see the saved report).</p>' : ''}` : '<p>✅ Nothing suspicious found. This is a pattern scan, not a guarantee – review login, payment and data handling yourself.</p>'}<p style="color:var(--muted);font-size:12px">Pattern-based review: expect some false positives. Secrets are masked in this report.</p></div>`;
  const md = ['# Security audit', '', `Generated by Vextra Shield · score ${score}/100 · ${new Date().toISOString().slice(0, 10)}`, '', ...findings.map((f) => `- **${f.sev}** — ${f.what} — \`${f.file}${f.line ? ':' + f.line : ''}\`${f.text ? ' — `' + f.text.replace(/`/g, "'") + '`' : ''}`), ''].join('\n');
  const m = vx.ui.modal({ title: 'Vextra Shield – security audit', html, wide: true });
  if (root && findings.length && await vx.ui.confirm('Save this report as SECURITY-AUDIT.md in your project folder?', 'Save report')) { await vx.fs.writeFile(root.replace(/[\\/]$/, '') + '/SECURITY-AUDIT.md', md); vx.ui.toast('Saved SECURITY-AUDIT.md', 'ok'); }
  return m;
}

/* publishing guard */
vx.hooks.on('publish.before', async (x) => {
  const mode = cfg().scanPublish; if (mode === 'off' || !x.files) return; const found = [];
  for (const [rel, v] of Object.entries(x.files)) { if (SENSITIVE_FILE.test(rel)) found.push(`${rel} — sensitive file`); else if (typeof v === 'string' && v.length < 800000) for (const f of scanText(rel, v)) found.push(`${rel}:${f.line} — ${f.what}`); }
  if (!found.length) return; const shown = found.slice(0, 8).join('\n') + (found.length > 8 ? `\n…and ${found.length - 8} more` : '');
  if (mode === 'block') throw vx.hooks.block('Publishing stopped by Vextra Shield – possible secrets found:\n' + shown);
  if (!(await vx.ui.confirm('Vextra Shield found possible secrets in the files you are about to publish (anyone with the link can read them):\n\n' + shown + '\n\nPublish anyway?', 'Publish anyway', { danger: true }))) throw vx.hooks.block('Publishing cancelled (possible secrets in the files).');
});

/* ------------------------------------------------------------------ configuration + commands */
vx.config.register({
  title: 'Vextra Shield – settings', intro: 'Choose which protections are active. Changes apply to the next export, sign-in or publish. Account protection for your profile (authenticator app, security keys) is under Cloud → Manage account.', defaults: DEF,
  fields: [
    { key: 'csp', group: 'Game exports', label: 'Game exports: strict Content-Security-Policy', type: 'checkbox', hint: 'Only the game’s own scripts may run (pinned by hash). Network limited to HTTPS/WSS.' },
    { key: 'cspConnect', group: 'Game exports', label: 'Extra allowed connection hosts', placeholder: 'https://api.example.com wss://game.example.com', hint: 'Only needed for http:// or unusual servers. Space-separated.' },
    { key: 'saveGuard', group: 'Game exports', label: 'Game exports: detect edited saves (signed localStorage)', type: 'checkbox' },
    { key: 'noContext', group: 'Game exports', label: 'Game exports: block right-click and drag (off by default)', type: 'checkbox' },
    { key: 'blockEmbed', group: 'Game exports', label: 'Game exports: refuse to run inside other websites (off by default)', type: 'checkbox' },
    { key: 'embedHosts', group: 'Game exports', label: 'Sites allowed to embed the game', placeholder: 'mysite.com itch.io', hint: 'Used only when the option above is on.' },
    { key: 'pwMin', group: 'Accounts', label: 'Accounts: minimum password length', type: 'number' },
    { key: 'pwMix', group: 'Accounts', label: 'Accounts: require a mix of character types', type: 'checkbox' },
    { key: 'pwCommon', group: 'Accounts', label: 'Accounts: reject common passwords', type: 'checkbox' },
    { key: 'lockAttempts', group: 'Accounts', label: 'Accounts: lock sign-in after N failed attempts (0 = off)', type: 'number' },
    { key: 'lockMinutes', group: 'Accounts', label: 'Accounts: lockout length (minutes)', type: 'number' },
    { key: 'idleMinutes', group: 'Accounts', label: 'Accounts: sign out after N idle minutes (0 = off)', type: 'number' },
    { key: 'warnHttp', group: 'Accounts', label: 'Accounts: warn before using a password over http://', type: 'checkbox' },
    { key: 'scanPublish', group: 'Publishing', label: 'Publishing: secret scan', type: 'select', options: [['ask', 'Ask before publishing'], ['block', 'Block publishing'], ['off', 'Off']] },
  ],
  validate: (v) => (v.pwMin < 6 ? 'A minimum password length below 6 is not allowed.' : v.lockAttempts < 0 || v.lockMinutes < 0 || v.idleMinutes < 0 ? 'Numbers cannot be negative.' : null),
  load: () => cfg(),
  save: (v) => { for (const k of Object.keys(DEF)) vx.settings.set(k, v[k]); refresh(); },
});
vx.commands.register({ id: 'configure', title: 'Shield: Configure…', run: () => vx.config.open() });
vx.commands.register({ id: 'audit', title: 'Shield: Audit project…', run: audit });
vx.commands.register({ id: 'export', title: 'Shield: Export hardened game (.html)', async run() { const p = vx.game.current(); if (!p) return vx.ui.toast('Open a game first.', 'warn'); const html = await vx.game.exportHTML(p); VX.download((p.settings.title || 'game').replace(/[^\w.-]+/g, '_') + '-hardened.html', html, 'text/html'); vx.ui.toast('Exported with Shield protections.', 'ok'); } });
vx.commands.register({ id: 'checkpw', title: 'Shield: Test a password against the policy…', async run() { const pw = await vx.ui.prompt('Type a password to test (it is not stored or sent anywhere)'); if (pw == null) return; const e = checkPassword(pw, ''); vx.ui.toast(e || 'Passes the current password policy ✔', e ? 'warn' : 'ok'); } });
const status = vx.statusBar.add({ id: 'shield', text: '🛡 Shield', align: 'right', tooltip: 'Vextra Shield – click to configure', onClick: () => vx.config.open() });
function refresh() { const c = cfg(); status.update('🛡 Shield' + (c.csp && c.saveGuard ? '' : ' (partial)')); }
refresh();

/* ------------------------------------------------------------------ account security (shows in Your account → profile) */
const el = (t, a, ...k) => { const e = document.createElement(t); for (const [n, v] of Object.entries(a || {})) { if (n === 'class') e.className = v; else if (n === 'style') e.style.cssText = v; else if (n.startsWith('on')) e[n] = v; else e.setAttribute(n, v); } for (const x of k.flat()) if (x != null) e.append(x.nodeType ? x : document.createTextNode(x)); return e; };
const groups4 = (s) => s.replace(/(.{4})/g, '$1 ').trim();
async function showRecovery(codes) {
  const text = codes.join('\n');
  vx.ui.modal({ title: 'Recovery codes', html: `<p>Save these codes somewhere safe. Each works <b>once</b> if you lose your authenticator. They will not be shown again.</p><pre style="user-select:all;font-size:15px;line-height:1.7;background:var(--bg2,#0003);padding:10px;border-radius:8px">${esc(text)}</pre>` });
  try { await navigator.clipboard.writeText(text); vx.ui.toast('Recovery codes copied', 'ok'); } catch { /* clipboard blocked */ }
}
async function askPw(why) { const v = await vx.ui.form({ title: 'Confirm your password', intro: why, submit: 'Continue', fields: [{ key: 'pw', label: 'Password', type: 'password', required: true }] }); return v && v.pw; }
vx.account.addSection({ id: 'security', render(box) {
  const S = vx.account.security; const body = el('div', { style: 'margin:14px 0;padding:12px;border:1px solid var(--border);border-radius:10px' });
  box.append(el('div', { class: 'group-title' }, '🛡 Account security (Vextra Shield)'), body);
  const err = (e) => vx.ui.toast(e.message || String(e), 'error');
  async function draw() {
    body.textContent = 'Loading…'; let s; try { s = await S.security(); } catch (e) { body.textContent = 'Could not load: ' + e.message; return; }
    body.textContent = '';
    const row = (title, sub, ...btns) => el('div', { style: 'display:flex;gap:10px;align-items:center;justify-content:space-between;padding:6px 0' }, el('div', {}, el('b', {}, title), el('div', { style: 'color:var(--muted);font-size:12px' }, sub)), el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, ...btns));
    const btn = (label, fn, cls) => el('button', { class: 'btn sm ' + (cls || ''), onclick: async () => { try { await fn(); } catch (e) { err(e); } } }, label);
    body.append(row('Authenticator app (2-step)', s.mfa ? `On · ${s.recoveryLeft} recovery code${s.recoveryLeft === 1 ? '' : 's'} left` : 'Off – asks for a 6-digit code every time you sign in',
      s.mfa ? btn('New recovery codes', async () => { const pw = await askPw('New codes replace the old ones.'); if (!pw) return; await showRecovery((await S.mfaRecovery(pw)).recovery); draw(); }) : btn('Turn on', async () => {
        const pw = await askPw('Two-step sign-in adds a code from an authenticator app (Google Authenticator, Microsoft Authenticator, Aegis, 1Password…).'); if (!pw) return; const r = await S.mfaSetup(pw);
        const intro = document.createElement('div'); const line = (t, st) => { const d = document.createElement('div'); d.textContent = t; if (st) d.style.cssText = st; return d; };
        intro.append(line('Open your authenticator app and scan this QR code:'));
        const qrBox = document.createElement('div'); qrBox.style.cssText = 'display:flex;justify-content:center;margin:10px 0'; try { qrBox.innerHTML = window.VX.qr.svg(r.uri, { scale: 5, label: 'Authenticator setup QR code' }); const sv = qrBox.firstChild; sv.style.cssText = 'border-radius:8px;max-width:100%;height:auto'; } catch { qrBox.textContent = ''; } intro.append(qrBox);
        intro.append(line('Can’t scan? Choose “Enter a setup key” in the app instead (account: ' + vx.account.current().username + ', type: time-based):'), line(groups4(r.secret), 'font-family:monospace;font-size:15px;margin-top:6px;user-select:all'));
        const v = await vx.ui.form({ title: 'Set up your authenticator', submit: 'Verify and turn on', intro, fields: [{ key: 'code', label: '6-digit code from the app', required: true, placeholder: '123456' }, { key: 'copy', label: 'Copy the key to the clipboard', type: 'checkbox', value: true }] });
        if (!v) return; if (v.copy) { try { await navigator.clipboard.writeText(r.secret); } catch { /* ignore */ } } const done = await S.mfaEnable(pw, v.code); await showRecovery(done.recovery); draw();
      }, 'primary'), s.mfa ? btn('Turn off', async () => { const pw = await askPw('Turning off two-step makes your account easier to break into.'); if (!pw) return; await S.mfaDisable(pw); vx.ui.toast('Two-step sign-in is off', 'warn'); draw(); }, 'danger') : null));
    body.append(el('div', { style: 'height:1px;background:var(--border);margin:6px 0' }));
    body.append(row('Security keys / passkeys', s.keys.length ? `${s.keys.length} key${s.keys.length === 1 ? '' : 's'} added` : 'None – sign in by touching a hardware key', btn('Add a key', async () => {
      const pw = await askPw('Insert or tap your security key when your system asks.'); if (!pw) return; const n = await vx.ui.prompt('Name this key', 'My security key'); if (n === null || n === undefined) return; await S.addKey(pw, n || 'Security key'); vx.ui.toast('Key added', 'ok'); draw(); }, 'primary')));
    for (const k of s.keys) body.append(el('div', { style: 'display:flex;justify-content:space-between;align-items:center;padding:3px 0 3px 14px;font-size:12.5px' }, el('span', {}, '🔑 ' + k.name + ' · ' + new Date(k.created).toLocaleDateString()), btn('Remove', async () => { const pw = await askPw('Remove “' + k.name + '” from your account.'); if (!pw) return; await S.removeKey(pw, k.id); draw(); }, 'danger')));
    body.append(el('p', { style: 'color:var(--muted);font-size:11.5px;margin:8px 0 0' }, 'Keys only work in the app/address they were added from. Keep recovery codes safe – they are the way back in if you lose the authenticator.'));
  }
  draw();
} });
