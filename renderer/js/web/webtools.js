/* Vextra Studio – web development tools: live preview with asset inlining, console capture and device frames. */
(function () {
  const { h } = VX;
  const S = VX.app.S;
  const Web = (VX.web = {});
  const DEVICES = [['fit', 'Responsive'], ['phone', 'Phone 390×844', 390, 844], ['phone-s', 'Small phone 360×640', 360, 640], ['tablet', 'Tablet 820×1180', 820, 1180], ['laptop', 'Laptop 1280×800', 1280, 800], ['desktop', 'Desktop 1920×1080', 1920, 1080]];

  const CAPTURE = `<script>(function(){var P=function(l,a){try{parent.postMessage({vx:'console',level:l,text:Array.prototype.map.call(a,function(x){if(x instanceof Error)return x.stack||x.message;if(typeof x==='object'){try{return JSON.stringify(x)}catch(e){return String(x)}}return String(x)}).join(' ')},'*')}catch(e){}};['log','info','warn','error','debug'].forEach(function(k){var o=console[k];console[k]=function(){P(k==='debug'?'info':k,arguments);o.apply(console,arguments)}});window.addEventListener('error',function(e){P('error',[e.message+(e.lineno?' ('+e.filename.split('/').pop()+':'+e.lineno+')':'')])});window.addEventListener('unhandledrejection',function(e){P('error',['Unhandled promise rejection: '+(e.reason&&e.reason.message||e.reason)])});})();<\/script>`;

  async function readText(path, tabs) { const t = tabs.find((x) => x.path === path && x.kind === 'code'); if (t) return VX.tabs.kinds.code.text(t); return window.native.readFile(path); }
  async function dataUrl(path) { const b64 = await window.native.readBase64(path); return `data:${VX.mime(path)};base64,${b64}`; }
  const isRel = (u) => u && !/^([a-z]+:|\/\/|#|data:|mailto:)/i.test(u);
  async function inlineCss(css, base) { const re = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g; const jobs = []; css.replace(re, (m, u) => { if (isRel(u)) jobs.push(u); return m; }); const map = {}; for (const u of new Set(jobs)) { try { map[u] = await dataUrl(VX.path.resolve(base, u.split(/[?#]/)[0])); } catch { /* leave */ } } return css.replace(re, (m, u) => (map[u] ? `url("${map[u]}")` : m)); }

  /** Build a self-contained srcdoc from an HTML file. */
  Web.buildHtml = async function (html, path) {
    const tabs = VX.tabs.list(); const base = path || (S.root ? VX.path.join(S.root, 'index.html') : '/index.html'); let out = html; const warnings = [];
    const rep = async (re, fn) => { const ms = [...out.matchAll(re)]; for (const m of ms) { try { out = out.replace(m[0], await fn(m)); } catch (e) { warnings.push(m[1] + ': ' + e.message); } } };
    await rep(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, async (m) => { const href = (m[0].match(/href=["']([^"']+)["']/i) || [])[1]; if (!isRel(href)) return m[0]; const p = VX.path.resolve(base, href.split(/[?#]/)[0]); const css = await inlineCss(await readText(p, tabs), p); return `<style data-src="${VX.esc(href)}">\n${css}\n</style>`; });
    await rep(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, async (m) => { if (!isRel(m[2])) return m[0]; const p = VX.path.resolve(base, m[2].split(/[?#]/)[0]); const js = (await readText(p, tabs)).replace(/<\/script/gi, '<\\/script'); const attrs = (m[1] + m[3]).replace(/\bsrc=["'][^"']*["']/i, ''); return `<script${attrs} data-src="${VX.esc(m[2])}">\n${js}\n</script>`; });
    await rep(/<(img|source|video|audio)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, async (m) => { if (!isRel(m[2])) return m[0]; return m[0].replace(m[2], await dataUrl(VX.path.resolve(base, m[2].split(/[?#]/)[0]))); });
    await rep(/<link\b[^>]*rel=["']?(?:icon|shortcut icon)["']?[^>]*>/gi, async () => '');
    out = out.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (m) => m); // inline <style> url()s are left alone
    out = /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (m) => m + CAPTURE) : CAPTURE + out;
    return { html: out, warnings };
  };
  Web.markdownPage = (md, title) => `<!doctype html><meta charset="utf-8"><title>${VX.esc(title || '')}</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 20px;color:#1d2129}pre{background:#f3f4f7;padding:12px;border-radius:8px;overflow:auto}code{background:#f3f4f7;padding:1px 5px;border-radius:4px}pre code{background:none;padding:0}blockquote{border-left:4px solid #cbd;margin:0;padding:0 14px;color:#556}table{border-collapse:collapse}td,th{border:1px solid #ccd;padding:5px 10px}img{max-width:100%}</style>${VX.markdown.render(md)}`;

  /** Open (or focus) a live-preview tab for a tab/file. */
  Web.openPreview = async function (src, device) {
    if (!src) return; if (src.kind === 'game' && src.ctl) return src.ctl.play(); if (src.kind === 'ui') return VX.ui.preview(src.ctl.toHTML(src.title), 'Preview – ' + src.title);
    const key = 'preview:' + (src.path || src.id); let t = VX.tabs.list().find((x) => x.key === key);
    if (t) { VX.tabs.activate(t.id); if (device) t.setDevice(device); return t; }
    const ext = VX.path.ext(src.path || src.title || ''); const frame = h('iframe', { class: 'pv-frame', sandbox: 'allow-scripts allow-forms allow-modals allow-popups allow-same-origin allow-pointer-lock' });
    const stage = h('div', { class: 'pv-stage' }, frame); const info = h('span', { class: 'tag' }, '');
    let dev = device || 'fit', landscape = false, zoom = 'auto'; const selDev = h('select', {}, DEVICES.map((d) => h('option', { value: d[0] }, d[1]))); selDev.value = dev;
    const apply = () => {
      const d = DEVICES.find((x) => x[0] === dev); frame.classList.toggle('dev', dev !== 'fit' && dev.startsWith('phone'));
      if (dev === 'fit') { frame.style.width = '100%'; frame.style.height = '100%'; frame.style.transform = ''; stage.style.padding = '0'; info.textContent = 'responsive'; return; }
      stage.style.padding = '14px'; let w = d[2], hh = d[3]; if (landscape) [w, hh] = [hh, w]; const avW = stage.clientWidth - 28, avH = stage.clientHeight - 28; const s = zoom === 'auto' ? Math.min(1, avW / w, avH / hh) : zoom; frame.style.width = w + 'px'; frame.style.height = hh + 'px'; frame.style.transform = `scale(${s})`; frame.style.transformOrigin = 'center'; frame.style.margin = `${-(hh - hh * s) / 2}px ${-(w - w * s) / 2}px`; info.textContent = `${w}×${hh} @ ${Math.round(s * 100)}%`;
    };
    selDev.onchange = () => { dev = selDev.value; apply(); };
    const bar = h('div', { class: 'pv-bar' }, h('button', { class: 'btn sm', title: 'Reload', onclick: () => t.refresh(true) }, VX.icon('refresh', 14)), selDev, h('button', { class: 'btn sm', title: 'Rotate', onclick: () => { landscape = !landscape; apply(); } }, VX.icon('rotate', 14)), info, h('span', { class: 'spacer' }), h('span', { class: 'tag' }, src.title), h('button', { class: 'btn sm', title: 'Open in your browser', onclick: () => Web.openExternal(src) }, VX.icon('globe', 14), 'Browser'));
    const container = h('div', { class: 'pv' }, bar, stage);
    let timer, token = 0;
    const refresh = async () => {
      const mine = ++token; const live = VX.tabs.list().find((x) => x.id === src.id || (src.path && x.path === src.path && x.kind === 'code'));
      let text = live && live.doc ? VX.tabs.kinds.code.text(live) : await window.native.readFile(src.path);
      let html; try { if (ext === 'md' || ext === 'markdown') html = Web.markdownPage(text, src.title); else if (ext === 'svg') html = `<!doctype html><body style="margin:0;display:grid;place-items:center;height:100vh;background:#fff">${text}`; else { const r = await Web.buildHtml(text, src.path); html = r.html; r.warnings.forEach((w) => VX.bottom.log('warn', 'Preview: could not inline ' + w, 'preview')); } } catch (e) { html = `<pre style="color:#c00;padding:20px">${VX.esc(e.message)}</pre>`; }
      if (mine === token) { frame.srcdoc = html; }
    };
    const queue = () => { clearTimeout(timer); timer = setTimeout(refresh, VX.app.settings.previewDelay || 400); };
    const offs = [VX.on('editorChange', (x) => { if (x && (x.id === src.id || x.path === src.path || /\.(css|js|json)$/i.test(x.path || ''))) queue(); }), VX.on('saved', () => queue())];
    const onMsg = (e) => { if (e.source === frame.contentWindow && e.data && e.data.vx === 'console') VX.bottom.log(e.data.level, e.data.text, 'preview'); }; addEventListener('message', onMsg);
    const ro = new ResizeObserver(apply); ro.observe(stage);
    t = await VX.tabs.open({ kind: 'preview', key, title: 'Preview: ' + src.title, icon: 'play', container, refresh: (force) => { force ? refresh() : (frame.srcdoc ? 0 : refresh()); apply(); }, setDevice: (d) => { dev = d; selDev.value = d; apply(); }, onClose: () => { offs.forEach((o) => o()); removeEventListener('message', onMsg); ro.disconnect(); } });
    VX.bottom.show('console'); refresh(); apply(); return t;
  };
  Web.openExternal = async function (src) {
    const live = VX.tabs.list().find((x) => x.path === src.path && x.kind === 'code'); const text = live && live.doc ? VX.tabs.kinds.code.text(live) : await window.native.readFile(src.path); const r = await Web.buildHtml(text, src.path);
    const html = r.html.replace(CAPTURE, ''); const url = URL.createObjectURL(new Blob([html], { type: 'text/html' })); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
})();
