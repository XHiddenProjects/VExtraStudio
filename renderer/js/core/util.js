/* Vextra Studio – shared helpers. Everything lives under the global `VX` namespace. */
(function () {
  const VX = (window.VX = window.VX || {});

  /** Tiny hyperscript: h('div', {class:'x', onclick: fn}, child, 'text', [more]) */
  VX.h = function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return e;
  };
  VX.$ = (s, r = document) => r.querySelector(s);
  VX.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  VX.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  VX.uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);
  VX.clone = (o) => JSON.parse(JSON.stringify(o));
  VX.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  VX.debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  VX.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* paths (work for both / and \ separators) */
  VX.path = {
    base: (p) => String(p).split(/[\\/]/).pop(),
    dir: (p) => String(p).replace(/[\\/][^\\/]*$/, ''),
    sep: (p) => (String(p).includes('\\') ? '\\' : '/'),
    join: (a, b) => String(a).replace(/[\\/]$/, '') + (String(a).includes('\\') ? '\\' : '/') + String(b).replace(/^[\\/]/, ''),
    ext: (p) => { const m = /\.([^.\\/]+)$/.exec(String(p)); return m ? m[1].toLowerCase() : ''; },
    stem: (p) => VX.path.base(p).replace(/\.[^.]+$/, ''),
    norm: (p) => String(p).replace(/\\/g, '/'),
    rel: (root, p) => { const r = VX.path.norm(root).replace(/\/$/, ''), q = VX.path.norm(p); return q.startsWith(r + '/') ? q.slice(r.length + 1) : q; },
    resolve(from, rel) { // resolve a relative URL against a file path
      const parts = VX.path.norm(from).split('/'); parts.pop();
      for (const seg of String(rel).split('/')) { if (seg === '..') parts.pop(); else if (seg && seg !== '.') parts.push(seg); }
      return parts.join('/');
    },
  };

  /* mime / data-url helpers */
  VX.mime = (name) => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', json: 'application/json', html: 'text/html', css: 'text/css', js: 'text/javascript', mp4: 'video/mp4', webm: 'video/webm' }[VX.path.ext(name)] || 'application/octet-stream');
  VX.readFileAsDataURL = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  VX.readFileAsText = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file); });
  VX.pickBrowserFile = (accept, multiple) => new Promise((resolve) => {
    const i = document.createElement('input'); i.type = 'file'; if (accept) i.accept = accept; i.multiple = !!multiple;
    i.onchange = () => resolve([...i.files]); i.oncancel = () => resolve([]); i.click();
  });
  VX.download = (name, text, type = 'text/plain') => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  /* tiny event bus */
  const L = {};
  VX.on = (ev, cb) => { (L[ev] ||= new Set()).add(cb); return () => L[ev].delete(cb); };
  VX.emit = (ev, ...a) => { for (const cb of [...(L[ev] || [])]) { try { cb(...a); } catch (e) { console.error('[vx] listener', ev, e); } } };

  /* SVG icon set (stroke icons, 24px grid) */
  const P = {
    files: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    create: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
    game: '<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r=".9"/><circle cx="18" cy="13.5" r=".9"/>',
    cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12v9M12 12 4 7.5M12 12l8-4.5"/>',
    docs: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M8 8h6M8 11.5h6M8 15h3"/>',
    plugin: '<path d="M10 3h4v3a2 2 0 0 0 2 2h3v4h-3a2 2 0 0 0-2 2v3h-4v-3a2 2 0 0 0-2-2H5V8h3a2 2 0 0 0 2-2z"/>',
    theme: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-3.9-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5 3.75 3.75 0 0 1 17.5 18z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>',
    blocks: '<rect x="3" y="4" width="8" height="6" rx="1.5"/><rect x="13" y="14" width="8" height="6" rx="1.5"/><path d="M11 7h3a2 2 0 0 1 2 2v5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
    sound: '<path d="M4 10v4h3l5 4V6L7 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
    rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    scale: '<path d="M4 20 20 4M4 20v-6M4 20h6M20 4v6M20 4h-6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    bolt: '<path d="m13 3-8 11h6l-1 7 8-11h-6z"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    tablet: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>',
    brush: '<path d="M18 3 9 12l3 3 9-9z"/><path d="M9 12c-3 0-5 2-5 5 0 1.7-1 3-1 3s4 1 6 0c2-1 3-2.5 3-5"/>',
    wand: '<path d="m4 20 11-11M15 9l-1-3 3 1 3-1-1 3 1 3-3-1-3 1z"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
    warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v5M12 17.5v.01"/>',
  };
  VX.icon = (name, size) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ico'); if (size) { s.style.width = s.style.height = size + 'px'; } s.innerHTML = P[name] || P.file; return s; };
  VX.iconHTML = (name) => `<svg class="ico" viewBox="0 0 24 24">${P[name] || P.file}</svg>`;
})();
