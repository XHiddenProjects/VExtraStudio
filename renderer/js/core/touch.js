/* Touch support for the editors that were written for a mouse (node graph, 2D scene view, layers).
   A finger on an element marked data-touch="bridge" is turned into the mouse events that element already understands:
     one finger  → mousedown / mousemove / mouseup (and click, double-tap = dblclick)
                   on the empty background of the node graph it pans instead, so the canvas can be moved without a middle mouse button
     two fingers → pan (a middle-button drag) and pinch zoom (wheel events)
   Everything else (buttons, lists, scrolling panels) keeps the normal browser behaviour. Mouse and pen users are not affected. */
(function () {
  const coarse = () => { try { return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0; } catch { return false; } };
  document.documentElement.classList.toggle('touch', coarse());
  const ev = (type, t, x, y, o = {}) => new MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: type === 'mouseup' || type === 'click' || type === 'dblclick' || type === 'mousemove' && !o.drag ? 0 : 1, detail: 1 }, o));
  const mid = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }), dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  let S = null, lastTap = { t: 0, x: 0, y: 0 };

  function begin(e) {
    const host = e.target.closest && e.target.closest('[data-touch="bridge"]'); if (!host) return;
    if (e.touches.length === 1) {
      const t = e.touches[0]; if (S) end(null); e.preventDefault();
      const bg = host.classList.contains('ge-canvas') && (e.target === host || e.target.classList.contains('ge-world') || e.target.closest('svg.ge-wires') && !e.target.closest('path.ge-hit'));
      S = { host, target: e.target, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, moved: false, button: bg ? 1 : 0, two: false, t0: Date.now() };
      S.target.dispatchEvent(ev('mousedown', S.target, t.clientX, t.clientY, { button: S.button, buttons: S.button ? 4 : 1 }));
      const me = S; me.lp = setTimeout(() => { if (S !== me || me.moved || me.two || !me.target.isConnected) return; /* long press = right click (context menu) */ me.ctx = true; me.target.dispatchEvent(ev('mouseup', me.target, me.x, me.y, { button: me.button })); document.dispatchEvent(ev('mouseup', me.target, me.x, me.y, { button: me.button })); me.target.dispatchEvent(ev('contextmenu', me.target, me.x, me.y, { button: 2, buttons: 2 })); if (navigator.vibrate) { try { navigator.vibrate(12); } catch { /* no haptics */ } } }, 520);
    } else if (e.touches.length === 2) {
      e.preventDefault(); const [a, b] = e.touches, hostEl = S ? S.host : host; if (S) end({ cancelTap: true }, true);
      const m = mid(a, b); S = { host: hostEl, target: hostEl, two: true, d: dist(a, b), x: m.x, y: m.y, acc: 0, button: 1 };
      S.target.dispatchEvent(ev('mousedown', S.target, m.x, m.y, { button: 1, buttons: 4 }));
    }
  }
  function move(e) {
    if (!S) return; e.preventDefault();
    if (S.two && e.touches.length >= 2) {
      const [a, b] = e.touches, m = mid(a, b), d = dist(a, b); S.acc += d - S.d; S.d = d;
      document.dispatchEvent(ev('mousemove', S.target, m.x, m.y, { buttons: 4, drag: 1 })); window.dispatchEvent(ev('mousemove', S.target, m.x, m.y, { buttons: 4, drag: 1 }));
      while (Math.abs(S.acc) > 14) { const up = S.acc > 0; S.acc += up ? -14 : 14; S.target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: m.x, clientY: m.y, deltaY: up ? -100 : 100, ctrlKey: true })); }
      S.x = m.x; S.y = m.y; return;
    }
    const t = e.touches[0]; if (!t || S.two) return; if (S.ctx) return; if (Math.hypot(t.clientX - S.x0, t.clientY - S.y0) > 8) { S.moved = true; clearTimeout(S.lp); } S.x = t.clientX; S.y = t.clientY;
    const o = { buttons: S.button ? 4 : 1, drag: 1 }; S.target.dispatchEvent(ev('mousemove', S.target, S.x, S.y, o)); if (!S.target.isConnected) return; document.dispatchEvent(ev('mousemove', S.target, S.x, S.y, o));
  }
  function end(e, silent) {
    if (!S) return; if (e && e.touches && e.touches.length && !silent && !S.two) return; const s = S; S = null; clearTimeout(s.lp); if (s.ctx) return;
    const tgt = s.target.isConnected ? s.target : s.host; tgt.dispatchEvent(ev('mouseup', tgt, s.x, s.y, { button: s.button })); document.dispatchEvent(ev('mouseup', tgt, s.x, s.y, { button: s.button })); window.dispatchEvent(ev('mouseup', tgt, s.x, s.y, { button: s.button }));
    if (silent || s.two || s.moved || (e && e.cancelTap)) return;
    tgt.dispatchEvent(ev('click', tgt, s.x, s.y)); const now = Date.now();
    if (now - lastTap.t < 350 && Math.hypot(s.x - lastTap.x, s.y - lastTap.y) < 24) { tgt.dispatchEvent(ev('dblclick', tgt, s.x, s.y, { detail: 2 })); lastTap.t = 0; } else lastTap = { t: now, x: s.x, y: s.y };
  }
  document.addEventListener('touchstart', begin, { passive: false }); document.addEventListener('touchmove', move, { passive: false });
  document.addEventListener('touchend', (e) => end(e), { passive: false }); document.addEventListener('touchcancel', (e) => end(e), { passive: false });
  VX.touch = { bridge: (el) => { if (el) el.setAttribute('data-touch', 'bridge'); return el; }, isTouch: coarse };
})();
