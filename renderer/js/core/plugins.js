/* Vextra extension runtime: plugin API (the `forge` object plugins receive), plugin manager and docs hooks. */
(function () {
  const listeners = {};
  const Forge = {
    version: '2.0.0',
    host: {},                 // filled in by app.js
    commands: new Map(),      // id -> {id,title,run,plugin}
    statusItems: new Map(),   // id -> {id,text,align,onClick,plugin}
    panels: new Map(),        // id -> {id,title,icon,render,plugin}
    toolbarItems: new Map(),  // id -> {id,label,run,plugin}
    docs: new Map(),          // id -> {id,title,markdown,plugin}
    plugins: new Map(),       // id -> {manifest, file, source, enabled, error, disposers, contrib, docs}
    on(ev, cb) { (listeners[ev] ||= new Set()).add(cb); return () => listeners[ev].delete(cb); },
    emit(ev, ...a) { (listeners[ev] || []).forEach((cb) => { try { cb(...a); } catch (e) { console.error('[forge] listener error', ev, e); } }); },
    changed() { VX.emit('registry'); Forge.emit('registry'); },
  };

  /** Build the API object a plugin sees. Everything it registers is tracked so it can be undone on disable. */
  function makeApi(pluginId, disposers, contrib) {
    const track = (fn) => { disposers.push(fn); };
    const note = (kind, text) => { (contrib[kind] ||= []).push(text); };
    const H = () => Forge.host;
    return {
      id: pluginId,
      version: Forge.version,
      commands: {
        register(cmd) {
          if (!cmd || !cmd.id || typeof cmd.run !== 'function') throw new Error('command needs id and run()');
          const id = `${pluginId}.${cmd.id}`;
          Forge.commands.set(id, { id, title: cmd.title || cmd.id, run: cmd.run, plugin: pluginId, hint: cmd.hint });
          note('commands', cmd.title || cmd.id);
          track(() => Forge.commands.delete(id)); Forge.changed();
        },
        run: (id) => Forge.commands.get(id)?.run(),
      },
      statusBar: {
        add(item) {
          const id = `${pluginId}.${item.id || 'item'}`;
          const rec = { id, text: item.text || '', align: item.align || 'left', onClick: item.onClick, plugin: pluginId, tooltip: item.tooltip };
          Forge.statusItems.set(id, rec); track(() => Forge.statusItems.delete(id)); note('statusItems', item.tooltip || item.id || 'status item'); Forge.changed();
          return { update(text) { rec.text = text; Forge.changed(); } };
        },
      },
      toolbar: {
        add(item) {
          const id = `${pluginId}.${item.id || item.label}`;
          Forge.toolbarItems.set(id, { id, label: item.label, run: item.run, plugin: pluginId, when: item.when });
          note('toolbar', item.label); track(() => Forge.toolbarItems.delete(id)); Forge.changed();
        },
      },
      panels: {
        /** Adds a sidebar view. render(container) is called each time the view opens. */
        register(p) {
          const id = `${pluginId}.${p.id}`;
          Forge.panels.set(id, { id, title: p.title, icon: p.icon || 'plugin', render: p.render, plugin: pluginId });
          note('panels', p.title); track(() => Forge.panels.delete(id)); Forge.changed();
        },
      },
      editor: {
        getValue: () => H().editorGet?.() ?? '',
        setValue: (v) => H().editorSet?.(v),
        getSelection: () => H().editorSelection?.() ?? '',
        insertText: (t) => H().editorInsert?.(t),
        replaceSelection: (t) => H().editorInsert?.(t),
        getLanguage: () => H().editorLang?.() ?? 'plaintext',
        getPath: () => H().editorPath?.() ?? null,
        onChange(cb) { track(Forge.on('editorChange', cb)); },
        onSave(cb) { track(Forge.on('save', cb)); },
        onTabChange(cb) { track(Forge.on('tabChange', cb)); },
        openFile: (p) => H().openPath?.(p),
        newFile: (name, content, lang) => H().newFile?.(name, content, lang),
      },
      designer: {
        /** mode 'ui' adds a UI-designer component. mode 'scene' (legacy) adds a 2D game object type. */
        registerComponent(mode, def) {
          if (mode === 'scene') return this._legacyScene(def);
          VX.components.register(mode, def); note('components', def.label || def.type);
          track(() => { delete VX.components.registry[mode][def.type]; Forge.changed(); }); Forge.changed();
        },
        _legacyScene(def) {
          const e = def.props?.emoji;
          return VX.game.registerObjectType({ type: def.type, label: def.label, icon: def.icon, dim: '2d', category: def.category || 'Plugins', w: def.w, h: def.h, props: def.props, schema: def.schema, draw: (ctx, o) => { const t = o.props.emoji ?? e ?? '◻'; ctx.font = Math.min(o.w, o.h) * 0.78 + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, 0, 2); } }, pluginId, track, note);
        },
      },
      game: {
        /** Add a custom logic block. `init` / `onInput` etc. must be self-contained functions (they are copied into exported games). See Docs → Plugins → Custom blocks. */
        registerBlock(def) { const r = VX.game.registerBlock(Object.assign({ cat: 'plugins', plugin: pluginId }, def), pluginId); note('blocks', def.label || def.id); track(() => VX.game.unregisterBlock(r.id)); return r; },
        /** Add a placeable object type to the game editor (2D: draw(ctx,obj); 3D: build(THREE,obj) → Object3D). */
        registerObjectType(def) { return VX.game.registerObjectType(def, pluginId, track, note); },
        current: () => VX.game.currentProject?.() ?? null,
        /** Resolves to the exported single-file HTML of a project (default: the open game). */
        exportHTML: (project) => VX.gameExport.toHTML(project || VX.game.currentProject?.()),
      },
      docs: {
        /** Add a documentation page that shows up under Docs → Plugins → <your plugin>. Markdown. */
        register(page) {
          const id = `${pluginId}.${page.id || 'page'}`;
          Forge.docs.set(id, { id, title: page.title || page.id || 'Notes', markdown: page.markdown || '', plugin: pluginId });
          track(() => Forge.docs.delete(id)); Forge.changed();
        },
        open: (id) => H().openDocs?.(id ? `plugin:${pluginId}` : `plugin:${pluginId}`),
      },
      themes: {
        register(t) { VX.theme.register(Object.assign({}, t, { source: 'plugin:' + pluginId })); note('themes', t.name); track(() => VX.theme.unregister(t.id)); },
        apply: (id) => H().applyTheme?.(id),
        list: () => VX.theme.list().map((t) => ({ id: t.id, name: t.name })),
      },
      ui: {
        toast: (m, kind) => VX.ui.toast(m, kind),
        prompt: (m, def) => VX.ui.ask(m, def),
        confirm: (m, ok) => VX.ui.confirm(m, ok),
        form: (o) => VX.ui.form(o),
        modal: (opts) => VX.ui.modal({ title: opts.title, body: opts.html ?? opts.body, wide: opts.wide }),
        preview: (html, title) => VX.ui.preview(html, title),
      },
      account: { current: () => H().account?.() ?? null },
      fs: {
        readFile: (p) => window.native.readFile(p),
        writeFile: (p, c) => window.native.writeFile(p, c),
        writeBase64: (p, b64) => window.native.writeBase64(p, b64),
        exists: (p) => window.native.exists(p),
        root: () => H().root?.() ?? null,
      },
      settings: {
        get: (k, d) => (H().settings?.plugins?.[pluginId]?.[k] ?? d),
        set: (k, v) => H().setPluginSetting?.(pluginId, k, v),
      },
      on(ev, cb) { track(Forge.on(ev, cb)); },
      log: (...a) => console.log(`[plugin:${pluginId}]`, ...a),
    };
  }

  /* ---------- plugins ---------- */
  function parseManifest(code, file) {
    const m = code.match(/\/\*\*?\s*@(?:forge|vextra)-plugin\s*([\s\S]*?)\*\//);
    let man = {};
    if (m) { try { man = JSON.parse(m[1]); } catch { /* fall through */ } }
    man.id = man.id || file.replace(/\.js$/, '');
    man.name = man.name || man.id; man.version = man.version || '0.0.1'; man.description = man.description || '';
    const d = code.match(/\/\*\*?\s*@(?:forge|vextra)-docs\s*([\s\S]*?)\*\//);
    man.docs = d ? d[1].replace(/^[ \t]*\* ?/gm, '').trim() : '';
    return man;
  }

  /** Markdown shown for a plugin in the Docs view: author docs + an auto-generated list of everything it adds. */
  Forge.pluginDocsMarkdown = function (id) {
    const rec = Forge.plugins.get(id); if (!rec) return '';
    const m = rec.manifest; const lines = [`# ${m.name}`, '', `*v${m.version} · ${rec.source === 'builtin' ? 'built-in plugin' : 'your plugin'}*`, '', m.description || '', ''];
    if (m.docs) lines.push(m.docs, '');
    for (const d of Forge.docs.values()) if (d.plugin === id) lines.push(`## ${d.title}`, '', d.markdown, '');
    const c = rec.contrib || {};
    const sect = [['commands', 'Commands', 'Run from the Command Palette (**Ctrl+Shift+P**).'], ['toolbar', 'Toolbar buttons', 'Appear above the editor when they apply.'], ['panels', 'Side panels', 'Open from the activity bar.'], ['statusItems', 'Status bar items', ''], ['components', 'Designer components', 'Find them in the **Create** panel.'], ['blocks', 'Logic blocks', 'Find them under **Plugins** in the block palette of the game editor.'], ['themes', 'Themes', '']];
    const rows = sect.filter(([k]) => c[k] && c[k].length);
    if (rows.length) { lines.push('## What this plugin adds', ''); for (const [k, title, note] of rows) { lines.push(`**${title}**${note ? ' — ' + note : ''}`, ''); for (const t of c[k]) lines.push(`- ${t}`); lines.push(''); } }
    if (!rec.enabled) lines.push('> This plugin is currently **disabled**. Enable it in the Plugins panel to use it.', '');
    if (rec.error) lines.push(`> ⚠ This plugin failed to load: \`${rec.error}\``, '');
    return lines.join('\n');
  };

  Forge.plugins_ = {
    async loadAll() {
      for (const id of [...Forge.plugins.keys()]) this.unload(id);
      Forge.plugins.clear();
      const files = await window.native.ext.list('plugins');
      const disabled = new Set(Forge.host.settings?.disabledPlugins || []);
      for (const f of files) { // user plugins override built-ins that share the same id
        const manifest = parseManifest(f.content, f.file);
        Forge.plugins.set(manifest.id, { manifest, file: f.file, path: f.path, source: f.source, code: f.content, enabled: !disabled.has(manifest.id), error: null, disposers: [], contrib: {} });
      }
      for (const rec of Forge.plugins.values()) if (rec.enabled) this.activate(rec);
      Forge.changed();
    },
    activate(rec) {
      rec.error = null; rec.disposers = []; rec.contrib = {};
      try {
        const api = makeApi(rec.manifest.id, rec.disposers, rec.contrib);
        const fn = new Function('forge', 'module', rec.code + '\n//# sourceURL=vextra-plugin-' + rec.manifest.id + '.js');
        const mod = { exports: {} };
        fn(api, mod);
        if (typeof mod.exports.deactivate === 'function') rec.disposers.push(mod.exports.deactivate);
        rec.enabled = true;
      } catch (e) {
        rec.error = e.message || String(e);
        this.unload(rec.manifest.id, true);
        console.error('[plugin] failed', rec.manifest.id, e);
      }
    },
    unload(id, keepRec) {
      const rec = Forge.plugins.get(id); if (!rec) return;
      for (const d of rec.disposers.splice(0).reverse()) { try { d(); } catch (e) { console.warn(e); } }
      if (!keepRec) rec.enabled = false;
    },
    setEnabled(id, on) {
      const rec = Forge.plugins.get(id); if (!rec) return;
      const set = new Set(Forge.host.settings.disabledPlugins || []);
      if (on) { set.delete(id); this.activate(rec); } else { set.add(id); this.unload(id); }
      Forge.host.settings.disabledPlugins = [...set];
      Forge.host.saveSettings(); Forge.changed();
    },
    template(name) {
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-plugin';
      const safe = name.replace(/["'`\\]/g, '');
      return { id, file: id + '.js', code: `/** @forge-plugin {"id":"${id}","name":"${safe}","version":"1.0.0","description":"Describe what this plugin does"} */
/** @forge-docs
 * ## How to use ${safe}
 * Explain here what your plugin does. This text appears in **Docs → Plugins → ${safe}**
 * and is written in Markdown.
 *
 * - Run **${safe}: Say hello** from the Command Palette.
 */

// \`forge\` is the plugin API. Save this file to hot-reload it. Full reference: Docs → Plugins → Plugin API.

// 1) Add a command (Ctrl+Shift+P to run it)
forge.commands.register({
  id: 'hello',
  title: '${safe}: Say hello',
  run() {
    forge.ui.toast('Hello from ${id}! Current language: ' + forge.editor.getLanguage(), 'ok');
  },
});

// 2) Add a status bar item
const status = forge.statusBar.add({ id: 'status', text: '${id}', align: 'right' });

// 3) React to editor events
forge.editor.onSave(() => status.update('${id}: saved'));

// 4) Optional: add a custom logic block for the game editor
// forge.game.registerBlock({ id: '${id}-double', label: 'Double', cat: 'plugins', desc: 'Doubles the number it receives.',
//   inputs: ['in'], outputs: ['out'], params: [],
//   onInput(node, port, value, rt) { rt.send(node, 'out', (+value || 0) * 2); } });

// More: forge.panels.register, forge.designer.registerComponent, forge.themes.register,
//       forge.docs.register, forge.ui.form/modal, forge.settings.get/set ...
// Clean-up is automatic when the plugin is disabled.
` };
    },
  };

  window.Forge = Forge;
})();
