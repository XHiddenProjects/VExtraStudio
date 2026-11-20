/* Vextra game runtime – pause menu (Esc), player settings and the FPS counter.
   Game settings that drive it:  fps (0 = automatic), pauseMenu (default on), debug (show the FPS counter).
   The player's own choices (volume, frame rate, FPS counter) are remembered per game in localStorage when it is available. */
(function () {
  const V = window.VXRT = window.VXRT || {};
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
    const root = g.container; const M = g.menu = { open: false, view: 'main' };
    const badge = el('div', 'position:absolute;left:8px;top:8px;z-index:40;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.65);color:#7CFF8B;font:600 12px ui-monospace,Menlo,Consolas,monospace;pointer-events:none;display:none', '');
    root.append(badge); M.badge = badge;
    const layer = el('div', 'position:absolute;inset:0;z-index:50;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.62);backdrop-filter:blur(3px);font-family:system-ui,sans-serif;pointer-events:auto;user-select:none');
    layer.addEventListener('pointerdown', (e) => e.stopPropagation()); layer.addEventListener('mousedown', (e) => e.stopPropagation()); layer.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    const box = el('div', 'width:min(340px,86%);max-height:90%;overflow:auto;padding:22px 22px 14px;border-radius:16px;background:rgba(18,20,28,.96);border:1px solid rgba(255,255,255,.18);color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.6)');
    layer.append(box); root.append(layer); M.layer = layer;
    const save = () => st.set({ fps: g.fpsCap, volume: g.audio.volume, showFps: g.showFps });
    const btn = (label, fn) => { const b = el('button', BTN, label); b.onclick = fn; return b; };
    const row = (label, ctl) => { const r = el('label', 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0;font-size:14px;color:#dfe3ee'); r.append(el('span', '', label), ctl); return r; };

    const draw = () => {
      box.textContent = '';
      if (M.view === 'main') {
        box.append(el('div', 'font:700 22px system-ui,sans-serif;text-align:center;margin-bottom:10px', 'Paused'));
        box.append(btn('▶  Resume', () => M.close()), btn('⚙  Settings', () => { M.view = 'settings'; draw(); }), btn('↻  Restart level', () => { M.close(true); g.restart(); }), btn('⏏  Quit game', () => quit()));
      } else if (M.view === 'settings') {
        box.append(el('div', 'font:700 20px system-ui,sans-serif;text-align:center;margin-bottom:6px', 'Settings'));
        const vol = el('input'); vol.type = 'range'; vol.min = 0; vol.max = 100; vol.value = Math.round((g.audio.volume || 0) * 100); vol.style.cssText = 'width:140px'; vol.oninput = () => { g.audio.muted = false; g.audio.setVolume(vol.value / 100); save(); };
        const fps = el('select', 'padding:6px;border-radius:6px;background:#242836;color:#fff;border:1px solid rgba(255,255,255,.2)'); for (const [v, l] of FPS_LIST) { const o = el('option', '', l); o.value = v; fps.append(o); } fps.value = String(g.fpsCap || 0); fps.onchange = () => { g.fpsCap = parseInt(fps.value, 10) || 0; save(); };
        const sf = el('input'); sf.type = 'checkbox'; sf.checked = !!g.showFps; sf.onchange = () => { g.showFps = sf.checked; save(); };
        box.append(row('Volume', vol), row('Frame rate', fps), row('Show FPS', sf));
        if (document.fullscreenEnabled) box.append(btn(document.fullscreenElement ? 'Leave full screen' : 'Full screen', () => { try { document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen(); } catch { /* not allowed */ } setTimeout(draw, 250); }));
        box.append(btn('← Back', () => { M.view = 'main'; draw(); }));
      } else if (M.view === 'closed') {
        box.append(el('div', 'font:700 20px system-ui,sans-serif;text-align:center;margin-bottom:6px', 'Game closed'), el('div', 'text-align:center;color:#b8bfd0;font-size:14px;margin-bottom:10px', 'You can close this tab now.'), btn('▶  Play again', () => { M.close(true); g.restart(true); }));
      }
    };
    const quit = () => {
      if (g.opts && g.opts.host && g.opts.channel) { try { window.parent.postMessage({ vx: 'exit', token: g.opts.channel.token }, g.opts.channel.origin); } catch { /* ignore */ } return; }
      try { window.close(); } catch { /* ignore */ } M.view = 'closed'; draw();
    };
    M.openMenu = () => {
      if (M.open || g.holding || !g.running) return; M.open = true; M.view = 'main'; M.wasPaused = g.paused; M.wasLocked = !!(g.input && g.input.locked);
      if (M.wasLocked) { g._selfUnlock = true; try { document.exitPointerLock(); } catch { /* ignore */ } setTimeout(() => { g._selfUnlock = false; }, 200); }
      g.pause(true); g.audio.ctx && g.audio.ctx.suspend && g.audio.ctx.suspend().catch(() => {}); draw(); layer.style.display = 'flex';
    };
    M.close = (keepPaused) => {
      if (!M.open) return; M.open = false; layer.style.display = 'none'; g.audio.ctx && g.audio.ctx.resume && g.audio.ctx.resume().catch(() => {});
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
