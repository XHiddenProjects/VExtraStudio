/* Vextra Studio – Website builder (.vxsite): drag blocks onto a page, design the database and the security, export a site you can host later.
 * The block catalogue and the generator are in js/web/sitegen.js (VXSite); the small server that is exported is js/web/site-server.tpl.js. */
(function () {
  const { h } = VX; const S = VXSite;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const GROUPS = ['Text', 'Media', 'Layout', 'Data', 'Members'];

  function create(text, opts) {
    opts = opts || {}; let site = S.normalize(text || S.blank(opts.name)); let pageId = site.pages[0].id, sel = null, tab = 'blocks', device = 'desktop', dataIdx = 0;
    const undo = [], redo = []; let snapTimer = null, lastSnap = JSON.stringify(site);
    const root = h('div', { class: 'sb' }); const left = h('div', { class: 'sb-left' }), mid = h('div', { class: 'sb-mid' }), right = h('div', { class: 'sb-right' });
    const canvasHost = h('div', { class: 'sb-canvas', 'data-device': 'desktop' }); const shadow = canvasHost.attachShadow({ mode: 'open' });
    mid.append(canvasHost); root.append(left, mid, right);
    const page = () => site.pages.find((p) => p.id === pageId) || site.pages[0];
    const changed = () => { opts.onChange && opts.onChange(); clearTimeout(snapTimer); snapTimer = setTimeout(snap, 400); };
    const snap = () => { const j = JSON.stringify(site); if (j !== lastSnap) { undo.push(lastSnap); if (undo.length > 100) undo.shift(); redo.length = 0; lastSnap = j; } };
    const restore = (j) => { site = S.normalize(j); lastSnap = JSON.stringify(site); if (!site.pages.some((p) => p.id === pageId)) pageId = site.pages[0].id; sel = null; renderAll(); opts.onChange && opts.onChange(); };
    const doUndo = () => { snap(); if (!undo.length) return; redo.push(JSON.stringify(site)); restore(undo.pop()); };
    const doRedo = () => { if (!redo.length) return; undo.push(JSON.stringify(site)); restore(redo.pop()); };

    /* ---------- tree helpers ---------- */
    const find = (id, list, parent) => { for (let i = 0; i < list.length; i++) { const b = list[i]; if (b.id === id) return { b, list, i }; for (const col of b.cols || []) { const r = find(id, col, b); if (r) return r; } } return null; };
    const colList = (id, n) => { const r = find(id, page().blocks); return r && r.b.cols ? r.b.cols[n] : null; };
    const inside = (anc, id) => { const r = find(anc, page().blocks); return !!(r && find(id, r.b.cols ? r.b.cols.flat() : [])); };
    function insertAt(target, block) { // target: {id, after} | {drop:'root'|'blockId:n'}
      let list, idx;
      if (target.id) { const r = find(target.id, page().blocks); if (!r) return; list = r.list; idx = r.i + (target.after ? 1 : 0); }
      else if (target.drop === 'root') { list = page().blocks; idx = list.length; }
      else { const [bid, n] = target.drop.split(':'); list = colList(bid, +n); idx = list ? list.length : 0; }
      if (!list) return; list.splice(idx, 0, block); sel = block.id;
    }

    /* ---------- canvas ---------- */
    const wrapBlock = (b, html) => {
      let inner = html; if (b.type === 'columns') { let n = 0; inner = html.replace(/<div class="vx-col">/g, () => `<div class="vx-col" data-drop="${b.id}:${n++}">`); }
      return `<div class="sbb${sel === b.id ? ' sel' : ''}" data-id="${b.id}" draggable="true"><span class="sbtag">${S.esc(S.BLOCKS[b.type].label)}</span>${inner}</div>`;
    };
    function renderCanvas() {
      const ctx = { site, editing: true }; const body = page().blocks.map((b) => S.blockHtml(b, ctx, wrapBlock)).join('');
      const nav = site.nav.show !== false ? `<header class="vx-nav"><nav class="in"><b>${S.esc(site.nav.brand)}</b>${site.pages.filter((p) => p.inNav).map((p) => `<a href="#" data-page="${p.id}"${p.id === pageId ? ' aria-current="page"' : ''}>${S.esc(p.title)}</a>`).join('')}${S.usesAuth(site) ? '<a href="#">Log in</a>' : ''}</nav></header>` : '';
      const css = S.css(site).replace(/:root\{/, ':host{').replace(/body\{/, '.sb-page{');
      shadow.innerHTML = `<style>${css}
:host{display:block}.sb-page{min-height:100%}.sbb{position:relative;outline:2px solid transparent;outline-offset:2px;border-radius:6px;cursor:default;margin:2px 0}.sbb:hover{outline-color:#2457d655}.sbb.sel{outline-color:#2457d6}
.sbtag{display:none;position:absolute;left:0;top:-2px;transform:translateY(-100%);background:#2457d6;color:#fff;font:600 11px system-ui;padding:1px 7px;border-radius:5px 5px 0 0;z-index:3}.sbb.sel>.sbtag{display:block}
.sbb.bf::before,.sbb.af::after{content:"";position:absolute;left:0;right:0;height:4px;background:#f5a623;border-radius:2px;z-index:4}.sbb.bf::before{top:-4px}.sbb.af::after{bottom:-4px}
.vx-col{min-height:64px;border:1px dashed #8884;border-radius:8px;padding:4px}.vx-col:empty::before{content:"Drop blocks here";display:block;text-align:center;opacity:.5;padding:18px 0;font:14px system-ui}.vx-col.over,.sb-main.over{background:#f5a62322}
.sb-main{min-height:240px}.sb-main:empty::before{content:"This page is empty – drag a block here, or click one in the list";display:block;text-align:center;opacity:.55;padding:70px 0;font:15px system-ui}
.vx-hp{display:none}.vx-form input,.vx-form textarea,.vx-form select,.vx-auth input,.vx-form button,.vx-auth button{pointer-events:none}</style><div class="sb-page">${nav}<main class="sb-main" data-drop="root">${body}</main>${site.nav.footer ? `<footer class="vx-foot">${S.esc(site.nav.footer)}</footer>` : ''}</div>`;
    }
    shadow.addEventListener('click', (e) => { const pa = e.composedPath().find((n) => n.dataset && n.dataset.page); if (pa) { e.preventDefault(); pageId = pa.dataset.page; sel = null; renderAll(); return; } e.preventDefault(); const bl = e.composedPath().find((n) => n.dataset && n.dataset.id); sel = bl ? bl.dataset.id : null; renderCanvas(); renderRight(); });
    /* drag and drop */
    const clearMarks = () => { for (const n of shadow.querySelectorAll('.bf,.af,.over')) n.classList.remove('bf', 'af', 'over'); };
    const hit = (e) => { const path = e.composedPath(); const bl = path.find((n) => n.dataset && n.dataset.id); const dz = path.find((n) => n.dataset && n.dataset.drop); if (bl && !(dz && dz.contains && bl.contains(dz) && bl !== dz && bl.dataset.id && dz.dataset.drop.split(':')[0] === bl.dataset.id && !path.slice(0, path.indexOf(dz)).some((n) => n.dataset && n.dataset.id))) { const r = bl.getBoundingClientRect(); return { el: bl, id: bl.dataset.id, after: e.clientY > r.top + r.height / 2 }; } return dz ? { el: dz, drop: dz.dataset.drop } : null; };
    shadow.addEventListener('dragstart', (e) => { const bl = e.composedPath().find((n) => n.dataset && n.dataset.id); if (!bl) return; e.dataTransfer.setData('text/vx-move', bl.dataset.id); e.dataTransfer.effectAllowed = 'move'; });
    shadow.addEventListener('dragover', (e) => { const t = hit(e); if (!t) return; e.preventDefault(); clearMarks(); t.id ? t.el.classList.add(t.after ? 'af' : 'bf') : t.el.classList.add('over'); });
    shadow.addEventListener('dragleave', (e) => { if (!e.relatedTarget) clearMarks(); });
    shadow.addEventListener('drop', (e) => { e.preventDefault(); const t = hit(e); clearMarks(); if (!t) return; dropOn(e.dataTransfer.getData('text/vx-new'), e.dataTransfer.getData('text/vx-move'), t.id ? { id: t.id, after: t.after } : { drop: t.drop }); });
    function dropOn(newType, moveId, target) {
      if (newType && S.BLOCKS[newType]) insertAt(target, S.newBlock(newType));
      else if (moveId) { const r = find(moveId, page().blocks); if (!r) return; if (target.id === moveId || (target.id && inside(moveId, target.id)) || (target.drop && target.drop.split(':')[0] === moveId)) return; const b = r.list.splice(r.i, 1)[0]; insertAt(target, b); }
      else return; changed(); renderAll();
    }
    root.addEventListener('keydown', (e) => { const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select') return; if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeSel(); } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); doRedo(); } else if (sel && (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))) { e.preventDefault(); move(sel, e.key === 'ArrowUp' ? -1 : 1); } });
    root.tabIndex = 0;
    function removeSel() { const r = find(sel, page().blocks); if (!r) return; r.list.splice(r.i, 1); sel = null; changed(); renderAll(); }
    function move(id, d) { const r = find(id, page().blocks); if (!r) return; const j = r.i + d; if (j < 0 || j >= r.list.length) return; [r.list[r.i], r.list[j]] = [r.list[j], r.list[r.i]]; changed(); renderAll(); VX.a11y && VX.a11y.announce && VX.a11y.announce('Moved'); }

    /* ---------- small form helpers ---------- */
    const lab = (t, el, hint) => h('label', { class: 'sb-f' }, h('span', {}, t), el, hint ? h('small', {}, hint) : null);
    const txt = (v, on, ph) => { const i = h('input', { type: 'text', value: v == null ? '' : v, placeholder: ph || '' }); i.addEventListener('input', () => on(i.value)); return i; };
    const area = (v, on) => { const i = h('textarea', { rows: 4 }); i.value = v == null ? '' : v; i.addEventListener('input', () => on(i.value)); return i; };
    const numIn = (v, on, min, max) => { const i = h('input', { type: 'number', value: v, min, max }); i.addEventListener('input', () => on(Number(i.value))); return i; };
    const selIn = (v, opts, on) => { const s = h('select', {}, opts.map((o) => { const [val, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: val }, l); })); s.value = String(v); s.addEventListener('change', () => on(s.value)); return s; };
    const chk = (v, on, label) => { const i = h('input', { type: 'checkbox' }); i.checked = !!v; i.addEventListener('change', () => on(i.checked)); return h('label', { class: 'sb-chk' }, i, ' ', label); };
    const colIn = (v, on) => { const i = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v) ? v : '#2457d6' }); i.addEventListener('input', () => on(i.value)); return i; };
    const live = (fn) => (v) => { fn(v); changed(); renderCanvas(); };       // inspector edits: only the canvas is redrawn so typing keeps focus

    /* ---------- right: inspector for the selected block ---------- */
    function renderRight() {
      right.textContent = ''; const r = sel && find(sel, page().blocks);
      if (!r) { right.append(h('div', { class: 'sb-hint' }, h('b', {}, 'Nothing selected'), h('p', {}, 'Click a block on the page to change its text, colours and links. Drag blocks to reorder them, or press Alt + ↑ / ↓.'), h('p', {}, 'Page: ', h('b', {}, page().title)))); return; }
      const b = r.b, d = S.BLOCKS[b.type]; right.append(h('h3', {}, d.label));
      right.append(h('div', { class: 'sb-row' }, h('button', { class: 'btn', title: 'Move up (Alt+↑)', onclick: () => move(b.id, -1) }, '↑'), h('button', { class: 'btn', title: 'Move down (Alt+↓)', onclick: () => move(b.id, 1) }, '↓'), h('button', { class: 'btn', onclick: () => { const c = clone(b); const fresh = (x) => { x.id = S.uid(); (x.cols || []).forEach((cc) => cc.forEach(fresh)); }; fresh(c); r.list.splice(r.i + 1, 0, c); sel = c.id; changed(); renderAll(); } }, 'Duplicate'), h('button', { class: 'btn danger', onclick: removeSel }, 'Delete')));
      for (const f of d.f) {
        let el; const set = live((v) => { b.p[f.k] = v; });
        if (f.t === 'text') { el = txt(b.p[f.k], set); if (f.pick === 'image') el = h('div', { class: 'sb-pick' }, el, h('button', { class: 'btn', onclick: () => pickImage((u) => { b.p[f.k] = u; changed(); renderAll(); }) }, 'Choose file…')); if (f.pickPage) el = h('div', { class: 'sb-pick' }, el, selIn('', [['', 'Link to a page…'], ...site.pages.map((p) => ['/' + (p.slug === 'home' ? '' : p.slug + '.html'), p.title])], (v) => { if (v !== '') { b.p[f.k] = v; changed(); renderAll(); } })); }
        else if (f.t === 'area') el = area(b.p[f.k], set);
        else if (f.t === 'num') el = numIn(b.p[f.k], set, f.min, f.max);
        else if (f.t === 'sel') el = selIn(b.p[f.k], f.opts, (v) => set(isNaN(+v) || v === '' ? v : +v));
        else if (f.t === 'color') el = colIn(b.p[f.k], set);
        else if (f.t === 'bool') el = chk(b.p[f.k], set, f.label);
        else if (f.t === 'coll') el = selIn(b.p[f.k] || '', [['', 'Choose…'], ...site.collections.map((c) => [c.name, c.label || c.name])], (v) => { set(v); renderRight(); });
        right.append(lab(f.label, el));
      }
      if (b.type === 'form' || b.type === 'list') right.append(h('button', { class: 'btn', onclick: () => { tab = 'data'; const i = site.collections.findIndex((c) => c.name === b.p.collection); if (i >= 0) dataIdx = i; renderAll(); } }, 'Edit this collection →'));
    }
    function pickImage(cb) {
      const i = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp' });
      i.addEventListener('change', () => { const f = i.files[0]; if (!f) return; if (f.size > 4e6) return VX.ui.toast('That picture is bigger than 4 MB – please shrink it first.', 'warn'); const fr = new FileReader(); fr.onload = () => cb(String(fr.result)); fr.readAsDataURL(f); }); i.click();
    }

    /* ---------- left: blocks / pages / data / site ---------- */
    function renderLeft() {
      left.textContent = ''; const tabs = h('div', { class: 'sb-tabs', role: 'tablist' }, [['blocks', 'Blocks'], ['pages', 'Pages'], ['data', 'Data'], ['site', 'Site']].map(([id, l]) => h('button', { role: 'tab', 'aria-selected': String(tab === id), class: tab === id ? 'on' : '', onclick: () => { tab = id; renderLeft(); } }, l))); left.append(tabs);
      const body = h('div', { class: 'sb-lbody' }); left.append(body);
      ({ blocks: paneBlocks, pages: panePages, data: paneData, site: paneSite })[tab](body);
    }
    function paneBlocks(body) {
      body.append(h('p', { class: 'sb-hint' }, 'Drag a block onto the page – or click it to add it at the end.'));
      for (const g of GROUPS) {
        const list = Object.entries(S.BLOCKS).filter(([, d]) => d.group === g); if (!list.length) continue;
        body.append(h('h4', {}, g), h('div', { class: 'sb-pal' }, list.map(([type, d]) => { const it = h('button', { class: 'sb-pi', draggable: 'true', title: d.label, onclick: () => { insertAt({ drop: 'root' }, S.newBlock(type)); changed(); renderAll(); } }, h('span', { class: 'ic' }, d.icon), h('span', {}, d.label)); it.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/vx-new', type); e.dataTransfer.effectAllowed = 'copy'; }); return it; })));
      }
    }
    function panePages(body) {
      body.append(h('div', { class: 'sb-row' }, h('button', { class: 'btn primary', onclick: () => { const n = site.pages.length + 1; let slug = 'page-' + n; while (site.pages.some((p) => p.slug === slug)) slug += 'x'; const p = { id: S.uid(), title: 'Page ' + n, slug, desc: '', access: 'public', inNav: true, blocks: [S.newBlock('heading')] }; site.pages.push(p); pageId = p.id; sel = null; changed(); renderAll(); } }, '＋ New page')));
      site.pages.forEach((p, i) => body.append(h('div', { class: 'sb-pg' + (p.id === pageId ? ' on' : '') }, h('button', { class: 'sb-pgn', onclick: () => { pageId = p.id; sel = null; renderAll(); } }, p.title, p.access === 'members' ? ' 🔒' : ''), h('button', { class: 'iconbtn', title: 'Move up', onclick: () => { if (i) { [site.pages[i - 1], site.pages[i]] = [site.pages[i], site.pages[i - 1]]; changed(); renderAll(); } } }, '↑'), h('button', { class: 'iconbtn', title: 'Move down', onclick: () => { if (i < site.pages.length - 1) { [site.pages[i + 1], site.pages[i]] = [site.pages[i], site.pages[i + 1]]; changed(); renderAll(); } } }, '↓'))));
      const p = page(); const set = (fn) => (v) => { fn(v); changed(); renderCanvas(); };
      body.append(h('h4', {}, 'This page'), lab('Title', txt(p.title, (v) => { p.title = v; changed(); renderCanvas(); }, 'Page title')), lab('Address', txt(p.slug, (v) => { p.slug = S.slugOf(v); changed(); }), p.slug === 'home' ? 'The page called “home” is your front page.' : 'Shows as /' + p.slug + '.html'), lab('Short description (for search engines)', txt(p.desc, (v) => { p.desc = v; changed(); })), lab('Who can open it', selIn(p.access, [['public', 'Everyone'], ['members', 'Logged-in members only']], (v) => { p.access = v; changed(); renderAll(); }), p.access === 'members' ? 'Enforced by the server – visitors are sent to the login page.' : ''), chk(p.inNav, set((v) => { p.inNav = v; }), 'Show in the menu'),
        h('button', { class: 'btn danger', disabled: site.pages.length < 2, onclick: async () => { if (await VX.ui.confirm('Delete the page “' + p.title + '”?', 'Delete', { danger: true })) { site.pages = site.pages.filter((x) => x !== p); pageId = site.pages[0].id; sel = null; changed(); renderAll(); } } }, 'Delete page'));
    }
    function paneData(body) {
      body.append(h('p', { class: 'sb-hint' }, 'A collection is a table in your database. Forms save into it; lists show it. The server checks every entry against the fields you define here.'));
      body.append(h('div', { class: 'sb-row' }, h('button', { class: 'btn primary', onclick: () => { let n = site.collections.length + 1, name = 'collection-' + n; while (site.collections.some((c) => c.name === name)) name += 'x'; site.collections.push({ name, label: 'Collection ' + n, public: false, submit: 'anyone', fields: [{ key: 'title', label: 'Title', type: 'text', required: true }] }); dataIdx = site.collections.length - 1; changed(); renderAll(); } }, '＋ New collection')));
      site.collections.forEach((c, i) => body.append(h('button', { class: 'sb-cn' + (i === dataIdx ? ' on' : ''), onclick: () => { dataIdx = i; renderLeft(); } }, c.label || c.name, h('small', {}, ' ' + c.fields.length + ' fields'))));
      const c = site.collections[dataIdx]; if (!c) return;
      const upd = () => { changed(); renderCanvas(); };
      body.append(h('h4', {}, 'Collection'), lab('Name', txt(c.label, (v) => { c.label = v; upd(); })), lab('Identifier', txt(c.name, (v) => { const old = c.name; c.name = S.nameOf(v); for (const p of site.pages) (function w(l) { for (const b of l) { if (b.p && b.p.collection === old) b.p.collection = c.name; (b.cols || []).forEach(w); } })(p.blocks); upd(); }), 'Letters, numbers and dashes. Used in the form address.'),
        lab('Who can add entries', selIn(c.submit, [['anyone', 'Anyone (public form)'], ['members', 'Logged-in members only']], (v) => { c.submit = v; upd(); })), chk(c.public, (v) => { c.public = v; upd(); renderLeft(); }, 'Visitors may read the entries (for a list block)'), c.public ? h('div', { class: 'sb-warn' }, 'Entries become public. Email fields and fields marked private are never sent to visitors.') : null,
        h('h4', {}, 'Fields'));
      c.fields.forEach((f, i) => { const opt = f.type === 'select' ? lab('Choices (one per line)', area((f.options || []).join('\n'), (v) => { f.options = v.split('\n').map((x) => x.trim()).filter(Boolean); upd(); })) : null; body.append(h('div', { class: 'sb-field' }, h('div', { class: 'sb-row' }, txt(f.label, (v) => { f.label = v; if (!f._k) f.key = S.nameOf(v).replace(/-/g, '_') || 'field'; upd(); }, 'Label'), h('button', { class: 'iconbtn', title: 'Remove field', onclick: () => { c.fields.splice(i, 1); changed(); renderAll(); } }, '✕')), h('div', { class: 'sb-row' }, selIn(f.type, [['text', 'Short text'], ['textarea', 'Long text'], ['email', 'Email'], ['number', 'Number'], ['select', 'Choice list'], ['checkbox', 'Tick box']], (v) => { f.type = v; changed(); renderAll(); }), chk(f.required, (v) => { f.required = v; upd(); }, 'Required'), chk(f.private, (v) => { f.private = v; upd(); }, 'Private')), opt)); });
      body.append(h('button', { class: 'btn', onclick: () => { let k = 'field' + (c.fields.length + 1); c.fields.push({ key: k, label: 'New field', type: 'text', required: false }); changed(); renderAll(); } }, '＋ Add field'), h('button', { class: 'btn danger', onclick: async () => { if (await VX.ui.confirm('Delete the collection “' + (c.label || c.name) + '”? Forms using it stop working.', 'Delete', { danger: true })) { site.collections.splice(dataIdx, 1); dataIdx = 0; changed(); renderAll(); } } }, 'Delete collection'));
    }
    function paneSite(body) {
      const t = site.theme, sec = site.security, ho = site.hosting, upd = () => { changed(); renderCanvas(); };
      body.append(h('h4', {}, 'Site'), lab('Site name', txt(site.name, (v) => { site.name = v; upd(); })), lab('Brand in the menu', txt(site.nav.brand, (v) => { site.nav.brand = v; upd(); })), lab('Footer text', txt(site.nav.footer, (v) => { site.nav.footer = v; upd(); })), chk(site.nav.show !== false, (v) => { site.nav.show = v; upd(); }, 'Show the menu bar'),
        h('h4', {}, 'Look'), lab('Main colour', colIn(t.primary, (v) => { t.primary = v; upd(); })), lab('Page background', colIn(t.bg, (v) => { t.bg = v; upd(); })), lab('Text colour', colIn(t.text, (v) => { t.text = v; upd(); })), lab('Font', selIn(t.font, [['system', 'Clean (system)'], ['serif', 'Classic (serif)'], ['rounded', 'Friendly'], ['mono', 'Code (monospace)']], (v) => { t.font = v; upd(); })), lab('Rounded corners (px)', numIn(t.radius, (v) => { t.radius = v; upd(); }, 0, 40)), lab('Page width (px)', numIn(t.width, (v) => { t.width = v; upd(); }, 600, 1600)),
        h('h4', {}, 'Accessibility'), chk(site.a11y.listen, (v) => { site.a11y.listen = v; changed(); }, '“Listen” button that reads the page aloud and highlights the words'), chk(site.a11y.skipLink !== false, (v) => { site.a11y.skipLink = v; changed(); }, '“Skip to the content” link'),
        h('h4', {}, 'Security'), chk(sec.allowSignup, (v) => { sec.allowSignup = v; changed(); }, 'Visitors may create member accounts'), chk(sec.honeypot, (v) => { sec.honeypot = v; changed(); }, 'Hidden spam trap on forms'), chk(sec.csp !== false, (v) => { sec.csp = v; changed(); }, 'Strict Content-Security-Policy (recommended)'),
        lab('Requests per minute, per visitor', numIn(sec.rateLimit, (v) => { sec.rateLimit = v; changed(); }, 5, 1000)), lab('Biggest request (KB)', numIn(sec.maxBodyKB, (v) => { sec.maxBodyKB = v; changed(); }, 4, 1024)), lab('Shortest password', numIn(sec.passwordMin, (v) => { sec.passwordMin = v; changed(); }, 8, 64)), lab('Stay logged in (hours)', numIn(sec.sessionHours, (v) => { sec.sessionHours = v; changed(); }, 1, 2160)),
        h('h4', {}, 'Hosting (used when you export)'), lab('Public address', txt(ho.publicUrl, (v) => { ho.publicUrl = v.trim(); changed(); }, 'https://my-site.example'), 'Leave empty while testing.'), lab('Port', numIn(ho.port, (v) => { ho.port = v; changed(); }, 1, 65535)), chk(ho.forceHttps, (v) => { ho.forceHttps = v; changed(); }, 'Send visitors to https://'), chk(ho.trustProxy, (v) => { ho.trustProxy = v; changed(); }, 'A proxy / host (Caddy, nginx, Railway…) handles HTTPS in front of the site'));
    }
    function renderAll() { renderLeft(); renderCanvas(); renderRight(); }

    /* ---------- preview, checks, export ---------- */
    function previewHtml(p) {
      const full = S.pageHtml(site, p, { site, tts: false });
      return full.replace('<link rel="stylesheet" href="/styles.css">', '<style>' + S.css(site) + '</style>').replace('<script src="/site.js"></script>', '<script>window.__VX_PREVIEW=true;document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a");if(a&&/^\\//.test(a.getAttribute("href")||"")){e.preventDefault()}});' + S.SITE_JS.replace(/<\/script/gi, '<\\/script') + '</script>');
    }
    async function loadText(path) { try { const r = await fetch(path); return r.ok ? await r.text() : ''; } catch { return ''; } }
    function extractAssets(s) {
      const assets = []; const seen = new Map(); const w = (o) => { for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === 'string') { const m = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)$/.exec(v); if (m) { if (!seen.has(v)) { const name = 'assets/img-' + (assets.length + 1) + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]); seen.set(v, '/' + name); assets.push({ path: name, data: Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)) }); } o[k] = seen.get(v); } } else if (v && typeof v === 'object') w(v); } };
      w(s.pages); return assets;
    }
    async function buildFiles(adminPw) {
      const copy = clone(site); const assets = extractAssets(copy);
      const [serverSource, ttsSource] = await Promise.all([loadText('js/web/site-server.tpl.js'), loadText('js/game/rt-tts.js')]);
      if (!serverSource) throw new Error('Could not read the server template.');
      return S.generate(copy, { serverSource, ttsSource, assets, adminPasswordHash: adminPw ? await S.hashAdminPassword(adminPw) : '' });
    }
    async function exportDialog() {
      const probs = S.check(site); const errs = probs.filter((p) => p.level === 'error');
      const v = await VX.ui.form({ title: 'Export “' + site.name + '”', intro: (probs.length ? probs.map((p) => (p.level === 'error' ? '⛔ ' : '⚠ ') + p.text).join('\n') + '\n\n' : '') + 'You get a folder with your pages and a small server (needs Node.js 18+). HOSTING.md inside explains how to put it online with HTTPS.', submit: errs.length ? 'Fix the problems first' : 'Export',
        fields: [{ key: 'pw', label: 'Admin password (for /admin – read and delete form entries)', type: 'password', value: '', hint: 'Leave empty and a random one is created and shown the first time the server starts.' }, { key: 'how', label: 'Save as', type: 'select', value: 'zip', options: [['zip', 'ZIP file'], ['folder', 'Folder in my workspace (desktop app)']] }], validate: (x) => (errs.length ? errs[0].text : x.pw && x.pw.length < 10 ? 'Use at least 10 characters for the admin password.' : '') });
      if (!v) return;
      try {
        const files = await buildFiles(v.pw); const base = S.slugOf(site.name);
        if (v.how === 'folder' && VX.app.S.root && window.native.isDesktop) {
          const dir = VX.path.join(VX.app.S.root, base + '-site'); for (const f of files) { const p = VX.path.join(dir, f.path); if (typeof f.data === 'string') await window.native.writeFile(p, f.data); else await window.native.writeBase64(p, VX.archive.toB64(f.data)); } VX.emit('fsChange'); VX.ui.toast('Exported to ' + base + '-site/ – open HOSTING.md for the next steps.', 'ok');
        } else { const bytes = await VX.archive.zip(files.map((f) => ({ path: base + '/' + f.path, data: f.data, mode: /\.sh$/.test(f.path) ? 0o755 : 0o644 }))); await window.native.saveBinary(base + '-site.zip', VX.archive.toB64(bytes)); }
      } catch (e) { VX.ui.toast('Export failed: ' + e.message, 'error'); }
    }
    function showChecks() { const p = S.check(site); VX.ui.modal && VX.ui.modal({ title: 'Checks', body: h('div', {}, p.length ? p.map((x) => h('p', {}, (x.level === 'error' ? '⛔ ' : '⚠ ') + x.text)) : h('p', {}, '✔ Nothing to fix.')) }); }

    renderAll();
    const ctl = {
      root, site: () => site, serialize: () => JSON.stringify(site, null, 2), generate: buildFiles, check: () => S.check(site), previewHtml,
      onShow() { renderAll(); },
      toolbar() {
        const b = (label, fn, cls, title) => h('button', { class: 'btn ' + (cls || ''), onclick: fn, title: title || '' }, label);
        return [b('↶ Undo', doUndo), b('↷ Redo', doRedo), h('span', { class: 'spacer' }), (() => { const bt = b(device === 'desktop' ? '🖥 Desktop' : '📱 Phone', () => { device = device === 'desktop' ? 'phone' : 'desktop'; canvasHost.dataset.device = device; bt.textContent = device === 'desktop' ? '🖥 Desktop' : '📱 Phone'; }, '', 'Switch the page width'); return bt; })(), b('✔ Checks', showChecks), b('📖 Docs', () => opts.openDocs && opts.openDocs('site-builder')), b('👁 Preview', () => VX.ui.preview(previewHtml(page()), 'Preview – ' + page().title)), b('⬇ Export & host', exportDialog, 'primary', 'Create the site folder with its server')];
      },
      dispose() { clearTimeout(snapTimer); },
    };
    return ctl;
  }
  VX.siteBuilder = { create };
})();
