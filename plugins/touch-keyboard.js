/** @vx-plugin {"id":"touch-keyboard","name":"Shortcut Keyboard","version":"1.0.0","description":"A floating on-screen keyboard for phones and tablets: modifier keys, Esc/Tab/arrows and your own shortcut buttons (Ctrl+Z, Ctrl+S …)."} */
/** @vx-docs
 * ## Using the Shortcut Keyboard
 * Phones and tablets have no Ctrl, Esc, Tab or arrow keys, so shortcuts like **Ctrl+S** or **Ctrl+Z** are out of reach. This add-on shows a small floating key panel that presses them for you.
 *
 * - On a touch device it appears by itself. On a computer, open it from the **⌨ Keys** item in the status bar or the command **Keyboard: show / hide the shortcut keys**.
 * - **Ctrl, Shift, Alt** are sticky: tap once to use it for the next key only, tap twice to hold it until you tap it again (a dot shows it is held).
 * - A button such as **Ctrl+S** presses the whole combination at once. It goes to whatever you last tapped – the code editor, a text box or the page.
 * - Drag the **⠿** handle to move the panel. **▾** shrinks it to a small ⌨ button, **⚙** opens the settings.
 *
 * ### Make it yours
 * In **⚙ Customize** you can reorder or remove any button, **add your own** (pick a key and Ctrl / Alt / Shift), start from a ready-made layout (*Code editor*, *Game editor*, *Minimal*), change the key size and transparency, and choose whether it shows automatically on touch devices. Everything is remembered on this device.
 */
