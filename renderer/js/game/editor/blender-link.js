/* Vextra – live link to Blender. The Blender add-on (tools/blender-addon/vextra_tools.py) runs a small server on THIS computer (127.0.0.1) and Vextra talks to it:
 * pull models from Blender, send models to Blender, and auto-update linked models whenever something changes in Blender. Every request carries the pairing key. */
(function () {
  const { h, uid } = VX;
  const LS = 'vx.blender';
  const cfg = { port: 7788, key: '', auto: true };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { /* storage blocked */ }
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { /* ignore */ } };
  const st = { connected: false, info: null, scene: null, rev: null, pendingSince: 0, busy: false, am: null, timer: 0, listeners: new Set() };
  const emit = () => st.listeners.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
  const base = () => 'http://127.0.0.1:' + (parseInt(cfg.port, 10) || 7788);

  async function req(path, { method = 'GET', body, ms = 120000 } = {}) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms); let r;
    try { r = await fetch(base() + path, { method, body, headers: { 'X-Vextra-Key': cfg.key || '' }, signal: ctl.signal }); }
    catch (e) { throw Object.assign(new Error(ctl.signal.aborted ? 'Blender did not answer in time' : 'Cannot reach Blender on port ' + cfg.port + '. In Blender: press N over the 3D view → Vextra tab → Start link.'), { offline: !ctl.signal.aborted }); }
    finally { clearTimeout(t); }
    if (!r.ok) { let msg = ''; try { msg = (await r.json()).error; } catch (e) { /* not json */ } throw Object.assign(new Error(msg || 'Blender answered ' + r.status), { status: r.status }); }
    return r;
  }
  const json = async (path, o) => (await req(path, o)).json();
  const q = (spec, opts) => '/export?spec=' + encodeURIComponent(JSON.stringify(spec || {})) + '&opts=' + encodeURIComponent(JSON.stringify(opts || {}));
  const toURL = (buf) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(new Blob([buf], { type: 'model/gltf-binary' })); });

  /** Asks Blender who it is. Updates the connection state; never throws. */
  async function ping() {
    try { const i = await json('/ping', { ms: 4000 }); const was = st.connected; st.info = i; st.connected = !!i.authorized; st.error = i.authorized ? '' : (cfg.key ? 'Blender is running, but the key does not match.' : 'Blender is running – paste its key to pair.'); if (was !== st.connected) emit(); return i; }
    catch (e) { const was = st.connected; st.connected = false; st.info = null; st.error = e.message; if (was) emit(); return null; }
  }
  async function loadScene() { st.scene = await json('/scene'); emit(); return st.scene; }

  /** Reads from Blender and returns { buf, objects }. spec: {objects|collection|asset|scene|selection}. */
  async function pullBuffer(spec, opts) { const r = await req(q(spec, opts)); let objects = []; try { objects = JSON.parse(decodeURIComponent(r.headers.get('X-Vextra-Objects') || '[]')); } catch (e) { /* header missing */ } return { buf: await r.arrayBuffer(), objects }; }

  const meta = (a) => a && a.blender;
  /** Creates a new model asset from Blender (or refreshes `existing`). Returns the asset. */
  async function pull(spec, { name, opts, existing } = {}) {
    const am = st.am; if (!am) throw new Error('open a game project first');
    const { buf, objects } = await pullBuffer(spec, opts);
    if (buf.byteLength > 40e6) throw new Error('the model is ' + (buf.byteLength / 1e6).toFixed(0) + ' MB – turn on Draco compression or reduce it in Blender');
    const data = await toURL(buf);
    if (existing && existing.data === data) return existing;           // nothing really changed
    const a = existing ? { ...existing, data } : { id: uid('mdl'), name: name || 'blender model', kind: 'glb', data };
    delete a.text; a.kind = 'glb';
    const real = spec.objects && !spec.asset ? { objects } : spec;     // remember the exact objects, so “selected” keeps meaning the same things later
    a.blender = { spec: existing ? existing.blender.spec : real, opts: opts || (existing && existing.blender.opts) || {}, at: Date.now(), auto: existing ? existing.blender.auto !== false : true };
    await am.checkModel(a, new Blob([buf]));
    am.A.models[a.id] = a; am.ctx.onChange(true); am.renderGrid(); emit();
    return a;
  }

  /** Sends a model of the project to Blender (glb/gltf stay linked two-way; voxel and OBJ models are sent as a one-way copy). */
  async function push(a) {
    const am = st.am; let bytes, ext = 'glb', linked = false;
    if (a.kind === 'glb') { bytes = VXRT.glbBytes(a); linked = true; }
    else if (a.kind === 'gltf') { bytes = new TextEncoder().encode(a.text || '{}'); ext = 'gltf'; linked = true; }
    else if (a.kind === 'obj') { bytes = new TextEncoder().encode(a.text || ''); ext = 'obj'; }
    else {
      const T = window.THREE, env = { assets: { sprites: {}, sounds: {}, models: { m: a }, materials: am.A.materials || {} }, imgs: new Map(), onImageLoad() {} };
      const o = VXRT.build3D(T, { type: 'model', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, w: 1, h: 1, d: 1, color: '#ffffff', alpha: 1, material: {}, props: { model: 'm' } }, env);
      bytes = await VX.modelImport.toGLB(o);
    }
    const res = await json('/import?ext=' + ext + '&name=' + encodeURIComponent(a.name) + '&asset=' + encodeURIComponent(a.id), { method: 'POST', body: bytes, ms: 180000 });
    if (linked && !meta(a)) { a.blender = { spec: { asset: a.id }, opts: {}, at: Date.now(), auto: true }; am.ctx.onChange(); am.renderGrid(); }
    emit(); return res;
  }

  const linkedAssets = () => (st.am ? Object.values(st.am.A.models).filter((a) => meta(a)) : []);
  async function resync(a) { return pull(a.blender.spec, { existing: a, opts: a.blender.opts }); }

  /* auto-sync: watch Blender's change counter; when it settles, refresh every linked model that has auto-sync on */
  async function tick() {
    if (document.hidden || st.busy) return;
    const linked = linkedAssets(), watching = linked.length || st.listeners.size;
    if (!watching && !st.connected) return;
    const i = await ping(); if (!i || !i.authorized) return;
    if (st.rev === null) { st.rev = i.rev; return; }
    if (i.rev !== st.rev) { st.rev = i.rev; st.pendingSince = Date.now(); }
    if (!st.pendingSince || !cfg.auto || i.playing || i.idle < 1.2) return;
    const todo = linked.filter((a) => a.blender.auto !== false); st.pendingSince = 0; if (!todo.length) return;
    st.busy = true;
    try { let n = 0; for (const a of todo) { try { const b = await resync(a); if (b !== a) n++; } catch (e) { if (e.status === 409) { st.pendingSince = Date.now() + 2000; break; } VX.ui.toast('Blender sync: ' + e.message, 'warn'); } } if (n) VX.ui.toast('Updated ' + n + ' model' + (n > 1 ? 's' : '') + ' from Blender'); }
    finally { st.busy = false; }
  }
  const start = () => { if (!st.timer) st.timer = setInterval(tick, 900); };
  start();

  /* ───────────── UI ───────────── */
  function open(am) {
    st.am = am; start(); let scene = null, target = 'selection', pname = '', draco = true, anim = true, working = '';
    const body = h('div', { class: 'bl-link' });
    const m = VX.ui.modal({ title: '🟠 Blender link', body, wide: true, onClose: () => { st.listeners.delete(draw); } });
    const run = async (label, fn) => { working = label; draw(); try { await fn(); } catch (e) { VX.ui.toast(e.message, 'error'); } working = ''; try { scene = await loadScene(); } catch (e) { /* offline */ } draw(); };
    function draw() {
      body.textContent = '';
      const dot = h('span', { class: 'bl-dot' + (st.connected ? ' on' : '') });
      const port = h('input', { type: 'number', value: cfg.port, style: 'width:80px', onchange: (e) => { cfg.port = parseInt(e.target.value, 10) || 7788; save(); } });
      const key = h('input', { value: cfg.key, placeholder: 'key from Blender', style: 'width:130px', spellcheck: 'false', onchange: (e) => { cfg.key = e.target.value.trim(); save(); } });
      body.append(h('div', { class: 'row g6 wrap bl-conn' }, dot, h('b', {}, st.connected ? 'Connected to Blender ' + (st.info.blender || '') : 'Not connected'), h('span', { class: 'sp' }), h('label', {}, 'Port ', port), h('label', {}, 'Key ', key),
        h('button', { class: 'btn sm primary', onclick: () => run('Connecting…', async () => { cfg.port = parseInt(port.value, 10) || 7788; cfg.key = key.value.trim(); save(); st.rev = null; const i = await ping(); if (!i) throw new Error(st.error); if (!i.authorized) throw new Error(st.error); }) }, st.connected ? 'Reconnect' : 'Connect')));
      if (!st.connected) {
        body.append(h('div', { class: 'bl-help' }, h('b', {}, 'How to connect'), h('ol', {}, h('li', {}, 'Install the add-on in Blender: ', h('code', {}, 'tools/blender-addon/vextra_tools.py'), ' → Edit → Preferences → Add-ons → Install from Disk.'), h('li', {}, 'In Blender press ', h('b', {}, 'N'), ' over the 3D view → ', h('b', {}, 'Vextra'), ' tab → ', h('b', {}, 'Start link'), '.'), h('li', {}, 'Copy the key shown there into the Key box above and press Connect.')),
          st.error ? h('div', { class: 'bl-err' }, st.error) : null, h('div', { class: 'as-hint' }, 'The link only works on this computer (127.0.0.1) and every request needs the key, so other programs and web pages cannot reach your Blender.')));
        return;
      }
      const s = scene, b = s && s.budget;
      body.append(h('div', { class: 'as-hint' }, s ? ('File: ' + s.file + ' · ' + b.tris.toLocaleString() + ' triangles · ' + b.bones + ' bones · ' + b.clips + ' animation' + (b.clips === 1 ? '' : 's') + (b.bigTextures.length ? ' · ⚠ textures over 2048 px' : '')) : 'Reading the scene…'), working ? h('div', { class: 'bl-work' }, '⏳ ' + working) : '');
      /* pull */
      const sel = (s && s.selected) || [];
      const opts = [['selection', 'Selected objects' + (sel.length ? ' (' + sel.length + ')' : ' – nothing selected')], ['scene', 'The whole scene'], ...(((s && s.collections) || []).map((c) => ['c:' + c.name, 'Collection “' + c.name + '” (' + c.count + ')']))];
      const tsel = h('select', { onchange: (e) => { target = e.target.value; } }, opts.map(([v, l]) => h('option', { value: v, selected: v === target }, l)));
      const nm = h('input', { placeholder: 'model name', value: pname, style: 'width:160px', oninput: (e) => { pname = e.target.value; } });
      body.append(h('div', { class: 'bl-card' }, h('b', {}, '⬇ From Blender into the game'), h('div', { class: 'row g6 wrap' }, tsel, nm,
        h('label', {}, h('input', { type: 'checkbox', checked: draco, onchange: (e) => { draco = e.target.checked; } }), ' Draco'), h('label', {}, h('input', { type: 'checkbox', checked: anim, onchange: (e) => { anim = e.target.checked; } }), ' Animations'),
        h('button', { class: 'btn sm primary', disabled: !!working, onclick: () => run('Reading from Blender…', async () => {
          let spec; if (target === 'selection') { if (!sel.length) throw new Error('Select something in Blender first'); spec = { objects: sel }; } else if (target === 'scene') spec = { scene: true }; else spec = { collection: target.slice(2) };
          const a = await pull(spec, { name: pname.trim() || (target === 'selection' ? sel[0] : target === 'scene' ? (s.file.replace(/\.blend$/i, '') || 'scene') : target.slice(2)), opts: { draco, animations: anim } }); VX.ui.toast('Added “' + a.name + '” – it now updates when you change it in Blender'); }) }, 'Pull model'))));
      /* linked */
      const lk = linkedAssets();
      body.append(h('div', { class: 'bl-card' }, h('div', { class: 'row g6' }, h('b', {}, '🔗 Linked models'), h('span', { class: 'sp' }), h('label', { title: 'Whenever something changes in Blender, linked models in the game refresh by themselves' }, h('input', { type: 'checkbox', checked: cfg.auto, onchange: (e) => { cfg.auto = e.target.checked; save(); } }), ' Auto-sync')),
        lk.length ? lk.map((a) => h('div', { class: 'row g6 bl-row' }, h('span', {}, '🗿 ' + a.name), h('span', { class: 'as-hint' }, a.blender.spec.asset ? 'sent from the game' : a.blender.spec.collection ? 'collection ' + a.blender.spec.collection : a.blender.spec.scene ? 'whole scene' : (a.blender.spec.objects || []).slice(0, 3).join(', ')), h('span', { class: 'sp' }),
          h('label', {}, h('input', { type: 'checkbox', checked: a.blender.auto !== false, onchange: (e) => { a.blender.auto = e.target.checked; st.am.ctx.onChange(); } }), ' auto'),
          h('button', { class: 'btn sm', disabled: !!working, onclick: () => run('Updating “' + a.name + '”…', async () => { await resync(a); VX.ui.toast('“' + a.name + '” is up to date'); }) }, 'Update now'),
          h('button', { class: 'btn sm', onclick: () => { delete a.blender; st.am.ctx.onChange(); st.am.renderGrid(); draw(); } }, 'Unlink'))) : h('div', { class: 'as-hint' }, 'Models you pull from Blender (or send to it) stay linked here.')));
      /* push */
      const mods = Object.values(am.A.models), psel = h('select', {}, mods.map((a) => h('option', { value: a.id }, a.name + ' (' + (a.kind || 'voxel') + ')')));
      body.append(h('div', { class: 'bl-card' }, h('b', {}, '⬆ From the game into Blender'), mods.length ? h('div', { class: 'row g6 wrap' }, psel, h('button', { class: 'btn sm primary', disabled: !!working, onclick: () => run('Sending…', async () => { const a = am.A.models[psel.value]; const r = await push(a); VX.ui.toast('Sent “' + a.name + '” to Blender (collection “' + r.collection + '”)' + (a.blender ? ' – edits you make there come back automatically' : '')); }) }, 'Send to Blender'),
        h('span', { class: 'as-hint' }, 'glb/gltf models stay linked; voxel and OBJ models go over as a copy.')) : h('div', { class: 'as-hint' }, 'No 3D models in this project yet.')));
    }
    st.listeners.add(draw); draw();
    run('Reading the scene…', async () => { await ping(); });
    return m;
  }
  VX.blender = { cfg, state: st, open, ping, pull, push, resync, scene: loadScene, attach(am) { st.am = am; start(); } };
})();
