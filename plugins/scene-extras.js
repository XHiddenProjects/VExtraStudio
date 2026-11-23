/** @vx-plugin {"id":"scene-extras","name":"Game Extras","version":"2.1.0","description":"Ready-made game objects: 2D Star, Coin, Heart and 3D Crystal, Orb, Portal ring."} */
/** @vx-docs
 * ## Game Extras
 * A small, production-quality pack of game objects. Everything is themeable from the Properties panel and works in exported games.
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
 * Read the source with **Plugins → Game Extras → Open source**. `vx.game.registerObjectType(def)` takes `draw(ctx, o, env)` for 2D or `build(THREE, o)` for 3D.
 * `draw` and `build` are copied into exported games as text, so they must be self-contained (no outside variables).
 */

/* ------------------------------------------------------------------------------------------------------------------ */
/* Game objects. draw() and build() are copied into exported games as text, so each is fully self-contained.            */
/* ------------------------------------------------------------------------------------------------------------------ */
const ANIM = { key: 'spin', label: 'Spin (degrees per second)', type: 'number', min: -720, max: 720, step: 15 };

vx.game.registerObjectType({
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

vx.game.registerObjectType({
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

vx.game.registerObjectType({
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

vx.game.registerObjectType({
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

vx.game.registerObjectType({
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

vx.game.registerObjectType({
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
