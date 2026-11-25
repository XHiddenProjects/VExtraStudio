/* Vextra game runtime – input: keyboard, mouse, touch + gestures, gamepad, pointer lock, device motion. */
(function () {
  const VXRT = window.VXRT, U = VXRT.util;
  const keyName = (e) => { const k = e.key === ' ' ? 'space' : String(e.key).toLowerCase(); return k; };

  class Input {
    constructor(g) {
      this.g = g; this.keys = new Set(); this.pressed = new Set(); this.released = new Set(); this.l = new Map();
      this.mouse = { sx: 0, sy: 0, x: 0, y: 0, down: false, buttons: new Set(), inside: false }; this.wheel = 0;
      this.touches = new Map(); this.pad = { buttons: [], axes: [], connected: false }; this.lastPad = { buttons: [] };
      this.motion = { x: 0, y: 0, z: 0, ax: 0, ay: 0, az: 0, shake: 0 }; this.locked = false; this.gesture = null; this._clean = [];
    }
    on(ev, fn) { let s = this.l.get(ev); if (!s) this.l.set(ev, (s = new Set())); s.add(fn); return () => s.delete(fn); }
    emit(ev, p) { const s = this.l.get(ev); if (s) for (const f of [...s]) { try { f(p); } catch (e) { this.g.log('error', e.message); } } }
    isDown(k) { return this.keys.has(String(k).toLowerCase()); }
    listen(t, ev, fn, opt) { t.addEventListener(ev, fn, opt); this._clean.push(() => t.removeEventListener(ev, fn, opt)); }
    updatePointer(clientX, clientY) {
      const g = this.g, r = g.container.getBoundingClientRect();
      const c = g.activeCanvas || g.container, cr = c.getBoundingClientRect();
      const scale = g.dim === '2d' && g.canvas2d ? cr.width / g.canvas2d.width : 1;
      this.mouse.sx = (clientX - cr.left) / (scale || 1); this.mouse.sy = (clientY - cr.top) / (scale || 1);
      this.mouse.cx = clientX - r.left; this.mouse.cy = clientY - r.top;
      if (g.dim === '2d') { const w = VXRT.screenToWorld(g, this.mouse.sx, this.mouse.sy); this.mouse.x = w.x; this.mouse.y = w.y; } else { this.mouse.x = this.mouse.sx; this.mouse.y = this.mouse.sy; }
    }
  }

  VXRT.initInput = function (g) {
    const I = (g.input = new Input(g)), c = g.container;
    I.listen(window, 'keydown', (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = keyName(e); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space', 'f3'].includes(k)) e.preventDefault();
      const code = String(e.code || '').toLowerCase(); if (!I.keys.has(k)) { I.pressed.add(k); if (code) I.pressed.add(code); I.emit('keydown', { key: k, code, repeat: false }); } else I.emit('keydown', { key: k, code, repeat: true });
      I.keys.add(k); if (code) I.keys.add(code);
    });
    I.listen(window, 'keyup', (e) => { const k = keyName(e), code = String(e.code || '').toLowerCase(); I.keys.delete(k); I.keys.delete(code); I.released.add(k); I.released.add(code); I.emit('keyup', { key: k, code }); });
    I.listen(window, 'blur', () => { I.keys.clear(); });
    I.listen(c, 'mousemove', (e) => {
      if (I.locked) { const sk = (g.prefs && g.prefs.sens) || 1; I.emit('lockedmove', { dx: e.movementX * sk, dy: e.movementY * sk }); }
      I.updatePointer(e.clientX, e.clientY); I.mouse.inside = true; I.emit('mousemove', { x: I.mouse.x, y: I.mouse.y, sx: I.mouse.sx, sy: I.mouse.sy });
    });
    I.listen(c, 'mouseleave', () => { I.mouse.inside = false; });
    I.listen(c, 'mousedown', (e) => { I.updatePointer(e.clientX, e.clientY); I.mouse.down = true; I.mouse.buttons.add(e.button); I.audioUnlock(); I.emit('mousedown', { x: I.mouse.x, y: I.mouse.y, sx: I.mouse.sx, sy: I.mouse.sy, button: e.button }); });
    I.listen(window, 'mouseup', (e) => { I.mouse.down = false; I.mouse.buttons.delete(e.button); I.emit('mouseup', { x: I.mouse.x, y: I.mouse.y, sx: I.mouse.sx, sy: I.mouse.sy, button: e.button }); if (c.contains(e.target)) I.emit('click', { x: I.mouse.x, y: I.mouse.y, sx: I.mouse.sx, sy: I.mouse.sy, button: e.button }); });
    I.listen(c, 'contextmenu', (e) => e.preventDefault());
    I.listen(c, 'wheel', (e) => { e.preventDefault(); I.wheel += e.deltaY; I.emit('wheel', { delta: e.deltaY }); }, { passive: false });
    I.audioUnlock = () => g.audio.ensure();

    /* touch -> mouse + gestures */
    let t0 = null, lastTap = 0, pinch0 = 0;
    I.listen(c, 'touchstart', (e) => {
      e.preventDefault(); I.audioUnlock();
      for (const t of e.changedTouches) I.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      const t = e.touches[0]; I.updatePointer(t.clientX, t.clientY); I.mouse.down = true; I.mouse.buttons.add(0);
      I.emit('mousedown', { x: I.mouse.x, y: I.mouse.y, sx: I.mouse.sx, sy: I.mouse.sy, button: 0, touch: true });
      t0 = { x: t.clientX, y: t.clientY, t: performance.now() }; if (e.touches.length === 2) pinch0 = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }, { passive: false });
    I.listen(c, 'touchmove', (e) => {
      e.preventDefault(); for (const t of e.changedTouches) I.touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      const t = e.touches[0]; I.updatePointer(t.clientX, t.clientY); I.emit('mousemove', { x: I.mouse.x, y: I.mouse.y, sx: I.mouse.sx, sy: I.mouse.sy, touch: true });
      if (e.touches.length === 2 && pinch0) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); I.emit('gesture', { type: 'pinch', scale: d / pinch0, value: d / pinch0 }); }
    }, { passive: false });
    const tend = (e) => {
      for (const t of e.changedTouches) I.touches.delete(t.identifier);
      if (e.touches.length === 0) {
        I.mouse.down = false; I.mouse.buttons.delete(0); I.emit('mouseup', { x: I.mouse.x, y: I.mouse.y, sx: I.mouse.sx, sy: I.mouse.sy, button: 0, touch: true }); I.emit('click', { x: I.mouse.x, y: I.mouse.y, sx: I.mouse.sx, sy: I.mouse.sy, button: 0, touch: true });
        const ct = e.changedTouches[0]; if (t0 && ct) {
          const dx = ct.clientX - t0.x, dy = ct.clientY - t0.y, dt = performance.now() - t0.t;
          if (Math.hypot(dx, dy) > 40 && dt < 700) I.emit('gesture', { type: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'swipeRight' : 'swipeLeft') : (dy > 0 ? 'swipeDown' : 'swipeUp'), dx, dy });
          else if (Math.hypot(dx, dy) < 12 && dt < 300) { const now = performance.now(); if (now - lastTap < 320) { I.emit('gesture', { type: 'doubleTap' }); lastTap = 0; } else { I.emit('gesture', { type: 'tap' }); lastTap = now; } }
        } t0 = null; pinch0 = 0;
      }
    };
    I.listen(c, 'touchend', tend); I.listen(c, 'touchcancel', tend);

    /* pointer lock */
    I.listen(document, 'pointerlockchange', () => { I.locked = document.pointerLockElement === c; });
    I.lock = (on) => { try { if (on) c.requestPointerLock(); else { g._selfUnlock = true; setTimeout(() => { g._selfUnlock = false; }, 200); document.exitPointerLock(); } } catch { /* not allowed */ } };

    /* device motion / orientation (also driven by the editor's device simulator via postMessage) */
    I.listen(window, 'devicemotion', (e) => {
      const a = e.accelerationIncludingGravity || {}; const x = a.x || 0, y = a.y || 0, z = a.z || 0; const mag = Math.hypot(x, y, z);
      I.motion.x = x; I.motion.y = y; I.motion.z = z; if (Math.abs(mag - 9.8) > 12) { I.emit('shake', { force: mag }); }
    });
    I.listen(window, 'deviceorientation', (e) => { I.motion.ax = e.beta || 0; I.motion.ay = e.gamma || 0; I.motion.az = e.alpha || 0; });
    I.listen(window, 'message', (e) => {
      const d = e.data; const ch = g.opts && g.opts.channel; if (!d || d.vx !== 'sim' || e.source !== window.parent || window.parent === window || !ch || d.token !== ch.token) return; // only the editor that started this game may drive it
      if (d.type === 'shake') { const f = (d.value && +d.value.force) || 20; I.motion.shake = f; I.emit('shake', { force: f }); setTimeout(() => { I.motion.shake = 0; }, 400); }
      if (d.type === 'tilt') { Object.assign(I.motion, d.value || {}); }
      if (d.type === 'key') { const k = d.key; if (d.down) { if (!I.keys.has(k)) I.pressed.add(k); I.keys.add(k); I.emit('keydown', { key: k, code: k }); } else { I.keys.delete(k); I.released.add(k); I.emit('keyup', { key: k, code: k }); } }
      if (d.type === 'pause') g.pause(d.value); if (d.type === 'restart') g.restart(); if (d.type === 'live') { g.liveOn = !!d.value; clearInterval(g._liveT); if (g.liveOn) g._liveT = setInterval(() => VXRT.liveFlush(g), 140); } if (d.type === 'debug') g.debug = !!d.value; if (d.type === 'mute') { g.audio.muted = !!d.value; g.audio.ensure(); }
    });
    try { VXRT.initTouchControls(g); } catch (e) { g.log && g.log('warn', 'Touch controls: ' + e.message); }
  };

  /* ---------- on-screen touch controls (phones / tablets) ----------
     Shown on touch screens only (settings.touch.mode: 'auto' | 'on' | 'off'). They press the same keys a keyboard would, so every game works unchanged:
     the left stick presses W A S D / the arrow keys the game listens to, the round buttons press the other keys the game uses (space, shift, M …),
     and dragging anywhere else looks around in first-person games (Locked Mouse block). Games that only use the mouse / touch get no overlay. */
  const KEY_LABEL = { space: 'Jump', shift: 'Sneak', enter: 'OK', escape: 'Menu', control: 'Ctrl', tab: 'Tab', ' ': 'Jump' };
  const MOVE = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
  const VALID_KEY = /^(?:[a-z0-9]|space|shift|enter|escape|tab|control|alt|arrow(?:up|down|left|right)|f\d{1,2})$/;
  /** press / release a key as if it came from a keyboard (touch stick, touch buttons) */
  VXRT.vkey = (g, k, down) => { const I = g.input; if (!I) return; k = VXRT.keyAlias(k); if (down) { if (!I.keys.has(k)) { I.pressed.add(k); I.emit('keydown', { key: k, code: k, repeat: false }); } I.keys.add(k); } else if (I.keys.has(k)) { I.keys.delete(k); I.released.add(k); I.emit('keyup', { key: k, code: k }); } };
  const TOUCH_BLOCKS = new Set(['joystick', 'touchButton', 'touchLook']);
  function scanKeys(g) {
    const keys = new Set(); let look = false, blocks = false;
    for (const b of Object.values((g.data && g.data.behaviors) || {})) for (const n of ((b.graph && b.graph.nodes) || [])) {
      if (n.type === 'lockedMouse') look = true; if (TOUCH_BLOCKS.has(n.type)) blocks = true;
      for (const [k, v] of Object.entries(n.params || {})) if (/^(key|testKey|quietKey|keys?\d*)$/i.test(k) && typeof v === 'string') { const a = VXRT.keyAlias(v); if (VALID_KEY.test(a)) keys.add(a); }
    }
    return { keys, look, blocks };
  }
  VXRT.initTouchControls = function (g) {
    const I = g.input, cfg = Object.assign({ mode: 'auto' }, (g.settings && g.settings.touch) || {});
    const coarse = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
    if (cfg.mode === 'off' || (cfg.mode !== 'on' && !coarse)) return;
    const sc = scanKeys(g); if (sc.blocks) return; /* the game has its own Joystick / Touch Button / Touch Look blocks (UI layer) */
    const moveKeys = [...sc.keys].filter((k) => MOVE.has(k)), wasd = moveKeys.some((k) => k.length === 1), arrows = moveKeys.some((k) => k.startsWith('arrow'));
    const others = [...sc.keys].filter((k) => !MOVE.has(k) && k !== 'any');
    const buttons = Array.isArray(cfg.buttons) && cfg.buttons.length ? cfg.buttons.map((b) => ({ label: b.label || String(b.key).toUpperCase(), key: VXRT.keyAlias(b.key) })) : others.slice(0, 6).map((k) => ({ label: KEY_LABEL[k] || String(k).toUpperCase().slice(0, 5), key: k }));
    const stick = moveKeys.length > 0 || cfg.stick === true, look = g.dim === '3d' && sc.look && cfg.look !== false;
    if (!stick && !buttons.length && !look) return; // mouse / touch only game: nothing to add
    const vkey = (k, down) => VXRT.vkey(g, k, down);
    const mk = (css, attrs) => { const e = document.createElement('div'); e.style.cssText = css; if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
    const root = mk('position:absolute;inset:0;pointer-events:none;z-index:40;-webkit-tap-highlight-color:transparent;touch-action:none', { 'data-vx-touch': 'root' });
    const safe = 'max(18px,env(safe-area-inset-bottom))', safeL = 'max(18px,env(safe-area-inset-left))', safeR = 'max(18px,env(safe-area-inset-right))';
    const down = new Set(), cleanup = [];
    if (stick) {
      const R = 66, base = mk('position:absolute;left:' + safeL + ';bottom:' + safe + ';width:' + R * 2 + 'px;height:' + R * 2 + 'px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.35);pointer-events:auto;touch-action:none', { 'data-vx-touch': 'stick', role: 'group', 'aria-label': 'Move' });
      const knob = mk('position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.55);box-shadow:0 2px 8px rgba(0,0,0,.35);pointer-events:none'); base.append(knob);
      let pid = null; const names = { up: [wasd ? 'w' : null, arrows ? 'arrowup' : null], down: [wasd ? 's' : null, arrows ? 'arrowdown' : null], left: [wasd ? 'a' : null, arrows ? 'arrowleft' : null], right: [wasd ? 'd' : null, arrows ? 'arrowright' : null] };
      if (!wasd && !arrows) { names.up = ['w']; names.down = ['s']; names.left = ['a']; names.right = ['d']; }
      const set = (dir, on) => { for (const k of names[dir]) if (k) vkey(k, on); };
      const apply = (dx, dy) => { const m = Math.hypot(dx, dy), t = 0.32; set('left', dx < -t * R); set('right', dx > t * R); set('up', dy < -t * R); set('down', dy > t * R); const c = m > R ? R / m : 1; knob.style.transform = 'translate(' + dx * c + 'px,' + dy * c + 'px)'; };
      const reset = () => { pid = null; for (const d of ['up', 'down', 'left', 'right']) set(d, false); knob.style.transform = ''; };
      const pos = (e) => { const r = base.getBoundingClientRect(); apply(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); };
      base.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); pid = e.pointerId; try { base.setPointerCapture(pid); } catch { /* ok */ } pos(e); });
      base.addEventListener('pointermove', (e) => { if (e.pointerId === pid) { e.preventDefault(); pos(e); } });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) base.addEventListener(ev, (e) => { if (e.pointerId === pid || ev === 'lostpointercapture') reset(); });
      cleanup.push(reset); root.append(base);
    }
    if (buttons.length) {
      const grid = mk('position:absolute;right:' + safeR + ';bottom:' + safe + ';display:grid;grid-template-columns:repeat(' + Math.min(2, buttons.length) + ',72px);gap:12px;direction:ltr', { role: 'group', 'aria-label': 'Buttons' });
      for (const b of buttons) {
        const el = mk('width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.4);color:#fff;font:600 13px system-ui,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none', { 'data-vx-touch': 'btn', role: 'button', 'aria-label': b.label }); el.textContent = b.label;
        const on = (e) => { e.preventDefault(); e.stopPropagation(); try { el.setPointerCapture(e.pointerId); } catch { /* ok */ } el.style.background = 'rgba(255,255,255,.4)'; down.add(b.key); vkey(b.key, true); };
        const off = () => { el.style.background = 'rgba(255,255,255,.14)'; down.delete(b.key); vkey(b.key, false); };
        el.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, off); grid.append(el);
      }
      root.append(grid);
    }
    if (look) { /* drag anywhere else to look around */
      const last = new Map(), k = 1.1, c = g.container; const skip = (t) => t && t.closest && t.closest('[data-vx-touch]');
      const ts = (e) => { for (const t of e.changedTouches) if (!skip(t.target)) last.set(t.identifier, { x: t.clientX, y: t.clientY }); };
      const tm = (e) => { for (const t of e.changedTouches) { const l = last.get(t.identifier); if (!l) continue; I.emit('lockedmove', { dx: (t.clientX - l.x) * k, dy: (t.clientY - l.y) * k }); l.x = t.clientX; l.y = t.clientY; } };
      const te = (e) => { for (const t of e.changedTouches) last.delete(t.identifier); };
      I.listen(c, 'touchstart', ts, { passive: true }); I.listen(c, 'touchmove', tm, { passive: true }); I.listen(c, 'touchend', te); I.listen(c, 'touchcancel', te);
    }
    g.container.append(root); I.touchRoot = root; I._clean.push(() => { for (const f of cleanup) f(); for (const k of [...down]) vkey(k, false); root.remove(); });
  };
  VXRT.destroyInput = function (g) { const I = g.input; if (I) { I._clean.forEach((f) => f()); try { document.exitPointerLock(); } catch { /* ignore */ } } };
  VXRT.input_beginFrame = function (g) {
    const I = g.input; const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (gp) { I.lastPad.buttons = I.pad.buttons.slice(); I.pad.connected = true; I.pad.buttons = gp.buttons.map((b) => b.value); I.pad.axes = [...gp.axes]; gp.buttons.forEach((b, i) => { if (b.pressed && !(I.lastPad.buttons[i] > 0.5)) I.emit('padbutton', { button: i, down: true }); if (!b.pressed && I.lastPad.buttons[i] > 0.5) I.emit('padbutton', { button: i, down: false }); }); }
  };
  VXRT.input_endFrame = function (g) { const I = g.input; I.pressed.clear(); I.released.clear(); I.wheel = 0; };
})();
