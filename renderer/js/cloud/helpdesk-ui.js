/* Vextra Studio – Helpdesk page (devices, inventory, deployment, tickets, sign-ins and settings).
   Talks to the local Vextra server (/api/helpdesk/*, answered only for this computer – same X-Vextra-Admin mechanism as hosting and anti-cheat).
   All text goes through textContent (h()), nothing is ever written with innerHTML. */
(function () {
  const { h } = VX;
  const HD = (VX.helpdesk = {});

  /* ------------------------------------------------------------------ small helpers */
  /** Text for display: never "null", "undefined" or "[object Object]". */
  const t = (v, fb = '—') => { if (v === null || v === undefined || typeof v === 'object' || typeof v === 'function') return fb; const s = String(v).trim(); return !s || s === 'null' || s === 'undefined' || s === 'NaN' || s === '[object Object]' ? fb : s; };
  const num = (v, fb = '—') => (Number.isFinite(+v) && v !== null && v !== '' && v !== undefined ? String(+v) : fb);
  const when = (ms) => { const d = new Date(+ms); return Number.isFinite(+ms) && +ms > 0 && !isNaN(d) ? d.toLocaleString() : '—'; };
  const gb = (kb) => (+kb > 0 ? (kb / 1048576).toFixed(kb >= 10485760 ? 0 : 1) + ' GB' : '—');
  const dur = (s) => { s = +s || 0; if (s <= 0) return '—'; const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? d + ' d ' + hh + ' h' : hh ? hh + ' h ' + m + ' min' : m + ' min'; };
  const OS = { windows: 'Windows', mac: 'macOS', linux: 'Linux', unknown: 'Unknown' };
  const osName = (o) => OS[o] || t(o);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const uid = (p) => VX.uid(p);
  const toastErr = (e) => VX.ui.toast(t(e && e.message, 'Something went wrong'), 'error');

  /** Calls the local server as its administrator. Errors carry .status and .kind ('offline' | 'admin' | 'server'). */
  async function api(method, path, body, raw) {
    let r;
    try { r = await window.native.http({ method, url: VX.cloud.base() + '/api/helpdesk' + path, headers: { 'Content-Type': 'application/json', 'X-Vextra-Admin': '1' }, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) { const er = new Error('The Vextra server at ' + VX.cloud.base() + ' cannot be reached.'); er.kind = 'offline'; throw er; }
    if (raw && r.status < 400) return r.body;
    let j = {}; try { j = r.body ? JSON.parse(r.body) : {}; } catch { j = { error: String(r.body || '').slice(0, 200) }; }
    if (r.status === 404 && /Not found/i.test(t(j.error, '')) && path === '') { const er = new Error('The Vextra server that is running is older than this app and has no Helpdesk. Stop it and start it again (Settings → Local server).'); er.kind = 'server'; er.status = 404; throw er; }
    if (r.status >= 400) { const er = new Error(t(j.error, 'Server error ' + r.status)); er.status = r.status; er.kind = r.status === 403 ? 'admin' : 'server'; throw er; }
    return j;
  }

  /* tiny element builders ------------------------------------------------ */
  const btn = (label, onclick, cls = '', attrs = {}) => h('button', Object.assign({ type: 'button', class: 'btn ' + cls, onclick }, attrs), label);
  const tag = (text, kind = '') => h('span', { class: 'tag ' + kind }, t(text));
  const input = (o = {}) => h('input', Object.assign({ type: 'text', autocomplete: 'off', spellcheck: 'false' }, o));
  const select = (opts, val, attrs = {}) => { const s = h('select', attrs, opts.map(([v, l]) => h('option', { value: v }, l))); s.value = val; if (s.value !== String(val)) s.selectedIndex = 0; return s; };
  const area = (val, rows, attrs = {}) => h('textarea', Object.assign({ rows: rows || 3 }, attrs), val || '');
  /** label + control (+ hint); the label is tied to the control for screen readers. */
  const fld = (label, ctl, hint) => { const id = uid('hd'); ctl.id = id; const hid = hint ? id + 'h' : ''; if (hint) ctl.setAttribute('aria-describedby', hid); return h('div', { class: 'hd-f' }, h('label', { for: id }, label), ctl, hint ? h('div', { class: 'hint', id: hid }, hint) : null); };
  const errBox = () => h('div', { class: 'form-error hidden', role: 'alert' });
  const showErr = (box, msg, focusEl) => { box.textContent = msg; box.classList.remove('hidden'); if (focusEl) focusEl.focus(); return false; };
  const hideErr = (box) => box.classList.add('hidden');
  const notice = (kind, title, text, ...actions) => h('div', { class: 'hd-note ' + kind, role: kind === 'err' ? 'alert' : 'status' }, h('div', {}, h('b', {}, title), text ? h('div', {}, text) : null), actions.length ? h('div', { class: 'hd-note-act' }, actions) : null);
  const busy = async (b, label, fn) => { const old = b.textContent; b.disabled = true; b.setAttribute('aria-busy', 'true'); if (label) b.textContent = label; try { return await fn(); } finally { b.disabled = false; b.removeAttribute('aria-busy'); b.textContent = old; } };
  const empty = (text) => h('div', { class: 'hd-empty' }, text);
  const statusKind = (s) => ({ ok: 'ok', done: 'ok', failed: 'err', partial: 'warn', running: 'acc', queued: '', skipped: 'warn' }[s] || '');
  const bar = (frac, label) => { const f = Math.max(0, Math.min(1, +frac || 0)); return h('div', { class: 'hd-bar' + (f > 0.9 ? ' hot' : ''), role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(f * 100), 'aria-label': label || 'Progress' }, h('i', { style: 'width:' + (f * 100).toFixed(1) + '%' })); };

  /* ------------------------------------------------------------------ the page */
  HD.open = () => VX.tabs.open({ kind: 'page', key: 'page:helpdesk', title: 'Helpdesk', icon: 'monitor', render: render });

  function render(c) {
    const TABS = [['dash', 'Dashboard'], ['devices', 'Devices'], ['deploy', 'Deploy'], ['tickets', 'Tickets'], ['settings', 'Sign-ins & settings']];
    let cur = 'dash', gen = 0; const timers = new Set();
    const st = { files: [], maxFile: 0, status: null, devices: [], creds: [], actions: [], packages: [], jobs: [], tickets: [], pendingTicket: null };
    const root = h('div', { class: 'page hd-page' });
    const head = h('div', { class: 'hd-head' }, h('h1', {}, 'Helpdesk'), h('p', { class: 'lead' }, 'Inventory, remote help and software deployment for the computers on your network. Nothing is installed on them – they are managed over SSH.'));
    const tabBar = h('div', { class: 'hd-tabs', role: 'tablist', 'aria-label': 'Helpdesk sections' });
    const panel = h('div', { class: 'hd-panel', role: 'tabpanel', tabindex: '-1' });
    root.append(head, tabBar, panel); c.append(root);
    const alive = () => root.isConnected;
    /** setInterval that stops itself when the page is closed or the tab changed. */
    const poll = (fn, ms, myGen) => { const id = setInterval(() => { if (!alive() || myGen !== gen) { clearInterval(id); timers.delete(id); return; } fn(); }, ms); timers.add(id); return id; };
    const clearTimers = () => { for (const id of timers) clearInterval(id); timers.clear(); };

    const drawTabs = () => {
      tabBar.textContent = '';
      for (const [id, label] of TABS) tabBar.append(h('button', { type: 'button', role: 'tab', id: 'hdt-' + id, 'aria-selected': id === cur ? 'true' : 'false', 'aria-controls': 'hdp', tabindex: id === cur ? '0' : '-1', class: 'hd-tab' + (id === cur ? ' on' : ''), onclick: () => go(id), onkeydown: (e) => {
        const i = TABS.findIndex((x) => x[0] === id), n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1; if (n < 0) return; e.preventDefault(); go(TABS[(n + TABS.length) % TABS.length][0], true); } }, label));
    };
    panel.id = 'hdp';
    function go(id, focus) { cur = id; gen++; clearTimers(); drawTabs(); panel.setAttribute('aria-labelledby', 'hdt-' + id); panel.textContent = ''; show(); if (focus) { const b = tabBar.querySelector('#hdt-' + id); b && b.focus(); } }
    const show = () => { const m = { dash: viewDash, devices: viewDevices, deploy: viewDeploy, tickets: viewTickets, settings: viewSettings }[cur]; const myGen = gen; Promise.resolve().then(() => m(panel, myGen)).catch((e) => { if (myGen === gen) panel.replaceChildren(problem(e)); }); };

    /** The explanation shown when the server cannot be reached / is not admin / is too old. */
    function problem(e) {
      const retry = btn('Try again', () => go(cur), 'sm');
      if (e && e.kind === 'offline') {
        const acts = [retry]; if (VX.cloud.isLocal() && VX.cloud.startLocalServer) acts.unshift(btn('Start the local server', async (ev) => { await busy(ev.currentTarget, 'Starting…', async () => { try { await VX.cloud.startLocalServer(); go(cur); } catch (x) { toastErr(x); } }); }, 'sm primary'));
        return notice('err', 'The Vextra server is not running on this computer', (VX.cloud.isLocal() ? 'The Helpdesk lives in the Vextra server. Start it, then try again.' : 'The app is pointed at ' + VX.cloud.base() + ', which is not this computer. The Helpdesk only works with a Vextra server running on this computer (Settings → Cloud).'), ...acts);
      }
      if (e && e.kind === 'admin') return notice('err', 'This app is not the administrator of that server', 'Helpdesk tools only work from the Vextra app on the same computer that runs the server (' + VX.cloud.base() + '). ' + (VX.cloud.isLocal() ? '' : 'Point the app at a server on this computer in Settings → Cloud. '), retry);
      return notice('err', 'Helpdesk problem', t(e && e.message, 'Something went wrong.'), retry);
    }
    const loadStatus = async () => { st.status = await api('GET', ''); return st.status; };
    const loadDevices = async () => { st.devices = arr((await api('GET', '/devices')).devices); return st.devices; };
    const loadCreds = async () => { st.creds = arr((await api('GET', '/creds')).creds); return st.creds; };
    const loadActions = async () => { if (!st.actions.length) st.actions = arr((await api('GET', '/actions')).actions); return st.actions; };
    const loadFiles = async () => { const r = await api('GET', '/files'); st.files = arr(r.files); st.maxFile = +r.max || 0; return st.files; };
    const loadPackages = async () => { st.packages = arr((await api('GET', '/packages')).packages); return st.packages; };
    const credName = (id) => { const x = st.creds.find((k) => k.id === id); return x ? t(x.name) + ' (' + t(x.user) + ')' : 'None chosen'; };
    const devName = (id) => { const d = st.devices.find((x) => x.id === id); return d ? t(d.name) : ''; };
    const credOptions = () => [['', 'None chosen'], ...st.creds.map((k) => [k.id, t(k.name) + ' (' + t(k.user) + ')'])];

    /* ================================================================== DASHBOARD */
    async function viewDash(p, myGen) {
      p.append(empty('Loading…'));
      const s = await loadStatus(); const [, jobsR] = [0, await api('GET', '/jobs').catch(() => ({ jobs: [] }))]; if (myGen !== gen) return;
      const S = s.stats || {}, T = S.tickets || {}; const out = [];
      if (!s.ssh) out.push(notice('warn', 'The OpenSSH client (ssh) was not found on this computer', 'Devices are managed over SSH, so inventory, actions and deployment cannot run until it is installed. Windows 10/11: Settings → Apps → Optional features → OpenSSH Client. macOS and Linux include it (Linux: install the openssh-client package).'));
      out.push(h('div', { class: 'hd-meta' }, 'Server computer: ', tag(t(s.platform)), ' ', tag(s.ssh ? 'ssh ready' : 'ssh missing', s.ssh ? 'ok' : 'err'), s.subnets && s.subnets.length ? h('span', {}, ' Networks: ', arr(s.subnets).map((n) => tag(n))) : null));
      const card = (label, value, sub, go_, kind) => h('div', { class: 'hd-card ' + (kind || '') }, h('div', { class: 'hd-big' }, num(value, '0')), h('div', { class: 'hd-lbl' }, label), sub ? h('div', { class: 'hd-sub' }, sub) : null, go_ ? btn('View', () => go(go_), 'sm ghost', { 'aria-label': 'View ' + label }) : null);
      out.push(h('div', { class: 'hd-cards' },
        card('Managed devices', S.devices, num(S.discovered, '0') + ' discovered, not yet managed', 'devices'), card('Online', S.online, S.devices ? 'of ' + num(S.devices, '0') : '', 'devices', S.devices && S.online < S.devices ? 'warn' : ''),
        card('Reboot pending', S.rebootPending, S.notInventoried ? num(S.notInventoried) + ' without inventory' : '', 'devices', S.rebootPending ? 'warn' : ''),
        card('Open tickets', T.open, num(T.unassigned, '0') + ' unassigned', 'tickets'), card('Overdue tickets', T.overdue, 'past their SLA time', 'tickets', T.overdue ? 'err' : '')));
      const byOs = Object.entries(S.byOs || {}); const total = byOs.reduce((a, [, n]) => a + n, 0);
      out.push(h('div', { class: 'hd-two' },
        h('section', { class: 'hd-box', 'aria-label': 'Devices by system' }, h('h2', {}, 'Devices by system'), byOs.length ? byOs.map(([o, n]) => h('div', { class: 'hd-osrow' }, h('span', {}, osName(o)), bar(total ? n / total : 0, osName(o) + ' share'), h('b', {}, num(n)))) : empty('No managed devices yet. Open Devices and scan your network.')),
        h('section', { class: 'hd-box', 'aria-label': 'Recent jobs' }, h('h2', {}, 'Recent jobs'), arr(S.jobs).length ? arr(S.jobs).map((j) => h('div', { class: 'hd-line' }, h('span', { class: 'grow' }, t(j.title)), tag(j.status, statusKind(j.status)), h('small', {}, when(j.at)))) : empty('Nothing has been deployed or inventoried yet.'), arr(S.jobs).length ? btn('Open Deploy', () => go('deploy'), 'sm') : null)));
      const row = h('div', { class: 'hd-actions' }, btn('Inventory all devices', async (e) => { await busy(e.currentTarget, 'Starting…', async () => { try { await api('POST', '/inventory-all'); VX.ui.toast('Inventory started – follow it under Deploy → Jobs', 'ok'); go('deploy'); } catch (x) { toastErr(x); } }); }, 'primary', { disabled: !s.ssh || !S.devices }), btn('Scan network', () => { st.autoScan = true; go('devices'); }), btn('New ticket', () => { st.pendingTicket = {}; go('tickets'); }));
      p.replaceChildren(...out, row);
    }

    /* ================================================================== DEVICES */
    async function viewDevices(p, myGen) {
      p.append(empty('Loading…'));
      await Promise.all([loadStatus(), loadDevices(), loadCreds(), loadActions()]); if (myGen !== gen) return;
      let q = '', filt = 'all', sel = st.openDevice || null; st.openDevice = null;
      const list = h('div', { class: 'hd-list' }), detail = h('div', { class: 'hd-detail hidden', role: 'region', 'aria-label': 'Device details' });
      const scanBox = h('div', { class: 'hd-scan hidden', 'aria-live': 'polite' });
      const search = input({ type: 'search', placeholder: 'Filter by name, address, system…', 'aria-label': 'Filter devices', oninput: () => { q = search.value.toLowerCase(); draw(); } });
      const fsel = select([['all', 'All devices'], ['managed', 'Managed'], ['discovered', 'Discovered only'], ['online', 'Online'], ['offline', 'Offline']], 'all', { 'aria-label': 'Show', onchange: () => { filt = fsel.value; draw(); } });
      const range = input({ placeholder: (st.status.subnets || [])[0] || '192.168.1.0/24', 'aria-label': 'Network range to scan (optional)', title: 'Leave empty to scan the networks of this computer', style: 'width:170px' });
      const rangeErr = errBox();
      const scanBtn = btn('Scan network', () => startScan(), 'primary');
      const draw = () => {
        const rows = st.devices.filter((d) => (filt === 'all' || (filt === 'managed' && d.managed) || (filt === 'discovered' && !d.managed) || (filt === 'online' && d.online) || (filt === 'offline' && !d.online)) && (!q || [d.name, d.host, d.ip, d.mac, d.os, osName(d.os)].join(' ').toLowerCase().includes(q)));
        list.textContent = ''; if (!rows.length) { list.append(empty(st.devices.length ? 'No device matches the filter.' : 'No devices yet. Scan your network or add a device by hand.')); return; }
        list.append(h('table', { class: 'hd-table' }, h('caption', { class: 'sr' }, 'Devices'), h('thead', {}, h('tr', {}, ['Name', 'Address', 'System', 'Status', 'Last seen', ''].map((x) => h('th', { scope: 'col' }, x)))),
          h('tbody', {}, rows.map((d) => h('tr', { class: d.id === sel ? 'on' : '' },
            h('td', { 'data-l': 'Name' }, h('b', {}, t(d.name)), d.summary && d.summary.rebootPending ? tag('reboot pending', 'warn') : null),
            h('td', { 'data-l': 'Address' }, t(d.host), d.mac ? h('small', { class: 'mono' }, ' ' + d.mac) : null), h('td', { 'data-l': 'System' }, osName(d.os)),
            h('td', { 'data-l': 'Status' }, tag(d.online ? 'online' : 'offline', d.online ? 'ok' : ''), ' ', tag(d.managed ? 'managed' : 'discovered', d.managed ? 'acc' : '')), h('td', { 'data-l': 'Last seen' }, when(d.lastSeen)),
            h('td', {}, btn('Open', () => openDev(d.id), 'sm', { 'aria-label': 'Open ' + t(d.name) })))))));
      };
      const refresh = async () => { await loadDevices(); if (alive() && myGen === gen) draw(); };
      /* ---- scan with progress polling ---- */
      async function startScan() {
        hideErr(rangeErr); const cidrs = range.value.split(/[\s,;]+/).filter(Boolean);
        for (const x of cidrs) if (!/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(x)) return showErr(rangeErr, '“' + x + '” is not a range. Use a form like 192.168.1.0/24 (private networks only, /22 or smaller).', range);
        scanBtn.disabled = true;
        try { await api('POST', '/scan', cidrs.length ? { cidrs } : {}); } catch (e) { scanBtn.disabled = false; return showErr(rangeErr, e.message, range); }
        scanBox.classList.remove('hidden'); const tick = async () => {
          if (!alive() || myGen !== gen) return true; let s; try { s = await api('GET', '/scan'); } catch (e) { scanBox.replaceChildren(problem(e)); scanBtn.disabled = false; return true; }
          const f = s.total ? s.done / s.total : 0; scanBox.replaceChildren(h('div', {}, s.running ? 'Scanning ' + arr(s.ranges).join(', ') + ' – ' + num(s.done, '0') + ' of ' + num(s.total, '0') + ' addresses checked' : s.error ? t(s.error) : 'Scan finished – ' + num(s.found, '0') + ' device(s) found.'), bar(s.running ? f : 1, 'Scan progress'));
          if (s.running) return false; scanBtn.disabled = false; if (!s.error) VX.ui.toast('Scan finished: ' + num(s.found, '0') + ' device(s)', 'ok'); await refresh(); return true;
        };
        const loop = async () => { while (alive() && myGen === gen) { if (await tick()) break; await VX.sleep(900); } if (!alive() || myGen !== gen) scanBtn.disabled = false; }; loop();
      }
      /* ---- device pane ---- */
      async function openDev(id) {
        sel = id; draw(); detail.classList.remove('hidden'); detail.replaceChildren(empty('Loading…'));
        try { const r = await api('GET', '/devices/' + encodeURIComponent(id)); if (sel !== id) return; devPane(r.device); } catch (e) { detail.replaceChildren(problem(e)); }
        detail.scrollIntoView && detail.scrollIntoView({ block: 'nearest' });
      }
      const closeDev = () => { sel = null; detail.classList.add('hidden'); detail.textContent = ''; draw(); };
      function devPane(d) {
        const err = errBox(), top = h('div', { class: 'hd-dhead' }, h('h2', { tabindex: '-1' }, t(d.name)), btn('Close', closeDev, 'sm ghost', { 'aria-label': 'Close device details' }));
        const name = input({ value: t(d.name, '') }), host = input({ value: t(d.host, '') }), port = input({ type: 'number', min: 1, max: 65535, value: d.port || 22 });
        const os = select([['unknown', 'Not known yet (found when inventoried)'], ['windows', 'Windows'], ['mac', 'macOS'], ['linux', 'Linux']], d.os || 'unknown'), cred = select(credOptions(), d.credId || ''), notes = area(d.notes, 3, { maxlength: 2000 }), tags = input({ value: arr(d.tags).join(', ') });
        const save = async (extra) => {
          hideErr(err); if (!host.value.trim()) return showErr(err, 'Type the address or host name of the device.', host); if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(host.value.trim()) || /\.\./.test(host.value)) return showErr(err, 'The address may only contain letters, digits, dots and dashes.', host);
          const pn = +port.value; if (!Number.isInteger(pn) || pn < 1 || pn > 65535) return showErr(err, 'The SSH port must be a number from 1 to 65535.', port);
          try { await api('PATCH', '/devices/' + d.id, Object.assign({ name: name.value.trim() || undefined, host: host.value.trim(), port: pn, os: os.value, credId: cred.value, notes: notes.value, tags: tags.value.split(',').map((x) => x.trim()).filter(Boolean) }, extra || {})); VX.ui.toast('Saved', 'ok'); await refresh(); openDev(d.id); } catch (e) { showErr(err, e.message); }
        };
        const form = h('form', { class: 'hd-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } }, fld('Name', name), fld('Address', host, 'IP address or host name'), fld('SSH port', port), fld('System', os), fld('Sign-in', cred, st.creds.length ? 'Used to connect over SSH.' : 'No saved sign-ins yet – add one under Sign-ins & settings.'), fld('Tags', tags, 'Comma separated'), fld('Notes', notes), err,
          h('div', { class: 'hd-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save changes'),
            d.managed ? btn('Stop managing', () => save({ managed: false }), '') : btn('Add to my inventory', () => save({ managed: true }), 'primary'),
            btn('Delete', async () => { if (!(await VX.ui.confirm('Remove “' + t(d.name) + '” from the Helpdesk? The device itself is not touched.', 'Remove', { danger: true }))) return; try { await api('DELETE', '/devices/' + d.id); closeDev(); await refresh(); } catch (e) { showErr(err, e.message); } }, 'danger'),
            btn('New ticket for this device', () => { st.pendingTicket = { deviceId: d.id, title: 'Problem with ' + t(d.name, 'a device') }; go('tickets'); })));
        const invBox = h('div', { class: 'hd-inv' }), actOut = h('div', { class: 'hd-out-wrap', 'aria-live': 'polite' });
        const drawInv = (inv) => invView(invBox, inv);
        const runInv = btn('Run inventory', async (e) => { if (!d.managed) return VX.ui.toast('Add the device to your inventory first.', 'warn'); if (!d.credId && !cred.value) return VX.ui.toast('Choose a sign-in for this device and save first.', 'warn'); await busy(e.currentTarget, 'Collecting…', async () => { try { const r = await api('POST', '/devices/' + d.id + '/inventory'); d.inventory = r.inventory; drawInv(r.inventory); VX.ui.toast('Inventory updated', 'ok'); refresh(); } catch (x) { invBox.prepend(notice('err', 'Inventory failed', x.message)); } }); }, 'primary');
        drawInv(d.inventory);
        const acts = arr(st.actions).filter((a) => !d.os || d.os === 'unknown' || arr(a.os).includes(d.os));
        const actRow = h('div', { class: 'hd-actions' }, acts.map((a) => btn(t(a.label) + (a.change ? ' …' : ''), () => runAction(d, a, actOut), a.change ? 'warnbtn' : '', { title: a.change ? 'Changes the device – asks first' : 'Read only' })));
        detail.replaceChildren(top, h('section', { class: 'hd-sec' }, h('h3', {}, 'Details'), form), h('section', { class: 'hd-sec' }, h('h3', {}, 'Inventory'), h('div', { class: 'hd-actions' }, runInv), invBox),
          h('section', { class: 'hd-sec' }, h('h3', {}, 'Quick actions'), d.managed ? (d.os && d.os !== 'unknown' ? actRow : notice('warn', 'System type not known yet', 'Run an inventory (or choose the system above) to enable quick actions.')) : empty('Add the device to your inventory to use actions.'), actOut));
        top.querySelector('h2').focus();
      }
      async function runAction(d, a, out) {
        let param;
        if (a.param) { const v = await VX.ui.form({ title: t(a.label), intro: 'On ' + t(d.name), fields: [{ key: 'v', label: 'Service name', placeholder: 'e.g. spooler or nginx', required: true }], submit: 'Continue', validate: (x) => (/^[A-Za-z0-9_.@-]{1,64}$/.test(x.v.trim()) ? '' : 'A service name may only contain letters, digits and . _ @ - (up to 64 characters).') }); if (!v) return; param = v.v.trim(); }
        if (a.change) { const ok = await VX.ui.confirm(h('div', {}, h('p', {}, h('b', {}, t(a.label)), param ? ' (' + param + ')' : '', ' will change this device:'), h('ul', { class: 'hd-ul' }, h('li', {}, t(d.name) + ' – ' + t(d.host))), h('p', {}, 'The action is written to the audit log.')), t(a.label), { title: 'Change this device?', danger: true }); if (!ok) return; }
        out.replaceChildren(h('div', { class: 'hd-note' }, 'Running “' + t(a.label) + '” on ' + t(d.name) + '…'));
        try { const r = await api('POST', '/devices/' + d.id + '/action', { action: a.id, param, confirm: a.change ? true : undefined }); out.replaceChildren(h('div', { class: 'hd-line' }, tag(r.code === 0 ? 'finished' : 'exit code ' + num(r.code), r.code === 0 ? 'ok' : 'err'), h('b', {}, t(a.label))), h('pre', { class: 'hd-pre', tabindex: '0', 'aria-label': 'Output' }, t(r.out, '(no output)'))); } catch (e) { out.replaceChildren(notice('err', 'Could not run the action', e.message)); }
      }
      const add = btn('Add device…', async () => {
        const v = await VX.ui.form({ title: 'Add a device', intro: 'Add a computer by hand. Choose how to sign in to it after saving.', fields: [{ key: 'host', label: 'Address', placeholder: '192.168.1.20 or pc-reception', required: true }, { key: 'name', label: 'Name (optional)' }, { key: 'port', label: 'SSH port', type: 'number', value: 22 }, { key: 'os', label: 'System', type: 'select', options: [['unknown', 'Not known yet'], ['windows', 'Windows'], ['mac', 'macOS'], ['linux', 'Linux']], value: 'unknown' }, { key: 'credId', label: 'Sign-in', type: 'select', options: credOptions(), value: '' }], submit: 'Add device',
          validate: (x) => (!/^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/.test(x.host.trim()) || /\.\./.test(x.host) ? 'The address may only contain letters, digits, dots and dashes.' : !(x.port >= 1 && x.port <= 65535) ? 'The SSH port must be a number from 1 to 65535.' : '') }); if (!v) return;
        try { const r = await api('POST', '/devices', { host: v.host.trim(), name: v.name.trim() || undefined, port: v.port, os: v.os, credId: v.credId }); await refresh(); openDev(r.device.id); } catch (e) { toastErr(e); }
      });
      const invAll = btn('Inventory all', async (e) => { await busy(e.currentTarget, 'Starting…', async () => { try { await api('POST', '/inventory-all'); VX.ui.toast('Inventory started – follow it under Deploy → Jobs', 'ok'); go('deploy'); } catch (x) { toastErr(x); } }); }, '', { disabled: !st.status.ssh });
      const pre = [];
      if (!st.status.ssh) pre.push(notice('warn', 'The OpenSSH client (ssh) was not found', 'You can still scan and keep a device list, but inventory, actions and deployment need ssh on this computer.'));
      p.replaceChildren(...pre, h('div', { class: 'hd-bar-row' }, search, fsel, h('span', { class: 'grow' }), range, scanBtn, add, invAll), rangeErr, scanBox, h('div', { class: 'hd-split' }, list, detail));
      detail.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDev(); });
      draw(); if (sel) openDev(sel); if (st.autoScan) { st.autoScan = false; startScan(); }
    }
    /** Full inventory view: summary, disks, addresses and a searchable software list. */
    function invView(box, inv) {
      box.textContent = ''; if (!inv) { box.append(empty('No inventory yet. Run an inventory to collect hardware, disks and installed software.')); return; }
      const kv = (k, v) => [h('dt', {}, k), h('dd', {}, t(v))];
      box.append(h('dl', { class: 'hd-dl' }, kv('Collected', when(inv.at)), kv('Host name', inv.hostname), kv('System', inv.os), kv('Kernel', inv.kernel), kv('Architecture', inv.arch), kv('Processor', inv.cpu), kv('Cores', inv.cores ? num(inv.cores) : ''), kv('Memory', gb(inv.memKB)), kv('Vendor', inv.vendor), kv('Model', inv.model), kv('Serial number', inv.serial), kv('Last user', inv.user), kv('Domain', inv.domain), kv('Uptime', dur(inv.uptimeS)), kv('Reboot pending', inv.rebootPending ? 'Yes' : 'No')));
      box.append(h('h4', {}, 'Disks'), arr(inv.disks).length ? arr(inv.disks).map((x) => h('div', { class: 'hd-disk' }, h('span', { class: 'mono' }, t(x.mount)), bar(x.totalKB ? x.usedKB / x.totalKB : 0, 'Used space on ' + t(x.mount)), h('small', {}, gb(x.usedKB) + ' of ' + gb(x.totalKB) + ' used'))) : empty('No disks reported.'));
      box.append(h('h4', {}, 'Network'), arr(inv.ips).length || arr(inv.macs).length ? h('ul', { class: 'hd-ul' }, arr(inv.ips).map((x) => h('li', {}, t(x.nic) + ': ', h('span', { class: 'mono' }, t(x.addr)))), arr(inv.macs).map((m) => h('li', {}, 'MAC ', h('span', { class: 'mono' }, t(m))))) : empty('No addresses reported.'));
      const sw = arr(inv.software); let q = '', lim = 100; const body = h('div'); const more = btn('Show more', () => { lim += 200; draw(); }, 'sm');
      const s = input({ type: 'search', placeholder: 'Search software…', 'aria-label': 'Search installed software', oninput: () => { q = s.value.toLowerCase(); lim = 100; draw(); } });
      const count = h('span', { class: 'hd-sub', 'aria-live': 'polite' });
      const draw = () => { const f = sw.filter((x) => !q || (t(x.name, '') + ' ' + t(x.publisher, '')).toLowerCase().includes(q)); count.textContent = f.length + ' of ' + sw.length; body.textContent = ''; if (!f.length) { body.append(empty(sw.length ? 'Nothing matches.' : 'No software list was reported.')); return; }
        body.append(h('table', { class: 'hd-table sw' }, h('thead', {}, h('tr', {}, ['Software', 'Version', 'Publisher'].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, f.slice(0, lim).map((x) => h('tr', {}, h('td', { 'data-l': 'Software' }, t(x.name)), h('td', { 'data-l': 'Version' }, t(x.version)), h('td', { 'data-l': 'Publisher' }, t(x.publisher))))))); if (f.length > lim) { more.textContent = 'Show more (' + (f.length - lim) + ' left)'; body.append(more); } };
      box.append(h('h4', {}, 'Installed software ', count), s, body); draw();
    }

    /* ================================================================== DEPLOY */
    const TYPES = { windows: [['winget', 'winget (Windows package manager)'], ['choco', 'Chocolatey'], ['msi', 'MSI installer from a link'], ['script', 'Custom PowerShell script'], ['file', 'Upload a file (copy it to the device, optionally run it)']], mac: [['brew', 'Homebrew'], ['pkg', 'PKG installer from a link'], ['script', 'Custom shell script'], ['file', 'Upload a file (copy it to the device, optionally run it)']], linux: [['os-package', 'System package (apt, dnf, yum, zypper)'], ['script', 'Custom shell script'], ['file', 'Upload a file (copy it to the device, optionally run it)']] };
    async function viewDeploy(p, myGen) {
      p.append(empty('Loading…'));
      await Promise.all([loadStatus(), loadDevices(), loadPackages(), loadFiles()]); if (myGen !== gen) return;
      const pkgBox = h('div', { class: 'hd-pk' }), editor = h('div', { class: 'hd-box hidden' }), runBox = h('div', { class: 'hd-box' }), jobsBox = h('div', { class: 'hd-box' }), jobView = h('div', { class: 'hd-box hidden', 'aria-live': 'polite' });
      const drawPk = () => { pkgBox.textContent = ''; if (!st.packages.length) { pkgBox.append(empty('No packages yet. Create one to install software on your devices.')); return; }
        for (const pk of st.packages) pkgBox.append(h('div', { class: 'hd-card row' }, h('div', { class: 'grow' }, h('b', {}, t(pk.name)), pk.desc ? h('div', { class: 'hd-sub' }, t(pk.desc)) : null, h('div', {}, Object.entries(pk.targets || {}).map(([o, x]) => tag(osName(o) + ': ' + (x.type === 'file' ? (x.after && x.after !== 'none' ? 'file + run' : 'file copy') : t(x.type)), x.type === 'script' || (x.type === 'file' && x.after && x.after !== 'none') ? 'warn' : '')))),
          h('div', { class: 'hd-actions' }, btn('Edit', () => openEditor(pk), 'sm', { 'aria-label': 'Edit ' + t(pk.name) }), btn('Delete', async () => { if (!(await VX.ui.confirm('Delete the package “' + t(pk.name) + '”? Installed copies on devices are not removed.', 'Delete', { danger: true }))) return; try { await api('DELETE', '/packages/' + pk.id); await loadPackages(); drawPk(); drawRun(); } catch (e) { toastErr(e); } }, 'sm danger', { 'aria-label': 'Delete ' + t(pk.name) })))); };
      /* ---- uploaded files: kept on the computer that runs the server and copied to devices on deployment ---- */
      const fileBox = h('div', { class: 'hd-box' });
      const sizeText = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
      const readB64 = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = () => rej(new Error('Could not read the file')); fr.readAsDataURL(blob); });
      /** sends a file in 3 MB pieces; progress(0–1). Resolves the stored file. */
      async function uploadFile(file, progress) {
        if (!/^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,99}$/.test(file.name) || /\.\./.test(file.name)) throw new Error('Rename “' + file.name + '” first: file names may only contain letters, digits, spaces and . _ ( ) + -');
        if (st.maxFile && file.size > st.maxFile) throw new Error('“' + file.name + '” is ' + sizeText(file.size) + ' – files can be up to ' + sizeText(st.maxFile) + '.');
        const { id } = await api('POST', '/files', { name: file.name, size: file.size }); const CH = 3 * 1048576; let i = 0;
        for (let off = 0; off < file.size; off += CH, i++) { await api('POST', '/files/' + id + '/chunk', { index: i, data: await readB64(file.slice(off, off + CH)) }); progress && progress(Math.min(1, (off + CH) / file.size)); }
        return (await api('POST', '/files/' + id + '/done')).file;
      }
      function pickAndUpload(onDone) {
        const inp = h('input', { type: 'file', multiple: true, style: 'display:none', onchange: async () => { const list = [...inp.files]; inp.remove(); for (const f of list) { const bar_ = bar(0, 'Uploading ' + f.name), row = h('div', { class: 'hd-up', role: 'status' }, h('span', {}, 'Uploading ' + f.name + '…'), bar_); fileBox.append(row); try { await uploadFile(f, (k) => { bar_.setAttribute('aria-valuenow', Math.round(k * 100)); bar_.firstChild.style.width = k * 100 + '%'; }); VX.ui.toast('Uploaded ' + f.name, 'ok'); } catch (e) { toastErr(e); } row.remove(); } await loadFiles(); drawFiles(); onDone && onDone(); } });
        document.body.append(inp); inp.click();
      }
      function drawFiles() {
        fileBox.replaceChildren(h('div', { class: 'hd-dhead' }, h('h2', {}, 'Files'), btn('Upload files…', () => pickAndUpload(), 'primary sm')), h('p', { class: 'hd-sub' }, 'Upload an installer, script or any file once, then create a package of type “Upload a file” to copy it to your devices and, if you like, run it. Files stay on this computer and are checked against their SHA-256 fingerprint after every copy.'),
          st.files.length ? h('table', { class: 'hd-table' }, h('caption', { class: 'sr' }, 'Uploaded files'), h('thead', {}, h('tr', {}, ['File', 'Size', 'SHA-256', ''].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, st.files.map((f) => h('tr', {}, h('td', { 'data-l': 'File' }, t(f.name)), h('td', { 'data-l': 'Size' }, sizeText(f.size)), h('td', { 'data-l': 'SHA-256', class: 'mono' }, t(f.sha256).slice(0, 16) + '…'), h('td', {}, btn('Delete', async () => { if (!(await VX.ui.confirm('Delete the uploaded file “' + t(f.name) + '”?', 'Delete', { danger: true }))) return; try { await api('DELETE', '/files/' + f.id); await loadFiles(); drawFiles(); } catch (e) { toastErr(e); } }, 'sm danger', { 'aria-label': 'Delete ' + t(f.name) })))))) : empty('No files yet.'));
      }
      /* ---- package editor ---- */
      function openEditor(pk) {
        const err = errBox(), name = input({ value: pk ? t(pk.name, '') : '', maxlength: 60 }), desc = input({ value: pk ? t(pk.desc, '') : '', maxlength: 300 }); const parts = {};
        const sec = (o) => {
          const cur = pk && pk.targets && pk.targets[o] || {}; const ty = select([['', 'Not for ' + osName(o)], ...TYPES[o]], cur.type || '', { 'aria-label': osName(o) + ' installer type' }); const fields = h('div', { class: 'hd-tf' });
          const id = input({ value: t(cur.id, ''), placeholder: 'e.g. Mozilla.Firefox' }), ver = input({ value: t(cur.version, ''), placeholder: 'optional, e.g. 1.2.3' }), url = input({ value: t(cur.url, ''), placeholder: 'https://…', type: 'url' }), sha = input({ value: t(cur.sha256, ''), placeholder: '64 hexadecimal characters', class: 'mono' }), scr = area(t(cur.script, ''), 7, { class: 'mono', placeholder: o === 'windows' ? 'PowerShell commands…' : 'sh commands…' });
          const draw = () => { fields.textContent = ''; const v = ty.value; if (!v) return;
            if (v === 'script') fields.append(notice('warn', 'Custom scripts run exactly as written', 'The script is sent to each device and runs with the rights of the sign-in you choose. Only paste scripts you have read and trust.'), fld('Script', scr));
            else if (v === 'msi' || v === 'pkg') fields.append(fld('Download link', url, 'Must start with https://'), fld('SHA-256 checksum', sha, 'Required. The device downloads the installer and only runs it when its SHA-256 fingerprint equals this value, so a changed or tampered file is never installed. Get it from the publisher, or compute it yourself from a file you trust: ' + (v === 'msi' ? 'PowerShell Get-FileHash file.msi -Algorithm SHA256' : 'shasum -a 256 file.pkg') + '.'));
            else fields.append(fld(v === 'os-package' ? 'Package name' : 'Package id', id, v === 'winget' ? 'The winget id, as shown by “winget search”.' : v === 'choco' ? 'The Chocolatey package name.' : v === 'brew' ? 'The Homebrew formula or cask name.' : 'The package name used by apt, dnf, yum or zypper.'), v === 'winget' || v === 'choco' ? fld('Version', ver, 'Optional. Leave empty for the newest.') : null); };
          const fsel = select([['', st.files.length ? 'Choose a file…' : 'No files uploaded yet'], ...st.files.map((f) => [f.id, t(f.name) + ' (' + sizeText(f.size) + ')'])], cur.fileId || ''), dest = input({ value: t(cur.dest, ''), placeholder: 'default: ' + (o === 'windows' ? 'C:/ProgramData/VextraDeploy' : '/tmp/vextra-deploy'), class: 'mono' }), after = select([['none', 'Only copy the file'], ['run', 'Copy, then run it'], ['run-delete', 'Copy, run it, then delete the copy']], cur.after || 'none'), fargs = input({ value: t(cur.args, ''), placeholder: o === 'windows' ? 'e.g. /S  (silent install)' : 'e.g. --yes', maxlength: 300 }), sudo = h('input', { type: 'checkbox', checked: !!cur.sudo });
          const fdraw = () => { const run = after.value !== 'none'; fieldsFile.textContent = ''; fieldsFile.append(h('div', { class: 'hd-row' }, h('div', { class: 'grow' }, fld('File', fsel, 'Uploaded on this page, under Files.')), btn('Upload…', () => pickAndUpload(() => { const v = fsel.value; fsel.replaceChildren(...[['', 'Choose a file…'], ...st.files.map((f) => [f.id, t(f.name) + ' (' + sizeText(f.size) + ')'])].map(([a, b]) => h('option', { value: a }, b))); fsel.value = v || (st.files[0] && st.files[0].id) || ''; }), 'sm')), fld('Folder on the device', dest, 'Letters, digits and . _ - / \ : only (no spaces).'), fld('After copying', after), run ? fld('Arguments', fargs, 'Added to the command exactly as typed. The file is started according to its type (.sh .py .ps1 .exe .msi .pkg .deb .rpm .bat .zip …).') : null, run && o !== 'windows' ? h('label', { class: 'hd-chk' }, sudo, ' Run with administrator rights (sudo)') : null, run ? notice('warn', 'The file runs on every selected device', 'It runs with the rights of the sign-in you choose. Only upload and run files you trust.') : null); };
          const fieldsFile = h('div', { class: 'hd-tf' }); after.onchange = fdraw;
          const drawBase = draw; const draw2 = () => { if (ty.value === 'file') { fields.textContent = ''; fields.append(fieldsFile); fdraw(); } else drawBase(); };
          ty.onchange = draw2; draw2(); parts[o] = { ty, id, ver, url, sha, scr, fsel, dest, after, fargs, sudo };
          return h('fieldset', { class: 'hd-fs' }, h('legend', {}, osName(o)), fld('Installer type', ty), fields);
        };
        const secs = ['windows', 'mac', 'linux'].map(sec);
        const save = async () => {
          hideErr(err); if (!name.value.trim()) return showErr(err, 'Give the package a name.', name); const targets = {};
          for (const o of ['windows', 'mac', 'linux']) { const x = parts[o], ty = x.ty.value; if (!ty) continue; const L = osName(o) + ': ';
            if (ty === 'script') { if (!x.scr.value.trim()) return showErr(err, L + 'the script is empty.', x.scr); targets[o] = { type: ty, script: x.scr.value }; }
            else if (ty === 'msi' || ty === 'pkg') { if (!/^https:\/\/[^\s'"`$;|&<>]+$/i.test(x.url.value.trim())) return showErr(err, L + 'type a download link that starts with https:// (no spaces or special characters).', x.url); if (!/^[a-fA-F0-9]{64}$/.test(x.sha.value.trim())) return showErr(err, L + 'the SHA-256 checksum must be exactly 64 hexadecimal characters (0-9, a-f). It is required so only the exact installer you trust can run.', x.sha); targets[o] = { type: ty, url: x.url.value.trim(), sha256: x.sha.value.trim() }; }
            else if (ty === 'file') { if (!x.fsel.value) return showErr(err, L + 'choose an uploaded file (or upload one first).', x.fsel); const dv = x.dest.value.trim(); if (dv && (!/^[A-Za-z0-9_.\/:\\-]{1,200}$/.test(dv) || dv.split(/[\\/]/).includes('..'))) return showErr(err, L + 'the folder may only contain letters, digits and . _ - / \\ : (no spaces, no “..”).', x.dest); if (/[\r\n]/.test(x.fargs.value)) return showErr(err, L + 'the arguments must be on one line.', x.fargs); targets[o] = { type: 'file', fileId: x.fsel.value, dest: dv, after: x.after.value, args: x.fargs.value.trim(), sudo: x.sudo.checked }; }
            else { if (!/^[A-Za-z0-9][A-Za-z0-9._+:@/-]{0,99}$/.test(x.id.value.trim())) return showErr(err, L + 'type a valid ' + (ty === 'os-package' ? 'package name' : 'package id') + ' (letters, digits and . _ + : @ / -).', x.id); if (x.ver.value.trim() && !/^[A-Za-z0-9._+:~-]{1,40}$/.test(x.ver.value.trim())) return showErr(err, L + 'the version may only contain letters, digits and . _ + : ~ -', x.ver); targets[o] = { type: ty, id: x.id.value.trim(), version: x.ver.value.trim() }; } }
          if (!Object.keys(targets).length) return showErr(err, 'Choose an installer for at least one system.');
          try { await api('POST', '/packages', { name: name.value.trim(), desc: desc.value.trim(), targets }); if (pk) await api('DELETE', '/packages/' + pk.id).catch(() => {}); /* the server stores packages as new entries, so an edit replaces the old one */ VX.ui.toast('Package saved', 'ok'); editor.classList.add('hidden'); await loadPackages(); drawPk(); drawRun(); } catch (e) { showErr(err, e.message); }
        };
        editor.classList.remove('hidden'); editor.replaceChildren(h('h2', {}, pk ? 'Edit package' : 'New package'), h('form', { novalidate: true, class: 'hd-form', onsubmit: (e) => { e.preventDefault(); save(); } }, fld('Name', name), fld('Description', desc), h('div', { class: 'hd-fsgrid' }, secs), err, h('div', { class: 'hd-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save package'), btn('Cancel', () => editor.classList.add('hidden')))));
        name.focus(); editor.scrollIntoView && editor.scrollIntoView({ block: 'nearest' });
      }
      /* ---- run a deployment ---- */
      const chosen = new Set(); let pkId = st.packages[0] ? st.packages[0].id : '';
      function drawRun() {
        runBox.textContent = ''; const mdev = st.devices.filter((d) => d.managed);
        if (!st.packages.length || !mdev.length) { runBox.append(h('h2', {}, 'Deploy'), empty(!st.packages.length ? 'Create a package first.' : 'No managed devices yet. Add devices on the Devices tab.')); return; }
        if (!st.packages.some((x) => x.id === pkId)) pkId = st.packages[0].id; const pk = () => st.packages.find((x) => x.id === pkId); const err = errBox();
        const ps = select(st.packages.map((x) => [x.id, t(x.name)]), pkId, { onchange: () => { pkId = ps.value; drawRun(); } });
        const blocked = (d) => !d.credId ? 'no sign-in chosen' : !d.os || d.os === 'unknown' ? 'run an inventory first' : '';
        const boxes = mdev.map((d) => { const why = blocked(d); const cb = h('input', { type: 'checkbox', checked: chosen.has(d.id) && !why, disabled: !!why, id: 'hdc-' + d.id, onchange: () => { cb.checked ? chosen.add(d.id) : chosen.delete(d.id); cnt.textContent = chosen.size + ' selected'; } });
          const noTarget = !why && !(pk().targets || {})[d.os];
          return h('label', { class: 'hd-pick' + (why ? ' dis' : ''), for: 'hdc-' + d.id }, cb, h('span', { class: 'grow' }, h('b', {}, t(d.name)), ' ', h('small', {}, t(d.host) + ' · ' + osName(d.os))), why ? tag(why, 'warn') : noTarget ? tag('no ' + osName(d.os) + ' installer – will be skipped') : null); });
        const cnt = h('span', { class: 'hd-sub', 'aria-live': 'polite' }, chosen.size + ' selected');
        const pickable = () => mdev.filter((d) => !blocked(d));
        const sa = btn('Select all', () => { pickable().forEach((d) => chosen.add(d.id)); drawRun(); }, 'sm'), sn = btn('Select none', () => { chosen.clear(); drawRun(); }, 'sm');
        const selected = () => mdev.filter((d) => chosen.has(d.id) && !blocked(d));
        const start = async (dry, b) => {
          hideErr(err); const ds = selected(); if (!ds.length) return showErr(err, 'Choose at least one device first.');
          if (!dry) { const ok = await VX.ui.confirm(h('div', {}, h('p', {}, 'Install ', h('b', {}, t(pk().name)), ' on ', h('b', {}, ds.length + ' device' + (ds.length === 1 ? '' : 's')), '? This changes these computers:'), h('ul', { class: 'hd-ul' }, ds.map((d) => h('li', {}, t(d.name) + ' – ' + t(d.host) + ' (' + osName(d.os) + ')' + ((pk().targets || {})[d.os] ? '' : ' – no installer for this system, will be skipped')))), Object.values(pk().targets || {}).some((x) => x.type === 'script') ? h('p', { class: 'hd-warn' }, 'This package contains a custom script.') : null, Object.values(pk().targets || {}).some((x) => x.type === 'file' && x.after && x.after !== 'none') ? h('p', { class: 'hd-warn' }, 'This copies an uploaded file to each device and runs it there.') : null, h('p', {}, 'Tip: run “Check connection” first. Everything is written to the audit log.')), 'Deploy now', { title: 'Confirm deployment', danger: true }); if (!ok) return; }
          await busy(b, dry ? 'Checking…' : 'Starting…', async () => { try { const r = await api('POST', '/deploy', { packageId: pkId, deviceIds: ds.map((d) => d.id), dryRun: dry ? true : undefined, confirm: dry ? undefined : true }); VX.ui.toast(dry ? 'Check started' : 'Deployment started', 'ok'); await loadJobs(); watch(r.job.id); } catch (e) { showErr(err, e.message); } });
        };
        const dry = btn('Check connection (dry run)', (e) => start(true, e.currentTarget)), dep = btn('Deploy…', (e) => start(false, e.currentTarget), 'primary');
        runBox.append(h('h2', {}, 'Deploy'), fld('Package', ps), h('div', { class: 'hd-bar-row' }, h('b', {}, 'Devices'), sa, sn, cnt), h('div', { class: 'hd-picks', role: 'group', 'aria-label': 'Devices to deploy to' }, boxes), err, h('div', { class: 'hd-actions' }, dry, dep), h('p', { class: 'hd-sub' }, 'The dry run only signs in and reports who it would install on – nothing is installed.'));
      }
      /* ---- jobs ---- */
      const loadJobs = async () => { st.jobs = arr((await api('GET', '/jobs')).jobs); drawJobs(); };
      function drawJobs() { jobsBox.replaceChildren(h('h2', {}, 'Jobs'), st.jobs.length ? h('table', { class: 'hd-table' }, h('caption', { class: 'sr' }, 'Jobs'), h('thead', {}, h('tr', {}, ['Job', 'Status', 'Result', 'Started', ''].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, st.jobs.map((j) => h('tr', {}, h('td', { 'data-l': 'Job' }, t(j.title)), h('td', { 'data-l': 'Status' }, tag(j.status, statusKind(j.status))), h('td', { 'data-l': 'Result' }, num(j.ok, '0') + ' of ' + num(j.count, '0') + ' ok'), h('td', { 'data-l': 'Started' }, when(j.at)), h('td', {}, btn('Watch', () => watch(j.id), 'sm', { 'aria-label': 'Open job ' + t(j.title) })))))) : empty('No jobs yet.')); }
      let watching = '';
      async function watch(id) {
        watching = id; jobView.classList.remove('hidden'); jobView.replaceChildren(empty('Loading…')); const myW = id;
        const tick = async () => { if (!alive() || myGen !== gen || watching !== myW) return true; let j; try { j = (await api('GET', '/jobs/' + id)).job; } catch (e) { jobView.replaceChildren(notice('err', 'Could not read the job', e.message)); return true; }
          const rs = Object.entries(j.results || {}); jobView.replaceChildren(h('div', { class: 'hd-dhead' }, h('h2', {}, t(j.title)), tag(j.status, statusKind(j.status)), btn('Close', () => { watching = ''; jobView.classList.add('hidden'); }, 'sm ghost')), h('div', { class: 'hd-sub' }, 'Started by ' + t(j.by) + ' · ' + when(j.at) + (j.ended ? ' · finished ' + when(j.ended) : '')),
            rs.map(([k, r]) => h('details', { class: 'hd-res', open: r.status === 'failed' || r.status === 'running' ? '' : null }, h('summary', {}, h('b', {}, t(r.name)), ' ', tag(r.status, statusKind(r.status)), r.code !== null && r.code !== undefined && r.status !== 'ok' ? h('small', {}, ' exit ' + num(r.code)) : null), h('pre', { class: 'hd-pre', tabindex: '0', 'aria-label': 'Output of ' + t(r.name) }, t(r.out, '(no output yet)')))));
          if (j.status === 'queued' || j.status === 'running') return false; loadJobs().catch(() => {}); return true; };
        while (!(await tick())) await VX.sleep(1500);
      }
      p.replaceChildren(fileBox, h('section', { class: 'hd-box' }, h('div', { class: 'hd-dhead' }, h('h2', {}, 'Packages'), btn('New package', () => openEditor(null), 'primary sm')), pkgBox), editor, runBox, jobView, jobsBox);
      drawFiles(); drawPk(); drawRun(); drawJobs(); await loadJobs().catch(() => {});
      const live = () => st.jobs.some((j) => j.status === 'running' || j.status === 'queued'); if (live()) { const a = st.jobs.find((j) => j.status === 'running' || j.status === 'queued'); watch(a.id); }
      poll(() => { if (live()) loadJobs().catch(() => {}); }, 3000, myGen);
    }

    /* ================================================================== TICKETS */
    const PRI = [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']], STS = [['open', 'Open'], ['in-progress', 'In progress'], ['waiting', 'Waiting'], ['resolved', 'Resolved'], ['closed', 'Closed']];
    const label = (list, v) => { const x = list.find((y) => y[0] === v); return x ? x[1] : t(v); };
    async function viewTickets(p, myGen) {
      p.append(empty('Loading…')); await Promise.all([loadStatus(), loadDevices()]); if (myGen !== gen) return;
      let q = '', stF = 'active', prF = '', selId = null;
      const list = h('div', { class: 'hd-list' }), detail = h('div', { class: 'hd-detail hidden', role: 'region', 'aria-label': 'Ticket details' }), listNote = h('div', { 'aria-live': 'polite', class: 'sr' });
      const search = input({ type: 'search', placeholder: 'Search tickets…', 'aria-label': 'Search tickets', oninput: VX.debounce(() => { q = search.value.trim(); load(); }, 250) });
      const sf = select([['active', 'Active (not closed)'], ['', 'All statuses'], ...STS], 'active', { 'aria-label': 'Status', onchange: () => { stF = sf.value; load(); } }), pf = select([['', 'Any priority'], ...PRI], '', { 'aria-label': 'Priority', onchange: () => { prF = pf.value; draw(); } });
      const dueText = (tk) => (['resolved', 'closed'].includes(tk.status) ? '' : tk.overdue ? 'overdue since ' + when(tk.due) : 'due ' + when(tk.due));
      const draw = () => { const rows = st.tickets.filter((x) => !prF || x.priority === prF); list.textContent = ''; listNote.textContent = rows.length + ' tickets'; if (!rows.length) { list.append(empty(st.tickets.length ? 'No ticket matches the filter.' : 'No tickets here.')); return; }
        list.append(h('table', { class: 'hd-table' }, h('caption', { class: 'sr' }, 'Tickets'), h('thead', {}, h('tr', {}, ['#', 'Title', 'Status', 'Priority', 'Requester', 'SLA', ''].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, rows.map((x) => h('tr', { class: x.id === selId ? 'on' : '' }, h('td', { 'data-l': '#' }, '#' + num(x.num)), h('td', { 'data-l': 'Title' }, h('b', {}, t(x.title, '(no title)'))), h('td', { 'data-l': 'Status' }, tag(label(STS, x.status), ['resolved', 'closed'].includes(x.status) ? 'ok' : 'acc')),
          h('td', { 'data-l': 'Priority' }, tag(label(PRI, x.priority), x.priority === 'urgent' || x.priority === 'high' ? 'warn' : '')), h('td', { 'data-l': 'Requester' }, t(x.requester)), h('td', { 'data-l': 'SLA' }, x.overdue ? tag('Overdue', 'err') : h('small', {}, dueText(x) || '—')), h('td', {}, btn('Open', () => openTk(x.id), 'sm', { 'aria-label': 'Open ticket ' + num(x.num) })))))));
      };
      async function load() { try { const r = await api('GET', '/tickets?status=' + encodeURIComponent(stF) + (q ? '&q=' + encodeURIComponent(q) : '')); st.tickets = arr(r.tickets); if (alive() && myGen === gen) draw(); } catch (e) { list.replaceChildren(problem(e)); } }
      const closeTk = () => { selId = null; detail.classList.add('hidden'); detail.textContent = ''; draw(); };
      function openTk(id) { const tk = st.tickets.find((x) => x.id === id); if (!tk) return; selId = id; draw(); tkPane(tk); }
      function tkPane(tk) {
        const isNew = !tk.id; const err = errBox(); detail.classList.remove('hidden');
        const title = input({ value: t(tk.title, ''), maxlength: 140 }), body = area(t(tk.body, ''), 5, { maxlength: 8000 }), cat = input({ value: t(tk.category, ''), maxlength: 40 }), status = select(STS, tk.status || 'open'), pri = select(PRI, tk.priority || 'normal'), asg = input({ value: t(tk.assignee, ''), maxlength: 40 }), req = input({ value: t(tk.requester, ''), maxlength: 40, placeholder: 'admin' });
        const dev = select([['', 'No device'], ...st.devices.map((d) => [d.id, t(d.name) + ' (' + t(d.host) + ')'])], tk.deviceId || '');
        const save = async () => { hideErr(err); if (!title.value.trim()) return showErr(err, 'Give the ticket a title.', title);
          const b = { title: title.value.trim(), body: body.value, category: cat.value.trim(), status: status.value, priority: pri.value, assignee: asg.value.trim(), deviceId: dev.value }; if (isNew && req.value.trim()) b.requester = req.value.trim();
          try { const r = isNew ? await api('POST', '/tickets', b) : await api('PATCH', '/tickets/' + tk.id, b); VX.ui.toast(isNew ? 'Ticket #' + num(r.ticket.num) + ' created' : 'Saved', 'ok'); await load(); selId = r.ticket.id; draw(); tkPane(r.ticket); } catch (e) { showErr(err, e.message); } };
        const form = h('form', { class: 'hd-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } }, fld('Title', title), fld('Description', body), h('div', { class: 'hd-grid2' }, fld('Status', status), fld('Priority', pri, 'Priority sets the SLA time.'), fld('Assignee', asg), fld('Category', cat)), isNew ? fld('Requester', req, 'Leave empty for yourself.') : null, fld('Device', dev, 'Link the computer this ticket is about.'), err,
          h('div', { class: 'hd-actions' }, h('button', { type: 'submit', class: 'btn primary' }, isNew ? 'Create ticket' : 'Save changes'), isNew ? null : btn('Delete', async () => { if (!(await VX.ui.confirm('Delete ticket #' + num(tk.num) + '? This cannot be undone.', 'Delete', { danger: true }))) return; try { await api('DELETE', '/tickets/' + tk.id); closeTk(); await load(); } catch (e) { showErr(err, e.message); } }, 'danger'), btn(isNew ? 'Cancel' : 'Close', closeTk, 'ghost')));
        const cm = h('div', { class: 'hd-comments' });
        if (!isNew) {
          const drawC = (t2) => { cm.textContent = ''; const cs = arr(t2.comments); cm.append(h('h3', {}, 'Comments'), cs.length ? cs.map((c2) => h('div', { class: 'hd-cmt' + (c2.internal ? ' int' : '') }, h('div', { class: 'hd-sub' }, h('b', {}, t(c2.by)), ' · ' + when(c2.at) + ' ', c2.internal ? tag('internal note', 'warn') : null), h('div', { class: 'hd-text' }, t(c2.text)))) : empty('No comments yet.'));
            const txt = area('', 3, { maxlength: 4000, 'aria-label': 'New comment', placeholder: 'Write a reply or an internal note…' }), inte = h('input', { type: 'checkbox', id: uid('i') }), ce = errBox();
            const post = btn('Add comment', async (e) => { hideErr(ce); if (!txt.value.trim()) return showErr(ce, 'Write something first.', txt); await busy(e.currentTarget, 'Posting…', async () => { try { const r = await api('POST', '/tickets/' + tk.id + '/comment', { text: txt.value, internal: inte.checked }); const i = st.tickets.findIndex((x) => x.id === tk.id); if (i >= 0) st.tickets[i] = r.ticket; drawC(r.ticket); } catch (x) { showErr(ce, x.message); } }); }, 'primary');
            cm.append(txt, h('label', { class: 'hd-chk', for: inte.id }, inte, 'Internal note (the requester does not see it)'), ce, h('div', { class: 'hd-actions' }, post)); };
          drawC(tk);
        }
        detail.replaceChildren(h('div', { class: 'hd-dhead' }, h('h2', { tabindex: '-1' }, isNew ? 'New ticket' : '#' + num(tk.num) + ' ' + t(tk.title)), isNew ? null : h('span', {}, tag(label(STS, tk.status)), ' ', tk.overdue ? tag('Overdue', 'err') : null)), isNew ? null : h('div', { class: 'hd-sub' }, 'From ' + t(tk.requester) + ' · opened ' + when(tk.created) + ' · ' + (dueText(tk) || 'closed')), form, cm);
        detail.querySelector('h2').focus(); detail.onkeydown = (e) => { if (e.key === 'Escape' && e.target.tagName !== 'SELECT') closeTk(); };
      }
      const nw = btn('New ticket', () => { selId = null; draw(); tkPane({}); }, 'primary');
      p.replaceChildren(h('div', { class: 'hd-bar-row' }, search, sf, pf, h('span', { class: 'grow' }), nw), listNote, h('div', { class: 'hd-split' }, list, detail));
      await load(); if (st.pendingTicket) { const pt = st.pendingTicket; st.pendingTicket = null; selId = null; draw(); tkPane(pt); }
    }

    /* ================================================================== SIGN-INS & SETTINGS */
    async function viewSettings(p, myGen) {
      p.append(empty('Loading…')); await Promise.all([loadStatus(), loadCreds()]); if (myGen !== gen) return; const set = st.status.settings || {};
      /* sign-ins */
      const credList = h('div'), cerr = errBox();
      const drawCreds = () => { credList.textContent = ''; if (!st.creds.length) { credList.append(empty('No saved sign-ins. Add the account the Helpdesk uses to connect to your devices over SSH.')); return; }
        for (const k of st.creds) credList.append(h('div', { class: 'hd-card row' }, h('div', { class: 'grow' }, h('b', {}, t(k.name)), h('div', { class: 'hd-sub' }, 'User ' + t(k.user) + ' · ' + ({ password: 'password', key: 'private key (stored encrypted)', keyfile: 'key file ' + t(k.keyPath) }[k.kind] || t(k.kind)) + (k.hasSecret ? ' · secret stored, cannot be shown again' : ''))), btn('Delete', async () => { if (!(await VX.ui.confirm('Delete the sign-in “' + t(k.name) + '”? Devices that use it will have no sign-in until you choose another.', 'Delete', { danger: true }))) return; try { await api('DELETE', '/creds/' + k.id); await loadCreds(); drawCreds(); } catch (e) { toastErr(e); } }, 'sm danger', { 'aria-label': 'Delete sign-in ' + t(k.name) }))); };
      const cname = input({ maxlength: 40 }), cuser = input({ maxlength: 64, autocomplete: 'off' }), ckind = select([['password', 'Password'], ['key', 'Private key (pasted)'], ['keyfile', 'Private key file on this computer']], 'password'), csecret = input({ type: 'password', autocomplete: 'new-password' }), ckey = area('', 5, { class: 'mono', placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----' }), cpath = input({ placeholder: 'e.g. C:\\Users\\me\\.ssh\\id_ed25519' });
      const sf = h('div'), drawSecret = () => { sf.replaceChildren(ckind.value === 'password' ? fld('Password', csecret, 'Write-only: it is stored encrypted and can never be shown again.') : ckind.value === 'key' ? fld('Private key', ckey, 'Write-only: it is stored encrypted and can never be shown again.') : fld('Key file path', cpath, 'The file stays where it is; only its path is saved.')); }; ckind.onchange = drawSecret; drawSecret();
      const addCred = async () => { hideErr(cerr); const k = ckind.value, user = cuser.value.trim();
        if (!user) return showErr(cerr, 'Type the user name used to sign in to the devices.', cuser); if (!/^[A-Za-z0-9_][A-Za-z0-9._@\\ -]{0,63}$/.test(user)) return showErr(cerr, 'The user name may only contain letters, digits and . _ @ \\ - and spaces.', cuser);
        if (k === 'password' && !csecret.value) return showErr(cerr, 'Type the password.', csecret); if (k === 'key' && !/BEGIN [A-Z ]*PRIVATE KEY/.test(ckey.value)) return showErr(cerr, 'That does not look like a private key. Paste the whole file including the BEGIN line.', ckey); if (k === 'keyfile' && !cpath.value.trim()) return showErr(cerr, 'Type the path of the private key file.', cpath);
        try { await api('POST', '/creds', { name: cname.value.trim() || user, user, kind: k, secret: k === 'password' ? csecret.value : k === 'key' ? ckey.value : undefined, keyPath: k === 'keyfile' ? cpath.value.trim() : undefined }); cname.value = cuser.value = csecret.value = ckey.value = cpath.value = ''; VX.ui.toast('Sign-in saved', 'ok'); await loadCreds(); drawCreds(); } catch (e) { showErr(cerr, e.message); } };
      /* settings */
      const serr = errBox(), sla = {}; const slaRow = h('div', { class: 'hd-grid2' }, PRI.map(([k, l]) => fld(l + ' priority – hours', (sla[k] = input({ type: 'number', min: 1, max: 720, value: (set.sla || {})[k] || '' })), k === 'urgent' ? 'Hours until a ticket counts as overdue.' : undefined)));
      const conc = input({ type: 'number', min: 1, max: 20, value: set.concurrency || 5 }), ranges = area(arr(set.scanRanges).join('\n'), 3, { placeholder: '192.168.1.0/24' });
      const saveSet = async () => { hideErr(serr); const s2 = {};
        for (const [k, l] of PRI) { const v = +sla[k].value; if (!Number.isFinite(v) || v < 1 || v > 720) return showErr(serr, l + ' priority: use a number of hours from 1 to 720.', sla[k]); s2[k] = Math.round(v); }
        const cv = +conc.value; if (!Number.isInteger(cv) || cv < 1 || cv > 20) return showErr(serr, 'At the same time: use a whole number from 1 to 20.', conc);
        const rl = ranges.value.split(/[\s,;]+/).filter(Boolean); for (const x of rl) if (!/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(x)) return showErr(serr, '“' + x + '” is not a range. Use a form like 192.168.1.0/24, one per line.', ranges); if (rl.length > 8) return showErr(serr, 'At most 8 ranges.', ranges);
        try { await api('POST', '/settings', { sla: s2, concurrency: cv, scanRanges: rl }); VX.ui.toast('Settings saved', 'ok'); } catch (e) { showErr(serr, e.message); } };
      /* audit + export */
      const auditBox = h('div'); const loadAudit = async (b) => { const run = async () => { try { const r = await api('GET', '/audit'); const a = arr(r.audit); auditBox.replaceChildren(a.length ? h('table', { class: 'hd-table' }, h('caption', { class: 'sr' }, 'Audit log'), h('thead', {}, h('tr', {}, ['When', 'Who', 'What'].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, a.map((x) => h('tr', {}, h('td', { 'data-l': 'When' }, when(x.at)), h('td', { 'data-l': 'Who' }, t(x.who)), h('td', { 'data-l': 'What' }, t(x.what)))))) : empty('Nothing recorded yet.')); } catch (e) { auditBox.replaceChildren(problem(e)); } }; if (b) await busy(b, 'Loading…', run); else await run(); };
      const exp = (name, label) => btn(label, async (e) => { await busy(e.currentTarget, 'Preparing…', async () => { try { const txt = await api('GET', '/export/' + name, null, true); await window.native.saveAs(name, txt); VX.ui.toast(name + ' ready', 'ok'); } catch (x) { toastErr(x); } }); }, '', { 'aria-label': 'Download ' + label });
      p.replaceChildren(
        h('section', { class: 'hd-box' }, h('h2', {}, 'Saved sign-ins'), h('p', { class: 'hd-sub' }, 'The accounts the Helpdesk uses to connect to your devices. Secrets are write-only and stored encrypted; they are never shown again. On Windows devices, turn on OpenSSH Server.'), credList,
          h('form', { class: 'hd-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); addCred(); } }, h('h3', {}, 'Add a sign-in'), h('div', { class: 'hd-grid2' }, fld('Name', cname, 'Optional label'), fld('User name', cuser), fld('Type', ckind)), sf, cerr, h('div', { class: 'hd-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save sign-in')))),
        h('section', { class: 'hd-box' }, h('h2', {}, 'Settings'), h('form', { class: 'hd-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); saveSet(); } }, h('h3', {}, 'Ticket response time (SLA)'), slaRow, h('h3', {}, 'Devices'), fld('At the same time', conc, 'How many devices are worked on in parallel during inventory and deployment (1–20).'), fld('Scan ranges', ranges, 'Private networks to scan, one per line (e.g. 192.168.1.0/24). Empty = this computer’s own networks.'), serr, h('div', { class: 'hd-actions' }, h('button', { type: 'submit', class: 'btn primary' }, 'Save settings')))),
        h('section', { class: 'hd-box' }, h('h2', {}, 'Export'), h('div', { class: 'hd-actions' }, exp('inventory.csv', 'Inventory (CSV)'), exp('software.csv', 'Software (CSV)'), exp('tickets.csv', 'Tickets (CSV)'))),
        h('section', { class: 'hd-box' }, h('div', { class: 'hd-dhead' }, h('h2', {}, 'Audit log'), btn('Refresh', (e) => loadAudit(e.currentTarget), 'sm')), h('p', { class: 'hd-sub' }, 'The latest 300 things that were changed from the Helpdesk.'), auditBox));
      drawCreds(); loadAudit();
    }

    drawTabs(); panel.setAttribute('aria-labelledby', 'hdt-dash'); show();
  }
})();
