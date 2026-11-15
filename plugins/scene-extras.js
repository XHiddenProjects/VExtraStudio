/** @forge-plugin {"id":"scene-extras","name":"Designer & Game Extras","version":"2.0.0","description":"A polished component pack for the UI designer (CTA banner, announcement bar, feature grid, steps, FAQ, countdown, status chip) and ready-made game objects: 2D Star, Coin, Heart and 3D Crystal, Orb, Portal ring."} */
/** @forge-docs
 * ## Designer & Game Extras
 * A small, production-quality pack of things you can drag onto a canvas. Everything is escaped, themeable from the Properties panel
 * and works in the exported page and in exported games.
 *
 * ### UI designer (Create panel → *Extras*)
 * Open or create a `.vxui` design and look under **Extras**.
 *
 * | Component | What it is for |
 * |---|---|
 * | **CTA banner** | A headline, a sentence and a button. The button can link to a `#section`. |
 * | **Announcement bar** | A thin strip for news or a promotion, with a link and a close button. |
 * | **Feature grid** | Up to four columns of icon + title + text. One feature per line: an icon, a title and a sentence, separated by vertical bars. |
 * | **Steps** | A numbered process, horizontal or vertical. One step per line: a title and a short description, separated by a vertical bar. |
 * | **FAQ** | A real accordion (questions open and close). One item per line: the question and the answer, separated by a vertical bar. |
 * | **Countdown** | Counts down to a date and time in the exported page. |
 * | **Status chip** | A small label with a coloured dot (success, warning, error, info, neutral). |
 *
 * Links accept `#anchors`: give any item an **Anchor name** (Properties → Responsive & links) and point a button or link at `#thatname`.
 * The page scrolls there and never leaves the site.
 *
 * ### 2D games
 * **Star**, **Coin** and **Heart** appear under *Plugins*. Each one has colour, outline, glow and animation settings (spin, pulse, flip).
 * They animate in the running game and stay still in the editor.
 *
 * ### 3D games
 * **Crystal**, **Orb** and **Portal ring** appear under *Plugins*. They use physically based materials with an optional glow.
 * The Orb can carry a real point light.
 *
 * ### Developers
 * Read the source with **Plugins → Designer & Game Extras → Open source**. `forge.designer.registerComponent('ui', def)` takes
 * `html(item, exported)`; `forge.game.registerObjectType(def)` takes `draw(ctx, o, env)` for 2D or `build(THREE, o)` for 3D.
 * `draw` and `build` are copied into exported games as text, so they must be self-contained (no outside variables).
 */

