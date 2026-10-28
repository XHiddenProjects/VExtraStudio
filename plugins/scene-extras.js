/** @forge-plugin {"id":"scene-extras","name":"Designer & Game Extras","version":"1.1.0","description":"Adds a Badge UI component and two game object types: a Star (2D) and a Crystal (3D)."} */
/** @forge-docs
 * ## Using Designer & Game Extras
 * This plugin is a compact example of the three places a plugin can add *things you drag onto a canvas*.
 *
 * ### UI designer
 * The **Badge** component appears in the Create panel (Controls) when a `.vxui` design is open.
 *
 * ### 2D game scenes
 * The **Star** object appears under *Plugins* when a 2D game is open. Its colour, number of points and spin are editable in the inspector.
 *
 * ### 3D game scenes
 * The **Crystal** object (an octahedron) appears under *Plugins* when a 3D game is open.
 *
 * ### How it works
 * Read the source with **Plugins → Designer & Game Extras → Open source**. `registerObjectType` takes a `draw(ctx, obj)` function for 2D or a `build(THREE, obj)` function for 3D.
 */
forge.designer.registerComponent('ui', {
  type: 'badge', label: 'Badge', icon: '🏷', w: 90, h: 28, category: 'Controls',
  props: { text: 'NEW', bg: '#4cc38a', color: '#06210f' },
  schema: [{ key: 'text', label: 'Text', type: 'text' }, { key: 'bg', label: 'Background', type: 'color' }, { key: 'color', label: 'Text color', type: 'color' }],
  html: (i) => `<div style="width:100%;height:100%;display:grid;place-items:center;border-radius:999px;background:${i.props.bg};color:${i.props.color};font:700 12px system-ui;letter-spacing:.06em">${i.props.text}</div>`,
});

forge.game.registerObjectType({
  type: 'star', label: 'Star', icon: '⭐', dim: '2d', category: 'Plugins', w: 64, h: 64, color: '#ffd54a',
  props: { points: 5, inner: 0.45 },
  schema: [{ key: 'points', label: 'Points', type: 'number', min: 3, max: 12 }, { key: 'inner', label: 'Inner radius', type: 'number', min: 0.1, max: 0.9, step: 0.05 }],
  draw(ctx, o) {
    const n = Math.max(3, Math.round(o.props.points || 5)), r = Math.min(o.w, o.h) / 2, r2 = r * (o.props.inner || 0.45);
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = (i * Math.PI) / n - Math.PI / 2, rr = i % 2 ? r2 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = o.color || '#ffd54a'; ctx.fill();
  },
});

forge.game.registerObjectType({
  type: 'crystal', label: 'Crystal', icon: '💎', dim: '3d', category: 'Plugins', w: 1, h: 1.4, d: 1, color: '#6cf0ff',
  props: {},
  schema: [],
  build(THREE, o) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshStandardMaterial({ color: o.color || '#6cf0ff', roughness: 0.15, metalness: 0.3, flatShading: true }));
    m.baseMat = m.material; m.userData.baseMat = m.material; m.castShadow = true;
    const g = new THREE.Group(); g.add(m); return g;
  },
});
