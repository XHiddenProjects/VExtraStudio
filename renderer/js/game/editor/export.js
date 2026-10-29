/* Vextra game editor – export a project as one self-contained HTML file. */
(function () {
  const RT_FILES = ['rt-core', 'rt-input', 'rt-physics', 'rt-render2d', 'rt-render3d', 'rt-graph', 'rt-services', 'blocks-triggers', 'blocks-logic', 'blocks-components', 'blocks-properties', 'blocks-text', 'blocks-flow'];
  const cache = {};
  async function src(url) { if (cache[url]) return cache[url]; const r = await fetch(url); if (!r.ok) throw new Error('Could not load ' + url + ' (' + r.status + ')'); return (cache[url] = await r.text()); }
  const lit = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
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

  async function toHTML(project, opts = {}) {
    const data = VX.clone(project); const c = collectCustom(); if (c.customBlocks.length) data.customBlocks = c.customBlocks; if (c.customTypes.length) data.customTypes = c.customTypes;
    data.settings = Object.assign({}, data.settings, opts.cloudUrl ? { cloudUrl: opts.cloudUrl } : {});
    const has3d = data.scenes.some((s) => s.dim === '3d'); const base = opts.base || '';
    const scripts = []; for (const f of RT_FILES) scripts.push(`/* ${f} */\n` + safeScript(await src(base + 'js/game/' + f + '.js')));
    let threeSrc = ''; if (has3d) threeSrc = await src(base + 'vendor/three/three.module.min.js');
    const title = esc(data.settings.title || 'Vextra game'); const json = lit(data);
    const bg = esc(data.settings.bg || '#10131a');
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="generator" content="Vextra Studio"><title>${title}</title>
<style>html,body{margin:0;height:100%;background:${bg};overflow:hidden;overscroll-behavior:none}#vx-game{position:fixed;inset:0;width:100%;height:100%}#vx-boot{position:fixed;inset:0;display:grid;place-items:center;color:#9aa3bd;font:14px system-ui,sans-serif}</style></head>
<body><div id="vx-game"></div><div id="vx-boot">Loading…</div>
<script>window.VXRT = window.VXRT || {};${opts.channel ? `window.__VX_CH = ${JSON.stringify({ token: String(opts.channel.token), origin: String(opts.channel.origin) })};` : ''}${opts.cloudUrl ? `window.VX_CLOUD = { url: ${JSON.stringify(opts.cloudUrl)} };` : ''}</script>
<script type="module">
const DATA = ${json};
${has3d ? `const THREE_SRC = ${lit(threeSrc)};
const url = URL.createObjectURL(new Blob([THREE_SRC], { type: 'text/javascript' }));
window.THREE = await import(url);` : ''}
const RT = ${lit(scripts.join("\n;\n"))};
(0, eval)(RT);
const boot = document.getElementById('vx-boot');
try {
  const g = new VXRT.Game(DATA, { host: window.parent !== window, channel: window.__VX_CH || null });
  window.__vxGame = g; g.start(document.getElementById('vx-game')); boot.remove();
  window.addEventListener('error', (e) => g.log('error', e.message));
  window.addEventListener('unhandledrejection', (e) => g.log('error', String(e.reason && e.reason.message || e.reason)));
} catch (e) { boot.textContent = 'Could not start the game: ' + e.message; console.error(e); if (window.parent !== window) window.parent.postMessage({ vx: 'log', token: window.__VX_CH && window.__VX_CH.token, level: 'error', text: e.stack || e.message }, window.__VX_CH ? window.__VX_CH.origin : location.origin); }
</script></body></html>`;
  }

  VX.gameExport = {
    toHTML,
    async download(project, name) { const html = await toHTML(project); const fname = (name || project.settings.title || 'game').replace(/[^\w.-]+/g, '_') + '.html'; VX.download(fname, html, 'text/html'); return fname; },
    async toFile(project, path) { const html = await toHTML(project); await native.writeFile(path, html); return path; },
  };
})();