/* ------------------------------------------------------------------------------------------------------------------ */
/* UI designer components                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d, lo, hi) => { const n = parseFloat(v); return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : d)); };
const col = (v, d) => (/^#[0-9a-f]{3,8}$/i.test(String(v || '').trim()) ? String(v).trim() : d);
const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
const parts = (l) => l.split('|').map((x) => x.trim());
const link = (h) => { h = String(h || '').trim(); return /^(#|\/|https?:|mailto:|tel:)/i.test(h) ? h : (h ? '#' + h.replace(/^#?/, '') : '#'); };
const SANS = "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;";
const BOX = 'width:100%;height:100%;box-sizing:border-box;';
const U = (def) => forge.designer.registerComponent('ui', Object.assign({ category: 'Extras' }, def));
const T = (key, label, extra) => Object.assign({ key, label, type: 'text' }, extra);
const C = (key, label) => ({ key, label, type: 'color' });
const N = (key, label, min, max) => ({ key, label, type: 'number', min, max });

U({
  type: 'cta', label: 'CTA banner', icon: '📣', w: 760, h: 200,
  props: { title: 'Ready to build something great?', text: 'Start free today. No credit card needed.', button: 'Get started', href: '#start', bg: '#1b2140', color: '#ffffff', accent: '#6c8cff', radius: 18, align: 'center' },
  schema: [T('title', 'Headline'), { key: 'text', label: 'Text', type: 'textarea' }, T('button', 'Button label'), T('href', 'Button link (#anchor or URL)'), C('bg', 'Background'), C('color', 'Text color'), C('accent', 'Button color'), N('radius', 'Corner radius', 0, 80), { key: 'align', label: 'Align', type: 'select', options: ['center', 'left'] }],
  html: (i, ex) => {
    const p = i.props, left = p.align === 'left';
    const btn = `<${ex ? `a href="${esc(link(p.href))}"` : 'span'} style="display:inline-block;margin-top:6px;background:${col(p.accent, '#6c8cff')};color:#fff;padding:11px 26px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none">${esc(p.button)}</${ex ? 'a' : 'span'}>`;
    return `<div style="${BOX}${SANS}background:${col(p.bg, '#1b2140')};color:${col(p.color, '#fff')};border-radius:${num(p.radius, 18, 0, 80)}px;padding:24px 32px;display:flex;flex-direction:column;justify-content:center;gap:8px;align-items:${left ? 'flex-start' : 'center'};text-align:${left ? 'left' : 'center'};overflow:hidden"><div style="font-size:26px;font-weight:800;letter-spacing:-.01em;line-height:1.15">${esc(p.title)}</div><div style="opacity:.78;font-size:15px;line-height:1.5;max-width:560px">${esc(p.text)}</div>${btn}</div>`;
  },
});

U({
  type: 'announcement', label: 'Announcement bar', icon: '📢', w: 900, h: 44,
  props: { text: 'New: Vextra Studio 4.0 is here.', linkText: 'See what changed →', href: '#news', bg: '#6c8cff', color: '#0b1020', closable: 'yes' },
  schema: [T('text', 'Message'), T('linkText', 'Link text'), T('href', 'Link (#anchor or URL)'), C('bg', 'Background'), C('color', 'Text color'), { key: 'closable', label: 'Close button', type: 'select', options: ['yes', 'no'] }],
  html: (i, ex) => {
    const p = i.props, c = col(p.color, '#0b1020');
    const a = p.linkText ? `<${ex ? `a href="${esc(link(p.href))}"` : 'span'} style="color:inherit;font-weight:700;text-decoration:underline;margin-left:10px">${esc(p.linkText)}</${ex ? 'a' : 'span'}>` : '';
    const x = p.closable === 'yes' ? `<button ${ex ? `onclick="this.closest('.it').hidden=true"` : ''} aria-label="Close" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:inherit;font-size:20px;line-height:1;cursor:pointer;opacity:.7">×</button>` : '';
    return `<div style="${BOX}${SANS}position:relative;background:${col(p.bg, '#6c8cff')};color:${c};display:flex;align-items:center;justify-content:center;padding:0 44px;font-size:14px;text-align:center;overflow:hidden"><span>${esc(p.text)}${a}</span>${x}</div>`;
  },
});

U({
  type: 'features', label: 'Feature grid', icon: '✨', w: 760, h: 190,
  props: { items: '🚀 | Fast | Starts in a second and stays out of your way.\n🎨 | Designable | Drag, drop and style every part of your page.\n🔒 | Private | Your work stays on your computer.', bg: 'transparent', color: '#e7e9ee', accent: '#6c8cff' },
  schema: [{ key: 'items', label: 'Features (icon | title | text, one per line, max 4)', type: 'textarea' }, C('color', 'Text color'), C('accent', 'Icon background')],
  html: (i) => {
    const p = i.props, rows = lines(p.items).slice(0, 4).map(parts);
    const cells = rows.map(([ic, t, d]) => `<div style="flex:1 1 0;min-width:0"><div style="width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-size:21px;background:${col(p.accent, '#6c8cff')}33;margin-bottom:10px">${esc(ic)}</div><div style="font-weight:700;font-size:16px;margin-bottom:4px">${esc(t)}</div><div style="opacity:.7;font-size:13.5px;line-height:1.5">${esc(d)}</div></div>`).join('');
    return `<div style="${BOX}${SANS}display:flex;gap:28px;color:${col(p.color, '#e7e9ee')};overflow:hidden">${cells}</div>`;
  },
});

U({
  type: 'steps', label: 'Steps', icon: '①', w: 640, h: 120,
  props: { items: 'Sign up | Create your free account\nBuild | Design pages or game scenes\nPublish | Share it with the world', direction: 'horizontal', color: '#e7e9ee', accent: '#6c8cff' },
  schema: [{ key: 'items', label: 'Steps (title | description, one per line)', type: 'textarea' }, { key: 'direction', label: 'Direction', type: 'select', options: ['horizontal', 'vertical'] }, C('color', 'Text color'), C('accent', 'Accent')],
  html: (i) => {
    const p = i.props, rows = lines(p.items).slice(0, 8).map(parts), v = p.direction === 'vertical', a = col(p.accent, '#6c8cff');
    const one = ([t, d], n) => `<div style="flex:1 1 0;min-width:0;display:flex;gap:12px;align-items:flex-start"><div style="flex:none;width:30px;height:30px;border-radius:50%;background:${a};color:#fff;display:grid;place-items:center;font-weight:800;font-size:14px">${n + 1}</div><div><div style="font-weight:700;font-size:15px">${esc(t)}</div><div style="opacity:.7;font-size:13px;line-height:1.45;margin-top:2px">${esc(d)}</div></div></div>`;
    return `<div style="${BOX}${SANS}display:flex;flex-direction:${v ? 'column' : 'row'};gap:${v ? 16 : 24}px;color:${col(p.color, '#e7e9ee')};overflow:hidden">${rows.map(one).join('')}</div>`;
  },
});

U({
  type: 'faq', label: 'FAQ accordion', icon: '❓', w: 560, h: 260,
  props: { items: 'Is it free? | Yes. The core app is free to use.\nDoes it work offline? | Yes. The desktop app runs fully on your computer.\nCan I export my work? | Yes: web pages, games and store packages.', bg: '#1a1d24', color: '#e7e9ee', accent: '#6c8cff', radius: 12 },
  schema: [{ key: 'items', label: 'Questions (question | answer, one per line)', type: 'textarea' }, C('bg', 'Background'), C('color', 'Text color'), C('accent', 'Accent'), N('radius', 'Corner radius', 0, 40)],
  html: (i, ex) => {
    const p = i.props, rows = lines(p.items).slice(0, 12).map(parts), a = col(p.accent, '#6c8cff');
    const qa = rows.map(([q, ans], n) => `<details ${!ex && n === 0 ? 'open' : ''} style="border-top:${n ? 1 : 0}px solid #ffffff1c;padding:12px 4px"><summary style="cursor:pointer;font-weight:600;font-size:15px;list-style:none;display:flex;justify-content:space-between;gap:12px">${esc(q)}<span style="color:${a}">＋</span></summary><div style="opacity:.75;font-size:14px;line-height:1.55;margin-top:8px">${esc(ans)}</div></details>`).join('');
    return `<div style="${BOX}${SANS}background:${col(p.bg, '#1a1d24')};color:${col(p.color, '#e7e9ee')};border-radius:${num(p.radius, 12, 0, 40)}px;padding:8px 18px;overflow:auto">${qa}</div>`;
  },
});

U({
  type: 'countdown', label: 'Countdown', icon: '⏳', w: 420, h: 96,
  props: { target: '2027-01-01T00:00', label: 'Launch in', bg: '#14161b', color: '#ffffff', accent: '#6c8cff', done: 'We are live!' },
  schema: [T('target', 'Date and time (YYYY-MM-DDTHH:MM)'), T('label', 'Label'), T('done', 'Text when finished'), C('bg', 'Background'), C('color', 'Text color'), C('accent', 'Accent')],
  html: (i, ex) => {
    const p = i.props, a = col(p.accent, '#6c8cff'), id = 'cd' + String(i.id || '').replace(/[^a-z0-9]/gi, '');
    const cell = (k, v) => `<div style="text-align:center;min-width:54px"><div data-k="${k}" style="font-size:30px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1">${v}</div><div style="font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;opacity:.6;margin-top:4px">${{ d: 'days', h: 'hours', m: 'mins', s: 'secs' }[k]}</div></div>`;
    const body = `<div style="${BOX}${SANS}background:${col(p.bg, '#14161b')};color:${col(p.color, '#fff')};border:1px solid ${a}55;border-radius:14px;display:flex;align-items:center;justify-content:center;gap:18px;padding:0 18px;overflow:hidden"><div style="font-weight:700;font-size:14px;color:${a};max-width:90px;line-height:1.2">${esc(p.label)}</div><div id="${id}" style="display:flex;gap:10px">${cell('d', '00')}${cell('h', '00')}${cell('m', '00')}${cell('s', '00')}</div></div>`;
    if (!ex) return body;
    const t = new Date(String(p.target)).getTime();
    return body + `<script>(function(){var e=document.getElementById(${JSON.stringify(id)}),t=${Number.isFinite(t) ? t : 0},msg=${JSON.stringify(String(p.done || ''))};function z(n){return(n<10?'0':'')+n}function tick(){var s=Math.max(0,Math.floor((t-Date.now())/1000));if(!t||s===0&&t<=Date.now()){e.textContent=msg;return}var v={d:Math.floor(s/86400),h:Math.floor(s%86400/3600),m:Math.floor(s%3600/60),s:s%60};for(var k in v){var n=e.querySelector('[data-k='+k+']');if(n)n.textContent=z(v[k])}setTimeout(tick,1000)}tick()})()<\/script>`;
  },
});

U({
  type: 'chip', label: 'Status chip', icon: '🏷', w: 110, h: 30,
  props: { text: 'Active', kind: 'success', variant: 'soft', dot: 'yes' },
  schema: [T('text', 'Text'), { key: 'kind', label: 'Kind', type: 'select', options: ['success', 'warning', 'error', 'info', 'neutral'] }, { key: 'variant', label: 'Style', type: 'select', options: ['soft', 'solid', 'outline'] }, { key: 'dot', label: 'Dot', type: 'select', options: ['yes', 'no'] }],
  html: (i) => {
    const p = i.props, c = { success: '#4cc38a', warning: '#f5c451', error: '#ef5b5b', info: '#6c8cff', neutral: '#9aa3b5' }[p.kind] || '#9aa3b5';
    const st = p.variant === 'solid' ? `background:${c};color:#0b1020;border:1px solid ${c}` : p.variant === 'outline' ? `background:transparent;color:${c};border:1px solid ${c}` : `background:${c}26;color:${c};border:1px solid ${c}40`;
    return `<div style="${BOX}${SANS}${st};border-radius:999px;display:flex;align-items:center;justify-content:center;gap:7px;font-size:12.5px;font-weight:700;letter-spacing:.02em;white-space:nowrap;overflow:hidden">${p.dot === 'yes' ? `<span style="width:7px;height:7px;border-radius:50%;background:currentColor"></span>` : ''}${esc(p.text)}</div>`;
  },
});

/* ------------------------------------------------------------------------------------------------------------------ */
/* Game objects. draw() and build() are copied into exported games as text, so each is fully self-contained.            */
/* ------------------------------------------------------------------------------------------------------------------ */
const ANIM = { key: 'spin', label: 'Spin (degrees per second)', type: 'number', min: -720, max: 720, step: 15 };

