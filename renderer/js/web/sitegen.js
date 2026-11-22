/* Vextra Studio – website builder: the block catalogue and the site generator (pure functions – also used by the self-test in Node).
 * A site (.vxsite) is JSON:  { v, name, theme, nav, security, hosting, a11y, collections:[…], pages:[{ id, title, slug, access, inNav, blocks:[…] }] }
 * A block is { id, type, p:{props…}, cols?:[[blocks],…] }.  VXSite.render(block) gives the same HTML in the editor and in the exported site. */
(function (root) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => 'b' + Math.random().toString(36).slice(2, 9);
  const slugOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'page';
  const nameOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'form';
  /** only http(s), mailto, tel, relative and #anchor links – never javascript: or data: */
  const safeUrl = (u) => { u = String(u || '').trim(); if (!u) return '#'; if (/^(https?:|mailto:|tel:|\/|\.\/|\.\.\/|#)/i.test(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u)) return u; return '#'; };
  const safeImg = (u) => { u = String(u || '').trim(); if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(u)) return u; return /^[a-z][a-z0-9+.-]*:/i.test(u) && !/^https?:/i.test(u) ? '' : u; };
  const color = (c, d) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '').trim()) ? String(c).trim() : d);
  const align = (a) => (['left', 'center', 'right'].includes(a) ? a : 'left');
  const paras = (t) => String(t || '').split(/\n{2,}/).map((x) => '<p>' + esc(x).replace(/\n/g, '<br>') + '</p>').join('');
  const num = (n, lo, hi, d) => { n = Number(n); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

  /* ---------- the catalogue: label, group, defaults, inspector fields and HTML ---------- */
  const F = { text: (k, label, o) => Object.assign({ k, label, t: 'text' }, o), area: (k, label, o) => Object.assign({ k, label, t: 'area' }, o), num: (k, label, min, max) => ({ k, label, t: 'num', min, max }), sel: (k, label, opts) => ({ k, label, t: 'sel', opts }), color: (k, label) => ({ k, label, t: 'color' }), coll: (k, label) => ({ k, label, t: 'coll' }), bool: (k, label) => ({ k, label, t: 'bool' }), page: (k, label) => ({ k, label, t: 'page' }) };
  const BLOCKS = {
    heading: { label: 'Heading', group: 'Text', icon: 'H', p: { text: 'A clear heading', level: 2, align: 'left' }, f: [F.text('text', 'Text'), F.sel('level', 'Size', [[1, 'Largest'], [2, 'Large'], [3, 'Medium'], [4, 'Small']]), F.sel('align', 'Align', ['left', 'center', 'right'])], html: (b) => { const l = num(b.p.level, 1, 4, 2); return `<h${l} style="text-align:${align(b.p.align)}">${esc(b.p.text)}</h${l}>`; } },
    text: { label: 'Paragraph', group: 'Text', icon: '¶', p: { text: 'Write something helpful here.\n\nA blank line starts a new paragraph.', align: 'left' }, f: [F.area('text', 'Text'), F.sel('align', 'Align', ['left', 'center', 'right'])], html: (b) => `<div class="vx-text" style="text-align:${align(b.p.align)}">${paras(b.p.text)}</div>` },
    image: { label: 'Image', group: 'Media', icon: '▣', p: { src: '', alt: '', width: 100, caption: '' }, f: [F.text('src', 'Image address or file', { pick: 'image' }), F.text('alt', 'Describe the image (for screen readers)'), F.num('width', 'Width %', 10, 100), F.text('caption', 'Caption')], html: (b) => { const s = safeImg(b.p.src); return `<figure class="vx-image" style="width:${num(b.p.width, 10, 100, 100)}%">${s ? `<img src="${esc(s)}" alt="${esc(b.p.alt)}" loading="lazy">` : '<div class="vx-ph" role="img" aria-label="Empty image">Choose an image</div>'}${b.p.caption ? `<figcaption>${esc(b.p.caption)}</figcaption>` : ''}</figure>`; } },
    button: { label: 'Button', group: 'Text', icon: '▭', p: { label: 'Click me', href: '#', style: 'primary', align: 'left' }, f: [F.text('label', 'Label'), F.text('href', 'Goes to (page, link or file)', { pickPage: 1 }), F.sel('style', 'Look', ['primary', 'outline']), F.sel('align', 'Align', ['left', 'center', 'right'])], html: (b) => `<p style="text-align:${align(b.p.align)}"><a class="vx-btn ${b.p.style === 'outline' ? 'outline' : ''}" href="${esc(safeUrl(b.p.href))}">${esc(b.p.label)}</a></p>` },
    hero: { label: 'Hero banner', group: 'Layout', icon: '▀', p: { title: 'Welcome to my site', sub: 'A short line that says what this is about.', label: 'Get started', href: '#', bg: '#1f3a8a', fg: '#ffffff', image: '' }, f: [F.text('title', 'Title'), F.text('sub', 'Subtitle'), F.text('label', 'Button label'), F.text('href', 'Button goes to', { pickPage: 1 }), F.color('bg', 'Background'), F.color('fg', 'Text colour'), F.text('image', 'Background image (optional)', { pick: 'image' })], html: (b) => { const im = safeImg(b.p.image); return `<section class="vx-hero" style="background:${color(b.p.bg, '#1f3a8a')}${im ? ` url('${esc(im).replace(/'/g, '%27')}') center/cover` : ''};color:${color(b.p.fg, '#fff')}"><h1>${esc(b.p.title)}</h1><p>${esc(b.p.sub)}</p>${b.p.label ? `<a class="vx-btn light" href="${esc(safeUrl(b.p.href))}">${esc(b.p.label)}</a>` : ''}</section>`; } },
    columns: { label: 'Columns', group: 'Layout', icon: '▥', p: { count: 2, gap: 24 }, f: [F.sel('count', 'Columns', [[2, '2'], [3, '3'], [4, '4']]), F.num('gap', 'Gap (px)', 0, 80)], cols: true, html: (b, ctx, kids) => `<div class="vx-cols" style="grid-template-columns:repeat(${num(b.p.count, 2, 4, 2)},minmax(0,1fr));gap:${num(b.p.gap, 0, 80, 24)}px">${kids.map((k) => `<div class="vx-col">${k}</div>`).join('')}</div>` },
    card: { label: 'Card', group: 'Layout', icon: '▤', p: { title: 'Card title', text: 'A short description.', image: '', label: 'Read more', href: '' }, f: [F.text('title', 'Title'), F.area('text', 'Text'), F.text('image', 'Image (optional)', { pick: 'image' }), F.text('label', 'Link label'), F.text('href', 'Link goes to', { pickPage: 1 })], html: (b) => { const im = safeImg(b.p.image); return `<article class="vx-card">${im ? `<img src="${esc(im)}" alt="" loading="lazy">` : ''}<div class="vx-card-b"><h3>${esc(b.p.title)}</h3>${paras(b.p.text)}${b.p.href ? `<a class="vx-link" href="${esc(safeUrl(b.p.href))}">${esc(b.p.label || 'Open')}</a>` : ''}</div></article>`; } },
    spacer: { label: 'Spacer', group: 'Layout', icon: '↕', p: { h: 40 }, f: [F.num('h', 'Height (px)', 4, 300)], html: (b) => `<div style="height:${num(b.p.h, 4, 300, 40)}px" aria-hidden="true"></div>` },
    divider: { label: 'Divider', group: 'Layout', icon: '―', p: {}, f: [], html: () => '<hr class="vx-hr">' },
    form: { label: 'Form (saves to database)', group: 'Data', icon: '✉', p: { collection: '', title: 'Contact us', button: 'Send', success: 'Thank you! We got your message.' }, f: [F.coll('collection', 'Saves into this collection'), F.text('title', 'Title'), F.text('button', 'Button label'), F.text('success', 'Message after sending')], needs: 'collection', html: (b, ctx) => { const c = (ctx.site.collections || []).find((x) => x.name === b.p.collection); if (!c) return '<div class="vx-note">Pick a collection for this form (Data tab).</div>'; const id = 'f' + esc(b.id); return `<form class="vx-form" data-collection="${esc(c.name)}" data-success="${esc(b.p.success)}" novalidate>${b.p.title ? `<h3>${esc(b.p.title)}</h3>` : ''}${c.fields.map((f) => field(f, id)).join('')}<div class="vx-hp" aria-hidden="true"><label>Leave empty<input type="text" name="_hp" tabindex="-1" autocomplete="off"></label></div><button class="vx-btn" type="submit">${esc(b.p.button || 'Send')}</button><p class="vx-msg" role="status" aria-live="polite"></p></form>`; } },
    list: { label: 'List from database', group: 'Data', icon: '☰', p: { collection: '', title: '', layout: 'cards', limit: 12, fields: '' }, f: [F.coll('collection', 'Show entries of'), F.text('title', 'Title'), F.sel('layout', 'Layout', ['cards', 'table']), F.num('limit', 'How many', 1, 100), F.text('fields', 'Fields to show (comma separated, empty = all)')], needs: 'collection', html: (b, ctx) => { const c = (ctx.site.collections || []).find((x) => x.name === b.p.collection); if (!c) return '<div class="vx-note">Pick a collection for this list (Data tab).</div>'; return `<div class="vx-listwrap">${b.p.title ? `<h3>${esc(b.p.title)}</h3>` : ''}<div class="vx-list" data-collection="${esc(c.name)}" data-layout="${b.p.layout === 'table' ? 'table' : 'cards'}" data-limit="${num(b.p.limit, 1, 100, 12)}" data-fields="${esc(b.p.fields)}" data-labels="${esc(JSON.stringify(Object.fromEntries(c.fields.map((f) => [f.key, f.label || f.key]))))}"><p class="vx-empty">${ctx.editing ? 'Entries appear here once visitors add them.' : 'Loading…'}</p></div>${c.public ? '' : '<div class="vx-note">This collection is private – turn on “Visitors may read” in the Data tab to show it.</div>'}</div>`; } },
    signup: { label: 'Sign-up form', group: 'Members', icon: '＋', p: { title: 'Create an account', button: 'Sign up', redirect: '' }, f: [F.text('title', 'Title'), F.text('button', 'Button label'), F.text('redirect', 'After signing up go to', { pickPage: 1 })], html: (b) => `<form class="vx-auth" data-mode="signup" data-redirect="${esc(safeUrl(b.p.redirect || ''))}" novalidate><h3>${esc(b.p.title)}</h3><label>Name<input name="name" autocomplete="name"></label><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" autocomplete="new-password" required></label><button class="vx-btn" type="submit">${esc(b.p.button)}</button><p class="vx-msg" role="status" aria-live="polite"></p></form>` },
    login: { label: 'Login form', group: 'Members', icon: '⏻', p: { title: 'Log in', button: 'Log in', redirect: '' }, f: [F.text('title', 'Title'), F.text('button', 'Button label'), F.text('redirect', 'After logging in go to', { pickPage: 1 })], html: (b) => `<form class="vx-auth" data-mode="login" data-redirect="${esc(safeUrl(b.p.redirect || ''))}" novalidate><h3>${esc(b.p.title)}</h3><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="vx-btn" type="submit">${esc(b.p.button)}</button><p class="vx-msg" role="status" aria-live="polite"></p></form>` },
    account: { label: 'Who is logged in', group: 'Members', icon: '☺', p: { guest: 'You are not logged in.', hello: 'Hello' }, f: [F.text('guest', 'Text for visitors'), F.text('hello', 'Greeting')], html: (b) => `<p class="vx-account" data-guest="${esc(b.p.guest)}" data-hello="${esc(b.p.hello)}">${esc(b.p.guest)}</p>` },
  };
  function field(f, id) {
    const n = esc(f.key), i = id + '-' + n, lab = esc(f.label || f.key), req = f.required ? ' required' : '', star = f.required ? ' <span aria-hidden="true">*</span>' : '';
    if (f.type === 'textarea') return `<label for="${i}">${lab}${star}</label><textarea id="${i}" name="${n}" rows="4"${req}${f.maxLength ? ` maxlength="${num(f.maxLength, 1, 5000, 5000)}"` : ''}></textarea>`;
    if (f.type === 'select') return `<label for="${i}">${lab}${star}</label><select id="${i}" name="${n}"${req}><option value=""></option>${(f.options || []).map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
    if (f.type === 'checkbox') return `<label class="vx-check"><input id="${i}" type="checkbox" name="${n}"${req}> ${lab}${star}</label>`;
    return `<label for="${i}">${lab}${star}</label><input id="${i}" name="${n}" type="${f.type === 'email' ? 'email' : f.type === 'number' ? 'number' : 'text'}"${req}${f.maxLength ? ` maxlength="${num(f.maxLength, 1, 300, 300)}"` : ''}${f.type === 'email' ? ' autocomplete="email"' : ''}>`;
  }

  function blockHtml(b, ctx, wrap) {
    const d = BLOCKS[b.type]; if (!d) return '';
    const kids = d.cols ? (b.cols || []).slice(0, num(b.p.count, 2, 4, 2)).map((col) => (col || []).map((x) => blockHtml(x, ctx, wrap)).join('')) : null;
    let html; try { html = d.html(b, ctx, kids || []); } catch { html = ''; }
    return wrap ? wrap(b, html, kids) : html;
  }
  const newBlock = (type) => { const d = BLOCKS[type]; const b = { id: uid(), type, p: JSON.parse(JSON.stringify(d.p)) }; if (d.cols) b.cols = [[], [], [], []]; return b; };

  /* ---------- sites ---------- */
  const themeDefault = () => ({ primary: '#2457d6', bg: '#ffffff', text: '#1b2333', font: 'system', radius: 10, width: 1000 });
  const blank = (name) => ({
    v: 1, name: name || 'My website', theme: themeDefault(), nav: { show: true, brand: name || 'My website', footer: '© ' + new Date().getFullYear() + ' ' + (name || 'My website') },
    security: { rateLimit: 60, maxBodyKB: 64, honeypot: true, allowSignup: true, sessionHours: 168, passwordMin: 10, csp: true },
    hosting: { port: 8080, host: '0.0.0.0', publicUrl: '', forceHttps: false, trustProxy: false },
    a11y: { listen: true, skipLink: true },
    collections: [{ name: 'messages', label: 'Contact messages', public: false, submit: 'anyone', fields: [{ key: 'name', label: 'Your name', type: 'text', required: true }, { key: 'email', label: 'Email', type: 'email', required: true }, { key: 'message', label: 'Message', type: 'textarea', required: true }] }],
    pages: [{ id: uid(), title: 'Home', slug: 'home', access: 'public', inNav: true, blocks: [{ ...newBlock('hero') }, newBlock('text')] }, (() => { const f = newBlock('form'); f.p.collection = 'messages'; return { id: uid(), title: 'Contact', slug: 'contact', access: 'public', inNav: true, blocks: [newBlock('heading'), f] }; })()],
  });
  const fileOf = (p) => (p.slug === 'home' ? 'index.html' : p.slug + '.html');
  const usesAuth = (site) => site.pages.some((p) => p.access === 'members' || JSON.stringify(p.blocks).match(/"type":"(signup|login|account)"/)) || (site.collections || []).some((c) => c.submit === 'members');
  const hasType = (list, t) => (list || []).some((b) => b.type === t || (b.cols || []).some((c) => hasType(c, t)));

  /** problems the owner should fix before publishing: [{level:'error'|'warn', text}] */
  function check(site) {
    const out = [], slugs = new Set(), names = new Set();
    for (const p of site.pages) { if (slugs.has(p.slug)) out.push({ level: 'error', text: `Two pages use the address “${p.slug}”.` }); slugs.add(p.slug); }
    if (!site.pages.some((p) => p.slug === 'home')) out.push({ level: 'error', text: 'There is no page with the address “home” – it becomes the front page.' });
    for (const c of site.collections || []) { if (names.has(c.name)) out.push({ level: 'error', text: `Two collections are called “${c.name}”.` }); names.add(c.name); if (!c.fields.length) out.push({ level: 'warn', text: `Collection “${c.label || c.name}” has no fields.` }); }
    const walk = (list, pg) => { for (const b of list || []) { const d = BLOCKS[b.type]; if (d && d.needs === 'collection' && !(site.collections || []).some((c) => c.name === b.p.collection)) out.push({ level: 'error', text: `A ${d.label.toLowerCase()} on “${pg}” has no collection.` }); if (b.type === 'image' && b.p.src && !b.p.alt) out.push({ level: 'warn', text: `An image on “${pg}” has no description (screen readers need one).` }); (b.cols || []).forEach((c) => walk(c, pg)); } };
    for (const p of site.pages) walk(p.blocks, p.title);
    if (site.pages.some((p) => p.access === 'members') && !site.pages.some((p) => hasType(p.blocks, 'login')) && !site.pages.some((p) => p.slug === 'login')) out.push({ level: 'warn', text: 'Members-only pages exist, so a simple Login page will be added for you.' });
    if (!site.hosting.publicUrl) out.push({ level: 'warn', text: 'No public address set (Hosting tab) – fine for testing.' });
    if (site.hosting.publicUrl && !/^https:/i.test(site.hosting.publicUrl)) out.push({ level: 'warn', text: 'Use an https:// address for a real site so logins stay private.' });
    return out;
  }

  const FONTS = { system: 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif', serif: 'Georgia,"Times New Roman",serif', mono: 'ui-monospace,Menlo,Consolas,monospace', rounded: '"Trebuchet MS","Segoe UI",system-ui,sans-serif' };
  function css(site) {
    const t = Object.assign(themeDefault(), site.theme || {}); const r = num(t.radius, 0, 40, 10);
    return `:root{--p:${color(t.primary, '#2457d6')};--bg:${color(t.bg, '#fff')};--tx:${color(t.text, '#1b2333')};--r:${r}px;--w:${num(t.width, 600, 1600, 1000)}px}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--tx);font:17px/1.6 ${FONTS[t.font] || FONTS.system}}
img{max-width:100%;height:auto}a{color:var(--p)}main{max-width:var(--w);margin:0 auto;padding:24px 16px 48px}h1,h2,h3,h4{line-height:1.25;margin:1.2em 0 .5em}
.vx-nav{border-bottom:1px solid rgba(128,128,128,.25)}.vx-nav .in{max-width:var(--w);margin:0 auto;padding:12px 16px;display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center}.vx-nav b{font-size:1.15em;margin-right:auto}.vx-nav a{text-decoration:none;padding:4px 2px;border-bottom:2px solid transparent}.vx-nav a[aria-current=page]{border-color:var(--p)}
.vx-foot{border-top:1px solid rgba(128,128,128,.25);text-align:center;padding:20px 16px;font-size:.9em;opacity:.8}
.vx-btn{display:inline-block;background:var(--p);color:#fff;border:2px solid var(--p);border-radius:var(--r);padding:10px 20px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}.vx-btn.outline{background:transparent;color:var(--p)}.vx-btn.light{background:#fff;color:#111;border-color:#fff}.vx-btn:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #f5a623;outline-offset:2px}
.vx-hero{padding:72px 24px;border-radius:var(--r);text-align:center;margin:8px 0 24px}.vx-hero h1{margin:0 0 .3em;font-size:2.4em}.vx-hero p{font-size:1.15em;margin:0 0 1.2em}
.vx-cols{display:grid;margin:16px 0}.vx-card{border:1px solid rgba(128,128,128,.3);border-radius:var(--r);overflow:hidden;background:rgba(128,128,128,.05)}.vx-card img{width:100%;display:block}.vx-card-b{padding:6px 16px 16px}.vx-card h3{margin:.6em 0 .3em}.vx-link{font-weight:600}
.vx-image{margin:16px auto}.vx-image img{width:100%;border-radius:var(--r);display:block}.vx-image figcaption{font-size:.9em;opacity:.75;text-align:center;margin-top:6px}.vx-ph{background:rgba(128,128,128,.15);border-radius:var(--r);padding:48px;text-align:center;opacity:.7}
.vx-hr{border:0;border-top:1px solid rgba(128,128,128,.3);margin:24px 0}
.vx-form,.vx-auth{max-width:520px;margin:20px auto;border:1px solid rgba(128,128,128,.3);border-radius:var(--r);padding:8px 20px 20px}.vx-form label,.vx-auth label{display:block;margin:12px 0 4px;font-weight:600}.vx-check{font-weight:400!important}.vx-form input:not([type=checkbox]),.vx-form textarea,.vx-form select,.vx-auth input{width:100%;font:inherit;padding:9px 11px;border:1px solid rgba(128,128,128,.55);border-radius:calc(var(--r) / 1.6);background:var(--bg);color:var(--tx)}
.vx-hp{position:absolute!important;left:-9999px;width:1px;height:1px;overflow:hidden}.vx-form .vx-btn,.vx-auth .vx-btn{margin-top:16px}.vx-msg{min-height:1.5em;margin:10px 0 0}.vx-msg.err{color:#b3261e}.vx-msg.ok{color:#17803d}
.vx-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}.vx-list[data-layout=table]{display:block;overflow-x:auto}.vx-list table{border-collapse:collapse;width:100%}.vx-list td,.vx-list th{border-bottom:1px solid rgba(128,128,128,.3);padding:8px;text-align:left;vertical-align:top}.vx-item{border:1px solid rgba(128,128,128,.3);border-radius:var(--r);padding:12px 14px}.vx-item b{display:block;font-size:.8em;opacity:.7;margin-top:6px}.vx-empty{opacity:.7}
.vx-note{background:rgba(245,166,35,.15);border:1px dashed #f5a623;border-radius:8px;padding:10px 12px;font-size:.9em;margin:10px 0}
.vx-skip{position:absolute;left:-999px;top:0;background:#000;color:#fff;padding:8px 14px;z-index:99}.vx-skip:focus{left:8px;top:8px}
.vx-listen{position:fixed;right:14px;bottom:14px;z-index:50;background:var(--p);color:#fff;border:0;border-radius:999px;padding:10px 16px;font:600 15px system-ui;cursor:pointer;box-shadow:0 2px 10px #0004}
@media(max-width:640px){.vx-cols{grid-template-columns:1fr!important}.vx-hero{padding:48px 16px}}`;
  }

  const SITE_JS = `(()=>{'use strict';const $=(s,r)=>(r||document).querySelector(s),$$=(s,r)=>[...(r||document).querySelectorAll(s)];const PREVIEW=!!window.__VX_PREVIEW;
async function api(method,url,body){if(PREVIEW)return{ok:true,user:null,rows:[]};const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});let j={};try{j=await r.json()}catch(e){}if(!r.ok)throw new Error(j.error||'Something went wrong ('+r.status+')');return j}
const say=(f,t,k)=>{const m=$('.vx-msg',f);if(m){m.textContent=t;m.className='vx-msg '+(k||'')}};
for(const f of $$('form.vx-form')){f.addEventListener('submit',async e=>{e.preventDefault();const d={};for(const el of f.elements){if(!el.name)continue;d[el.name]=el.type==='checkbox'?el.checked:el.value}
if(!f.checkValidity()){f.reportValidity();return}say(f,'Sending…');try{await api('POST','/api/forms/'+encodeURIComponent(f.dataset.collection),d);f.reset();say(f,f.dataset.success||'Thank you!','ok')}catch(x){say(f,x.message,'err')}})}
for(const f of $$('form.vx-auth')){f.addEventListener('submit',async e=>{e.preventDefault();if(!f.checkValidity()){f.reportValidity();return}const d={};for(const el of f.elements)if(el.name)d[el.name]=el.value;say(f,'One moment…');
try{await api('POST',f.dataset.mode==='signup'?'/api/signup':'/api/login',d);const q=new URLSearchParams(location.search).get('next');const go=(q&&q.startsWith('/')&&!q.startsWith('//')?q:'')||f.dataset.redirect||'/';location.href=go}catch(x){say(f,x.message,'err')}})}
for(const l of $$('.vx-list')){(async()=>{try{const lim=l.dataset.limit||12;const j=await api('GET','/api/data/'+encodeURIComponent(l.dataset.collection)+'?limit='+lim);const rows=j.rows||[];l.textContent='';if(!rows.length){const p=document.createElement('p');p.className='vx-empty';p.textContent='Nothing here yet.';l.append(p);return}
let labels={};try{labels=JSON.parse(l.dataset.labels||'{}')}catch(e){}const want=(l.dataset.fields||'').split(',').map(s=>s.trim()).filter(Boolean);const keys=(want.length?want:Object.keys(labels)).filter(k=>rows.some(r=>r.data&&k in r.data));
if(l.dataset.layout==='table'){const t=document.createElement('table'),h=t.insertRow();for(const k of keys){const th=document.createElement('th');th.textContent=labels[k]||k;h.append(th)}for(const r of rows){const tr=t.insertRow();for(const k of keys){tr.insertCell().textContent=String(r.data[k]??'')}}l.append(t)}
else for(const r of rows){const c=document.createElement('div');c.className='vx-item';keys.forEach((k,i)=>{const v=document.createElement(i?'span':'strong');v.textContent=String(r.data[k]??'');if(i){const b=document.createElement('b');b.textContent=labels[k]||k;c.append(b)}c.append(v)});l.append(c)}}catch(x){l.textContent='Could not load this list.'}})()}
(async()=>{const acc=$$('.vx-account'),link=$('#vx-authlink');if(!acc.length&&!link)return;let u=null;try{u=(await api('GET','/api/me')).user}catch(e){}
for(const a of acc)a.textContent=u?(a.dataset.hello||'Hello')+', '+u.name+'.':a.dataset.guest||'';
if(link){if(u){link.textContent='Log out';link.href='#';link.addEventListener('click',async e=>{e.preventDefault();try{await api('POST','/api/logout')}catch(x){}location.href='/'})}else{link.textContent='Log in';link.href='/login.html'}}})();
const lb=$('#vx-listen');if(lb&&window.VXTTS&&VXTTS.supported()){lb.hidden=false;lb.addEventListener('click',()=>{const st=VXTTS.state&&VXTTS.state();if(st&&st!=='idle'&&st!=='stopped'){VXTTS.stop();lb.textContent='🔊 Listen';return}lb.textContent='⏹ Stop';VXTTS.read($('main'),{onEnd:()=>{lb.textContent='🔊 Listen'}})})}
})();`;

  function pageHtml(site, page, ctx) {
    const nav = site.nav || {}; const pages = site.pages; const auth = usesAuth(site);
    const links = pages.filter((p) => p.inNav && p.access !== 'admin').map((p) => `<a href="${p.slug === 'home' ? '/' : '/' + esc(p.slug) + '.html'}"${p.id === page.id ? ' aria-current="page"' : ''}>${esc(p.title)}</a>`).join('');
    const body = (page.blocks || []).map((b) => blockHtml(b, ctx)).join('\n');
    const listen = site.a11y && site.a11y.listen && ctx.tts;
    return `<!doctype html>
<html lang="${esc(site.lang || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(page.title)} – ${esc(site.name)}</title>${page.desc ? `<meta name="description" content="${esc(page.desc)}">` : ''}<link rel="icon" href="data:,"><link rel="stylesheet" href="/styles.css"></head><body>
${site.a11y && site.a11y.skipLink !== false ? '<a class="vx-skip" href="#main">Skip to the content</a>' : ''}
${nav.show !== false ? `<header class="vx-nav"><nav class="in" aria-label="Main"><b>${esc(nav.brand || site.name)}</b>${links}${auth ? '<a id="vx-authlink" href="/login.html">Log in</a>' : ''}</nav></header>` : ''}
<main id="main">
${body}
</main>
${nav.footer ? `<footer class="vx-foot">${esc(nav.footer)}</footer>` : ''}
${listen ? '<button id="vx-listen" class="vx-listen" type="button" hidden aria-label="Read this page aloud">🔊 Listen</button><script src="/vxtts.js"></script>' : ''}
<script src="/site.js"></script></body></html>`;
  }

  /** the whole site as files: [{path, data}] – public/…, server.js, site.json, config.json, Dockerfile, start scripts, HOSTING.md */
  async function generate(site, opts) {
    opts = opts || {}; const files = []; const add = (path, data) => files.push({ path, data });
    const ctx = { site, editing: false, tts: !!opts.ttsSource };
    const pages = site.pages.map((p) => ({ ...p }));
    if (usesAuth(site)) {
      const mk = (slug, title, type) => { const b = newBlock(type); return { id: uid(), title, slug, access: 'public', inNav: false, blocks: [{ id: uid(), type: 'spacer', p: { h: 20 } }, b] }; };
      if (!pages.some((p) => p.slug === 'login')) pages.push(mk('login', 'Log in', 'login'));
      if (!pages.some((p) => p.slug === 'signup') && site.security.allowSignup !== false) pages.push(mk('signup', 'Sign up', 'signup'));
    }
    const full = { ...site, pages };
    for (const p of pages) add('public/' + fileOf(p), pageHtml(full, p, { ...ctx, site: full }));
    add('public/404.html', pageHtml(full, { id: '404', title: 'Page not found', slug: '404', blocks: [{ id: uid(), type: 'heading', p: { text: 'Page not found', level: 1, align: 'center' } }, { id: uid(), type: 'button', p: { label: 'Back to the front page', href: '/', style: 'primary', align: 'center' } }] }, { ...ctx, site: full }));
    add('public/styles.css', css(site)); add('public/site.js', SITE_JS);
    if (opts.ttsSource && site.a11y && site.a11y.listen) add('public/vxtts.js', opts.ttsSource);
    for (const a of opts.assets || []) add('public/' + a.path, a.data);
    const sec = site.security || {};
    add('site.json', JSON.stringify({ name: site.name, security: { rateLimit: num(sec.rateLimit, 5, 1000, 60), maxBodyKB: num(sec.maxBodyKB, 4, 1024, 64), honeypot: sec.honeypot !== false, allowSignup: sec.allowSignup !== false, sessionHours: num(sec.sessionHours, 1, 24 * 90, 168), passwordMin: num(sec.passwordMin, 8, 64, 10), csp: sec.csp !== false, maxFails: 5 }, collections: (site.collections || []).map((c) => ({ name: c.name, label: c.label || c.name, public: !!c.public, submit: c.submit === 'members' ? 'members' : 'anyone', fields: c.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: !!f.required, options: f.options, maxLength: f.maxLength, private: !!f.private })) })), pages: pages.map((p) => ({ file: fileOf(p), access: p.access === 'members' ? 'members' : 'public' })) }, null, 2));
    const h = site.hosting || {};
    add('config.json', JSON.stringify({ port: num(h.port, 1, 65535, 8080), host: h.host || '0.0.0.0', publicUrl: h.publicUrl || '', forceHttps: !!h.forceHttps, trustProxy: !!h.trustProxy, adminPasswordHash: opts.adminPasswordHash || '' }, null, 2));
    if (opts.serverSource) add('server.js', opts.serverSource);
    add('package.json', JSON.stringify({ name: slugOf(site.name), version: '1.0.0', private: true, scripts: { start: 'node server.js' }, engines: { node: '>=18' } }, null, 2));
    add('Dockerfile', 'FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nENV PORT=8080 DATA_DIR=/data\nVOLUME /data\nEXPOSE 8080\nUSER node\nCMD ["node","server.js"]\n');
    add('start.sh', '#!/bin/sh\ncd "$(dirname "$0")"\nnode server.js\n'); add('start.bat', '@echo off\r\ncd /d "%~dp0"\r\nnode server.js\r\npause\r\n');
    add('.gitignore', 'data/\n');
    add('HOSTING.md', hostingGuide(site, pages));
    return files;
  }

  function hostingGuide(site, pages) {
    const h = site.hosting || {}; const dom = (h.publicUrl || 'https://your-domain.example').replace(/\/$/, ''); const host = dom.replace(/^https?:\/\//, '');
    return `# Hosting “${site.name}”

Made with Vextra Studio. This folder is your whole website – pages in \`public/\`, a small server (\`server.js\`) that saves form entries and members, and your settings in \`config.json\`.

## Run it on your computer
1. Install **Node.js 18 or newer** (https://nodejs.org).
2. Double-click \`start.bat\` (Windows) or run \`./start.sh\` (Mac / Linux).
3. Open http://localhost:${num(h.port, 1, 65535, 8080)}. The **first time**, the admin password is printed in the window – write it down.
4. The admin area is at \`/admin\`: read and delete form entries, download them as CSV, remove members.

## Put it on the internet
Any host that runs Node.js works (a VPS, Railway, Render, Fly.io, a Raspberry Pi …) or Docker:

\`\`\`
docker build -t mysite .
docker run -d -p 8080:8080 -v mysite-data:/data -e ADMIN_PASSWORD='choose-a-long-password' mysite
\`\`\`

**Use HTTPS.** Logins and forms must not travel in the clear. The simplest way is a reverse proxy that gets a free certificate automatically, for example Caddy – a file named \`Caddyfile\`:

\`\`\`
${host} {
  reverse_proxy localhost:${num(h.port, 1, 65535, 8080)}
}
\`\`\`

Then set \`"trustProxy": true\` and \`"forceHttps": true\` in \`config.json\` so the server knows the visitor used HTTPS (secure cookies, HSTS).

## Your data
Everything visitors send lives in \`data/db.json\` (or the folder named by \`DATA_DIR\`). **Back it up** and keep it out of public folders. Passwords are stored only as salted scrypt hashes.

## What is protected
- Passwords: scrypt, never stored or logged in clear text; wrong-password lock-out; login looks the same for unknown and known emails.
- Sessions: random tokens, \`HttpOnly\` + \`SameSite=Strict\` (+ \`Secure\` on HTTPS), stored hashed on the server.
- Every form is checked on the server against the fields you designed (types, lengths, choices) – the browser check is only a convenience.
- Cross-site request protection, request-size limit, rate limits and a hidden spam trap on forms.
- Strict Content-Security-Policy (no inline scripts), \`X-Frame-Options\`, \`nosniff\`, no directory listing, no dot-files, path-traversal blocked.
- Pages marked **Members only** (${pages.filter((p) => p.access === 'members').length} in this site) are only sent to logged-in members – the check happens on the server.
- Text from visitors is always shown as plain text, never as HTML.

## Not included (be honest with your visitors)
Email sending, payments and password-reset mails are not part of this server. Limits are per server process; a very large or high-risk site should also sit behind a firewall / CDN and use a managed database.
`;
  }

  /** admin password -> "pbkdf2$iters$salt$hash" (WebCrypto, so it works in the app and in Node 18+) */
  async function hashAdminPassword(pw) {
    const subtle = (root.crypto || require('crypto').webcrypto).subtle; const salt = (root.crypto || require('crypto').webcrypto).getRandomValues(new Uint8Array(16)); const iters = 210000;
    const key = await subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters }, key, 256));
    const hex = (u) => [...u].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `pbkdf2$${iters}$${hex(salt)}$${hex(bits)}`;
  }

  /** read a saved .vxsite and make sure every part exists (old / hand-edited files stay safe) */
  function normalize(raw) {
    let o = raw; if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { o = {}; } }
    const base = blank(o && o.name); const s = Object.assign({}, base, o || {}); s.theme = Object.assign(themeDefault(), o && o.theme); s.nav = Object.assign(base.nav, o && o.nav); s.security = Object.assign(base.security, o && o.security); s.hosting = Object.assign(base.hosting, o && o.hosting); s.a11y = Object.assign(base.a11y, o && o.a11y);
    s.collections = Array.isArray(o && o.collections) ? o.collections.map((c) => ({ name: nameOf(c.name), label: String(c.label || c.name || ''), public: !!c.public, submit: c.submit === 'members' ? 'members' : 'anyone', fields: (Array.isArray(c.fields) ? c.fields : []).map((f) => ({ key: nameOf(f.key).replace(/-/g, '_'), label: String(f.label || f.key || ''), type: ['text', 'email', 'number', 'textarea', 'select', 'checkbox'].includes(f.type) ? f.type : 'text', required: !!f.required, options: Array.isArray(f.options) ? f.options.map(String) : undefined, maxLength: f.maxLength ? num(f.maxLength, 1, 5000, 300) : undefined, private: !!f.private })) })) : base.collections;
    const fixBlocks = (list) => (Array.isArray(list) ? list : []).filter((b) => b && BLOCKS[b.type]).map((b) => { const nb = { id: String(b.id || uid()), type: b.type, p: Object.assign(JSON.parse(JSON.stringify(BLOCKS[b.type].p)), b.p && typeof b.p === 'object' ? b.p : {}) }; if (BLOCKS[b.type].cols) nb.cols = [0, 1, 2, 3].map((i) => fixBlocks(b.cols && b.cols[i])); return nb; });
    s.pages = Array.isArray(o && o.pages) && o.pages.length ? o.pages.map((p) => ({ id: String(p.id || uid()), title: String(p.title || 'Page'), slug: slugOf(p.slug || p.title), desc: String(p.desc || ''), access: p.access === 'members' ? 'members' : 'public', inNav: p.inNav !== false, blocks: fixBlocks(p.blocks) })) : base.pages;
    return s;
  }

  root.VXSite = { BLOCKS, esc, uid, slugOf, nameOf, safeUrl, blockHtml, newBlock, blank, normalize, generate, check, css, fileOf, usesAuth, pageHtml, hashAdminPassword, field, SITE_JS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.VXSite;
})(typeof window !== 'undefined' ? window : globalThis);
