/* Vextra game editor – export a project as one self-contained HTML file. */
(function () {
  const RT_FILES = ['rt-tts', 'rt-anticheat', 'rt-core', 'rt-input', 'rt-menu', 'rt-physics', 'rt-render2d', 'rt-render3d', 'rt-fx', 'rt-realism', 'rt-sensors', 'rt-clips', 'rt-graph', 'rt-services', 'blocks-triggers', 'blocks-logic', 'blocks-components', 'blocks-properties', 'blocks-text', 'blocks-flow', 'blocks-sensors', 'blocks-bluetooth'];
  const cache = {};
  async function src(url) { if (cache[url]) return cache[url]; const r = await fetch(url); if (!r.ok) throw new Error('Could not load ' + url + ' (' + r.status + ')'); return (cache[url] = await r.text()); }
  const lit = (v) => VX.jsLit(v);
  const safeScript = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fnSrc = (f) => { let s = Function.prototype.toString.call(f); if (/^(async\s+)?[A-Za-z_$][\w$]*\s*\(/.test(s) && !/^(async\s+)?function\b/.test(s)) s = s.replace(/^(async\s+)?([A-Za-z_$][\w$]*)\s*\(/, '$1function $2('); return s; };

  /** Serialise plugin-added blocks and object types so exported games keep working. */
  function collectCustom() {
    const customBlocks = [], customTypes = [], warn = [];
    for (const b of Object.values(VXRT.blocks || {})) {
      if (!b.plugin) continue; const def = {}, fns = {};
      for (const [k, v] of Object.entries(b)) { if (typeof v === 'function') fns[k] = fnSrc(v); else { try { JSON.stringify(v); def[k] = v; } catch { /* skip */ } } }
      customBlocks.push({ id: b.id, def, fns });
    }
    for (const t of Object.values(VXRT.objectTypes || {})) { if (!t || !(t.draw || t.build)) continue; customTypes.push({ type: t.type, draw: t.draw ? fnSrc(t.draw) : '', build: t.build ? fnSrc(t.build) : '' }); }
    return { customBlocks, customTypes, warn };
  }

  /** Builds the page, then lets plugins (e.g. Vextra Shield) transform it: hook "game.export.html". ctx.play = editor preview, ctx.publish = cloud publish. */
  async function toHTML(project, opts = {}) { const html = await build(project, opts); return VX.hooks.filter('game.export.html', html, { play: !!opts.channel, publish: !!opts.cloudUrl, project }); }
  async function build(project, opts = {}) {
    const data = VX.clone(project); const c = collectCustom(); if (c.customBlocks.length) data.customBlocks = c.customBlocks; if (c.customTypes.length) data.customTypes = c.customTypes;
    data.settings = Object.assign({}, data.settings, opts.cloudUrl ? { cloudUrl: opts.cloudUrl } : {});
    if (data.settings.antiCheat && data.settings.antiCheat.enabled && window.VXRT && VXRT.dataFingerprint) data.settings.antiCheat = Object.assign({}, data.settings.antiCheat, { dataHash: VXRT.dataFingerprint(data) }); /* anti-cheat: lets the game notice edited data */
    const has3d = data.scenes.some((s) => s.dim === '3d'); const base = opts.base || '';
    const scripts = []; for (const f of RT_FILES) scripts.push(`/* ${f} */\n` + safeScript(await src(base + 'js/game/' + f + '.js')));
    let threeSrc = ''; if (has3d) threeSrc = await src(base + 'vendor/three/three.module.min.js');
    /* models: the glTF toolkit (skeletons, animation, Meshopt) is embedded only when a model exists; the Draco decoder only when a model is Draco-compressed */
    const models = has3d ? Object.values((data.assets && data.assets.models) || {}).filter((m) => m && (m.kind === 'glb' || m.kind === 'gltf')) : [];
    const exts = models.map((m) => window.VXRT && VXRT.glbExtensions ? VXRT.glbExtensions(m) : { draco: false });
    let kitSrc = '', dracoLit = ''; if (models.length) { kitSrc = await src(base + 'vendor/three/gltf-kit.min.js'); if (exts.some((e) => e.draco)) { const js = await src(base + 'vendor/three/draco/draco_wasm_wrapper.js'); const r = await fetch(base + 'vendor/three/draco/draco_decoder.wasm'); if (!r.ok) throw new Error('Could not load the Draco decoder (' + r.status + ')'); const u8 = new Uint8Array(await r.arrayBuffer()); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); dracoLit = lit({ js, wasm: btoa(bin) }); } }
    const title = esc(data.settings.title || 'Vextra game'); const json = lit(data);
    const bg = esc(data.settings.bg || '#10131a'); const LD = VX.gameLoader.build(data, { channel: opts.channel });
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="generator" content="Vextra Studio"><title>${title}</title>
<style>html,body{margin:0;height:100%;background:${bg};overflow:hidden;overscroll-behavior:none}#vx-game{position:fixed;inset:0;width:100%;height:100%}${LD.css}</style><script>${LD.script}</script></head>
<body><div id="vx-game"></div>${LD.html}
<script>window.VXRT = window.VXRT || {};${opts.channel ? `window.__VX_CH = ${VX.jsLit({ token: String(opts.channel.token), origin: String(opts.channel.origin) })};${opts.live ? 'window.__VX_LIVE = true;' : ''}` : ''}${opts.cloudUrl ? `window.VX_CLOUD = { url: ${VX.jsLit(opts.cloudUrl)} };` : ''}</script>
<script type="module">
const DATA = ${json};
${has3d ? `const THREE_SRC = ${lit(threeSrc)};
const url = URL.createObjectURL(new Blob([THREE_SRC], { type: 'text/javascript' }));
window.THREE = await import(url);${kitSrc ? `
(0, eval)(${lit(kitSrc)});` : ''}${dracoLit ? `
window.VXDRACO = ${dracoLit};` : ''}` : ''}
const RT = ${lit(scripts.join("\n;\n"))};
(0, eval)(RT);
const VXL = window.__vxl;
try {
  VXL.set(0.3);
  const g = new VXRT.Game(DATA, { host: window.parent !== window, channel: window.__VX_CH || null });
  window.__vxGame = g; VXL.set(0.5);
  /* decode every sprite frame first, so the game starts with its pictures ready */
  const pics = []; for (const sp of Object.values((DATA.assets && DATA.assets.sprites) || {})) for (const f of (sp.frames || [])) if (typeof f === 'string' && f.indexOf('data:image/') === 0) pics.push(f);
  let done = 0; await Promise.all(pics.map((src) => new Promise((res) => { const im = new Image(); im.onload = im.onerror = () => { done++; VXL.set(0.5 + 0.4 * done / pics.length); res(); }; im.src = src; })));
  if (window.VXGLTF && VXRT.preloadModels) { try { await VXRT.preloadModels(DATA.assets); } catch (e) { console.warn(e); } }
  await VXL.finish();
  g.start(document.getElementById('vx-game'), { hold: true }); await VXL.hide(); g.release();
  window.addEventListener('error', (e) => g.log('error', e.message));
  window.addEventListener('unhandledrejection', (e) => g.log('error', String(e.reason && e.reason.message || e.reason)));
} catch (e) { VXL.fail('Could not start the game: ' + e.message); console.error(e); if (window.parent !== window) window.parent.postMessage({ vx: 'log', token: window.__VX_CH && window.__VX_CH.token, level: 'error', text: e.stack || e.message }, window.__VX_CH ? window.__VX_CH.origin : location.origin); }
</script></body></html>`;
  }

  /** Does the game use VR / AR blocks? -> { vr, ar } (reads the block types of every behaviour) */
  function xrKinds(project) {
    const reg = (window.VXRT && VXRT.blocks) || {}, vr = [], ar = []; for (const b of Object.values(reg)) { if (b && b.cat === 'vr') vr.push(b.id); if (b && b.cat === 'ar') ar.push(b.id); }
    const { assets, ...rest } = project; let t = ''; try { t = JSON.stringify(rest); } catch (e) { /* ignore */ }
    return { vr: vr.some((i) => t.includes('"type":"' + i + '"')), ar: ar.some((i) => t.includes('"type":"' + i + '"')) };
  }
  VX.gameExport = {
    xrKinds,
    toHTML,
    async download(project, name) { const html = await toHTML(project); const fname = (name || project.settings.title || 'game').replace(/[^\w.-]+/g, '_') + '.html'; VX.download(fname, html, 'text/html'); return fname; },
    async toFile(project, path) { const html = await toHTML(project); await native.writeFile(path, html); return path; },
  };
})();
