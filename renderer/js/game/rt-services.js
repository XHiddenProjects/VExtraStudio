/* Vextra game runtime – GUI overlay, save games, achievements, leaderboards, cloud, ads. */
(function () {
  const VXRT = window.VXRT, U = VXRT.util;
  const el = (tag, css, txt) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (txt !== undefined) e.textContent = txt; return e; };
  const ANCH = { topLeft: [0, 0], top: [50, 0], topRight: [100, 0], left: [0, 50], center: [50, 50], right: [100, 50], bottomLeft: [0, 100], bottom: [50, 100], bottomRight: [100, 100] };
  VXRT.ANCHORS = Object.keys(ANCH); ANCH.bottomCenter = ANCH.bottom; ANCH.topCenter = ANCH.top;

  /* ---------- GUI elements ---------- */
  function place(e, o) {
    const a = ANCH[o.anchor] || ANCH.topLeft; e.style.position = 'absolute'; const ox = U.num(o.x, 0) * (a[0] === 100 ? -1 : 1), oy = U.num(o.y, 0) * (a[1] === 100 ? -1 : 1); e.style.left = `calc(${a[0]}% + ${ox}px)`; e.style.top = `calc(${a[1]}% + ${oy}px)`; e.style.maxWidth = '94%'; e.style.transform = `translate(-${a[0]}%,-${a[1]}%)`;
  }
  const gm = (g) => g.guiMap || (g.guiMap = new Map());
  function register(g, id, node, extra) {
    const m = gm(g); const old = m.get(id); if (old) old.el.remove(); const rec = Object.assign({ el: node, remove() { node.remove(); m.delete(id); g.guiItems.delete(node); } }, extra); m.set(id, rec); g.guiItems.add(node); g.guiEl.append(node); return rec;
  }
  const guiVars = (g) => Object.assign({}, g.vars, g.sceneVars);
  VXRT.gui = {
    label(g, id, o) {
      let rec = gm(g).get(id); if (rec && !rec.el.isConnected) { gm(g).delete(id); rec = null; } if (!rec) { const e = el('div', 'pointer-events:none;white-space:pre-wrap;'); rec = register(g, id, e, {}); }
      rec.o = Object.assign(rec.o || {}, o); const q = rec.o, e = rec.el; e.style.font = `${q.bold ? 700 : 500} ${U.num(q.size, 22)}px system-ui,sans-serif`; e.style.color = q.color || '#fff'; e.style.textShadow = q.shadow === false ? '' : '0 2px 6px rgba(0,0,0,.55)';
      e.style.background = q.bg || 'transparent'; e.style.padding = q.bg ? '6px 12px' : '0'; e.style.borderRadius = '8px'; e.style.display = q.hidden ? 'none' : 'block';
      rec.tpl = q.text; rec.refresh = () => { e.textContent = U.tpl(rec.tpl ?? '', guiVars(g)); if (!q.follow) place(e, q); }; rec.refresh(); return rec;
    },
    bar(g, id, o) {
      let rec = gm(g).get(id); if (!rec) { const e = el('div', 'pointer-events:none;overflow:hidden;'), f = el('div', 'height:100%;width:0;transition:width .12s'); e.append(f); rec = register(g, id, e, { fill: f }); rec.value = 1; }
      rec.o = Object.assign(rec.o || {}, o); const q = rec.o, e = rec.el; Object.assign(e.style, { width: U.num(q.w, 220) + 'px', height: U.num(q.h, 18) + 'px', background: q.bg || 'rgba(0,0,0,.45)', borderRadius: U.num(q.radius, 9) + 'px', border: '1px solid rgba(255,255,255,.25)', display: q.hidden ? 'none' : 'block' });
      rec.fill.style.background = q.color || '#4cc38a'; rec.fill.style.width = U.clamp(rec.value, 0, 1) * 100 + '%'; if (!q.follow) place(e, q); return rec;
    },
    /** Banner ad in the game GUI. o.service: house | image | html | adsense. */
    ad(g, id, o) {
      let rec = gm(g).get(id); if (rec && !rec.el.isConnected) { gm(g).delete(id); rec = null; } if (!rec) rec = register(g, id, el('div', 'pointer-events:auto;overflow:hidden;z-index:40;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.4)'), {});
      rec.o = Object.assign(rec.o || {}, o); const q = rec.o, e = rec.el; e.textContent = ''; Object.assign(e.style, { width: U.num(q.w, 320) + 'px', height: U.num(q.h, 50) + 'px', maxWidth: '100%', display: q.hidden ? 'none' : 'block', background: q.bg || '#2b2f4a', position: 'absolute' });
      e.append(VXRT.adContent(g, q, q.onClick), el('span', 'position:absolute;top:0;right:0;background:rgba(0,0,0,.55);color:#fff;font:700 9px system-ui;padding:1px 5px;border-bottom-left-radius:4px;pointer-events:none', 'Ad')); place(e, q); return rec;
    },
    setBar(g, id, v) { const r = gm(g).get(id); if (r) { r.value = v; r.fill.style.width = U.clamp(v, 0, 1) * 100 + '%'; } },
    show(g, id, on) { const r = gm(g).get(id); if (r) { r.o.hidden = !on; r.el.style.display = on ? 'block' : 'none'; } },
    alert(g, o, done) {
      const kinds = { info: '#6c8cff', success: '#4cc38a', warning: '#f5c451', error: '#ef5b5b' }, c = kinds[o.kind] || kinds.info; const msg = U.tpl(o.message ?? '', guiVars(g)), title = U.tpl(o.title ?? '', guiVars(g));
      if (o.mode === 'modal') {
        const wrap = el('div', 'position:absolute;inset:0;background:rgba(0,0,0,.55);display:grid;place-items:center;pointer-events:auto;z-index:50'); const box = el('div', `background:#1c2030;color:#fff;border:1px solid ${c};border-radius:16px;padding:22px 26px;min-width:260px;max-width:80%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)`);
        if (title) box.append(el('div', 'font:800 20px system-ui;margin-bottom:8px;color:' + c, title)); box.append(el('div', 'font:15px/1.5 system-ui;opacity:.9;white-space:pre-wrap', msg));
        const btn = el('button', `margin-top:16px;background:${c};color:#fff;border:0;border-radius:10px;padding:9px 26px;font:700 15px system-ui;cursor:pointer`, o.button || 'OK'); box.append(btn); wrap.append(box);
        g.guiEl.append(wrap); g.guiItems.add(wrap); if (o.pause) g.pause(true); const close = () => { wrap.remove(); g.guiItems.delete(wrap); if (o.pause) g.pause(false); done && done(); }; btn.onclick = close; return close;
      }
      let host = g.toastHost; if (!host || !host.isConnected) { host = g.toastHost = el('div', 'position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;z-index:60'); g.guiEl.append(host); }
      const t = el('div', `background:#1c2030;color:#fff;border-left:4px solid ${c};border-radius:10px;padding:10px 16px;font:600 14px system-ui;box-shadow:0 8px 30px rgba(0,0,0,.4);opacity:0;transition:opacity .2s`); if (title) t.append(el('div', 'font-weight:800;color:' + c, title)); t.append(el('div', '', msg)); host.append(t); requestAnimationFrame(() => (t.style.opacity = 1));
      setTimeout(() => { t.style.opacity = 0; setTimeout(() => { t.remove(); done && done(); }, 220); }, U.num(o.duration, 2.5) * 1000); return () => t.remove();
    },
    cursor(g, o) {
      let rec = gm(g).get('__cursor'); if (!rec) { const e = el('div', 'pointer-events:none;z-index:70;transform:translate(-50%,-50%);position:absolute'); rec = register(g, '__cursor', e, {}); }
      rec.o = Object.assign(rec.o || {}, o); const q = rec.o, e = rec.el; e.textContent = ''; e.style.display = q.hidden ? 'none' : 'block'; const s = U.num(q.size, 28);
      if (q.shape === 'emoji') { e.textContent = q.emoji || '🎯'; e.style.fontSize = s + 'px'; } else if (q.shape === 'image' && q.sprite) { const sp = g.data.assets?.sprites?.[q.sprite]; if (sp && sp.frames[0]) { const im = new Image(); im.src = sp.frames[0]; im.style.cssText = `width:${s}px;height:${s}px;image-rendering:${g.settings.pixelArt ? 'pixelated' : 'auto'}`; e.append(im); } }
      else if (q.shape === 'cross') { e.style.cssText += `;width:${s}px;height:${s}px;background:linear-gradient(${q.color || '#fff'},${q.color || '#fff'}) center/2px 100% no-repeat,linear-gradient(${q.color || '#fff'},${q.color || '#fff'}) center/100% 2px no-repeat`; }
      else if (q.shape === 'dot') { e.style.cssText += `;width:${s / 2}px;height:${s / 2}px;border-radius:50%;background:${q.color || '#fff'}`; }
      else { e.style.cssText += `;width:${s}px;height:${s}px;border-radius:50%;border:3px solid ${q.color || '#fff'};box-sizing:border-box`; }
      g.container.style.cursor = q.hidden || q.hideSystem === false ? '' : 'none'; return rec;
    },
    clearAll(g) { for (const [, r] of gm(g)) r.el.remove(); gm(g).clear(); },
  };
  VXRT.guiUpdate = function (g) {
    const m = g.guiMap; if (!m) return; const cw = g.container.clientWidth, ch = g.container.clientHeight;
    for (const [id, r] of m) {
      if (id === '__cursor') { const I = g.input; if (I.mouse.cx !== undefined) { r.el.style.left = I.mouse.cx + 'px'; r.el.style.top = I.mouse.cy + 'px'; } continue; }
      const q = r.o; if (!q || !q.follow) continue; const t = g.targets(q.follow, q.owner)[0]; if (!t) { r.el.style.display = 'none'; continue; } r.el.style.display = q.hidden ? 'none' : 'block';
      const s = VXRT.worldToScreen(g, t); let px = s.x, py = s.y; if (g.dim === '2d' && g.canvas2d) { const sc = g.guiScale2d || 1; px = parseFloat(g.canvas2d.style.left) + s.x * sc; py = parseFloat(g.canvas2d.style.top) + s.y * sc; }
      r.el.style.position = 'absolute'; r.el.style.left = px + U.num(q.x, 0) + 'px'; r.el.style.top = py + U.num(q.y, -40) + 'px'; r.el.style.transform = 'translate(-50%,-50%)';
      if (r.refresh) r.refresh();
    }
    for (const [, r] of m) if (r.refresh && !(r.o && r.o.follow) && r.o && r.o.text !== undefined) r.refresh();
  };

  /* ---------- save games ---------- */
  const G = VXRT.Game.prototype;
  G.captureState = function () {
    const objs = {}; for (const o of this.objects) if (!o.isScene) objs[o.id] = { x: o.x, y: o.y, z: o.z, rot: o.rot, ry: o.ry, vars: o.vars, alpha: o.alpha, enabled: o.enabled, vx: o.vx, vy: o.vy, vz: o.vz };
    return { v: 1, time: Date.now(), scene: this.sceneIndex, vars: this.vars, lists: this.lists, objects: objs };
  };
  G.restoreState = function (s) {
    if (!s) return false; this.loadScene(s.scene); this.vars = s.vars || {}; this.lists = s.lists || {};
    this.later(() => { for (const o of this.objects) { const d = s.objects && s.objects[o.id]; if (d) Object.assign(o, d); } }); return true;
  };
  G.saveState = function (slot = 'slot1') { return this.store.set('save:' + slot, this.captureState()); };
  G.loadState = function (slot = 'slot1') { return this.restoreState(this.store.get('save:' + slot)); };
  G.hasSave = function (slot = 'slot1') { return !!this.store.get('save:' + slot); };

  /* ---------- achievements / leaderboard ---------- */
  G.unlockAchievement = function (id, title, desc) {
    const list = this.store.get('ach', {}); if (list[id]) return false; list[id] = { title: title || id, desc: desc || '', at: Date.now() }; this.store.set('ach', list);
    VXRT.gui.alert(this, { mode: 'toast', kind: 'success', title: '🏆 Achievement unlocked', message: (title || id) + (desc ? ' – ' + desc : ''), duration: 3.2 }); this.emit('achievement', id); return true;
  };
  G.cloudBase = function () { const c = window.VX_CLOUD || {}; return (c.url || this.settings.cloudUrl || (/^https?:/.test(location.origin) && location.pathname.startsWith('/p/') ? location.origin : '') || '').replace(/\/$/, ''); };
  G.cloudToken = function () { return this.store.get('cloudToken', null) || (window.VX_CLOUD && window.VX_CLOUD.token) || null; };
  G.cloudFetch = async function (path, opts = {}) {
    const base = this.cloudBase(); if (base === '' && !window.VX_CLOUD) throw new Error('No cloud server configured (set one in Game Settings → Cloud)');
    const tok = this.cloudToken(); const r = await fetch(base + path, { method: opts.method || 'GET', headers: Object.assign({ 'content-type': 'application/json' }, tok ? { authorization: 'Bearer ' + tok } : {}), body: opts.body ? JSON.stringify(opts.body) : undefined });
    const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || 'HTTP ' + r.status); e.status = r.status; throw e; } return j;
  };
  G.cloudLogin = function () {
    return new Promise((resolve, reject) => {
      const wrap = el('div', 'position:absolute;inset:0;background:rgba(0,0,0,.6);display:grid;place-items:center;pointer-events:auto;z-index:90'); const box = el('div', 'background:#1c2030;color:#fff;border-radius:16px;padding:22px;width:300px;display:flex;flex-direction:column;gap:10px;font:14px system-ui');
      const u = el('input', 'padding:9px;border-radius:8px;border:1px solid #3b4254;background:#12151f;color:#fff'), p = el('input', 'padding:9px;border-radius:8px;border:1px solid #3b4254;background:#12151f;color:#fff'); u.placeholder = 'Username'; p.placeholder = 'Password'; p.type = 'password';
      const msg = el('div', 'color:#ef5b5b;font-size:12px;min-height:14px'); const go = el('button', 'padding:10px;border:0;border-radius:10px;background:#6c8cff;color:#fff;font-weight:700;cursor:pointer', 'Sign in'); const reg = el('button', 'padding:8px;border:1px solid #3b4254;border-radius:10px;background:none;color:#fff;cursor:pointer', 'Create account'); const cancel = el('button', 'padding:8px;border:0;background:none;color:#8b93a1;cursor:pointer', 'Cancel');
      box.append(el('div', 'font:800 18px system-ui', 'Sign in to save online'), u, p, msg, go, reg, cancel); wrap.append(box); this.guiEl.append(wrap);
      const done = () => wrap.remove(); cancel.onclick = () => { done(); reject(new Error('cancelled')); };
      const submit = (ep) => async () => { try { const j = await this.cloudFetch(ep, { method: 'POST', body: { username: u.value, password: p.value } }); this.store.set('cloudToken', j.token); this.cloudUser = j.user; done(); resolve(j.user); } catch (e) { msg.textContent = e.message; } };
      go.onclick = submit('/api/login'); reg.onclick = submit('/api/register');
    });
  };
  G.leaderboardSubmit = async function (board, score, name) {
    const list = this.store.get('lb:' + board, []); list.push({ name: name || this.store.get('player', 'Player'), score, at: Date.now() }); list.sort((a, b) => b.score - a.score); this.store.set('lb:' + board, list.slice(0, 100));
    let rank = list.findIndex((x) => x.score === score) + 1; this.emit('leaderboard', { board, score });
    if (this.cloudBase() || window.VX_CLOUD) { try { const j = await this.cloudFetch(`/api/games/${encodeURIComponent(this.settings.id)}/leaderboard/${encodeURIComponent(board)}`, { method: 'POST', body: { score, name } }); rank = j.rank || rank; } catch { /* offline: local only */ } }
    return rank;
  };
  G.leaderboardTop = async function (board, n = 10) {
    if (this.cloudBase() || window.VX_CLOUD) { try { const j = await this.cloudFetch(`/api/games/${encodeURIComponent(this.settings.id)}/leaderboard/${encodeURIComponent(board)}?limit=${n}`); return j.list; } catch { /* fall back */ } }
    return this.store.get('lb:' + board, []).slice(0, n);
  };

  /* ---------- ads: pick a service per Ad block; simulated "house" ads by default; or game.adProvider for your own code ---------- */
  const safeUrl = (u) => (/^(https?:|data:image\/|\.{0,2}\/)/i.test(String(u || '').trim()) ? String(u).trim() : '');
  /** The visual content of one ad, for any service. Fills its container. */
  VXRT.adContent = function (g, q, onClick) {
    const click = () => { const u = safeUrl(q.link); if (onClick) onClick(); if (!u) return; if (typeof g.adClick === 'function') g.adClick(u); else try { window.open(u, '_blank', 'noopener'); } catch { /* ignore */ } };
    const svc = q.service || 'house';
    if (svc === 'image' && safeUrl(q.image)) { const im = document.createElement('img'); im.src = safeUrl(q.image); im.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;cursor:pointer;background:#0b0d16'; im.onclick = click; return im; }
    if (svc === 'html' && q.html) { const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox'); f.srcdoc = '<body style="margin:0">' + String(q.html); f.style.cssText = 'width:100%;height:100%;border:0;display:block;background:transparent'; return f; }
    if (svc === 'adsense' && /^ca-pub-\d+$/.test(String(q.client || '')) && /^\d+$/.test(String(q.slot || ''))) {
      const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'); f.setAttribute('scrolling', 'no');
      f.srcdoc = `<body style="margin:0;background:transparent"><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${q.client}" crossorigin="anonymous"><\/script><ins class="adsbygoogle" style="display:inline-block;width:${U.num(q.w, 320)}px;height:${U.num(q.h, 50)}px" data-ad-client="${q.client}" data-ad-slot="${q.slot}"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});<\/script>`;
      f.style.cssText = 'width:100%;height:100%;border:0;display:block'; return f;
    }
    const t = el('div', 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:4px;color:#cfd4ff;font:600 12px system-ui;letter-spacing:.06em;background:linear-gradient(90deg,#2b2f4a,#3a2f55);cursor:' + (safeUrl(q.link) ? 'pointer' : 'default'), (svc === 'adsense' ? 'AdSense: enter a valid publisher id (ca-pub-…) and slot id' : svc === 'image' ? 'Add an Image URL in the Ad block' : svc === 'html' ? 'Add your ad HTML in the Ad block' : q.text || 'ADVERTISEMENT · your ad here')); t.onclick = click; return t;
  };
  G.showAd = function (kind, cb, o = {}) {
    if (o.service === 'provider' || (typeof this.adProvider === 'function' && !o.service)) {
      if (typeof this.adProvider === 'function') return this.adProvider(kind, cb, o);
      this.log('warn', 'Ad service is "My own code" but game.adProvider is not set – showing the house ad instead.'); o = Object.assign({}, o, { service: 'house' });
    }
    if (kind === 'banner') { VXRT.gui.ad(this, o.id || 'adbanner', Object.assign({ anchor: 'bottom', hidden: false }, o)); cb && cb({ shown: true }); return; }
    const wrap = el('div', 'position:absolute;inset:0;background:#0b0d16;display:grid;place-items:center;pointer-events:auto;z-index:95;color:#fff;font-family:system-ui'); const box = el('div', 'text-align:center;padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;max-width:100%');
    const secs = o.seconds !== undefined ? Math.max(0, U.num(o.seconds)) : kind === 'rewarded' ? 5 : 3;
    const info = el('div', 'font:700 12px system-ui;letter-spacing:.12em;opacity:.6', (kind === 'rewarded' ? 'REWARDED ' : 'INTERSTITIAL ') + 'AD');
    const hero = el('div', `width:min(${Math.max(300, U.num(o.w, 320))}px,92vw);height:${Math.max(250, U.num(o.h, 250))}px;position:relative;overflow:hidden;border-radius:10px;background:#141828`);
    const big = o.service && o.service !== 'house' ? VXRT.adContent(this, o, o.onClick) : el('div', 'height:100%;display:grid;place-items:center;font:800 30px system-ui', 'Your ad here');
    hero.append(big); const sub = el('div', 'opacity:.7;font-size:13px', (o.service || 'house') === 'house' ? 'Simulated ad – choose an ad service in the Ad block' : '');
    const btn = el('button', 'padding:10px 24px;border:0;border-radius:10px;background:#333a55;color:#8b93a1;font:700 14px system-ui', secs > 0 ? 'Wait ' + secs + 's' : kind === 'rewarded' ? 'Claim reward' : 'Close');
    box.append(info, hero, sub, btn); wrap.append(box); this.guiEl.append(wrap); this.guiItems.add(wrap); this.pause(true); let t = secs, iv = 0;
    const enable = () => { btn.textContent = kind === 'rewarded' ? 'Claim reward' : 'Close'; btn.style.cssText += ';background:#6c8cff;color:#fff;cursor:pointer'; btn.onclick = () => { wrap.remove(); this.guiItems.delete(wrap); this.pause(false); cb && cb({ shown: true, rewarded: kind === 'rewarded' }); }; };
    if (secs <= 0) enable(); else iv = setInterval(() => { t--; if (t > 0) btn.textContent = 'Wait ' + t + 's'; else { clearInterval(iv); enable(); } }, 1000);
  };
})();