(function () {
  const doc = document, root = doc.documentElement;
  /* ---------- key catalogue ---------- */
  const KEYS = {}; const add = (id, key, code, kc, ch) => { KEYS[id] = { id, key, code, kc, ch: ch || null }; };
  for (let i = 0; i < 26; i++) { const L = String.fromCharCode(97 + i); add(L.toUpperCase(), L, 'Key' + L.toUpperCase(), 65 + i, L); }
  for (let i = 0; i <= 9; i++) add(String(i), String(i), 'Digit' + i, 48 + i, String(i));
  for (let i = 1; i <= 12; i++) add('F' + i, 'F' + i, 'F' + i, 111 + i);
  [['Escape', 'Escape', 27], ['Tab', 'Tab', 9], ['Enter', 'Enter', 13], ['Backspace', 'Backspace', 8], ['Delete', 'Delete', 46], ['Space', ' ', 32, ' '], ['ArrowUp', 'ArrowUp', 38], ['ArrowDown', 'ArrowDown', 40], ['ArrowLeft', 'ArrowLeft', 37], ['ArrowRight', 'ArrowRight', 39], ['Home', 'Home', 36], ['End', 'End', 35], ['PageUp', 'PageUp', 33], ['PageDown', 'PageDown', 34]].forEach(([id, key, kc, ch]) => add(id, key, id === 'Space' ? 'Space' : id, kc, ch));
  [['/', 'Slash', 191], ['-', 'Minus', 189], ['=', 'Equal', 187], ['[', 'BracketLeft', 219], [']', 'BracketRight', 221], [',', 'Comma', 188], ['.', 'Period', 190], [';', 'Semicolon', 186], ["'", 'Quote', 222], ['`', 'Backquote', 192], ['\\', 'Backslash', 220]].forEach(([c, code, kc]) => add(c, c, code, kc, c));
  const NAMES = { Escape: 'Esc', Backspace: '⌫', Delete: 'Del', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', PageUp: 'PgUp', PageDown: 'PgDn' };
  const labelOf = (d) => d.l || ((d.c ? 'Ctrl+' : '') + (d.a ? 'Alt+' : '') + (d.s ? 'Shift+' : '') + (NAMES[d.k] || d.k));
  const K = (k, o) => Object.assign({ k }, o || {});
  const MODS = [{ m: 'ctrl' }, { m: 'shift' }, { m: 'alt' }];
  const PRESETS = {
    editor: { name: 'Code editor', keys: [...MODS, K('Escape'), K('Tab'), K('Backspace'), K('Delete'), K('ArrowLeft'), K('ArrowUp'), K('ArrowDown'), K('ArrowRight'), K('Home'), K('End'), K('Z', { c: 1 }), K('Y', { c: 1 }), K('S', { c: 1 }), K('C', { c: 1 }), K('X', { c: 1 }), K('V', { c: 1 }), K('A', { c: 1 }), K('F', { c: 1 }), K('/', { c: 1 }), K('D', { c: 1 })] },
    game: { name: 'Game editor', keys: [...MODS, K('Escape'), K('Delete'), K('Space'), K('Tab'), K('ArrowLeft'), K('ArrowUp'), K('ArrowDown'), K('ArrowRight'), K('Z', { c: 1 }), K('Y', { c: 1 }), K('S', { c: 1 }), K('C', { c: 1 }), K('V', { c: 1 }), K('D', { c: 1 }), K('A', { c: 1 }), K('Enter')] },
    minimal: { name: 'Minimal', keys: [{ m: 'ctrl' }, K('Escape'), K('Z', { c: 1 }), K('S', { c: 1 }), K('Delete')] }
  };
  const DEFAULTS = { mode: 'auto', size: 'm', opacity: 0.96, preset: 'editor', collapsed: false };
  const cfg = () => ({ mode: vx.settings.get('mode', DEFAULTS.mode), size: vx.settings.get('size', DEFAULTS.size), opacity: +vx.settings.get('opacity', DEFAULTS.opacity), collapsed: !!vx.settings.get('collapsed', false), pos: vx.settings.get('pos', null) });
  const layout = () => { try { const v = JSON.parse(vx.settings.get('layout', '') || 'null'); if (Array.isArray(v) && v.length) return v.filter((d) => d && (d.m || KEYS[d.k])).slice(0, 80); } catch { /* fall back */ } return PRESETS.editor.keys; };
  const saveLayout = (l) => vx.settings.set('layout', JSON.stringify(l));
  const coarse = () => { try { return window.matchMedia('(pointer: coarse)').matches || root.classList.contains('touch'); } catch { return false; } };
  const shouldShow = () => { const m = cfg().mode; return m === 'always' || (m === 'auto' && coarse()); };

  /* ---------- sending keys ---------- */
  const sticky = { ctrl: 0, shift: 0, alt: 0 }; // 0 off · 1 next key · 2 held
  let lastFocus = null, panel = null;
  const inPanel = (el) => !!(panel && el && panel.contains(el));
  const onFocusIn = (e) => { if (!inPanel(e.target)) lastFocus = e.target; };
  doc.addEventListener('focusin', onFocusIn, true);
  const target = () => { const a = doc.activeElement; if (a && a !== doc.body && !inPanel(a)) return a; if (lastFocus && lastFocus.isConnected) return lastFocus; return doc.body; };
  const editable = (el) => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|tel|email|password|number|)$/i.test(el.type || '')));
  const isField = (el) => !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
  function insert(el, text) {
    try { if (doc.execCommand && doc.execCommand('insertText', false, text)) return; } catch { /* fall through */ }
    if (isField(el) && el.setRangeText) { el.setRangeText(text, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  function moveCaret(el, key, shift) {
    if (isField(el) && el.selectionStart != null && el.type !== 'number') {
      const v = el.value, s = el.selectionStart, e = el.selectionEnd, back = el.selectionDirection === 'backward'; let p = shift ? (back ? s : e) : (s === e ? s : (key === 'ArrowLeft' || key === 'Home' ? s : e));
      if (key === 'ArrowLeft') p = shift || s === e ? Math.max(0, p - 1) : s; else if (key === 'ArrowRight') p = shift || s === e ? Math.min(v.length, p + 1) : e;
      else if (key === 'Home') p = v.lastIndexOf('\n', p - 1) + 1; else if (key === 'End') { const n = v.indexOf('\n', p); p = n < 0 ? v.length : n; }
      else if (el.tagName === 'TEXTAREA') { const ls = v.lastIndexOf('\n', p - 1) + 1, col = p - ls; if (key === 'ArrowUp') { if (ls === 0) p = 0; else { const ps = v.lastIndexOf('\n', ls - 2) + 1; p = Math.min(ps + col, ls - 1); } } else { const n = v.indexOf('\n', p); if (n < 0) p = v.length; else { const ne = v.indexOf('\n', n + 1); p = Math.min(n + 1 + col, ne < 0 ? v.length : ne); } } } else return;
      if (shift) { const a = back ? e : s; el.setSelectionRange(Math.min(a, p), Math.max(a, p), p < a ? 'backward' : 'forward'); } else el.setSelectionRange(p, p); return;
    }
    const sel = window.getSelection && window.getSelection(); if (!sel || !sel.modify) return;
    const alter = shift ? 'extend' : 'move';
    if (key === 'ArrowLeft') sel.modify(alter, 'backward', 'character'); else if (key === 'ArrowRight') sel.modify(alter, 'forward', 'character');
    else if (key === 'ArrowUp') sel.modify(alter, 'backward', 'line'); else if (key === 'ArrowDown') sel.modify(alter, 'forward', 'line');
    else if (key === 'Home') sel.modify(alter, 'backward', 'lineboundary'); else if (key === 'End') sel.modify(alter, 'forward', 'lineboundary');
  }
  /** what the browser would have done for a real key press (synthetic key events are never acted on by the browser itself) */
  function fallback(info, m, el) {
    const ed = editable(el); const k = info.key;
    if (m.ctrl && !m.alt) {
      const c = k.toLowerCase();
      if (c === 'a') { if (isField(el) && el.select) el.select(); else doc.execCommand && doc.execCommand('selectAll'); }
      else if (c === 'c') { doc.execCommand && doc.execCommand('copy'); }
      else if (c === 'x') { doc.execCommand && doc.execCommand('cut'); }
      else if (c === 'v') { if (ed && navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then((t) => { if (t) insert(el, t); }).catch(() => { vx.ui.toast('Paste was blocked – long-press the text box and choose Paste.', 'error'); }); }
      else if (c === 'z') { doc.execCommand && doc.execCommand(m.shift ? 'redo' : 'undo'); }
      else if (c === 'y') { doc.execCommand && doc.execCommand('redo'); }
      return;
    }
    if (m.alt) return;
    if (!ed) return;
    if (k === 'Backspace') doc.execCommand && doc.execCommand('delete');
    else if (k === 'Delete') doc.execCommand && doc.execCommand('forwardDelete');
    else if (k === 'Enter') { if (el.tagName === 'TEXTAREA') insert(el, '\n'); else if (el.isContentEditable) doc.execCommand && doc.execCommand('insertParagraph'); }
    else if (k === 'Tab') { if (el.tagName === 'TEXTAREA' || el.isContentEditable) insert(el, '\t'); }
    else if (/^(Arrow|Home|End)/.test(k)) moveCaret(el, k, m.shift);
    else if (info.ch) insert(el, m.shift ? info.ch.toUpperCase() : info.ch);
  }
  function press(d) {
    const info = KEYS[d.k]; if (!info) return;
    const m = { ctrl: !!d.c || !!sticky.ctrl, alt: !!d.a || !!sticky.alt, shift: !!d.s || !!sticky.shift };
    for (const n of ['ctrl', 'shift', 'alt']) if (sticky[n] === 1) sticky[n] = 0;
    paintMods();
    const el = target(), shifted = m.shift && info.ch && info.ch.length === 1 && !m.ctrl ? info.ch.toUpperCase() : info.key;
    const init = { key: shifted, code: info.code, keyCode: info.kc, which: info.kc, ctrlKey: m.ctrl, altKey: m.alt, shiftKey: m.shift, bubbles: true, cancelable: true, composed: true, view: window };
    const mk = (type) => { const ev = new KeyboardEvent(type, init); if (ev.keyCode !== info.kc) { try { Object.defineProperty(ev, 'keyCode', { get: () => info.kc }); Object.defineProperty(ev, 'which', { get: () => info.kc }); } catch { /* read-only */ } } return ev; };
    const down = mk('keydown'); el.dispatchEvent(down);
    if (!down.defaultPrevented) { try { fallback(Object.assign({}, info, { key: info.key }), m, el); } catch (e) { vx.log('key fallback failed', e); } }
    el.dispatchEvent(mk('keyup'));
    if (el !== doc.body && el.focus && doc.activeElement !== el && el.isConnected) { try { el.focus({ preventScroll: true }); } catch { /* ignore */ } }
  }

  /* ---------- panel ---------- */
  const SIZES = { s: [34, 12], m: [42, 14], l: [52, 16] };
  const css = `#vx-osk{position:fixed;z-index:2147483000;left:50%;bottom:calc(8px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);max-width:min(96vw,720px);background:var(--panel,#1c1f26);color:var(--text,#e6e6e6);border:1px solid var(--border,#3a3f4b);border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.45);font:13px system-ui,sans-serif;user-select:none;-webkit-user-select:none;touch-action:none}
#vx-osk.moved{left:0;top:0;bottom:auto;transform:none}
#vx-osk .hd{display:flex;align-items:center;gap:4px;padding:3px 6px;border-bottom:1px solid var(--border,#3a3f4b);cursor:grab}
#vx-osk .hd b{flex:1;font-weight:600;font-size:12px;opacity:.8;padding-left:4px}
#vx-osk .hd button,#vx-osk .pill{all:unset;cursor:pointer;padding:4px 8px;border-radius:6px;font-size:14px;line-height:1}
#vx-osk .hd button:hover,#vx-osk .pill:hover{background:rgba(127,127,127,.25)}
#vx-osk .keys{display:flex;flex-wrap:wrap;gap:5px;padding:7px;justify-content:center;touch-action:manipulation}
#vx-osk .k{all:unset;box-sizing:border-box;cursor:pointer;min-width:var(--kw);height:var(--kw);padding:0 9px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:var(--bg-elev,#2a2e38);border:1px solid var(--border,#3a3f4b);font-size:var(--kf);font-weight:600;position:relative;touch-action:manipulation}
#vx-osk .k:active{background:var(--accent,#5b8cff);color:#fff}
#vx-osk .k.mod.on{background:var(--accent,#5b8cff);color:#fff;border-color:var(--accent,#5b8cff)}
#vx-osk .k.mod.hold::after{content:'';position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:50%;background:#fff}
#vx-osk.min{border-radius:999px}#vx-osk.min .hd{border:0;padding:0}#vx-osk.min .hd b,#vx-osk.min .keys,#vx-osk.min .hd .x{display:none}
#vx-osk .k:focus-visible,#vx-osk .hd button:focus-visible{outline:2px solid var(--accent,#5b8cff)}
.vx-osk-ed .row{display:flex;gap:6px;align-items:center;padding:4px 0;border-bottom:1px solid rgba(127,127,127,.2)}.vx-osk-ed .row span{flex:1}.vx-osk-ed .bar{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.vx-osk-ed button{padding:5px 10px;cursor:pointer}.vx-osk-ed label{display:flex;gap:6px;align-items:center;margin:6px 0}.vx-osk-ed input[type=text],.vx-osk-ed select{padding:4px}`;
  const styleEl = doc.createElement('style'); styleEl.textContent = css; doc.head.appendChild(styleEl);
  const el = (tag, attrs, ...kids) => { const n = doc.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : String(c)); return n; };
  const modBtns = {};
  function paintMods() { for (const n of Object.keys(modBtns)) for (const b of modBtns[n]) { b.classList.toggle('on', !!sticky[n]); b.classList.toggle('hold', sticky[n] === 2); b.setAttribute('aria-pressed', String(!!sticky[n])); } }
  /** buttons must never take focus away from the text the person is typing in */
  const noFocus = (b) => { b.addEventListener('mousedown', (e) => { if (e.cancelable) e.preventDefault(); }); /* a mouse press must not move the focus; touch taps keep their click */ return b; };
  function clamp() {
    if (!panel || !panel.classList.contains('moved')) return;
    const vv = window.visualViewport, W = vv ? vv.width : innerWidth, H = vv ? vv.height : innerHeight, r = panel.getBoundingClientRect();
    const x = Math.max(0, Math.min(W - Math.min(r.width, W), +panel.dataset.x || 0)), y = Math.max(0, Math.min(H - Math.min(r.height, H), +panel.dataset.y || 0));
    panel.dataset.x = x; panel.dataset.y = y; panel.style.left = x + 'px'; panel.style.top = y + 'px';
  }
  function build() {
    const c = cfg(), [kw, kf] = SIZES[c.size] || SIZES.m;
    if (panel) panel.remove(); for (const n of Object.keys(modBtns)) delete modBtns[n];
    const keys = el('div', { class: 'keys', role: 'group', 'aria-label': 'Shortcut keys' });
    for (const d of layout()) {
      if (d.m) {
        const b = noFocus(el('button', { class: 'k mod', type: 'button', 'aria-label': d.m + ' key (tap once for the next key, twice to hold)', 'aria-pressed': 'false', onclick: () => { sticky[d.m] = (sticky[d.m] + 1) % 3; paintMods(); } }, d.m[0].toUpperCase() + d.m.slice(1)));
        (modBtns[d.m] = modBtns[d.m] || []).push(b); keys.append(b);
      } else keys.append(noFocus(el('button', { class: 'k', type: 'button', 'aria-label': labelOf(d), onclick: () => press(d) }, labelOf(d))));
    }
    const hd = el('div', { class: 'hd' }, el('button', { class: 'drag', type: 'button', title: 'Drag to move', 'aria-label': 'Move the keyboard' }, '⠿'), el('b', {}, 'Shortcut keys'),
      noFocus(el('button', { class: 'x', type: 'button', title: 'Customize', 'aria-label': 'Customize the keyboard', onclick: () => customize() }, '⚙')),
      noFocus(el('button', { class: 'tg', type: 'button', title: c.collapsed ? 'Show the keys' : 'Shrink', 'aria-label': c.collapsed ? 'Show the keys' : 'Shrink the keyboard', 'aria-expanded': String(!c.collapsed), onclick: () => { vx.settings.set('collapsed', !cfg().collapsed); build(); } }, c.collapsed ? '⌨' : '▾')));
    panel = el('div', { id: 'vx-osk', class: (c.collapsed ? 'min ' : '') + (c.pos ? 'moved' : ''), role: 'toolbar', 'aria-label': 'On-screen shortcut keyboard' }, hd, keys);
    panel.style.setProperty('--kw', kw + 'px'); panel.style.setProperty('--kf', kf + 'px'); panel.style.opacity = String(Math.max(0.4, Math.min(1, c.opacity || 1)));
    if (c.pos) { panel.dataset.x = c.pos.x; panel.dataset.y = c.pos.y; }
    // dragging (the whole header is a handle)
    let drag = null;
    hd.addEventListener('pointerdown', (e) => { if (e.target.closest('.x,.tg')) return; const r = panel.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false, x0: e.clientX, y0: e.clientY }; try { hd.setPointerCapture(e.pointerId); } catch { /* ignore */ } });
    hd.addEventListener('pointermove', (e) => { if (!drag) return; if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return; drag.moved = true; panel.classList.add('moved'); panel.dataset.x = e.clientX - drag.dx; panel.dataset.y = e.clientY - drag.dy; clamp(); });
    hd.addEventListener('pointerup', () => { if (!drag) return; if (drag.moved) vx.settings.set('pos', { x: +panel.dataset.x, y: +panel.dataset.y }); else if (panel.classList.contains('min')) { vx.settings.set('collapsed', false); build(); } drag = null; });
    hd.addEventListener('pointercancel', () => { drag = null; });
    doc.body.appendChild(panel); paintMods(); requestAnimationFrame(clamp);
    // keep it above the phone's own keyboard when it is in its default bottom position
    lift();
  }
  function lift() { if (!panel || panel.classList.contains('moved')) { if (panel) panel.style.marginBottom = ''; return; } const vv = window.visualViewport; if (!vv) return; panel.style.marginBottom = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) + 'px'; }
  function sync() { const want = shouldShow() || shownByHand; if (want && !panel) build(); else if (!want && panel) { panel.remove(); panel = null; } }
  let shownByHand = false;
  function toggle() { if (panel && (cfg().mode === 'never' || !shouldShow())) { shownByHand = false; sync(); return; } if (!panel) { shownByHand = true; if (cfg().collapsed) vx.settings.set('collapsed', false); sync(); } else { vx.settings.set('collapsed', !cfg().collapsed); build(); } }

  /* ---------- customize ---------- */
  function customize() {
    let L = layout().map((d) => Object.assign({}, d));
    const body = el('div', { class: 'vx-osk-ed' }); let modal = null;
    const apply = () => { saveLayout(L); build(); draw(); };
    function draw() {
      body.replaceChildren();
      body.append(el('b', {}, 'Your buttons'), el('div', {}, L.map((d, i) => el('div', { class: 'row' }, el('span', {}, d.m ? d.m[0].toUpperCase() + d.m.slice(1) + ' (modifier)' : labelOf(d)),
        el('button', { type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { [L[i - 1], L[i]] = [L[i], L[i - 1]]; apply(); } }, '↑'),
        el('button', { type: 'button', 'aria-label': 'Move down', disabled: i === L.length - 1, onclick: () => { [L[i + 1], L[i]] = [L[i], L[i + 1]]; apply(); } }, '↓'),
        el('button', { type: 'button', 'aria-label': 'Remove', onclick: () => { L.splice(i, 1); apply(); } }, '✕')))));
      body.append(el('div', { class: 'bar' }, el('button', { type: 'button', onclick: addKey }, '＋ Add a button'), ['ctrl', 'shift', 'alt'].filter((m) => !L.some((d) => d.m === m)).map((m) => el('button', { type: 'button', onclick: () => { L.unshift({ m }); apply(); } }, '＋ ' + m[0].toUpperCase() + m.slice(1)))));
      const pr = el('select', { 'aria-label': 'Start from a ready-made layout' }, el('option', { value: '' }, 'Ready-made layouts…'), Object.entries(PRESETS).map(([id, p]) => el('option', { value: id }, p.name)));
      pr.addEventListener('change', () => { if (pr.value) { L = PRESETS[pr.value].keys.map((d) => Object.assign({}, d)); apply(); } });
      const sz = el('select', { 'aria-label': 'Key size' }, [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].map(([v, t]) => el('option', { value: v, selected: cfg().size === v }, t))); sz.addEventListener('change', () => { vx.settings.set('size', sz.value); build(); });
      const md = el('select', { 'aria-label': 'When to show' }, [['auto', 'Automatically on touch devices'], ['always', 'Always'], ['never', 'Only when I open it']].map(([v, t]) => el('option', { value: v, selected: cfg().mode === v }, t))); md.addEventListener('change', () => { vx.settings.set('mode', md.value); sync(); });
      const op = el('input', { type: 'range', min: 40, max: 100, value: Math.round(cfg().opacity * 100), 'aria-label': 'Transparency' }); op.addEventListener('input', () => { vx.settings.set('opacity', op.value / 100); if (panel) panel.style.opacity = String(op.value / 100); });
      body.append(el('div', { class: 'bar' }, pr), el('label', {}, 'Key size ', sz), el('label', {}, 'Show ', md), el('label', {}, 'Opacity ', op),
        el('div', { class: 'bar' }, el('button', { type: 'button', onclick: () => { L = PRESETS.editor.keys.map((d) => Object.assign({}, d)); vx.settings.set('pos', null); apply(); build(); } }, 'Reset everything')));
    }
    async function addKey() {
      const v = await vx.ui.form({ title: 'Add a shortcut button', intro: 'Pick the key and tick the modifiers it should press together with it. For example Ctrl + S saves.', fields: [
        { key: 'k', label: 'Key', type: 'select', value: 'S', options: Object.keys(KEYS).map((k) => [k, NAMES[k] || k]) }, { key: 'c', label: 'Ctrl', type: 'checkbox', value: true }, { key: 'a', label: 'Alt', type: 'checkbox', value: false }, { key: 's', label: 'Shift', type: 'checkbox', value: false },
        { key: 'l', label: 'Label (optional)', type: 'text', value: '', placeholder: 'e.g. Save' }], submit: 'Add' });
      if (!v || !KEYS[v.k]) return; L.push({ k: v.k, c: v.c ? 1 : 0, a: v.a ? 1 : 0, s: v.s ? 1 : 0, l: String(v.l || '').trim().slice(0, 12) }); apply();
    }
    draw(); modal = vx.ui.modal({ title: 'Customize the shortcut keyboard', body, wide: false }); return modal;
  }

  /* ---------- wiring ---------- */
  const item = vx.statusBar.add({ id: 'kb', text: '⌨ Keys', align: 'right', tooltip: 'Show or hide the shortcut keyboard', onClick: toggle });
  vx.commands.register({ id: 'toggle', title: 'Keyboard: show / hide the shortcut keys', run: toggle });
  vx.commands.register({ id: 'customize', title: 'Keyboard: customize the shortcut keys', run: () => { shownByHand = true; sync(); customize(); } });
  const onVV = () => { lift(); clamp(); }, onRes = () => { sync(); clamp(); };
  window.addEventListener('resize', onRes); if (window.visualViewport) { window.visualViewport.addEventListener('resize', onVV); window.visualViewport.addEventListener('scroll', onVV); }
  sync();
  vx.onUnload(() => { doc.removeEventListener('focusin', onFocusIn, true); window.removeEventListener('resize', onRes); if (window.visualViewport) { window.visualViewport.removeEventListener('resize', onVV); window.visualViewport.removeEventListener('scroll', onVV); } if (panel) panel.remove(); styleEl.remove(); delete window.__vxOsk; void item; });
  /* test hook (not part of the add-on's public use) */
  window.__vxOsk = { press, KEYS, layout, PRESETS, sticky, build, toggle, get panel() { return panel; } };
})();
