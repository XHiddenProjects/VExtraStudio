/* Vextra extension runtime: plugin API (the `vx` object plugins receive; `forge` still works as an alias), plugin manager and docs hooks. */
(function () {
  const listeners = {};
  /** Progress dialog (also used by the app itself, e.g. project packs). */
  VX.ui.progress = function (title) {
    const h = VX.h; const bar = h('div', { class: 'prog-fill' }); const st = h('div', { class: 'prog-status' }, 'Starting…'); const pct = h('span', { class: 'prog-pct' }, '0%');
    const log = h('pre', { class: 'prog-log' }); let cb = null; const api = { cancelled: false };
    const cancel = h('button', { class: 'btn', onclick: () => { api.cancelled = true; cancel.disabled = true; st.textContent = 'Cancelling…'; cb && cb(); } }, 'Cancel');
    const m = VX.ui.modal({ title, dismissable: false, body: h('div', { class: 'prog' }, h('div', { class: 'prog-row' }, st, pct), h('div', { class: 'prog-bar' }, bar), log), actions: [cancel] });
    api.set = (p, s) => { const v = Math.max(0, Math.min(100, Math.round(p))); bar.style.width = v + '%'; pct.textContent = v + '%'; if (s != null) st.textContent = s; };
    let buf = [], tm = 0; const flush = () => { tm = 0; log.textContent += buf.join('\n') + '\n'; buf = []; if (log.textContent.length > 20000) log.textContent = log.textContent.slice(-12000); log.scrollTop = log.scrollHeight; };
    api.log = (l) => { buf.push(String(l)); if (!tm) tm = setTimeout(flush, 80); }; api.flush = flush;
    api.onCancel = (f) => { cb = f; };
    api.done = (label) => { cancel.textContent = label || 'Close'; cancel.disabled = false; cancel.onclick = () => m.close(); };
    api.close = () => m.close();
    return api;
  };

  const VXHost = {
    version: '4.7.0',
    host: {},                 // filled in by app.js
    commands: new Map(),      // id -> {id,title,run,plugin}
    statusItems: new Map(),   // id -> {id,text,align,onClick,plugin}
    configs: new Map(),       // pluginId -> {title,intro,fields,load,save,validate}
    panels: new Map(),        // id -> {id,title,icon,render,plugin}
    panelState: new Map(),    // id -> 'working' | 'done' | 'error' | 'paused'
    setPanelState(id, state) { if (state) VXHost.panelState.set(id, state); else VXHost.panelState.delete(id); try { const b = document.querySelector(`#activity .act[data-view="panel:${id}"]`); if (b) { if (state) b.dataset.state = state; else delete b.dataset.state; } } catch { /* activity bar not drawn yet */ } },
    toolbarItems: new Map(),  // id -> {id,label,run,plugin}
    docs: new Map(),          // id -> {id,title,markdown,plugin}
    plugins: new Map(),       // id -> {manifest, file, source, enabled, error, disposers, contrib, docs}
    on(ev, cb) { (listeners[ev] ||= new Set()).add(cb); return () => listeners[ev].delete(cb); },
    emit(ev, ...a) { (listeners[ev] || []).forEach((cb) => { try { cb(...a); } catch (e) { console.error('[vx] listener error', ev, e); } }); },
    changed() { VX.emit('registry'); VXHost.emit('registry'); },
  };

  /** Build the API object a plugin sees. Everything it registers is tracked so it can be undone on disable. */
  function makeApi(pluginId, disposers, contrib) {
    const track = (fn) => { disposers.push(fn); };
    const note = (kind, text) => { (contrib[kind] ||= []).push(text); };
    const H = () => VXHost.host;
    /** Absolute path of p when it is inside the open folder (relative paths are relative to it), otherwise null. Never returns the folder itself. */
    const inRoot = (p) => {
      const root = String(H().root?.() || '').replace(/\\/g, '/').replace(/\/+$/, ''); if (!root) return null; let q = String(p || '').replace(/\\/g, '/');
      if (!q.startsWith(root + '/') && !/^([a-z]:)?\//i.test(q)) q = root + '/' + q.replace(/^\.\//, ''); if (!q.startsWith(root + '/') || q.split('/').some((x) => x === '..') || q.length <= root.length + 1) return null; return q;
    };
    return {
      id: pluginId,
      version: VXHost.version,
      commands: {
        register(cmd) {
          if (!cmd || !cmd.id || typeof cmd.run !== 'function') throw new Error('command needs id and run()');
          const id = `${pluginId}.${cmd.id}`;
          VXHost.commands.set(id, { id, title: cmd.title || cmd.id, run: cmd.run, plugin: pluginId, hint: cmd.hint });
          note('commands', cmd.title || cmd.id);
          track(() => VXHost.commands.delete(id)); VXHost.changed();
        },
        run: (id) => VXHost.commands.get(id)?.run(),
      },
      statusBar: {
        add(item) {
          const id = `${pluginId}.${item.id || 'item'}`;
          const rec = { id, text: item.text || '', align: item.align || 'left', onClick: item.onClick, plugin: pluginId, tooltip: item.tooltip };
          VXHost.statusItems.set(id, rec); track(() => VXHost.statusItems.delete(id)); note('statusItems', item.tooltip || item.id || 'status item'); VXHost.changed();
          return { update(text) { rec.text = text; VXHost.changed(); } };
        },
      },
      toolbar: {
        add(item) {
          const id = `${pluginId}.${item.id || item.label}`;
          VXHost.toolbarItems.set(id, { id, label: item.label, run: item.run, plugin: pluginId, when: item.when });
          note('toolbar', item.label); track(() => VXHost.toolbarItems.delete(id)); VXHost.changed();
        },
      },
      panels: {
        /** Adds a sidebar view. render(container) is called each time the view opens. */
        register(p) {
          const id = `${pluginId}.${p.id}`;
          VXHost.panels.set(id, { id, title: p.title, icon: p.icon || 'plugin', render: p.render, plugin: pluginId });
          note('panels', p.title); track(() => { VXHost.panels.delete(id); VXHost.panelState.delete(id); }); VXHost.changed();
        },
        /** Colours the panel's icon in the activity bar: 'working' (colours cycle), 'done' (green), 'error' (red), 'paused' (amber) or '' (normal). */
        setState(panelId, state) { VXHost.setPanelState(`${pluginId}.${panelId}`, state); },
      },
      editor: {
        getValue: () => H().editorGet?.() ?? '',
        setValue: (v) => H().editorSet?.(v),
        getSelection: () => H().editorSelection?.() ?? '',
        insertText: (t) => H().editorInsert?.(t),
        replaceSelection: (t) => H().editorInsert?.(t),
        getLanguage: () => H().editorLang?.() ?? 'plaintext',
        getPath: () => H().editorPath?.() ?? null,
        onChange(cb) { track(VXHost.on('editorChange', cb)); },
        onSave(cb) { track(VXHost.on('save', cb)); },
        onTabChange(cb) { track(VXHost.on('tabChange', cb)); },
        openFile: (p) => H().openPath?.(p),
        newFile: (name, content, lang) => H().newFile?.(name, content, lang),
      },
      /** Ties a long job to the tab that is open now. Returns { id, kind, alive(), isActive(), path(), lang(), value(), setValue(text), insert(text), game() } –
       *  all of them keep working on THAT tab after the user switches to another one (game() is its editor controller, or null). */
      pin: () => H().pin?.() ?? { id: null, kind: null, alive: () => false, isActive: () => false, path: () => null, lang: () => 'plaintext', value: () => '', setValue() {}, insert() {}, game: () => null },
      designer: {
        /** Adds a 2D game object type (kept as `designer.registerComponent('scene', def)` for older plugins). The UI designer was replaced by the website builder. */
        registerComponent(mode, def) {
          if (mode === 'scene') return this._legacyScene(def);
          throw new Error("The UI designer was removed in 4.4.0 – use vx.game.registerObjectType for game objects.");
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
        /** Building blocks for plugins that edit games: the project helpers and the logic-block registry. */
        kit: () => ({ GP: VX.GameProject, blocks: window.VXRT && VXRT.blocks, ports: VXRT.ports, paramDefaults: VXRT.paramDefaults }),
        /** Opens a new empty game tab ('2d' | '3d') and resolves to its editor. */
        newGame: async (dim) => { await VX.app.newGame(dim === '3d' ? '3d' : '2d'); await new Promise((r) => setTimeout(r, 300)); const t = VX.tabs.active && VX.tabs.active(); return t && t.kind === 'game' && t.ctl ? t.ctl : null; },
        /** The editor controller of the open game tab (addObject, scene, project…) or null. */
        editor: () => { const t = VX.tabs && VX.tabs.active && VX.tabs.active(); return t && t.kind === 'game' && t.ctl ? t.ctl : null; },
        /** Resolves to the exported single-file HTML of a project (default: the open game). */
        exportHTML: (project) => VX.gameExport.toHTML(project || VX.game.currentProject?.()),
        /** Play-tests a game in a hidden sandboxed frame: script = [{wait:ms},{key:'right',hold:400},{press:'space'},{click:{x:.5,y:.5}},{shot:true,label:'…'}] → { ok, errors[], logs[], shots[{label,data(jpeg data URL),w,h}], state{scene,vars,objects,frames,fps}, notes[] }. Default project: the open game. */
        /** Renders HTML in a hidden sandboxed frame → { errors[], info{title,text,headings,links,images,hOverflow…}, shots[] (best effort), notes[] }. */
        screenshotPage: (html, opts) => VX.playtest.page(html, opts),
        playtest: (script, opts, project) => VX.playtest.run(project || VX.game.currentProject?.(), script, opts),
      },
      docs: {
        /** Add a documentation page that shows up under Docs → Plugins → <your plugin>. Markdown. */
        register(page) {
          const id = `${pluginId}.${page.id || 'page'}`;
          VXHost.docs.set(id, { id, title: page.title || page.id || 'Notes', markdown: page.markdown || '', plugin: pluginId });
          track(() => VXHost.docs.delete(id)); VXHost.changed();
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
        /** Progress dialog: set(percent, status), log(line), close(), onCancel(cb), cancelled */
        /** Plain-text checklist dialog (no terminal): checklist(title, [{ id, label, group }]) → { set(id, state, text), label(id, text), note(text), detail(line), done(buttonLabel), onCancel(cb), close(), cancelled }
         *  state: 'pending' | 'run' (spinner) | 'ok' (check mark) | 'fail' (cross) | 'warn' | 'todo' (will be downloaded) | 'skip'. detail() collects technical output that is only shown by "Copy technical details". */
        checklist(title, items) {
          const h = VX.h, api = { cancelled: false }, rows = new Map(), details = []; let cb = null;
          const ICON = { pending: '○', run: '', ok: '✓', fail: '✕', warn: '!', todo: '⬇', skip: '–' };
          const list = h('div', { class: 'chk' }); let group = null;
          for (const it of items) {
            if (it.group && it.group !== group) { group = it.group; list.append(h('div', { class: 'chk-group' }, group)); }
            const ico = h('span', { class: 'chk-ico chk-pending' }, ICON.pending), lab = h('span', { class: 'chk-label' }, it.label), txt = h('div', { class: 'chk-text' }, it.text || '');
            list.append(h('div', { class: 'chk-row' }, ico, h('div', { class: 'chk-main' }, lab, txt))); rows.set(it.id, { ico, lab, txt });
          }
          const sum = h('div', { class: 'chk-sum' }, 'Starting …');
          const cancel = h('button', { class: 'btn', onclick: () => { api.cancelled = true; cancel.disabled = true; sum.textContent = 'Cancelling …'; cb && cb(); } }, 'Cancel');
          const copy = h('button', { class: 'btn', style: 'display:none', onclick: () => { try { navigator.clipboard.writeText(details.join('\n')); VX.ui.toast('Technical details copied'); } catch { /* clipboard blocked */ } } }, 'Copy technical details');
          const m = VX.ui.modal({ title, dismissable: false, body: h('div', {}, list, sum), actions: [copy, cancel] });
          api.set = (id, state, text) => { const r = rows.get(id); if (!r) return; r.ico.className = 'chk-ico chk-' + state; r.ico.textContent = ICON[state] ?? ''; if (text != null) r.txt.textContent = text; };
          api.label = (id, text) => { const r = rows.get(id); if (r) r.lab.textContent = text; };
          api.state = (id) => { const r = rows.get(id); return r ? r.ico.className.replace('chk-ico chk-', '') : ''; };
          api.note = (text) => { sum.textContent = text; };
          api.detail = (line) => { details.push(String(line).slice(0, 400)); if (details.length > 400) details.splice(0, 100); };
          api.onCancel = (f) => { cb = f; };
          api.done = (label) => { cancel.textContent = label || 'Close'; cancel.disabled = false; cancel.onclick = () => m.close(); if (details.length) copy.style.display = ''; };
          api.close = () => m.close();
          return api;
        },
        progress: (title) => VX.ui.progress(title),
      },
      hooks: {
        /** React to app actions: 'game.export.html' (filter: return changed html), 'account.register' / 'account.login' / 'account.password' / 'publish.before' (throw vx.hooks.block('why') to stop it), 'account.loginOk' / 'account.loginFailed' (notifications). */
        on(name, fn) { track(VX.hooks.on(name, fn)); },
        block(message) { const e = new Error(message); e.vxBlock = true; return e; },
      },
      config: {
        /** Adds a ⚙ Configure button to the plugin card. def: { title, intro, fields:[vx.ui.form fields without value], validate(values), load()→values, save(values) }.  Without load/save the values live in vx.settings. */
        register(def) { VXHost.configs.set(pluginId, def); note('config', def.title || 'Configure'); track(() => { VXHost.configs.delete(pluginId); VXHost.changed(); }); VXHost.changed(); },
        open: () => VXHost.openConfig(pluginId),
      },
      proc: {
        /** Run npm / npx / node in a folder under store-export/. Returns a promise of the exit code with .cancel(). */
        run({ cwd, program, args = [], onLine }) {
          let id = null, cancelled = false;
          const p = (async () => {
            id = await window.native.runStart(cwd, program, args);
            for (;;) {
              if (cancelled) { try { await window.native.runCancel(id); } catch (e) { /* ignore */ } }
              const r = await window.native.runPoll(id);
              (r.lines || []).forEach((l) => { try { onLine && onLine(l); } catch (e) { /* ignore */ } });
              if (r.done) return cancelled ? -1 : (r.code ?? -1);
              await new Promise((res) => setTimeout(res, 150));
            }
          })();
          p.cancel = () => { cancelled = true; };
          return p;
        },
        available: () => !!window.__TAURI__,
      },
      net: {
        /** HTTP request through the desktop app (no CORS limits). { method, url, headers, body, timeout } → { status, body }. Plain http:// is only allowed for localhost. */
        async request({ method = 'GET', url, headers, body, timeout }) {
          let u; try { u = new URL(url); } catch { throw new Error('Invalid URL'); }
          const local = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(u.hostname);
          if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) throw new Error('Only https:// (or http://localhost) URLs are allowed');
          /* Always IPv4 for this computer: "localhost" can resolve to IPv6 (::1) first on Windows, while servers such as Ollama listen on 127.0.0.1 only. */
          const t = new URL(url); if (t.hostname === 'localhost' || t.hostname === '[::1]') t.hostname = '127.0.0.1';
          return window.native.http({ method, url: t.toString(), headers, body, timeout_secs: timeout });
        },
      },
      account: { /** Adds a section to Your account (profile). render(container, { user }). */
        addSection(sec) { VX.accountSections = VX.accountSections || []; const e = { id: pluginId + '.' + (sec.id || 'sec'), render: sec.render }; VX.accountSections.push(e); track(() => { VX.accountSections = (VX.accountSections || []).filter((x) => x !== e); }); },
        /** Sign-in security calls: security(), mfaSetup(pw), mfaEnable(pw, code), mfaDisable(pw), mfaRecovery(pw), addKey(pw, name), removeKey(pw, id). */
        get security() { return VX.cloud; },
        current: () => H().account?.() ?? null, signOut: () => (VX.cloud ? VX.cloud.logout() : Promise.resolve()) },
      onUnload(fn) { track(fn); },
      fs: {
        readFile: (p) => window.native.readFile(p),
        /** File as base64 (binary safe). */
        readBase64: (p) => window.native.readBase64(p),
        /** Entries of a folder: [{ name, path, is_dir }]. */
        readDir: (p) => window.native.readDir(p),
        writeFile: (p, c) => window.native.writeFile(p, c),
        writeBase64: (p, b64) => window.native.writeBase64(p, b64),
        exists: (p) => window.native.exists(p),
        /** Delete a file or folder inside the open folder (never the folder itself). */
        remove: async (p) => { const r = inRoot(p); if (!r) throw new Error('Outside the open folder'); return window.native.remove(r); },
        /** Rename a file/folder (same parent). */
        rename: async (p, newName) => { const r = inRoot(p); if (!r) throw new Error('Outside the open folder'); return window.native.rename(r, newName); },
        /** Create a folder (and parents) inside the open folder. */
        mkdir: async (p) => { const r = inRoot(p); if (!r) throw new Error('Outside the open folder'); const root = (H().root?.() || '').replace(/[\\/]+$/, ''); return window.native.create(root, r.slice(root.length + 1), true).catch((e) => { if (!/already exists/.test(e.message || e)) throw e; }); },
        /** Open a file of the folder in an editor tab. */
        open: (p) => H().openPath?.(inRoot(p) || p),
        /** Relative paths of the files in the open folder (skips node_modules/.git). */
        list: (limit = 3000) => { const r = H().root?.(); return r ? window.native.listFiles(r, limit) : Promise.resolve([]); },
        root: () => H().root?.() ?? null,
      },
      settings: {
        get: (k, d) => (H().settings?.plugins?.[pluginId]?.[k] ?? d),
        set: (k, v) => H().setPluginSetting?.(pluginId, k, v),
      },
      on(ev, cb) { track(VXHost.on(ev, cb)); },
      log: (...a) => console.log(`[plugin:${pluginId}]`, ...a),
    };
  }

  /* ---------- plugins ---------- */
  function parseManifest(code, file) {
    const m = code.match(/\/\*\*?\s*@(?:vx|forge|vextra)-plugin\s*([\s\S]*?)\*\//);
    let man = {};
    if (m) { try { man = JSON.parse(m[1]); } catch { /* fall through */ } }
    man.id = man.id || file.replace(/\.js$/, '');
    man.name = man.name || man.id; man.version = man.version || '0.0.1'; man.description = man.description || '';
    const d = code.match(/\/\*\*?\s*@(?:vx|forge|vextra)-docs\s*([\s\S]*?)\*\//);
    man.docs = d ? d[1].replace(/^[ \t]*\* ?/gm, '').trim() : '';
    return man;
  }

  /** Markdown shown for a plugin in the Docs view: author docs + an auto-generated list of everything it adds. */
  VXHost.pluginDocsMarkdown = function (id) {
    const rec = VXHost.plugins.get(id); if (!rec) return '';
    const m = rec.manifest; const lines = [`# ${m.name}`, '', `*v${m.version} · ${rec.source === 'builtin' ? 'built-in plugin' : 'your plugin'}*`, '', m.description || '', ''];
    if (m.docs) lines.push(m.docs, '');
    const bl = window.VXRT ? Object.values(VXRT.blocks).filter((b) => b.plugin === id) : []; if (bl.length && VX.docs && VX.docs.blockMd) { lines.push('## Blocks', '', `${bl.length} block${bl.length === 1 ? '' : 's'} in the **Plugins** category of the Logic tab.`, ''); for (const b of bl) lines.push(VX.docs.blockMd(b), ''); }
    for (const d of VXHost.docs.values()) if (d.plugin === id) lines.push(`## ${d.title}`, '', d.markdown, '');
    const c = rec.contrib || {};
    const sect = [['commands', 'Commands', 'Run from the Command Palette (**Ctrl+Shift+P**).'], ['toolbar', 'Toolbar buttons', 'Appear above the editor when they apply.'], ['panels', 'Side panels', 'Open from the activity bar.'], ['statusItems', 'Status bar items', ''], ['components', 'Designer components', 'Find them in the **Create** panel.'], ['blocks', 'Logic blocks', 'Find them under **Plugins** in the block palette of the game editor.'], ['themes', 'Themes', '']];
    const rows = sect.filter(([k]) => c[k] && c[k].length);
    if (rows.length) { lines.push('## What this plugin adds', ''); for (const [k, title, note] of rows) { lines.push(`**${title}**${note ? ' — ' + note : ''}`, ''); for (const t of c[k]) lines.push(`- ${t}`); lines.push(''); } }
    if (!rec.enabled) lines.push('> This plugin is currently **disabled**. Enable it in the Plugins panel to use it.', '');
    if (rec.error) lines.push(`> ⚠ This plugin failed to load: \`${rec.error}\``, '');
    return lines.join('\n');
  };

  VXHost.plugins_ = {
    async loadAll() {
      for (const id of [...VXHost.plugins.keys()]) this.unload(id);
      VXHost.plugins.clear();
      const files = await window.native.ext.list('plugins');
      const disabled = new Set(VXHost.host.settings?.disabledPlugins || []);
      for (const f of files) { // user plugins override built-ins that share the same id
        const manifest = parseManifest(f.content, f.file);
        VXHost.plugins.set(manifest.id, { manifest, file: f.file, path: f.path, source: f.source, code: f.content, enabled: !disabled.has(manifest.id), error: null, disposers: [], contrib: {} });
      }
      for (const rec of VXHost.plugins.values()) if (rec.enabled) this.activate(rec);
      VXHost.changed();
    },
    activate(rec) {
      rec.error = null; rec.disposers = []; rec.contrib = {};
      try {
        const api = makeApi(rec.manifest.id, rec.disposers, rec.contrib);
        const fn = new Function('vx', 'forge', 'module', rec.code + '\n//# sourceURL=vextra-plugin-' + rec.manifest.id + '.js');
        const mod = { exports: {} };
        fn(api, api, mod); // `forge` is the old name of `vx` – kept so plugins written before 4.2 still run
        if (typeof mod.exports.deactivate === 'function') rec.disposers.push(mod.exports.deactivate);
        rec.enabled = true;
      } catch (e) {
        rec.error = e.message || String(e);
        this.unload(rec.manifest.id, true);
        console.error('[plugin] failed', rec.manifest.id, e);
      }
    },
    unload(id, keepRec) {
      const rec = VXHost.plugins.get(id); if (!rec) return;
      for (const d of rec.disposers.splice(0).reverse()) { try { d(); } catch (e) { console.warn(e); } }
      if (!keepRec) rec.enabled = false;
    },
    setEnabled(id, on) {
      const rec = VXHost.plugins.get(id); if (!rec) return;
      const set = new Set(VXHost.host.settings.disabledPlugins || []);
      if (on) { set.delete(id); this.activate(rec); } else { set.add(id); this.unload(id); }
      VXHost.host.settings.disabledPlugins = [...set];
      VXHost.host.saveSettings(); VXHost.changed();
    },
    template(name) {
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-plugin';
      const safe = name.replace(/["'`\\]/g, '');
      return { id, file: id + '.js', code: `/** @vx-plugin {"id":"${id}","name":"${safe}","version":"1.0.0","description":"Describe what this plugin does"} */
/** @vx-docs
 * ## How to use ${safe}
 * Explain here what your plugin does. This text appears in **Docs → Plugins → ${safe}**
 * and is written in Markdown.
 *
 * - Run **${safe}: Say hello** from the Command Palette.
 */

// \`vx\` is the plugin API. Save this file to hot-reload it. Full reference: Docs → Plugins → Plugin API.

// 1) Add a command (Ctrl+Shift+P to run it)
vx.commands.register({
  id: 'hello',
  title: '${safe}: Say hello',
  run() {
    vx.ui.toast('Hello from ${id}! Current language: ' + vx.editor.getLanguage(), 'ok');
  },
});

// 2) Add a status bar item
const status = vx.statusBar.add({ id: 'status', text: '${id}', align: 'right' });

// 3) React to editor events
vx.editor.onSave(() => status.update('${id}: saved'));

// 4) Optional: add a custom logic block for the game editor
// vx.game.registerBlock({ id: '${id}-double', label: 'Double', cat: 'plugins', desc: 'Doubles the number it receives.',
//   inputs: ['in'], outputs: ['out'], params: [],
//   onInput(node, port, value, rt) { rt.send(node, 'out', (+value || 0) * 2); } });

// More: vx.panels.register, vx.themes.register,
//       vx.docs.register, vx.ui.form/modal, vx.settings.get/set ...
// Clean-up is automatic when the plugin is disabled.
` };
    },
  };

  VXHost._makeApi = makeApi;
  /** Opens a plugin's settings as an editor tab named plugin:<name> (roomy page instead of a small dialog). */
  VXHost.openConfig = async function (id) {
    const def = VXHost.configs.get(id); if (!def) return; const rec = VXHost.plugins.get(id); const name = rec ? rec.manifest.name : id;
    if (!VX.tabs || !VX.tabs.open) return;
    return VX.tabs.open({ kind: 'page', key: 'plugin-config:' + id, title: 'plugin:' + name, icon: 'settings', render: (c) => VXHost.renderConfigPage(c, id) });
  };
  VXHost.renderConfigPage = async function (container, id) {
    const h = VX.h, def = VXHost.configs.get(id), rec = VXHost.plugins.get(id); if (!def) return container.append(h('div', { class: 'empty' }, 'This plugin has no settings.'));
    const m = rec ? rec.manifest : { name: id, version: '', description: '' };
    const cur = def.load ? await def.load() : Object.fromEntries(def.fields.map((f) => [f.key, VXHost.host.settings?.plugins?.[id]?.[f.key]]));
    const inputs = {}, dyn = []; const err = h('div', { class: 'form-error hidden' }); let dirty = false; const notes = {};
    /* what a plugin's onChange(key, values, api) can do: set a value, lock a field (with the reason shown under it) or write a note under it */
    const cfgApi = { set: (k, x) => { if (inputs[k]) { inputs[k].value = x; mark(); } }, disable: (k, off, why) => { const i = inputs[k]; if (i && 'disabled' in i) { i.disabled = !!off; if (i.closest) { const l = i.closest('label'); if (l) l.style.opacity = off ? '.6' : ''; } } cfgApi.note(k, off && why ? why : ''); }, note: (k, text) => { const i = inputs[k]; const l = i && i.closest && i.closest('label'); if (!l) return; let n = notes[k]; if (!n) { n = notes[k] = h('small', { style: 'color:var(--accent)' }, ''); l.append(n); } n.textContent = text || ''; n.style.display = text ? '' : 'none'; } };
    const mark = () => { if (!dirty) { dirty = true; save.disabled = false; state.textContent = 'Unsaved changes'; } };
    const fireChange = (k) => { if (def.onChange) { try { def.onChange(k, values(), cfgApi); } catch (e) { /* ignore */ } } };
    const fieldEl = (f) => {
      const v = cur && cur[f.key] !== undefined && cur[f.key] !== null ? cur[f.key] : def.defaults && def.defaults[f.key] !== undefined ? def.defaults[f.key] : f.value; let input;
      if (f.type === 'select') { input = h('select', {}, (f.options || []).map((o) => { const [val, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: val }, l); })); input.value = v ?? ''; }
      else if (f.type === 'textarea') input = h('textarea', { rows: f.rows || 4, placeholder: f.placeholder || '' }, v ?? '');
      else if (f.type === 'checkbox') { input = h('input', { type: 'checkbox' }); input.checked = !!v; }
      else if (f.type === 'dynamic') {
        /* a dropdown filled by f.loadOptions(values) → [[value,label]]; reloads when the fields in f.refreshOn change; “Other…” lets you type a value */
        const sel = h('select', {}), txt = h('input', { placeholder: f.placeholder || 'type a value', style: 'margin-top:4px;display:none' }), info = h('small', {}, ''), rf = h('button', { class: 'btn sm', type: 'button', title: 'Reload the list' }, '↻ Refresh');
        const box = h('div', {}, h('div', { style: 'display:flex;gap:6px' }, sel, rf), txt, info); let cur0 = v ?? '';
        const ctlv = { get value() { return sel.value === '__other' ? txt.value : sel.value; }, set value(x) { cur0 = x ?? ''; fill(lastList); }, addEventListener() {} }; let lastList = [];
        const fill = (list) => { lastList = list; const want = cur0; sel.textContent = ''; if (!list.length) sel.append(h('option', { value: '' }, '— none found —')); else sel.append(h('option', { value: '' }, '— select a model —')); for (const [val, l] of list) sel.append(h('option', { value: val }, l || val)); sel.append(h('option', { value: '__other' }, 'Other… (type a name)')); if (want && !list.some(([val]) => val === want)) { sel.value = '__other'; txt.style.display = ''; txt.value = want; } else { sel.value = want || ''; txt.style.display = 'none'; } };
        const load = async () => { info.textContent = 'Loading…'; try { const cv = {}; for (const k of Object.keys(inputs)) cv[k] = inputs[k].type === 'checkbox' ? inputs[k].checked : inputs[k].value; cur0 = ctlv.value || cur0; const r = await f.loadOptions(cv); fill(r.options || r); info.textContent = r.note || (r.length ?? r.options.length) + ' found'; } catch (e) { fill([]); info.textContent = e.message || String(e); } };
        sel.onchange = () => { txt.style.display = sel.value === '__other' ? '' : 'none'; if (sel.value === '__other') txt.focus(); mark(); fireChange(f.key); }; txt.oninput = () => { mark(); clearTimeout(txt._t); txt._t = setTimeout(() => fireChange(f.key), 500); }; rf.onclick = load; fill([]); ctlv.reload = load; dyn.push({ f, load, clear: () => { cur0 = ctlv.value || cur0; fill([]); info.textContent = ''; } }); setTimeout(load, 0);
        inputs[f.key] = ctlv; return h('label', { class: 'cfgp-field' }, h('b', {}, f.label), box, f.hint ? h('small', {}, f.hint) : null);
      }
      else input = h('input', { type: f.type || 'text', value: v ?? '', placeholder: f.placeholder || '', autocomplete: 'off' });
      input.addEventListener('input', mark); input.addEventListener('change', mark); inputs[f.key] = input;
      { let tm = 0; const changed = () => { const vals = {}; for (const k of Object.keys(inputs)) vals[k] = inputs[k].type === 'checkbox' ? inputs[k].checked : inputs[k].value; if (def.onChange) { try { def.onChange(f.key, vals, cfgApi); } catch (e) { /* ignore */ } } dyn.filter((d) => (d.f.refreshOn || []).includes(f.key) && d.clear).forEach((d) => d.clear()); clearTimeout(tm); tm = setTimeout(() => dyn.filter((d) => (d.f.refreshOn || []).includes(f.key)).forEach((d) => d.load()), 600); }; input.addEventListener(f.type === 'select' || f.type === 'checkbox' ? 'change' : 'input', changed); }
      return f.type === 'checkbox' ? h('label', { class: 'cfgp-field cfgp-check' }, input, h('span', {}, h('b', {}, f.label), f.hint ? h('small', {}, f.hint) : null)) : h('label', { class: 'cfgp-field' }, h('b', {}, f.label), input, f.hint ? h('small', {}, f.hint) : null);
    };
    const groups = []; for (const f of def.fields) { const g = f.group || 'Settings'; let e = groups.find((x) => x.name === g); if (!e) groups.push((e = { name: g, fields: [] })); e.fields.push(f); }
    const values = () => Object.fromEntries(def.fields.map((f) => [f.key, f.type === 'checkbox' ? inputs[f.key].checked : f.type === 'number' ? parseFloat(inputs[f.key].value) : inputs[f.key].value]));
    const state = h('span', { class: 'cfgp-state' }, 'All changes saved');
    const doSave = async () => {
      const v = values(); err.classList.add('hidden');
      for (const f of def.fields) if (f.required && !String(v[f.key] ?? '').trim()) { err.textContent = f.label + ' is required'; err.classList.remove('hidden'); return; }
      if (def.validate) { const msg = await def.validate(v); if (msg) { err.textContent = msg; err.classList.remove('hidden'); return; } }
      if (def.save) await def.save(v); else for (const f of def.fields) VXHost.host.setPluginSetting?.(id, f.key, v[f.key]);
      dirty = false; save.disabled = true; state.textContent = 'Saved'; VX.ui.toast('Settings saved', 'ok'); VXHost.emit('configSaved', id, v);
    };
    const save = h('button', { class: 'btn primary', disabled: true, onclick: doSave }, 'Save');
    const reset = h('button', { class: 'btn', onclick: async () => { for (const f of def.fields) { const inp = inputs[f.key]; const d = def.defaults && def.defaults[f.key]; if (d === undefined) continue; if (f.type === 'checkbox') inp.checked = !!d; else inp.value = d; } mark(); } }, 'Reset to defaults');
    const extra = h('div', { class: 'cfgp-extra' }); def.extra && def.extra(extra);
    container.append(h('div', { class: 'cfgp page' },
      h('div', { class: 'cfgp-head' }, h('div', {}, h('h2', {}, m.name, ' ', h('small', {}, m.version ? 'v' + m.version : '')), h('p', {}, def.intro || m.description || '')), h('div', { class: 'cfgp-actions' }, state, def.defaults ? reset : null, save)),
      err, ...groups.map((g) => h('section', { class: 'cfgp-group' }, h('h3', {}, g.name), h('div', { class: 'cfgp-grid' }, g.fields.map(fieldEl)))), extra));
    if (def.onChange) setTimeout(() => { try { def.onChange(null, values(), cfgApi); } catch (e) { /* ignore */ } }, 0); /* first call: lets the plugin lock fields that the chosen model cannot change */
  };
  VXHost._makeApi = makeApi;
  window.VXHost = VXHost;
})();