forge.game.registerObjectType({
  type: 'star', label: 'Star', icon: '⭐', dim: '2d', category: 'Plugins', w: 64, h: 64, color: '#ffd54a',
  props: { points: 5, inner: 0.45, spin: 0, glow: 0.5, outline: '#b8860b', outlineWidth: 2, pulse: 0 },
  schema: [{ key: 'points', label: 'Points', type: 'number', min: 3, max: 12 }, { key: 'inner', label: 'Inner radius (0.1 – 0.9)', type: 'number', min: 0.1, max: 0.9, step: 0.05 }, ANIM,
    { key: 'pulse', label: 'Pulse (0 = off, 1 = on)', type: 'number', min: 0, max: 1, step: 1 }, { key: 'glow', label: 'Glow (0 – 1)', type: 'number', min: 0, max: 1, step: 0.1 },
    { key: 'outline', label: 'Outline color', type: 'color' }, { key: 'outlineWidth', label: 'Outline width', type: 'number', min: 0, max: 12 }],
  draw(ctx, o, env) {
    const p = o.props || {}, t = (env && env.time) || 0, c = o.color || '#ffd54a';
    const n = Math.max(3, Math.min(12, Math.round(p.points || 5))), r = Math.min(o.w, o.h) / 2 * (p.pulse ? 1 + Math.sin(t * 4) * 0.06 : 1);
    const r2 = r * Math.min(0.9, Math.max(0.1, p.inner || 0.45));
    ctx.save(); ctx.rotate(((p.spin || 0) * t * Math.PI) / 180);
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = (i * Math.PI) / n - Math.PI / 2, rr = i % 2 ? r2 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.lineJoin = 'round';
    if (p.glow > 0) { ctx.shadowColor = c; ctx.shadowBlur = r * 0.9 * p.glow; }
    ctx.fillStyle = c; ctx.fill(); ctx.shadowBlur = 0;
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.05, 0, 0, r); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.18)');
    ctx.fillStyle = g; ctx.fill();
    if (p.outlineWidth > 0) { ctx.strokeStyle = p.outline || '#b8860b'; ctx.lineWidth = p.outlineWidth; ctx.stroke(); }
    ctx.restore();
  },
});

