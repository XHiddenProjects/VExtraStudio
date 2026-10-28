/* Pointer-based drag & drop. It does not rely on HTML5 drag events, so it also works in webviews
   where the native file-drop handler swallows them (this was the "can't drag onto canvas" bug). */
(function () {
  const targets = new Set();
  let ghost = null, hover = null;

  function targetAt(x, y, payload) {
    for (const el of document.elementsFromPoint(x, y)) {
      for (const t of targets) if (t.el === el || t.el.contains(el)) { if (!t.accept || t.accept(payload)) return t; }
    }
    return null;
  }

  VX.dnd = {
    /** Make `el` start a drag when the user presses and moves. `payload()` returns the data handed to the drop target. */
    draggable(el, payload, label) {
      el.classList.add('vx-draggable');
      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const sx = e.clientX, sy = e.clientY; let started = false, data = null;
        const move = (ev) => {
          if (!started) {
            if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
            started = true; data = typeof payload === 'function' ? payload() : payload;
            ghost = VX.h('div', { class: 'dnd-ghost' }, label || el.textContent.trim()); document.body.append(ghost);
            document.body.classList.add('dnd-active');
          }
          ghost.style.left = ev.clientX + 12 + 'px'; ghost.style.top = ev.clientY + 12 + 'px';
          const t = targetAt(ev.clientX, ev.clientY, data);
          if (hover && (!t || hover !== t)) hover.el.classList.remove('drop-hover');
          hover = t; if (t) t.el.classList.add('drop-hover');
        };
        const up = (ev) => {
          removeEventListener('mousemove', move, true); removeEventListener('mouseup', up, true);
          if (!started) return;
          ghost && ghost.remove(); ghost = null; document.body.classList.remove('dnd-active');
          if (hover) hover.el.classList.remove('drop-hover'); hover = null;
          const t = targetAt(ev.clientX, ev.clientY, data);
          if (t) { ev.preventDefault(); t.drop(data, ev.clientX, ev.clientY); }
          const swallow = (c) => { c.stopPropagation(); c.preventDefault(); }; // don't also fire the palette item's click
          addEventListener('click', swallow, { capture: true, once: true }); setTimeout(() => removeEventListener('click', swallow, true), 0);
        };
        addEventListener('mousemove', move, true); addEventListener('mouseup', up, true);
      });
    },
    /** Register a drop target. drop(payload, clientX, clientY). Returns an unregister function. */
    target(el, drop, accept) { const t = { el, drop, accept }; targets.add(t); return () => targets.delete(t); },
    prune() { for (const t of [...targets]) if (!document.body.contains(t.el)) targets.delete(t); },
  };
})();
