/* Vextra game runtime – pause menu (Esc), player settings and the FPS counter.
   Game settings that drive it:  fps (0 = automatic), pauseMenu (default on), debug (show the FPS counter).
   The player's own choices (volume, frame rate, FPS counter) are remembered per game in localStorage when it is available. */
(function () {
  const V = window.VXRT = window.VXRT || {};
  /** Developer-defined settings, one per line:   key | Label | slider MIN MAX [STEP] DEFAULT   or   key | Label | toggle on|off   or   key | Label | choice A,B,C [DEFAULT]   (# starts a comment) */
  V.parseCustomSettings = function (text) {
    const out = [];
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.replace(/(^|\s)#.*$/, '').trim(); if (!line) continue; const p = line.split('|').map((x) => x.trim()); if (p.length < 3 || !/^[A-Za-z_][\w]*$/.test(p[0])) continue;
      const w = p[2].split(/\s+/); const kind = (w[0] || '').toLowerCase();
      if (kind === 'slider') { const n = w.slice(1).map(Number); if (n.length < 3 || n.some((x) => !Number.isFinite(x))) continue; const [min, max] = n; const step = n.length >= 4 ? n[2] : (max - min) / 100 || 1; const def = n.length >= 4 ? n[3] : n[2]; out.push({ key: p[0], label: p[1] || p[0], type: 'slider', min, max, step, def: Math.min(max, Math.max(min, def)) }); }
      else if (kind === 'toggle') out.push({ key: p[0], label: p[1] || p[0], type: 'toggle', def: /^(on|true|1|yes)$/i.test(w[1] || '') ? 1 : 0 });
      else if (kind === 'choice') { const opts = (w[1] || '').split(',').map((x) => x.trim()).filter(Boolean); if (!opts.length) continue; out.push({ key: p[0], label: p[1] || p[0], type: 'choice', options: opts, def: opts.includes(w[2]) ? w[2] : opts[0] }); }
    }
    return out;
  };
  const BUILTIN = ['volume', 'sensitivity', 'fps', 'showFps', 'narrate', 'narrateRate'];
  const FPS_LIST = [[0, 'Automatic'], [30, '30 FPS'], [45, '45 FPS'], [60, '60 FPS'], [90, '90 FPS'], [120, '120 FPS'], [144, '144 FPS'], [240, '240 FPS']];
  const store = (id) => ({
    get() { try { return JSON.parse(localStorage.getItem('vx-menu-' + id) || '{}') || {}; } catch { return {}; } },
    set(o) { try { localStorage.setItem('vx-menu-' + id, JSON.stringify(o)); } catch { /* storage unavailable */ } },
  });
  const el = (tag, css, text) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; };
  const BTN = 'display:block;width:100%;margin:8px 0;padding:12px 16px;border:1px solid rgba(255,255,255,.25);border-radius:10px;background:rgba(255,255,255,.08);color:#fff;font:600 16px system-ui,sans-serif;cursor:pointer;text-align:center';

  V.initMenu = function (g) {
    const st = store(g.settings.id || 'game'); const pref = st.get();
    g.fpsCap = pref.fps !== undefined ? pref.fps : (g.settings.fps | 0);
    if (pref.volume !== undefined) g.audio.setVolume(pref.volume);
    g.showFps = pref.showFps !== undefined ? !!pref.showFps : !!g.settings.debug;
    g.prefs = { sens: pref.sens !== undefined ? pref.sens : 1, narrate: pref.narrate !== undefined ? pref.narrate : 1, narrateRate: pref.narrateRate || 1 };
    const ui = Object.assign({ volume: true, sensitivity: true, fps: true, showFps: true, fullscreen: true, narrate: false }, g.settings.playerUI || {});
    const custom = V.parseCustomSettings(g.settings.playerCustom); const cval = Object.assign({}, pref.custom || {});
    const cur = (c) => (cval[c.key] !== undefined ? cval[c.key] : c.def);
    const applyVars = () => { for (const c of custom) g.vars[c.key] = cur(c); };
    applyVars(); const restart0 = g.restart.bind(g); g.restart = (f) => { restart0(f); applyVars(); }; const load0 = g.loadScene.bind(g); g.loadScene = (...a) => { const r = load0(...a); applyVars(); return r; };
    const listeners = { setting: new Set(), close: new Set() }; const fire = (k, v) => { for (const f of [...listeners.setting]) try { f(k, v); } catch { /* a block failed */ } };
    const root = g.container; const M = g.menu = { open: false, view: 'main' };
    const badge = el('div', 'position:absolute;left:8px;top:8px;z-index:40;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.65);color:#7CFF8B;font:600 12px ui-monospace,Menlo,Consolas,monospace;pointer-events:none;display:none', '');
    root.append(badge); M.badge = badge;
    const layer = el('div', 'position:absolute;inset:0;z-index:50;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.62);backdrop-filter:blur(3px);font-family:system-ui,sans-serif;pointer-events:auto;user-select:none');
    layer.addEventListener('pointerdown', (e) => e.stopPropagation()); layer.addEventListener('mousedown', (e) => e.stopPropagation()); layer.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    const box = el('div', 'width:min(340px,86%);max-height:90%;overflow:auto;padding:22px 22px 14px;border-radius:16px;background:rgba(18,20,28,.96);border:1px solid rgba(255,255,255,.18);color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.6)');
    layer.append(box); root.append(layer); M.layer = layer;
    const save = () => st.set({ narrate: g.prefs.narrate, narrateRate: g.prefs.narrateRate, fps: g.fpsCap, volume: g.audio.volume, showFps: g.showFps, sens: g.prefs.sens, custom: cval });
    const btn = (label, fn) => { const b = el('button', BTN, label); b.onclick = fn; return b; };
    const row = (label, ctl) => { const r = el('label', 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0;font-size:14px;color:#dfe3ee'); r.append(el('span', '', label), ctl); return r; };

    const draw = () => {
      box.textContent = '';
      if (M.view === 'main') {
        box.append(el('div', 'font:700 22px system-ui,sans-serif;text-align:center;margin-bottom:10px', 'Paused'));
        box.append(btn('▶  Resume', () => M.close()), btn('⚙  Settings', () => { M.view = 'settings'; draw(); }), btn('↻  Restart level', () => { M.close(true); g.restart(); }), btn('⏏  Quit game', () => quit()));
      } else if (M.view === 'settings') {
        box.append(el('div', 'font:700 20px system-ui,sans-serif;text-align:center;margin-bottom:6px', 'Settings'));
        const slider = (min, max, step, val, on) => { const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = val; i.style.cssText = 'width:140px'; i.oninput = () => on(+i.value); return i; };
        if (ui.volume) box.append(row('Volume', slider(0, 100, 1, Math.round((g.audio.volume || 0) * 100), (v) => M.set('volume', v / 100))));
        if (ui.sensitivity) box.append(row('Mouse sensitivity', slider(0.2, 3, 0.05, g.prefs.sens, (v) => M.set('sensitivity', v))));
        if (ui.fps) { const fps = el('select', 'padding:6px;border-radius:6px;background:#242836;color:#fff;border:1px solid rgba(255,255,255,.2)'); for (const [v, l] of FPS_LIST) { const o = el('option', '', l); o.value = v; fps.append(o); } fps.value = String(g.fpsCap || 0); fps.onchange = () => M.set('fps', parseInt(fps.value, 10) || 0); box.append(row('Frame rate', fps)); }
        if (ui.showFps) { const sf = el('input'); sf.type = 'checkbox'; sf.checked = !!g.showFps; sf.onchange = () => M.set('showFps', sf.checked ? 1 : 0); box.append(row('Show FPS', sf)); }
        if (ui.narrate && window.VXTTS && window.VXTTS.supported()) { const nv = el('input'); nv.type = 'checkbox'; nv.checked = !!g.prefs.narrate; nv.onchange = () => M.set('narrate', nv.checked ? 1 : 0); box.append(row('Read text aloud', nv)); box.append(row('Reading speed', slider(0.5, 2, 0.1, g.prefs.narrateRate, (v) => M.set('narrateRate', v)))); }
        for (const c of custom) {
          let ctl; if (c.type === 'slider') ctl = slider(c.min, c.max, c.step, cur(c), (v) => M.set(c.key, v)); else if (c.type === 'toggle') { ctl = el('input'); ctl.type = 'checkbox'; ctl.checked = !!+cur(c); ctl.onchange = () => M.set(c.key, ctl.checked ? 1 : 0); } else { ctl = el('select', 'padding:6px;border-radius:6px;background:#242836;color:#fff;border:1px solid rgba(255,255,255,.2)'); for (const o of c.options) { const op = el('option', '', o); op.value = o; ctl.append(op); } ctl.value = String(cur(c)); ctl.onchange = () => M.set(c.key, ctl.value); }
          box.append(row(c.label, ctl));
        }
        if (ui.fullscreen && document.fullscreenEnabled) box.append(btn(document.fullscreenElement ? 'Leave full screen' : 'Full screen', () => { try { document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen(); } catch { /* not allowed */ } setTimeout(draw, 250); }));
        box.append(btn('Reset to defaults', () => { M.reset(); draw(); }), btn(M.fromBlock ? '✕  Close' : '← Back', () => { if (M.fromBlock) M.close(); else { M.view = 'main'; draw(); } }));
      } else if (M.view === 'closed') {
        box.append(el('div', 'font:700 20px system-ui,sans-serif;text-align:center;margin-bottom:6px', 'Game closed'), el('div', 'text-align:center;color:#b8bfd0;font-size:14px;margin-bottom:10px', 'You can close this tab now.'), btn('▶  Play again', () => { M.close(true); g.restart(true); }));
      }
    };
    const quit = () => {
      if (g.opts && g.opts.host && g.opts.channel) { try { window.parent.postMessage({ vx: 'exit', token: g.opts.channel.token }, g.opts.channel.origin); } catch { /* ignore */ } return; }
      try { window.close(); } catch { /* ignore */ } M.view = 'closed'; draw();
    };
    /* ---- the settings API (used by the settings panel and by the Game Settings block) */
    const known = (k) => BUILTIN.includes(k) || custom.some((c) => c.key === k);
    M.get = (k) => (k === 'volume' ? g.audio.volume : k === 'sensitivity' ? g.prefs.sens : k === 'fps' ? g.fpsCap || 0 : k === 'showFps' ? (g.showFps ? 1 : 0) : k === 'narrate' ? g.prefs.narrate : k === 'narrateRate' ? g.prefs.narrateRate : (() => { const c = custom.find((x) => x.key === k); return c ? cur(c) : undefined; })());
    M.set = (k, v) => {
      if (!known(k)) return false; const n = +v;
      if (k === 'volume') { const x = Math.min(1, Math.max(0, n > 1 ? n / 100 : n)); g.audio.muted = false; g.audio.setVolume(x); v = x; }
      else if (k === 'sensitivity') { g.prefs.sens = Math.min(5, Math.max(0.05, n || 1)); v = g.prefs.sens; }
      else if (k === 'fps') { g.fpsCap = Math.max(0, Math.min(1000, Math.round(n) || 0)); v = g.fpsCap; }
      else if (k === 'showFps') { g.showFps = !!n && v !== 'false'; v = g.showFps ? 1 : 0; }
      else if (k === 'narrate') { g.prefs.narrate = (!!n && v !== 'false') ? 1 : 0; v = g.prefs.narrate; if (!v && window.VXTTS) window.VXTTS.stop(); }
      else if (k === 'narrateRate') { g.prefs.narrateRate = Math.min(2, Math.max(0.5, n || 1)); v = g.prefs.narrateRate; }
      else { const c = custom.find((x) => x.key === k); if (c.type === 'slider') v = Math.min(c.max, Math.max(c.min, Number.isFinite(n) ? n : c.def)); else if (c.type === 'toggle') v = (/^(true|on|yes)$/i.test(String(v)) || n) ? 1 : 0; else v = c.options.includes(String(v)) ? String(v) : c.def; cval[k] = v; g.vars[k] = v; }
      save(); fire(k, v); return true;
    };
    M.reset = () => { g.audio.setVolume(1); g.prefs.sens = 1; g.prefs.narrate = 1; g.prefs.narrateRate = 1; g.fpsCap = g.settings.fps | 0; g.showFps = !!g.settings.debug; for (const c of custom) { cval[c.key] = c.def; g.vars[c.key] = c.def; } save(); for (const k of BUILTIN) fire(k, M.get(k)); for (const c of custom) fire(c.key, c.def); };
    M.onSetting = (fn) => { listeners.setting.add(fn); return () => listeners.setting.delete(fn); };
    M.onClose = (fn) => { listeners.close.add(fn); return () => listeners.close.delete(fn); };
    M.openSettings = () => { if (M.open) { M.view = 'settings'; M.fromBlock = true; draw(); return; } M.openMenu(); M.view = 'settings'; M.fromBlock = true; draw(); };
    M.openMenu = () => {
      if (M.open || g.holding || !g.running) return; M.open = true; M.view = 'main'; M.fromBlock = false; M.wasPaused = g.paused; M.wasLocked = !!(g.input && g.input.locked);
      if (M.wasLocked) { g._selfUnlock = true; try { document.exitPointerLock(); } catch { /* ignore */ } setTimeout(() => { g._selfUnlock = false; }, 200); }
      g.pause(true); g.audio.ctx && g.audio.ctx.suspend && g.audio.ctx.suspend().catch(() => {}); draw(); layer.style.display = 'flex';
    };
    M.close = (keepPaused) => {
      if (!M.open) return; M.open = false; M.fromBlock = false; layer.style.display = 'none'; for (const f of [...listeners.close]) try { f(); } catch { /* ignore */ } g.audio.ctx && g.audio.ctx.resume && g.audio.ctx.resume().catch(() => {});
      if (!keepPaused && !M.wasPaused) g.pause(false); else if (keepPaused) g.pause(false);
      if (M.wasLocked && g.input && g.input.lock) g.input.lock(true);
      try { root.focus && root.focus({ preventScroll: true }); } catch { /* ignore */ }
    };
    const enabled = () => g.settings.pauseMenu !== false;
    M.onKey = (e) => {
      if (e.key !== 'Escape' || e.repeat || !enabled()) return;
      if (M.open) { if (M.view !== 'main') { M.view = 'main'; draw(); } else M.close(); e.preventDefault(); return; }
      M.openMenu(); e.preventDefault();
    };
    window.addEventListener('keydown', M.onKey, true);
    /* in a locked-mouse 3D game the browser swallows Esc: opening the menu when the lock is lost covers that */
    M.onLock = () => { const now = !!document.pointerLockElement; if (M.hadLock && !now && !g._selfUnlock && !M.open && enabled()) M.openMenu(); M.hadLock = now; };
    document.addEventListener('pointerlockchange', M.onLock);
    /* the on-screen ☰ button for touch screens */
    const touch = el('button', 'position:absolute;right:8px;top:8px;z-index:40;width:36px;height:36px;border-radius:8px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.45);color:#fff;font:700 18px system-ui;cursor:pointer;display:none', '☰');
    touch.title = 'Menu'; touch.onclick = () => M.openMenu(); touch.addEventListener('pointerdown', (e) => e.stopPropagation()); root.append(touch); M.touchBtn = touch;
    M.update = () => { touch.style.display = enabled() && (matchMedia('(pointer:coarse)').matches) ? 'block' : 'none'; };
    M.update();
    /* FPS counter: shown with debug mode (game settings, the Play bar's debug button) or the player's own switch */
    M.timer = setInterval(() => { const on = !!(g.showFps || g.debug); badge.style.display = on ? 'block' : 'none'; if (on) badge.textContent = Math.round(g.fps || 0) + ' FPS' + (g.fpsCap ? ' (cap ' + g.fpsCap + ')' : '') + (g.paused ? ' · paused' : ''); }, 250);
  };
  V.destroyMenu = function (g) {
    const M = g.menu; if (!M) return; clearInterval(M.timer); window.removeEventListener('keydown', M.onKey, true); document.removeEventListener('pointerlockchange', M.onLock); g.menu = null;
  };
})();