forge.game.registerObjectType({
  type: 'coin', label: 'Coin', icon: '🪙', dim: '2d', category: 'Plugins', w: 44, h: 44, color: '#ffc83d',
  props: { symbol: '$', flip: 1, rim: '#c98a00', shine: 1 },
  schema: [{ key: 'symbol', label: 'Symbol', type: 'text' }, { key: 'flip', label: 'Flip speed (0 = still)', type: 'number', min: 0, max: 8, step: 0.5 }, { key: 'rim', label: 'Rim color', type: 'color' }, { key: 'shine', label: 'Shine (0 = off, 1 = on)', type: 'number', min: 0, max: 1, step: 1 }],
  draw(ctx, o, env) {
    const p = o.props || {}, t = (env && env.time) || 0, c = o.color || '#ffc83d', r = Math.min(o.w, o.h) / 2;
    const sx = p.flip > 0 ? Math.max(0.1, Math.abs(Math.cos(t * p.flip * 2))) : 1;
    ctx.save(); ctx.scale(sx, 1);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = p.rim || '#c98a00'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    const g = ctx.createLinearGradient(-r, -r, r, r); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.45, c); g.addColorStop(1, p.rim || '#c98a00');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.06); ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.stroke();
    if (sx > 0.35 && p.symbol) { ctx.fillStyle = p.rim || '#c98a00'; ctx.font = '800 ' + Math.round(r * 1.05) + 'px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.symbol).slice(0, 2), 0, r * 0.04); }
    if (p.shine) { const k = ((t * 0.6) % 2) - 0.5; ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2); ctx.clip(); ctx.rotate(-0.6); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(k * r * 2 - r, -r * 2, r * 0.28, r * 4); ctx.restore(); }
    ctx.restore();
  },
});

