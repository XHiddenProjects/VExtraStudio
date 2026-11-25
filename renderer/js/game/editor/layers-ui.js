/* Vextra game editor – layers (Background / World / UI), the live cursor + object position readout and the UI-layer editor (drag labels, bars… to where you want them). */
(function () {
  const { h } = VX;
  const ANCH = { topLeft: [0, 0], top: [50, 0], topRight: [100, 0], left: [0, 50], center: [50, 50], right: [100, 50], bottomLeft: [0, 100], bottom: [50, 100], bottomRight: [100, 100], bottomCenter: [50, 100], topCenter: [50, 0] };
  const LIST = [['background', 'Background', '🌄', 'Sky, far scenery – drawn first, behind everything'], ['world', 'World', '🌍', 'The game world – follows the camera'], ['ui', 'UI', '🖥', 'Screen-space interface – always on top, ignores the camera']];

  VX.layers = {
    list: LIST, active: 'world',
    state: { background: { hide: false, lock: false }, world: { hide: false, lock: false }, ui: { hide: false, lock: false } },
    of: (o) => (o && LIST.some((l) => l[0] === o.layer) ? o.layer : 'world'),
    hidden(o) { return !!this.state[this.of(o)].hide; }, locked(o) { return !!this.state[this.of(o)].lock; },
    name: (id) => (LIST.find((l) => l[0] === id) || LIST[1])[1],
    /** a small overlay that shows "Cursor X, Y" and the selected object's position in the corner of a viewport */
    readout(host) { const el = h('div', { class: 'vp-pos' }); host.append(el); let cur = '', sel = ''; const draw = () => { el.textContent = ''; el.append(h('span', { class: 'c' }, cur || 'Cursor –')); if (sel) el.append(h('span', { class: 's' }, sel)); }; draw(); return { el, cursor(t) { cur = t; draw(); }, selected(t) { sel = t; draw(); } }; },
  };

  /* ------------------------------------------------------------------ the UI layer editor */
  const DEF = { label: { anchor: 'topLeft', x: 16, y: 12, size: 24 }, bar: { anchor: 'topLeft', x: 16, y: 48, w: 220, h: 18 }, joystick: { anchor: 'bottomLeft', x: 28, y: 28, size: 140, knob: 56, color: '#ffffff', knobColor: '#ffffff', opacity: 0.45 }, touchButton: { anchor: 'bottomRight', x: 28, y: 28, size: 72, label: 'Jump', color: '#ffffff', opacity: 0.4 }, touchLook: { anchor: 'right', x: 28, y: 0, size: 120, color: '#ffffff' } };
  const KINDS = { label: 1, bar: 1, joystick: 1, touchButton: 1, touchLook: 1 }, DEFID = { label: 'hud', bar: 'health', joystick: 'stick', touchButton: 'jump', touchLook: 'look' };
  const cache = new Map();
  function nodesOf(b) {
    if (!b) return [];
    if (b.mode === 'code') { const key = b.code || ''; let hit = cache.get(b.id); if (!hit || hit.key !== key) { let g = null; try { const r = VX.codegen.codeToGraph(key); g = r.graph; } catch (e) { g = null; } hit = { key, nodes: g ? g.nodes : [] }; cache.set(b.id, hit); } return hit.nodes; }
    return (b.graph && b.graph.nodes) || [];
  }
  /** every Label / Bar block that the scene (or its objects) can create, with its current position */
  function collect(scene, project) {
    const out = [], seen = new Set(), ids = new Set(scene.behaviors || []); const lists = [];
    for (const o of scene.objects) { for (const b of o.behaviors || []) ids.add(b); if (o.graph && o.graph.nodes) lists.push(o.graph.nodes); }
    for (const id of ids) lists.push(nodesOf(project.behaviors[id]));
    const walk = (nodes) => { for (const n of nodes) { if (n.type === 'bundle' && n.graph) { walk(n.graph.nodes || []); continue; } if (!KINDS[n.type]) continue; const p = Object.assign({}, DEF[n.type], n.params || {}); if (n.type === 'touchLook' && (p.mode || 'drag') === 'drag') continue; const id = String(p.id || DEFID[n.type]); if (seen.has(id) || p.follow) continue; seen.add(id); const ov = (scene.uiLayout || {})[id]; out.push({ id, type: n.type, p, anchor: ov ? ov.anchor : p.anchor, x: ov ? ov.x : +p.x || 0, y: ov ? ov.y : +p.y || 0, moved: !!ov }); } };
    for (const l of lists) walk(l); return out;
  }

  class UiLayer {
    constructor(ctx) {
      this.ctx = ctx; this.sel = null; this.snap = true; this.k = 1;
      this.frame = h('div', { class: 'uil-frame' }); this.panel = h('div', { class: 'uil-panel' }); this.info = h('div', { class: 'uil-info' });
      this.el = h('div', { class: 'uil', style: 'display:none' }, this.frame, this.panel, this.info);
      this.ro = new ResizeObserver(() => this.layout()); this.ro.observe(this.el);
      this.el.addEventListener('mousedown', (e) => { if (e.target === this.el || e.target === this.frame) { this.sel = null; this.draw(); } });
      this.el.addEventListener('mousemove', (e) => { const r = this.frame.getBoundingClientRect(); const x = Math.round((e.clientX - r.left) / this.k), y = Math.round((e.clientY - r.top) / this.k); this.info.textContent = `Screen X ${x}, Y ${y}`; });
    }
    show(on) { this.el.style.display = on ? '' : 'none'; if (on) this.refresh(); }
    get visible() { return this.el.style.display !== 'none'; }
    setScene(scene, project) { this.scene = scene; this.project = project; if (this.visible) this.refresh(); }
    layout() { if (!this.project) return; const r = this.el.getBoundingClientRect(), gw = this.project.settings.width, gh = this.project.settings.height; if (r.width < 10) return; this.k = Math.min((r.width - 40) / gw, (r.height - 70) / gh); Object.assign(this.frame.style, { width: gw + 'px', height: gh + 'px', transform: `scale(${this.k})`, left: (r.width - gw * this.k) / 2 + 'px', top: (r.height - gh * this.k) / 2 + 'px' }); }
    refresh() { if (!this.scene) return; this.layout(); this.items = collect(this.scene, this.project); this.draw(); }
    draw() {
      const f = this.frame; f.textContent = '';
      for (const [, a] of Object.entries({ tl: [0, 0], tc: [50, 0], tr: [100, 0], ml: [0, 50], mc: [50, 50], mr: [100, 50], bl: [0, 100], bc: [50, 100], br: [100, 100] })) f.append(h('i', { class: 'uil-a', style: `left:${a[0]}%;top:${a[1]}%` }));
      if (!this.items.length) f.append(h('div', { class: 'uil-empty' }, 'No Label, Bar, Joystick or Touch Button blocks in this scene yet. Add one (GUI group) to a behaviour on this scene or one of its objects and it appears here.'));
      for (const it of this.items) {
        const a = ANCH[it.anchor] || ANCH.topLeft, ox = it.x * (a[0] === 100 ? -1 : 1), oy = it.y * (a[1] === 100 ? -1 : 1);
        const st = `position:absolute;left:calc(${a[0]}% + ${ox}px);top:calc(${a[1]}% + ${oy}px);transform:translate(-${a[0]}%,-${a[1]}%);`;
        let node;
        if (it.type === 'label') node = h('div', { class: 'uil-it label', style: st + `font:${it.p.bold === false ? 500 : 700} ${+it.p.size || 24}px system-ui,sans-serif;color:${it.p.color || '#fff'};${it.p.bg ? 'background:' + it.p.bg + ';padding:6px 12px;border-radius:8px;' : ''}` }, String(it.p.text ?? it.id));
        else if (it.type === 'joystick' || it.type === 'touchLook') { const sz = +it.p.size || 140, ks = it.type === 'joystick' ? +it.p.knob || 56 : Math.round(sz * 0.4); node = h('div', { class: 'uil-it stick', style: st + `width:${sz}px;height:${sz}px;border-radius:50%;box-sizing:border-box;background:color-mix(in srgb, ${it.p.color || '#fff'} 28%, transparent);border:2px solid ${it.p.knobColor || it.p.color || '#fff'};` }, h('div', { style: `position:absolute;left:50%;top:50%;width:${ks}px;height:${ks}px;margin:${-ks / 2}px 0 0 ${-ks / 2}px;border-radius:50%;background:${it.p.knobColor || it.p.color || '#fff'}` })); }
        else if (it.type === 'touchButton') { const sz = +it.p.size || 72; node = h('div', { class: 'uil-it tbtn', style: st + `width:${sz}px;height:${sz}px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;border-radius:${it.p.shape === 'square' ? 4 : it.p.shape === 'rounded' ? Math.round(sz * 0.22) : sz / 2}px;background:color-mix(in srgb, ${it.p.color || '#fff'} 26%, transparent);border:2px solid ${it.p.borderColor || '#fff'};color:${it.p.textColor || '#fff'};text-shadow:0 1px 4px #000c;font:600 ${Math.max(11, Math.round(sz * 0.2))}px system-ui` }, String(it.p.label ?? '')); }
        else node = h('div', { class: 'uil-it bar', style: st + `width:${+it.p.w || 220}px;height:${+it.p.h || 18}px;` }, h('div', { style: `width:62%;height:100%;background:${it.p.color || '#4cc38a'};border-radius:inherit` }));
        node.title = `${it.type} “${it.id}” – drag to move`; if (this.sel === it.id) node.classList.add('on'); if (it.moved) node.classList.add('moved');
        node.addEventListener('mousedown', (e) => this.down(e, it));
        node.tabIndex = 0; node.setAttribute('role', 'button'); node.setAttribute('aria-label', `${it.id} (${it.type}) – arrow keys move it, Shift moves 10 pixels, Delete puts it back`);
        node.addEventListener('focus', () => { this.sel = it.id; });
        node.addEventListener('keydown', (e) => {
          const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
          if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delete (this.scene.uiLayout || {})[it.id]; this.ctx.onChange(); this.draw(); return; }
          if (!d) return; e.preventDefault(); const a = ANCH[it.anchor] || ANCH.topLeft, st = e.shiftKey ? 10 : 1;
          this.set(it, { anchor: it.anchor, x: it.x + d[0] * st * (a[0] === 100 ? -1 : 1), y: it.y + d[1] * st * (a[1] === 100 ? -1 : 1) });
          this.info.textContent = `${it.id}: ${it.anchor} offset X ${it.x}, Y ${it.y}`; try { window.VX && VX.a11y && VX.a11y.announce(`${it.id} X ${it.x}, Y ${it.y}`); } catch { /* ignore */ }
          const again = this.el.querySelector(`[data-uil-id="${CSS.escape(it.id)}"]`); if (again) again.focus();
        });
        node.dataset.uilId = it.id; f.append(node);
      }
      this.panelDraw();
    }
    panelDraw() {
      const p = this.panel; p.textContent = ''; const it = this.items.find((x) => x.id === this.sel);
      if (!it) { p.append(h('span', { class: 'hint' }, 'UI layer – drag a label or bar to move it, or click one to type its position.')); return; }
      const sel = h('select', {}, Object.keys(ANCH).filter((k) => k !== 'bottomCenter' && k !== 'topCenter').map((k) => h('option', { value: k }, k))); sel.value = it.anchor;
      const num = (key) => { const i = h('input', { type: 'number', step: 1, value: Math.round(it[key]) }); i.addEventListener('change', () => { this.set(it, { [key]: +i.value || 0 }); }); return i; };
      sel.addEventListener('change', () => { /* keep it where it is on screen while the anchor changes */ const old = ANCH[it.anchor] || ANCH.topLeft, nw = ANCH[sel.value], gw = this.project.settings.width, gh = this.project.settings.height; const sx = old[0] / 100 * gw + it.x * (old[0] === 100 ? -1 : 1), sy = old[1] / 100 * gh + it.y * (old[1] === 100 ? -1 : 1); this.set(it, { anchor: sel.value, x: Math.round((sx - nw[0] / 100 * gw) * (nw[0] === 100 ? -1 : 1)), y: Math.round((sy - nw[1] / 100 * gh) * (nw[1] === 100 ? -1 : 1)) }); });
      p.append(h('b', {}, it.id), h('label', {}, 'Anchor', sel), h('label', {}, 'X', num('x')), h('label', {}, 'Y', num('y')), h('button', { class: 'btn sm', onclick: () => { delete (this.scene.uiLayout || {})[it.id]; this.ctx.onChange(); this.refresh(); } }, 'Reset'));
    }
    set(it, patch) { const L = (this.scene.uiLayout = this.scene.uiLayout || {}); L[it.id] = Object.assign({ anchor: it.anchor, x: it.x, y: it.y }, L[it.id] || {}, patch); Object.assign(it, patch, { moved: true }); this.ctx.onChange(); this.draw(); }
    down(e, it) {
      if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); this.sel = it.id; const a = ANCH[it.anchor] || ANCH.topLeft, sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y; let moved = false; this.draw();
      const mv = (ev) => { let dx = (ev.clientX - sx) / this.k, dy = (ev.clientY - sy) / this.k; if (!moved && Math.hypot(dx, dy) * this.k < 3) return; moved = true; const sn = this.snap && !ev.altKey ? (v) => Math.round(v / 4) * 4 : Math.round; const nx = sn(ox + dx * (a[0] === 100 ? -1 : 1)), ny = sn(oy + dy * (a[1] === 100 ? -1 : 1)); const L = (this.scene.uiLayout = this.scene.uiLayout || {}); L[it.id] = { anchor: it.anchor, x: nx, y: ny }; it.x = nx; it.y = ny; it.moved = true; this.liveDraw(it); };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (moved) this.ctx.onChange(); this.draw(); }; addEventListener('mousemove', mv); addEventListener('mouseup', up);
    }
    liveDraw(it) { this.draw(); this.info.textContent = `${it.id}: ${it.anchor} offset X ${it.x}, Y ${it.y}`; }
  }
  VX.UiLayer = UiLayer;
})();
