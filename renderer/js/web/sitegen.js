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

  /* ---------- helpers for the advanced blocks ---------- */
  const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const cells = (l) => l.split('|').map((x) => x.trim());
  const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const kindOf = (k, list, d) => (list.includes(k) ? k : d);
  const idOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  /** a small, safe Markdown: everything is escaped first, only links with safe addresses are kept */
  function mdInline(s) {
    s = esc(s);
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    return s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a href="${esc(safeUrl(unesc(u)))}">${t}</a>`);
  }
  function md(text) {
    const out = []; let list = null, code = null;
    const flush = () => { if (list) { out.push(`<${list.t}>${list.items.join('')}</${list.t}>`); list = null; } };
    for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
      if (code) { if (/^```/.test(raw)) { out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); code = null; } else code.push(raw); continue; }
      if (/^```/.test(raw)) { flush(); code = []; continue; }
      let m;
      if ((m = /^(#{1,4})\s+(.*)$/.exec(raw))) { flush(); out.push(`<h${m[1].length}>${mdInline(m[2])}</h${m[1].length}>`); }
      else if ((m = /^\s*[-*]\s+(.*)$/.exec(raw))) { if (!list || list.t !== 'ul') { flush(); list = { t: 'ul', items: [] }; } list.items.push(`<li>${mdInline(m[1])}</li>`); }
      else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(raw))) { if (!list || list.t !== 'ol') { flush(); list = { t: 'ol', items: [] }; } list.items.push(`<li>${mdInline(m[1])}</li>`); }
      else if ((m = /^>\s?(.*)$/.exec(raw))) { flush(); out.push(`<blockquote>${mdInline(m[1])}</blockquote>`); }
      else if (/^(-{3,}|\*{3,})\s*$/.test(raw)) { flush(); out.push('<hr class="vx-hr">'); }
      else if (!raw.trim()) flush();
      else { flush(); out.push(`<p>${mdInline(raw)}</p>`); }
    }
    if (code) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); flush();
    return out.join('');
  }
  /** video: only YouTube (privacy mode), Vimeo or a direct file – the embed address is built here, never copied from the owner */
  function videoInfo(u) {
    u = String(u || '').trim(); let m;
    if ((m = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})(?:[?&#].*)?$/i.exec(u))) return { kind: 'embed', src: 'https://www.youtube-nocookie.com/embed/' + m[1], host: 'https://www.youtube-nocookie.com' };
    if ((m = /^https:\/\/(?:www\.)?vimeo\.com\/(?:video\/)?(\d{6,12})(?:[/?#].*)?$/i.exec(u))) return { kind: 'embed', src: 'https://player.vimeo.com/video/' + m[1], host: 'https://player.vimeo.com' };
    if (/\.(mp4|webm|ogg)(\?[^#]*)?$/i.test(u) && /^(https?:\/\/|\/|\.\/|[a-z0-9_-])/i.test(u) && !/^[a-z][a-z0-9+.-]*:/i.test(u.replace(/^https?:/i, ''))) return { kind: 'file', src: u };
    return null;
  }
  function mapInfo(b) {
    const lat = num(b.p.lat, -85, 85, 51.5074), lon = num(b.p.lon, -180, 180, -0.1278), z = num(b.p.zoom, 3, 18, 13);
    const dLon = (360 * (600 / 256)) / Math.pow(2, z) / 2, dLat = dLon * (350 / 600) * Math.cos((lat * Math.PI) / 180);
    const f = (n) => n.toFixed(5);
    return { src: `https://www.openstreetmap.org/export/embed.html?bbox=${f(lon - dLon)},${f(lat - dLat)},${f(lon + dLon)},${f(lat + dLat)}&layer=mapnik&marker=${f(lat)},${f(lon)}`, big: `https://www.openstreetmap.org/?mlat=${f(lat)}&mlon=${f(lon)}#map=${z}/${f(lat)}/${f(lon)}` };
  }
  const dateOk = (s) => (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(String(s || '')) ? String(s) : '');
  const colsOf = (n, d) => num(n, 1, 6, d);
  const emb = 'sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" referrerpolicy="no-referrer" loading="lazy" allowfullscreen';

  /* ---------- the catalogue: label, group, defaults, inspector fields and HTML ---------- */
  const F = { text: (k, label, o) => Object.assign({ k, label, t: 'text' }, o), area: (k, label, o) => Object.assign({ k, label, t: 'area' }, o), num: (k, label, min, max) => ({ k, label, t: 'num', min, max }), sel: (k, label, opts) => ({ k, label, t: 'sel', opts }), color: (k, label) => ({ k, label, t: 'color' }), coll: (k, label) => ({ k, label, t: 'coll' }), bool: (k, label) => ({ k, label, t: 'bool' }), page: (k, label) => ({ k, label, t: 'page' }) };
  const BLOCKS = {
    heading: { label: 'Heading', group: 'Text', icon: 'H', p: { text: 'A clear heading', level: 2, align: 'left' }, f: [F.text('text', 'Text'), F.sel('level', 'Size', [[1, 'Largest'], [2, 'Large'], [3, 'Medium'], [4, 'Small']]), F.sel('align', 'Align', ['left', 'center', 'right'])], html: (b) => { const l = num(b.p.level, 1, 4, 2); return `<h${l} style="text-align:${align(b.p.align)}">${esc(b.p.text)}</h${l}>`; } },
    text: { label: 'Paragraph', group: 'Text', icon: '¶', p: { text: 'Write something helpful here.\n\nA blank line starts a new paragraph.', align: 'left' }, f: [F.area('text', 'Text'), F.sel('align', 'Align', ['left', 'center', 'right'])], html: (b) => `<div class="vx-text" style="text-align:${align(b.p.align)}">${paras(b.p.text)}</div>` },
    image: { label: 'Image', group: 'Media', icon: '▣', p: { src: '', alt: '', width: 100, caption: '', shape: 'rounded', href: '', align: 'center' }, f: [F.text('src', 'Image address or file', { pick: 'image' }), F.text('alt', 'Describe the image (for screen readers)'), F.num('width', 'Width %', 10, 100), F.sel('shape', 'Shape', [['rounded', 'Rounded'], ['square', 'Square corners'], ['circle', 'Circle']]), F.sel('align', 'Align', ['left', 'center', 'right']), F.text('caption', 'Caption'), F.text('href', 'Click goes to (optional)', { pickPage: 1 })], html: (b) => { const s = safeImg(b.p.src); const a = align(b.p.align); const img = s ? `<img src="${esc(s)}" alt="${esc(b.p.alt)}" loading="lazy">` : '<div class="vx-ph" role="img" aria-label="Empty image">Choose an image</div>'; return `<figure class="vx-image ${kindOf(b.p.shape, ['rounded', 'square', 'circle'], 'rounded')}" style="width:${num(b.p.width, 10, 100, 100)}%;margin-left:${a === 'left' ? '0' : 'auto'};margin-right:${a === 'right' ? '0' : 'auto'}">${s && b.p.href ? `<a href="${esc(safeUrl(b.p.href))}">${img}</a>` : img}${b.p.caption ? `<figcaption>${esc(b.p.caption)}</figcaption>` : ''}</figure>`; } },
    button: { label: 'Button', group: 'Text', icon: '▭', p: { label: 'Click me', href: '#', style: 'primary', align: 'left', size: 'm', full: false, newTab: false }, f: [F.text('label', 'Label'), F.text('href', 'Goes to (page, link or file)', { pickPage: 1 }), F.sel('style', 'Look', ['primary', 'outline', 'soft']), F.sel('size', 'Size', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']]), F.sel('align', 'Align', ['left', 'center', 'right']), F.bool('full', 'Full width'), F.bool('newTab', 'Open in a new tab')], html: (b) => `<p style="text-align:${align(b.p.align)}"><a class="vx-btn ${kindOf(b.p.style, ['primary', 'outline', 'soft'], 'primary') === 'primary' ? '' : kindOf(b.p.style, ['primary', 'outline', 'soft'], 'primary')} sz-${kindOf(b.p.size, ['s', 'm', 'l'], 'm')}${b.p.full ? ' full' : ''}" href="${esc(safeUrl(b.p.href))}"${b.p.newTab ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(b.p.label)}</a></p>` },
    hero: { label: 'Hero banner', group: 'Layout', icon: '▀', p: { title: 'Welcome to my site', sub: 'A short line that says what this is about.', label: 'Get started', href: '#', label2: '', href2: '#', bg: '#1f3a8a', fg: '#ffffff', image: '', overlay: 35, align: 'center', minh: 0 }, f: [F.text('title', 'Title'), F.text('sub', 'Subtitle'), F.text('label', 'Button label'), F.text('href', 'Button goes to', { pickPage: 1 }), F.text('label2', 'Second button label (optional)'), F.text('href2', 'Second button goes to', { pickPage: 1 }), F.color('bg', 'Background'), F.color('fg', 'Text colour'), F.text('image', 'Background image (optional)', { pick: 'image' }), F.num('overlay', 'Darken the picture (%)', 0, 80), F.sel('align', 'Align', ['left', 'center']), F.num('minh', 'Minimum height (px, 0 = automatic)', 0, 800)], html: (b) => { const im = safeImg(b.p.image), ov = num(b.p.overlay, 0, 80, 35) / 100; const layers = [im && ov ? `linear-gradient(rgba(0,0,0,${ov}),rgba(0,0,0,${ov}))` : '', im ? `url('${esc(im).replace(/'/g, '%27')}') center/cover` : '', color(b.p.bg, '#1f3a8a')].filter(Boolean).join(','); const mh = num(b.p.minh, 0, 800, 0); return `<section class="vx-hero" style="background:${layers};color:${color(b.p.fg, '#fff')};text-align:${b.p.align === 'left' ? 'left' : 'center'}${mh ? `;min-height:${mh}px;display:flex;flex-direction:column;justify-content:center` : ''}"><h1>${esc(b.p.title)}</h1><p>${esc(b.p.sub)}</p><div class="vx-btns">${b.p.label ? `<a class="vx-btn light" href="${esc(safeUrl(b.p.href))}">${esc(b.p.label)}</a>` : ''}${b.p.label2 ? ` <a class="vx-btn ghostw" href="${esc(safeUrl(b.p.href2))}">${esc(b.p.label2)}</a>` : ''}</div></section>`; } },
    columns: { label: 'Columns', group: 'Layout', icon: '▥', p: { count: 2, gap: 24, ratio: 'equal', valign: 'top' }, f: [F.sel('count', 'Columns', [[2, '2'], [3, '3'], [4, '4']]), F.sel('ratio', 'Widths (2 or 3 columns)', [['equal', 'Equal'], ['wide-left', 'Wide first column'], ['wide-right', 'Wide last column']]), F.sel('valign', 'Line up', [['top', 'At the top'], ['center', 'In the middle']]), F.num('gap', 'Gap (px)', 0, 80)], cols: true, html: (b, ctx, kids) => { const n = num(b.p.count, 2, 4, 2); const tpl = n === 2 ? { equal: '1fr 1fr', 'wide-left': '2fr 1fr', 'wide-right': '1fr 2fr' }[b.p.ratio] : n === 3 ? { equal: '1fr 1fr 1fr', 'wide-left': '2fr 1fr 1fr', 'wide-right': '1fr 1fr 2fr' }[b.p.ratio] : ''; return `<div class="vx-cols" style="grid-template-columns:${tpl ? tpl.replace(/(\d)fr/g, '$1fr').split(' ').map((x) => 'minmax(0,' + x + ')').join(' ') : `repeat(${n},minmax(0,1fr))`};gap:${num(b.p.gap, 0, 80, 24)}px;align-items:${b.p.valign === 'center' ? 'center' : 'start'}">${kids.map((k) => `<div class="vx-col">${k}</div>`).join('')}</div>`; } },
    card: { label: 'Card', group: 'Layout', icon: '▤', p: { title: 'Card title', text: 'A short description.', image: '', label: 'Read more', href: '' }, f: [F.text('title', 'Title'), F.area('text', 'Text'), F.text('image', 'Image (optional)', { pick: 'image' }), F.text('label', 'Link label'), F.text('href', 'Link goes to', { pickPage: 1 })], html: (b) => { const im = safeImg(b.p.image); return `<article class="vx-card">${im ? `<img src="${esc(im)}" alt="" loading="lazy">` : ''}<div class="vx-card-b"><h3>${esc(b.p.title)}</h3>${paras(b.p.text)}${b.p.href ? `<a class="vx-link" href="${esc(safeUrl(b.p.href))}">${esc(b.p.label || 'Open')}</a>` : ''}</div></article>`; } },
    spacer: { label: 'Spacer', group: 'Layout', icon: '↕', p: { h: 40 }, f: [F.num('h', 'Height (px)', 4, 300)], html: (b) => `<div style="height:${num(b.p.h, 4, 300, 40)}px" aria-hidden="true"></div>` },
    divider: { label: 'Divider', group: 'Layout', icon: '―', p: { look: 'line', text: '' }, f: [F.sel('look', 'Look', ['line', 'dots', 'fade']), F.text('text', 'Words in the middle (optional)')], html: (b) => `<div class="vx-hr2 ${kindOf(b.p.look, ['line', 'dots', 'fade'], 'line')}" role="separator">${b.p.text ? `<span>${esc(b.p.text)}</span>` : ''}</div>` },
    richtext: { label: 'Rich text (Markdown)', group: 'Text', icon: 'Md', p: { md: '## A heading\n\nSome **bold**, some *italic* and a [link](https://example.com).\n\n- First point\n- Second point\n\n> A quote worth remembering' }, f: [F.area('md', 'Text – # headings, **bold**, *italic*, [link](address), - lists, > quotes')], html: (b) => `<div class="vx-text vx-md">${md(b.p.md)}</div>` },
    buttons: { label: 'Button group', group: 'Text', icon: '▭▭', p: { items: 'Get started | /\nLearn more | #', style: 'primary', align: 'left' }, f: [F.area('items', 'One button per line: Label | address'), F.sel('style', 'Look', ['primary', 'outline']), F.sel('align', 'Align', ['left', 'center', 'right'])], html: (b) => `<p class="vx-btns" style="text-align:${align(b.p.align)}">${lines(b.p.items).slice(0, 8).map((l) => { const [t, u] = cells(l); return `<a class="vx-btn ${b.p.style === 'outline' ? 'outline' : ''}" href="${esc(safeUrl(u))}">${esc(t)}</a>`; }).join(' ')}</p>` },
    alert: { label: 'Notice / callout', group: 'Text', icon: '❕', p: { kind: 'info', title: 'Good to know', text: 'Use a notice to point out something important.' }, f: [F.sel('kind', 'Kind', ['info', 'success', 'warning', 'danger']), F.text('title', 'Title'), F.area('text', 'Text')], html: (b) => { const k = kindOf(b.p.kind, ['info', 'success', 'warning', 'danger'], 'info'); return `<div class="vx-alert ${k}" role="${k === 'danger' || k === 'warning' ? 'alert' : 'note'}">${b.p.title ? `<strong>${esc(b.p.title)}</strong>` : ''}${paras(b.p.text)}</div>`; } },
    code: { label: 'Code', group: 'Text', icon: '</>', p: { text: 'npm install my-package', lang: 'bash', copy: true }, f: [F.area('text', 'Code'), F.text('lang', 'Language label (optional)'), F.bool('copy', 'Show a Copy button')], html: (b) => `<div class="vx-code">${b.p.lang ? `<small>${esc(b.p.lang)}</small>` : ''}${b.p.copy ? '<button type="button" class="vx-copy" data-copy="1">Copy</button>' : ''}<pre><code>${esc(b.p.text)}</code></pre></div>` },
    gallery: { label: 'Image gallery', group: 'Media', icon: '▦', p: { items: '', cols: 3, lightbox: true, ratio: 'auto' }, f: [F.area('items', 'One picture per line: address | caption', { pick: 'images' }), F.sel('cols', 'Columns', [[2, '2'], [3, '3'], [4, '4'], [5, '5']]), F.sel('ratio', 'Shape', [['auto', 'Original'], ['square', 'Square'], ['wide', 'Wide 16:9']]), F.bool('lightbox', 'Open pictures bigger when clicked')], html: (b, ctx) => { const it = lines(b.p.items).slice(0, 60).map((l) => { const [u, c] = cells(l); return { s: safeImg(u), c: c || '' }; }).filter((x) => x.s); if (!it.length) return '<div class="vx-note">Add pictures to this gallery (one per line, or “Add pictures…”).</div>'; return `<div class="vx-gal ${kindOf(b.p.ratio, ['auto', 'square', 'wide'], 'auto')}" data-vx-gallery="${b.p.lightbox === false ? '' : '1'}" style="grid-template-columns:repeat(${num(b.p.cols, 2, 5, 3)},minmax(0,1fr))">${it.map((x) => `<figure><a class="vx-lb" href="${esc(x.s)}" data-cap="${esc(x.c)}"><img src="${esc(x.s)}" alt="${esc(x.c)}" loading="lazy"></a>${x.c ? `<figcaption>${esc(x.c)}</figcaption>` : ''}</figure>`).join('')}</div>`; } },
    video: { label: 'Video', group: 'Media', icon: '▶', p: { url: '', title: 'Video', ratio: '16:9' }, f: [F.text('url', 'YouTube or Vimeo address, or a .mp4 / .webm file'), F.text('title', 'Title (for screen readers)'), F.sel('ratio', 'Shape', ['16:9', '4:3', '1:1'])], html: (b) => { const v = videoInfo(b.p.url); const r = kindOf(b.p.ratio, ['16:9', '4:3', '1:1'], '16:9').replace(':', '/'); if (!v) return '<div class="vx-note">Paste a YouTube or Vimeo address, or a link to a .mp4 / .webm file.</div>'; return v.kind === 'file' ? `<video class="vx-video" controls preload="metadata" src="${esc(v.src)}" aria-label="${esc(b.p.title)}" style="aspect-ratio:${r}"></video>` : `<div class="vx-video" style="aspect-ratio:${r}"><iframe src="${esc(v.src)}" title="${esc(b.p.title)}" ${emb}></iframe></div>`; } },
    map: { label: 'Map', group: 'Media', icon: '⌖', p: { lat: 51.5074, lon: -0.1278, zoom: 13, title: 'Map' }, f: [F.num('lat', 'Latitude', -85, 85), F.num('lon', 'Longitude', -180, 180), F.num('zoom', 'Zoom (3 far – 18 close)', 3, 18), F.text('title', 'Title (for screen readers)')], html: (b) => { const m = mapInfo(b); return `<div class="vx-map"><iframe src="${esc(m.src)}" title="${esc(b.p.title)}" ${emb}></iframe><p><a href="${esc(m.big)}" rel="noopener noreferrer">View a larger map (OpenStreetMap)</a></p></div>`; } },
    section: { label: 'Section (container)', group: 'Layout', icon: '▭▭', p: { bg: '#f3f6fb', fg: '', image: '', overlay: 0, pad: 48, width: 'contained', gap: 16 }, f: [F.color('bg', 'Background'), F.color('fg', 'Text colour (empty = automatic)'), F.text('image', 'Background picture (optional)', { pick: 'image' }), F.num('overlay', 'Darken the picture (%)', 0, 80), F.num('pad', 'Space inside, top & bottom (px)', 0, 200), F.sel('width', 'Content width', [['contained', 'Same as the page'], ['narrow', 'Narrow'], ['full', 'Full width']])], cols: () => 1, html: (b, ctx, kids) => { const im = safeImg(b.p.image), ov = num(b.p.overlay, 0, 80, 0) / 100, bg = color(b.p.bg, ''); const layers = [im && ov ? `linear-gradient(rgba(0,0,0,${ov}),rgba(0,0,0,${ov}))` : '', im ? `url('${esc(im).replace(/'/g, '%27')}') center/cover` : '', bg].filter(Boolean).join(','); const fg = color(b.p.fg, ''); return `<section class="vx-sec ${kindOf(b.p.width, ['contained', 'narrow', 'full'], 'contained')}" style="${layers ? 'background:' + layers + ';' : ''}${fg ? 'color:' + fg + ';' : ''}padding:${num(b.p.pad, 0, 200, 48)}px 16px"><div class="vx-sec-in"><div class="vx-col">${kids[0] || ''}</div></div></section>`; } },
    tabs: { label: 'Tabs', group: 'Interactive', icon: '⊟', p: { count: 3, labels: 'Overview\nDetails\nReviews' }, f: [F.sel('count', 'Tabs', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']]), F.area('labels', 'Tab names (one per line)')], cols: (b) => colsOf(b.p.count, 3), html: (b, ctx, kids) => { const n = colsOf(b.p.count, 3), names = lines(b.p.labels), nm = (i) => names[i] || 'Tab ' + (i + 1), id = 't' + esc(b.id), ed = ctx.editing; return `<div class="vx-tabs" data-vx-tabs="1"><div class="vx-tablist" role="tablist">${kids.slice(0, n).map((k, i) => `<button type="button" role="tab" id="${id}-t${i}" aria-controls="${id}-p${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(nm(i))}</button>`).join('')}</div>${kids.slice(0, n).map((k, i) => `<div class="vx-tabpanel" role="tabpanel" id="${id}-p${i}" aria-labelledby="${id}-t${i}"${i && !ed ? ' hidden' : ''}>${ed ? `<div class="vx-tabh">Tab: ${esc(nm(i))}</div>` : ''}<div class="vx-col">${k}</div></div>`).join('')}</div>`; } },
    accordion: { label: 'Accordion (FAQ)', group: 'Interactive', icon: '☰', p: { count: 3, titles: 'What is this?\nHow does it work?\nWhat does it cost?', first: true, single: true }, f: [F.sel('count', 'Items', [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']]), F.area('titles', 'Questions / titles (one per line)'), F.bool('first', 'Open the first one'), F.bool('single', 'Only one open at a time')], cols: (b) => colsOf(b.p.count, 3), html: (b, ctx, kids) => { const n = colsOf(b.p.count, 3), names = lines(b.p.titles), id = 'a' + esc(b.id); return `<div class="vx-acc">${kids.slice(0, n).map((k, i) => `<details class="vx-det"${b.p.single !== false ? ` name="${id}"` : ''}${(i === 0 && b.p.first !== false) || ctx.editing ? ' open' : ''}><summary>${esc(names[i] || 'Item ' + (i + 1))}</summary><div class="vx-col">${k}</div></details>`).join('')}</div>`; } },
    countdown: { label: 'Countdown', group: 'Interactive', icon: '⏱', p: { title: 'We launch in', to: '', done: 'It’s here!' }, f: [F.text('title', 'Title'), { k: 'to', label: 'Counts down to', t: 'datetime' }, F.text('done', 'Message when it is over')], html: (b) => { const to = dateOk(b.p.to); return `<div class="vx-cdwrap" data-to="${esc(to)}" data-done="${esc(b.p.done)}" role="timer">${b.p.title ? `<h3>${esc(b.p.title)}</h3>` : ''}<div class="vx-cd">${to ? '…' : '<span class="vx-note">Pick a date and time.</span>'}</div></div>`; } },
    stats: { label: 'Numbers / stats', group: 'Interactive', icon: '№', p: { items: '1,200+ | Happy customers\n98% | Would recommend\n24/7 | Support', cols: 3, count: true }, f: [F.area('items', 'One per line: number | label'), F.sel('cols', 'Columns', [[2, '2'], [3, '3'], [4, '4']]), F.bool('count', 'Count up when scrolled into view')], html: (b) => `<div class="vx-stats" style="grid-template-columns:repeat(${num(b.p.cols, 2, 4, 3)},minmax(0,1fr))">${lines(b.p.items).slice(0, 8).map((l) => { const [v, t] = cells(l); return `<div class="vx-stat"><b${b.p.count !== false ? ` data-count="${esc(v)}"` : ''}>${esc(v)}</b><span>${esc(t || '')}</span></div>`; }).join('')}</div>` },
    features: { label: 'Feature grid', group: 'Content', icon: '✦', p: { items: '⚡ | Fast | Loads in a blink on any phone.\n🔒 | Safe | Your visitors’ data stays protected.\n🎨 | Yours | Change colours, fonts and layout freely.', cols: 3, look: 'cards', align: 'left' }, f: [F.area('items', 'One per line: icon | title | text'), F.sel('cols', 'Columns', [[2, '2'], [3, '3'], [4, '4']]), F.sel('look', 'Look', ['cards', 'plain']), F.sel('align', 'Align', ['left', 'center'])], html: (b) => `<div class="vx-feats ${b.p.look === 'plain' ? 'plain' : ''}" style="grid-template-columns:repeat(${num(b.p.cols, 2, 4, 3)},minmax(0,1fr));text-align:${b.p.align === 'center' ? 'center' : 'left'}">${lines(b.p.items).slice(0, 12).map((l) => { const [i, t, x] = cells(l); return `<div class="vx-feat"><div class="vx-ficon" aria-hidden="true">${esc(String(i || '').slice(0, 4))}</div><h3>${esc(t || '')}</h3><p>${esc(x || '')}</p></div>`; }).join('')}</div>` },
    pricing: { label: 'Pricing plans', group: 'Content', icon: '$', p: { plans: 'Free | $0 | forever | 1 project; Community support | Start free | /signup.html\n*Pro | $12 | per month | Unlimited projects; Priority support; Custom domain | Go Pro | /signup.html\nTeam | $39 | per month | Everything in Pro; 10 seats; Roles | Contact us | /contact.html' }, f: [F.area('plans', 'One plan per line: Name | Price | Period | Feature; Feature; … | Button | Address   (start the name with * to highlight it)')], html: (b) => { const pl = lines(b.p.plans).slice(0, 4); return `<div class="vx-plans" style="grid-template-columns:repeat(${Math.max(1, pl.length)},minmax(0,1fr))">${pl.map((l) => { const hi = l.startsWith('*'); const [n, pr, per, fe, bt, u] = cells(hi ? l.slice(1) : l); return `<div class="vx-plan${hi ? ' hi' : ''}">${hi ? '<em class="vx-flag">Popular</em>' : ''}<h3>${esc(n || '')}</h3><p class="vx-price"><b>${esc(pr || '')}</b> <span>${esc(per || '')}</span></p><ul>${String(fe || '').split(';').map((x) => x.trim()).filter(Boolean).slice(0, 12).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${bt ? `<a class="vx-btn${hi ? '' : ' outline'}" href="${esc(safeUrl(u))}">${esc(bt)}</a>` : ''}</div>`; }).join('')}</div>`; } },
    testimonials: { label: 'Testimonials', group: 'Content', icon: '❝', p: { items: 'Setting it up took ten minutes. | Alex Rivera | Founder, Northwind\nExactly what we needed – and it just works. | Sam Okafor | Designer', cols: 2 }, f: [F.area('items', 'One per line: quote | name | role'), F.sel('cols', 'Columns', [[1, '1'], [2, '2'], [3, '3']])], html: (b) => `<div class="vx-testi" style="grid-template-columns:repeat(${num(b.p.cols, 1, 3, 2)},minmax(0,1fr))">${lines(b.p.items).slice(0, 9).map((l) => { const [q, n, r] = cells(l); return `<figure class="vx-quote"><blockquote>${esc(q || '')}</blockquote><figcaption><strong>${esc(n || '')}</strong>${r ? ' <span>' + esc(r) + '</span>' : ''}</figcaption></figure>`; }).join('')}</div>` },
    table: { label: 'Table', group: 'Content', icon: '▦', p: { rows: 'Name | Role | City\nAda | Engineer | London\nGrace | Admiral | New York', header: true, striped: true }, f: [F.area('rows', 'One row per line, cells separated by |  (or commas)'), F.bool('header', 'First row is a header'), F.bool('striped', 'Alternate row shading')], html: (b) => { const rows = lines(b.p.rows).slice(0, 60).map((l) => (l.includes('|') ? cells(l) : l.split(',').map((x) => x.trim())).slice(0, 12)); if (!rows.length) return '<div class="vx-note">Type some rows.</div>'; const hd = b.p.header !== false; return `<div class="vx-tablewrap"><table class="vx-table${b.p.striped !== false ? ' striped' : ''}">${hd ? `<thead><tr>${rows[0].map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>` : ''}<tbody>${rows.slice(hd ? 1 : 0).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; } },
    form: { label: 'Form (saves to database)', group: 'Data', icon: '✉', p: { collection: '', title: 'Contact us', button: 'Send', success: 'Thank you! We got your message.', steps: 0, redirect: '' }, f: [F.coll('collection', 'Saves into this collection'), F.text('title', 'Title'), F.text('button', 'Button label'), F.text('success', 'Message after sending'), F.sel('steps', 'Split into steps', [[0, 'No – one page'], [2, 'Fields per step: 2'], [3, 'Fields per step: 3'], [4, 'Fields per step: 4'], [5, 'Fields per step: 5']]), F.text('redirect', 'After sending go to (optional)', { pickPage: 1 })], needs: 'collection', html: (b, ctx) => { const c = (ctx.site.collections || []).find((x) => x.name === b.p.collection); if (!c) return '<div class="vx-note">Pick a collection for this form (Data tab).</div>'; const id = 'f' + esc(b.id); const per = num(b.p.steps, 0, 8, 0); const flds = c.fields.map((f) => field(f, id)); const multi = per >= 1 && flds.length > per; let body; if (multi) { const chunks = []; for (let i = 0; i < flds.length; i += per) chunks.push(flds.slice(i, i + per)); body = chunks.map((ch, i) => `<div class="vx-step" data-step="${i}">${ch.join('')}</div>`).join('') + '<p class="vx-prog" aria-live="polite"></p>'; } else body = flds.join(''); const hp = '<div class="vx-hp" aria-hidden="true"><label>Leave empty<input type="text" name="_hp" tabindex="-1" autocomplete="off"></label></div>'; const btns = multi ? `<div class="vx-stepbtns"><button class="vx-btn outline vx-back" type="button">Back</button> <button class="vx-btn vx-next" type="button">Next</button> <button class="vx-btn vx-send" type="submit">${esc(b.p.button || 'Send')}</button></div>` : `<button class="vx-btn" type="submit">${esc(b.p.button || 'Send')}</button>`; return `<form class="vx-form" data-collection="${esc(c.name)}" data-success="${esc(b.p.success)}"${b.p.redirect ? ` data-redirect="${esc(safeUrl(b.p.redirect))}"` : ''} novalidate>${b.p.title ? `<h3>${esc(b.p.title)}</h3>` : ''}${body}${hp}${btns}<p class="vx-msg" role="status" aria-live="polite"></p></form>`; } },
    list: { label: 'List from database', group: 'Data', icon: '☰', p: { collection: '', title: '', layout: 'cards', limit: 50, fields: '', search: false, sort: '', order: 'asc', per: 0, empty: 'Nothing here yet.' }, f: [F.coll('collection', 'Show entries of'), F.text('title', 'Title'), F.sel('layout', 'Layout', ['cards', 'table', 'list']), F.num('limit', 'Load how many (newest first)', 1, 200), F.text('fields', 'Fields to show (comma separated, empty = all)'), F.bool('search', 'Add a search box'), F.text('sort', 'Sort by field (empty = newest first)'), F.sel('order', 'Sort order', [['asc', 'A → Z / low → high'], ['desc', 'Z → A / high → low']]), F.num('per', 'Entries per page (0 = all on one page)', 0, 100), F.text('empty', 'Message when empty')], needs: 'collection', html: (b, ctx) => { const c = (ctx.site.collections || []).find((x) => x.name === b.p.collection); if (!c) return '<div class="vx-note">Pick a collection for this list (Data tab).</div>'; const lay = kindOf(b.p.layout, ['cards', 'table', 'list'], 'cards'); return `<div class="vx-listwrap">${b.p.title ? `<h3>${esc(b.p.title)}</h3>` : ''}${b.p.search ? '<p><input class="vx-q" type="search" placeholder="Search…" aria-label="Search this list"></p>' : ''}<div class="vx-list" data-collection="${esc(c.name)}" data-layout="${lay}" data-limit="${num(b.p.limit, 1, 200, 50)}" data-fields="${esc(b.p.fields)}" data-sort="${esc(String(b.p.sort || '').replace(/[^\w-]/g, ''))}" data-order="${b.p.order === 'desc' ? 'desc' : 'asc'}" data-per="${num(b.p.per, 0, 100, 0)}" data-empty="${esc(b.p.empty || 'Nothing here yet.')}" data-labels="${esc(JSON.stringify(Object.fromEntries(c.fields.map((f) => [f.key, f.label || f.key]))))}"><p class="vx-empty">${ctx.editing ? 'Entries appear here once visitors add them.' : 'Loading…'}</p></div><div class="vx-pager" hidden></div>${c.public ? '' : '<div class="vx-note">This collection is private – turn on “Visitors may read” in the Data tab to show it.</div>'}</div>`; } },
    signup: { label: 'Sign-up form', group: 'Members', icon: '＋', p: { title: 'Create an account', button: 'Sign up', redirect: '' }, f: [F.text('title', 'Title'), F.text('button', 'Button label'), F.text('redirect', 'After signing up go to', { pickPage: 1 })], html: (b) => `<form class="vx-auth" data-mode="signup" data-redirect="${esc(safeUrl(b.p.redirect || ''))}" novalidate><h3>${esc(b.p.title)}</h3><label>Name<input name="name" autocomplete="name"></label><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" autocomplete="new-password" required></label><button class="vx-btn" type="submit">${esc(b.p.button)}</button><p class="vx-msg" role="status" aria-live="polite"></p></form>` },
    login: { label: 'Login form', group: 'Members', icon: '⏻', p: { title: 'Log in', button: 'Log in', redirect: '' }, f: [F.text('title', 'Title'), F.text('button', 'Button label'), F.text('redirect', 'After logging in go to', { pickPage: 1 })], html: (b) => `<form class="vx-auth" data-mode="login" data-redirect="${esc(safeUrl(b.p.redirect || ''))}" novalidate><h3>${esc(b.p.title)}</h3><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="vx-btn" type="submit">${esc(b.p.button)}</button><p class="vx-msg" role="status" aria-live="polite"></p></form>` },
    account: { label: 'Who is logged in', group: 'Members', icon: '☺', p: { guest: 'You are not logged in.', hello: 'Hello' }, f: [F.text('guest', 'Text for visitors'), F.text('hello', 'Greeting')], html: (b) => `<p class="vx-account" data-guest="${esc(b.p.guest)}" data-hello="${esc(b.p.hello)}">${esc(b.p.guest)}</p>` },
  };
  const FIELD_TYPES = ['text', 'email', 'number', 'textarea', 'select', 'checkbox', 'radio', 'date', 'url', 'tel', 'rating'];
  function field(f, id) {
    const n = esc(f.key), i = id + '-' + n, lab = esc(f.label || f.key), req = f.required ? ' required' : '', star = f.required ? ' <span aria-hidden="true">*</span>' : '';
    const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '', hid = f.help ? ` aria-describedby="${i}-h"` : '', help = f.help ? `<small class="vx-help" id="${i}-h">${esc(f.help)}</small>` : '';
    let h;
    if (f.type === 'textarea') h = `<label for="${i}">${lab}${star}</label><textarea id="${i}" name="${n}" rows="4"${req}${ph}${hid}${f.maxLength ? ` maxlength="${num(f.maxLength, 1, 5000, 5000)}"` : ''}></textarea>`;
    else if (f.type === 'select') h = `<label for="${i}">${lab}${star}</label><select id="${i}" name="${n}"${req}${hid}><option value=""></option>${(f.options || []).map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
    else if (f.type === 'radio') h = `<fieldset class="vx-radio"><legend>${lab}${star}</legend>${(f.options || []).map((o, k) => `<label class="vx-check"><input type="radio" name="${n}" value="${esc(o)}"${k === 0 && f.required ? ' required' : ''}> ${esc(o)}</label>`).join('')}</fieldset>`;
    else if (f.type === 'rating') h = `<label for="${i}">${lab}${star}</label><select id="${i}" name="${n}"${req}${hid}><option value=""></option>${[1, 2, 3, 4, 5].map((k) => `<option value="${k}">${'★'.repeat(k)} (${k})</option>`).join('')}</select>`;
    else if (f.type === 'checkbox') h = `<label class="vx-check"><input id="${i}" type="checkbox" name="${n}"${req}${hid}> ${lab}${star}</label>`;
    else h = `<label for="${i}">${lab}${star}</label><input id="${i}" name="${n}" type="${{ email: 'email', number: 'number', date: 'date', url: 'url', tel: 'tel' }[f.type] || 'text'}"${req}${ph}${hid}${f.maxLength ? ` maxlength="${num(f.maxLength, 1, 300, 300)}"` : ''}${f.type === 'email' ? ' autocomplete="email"' : f.type === 'tel' ? ' autocomplete="tel"' : ''}>`;
    const si = f.showIf && f.showIf.field ? ` data-showif="${esc(f.showIf.field)}|${esc(f.showIf.equals == null ? '' : f.showIf.equals)}"` : '';
    return `<div class="vx-fld"${si}>${h}${help}</div>`;
  }

  /* ---------- style options every block has (spacing, colours, border, shadow, width, who sees it, animation) ---------- */
  const SHADOWS = { soft: '0 4px 18px rgba(0,0,0,.12)', strong: '0 12px 40px rgba(0,0,0,.28)' };
  const BORDERS = { thin: '1px solid rgba(128,128,128,.45)', thick: '3px solid rgba(128,128,128,.55)', accent: '2px solid var(--p)' };
  function cleanStyle(s) {
    const o = {}; if (!s || typeof s !== 'object') return o;
    for (const k of ['pt', 'pb']) { const n = num(s[k], 0, 240, 0); if (n) o[k] = n; }
    { const n = num(s.px, 0, 160, 0); if (n) o.px = n; }
    for (const k of ['bg', 'fg']) { const c = color(s[k], ''); if (c) o[k] = c; }
    { const n = num(s.radius, 0, 60, 0); if (n) o.radius = n; }
    if (BORDERS[s.border]) o.border = s.border; if (SHADOWS[s.shadow]) o.shadow = s.shadow;
    { const n = num(s.maxw, 0, 1600, 0); if (n) o.maxw = n; }
    if (['left', 'center', 'right'].includes(s.self)) o.self = s.self;
    if (['phone', 'desktop'].includes(s.hide)) o.hide = s.hide;
    if (['guests', 'members'].includes(s.vis)) o.vis = s.vis;
    if (['fade', 'up', 'zoom'].includes(s.anim)) o.anim = s.anim;
    { const a = idOf(s.anchor); if (a) o.anchor = a; }
    return o;
  }
  function styled(b, html, ctx) {
    const s = cleanStyle(b.s); const keys = Object.keys(s); if (!keys.length) return html;
    const st = [], cl = ['vx-b']; const ed = ctx && ctx.editing;
    if (s.pt) st.push(`padding-top:${s.pt}px`); if (s.pb) st.push(`padding-bottom:${s.pb}px`); if (s.px) st.push(`padding-left:${s.px}px;padding-right:${s.px}px`);
    if (s.bg) st.push(`background:${s.bg}`); if (s.fg) st.push(`color:${s.fg}`); if (s.radius) st.push(`border-radius:${s.radius}px`);
    if (s.border) st.push(`border:${BORDERS[s.border]}`); if (s.shadow) st.push(`box-shadow:${SHADOWS[s.shadow]}`);
    if (s.maxw) st.push(`max-width:${s.maxw}px;margin-left:${s.self === 'left' ? '0' : 'auto'};margin-right:${s.self === 'right' ? '0' : 'auto'}`);
    if (!ed) { if (s.hide) cl.push('vx-hide-' + s.hide); if (s.anim) cl.push('vx-an', 'vx-an-' + s.anim); }
    return `<div class="${cl.join(' ')}"${s.anchor ? ` id="${esc(s.anchor)}"` : ''}${s.vis && !ed ? ` data-vis="${s.vis}"` : ''}${st.length ? ` style="${st.join(';')}"` : ''}>${html}</div>`;
  }

  const slotsOf = (b, d) => (d.cols ? (typeof d.cols === 'function' ? d.cols(b) : num(b.p.count, 2, 4, 2)) : 0);
  function blockHtml(b, ctx, wrap) {
    const d = BLOCKS[b.type]; if (!d) return '';
    const n = slotsOf(b, d);
    const kids = d.cols ? Array.from({ length: n }, (_, i) => ((b.cols && b.cols[i]) || []).map((x) => blockHtml(x, ctx, wrap)).join('')) : null;
    let html; try { html = styled(b, d.html(b, ctx, kids || []), ctx); } catch { html = ''; }
    return wrap ? wrap(b, html, kids) : html;
  }
  const newBlock = (type) => { const d = BLOCKS[type]; const b = { id: uid(), type, p: JSON.parse(JSON.stringify(d.p)) }; if (d.cols) b.cols = [[], [], [], [], [], []]; return b; };

  /* ---------- ready-made sections and page starters ---------- */
  const mk = (type, p, cols, st) => { const b = newBlock(type); Object.assign(b.p, p || {}); (cols || []).forEach((c, i) => { b.cols[i] = c; }); if (st) b.s = st; return b; };
  const H = (text, level) => mk('heading', { text, level: level || 2, align: 'center' });
  const SECTIONS = [
    { id: 'hero', label: 'Hero with two buttons', build: () => [mk('hero', { title: 'Build something people love', sub: 'One clear sentence about what you offer and who it is for.', label: 'Get started', label2: 'See how it works', href: '#', href2: '#features', overlay: 0, minh: 320 })] },
    { id: 'features', label: 'Features', build: () => [H('Why choose us'), mk('features', {}, null, { anchor: 'features' })] },
    { id: 'stats', label: 'Numbers strip', build: () => [mk('stats', {})] },
    { id: 'pricing', label: 'Pricing', build: () => [H('Simple pricing'), mk('pricing', {})] },
    { id: 'testimonials', label: 'Testimonials', build: () => [H('What people say'), mk('testimonials', {})] },
    { id: 'faq', label: 'FAQ', build: () => [H('Questions, answered'), mk('accordion', {}, [[mk('text', { text: 'Explain it in a sentence or two.' })], [mk('text', { text: 'Describe the steps.' })], [mk('text', { text: 'Be upfront about the price.' })]])] },
    { id: 'contact', label: 'Contact (text + form)', build: (site) => { const f = mk('form', { title: 'Write to us', collection: ((site && site.collections && site.collections[0]) || {}).name || '' }); return [H('Get in touch'), mk('columns', { count: 2, ratio: 'wide-left' }, [[mk('text', { text: 'Tell us what you need and we will reply as soon as we can.' }), mk('map', { zoom: 12 })], [f]])]; } },
    { id: 'gallery', label: 'Image gallery', build: () => [H('Gallery'), mk('gallery', {})] },
    { id: 'cta', label: 'Call to action band', build: () => [mk('section', { bg: '#2457d6', fg: '#ffffff', pad: 40 }, [[mk('heading', { text: 'Ready to start?', level: 2, align: 'center' }), mk('buttons', { items: 'Create your account | /signup.html', style: 'primary', align: 'center' })]])] },
  ];
  const PAGE_TEMPLATES = [
    { id: 'blank', label: 'Blank page', build: () => [mk('heading', { text: 'New page', level: 1, align: 'left' })] },
    { id: 'landing', label: 'Landing page', build: (site) => ['hero', 'features', 'stats', 'testimonials', 'pricing', 'cta'].flatMap((id) => SECTIONS.find((x) => x.id === id).build(site)) },
    { id: 'about', label: 'About us', build: () => [mk('heading', { text: 'About us', level: 1, align: 'left' }), mk('columns', { count: 2 }, [[mk('richtext', { md: 'We are a small team that cares about making things **simple**.\n\nWrite your story here.' })], [mk('image', { alt: 'Our team' })]]), mk('stats', {}), H('Meet the team'), mk('testimonials', {})] },
    { id: 'pricing', label: 'Pricing page', build: (site) => ['pricing', 'faq'].flatMap((id) => SECTIONS.find((x) => x.id === id).build(site)) },
    { id: 'contact', label: 'Contact page', build: (site) => SECTIONS.find((x) => x.id === 'contact').build(site) },
    { id: 'faq', label: 'FAQ page', build: (site) => SECTIONS.find((x) => x.id === 'faq').build(site) },
  ];
  const sectionBlocks = (id, site) => { const t = SECTIONS.find((x) => x.id === id); return t ? t.build(site) : []; };
  const pageBlocks = (id, site) => { const t = PAGE_TEMPLATES.find((x) => x.id === id) || PAGE_TEMPLATES[0]; return t.build(site); };

  /* ---------- sites ---------- */
  const themeDefault = () => ({ primary: '#2457d6', bg: '#ffffff', text: '#1b2333', font: 'system', headFont: 'same', radius: 10, width: 1000, dark: 'light', buttons: 'rounded' });
  const blank = (name) => ({
    v: 1, name: name || 'My website', theme: themeDefault(), nav: { show: true, sticky: false, brand: name || 'My website', footer: '© ' + new Date().getFullYear() + ' ' + (name || 'My website') },
    security: { rateLimit: 60, maxBodyKB: 64, honeypot: true, allowSignup: true, sessionHours: 168, passwordMin: 10, csp: true },
    hosting: { port: 8080, host: '0.0.0.0', publicUrl: '', forceHttps: false, trustProxy: false },
    a11y: { listen: true, skipLink: true },
    collections: [{ name: 'messages', label: 'Contact messages', public: false, submit: 'anyone', fields: [{ key: 'name', label: 'Your name', type: 'text', required: true }, { key: 'email', label: 'Email', type: 'email', required: true }, { key: 'message', label: 'Message', type: 'textarea', required: true }] }],
    pages: [{ id: uid(), title: 'Home', slug: 'home', access: 'public', inNav: true, blocks: [{ ...newBlock('hero') }, newBlock('text')] }, (() => { const f = newBlock('form'); f.p.collection = 'messages'; return { id: uid(), title: 'Contact', slug: 'contact', access: 'public', inNav: true, blocks: [newBlock('heading'), f] }; })()],
  });
  const fileOf = (p) => (p.slug === 'home' ? 'index.html' : p.slug + '.html');
  const usesAuth = (site) => site.pages.some((p) => p.access === 'members' || JSON.stringify(p.blocks).match(/"type":"(signup|login|account)"|"vis":"(members|guests)"/)) || (site.collections || []).some((c) => c.submit === 'members');
  const hasType = (list, t) => (list || []).some((b) => b.type === t || (b.cols || []).some((c) => hasType(c, t)));

  /** problems the owner should fix before publishing: [{level:'error'|'warn', text}] */
  function check(site) {
    const out = [], slugs = new Set(), names = new Set();
    for (const p of site.pages) { if (slugs.has(p.slug)) out.push({ level: 'error', text: `Two pages use the address “${p.slug}”.` }); slugs.add(p.slug); }
    if (!site.pages.some((p) => p.slug === 'home')) out.push({ level: 'error', text: 'There is no page with the address “home” – it becomes the front page.' });
    for (const c of site.collections || []) { if (names.has(c.name)) out.push({ level: 'error', text: `Two collections are called “${c.name}”.` }); names.add(c.name); if (!c.fields.length) out.push({ level: 'warn', text: `Collection “${c.label || c.name}” has no fields.` }); }
    const walk = (list, pg) => { for (const b of list || []) { const d = BLOCKS[b.type]; if (d && d.needs === 'collection' && !(site.collections || []).some((c) => c.name === b.p.collection)) out.push({ level: 'error', text: `A ${d.label.toLowerCase()} on “${pg}” has no collection.` }); if (b.type === 'image' && b.p.src && !b.p.alt) out.push({ level: 'warn', text: `An image on “${pg}” has no description (screen readers need one).` }); (b.cols || []).forEach((c) => walk(c, pg)); } };
    for (const p of site.pages) walk(p.blocks, p.title);
    { let vis = false, vid = 0; const w2 = (list) => { for (const b of list || []) { if (b.s && b.s.vis) vis = true; if (b.type === 'video' && !videoInfo(b.p.url)) vid++; if (b.type === 'gallery' && !lines(b.p.items).length) out.push({ level: 'warn', text: 'A gallery has no pictures yet.' }); (b.cols || []).forEach(w2); } }; for (const p of site.pages) w2(p.blocks);
      if (vis) out.push({ level: 'warn', text: 'Blocks set to “members” or “guests” are only hidden on the page. Anyone can still read them in the page source – put private content on a “Members only” page.' });
      if (vid) out.push({ level: 'warn', text: vid + ' video block(s) have no valid YouTube, Vimeo or .mp4/.webm address.' }); }
    if (site.pages.some((p) => p.access === 'members') && !site.pages.some((p) => hasType(p.blocks, 'login')) && !site.pages.some((p) => p.slug === 'login')) out.push({ level: 'warn', text: 'Members-only pages exist, so a simple Login page will be added for you.' });
    if (!site.hosting.publicUrl) out.push({ level: 'warn', text: 'No public address set (Hosting tab) – fine for testing.' });
    if (site.hosting.publicUrl && !/^https:/i.test(site.hosting.publicUrl)) out.push({ level: 'warn', text: 'Use an https:// address for a real site so logins stay private.' });
    return out;
  }

  const FONTS = { system: 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif', serif: 'Georgia,"Times New Roman",serif', mono: 'ui-monospace,Menlo,Consolas,monospace', rounded: '"Trebuchet MS","Segoe UI",system-ui,sans-serif' };
  const EXTRA_CSS = String.raw`.vx-btn{border-radius:var(--br)}.vx-btn.sz-s{padding:5px 12px;font-size:.88em}.vx-btn.sz-l{padding:14px 28px;font-size:1.15em}.vx-btn.full{display:block;text-align:center}.vx-btn.soft{background:rgba(128,128,128,.16);color:var(--tx);border-color:transparent}.vx-btn.ghostw{background:transparent;color:inherit;border-color:currentColor}.vx-btns .vx-btn{margin:4px 4px 4px 0}
.vx-b{display:flow-root}.vx-hero .vx-btns{margin-top:6px}
.vx-image.square img{border-radius:0}.vx-image.circle img{border-radius:50%;aspect-ratio:1;object-fit:cover}
.vx-hr2{margin:24px 0;text-align:center;position:relative;line-height:0}.vx-hr2.line{border-top:1px solid rgba(128,128,128,.35)}.vx-hr2.dots{height:12px;background:radial-gradient(circle,rgba(128,128,128,.6) 2px,transparent 3px) center/18px 12px repeat-x}.vx-hr2.fade{height:1px;background:linear-gradient(90deg,transparent,rgba(128,128,128,.6),transparent)}.vx-hr2 span{background:var(--bg);padding:0 12px;line-height:1;position:relative;top:-.5em;font-size:.9em;opacity:.75}.vx-hr2.line:has(span){border-top:0;background:linear-gradient(rgba(128,128,128,.35),rgba(128,128,128,.35)) center/100% 1px no-repeat}
.vx-md h1,.vx-md h2,.vx-md h3,.vx-md h4{margin:1em 0 .4em}.vx-md blockquote,.vx-quote blockquote{margin:.8em 0;padding:.2em 1em;border-left:4px solid var(--p);opacity:.9}.vx-md code,.vx-code code{font-family:ui-monospace,Menlo,Consolas,monospace}.vx-md code{background:rgba(128,128,128,.18);padding:1px 5px;border-radius:4px}.vx-md pre,.vx-code pre{background:#0f1420;color:#e6edf7;padding:14px 16px;border-radius:var(--r);overflow:auto;margin:.6em 0}
.vx-code{position:relative}.vx-code small{position:absolute;left:14px;top:4px;color:#93a1bd;font-size:.72em;z-index:1}.vx-code pre{padding-top:24px}.vx-copy{position:absolute;right:8px;top:6px;z-index:1;border:1px solid #4a5670;background:#1b2335;color:#dfe7f5;border-radius:6px;padding:2px 10px;font:600 12px system-ui;cursor:pointer}
.vx-alert{border-left:5px solid var(--p);background:rgba(36,87,214,.1);border-radius:calc(var(--r) / 1.5);padding:10px 16px;margin:14px 0}.vx-alert p{margin:.3em 0}.vx-alert.success{border-color:#17803d;background:rgba(23,128,61,.12)}.vx-alert.warning{border-color:#d98a00;background:rgba(245,166,35,.16)}.vx-alert.danger{border-color:#b3261e;background:rgba(179,38,30,.12)}
.vx-gal{display:grid;gap:10px;margin:16px 0}.vx-gal figure{margin:0}.vx-gal img{width:100%;display:block;border-radius:calc(var(--r) / 1.5)}.vx-gal.square img{aspect-ratio:1;object-fit:cover}.vx-gal.wide img{aspect-ratio:16/9;object-fit:cover}.vx-gal figcaption{font-size:.85em;opacity:.75;margin-top:4px}.vx-gal a{display:block}
.vx-dlg{border:0;border-radius:var(--r);padding:0;max-width:min(94vw,1100px);background:#111;color:#fff}.vx-dlg::backdrop{background:rgba(0,0,0,.75)}.vx-dlg img{display:block;max-width:94vw;max-height:80vh;margin:0 auto}.vx-dlg p{margin:0;padding:8px 14px;text-align:center}.vx-dlg .bar{display:flex;gap:8px;justify-content:center;padding:8px}.vx-dlg button{background:#2b3345;color:#fff;border:0;border-radius:8px;padding:6px 14px;font:600 14px system-ui;cursor:pointer}
.vx-video{display:block;width:100%;margin:16px 0;border-radius:var(--r);overflow:hidden;background:#000}.vx-video iframe{width:100%;height:100%;border:0}.vx-map iframe{width:100%;height:340px;border:0;border-radius:var(--r);display:block}.vx-map p{font-size:.85em;margin:4px 0}
.vx-sec{margin:12px 0;border-radius:var(--r)}.vx-sec.contained .vx-sec-in{max-width:var(--w);margin:0 auto}.vx-sec.narrow .vx-sec-in{max-width:680px;margin:0 auto}.vx-sec.full{margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);border-radius:0}
.vx-tablist{display:flex;flex-wrap:wrap;gap:4px;border-bottom:2px solid rgba(128,128,128,.3);margin-top:16px}.vx-tablist [role=tab]{background:transparent;color:inherit;border:0;border-bottom:3px solid transparent;margin-bottom:-2px;padding:10px 16px;font:inherit;font-weight:600;cursor:pointer;opacity:.75}.vx-tablist [aria-selected=true]{border-color:var(--p);opacity:1}.vx-tabpanel{padding:12px 0}.vx-tabpanel[hidden]{display:none}.vx-tabh{font:600 11px system-ui;opacity:.55;text-transform:uppercase}
.vx-det{border:1px solid rgba(128,128,128,.35);border-radius:calc(var(--r) / 1.5);margin:8px 0;padding:0 14px}.vx-det summary{cursor:pointer;font-weight:600;padding:12px 0}.vx-det[open] summary{border-bottom:1px solid rgba(128,128,128,.25);margin-bottom:8px}
.vx-cdwrap{text-align:center;margin:20px 0}.vx-cd{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}.vx-cdu{min-width:76px;border:1px solid rgba(128,128,128,.35);border-radius:var(--r);padding:10px 8px}.vx-cdu b{display:block;font-size:2em;line-height:1.1}.vx-cdu span{font-size:.8em;opacity:.7}
.vx-stats{display:grid;gap:14px;margin:20px 0;text-align:center}.vx-stat b{display:block;font-size:2.3em;color:var(--p);line-height:1.1}.vx-stat span{opacity:.8}
.vx-feats{display:grid;gap:16px;margin:20px 0}.vx-feat{padding:16px;border:1px solid rgba(128,128,128,.3);border-radius:var(--r);background:rgba(128,128,128,.05)}.vx-feats.plain .vx-feat{border:0;background:transparent;padding:6px}.vx-feat h3{margin:.4em 0 .2em}.vx-feat p{margin:0;opacity:.85}.vx-ficon{font-size:1.8em;line-height:1}
.vx-plans{display:grid;gap:16px;margin:20px 0;align-items:stretch}.vx-plan{position:relative;border:1px solid rgba(128,128,128,.35);border-radius:var(--r);padding:20px;display:flex;flex-direction:column}.vx-plan.hi{border:2px solid var(--p);box-shadow:0 8px 28px rgba(0,0,0,.14)}.vx-plan h3{margin:.2em 0}.vx-price b{font-size:2.2em}.vx-price span{opacity:.7}.vx-plan ul{list-style:none;padding:0;margin:8px 0 18px;flex:1}.vx-plan li{padding:5px 0;border-bottom:1px solid rgba(128,128,128,.18)}.vx-plan li::before{content:"✓ ";color:var(--p);font-weight:700}.vx-flag{position:absolute;right:14px;top:-11px;background:var(--p);color:#fff;font:700 11px system-ui;padding:3px 10px;border-radius:99px;font-style:normal}
.vx-testi{display:grid;gap:16px;margin:20px 0}.vx-quote{margin:0;border:1px solid rgba(128,128,128,.3);border-radius:var(--r);padding:14px 18px;background:rgba(128,128,128,.05)}.vx-quote blockquote{font-size:1.05em;margin:.2em 0 .6em}.vx-quote figcaption span{opacity:.7;font-size:.9em}
.vx-tablewrap{overflow-x:auto;margin:16px 0}.vx-table{border-collapse:collapse;width:100%}.vx-table th,.vx-table td{padding:9px 12px;text-align:left;border-bottom:1px solid rgba(128,128,128,.3)}.vx-table th{background:rgba(128,128,128,.12)}.vx-table.striped tbody tr:nth-child(even){background:rgba(128,128,128,.07)}
.vx-fld{margin:0}.vx-fld[hidden]{display:none}.vx-help{display:block;opacity:.7;margin-top:3px;font-size:.85em}.vx-radio{border:0;padding:0;margin:12px 0 0}.vx-radio legend{font-weight:600;padding:0}.vx-step[hidden]{display:none}.vx-prog{font-size:.85em;opacity:.75;margin:10px 0 0}.vx-stepbtns{margin-top:16px}.vx-stepbtns .vx-btn{margin-top:0!important}.vx-stepbtns [hidden]{display:none}
.vx-q{width:100%;max-width:360px;font:inherit;padding:8px 11px;border:1px solid rgba(128,128,128,.55);border-radius:calc(var(--r) / 1.6);background:var(--bg);color:var(--tx)}.vx-pager{display:flex;gap:10px;align-items:center;margin:12px 0;justify-content:center}.vx-pager button,.vx-list th button{font:inherit;background:transparent;color:inherit;border:1px solid rgba(128,128,128,.5);border-radius:8px;padding:4px 12px;cursor:pointer}.vx-list th button{border:0;font-weight:700;padding:0}.vx-list ul{margin:0;padding-left:1.2em;grid-column:1/-1}.vx-list[data-layout=list]{display:block}
.vx-js .vx-an{opacity:0;transition:opacity .6s ease,transform .6s ease}.vx-js .vx-an-up{transform:translateY(22px)}.vx-js .vx-an-zoom{transform:scale(.94)}.vx-js .vx-an.in{opacity:1;transform:none}.vx-js [data-vis]:not(.vx-show){display:none}
@media(max-width:900px){.vx-plans,.vx-feats,.vx-testi{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))!important}.vx-gal{grid-template-columns:repeat(2,minmax(0,1fr))!important}.vx-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media(max-width:640px){.vx-cols{grid-template-columns:1fr!important}.vx-hero{padding:48px 16px}.vx-hide-phone{display:none!important}.vx-sec{padding-left:12px!important;padding-right:12px!important}}
@media(min-width:641px){.vx-hide-desktop{display:none!important}}
@media(prefers-reduced-motion:reduce){.vx-js .vx-an{opacity:1;transform:none;transition:none}html{scroll-behavior:auto}}`;

  function css(site) {
    const t = Object.assign(themeDefault(), site.theme || {}); const r = num(t.radius, 0, 40, 10);
    const BR = { rounded: 'var(--r)', pill: '999px', square: '0' }[t.buttons] || 'var(--r)'; const DK = '--bg:#12141a;--tx:#e8ebf2';
    const dark = t.dark === 'dark' ? `:root{${DK};color-scheme:dark}` : t.dark === 'auto' ? `@media(prefers-color-scheme:dark){:root{${DK};color-scheme:dark}}` : '';
    const hf = t.headFont && t.headFont !== 'same' && FONTS[t.headFont] ? `h1,h2,h3,h4{font-family:${FONTS[t.headFont]}}` : '';
    return `:root{--p:${color(t.primary, '#2457d6')};--bg:${color(t.bg, '#fff')};--tx:${color(t.text, '#1b2333')};--r:${r}px;--br:${BR};--w:${num(t.width, 600, 1600, 1000)}px}
${dark}${hf}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--tx);font:17px/1.6 ${FONTS[t.font] || FONTS.system}}
img{max-width:100%;height:auto}a{color:var(--p)}main{max-width:var(--w);margin:0 auto;padding:24px 16px 48px}h1,h2,h3,h4{line-height:1.25;margin:1.2em 0 .5em}
.vx-nav{border-bottom:1px solid rgba(128,128,128,.25)}.vx-nav .in{max-width:var(--w);margin:0 auto;padding:12px 16px;display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center}.vx-nav b{font-size:1.15em;margin-right:auto}.vx-nav a{text-decoration:none;padding:4px 2px;border-bottom:2px solid transparent}.vx-nav a[aria-current=page]{border-color:var(--p)}
.vx-foot{border-top:1px solid rgba(128,128,128,.25);text-align:center;padding:20px 16px;font-size:.9em;opacity:.8}
.vx-btn{display:inline-block;background:var(--p);color:#fff;border:2px solid var(--p);border-radius:var(--r);padding:10px 20px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}.vx-btn.outline{background:transparent;color:var(--p)}.vx-btn.light{background:#fff;color:#111;border-color:#fff}.vx-btn:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #f5a623;outline-offset:2px}
.vx-hero{padding:72px 24px;border-radius:var(--r);text-align:center;margin:8px 0 24px}.vx-hero h1{margin:0 0 .3em;font-size:2.4em}.vx-hero p{font-size:1.15em;margin:0 0 1.2em}
.vx-cols{display:grid;margin:16px 0}.vx-card{border:1px solid rgba(128,128,128,.3);border-radius:var(--r);overflow:hidden;background:rgba(128,128,128,.05)}.vx-card img{width:100%;display:block}.vx-card-b{padding:6px 16px 16px}.vx-card h3{margin:.6em 0 .3em}.vx-link{font-weight:600}
.vx-image{margin:16px auto}.vx-image img{width:100%;border-radius:var(--r);display:block}.vx-image figcaption{font-size:.9em;opacity:.75;text-align:center;margin-top:6px}.vx-ph{background:rgba(128,128,128,.15);border-radius:var(--r);padding:48px;text-align:center;opacity:.7}
.vx-hr{border:0;border-top:1px solid rgba(128,128,128,.3);margin:24px 0}
.vx-form,.vx-auth{max-width:520px;margin:20px auto;border:1px solid rgba(128,128,128,.3);border-radius:var(--r);padding:8px 20px 20px}.vx-form label,.vx-auth label{display:block;margin:12px 0 4px;font-weight:600}.vx-check{font-weight:400!important}.vx-form input:not([type=checkbox]):not([type=radio]),.vx-form textarea,.vx-form select,.vx-auth input{width:100%;font:inherit;padding:9px 11px;border:1px solid rgba(128,128,128,.55);border-radius:calc(var(--r) / 1.6);background:var(--bg);color:var(--tx)}
.vx-hp{position:absolute!important;left:-9999px;width:1px;height:1px;overflow:hidden}.vx-form .vx-btn,.vx-auth .vx-btn{margin-top:16px}.vx-msg{min-height:1.5em;margin:10px 0 0}.vx-msg.err{color:#b3261e}.vx-msg.ok{color:#17803d}
.vx-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}.vx-list[data-layout=table]{display:block;overflow-x:auto}.vx-list table{border-collapse:collapse;width:100%}.vx-list td,.vx-list th{border-bottom:1px solid rgba(128,128,128,.3);padding:8px;text-align:left;vertical-align:top}.vx-item{border:1px solid rgba(128,128,128,.3);border-radius:var(--r);padding:12px 14px}.vx-item b{display:block;font-size:.8em;opacity:.7;margin-top:6px}.vx-empty{opacity:.7}
.vx-note{background:rgba(245,166,35,.15);border:1px dashed #f5a623;border-radius:8px;padding:10px 12px;font-size:.9em;margin:10px 0}
.vx-skip{position:absolute;left:-999px;top:0;background:#000;color:#fff;padding:8px 14px;z-index:99}.vx-skip:focus{left:8px;top:8px}
.vx-listen{position:fixed;right:14px;bottom:14px;z-index:50;background:var(--p);color:#fff;border:0;border-radius:999px;padding:10px 16px;font:600 15px system-ui;cursor:pointer;box-shadow:0 2px 10px #0004}
${EXTRA_CSS}${site.nav && site.nav.sticky ? '.vx-nav{position:sticky;top:0;z-index:20;background:var(--bg)}' : ''}`;
  }

  const SITE_JS = String.raw`(()=>{'use strict';const $=(s,r)=>(r||document).querySelector(s),$$=(s,r)=>[...(r||document).querySelectorAll(s)];const PREVIEW=!!window.__VX_PREVIEW;document.documentElement.classList.add('vx-js');
const REDUCED=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
async function api(method,url,body){if(PREVIEW)return{ok:true,user:null,rows:[]};const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});let j={};try{j=await r.json()}catch(e){}if(!r.ok)throw new Error(j.error||'Something went wrong ('+r.status+')');return j}
const say=(f,t,k)=>{const m=$('.vx-msg',f);if(m){m.textContent=t;m.className='vx-msg '+(k||'')}};
/* forms: conditional fields, steps, saving */
function cond(f){for(const w of $$('[data-showif]',f)){const i=w.dataset.showif.indexOf('|'),k=w.dataset.showif.slice(0,i),v=w.dataset.showif.slice(i+1),el=f.elements[k];let cur='';if(el)cur=el.type==='checkbox'?(el.checked?'true':''):(el.value||'');const on=cur===v;w.hidden=!on;for(const x of $$('input,select,textarea',w))x.disabled=!on}}
for(const f of $$('form.vx-form')){cond(f);f.addEventListener('input',()=>cond(f));f.addEventListener('change',()=>cond(f));
const st=$$('.vx-step',f);let cur=0;const prog=$('.vx-prog',f),back=$('.vx-back',f),next=$('.vx-next',f),send=$('.vx-send',f);
const show=n=>{cur=n;st.forEach((s,k)=>{s.hidden=k!==n});back.hidden=n===0;next.hidden=n===st.length-1;send.hidden=n!==st.length-1;if(prog)prog.textContent='Step '+(n+1)+' of '+st.length};
const stepOk=()=>{for(const el of $$('input,select,textarea',st[cur])){if(!el.disabled&&!el.checkValidity()){el.reportValidity();return false}}return true};
if(st.length>1){show(0);next.addEventListener('click',()=>{if(stepOk())show(cur+1)});back.addEventListener('click',()=>show(cur-1))}
f.addEventListener('submit',async e=>{e.preventDefault();if(st.length>1&&cur<st.length-1){if(stepOk())show(cur+1);return}
const d={};for(const el of f.elements){if(!el.name||el.disabled)continue;if(el.type==='radio'){if(el.checked)d[el.name]=el.value;continue}d[el.name]=el.type==='checkbox'?el.checked:el.value}
if(!f.checkValidity()){f.reportValidity();return}say(f,'Sending…');try{await api('POST','/api/forms/'+encodeURIComponent(f.dataset.collection),d);f.reset();cond(f);if(st.length>1)show(0);say(f,f.dataset.success||'Thank you!','ok');if(f.dataset.redirect)setTimeout(()=>{location.href=f.dataset.redirect},900)}catch(x){say(f,x.message,'err')}})}
for(const f of $$('form.vx-auth')){f.addEventListener('submit',async e=>{e.preventDefault();if(!f.checkValidity()){f.reportValidity();return}const d={};for(const el of f.elements)if(el.name)d[el.name]=el.value;say(f,'One moment…');
try{await api('POST',f.dataset.mode==='signup'?'/api/signup':'/api/login',d);const q=new URLSearchParams(location.search).get('next');const go=(q&&q.startsWith('/')&&!q.startsWith('//')?q:'')||f.dataset.redirect||'/';location.href=go}catch(x){say(f,x.message,'err')}})}
/* lists: search, sort, pages */
for(const l of $$('.vx-list')){(async()=>{try{const wrap=l.closest('.vx-listwrap');const j=await api('GET','/api/data/'+encodeURIComponent(l.dataset.collection)+'?limit='+(l.dataset.limit||50));const rows=j.rows||[];
let labels={};try{labels=JSON.parse(l.dataset.labels||'{}')}catch(e){}const want=(l.dataset.fields||'').split(',').map(s=>s.trim()).filter(Boolean);const keys=(want.length?want:Object.keys(labels)).filter(k=>rows.some(r=>r.data&&k in r.data));
const per=+l.dataset.per||0,lay=l.dataset.layout,q=$('.vx-q',wrap),pager=$('.vx-pager',wrap);let sortBy=l.dataset.sort||'',desc=l.dataset.order==='desc',page=0;
const txt=(tag,t)=>{const e=document.createElement(tag);e.textContent=t;return e};
const draw=r=>{l.textContent='';if(!r.length){const e=txt('p',rows.length?'No match.':(l.dataset.empty||'Nothing here yet.'));e.className='vx-empty';l.append(e);return}
if(lay==='table'){const t=document.createElement('table'),h=t.insertRow();for(const k of keys){const th=document.createElement('th'),b=document.createElement('button');b.type='button';b.textContent=(labels[k]||k)+(sortBy===k?(desc?' ▼':' ▲'):'');b.addEventListener('click',()=>{if(sortBy===k)desc=!desc;else{sortBy=k;desc=false}view()});th.append(b);h.append(th)}for(const x of r){const tr=t.insertRow();for(const k of keys)tr.insertCell().textContent=String(x.data[k]??'')}l.append(t)}
else if(lay==='list'){const ul=document.createElement('ul');for(const x of r){const li=document.createElement('li');li.textContent=keys.map(k=>String(x.data[k]??'')).filter(Boolean).join(' — ');ul.append(li)}l.append(ul)}
else for(const x of r){const c=document.createElement('div');c.className='vx-item';keys.forEach((k,i)=>{const v=document.createElement(i?'span':'strong');v.textContent=String(x.data[k]??'');if(i){const b=document.createElement('b');b.textContent=labels[k]||k;c.append(b)}c.append(v)});l.append(c)}};
const view=()=>{let r=rows;const t=q?q.value.trim().toLowerCase():'';if(t)r=r.filter(x=>keys.some(k=>String(x.data[k]??'').toLowerCase().includes(t)));
if(sortBy)r=r.slice().sort((a,b)=>{const x=a.data[sortBy]??'',y=b.data[sortBy]??'';const c=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),undefined,{numeric:true});return desc?-c:c});
const pages=per?Math.max(1,Math.ceil(r.length/per)):1;if(page>=pages)page=pages-1;draw(per?r.slice(page*per,page*per+per):r);
if(pager){pager.hidden=pages<2;pager.textContent='';if(pages>1){const pv=txt('button','‹ Previous'),nx=txt('button','Next ›');pv.type=nx.type='button';pv.disabled=page===0;nx.disabled=page>=pages-1;pv.addEventListener('click',()=>{page--;view()});nx.addEventListener('click',()=>{page++;view()});pager.append(pv,txt('span','Page '+(page+1)+' of '+pages),nx)}}};
if(q)q.addEventListener('input',()=>{page=0;view()});view()}catch(x){l.textContent='Could not load this list.'}})()}
/* tabs */
for(const t of $$('[data-vx-tabs]')){const tabs=$$('[role=tab]',t),panels=$$('[role=tabpanel]',t);const sel=i=>tabs.forEach((b,k)=>{b.setAttribute('aria-selected',String(k===i));b.tabIndex=k===i?0:-1;panels[k].hidden=k!==i});
tabs.forEach((b,k)=>{b.addEventListener('click',()=>sel(k));b.addEventListener('keydown',e=>{let n=k;if(e.key==='ArrowRight')n=(k+1)%tabs.length;else if(e.key==='ArrowLeft')n=(k+tabs.length-1)%tabs.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=tabs.length-1;else return;e.preventDefault();sel(n);tabs[n].focus()})})}
/* reveal animations and counters */
const io='IntersectionObserver' in window?new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){e.target.classList.add('in');if(e.target.dataset.count)count(e.target);io.unobserve(e.target)}},{threshold:.12}):null;
function count(el){const m=/^(\D*)([\d.,]+)(.*)$/.exec(el.dataset.count||'');if(!m||REDUCED)return;const n=parseFloat(m[2].replace(/,/g,''));if(!isFinite(n))return;const dec=(m[2].split('.')[1]||'').length,com=m[2].includes(',');const t0=performance.now();
const fmt=v=>com?v.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}):v.toFixed(dec);const step=t=>{const k=Math.min(1,(t-t0)/900);el.textContent=m[1]+fmt(n*k)+m[3];if(k<1)requestAnimationFrame(step)};requestAnimationFrame(step)}
for(const x of $$('.vx-an,[data-count]')){if(io)io.observe(x);else x.classList.add('in')}
/* countdown */
for(const c of $$('[data-to]')){const to=Date.parse(c.dataset.to);if(isNaN(to))continue;const out=$('.vx-cd',c);let iv;const tick=()=>{let s=Math.floor((to-Date.now())/1000);if(s<=0){out.textContent=c.dataset.done||'';clearInterval(iv);return}const d=Math.floor(s/86400);s%=86400;const h=Math.floor(s/3600);s%=3600;const m=Math.floor(s/60);s%=60;
out.textContent='';for(const [n,l] of [[d,'days'],[h,'hours'],[m,'minutes'],[s,'seconds']]){const e=document.createElement('div');e.className='vx-cdu';const b=document.createElement('b'),sp=document.createElement('span');b.textContent=String(n);sp.textContent=l;e.append(b,sp);out.append(e)}};iv=setInterval(tick,1000);tick()}
/* gallery lightbox */
for(const g of $$('[data-vx-gallery="1"]')){const links=$$('a.vx-lb',g);const open=k=>{const dlg=document.createElement('dialog');dlg.className='vx-dlg';dlg.setAttribute('aria-label','Picture viewer');const img=document.createElement('img'),cap=document.createElement('p'),bar=document.createElement('div');bar.className='bar';
const show=n=>{k=(n+links.length)%links.length;img.src=links[k].href;img.alt=links[k].dataset.cap||'';cap.textContent=links[k].dataset.cap||''};const mk=(t,f)=>{const b=document.createElement('button');b.type='button';b.textContent=t;b.addEventListener('click',f);return b};
bar.append(mk('‹ Previous',()=>show(k-1)),mk('Next ›',()=>show(k+1)),mk('Close',()=>dlg.close()));dlg.append(img,cap,bar);dlg.addEventListener('close',()=>dlg.remove());dlg.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')show(k-1);else if(e.key==='ArrowRight')show(k+1)});document.body.append(dlg);show(k);dlg.showModal()};
links.forEach((a,k)=>a.addEventListener('click',e=>{if(typeof HTMLDialogElement==='undefined')return;e.preventDefault();open(k)}))}
for(const b of $$('[data-copy]')){b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('code',b.parentElement).textContent);b.textContent='Copied'}catch(e){b.textContent='Press Ctrl+C'}setTimeout(()=>{b.textContent='Copy'},1500)})}
/* who is logged in (also shows / hides "members" and "guests" blocks – cosmetic only, the server is what protects data and pages) */
(async()=>{const acc=$$('.vx-account'),link=$('#vx-authlink'),vis=$$('[data-vis]');if(!acc.length&&!link&&!vis.length)return;let u=null;try{u=(await api('GET','/api/me')).user}catch(e){}
for(const a of acc)a.textContent=u?(a.dataset.hello||'Hello')+', '+u.name+'.':a.dataset.guest||'';
for(const v of vis){if(v.dataset.vis==='members'?!u:!!u)continue;v.classList.add('vx-show')}
if(link){if(u){link.textContent='Log out';link.href='#';link.addEventListener('click',async e=>{e.preventDefault();try{await api('POST','/api/logout')}catch(x){}location.href='/'})}else{link.textContent='Log in';link.href='/login.html'}}})();
const lb=$('#vx-listen');if(lb&&window.VXTTS&&VXTTS.supported()){lb.hidden=false;lb.addEventListener('click',()=>{const st=VXTTS.state&&VXTTS.state();if(st&&st!=='idle'&&st!=='stopped'){VXTTS.stop();lb.textContent='🔊 Listen';return}lb.textContent='⏹ Stop';VXTTS.read($('main'),{onEnd:()=>{lb.textContent='🔊 Listen'}})})}
})();`;

  function pageHtml(site, page, ctx) {
    const nav = site.nav || {}; const pages = site.pages; const auth = usesAuth(site);
    const links = pages.filter((p) => p.inNav && p.access !== 'admin').map((p) => `<a href="${p.slug === 'home' ? '/' : '/' + esc(p.slug) + '.html'}"${p.id === page.id ? ' aria-current="page"' : ''}>${esc(p.title)}</a>`).join('');
    const body = (page.blocks || []).map((b) => blockHtml(b, ctx)).join('\n');
    const listen = site.a11y && site.a11y.listen && ctx.tts;
    return `<!doctype html>
<html lang="${esc(site.lang || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(page.title)} – ${esc(site.name)}</title>${page.desc ? `<meta name="description" content="${esc(page.desc)}">` : ''}${page.image && /^(https:\/\/|\/)/i.test(page.image) ? `<meta property="og:image" content="${esc(page.image)}">` : ''}<meta property="og:title" content="${esc(page.title)}"><link rel="icon" href="data:,"><link rel="stylesheet" href="/styles.css"></head><body>
${site.a11y && site.a11y.skipLink !== false ? '<a class="vx-skip" href="#main">Skip to the content</a>' : ''}
${nav.show !== false ? `<header class="vx-nav"><nav class="in" aria-label="Main"><b>${esc(nav.brand || site.name)}</b>${links}${auth ? '<a id="vx-authlink" href="/login.html">Log in</a>' : ''}</nav></header>` : ''}
<main id="main">
${body}
</main>
${nav.footer ? `<footer class="vx-foot">${esc(nav.footer)}</footer>` : ''}
${listen ? '<button id="vx-listen" class="vx-listen" type="button" hidden aria-label="Read this page aloud">🔊 Listen</button><script src="/vxtts.js"></script>' : ''}
<script src="/site.js"></script></body></html>`;
  }

  /** embed hosts the pages really use (video / map) – the exported server only allows these in frame-src */
  function framesOf(site) {
    const hosts = new Set(); const walk = (list) => { for (const b of list || []) { if (b.type === 'video') { const v = videoInfo(b.p.url); if (v && v.host) hosts.add(v.host); } if (b.type === 'map') hosts.add('https://www.openstreetmap.org'); (b.cols || []).forEach(walk); } };
    for (const p of site.pages) walk(p.blocks); return [...hosts];
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
    add('site.json', JSON.stringify({ name: site.name, security: { rateLimit: num(sec.rateLimit, 5, 1000, 60), maxBodyKB: num(sec.maxBodyKB, 4, 1024, 64), honeypot: sec.honeypot !== false, allowSignup: sec.allowSignup !== false, sessionHours: num(sec.sessionHours, 1, 24 * 90, 168), passwordMin: num(sec.passwordMin, 8, 64, 10), csp: sec.csp !== false, maxFails: 5, frames: framesOf(full) }, collections: (site.collections || []).map((c) => ({ name: c.name, label: c.label || c.name, public: !!c.public, submit: c.submit === 'members' ? 'members' : 'anyone', fields: c.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: !!f.required, options: f.options, maxLength: f.maxLength, private: !!f.private, showIf: f.showIf && f.showIf.field ? f.showIf : undefined })) })), pages: pages.map((p) => ({ file: fileOf(p), access: p.access === 'members' ? 'members' : 'public' })) }, null, 2));
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
    s.collections = Array.isArray(o && o.collections) ? o.collections.map((c) => ({ name: nameOf(c.name), label: String(c.label || c.name || ''), public: !!c.public, submit: c.submit === 'members' ? 'members' : 'anyone', fields: (Array.isArray(c.fields) ? c.fields : []).map((f) => ({ key: nameOf(f.key).replace(/-/g, '_'), label: String(f.label || f.key || ''), type: FIELD_TYPES.includes(f.type) ? f.type : 'text', required: !!f.required, options: Array.isArray(f.options) ? f.options.map(String).slice(0, 50) : undefined, maxLength: f.maxLength ? num(f.maxLength, 1, 5000, 300) : undefined, private: !!f.private, placeholder: f.placeholder ? String(f.placeholder).slice(0, 120) : undefined, help: f.help ? String(f.help).slice(0, 200) : undefined, showIf: f.showIf && f.showIf.field ? { field: nameOf(f.showIf.field).replace(/-/g, '_'), equals: String(f.showIf.equals == null ? '' : f.showIf.equals).slice(0, 100) } : undefined })) })) : base.collections;
    const fixBlocks = (list) => (Array.isArray(list) ? list : []).filter((b) => b && BLOCKS[b.type]).map((b) => { const nb = { id: String(b.id || uid()), type: b.type, p: Object.assign(JSON.parse(JSON.stringify(BLOCKS[b.type].p)), b.p && typeof b.p === 'object' ? b.p : {}) }; if (BLOCKS[b.type].cols) nb.cols = [0, 1, 2, 3, 4, 5].map((i) => fixBlocks(b.cols && b.cols[i])); const st = cleanStyle(b.s); if (Object.keys(st).length) nb.s = st; return nb; });
    s.pages = Array.isArray(o && o.pages) && o.pages.length ? o.pages.map((p) => ({ id: String(p.id || uid()), title: String(p.title || 'Page'), slug: slugOf(p.slug || p.title), desc: String(p.desc || ''), image: String(p.image || '').slice(0, 300), access: p.access === 'members' ? 'members' : 'public', inNav: p.inNav !== false, blocks: fixBlocks(p.blocks) })) : base.pages;
    return s;
  }

  root.VXSite = { BLOCKS, SECTIONS, PAGE_TEMPLATES, sectionBlocks, pageBlocks, cleanStyle, md, videoInfo, framesOf, FIELD_TYPES, esc, uid, slugOf, nameOf, safeUrl, blockHtml, newBlock, blank, normalize, generate, check, css, fileOf, usesAuth, pageHtml, hashAdminPassword, field, SITE_JS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.VXSite;
})(typeof window !== 'undefined' ? window : globalThis);