forge.game.registerObjectType({
  type: 'heart', label: 'Heart', icon: '❤️', dim: '2d', category: 'Plugins', w: 48, h: 44, color: '#ff4d6d',
  props: { pulse: 1, glow: 0.4, outline: '#a3112f', outlineWidth: 2, fill: 1 },
  schema: [{ key: 'pulse', label: 'Heartbeat (0 = off, 1 = on)', type: 'number', min: 0, max: 1, step: 1 }, { key: 'fill', label: 'Fill (0 = empty, 1 = full)', type: 'number', min: 0, max: 1, step: 0.05 }, { key: 'glow', label: 'Glow (0 – 1)', type: 'number', min: 0, max: 1, step: 0.1 },
    { key: 'outline', label: 'Outline color', type: 'color' }, { key: 'outlineWidth', label: 'Outline width', type: 'number', min: 0, max: 10 }],
  draw(ctx, o, env) {
    const p = o.props || {}, t = (env && env.time) || 0, c = o.color || '#ff4d6d', w = o.w / 2, h = o.h / 2;
    const k = p.pulse ? 1 + Math.max(0, Math.sin(t * 6)) * Math.max(0, Math.sin(t * 6)) * 0.1 : 1;
    ctx.save(); ctx.scale(k, k);
    ctx.beginPath(); ctx.moveTo(0, h * 0.9);
    ctx.bezierCurveTo(-w * 1.25, h * 0.1, -w * 0.95, -h * 1.05, 0, -h * 0.35);
    ctx.bezierCurveTo(w * 0.95, -h * 1.05, w * 1.25, h * 0.1, 0, h * 0.9); ctx.closePath();
    ctx.lineJoin = 'round';
    if (p.glow > 0) { ctx.shadowColor = c; ctx.shadowBlur = Math.min(w, h) * 0.9 * p.glow; }
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill(); ctx.shadowBlur = 0;
    ctx.save(); ctx.clip();
    const f = Math.max(0, Math.min(1, p.fill == null ? 1 : p.fill)); ctx.fillStyle = c; ctx.fillRect(-w * 1.4, h * 0.9 - (h * 1.9) * f, w * 2.8, h * 2);
    const g = ctx.createLinearGradient(0, -h, 0, h); g.addColorStop(0, 'rgba(255,255,255,.4)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(-w * 1.4, -h * 1.2, w * 2.8, h * 2.4);
    ctx.restore();
    if (p.outlineWidth > 0) { ctx.strokeStyle = p.outline || '#a3112f'; ctx.lineWidth = p.outlineWidth; ctx.stroke(); }
    ctx.restore();
  },
});

forge.game.registerObjectType({
  type: 'crystal', label: 'Crystal', icon: '💎', dim: '3d', category: 'Plugins', w: 1, h: 1.4, d: 1, color: '#6cf0ff',
  props: { glow: 0.35, facets: 1, wire: 1 },
  schema: [{ key: 'glow', label: 'Glow (0 – 1)', type: 'number', min: 0, max: 1, step: 0.05 }, { key: 'facets', label: 'Detail (1 = sharp, 2 = rounder)', type: 'number', min: 1, max: 2, step: 1 }, { key: 'wire', label: 'Edge lines (0 = off, 1 = on)', type: 'number', min: 0, max: 1, step: 1 }],
  build(THREE, o) {
    const p = o.props || {}, c = new THREE.Color(o.color || '#6cf0ff');
    const geo = new THREE.OctahedronGeometry(0.5, p.facets >= 2 ? 1 : 0);
    const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: Math.max(0, p.glow == null ? 0.35 : p.glow), roughness: 0.12, metalness: 0.3, flatShading: true, transparent: true, opacity: 0.93 });
    const m = new THREE.Mesh(geo, mat); m.baseMat = mat; m.userData.baseMat = mat; m.castShadow = true;
    const g = new THREE.Group(); g.add(m);
    if (p.wire) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })); g.add(e); }
    return g;
  },
});

