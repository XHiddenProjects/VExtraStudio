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
      const k = keyName(e); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'space'].includes(k)) e.preventDefault();
      const code = String(e.code || '').toLowerCase(); if (!I.keys.has(k)) { I.pressed.add(k); if (code) I.pressed.add(code); I.emit('keydown', { key: k, code, repeat: false }); } else I.emit('keydown', { key: k, code, repeat: true });
      I.keys.add(k); if (code) I.keys.add(code);
    });
    I.listen(window, 'keyup', (e) => { const k = keyName(e), code = String(e.code || '').toLowerCase(); I.keys.delete(k); I.keys.delete(code); I.released.add(k); I.released.add(code); I.emit('keyup', { key: k, code }); });
    I.listen(window, 'blur', () => { I.keys.clear(); });
    I.listen(c, 'mousemove', (e) => {
      if (I.locked) { I.emit('lockedmove', { dx: e.movementX, dy: e.movementY }); }
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
    I.lock = (on) => { try { if (on) c.requestPointerLock(); else document.exitPointerLock(); } catch { /* not allowed */ } };

    /* device motion / orientation (also driven by the editor's device simulator via postMessage) */
    I.listen(window, 'devicemotion', (e) => {
      const a = e.accelerationIncludingGravity || {}; const x = a.x || 0, y = a.y || 0, z = a.z || 0; const mag = Math.hypot(x, y, z);
      I.motion.x = x; I.motion.y = y; I.motion.z = z; if (Math.abs(mag - 9.8) > 12) { I.emit('shake', { force: mag }); }
    });
    I.listen(window, 'deviceorientation', (e) => { I.motion.ax = e.beta || 0; I.motion.ay = e.gamma || 0; I.motion.az = e.alpha || 0; });
    I.listen(window, 'message', (e) => {
      const d = e.data; const ch = g.opts && g.opts.channel; if (!d || d.vx !== 'sim' || e.source !== window.parent || window.parent === window || !ch || d.token !== ch.token) return; // only the editor that started this game may drive it
      if (d.type === 'shake') I.emit('shake', { force: 20 });
      if (d.type === 'tilt') { Object.assign(I.motion, d.value || {}); }
      if (d.type === 'key') { const k = d.key; if (d.down) { if (!I.keys.has(k)) I.pressed.add(k); I.keys.add(k); I.emit('keydown', { key: k, code: k }); } else { I.keys.delete(k); I.released.add(k); I.emit('keyup', { key: k, code: k }); } }
      if (d.type === 'pause') g.pause(d.value); if (d.type === 'restart') g.restart(); if (d.type === 'debug') g.debug = !!d.value; if (d.type === 'mute') { g.audio.muted = !!d.value; g.audio.ensure(); }
    });
  };
  VXRT.destroyInput = function (g) { const I = g.input; if (I) { I._clean.forEach((f) => f()); try { document.exitPointerLock(); } catch { /* ignore */ } } };
  VXRT.input_beginFrame = function (g) {
    const I = g.input; const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (gp) { I.lastPad.buttons = I.pad.buttons.slice(); I.pad.connected = true; I.pad.buttons = gp.buttons.map((b) => b.value); I.pad.axes = [...gp.axes]; gp.buttons.forEach((b, i) => { if (b.pressed && !(I.lastPad.buttons[i] > 0.5)) I.emit('padbutton', { button: i, down: true }); if (!b.pressed && I.lastPad.buttons[i] > 0.5) I.emit('padbutton', { button: i, down: false }); }); }
  };
  VXRT.input_endFrame = function (g) { const I = g.input; I.pressed.clear(); I.released.clear(); I.wheel = 0; };
})();
