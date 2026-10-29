/* Vextra Studio – documentation viewer. Static pages live in content.js; block reference and plugin pages are generated from the live registries. */
(function () {
  const { h, $ } = VX;
  const D = (VX.docs = { pages: [], statics: [] });
  D.register = (p) => { D.statics = D.statics.filter((x) => x.id !== p.id); D.statics.push(p); };
  const GROUPS = ['Start here', 'Websites', 'UI designer', 'Making games', 'Block reference', 'Scripting', 'Plugins', 'Share & publish', 'Reference'];

  const paramLine = (p) => { const opts = p.options ? ' – ' + p.options.map((o) => '`' + (Array.isArray(o) ? o[0] : o) + '`').join(', ') : ''; return `| ${p.label} | ${p.type === 'select' ? 'choice' : p.type} | ${p.def === undefined || p.def === '' ? '–' : '`' + String(p.def).slice(0, 30) + '`'} |${opts ? ' ' + opts.slice(3).slice(0, 220) : ''} |`; };
  function blockMd(def) {
    const ports = VXRT.ports(def, VXRT.paramDefaults(def), null); const pl = (a) => (a.length ? a.map((p) => '`' + p.id + '`').join(', ') : '—');
    let md = `### ${def.label}\n\n\`${def.id}\` ${def.plugin ? '· from plugin **' + def.plugin + '**' : ''}\n\n${def.desc || ''}\n\n**Inputs:** ${pl(ports.inputs)}  \n**Outputs:** ${pl(ports.outputs)}\n\n`;
    if (def.params && def.params.length) { md += '| Setting | Type | Default | Notes |\n|---|---|---|---|\n' + def.params.map(paramLine).join('\n') + '\n\n'; }
    return md;
  }
  function categoryMd(cat) { const defs = Object.values(VXRT.blocks).filter((b) => b.cat === cat.id); return `# ${cat.label}\n\n${defs.length} blocks.\n\n` + (CAT_INTRO[cat.id] || '') + '\n\n' + defs.map(blockMd).join('\n'); }
  const CAT_INTRO = {
    triggers: 'Triggers start a chain of logic. They have no input socket – they *listen* for something (a key, a click, a collision, a timer…) and send a signal out when it happens.',
    logic: 'Logic & Math blocks process signals: numbers, expressions, variables, easing, random values, filters and logic gates. Wire them between triggers and actions.',
    components: 'Components do things in the world: play sounds, emit particles, spawn and destroy objects, apply physics, aim cameras and talk to other objects.',
    properties: 'Property blocks read or change an object\'s attributes – position, rotation, size, colours, shader, animation and more. Most can tween smoothly over time.',
    text: 'Text & List blocks transform strings and keep lists of values. Lists can loop over items one by one and count them.',
    gui: 'GUI blocks draw on top of the game: labels, bars, alerts and a custom cursor.',
    flow: 'Game Flow blocks control the game itself: pausing, levels, saving, leaderboards, achievements, the web and the clipboard.',
    mobile: 'Mobile blocks use phone and tablet features. On a computer they fall back to something useful (keyboard test keys, simulated ads) so you can test everywhere – the editor\'s device simulator can shake or tilt the game.',
    bundles: 'Bundles let you package a group of blocks as one reusable block. Double-click a bundle to open it; add **New Input** and **New Output** blocks inside to create its sockets.',
  };

  function build() {
    const pages = [...D.statics];
    pages.push({ id: 'blocks', group: 'Block reference', title: 'All blocks (overview)', md: () => `# Block reference\n\nVextra has **${Object.keys(VXRT.blocks).length} blocks** in ${VXRT.CATEGORIES.length - 1} built-in families plus any added by plugins. Each block has *inputs* on the left and *outputs* on the right; wires carry values called **signals**.\n\n` + VXRT.CATEGORIES.map((c) => { const n = Object.values(VXRT.blocks).filter((b) => b.cat === c.id).length; return n ? `- [${c.label}](doc:blocks-${c.id}) – ${n} blocks` : ''; }).filter(Boolean).join('\n') + '\n\n> Tip: in the editor, hover a block in the palette to see its description, or press the **?** on a selected block to jump straight here.' });
    for (const c of VXRT.CATEGORIES) if (Object.values(VXRT.blocks).some((b) => b.cat === c.id)) pages.push({ id: 'blocks-' + c.id, group: 'Block reference', title: c.label, md: () => categoryMd(c) });
    pages.push({ id: 'plugins', group: 'Plugins', title: 'Installed plugins', md: () => '# Installed plugins\n\n' + ([...Forge.plugins.values()].map((r) => `- [${r.manifest.name}](doc:plugin:${r.manifest.id}) – ${r.manifest.description || ''} ${r.enabled ? '' : '*(disabled)*'}`).join('\n') || 'No plugins installed.') + '\n\nEach plugin page lists everything the plugin adds and how to use it.' });
    for (const r of Forge.plugins.values()) pages.push({ id: 'plugin:' + r.manifest.id, group: 'Plugins', title: r.manifest.name, md: () => Forge.pluginDocsMarkdown(r.manifest.id), sub: true });
    return pages;
  }
  D.build = build;

  let view = null;
  D.open = function (id) {
    VX.tabs.open({ kind: 'page', key: 'page:docs', title: 'Documentation', icon: 'docs', render: (c, t) => { view = { c, t, cur: null }; draw(c); }, onShow: () => { if (D._want) { const w = D._want; D._want = null; go(w); } } }).then(() => { if (id) go(id); else if (view && !view.cur) go('welcome'); });
  };
  D.go = go;
  function go(id) { if (!view) { D._want = id; return; } let anchor = null; if (id.includes('#')) [id, anchor] = id.split('#'); view.cur = id; showPage(anchor); }
  function draw(c) {
    c.textContent = ''; const nav = h('div', { class: 'docs-nav' }), main = h('div', { class: 'docs-main' }), search = h('input', { class: 'search-input', placeholder: 'Search the docs…' });
    c.append(h('div', { class: 'docs' }, h('div', { class: 'docs-side' }, search, nav), main)); view.nav = nav; view.main = main; view.search = search;
    search.addEventListener('input', () => drawNav(search.value));
    VX.on('registry', () => { if (view && document.body.contains(view.c)) { drawNav(search.value); } });
    drawNav(''); if (view.cur) showPage();
  }
  function drawNav(q) {
    const nav = view.nav; nav.textContent = ''; const pages = build(); q = (q || '').toLowerCase().trim();
    if (q) { const hits = pages.filter((p) => p.title.toLowerCase().includes(q) || safeMd(p).toLowerCase().includes(q)); nav.append(h('div', { class: 'group-title' }, hits.length + ' result' + (hits.length === 1 ? '' : 's'))); for (const p of hits.slice(0, 60)) nav.append(link(p)); return; }
    for (const g of GROUPS) { const ps = pages.filter((p) => p.group === g); if (!ps.length) continue; nav.append(h('div', { class: 'group-title' }, g)); for (const p of ps) nav.append(link(p)); }
  }
  const safeMd = (p) => { try { return typeof p.md === 'function' ? p.md() : p.md; } catch { return ''; } };
  const link = (p) => h('a', { class: 'docs-link' + (view.cur === p.id ? ' on' : ''), style: p.sub ? 'padding-left:22px' : '', onclick: () => { view.cur = p.id; showPage(); drawNav(view.search.value); } }, p.title);
  function showPage(anchor) {
    const p = build().find((x) => x.id === view.cur) || build().find((x) => x.id === 'welcome'); const main = view.main; if (!p) return;
    main.textContent = ''; const body = h('div', { class: 'md', html: VX.markdown.render(safeMd(p)) }); main.append(body);
    body.querySelectorAll('a[data-doc]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.doc); drawNav(view.search.value); }));
    if (VX.wireCopy && !body._copyWired) { VX.wireCopy(body); body._copyWired = true; }
    if (anchor) { const el = body.querySelector('#' + CSS.escape(anchor)); el && el.scrollIntoView(); } else main.scrollTop = 0;
    view.nav.querySelectorAll('.docs-link').forEach((a) => a.classList.toggle('on', a.textContent === p.title));
  }
  /** Used by the game editor: open the docs page for a block. */
  D.openBlock = (def) => { D.open('blocks-' + def.cat + '#' + VX.markdown.slug(def.label)); };
})();
