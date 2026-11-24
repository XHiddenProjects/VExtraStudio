/* Vextra game runtime – anti-cheat. Configured by the game's admin (editor → 🛡 Anti-cheat), stored in settings.antiCheat.
 * Honest scope: the game runs on the player's device, so this is deterrence + reporting, not a guarantee. The admin is never affected:
 * the editor's Play is exempt and a passphrase (#vx-admin=… once) exempts the admin's browser in the exported game. */
(function () {
  'use strict';
  const V = (window.VXRT = window.VXRT || {});
  /* ---- SHA-256 (the admin passphrase is only ever stored as this hash) ---- */
  const K = []; { let n = 0; for (let c = 2; n < 64; c++) { let p = true; for (let d = 2; d * d <= c; d++) if (c % d === 0) { p = false; break; } if (p) { const x = Math.cbrt(c); K.push(Math.floor((x - Math.floor(x)) * 4294967296) >>> 0); n++; } } }
  const H0 = []; { let n = 0; for (let c = 2; n < 8; c++) { let p = true; for (let d = 2; d * d <= c; d++) if (c % d === 0) { p = false; break; } if (p) { const x = Math.sqrt(c); H0.push(Math.floor((x - Math.floor(x)) * 4294967296) >>> 0); n++; } } }
  function sha256(str) {
    const b = new TextEncoder().encode(String(str)), l = b.length, n = (((l + 9 + 63) >> 6) << 6), m = new Uint8Array(n); m.set(b); m[l] = 0x80; const dv = new DataView(m.buffer); dv.setUint32(n - 4, (l * 8) >>> 0); dv.setUint32(n - 8, Math.floor(l / 536870912));
    const h = H0.slice(), w = new Array(64).fill(0), rr = (x, k) => (x >>> k) | (x << (32 - k));
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) { const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0; }
      let [a, bb, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) { const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0, S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22), mj = (a & bb) ^ (a & c) ^ (bb & c), t2 = (S0 + mj) >>> 0; hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0; }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + bb) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0; h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    return h.map((x) => x.toString(16).padStart(8, '0')).join('');
  }
  V.sha256 = sha256;
  V.adminProof = (pass, gameId) => sha256('vx-admin|' + gameId + '|' + pass);
  /** a fast fingerprint of the game's data (not counting the fingerprint itself) – exported games compare it with the one made at export time */
  V.dataFingerprint = (data) => {
    const s = JSON.stringify(Object.assign({}, data, { settings: Object.assign({}, data.settings, { antiCheat: Object.assign({}, (data.settings || {}).antiCheat, { dataHash: '' }) }) }));
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0') + ':' + s.length;
  };
  const DEF = { enabled: false, report: false, warnText: 'Unusual activity was detected. Please play fairly.', kickText: 'You were removed from the game for breaking the fair-play rules.', banText: 'You are banned from this game.', escalateAt: 3, escalateAction: 'kick', banMinutes: 0, cooldown: 10, maxInputsPerSecond: 30, adminHash: '', dataHash: '', rules: [], checks: { speed: { on: true, action: 'warn' }, rules: { on: true, action: 'revert' }, tamper: { on: true, action: 'warn' }, input: { on: true, action: 'warn' }, devtools: { on: false, action: 'log' }, integrity: { on: true, action: 'kick' } } };
  V.antiCheatDefaults = () => JSON.parse(JSON.stringify(DEF));

  V.initAntiCheat = function (g) {
    const cfg0 = (g.settings || {}).antiCheat; if (!cfg0 || !cfg0.enabled) return;
    const cfg = Object.assign(JSON.parse(JSON.stringify(DEF)), cfg0); cfg.checks = Object.assign({}, DEF.checks, cfg0.checks || {});
    const id = g.settings.id || 'game'; const ac = (g.anticheat = { cfg, events: [], strikes: 0, admin: false, banned: false });
    const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* blocked */ } } };
    /* ---- admin: never checked, never banned ---- */
    const proofOk = (p) => !!cfg.adminHash && V.adminProof(String(p), id) === cfg.adminHash;
    try { const m = /[#&]vx-admin=([^&]*)/.exec(location.hash); if (m && proofOk(decodeURIComponent(m[1]))) { ls.set('vx-ac-admin-' + id, '1'); history.replaceState(null, '', location.pathname + location.search); } } catch { /* ignore */ }
    if ((g.opts && g.opts.channel) || ls.get('vx-ac-admin-' + id) === '1') { ac.admin = true; return; }
    window.VXAC = { admin: (p) => { if (proofOk(p)) { ls.set('vx-ac-admin-' + id, '1'); return true; } return false; } };
    let pid = ls.get('vx-ac-pid'); if (!pid) { pid = Math.random().toString(36).slice(2) + Date.now().toString(36); ls.set('vx-ac-pid', pid); }
    const root = g.container || document.body;
    const overlay = (text, opts) => { const o = document.createElement('div'); o.style.cssText = 'position:absolute;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.82);color:#fff;font:600 18px system-ui,sans-serif;text-align:center;padding:24px'; const d = document.createElement('div'); d.style.cssText = 'max-width:420px'; d.textContent = text; o.append(d); if (opts && opts.resume) { const b = document.createElement('button'); b.textContent = 'Continue'; b.style.cssText = 'display:block;margin:16px auto 0;padding:10px 22px;border-radius:10px;border:0;background:#2457d6;color:#fff;font:600 16px system-ui'; b.onclick = () => { o.remove(); g.paused = false; }; d.append(b); } root.append(o); return o; };
    const banner = (text) => { const b = document.createElement('div'); b.style.cssText = 'position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:110;background:#b3261e;color:#fff;font:600 14px system-ui;padding:8px 14px;border-radius:8px;max-width:90%;text-align:center;pointer-events:none'; b.textContent = text; root.append(b); setTimeout(() => b.remove(), 5000); };
    const base = String(g.settings.cloudUrl || '').replace(/\/+$/, '');
    const report = (ev) => { if (!cfg.report || !base) return; try { fetch(base + '/api/anticheat/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: id, player: pid, check: ev.check, detail: String(ev.detail).slice(0, 200), strikes: ac.strikes, action: ev.action }), keepalive: true }).catch(() => {}); } catch { /* offline */ } };
    const stopGame = () => { g.running = false; try { if (g._raf) cancelAnimationFrame(g._raf); } catch { /* ignore */ } };
    const showBan = () => { ac.banned = true; stopGame(); overlay(cfg.banText); };
    const bans = () => { const b = ls.get('vx-ac-ban-' + id); if (!b) return false; const until = +b; if (until === 0 || until > Date.now()) return true; ls.set('vx-ac-ban-' + id, null); return false; };
    if (bans()) { showBan(); return; }
    if (cfg.report && base) { try { fetch(base + '/api/anticheat/ban?game=' + encodeURIComponent(id) + '&player=' + encodeURIComponent(pid)).then((r) => r.json()).then((j) => { if (j && j.banned) { ls.set('vx-ac-ban-' + id, String(j.until || 0)); showBan(); } }).catch(() => {}); } catch { /* offline */ } }
    const last = {};
    function run(action, check) {
      if (action === 'warn' || (action === 'revert' && check !== 'rules')) banner(cfg.warnText);
      else if (action === 'pause') { g.paused = true; overlay(cfg.warnText, { resume: true }); }
      else if (action === 'reset') { banner(cfg.warnText); try { g.restart(true); } catch { /* ignore */ } }
      else if (action === 'kick') { stopGame(); overlay(cfg.kickText); }
      else if (action === 'ban') { ls.set('vx-ac-ban-' + id, cfg.banMinutes > 0 ? String(Date.now() + cfg.banMinutes * 60000) : '0'); showBan(); }
      else if (action === 'revert') banner(cfg.warnText);
    }
    function flag(check, detail) {
      const now = Date.now(); if (last[check] && now - last[check] < cfg.cooldown * 1000) return; last[check] = now;
      const c = cfg.checks[check] || { action: 'log' }; ac.strikes++;
      let action = c.action || 'log'; if (cfg.escalateAt > 0 && ac.strikes >= cfg.escalateAt && ['log', 'warn', 'revert'].includes(action)) action = cfg.escalateAction || 'kick';
      const ev = { at: now, check, detail: String(detail), action }; ac.events.push(ev); if (ac.events.length > 100) ac.events.shift(); report(ev); run(action, check);
    }
    ac.flag = flag;
    const on = (k) => cfg.checks[k] && cfg.checks[k].on;
    /* ---- outside edits: g.vars may only be written by the game's own code ---- */
    if (on('tamper')) {
      const legit = () => { const st = String(new Error().stack || '').split('\n').slice(3).join('\n'); return /eval at|VXRT|rt-core|rt-graph|blocks-/.test(st); };
      let raw = g.vars, prox = null; const wraps = new WeakMap(); /* proxy -> its target: writing a guarded object back (g.vars = g.vars) must never add another layer, or the chain grows every frame and ends in "Maximum call stack size exceeded" */
      const mk = (o) => { if (wraps.has(o)) return o; const p = new Proxy(o, { set(t, k, v) { if (!legit()) { flag('tamper', 'variable "' + String(k) + '" was changed from outside the game'); return true; } t[k] = v; return true; }, deleteProperty(t, k) { if (!legit()) { flag('tamper', 'variable "' + String(k) + '" was deleted from outside the game'); return true; } delete t[k]; return true; } }); wraps.set(p, o); return p; };
      prox = mk(raw); try { Object.defineProperty(g, 'vars', { configurable: true, get: () => prox, set: (v) => { if (v === prox) return; raw = wraps.get(v) || v; prox = mk(raw); } }); } catch { /* frozen */ }
      try { delete window.__vxGame; } catch { /* ignore */ }
    }
    /* ---- integrity: the game data is still what was exported ---- */
    if (on('integrity') && cfg.dataHash) { try { if (V.dataFingerprint(g.data) !== cfg.dataHash) flag('integrity', 'game data does not match the exported version'); } catch { /* ignore */ } }
    /* ---- speed: game time must not run faster than the clock ---- */
    if (on('speed')) { let w0 = performance.now(), t0 = g.time || 0, bad = 0; const t = setInterval(() => { if (!g.running) return clearInterval(t); const w = performance.now(), gt = g.time || 0; const dw = (w - w0) / 1000, dg = gt - t0; w0 = w; t0 = gt; if (g.paused || document.hidden || dw > 3 || dw < 0.5) { bad = 0; return; } if (dg > dw * 1.6 || dg < 0) { if (++bad >= 3) { bad = 0; flag('speed', 'game clock ran ' + (dg / dw).toFixed(1) + '× faster than real time'); } } else bad = 0; }, 1000); }
    /* ---- rules: your own limits on variables ---- */
    if (on('rules') && cfg.rules.length) {
      const prev = {}; const t = setInterval(() => { if (!g.running) return clearInterval(t); const now = performance.now(); for (const r of cfg.rules) { if (!r || !r.var) continue; const raw = g.vars; const v = raw[r.var]; if (typeof v !== 'number' || !Number.isFinite(v)) continue; const p = prev[r.var]; let bad = '';
        if (Number.isFinite(+r.max) && r.max !== '' && r.max !== null && v > +r.max) bad = 'is above ' + r.max; else if (Number.isFinite(+r.min) && r.min !== '' && r.min !== null && v < +r.min) bad = 'is below ' + r.min;
        else if (p && +r.perSecond > 0 && (v - p.v) / Math.max(0.05, (now - p.t) / 1000) > +r.perSecond) bad = 'rose faster than ' + r.perSecond + '/s';
        if (bad) { flag('rules', '"' + r.var + '" ' + bad + ' (' + v + ')'); if ((cfg.checks.rules.action || 'revert') === 'revert' && p) { raw[r.var] = p.v; prev[r.var] = { v: p.v, t: now }; continue; } }
        prev[r.var] = { v: raw[r.var], t: now }; } }, 250); }
    /* ---- automated input ---- */
    if (on('input')) { let n = 0, w0 = Date.now(); const h = (e) => { if (e.isTrusted === false) return flag('input', 'script-generated ' + e.type + ' event'); const now = Date.now(); if (now - w0 > 1000) { w0 = now; n = 0; } if (++n > (cfg.maxInputsPerSecond || 30)) flag('input', n + ' inputs in one second'); }; for (const t of ['keydown', 'mousedown', 'pointerdown', 'click', 'touchstart']) window.addEventListener(t, h, true); }
    /* ---- developer tools (a rough guess from the window size) ---- */
    if (on('devtools')) { let n = 0; setInterval(() => { const open = window.outerWidth - window.innerWidth > 200 || window.outerHeight - window.innerHeight > 220; n = open ? n + 1 : 0; if (n === 3) flag('devtools', 'developer tools appear to be open'); }, 1000); }
  };
})();