forge.game.registerObjectType({
  type: 'orb', label: 'Orb', icon: '🔮', dim: '3d', category: 'Plugins', w: 1, h: 1, d: 1, color: '#9b7bff',
  props: { glow: 1, halo: 1, light: 1, lightRange: 6 },
  schema: [{ key: 'glow', label: 'Glow (0 – 2)', type: 'number', min: 0, max: 2, step: 0.1 }, { key: 'halo', label: 'Halo (0 = off, 1 = on)', type: 'number', min: 0, max: 1, step: 1 }, { key: 'light', label: 'Casts light (0 = off, 1 = on)', type: 'number', min: 0, max: 1, step: 1 }, { key: 'lightRange', label: 'Light range', type: 'number', min: 1, max: 30, step: 1 }],
  build(THREE, o) {
    const p = o.props || {}, c = new THREE.Color(o.color || '#9b7bff');
    const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: Math.max(0, p.glow == null ? 1 : p.glow), roughness: 0.25, metalness: 0.05 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.4, 32, 24), mat); core.baseMat = mat; core.userData.baseMat = mat;
    const g = new THREE.Group(); g.add(core);
    if (p.halo) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, side: THREE.BackSide, depthWrite: false })); g.add(h); }
    if (p.light) g.add(new THREE.PointLight(c, Math.max(0, p.glow == null ? 1 : p.glow) * 1.2, Math.max(1, p.lightRange || 6)));
    return g;
  },
});

forge.game.registerObjectType({
  type: 'portal', label: 'Portal ring', icon: '🌀', dim: '3d', category: 'Plugins', w: 2, h: 2, d: 0.3, color: '#34e1c5',
  props: { glow: 1, thickness: 0.08, disc: 1 },
  schema: [{ key: 'glow', label: 'Glow (0 – 2)', type: 'number', min: 0, max: 2, step: 0.1 }, { key: 'thickness', label: 'Ring thickness', type: 'number', min: 0.02, max: 0.25, step: 0.01 }, { key: 'disc', label: 'Energy disc (0 = off, 1 = on)', type: 'number', min: 0, max: 1, step: 1 }],
  build(THREE, o) {
    const p = o.props || {}, c = new THREE.Color(o.color || '#34e1c5'), th = Math.min(0.25, Math.max(0.02, p.thickness || 0.08));
    const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: Math.max(0, p.glow == null ? 1 : p.glow), roughness: 0.3, metalness: 0.6 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5 - th, th, 20, 64), mat); ring.baseMat = mat; ring.userData.baseMat = mat; ring.castShadow = true;
    const g = new THREE.Group(); g.add(ring);
    if (p.disc) g.add(new THREE.Mesh(new THREE.CircleGeometry(0.5 - th * 1.6, 48), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })));
    return g;
  },
});
