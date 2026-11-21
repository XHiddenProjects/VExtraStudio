/* Vextra Studio – built-in database (SQLite via sql.js / WebAssembly).
 * One SQLite database per project folder: <project>/database.sqlite. Browse tables, run SQL, import/export, and use it from live previews with window.VXDB. */
(function () {
  const { h } = VX;
  const S = VX.app.S;
  const DB = (VX.db = {});
  const B64 = (u8) => VX.archive.toB64(u8);

  let enginePromise = null;
  DB.engine = () => (enginePromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = 'vendor/sqljs/sql-wasm.js';
    s.onload = () => window.initSqlJs({ locateFile: (f) => 'vendor/sqljs/' + f }).then(resolve, reject);
    s.onerror = () => { enginePromise = null; reject(new Error('The SQLite engine is not installed. Run "npm run vendor" (or "npm install") in the Vextra folder.')); };
    document.head.append(s);
  }));

  let cur = null; // { db, path, dirty, timer }
  DB.path = () => (S.root ? VX.path.join(S.root, 'database.sqlite') : null);
  DB.current = () => cur;

  DB.open = async () => {
    const p = DB.path();
    if (cur && cur.path === p) return cur;
    if (cur && cur.dirty) await DB.save();
    const SQL = await DB.engine(); let bytes;
    if (p) { try { if (await window.native.exists(p)) bytes = VX.archive.fromB64(await window.native.readBase64(p)); } catch { /* new database */ } }
    cur = { db: bytes && bytes.length ? new SQL.Database(bytes) : new SQL.Database(), path: p, dirty: false, timer: 0, mtime: 0 };
    if (p) cur.mtime = await window.native.mtime(p).catch(() => 0);
    return cur;
  };
  DB.replace = async (bytes) => { const SQL = await DB.engine(); const c = await DB.open(); try { c.db.close(); } catch { /* ignore */ } c.db = bytes ? new SQL.Database(bytes) : new SQL.Database(); c.dirty = true; DB.touch(); return c; };
  /** loads the file from disk again (another program changed it) */
  DB.reload = async () => { const c = cur; if (!c || !c.path) return; const SQL = await DB.engine(); const bytes = VX.archive.fromB64(await window.native.readBase64(c.path)); try { c.db.close(); } catch { /* ignore */ } c.db = bytes.length ? new SQL.Database(bytes) : new SQL.Database(); c.mtime = await window.native.mtime(c.path).catch(() => 0); c.dirty = false; VX.emit('dbChanged'); };
  DB.touch = () => { if (!cur) return; cur.dirty = true; clearTimeout(cur.timer); cur.timer = setTimeout(() => DB.save().catch(() => {}), 900); VX.emit('dbChanged'); };
  DB.save = async () => {
    if (!cur || !cur.path) return false; clearTimeout(cur.timer);
    await window.native.writeBase64(cur.path, B64(cur.db.export())); cur.dirty = false; cur.mtime = await window.native.mtime(cur.path).catch(() => 0); VX.emit('dbSaved'); return true;
  };

  /** Run one or many statements. Returns [{ columns, rows: [[...]] }] (rows as arrays) and the number of changed rows. */
  DB.exec = async (sql, params) => {
    const c = await DB.open(); const t0 = performance.now(); let results;
    if (params && params.length) { const st = c.db.prepare(sql); try { st.bind(params); const rows = []; while (st.step()) rows.push(st.get()); results = [{ columns: st.getColumnNames(), values: rows }]; } finally { st.free(); } }
    else results = c.db.exec(sql);
    const changes = c.db.getRowsModified(); if (/(^|;)\s*(--[^\n]*\n\s*)*(insert|update|delete|create|drop|alter|replace|vacuum|attach|detach|begin|commit|end|pragma\s+[\w.]+\s*=)/i.test(sql)) DB.touch(); // only statements that can change data (reading, e.g. PRAGMA table_info, never marks the database as changed)
    return { sets: results.map((r) => ({ columns: r.columns, rows: r.values })), changes, ms: Math.round(performance.now() - t0) };
  };
  /** Rows as objects – this is what window.VXDB.query() returns to previews. */
  DB.query = async (sql, params) => {
    const r = await DB.exec(sql, params); const s = r.sets[r.sets.length - 1];
    return { rows: s ? s.rows.map((row) => Object.fromEntries(s.columns.map((c, i) => [c, row[i]]))) : [], changes: r.changes };
  };
  DB.tables = async () => {
    const r = await DB.exec("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name"); const out = [];
    for (const [name, type] of (r.sets[0] ? r.sets[0].rows : [])) { let n = 0; try { n = (await DB.exec(`SELECT COUNT(*) FROM "${name.replace(/"/g, '""')}"`)).sets[0].rows[0][0]; } catch { /* view error */ } out.push({ name, type, rows: n }); }
    return out;
  };
  const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : v instanceof Uint8Array ? "X'" + [...v].map((b) => b.toString(16).padStart(2, '0')).join('') + "'" : "'" + String(v).replace(/'/g, "''") + "'");
  DB.dump = async () => {
    const lines = ['-- Vextra Studio database dump', `-- ${new Date().toISOString()}`, 'PRAGMA foreign_keys=OFF;', 'BEGIN TRANSACTION;'];
    const m = await DB.exec("SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, rowid");
    for (const [name, type, sql] of (m.sets[0] ? m.sets[0].rows : [])) {
      lines.push(sql.trim().replace(/;$/, '') + ';');
      if (type === 'table') { const d = await DB.exec(`SELECT * FROM "${name.replace(/"/g, '""')}"`); const s = d.sets[0]; if (s) for (const row of s.rows) lines.push(`INSERT INTO "${name.replace(/"/g, '""')}" VALUES(${row.map(q).join(',')});`); }
    }
    lines.push('COMMIT;'); return lines.join('\n') + '\n';
  };
  DB.exportBytes = async () => (await DB.open()).db.export();

  /* ------------------------------------------------------------ the Database tab */
  const X = () => VX.dbx;
  const csvCell = (v) => { if (v === null || v === undefined) return ''; const t = v instanceof Uint8Array ? `<${v.length} bytes>` : String(v); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const looksNum = (t) => /int|serial|decimal|numeric|float|double|real|bit|year/i.test(t || '');
  const coerce = (col, s, wasNull) => (s === '' && wasNull ? null : looksNum(col && col.type) && /^-?\d+(\.\d+)?$/.test(String(s).trim()) ? Number(s) : s);

  VX.web.openDatabase = async function () {
    if (!S.root) { VX.ui.toast('Open a project folder first – the database is stored inside it as database.sqlite.', 'warn'); return VX.app.openFolder && VX.app.openFolder(); }
    const key = 'tool:database';
    if (S.tabs.find((x) => x.key === key)) return VX.tabs.open({ key, kind: 'preview' });
    try { await DB.open(); } catch (e) { return VX.ui.toast(e.message, 'error'); }

    let drv = X().sqlite(), spec = null;                       // current source: the project's SQLite unless you connect to another database
    const pg = { limit: 100, offset: 0, sort: null, dir: 'asc', filter: '' };
    let browsing = null, structure = false, cols = [], lastSig = '', tablesSig = '', busy = false, tick = 0;
    const side = h('div', { class: 'dbt-side' }), grid = h('div', { class: 'dbt-grid' }), msg = h('div', { class: 'dbt-msg' }), editorHost = h('div', { class: 'dbt-code' }), tools = h('div', { class: 'dbt-gtools' });
    const status = h('span', { class: 'tag' }, 'saved'), srcBtn = h('button', { class: 'btn sm', title: 'Choose which database to work with', onclick: () => connectDialog() }, '');
    const autoChk = h('input', { type: 'checkbox', checked: true }); let doc = null, code = null, timer = 0;
    const local = () => drv.kind === 'sqlite';
    const ioBtns = [
      h('button', { class: 'btn sm', title: 'Run a .sql file against this database', onclick: () => importSql() }, '⬆ Import .sql'),
      h('button', { class: 'btn sm', title: 'Replace this database with a .sqlite / .db file', onclick: () => importDb() }, '⬆ Open .sqlite'),
      h('button', { class: 'btn sm', onclick: () => exportSql() }, '⬇ Export .sql'), h('button', { class: 'btn sm', onclick: () => exportDb() }, '⬇ Export .sqlite')];
    const root = h('div', { class: 'dbt' },
      h('div', { class: 'dbt-bar' }, srcBtn, h('span', { class: 'sep' }),
        h('button', { class: 'btn sm primary', title: 'Run (Ctrl+Enter)', onclick: () => run() }, '▶ Run'), h('button', { class: 'btn sm', onclick: () => newTable() }, '＋ Table'), h('span', { class: 'sep' }), ...ioBtns,
        h('span', { class: 'spacer' }), h('label', { class: 'dbt-auto', title: 'Reloads the table by itself when its data changes (also when another program changes it)' }, autoChk, ' Auto-update'), status),
      h('div', { class: 'dbt-main' }, side, h('div', { class: 'dbt-work' }, editorHost, msg, tools, grid)));

    const show = (kind, text) => { msg.className = 'dbt-msg ' + kind; msg.textContent = text; };
    const setStatus = () => { if (!local()) { status.textContent = 'live'; return; } const c = DB.current(); status.textContent = c && c.dirty ? 'saving…' : 'saved'; };
    const offs = [VX.on('dbChanged', () => { setStatus(); if (local()) quick(); }), VX.on('dbSaved', setStatus)];
    const syncSource = () => { srcBtn.textContent = '🗄 ' + drv.label; for (const b of ioBtns) b.style.display = local() ? '' : 'none'; if (!local()) ioBtns[0].style.display = ''; setStatus(); };
    const cell = (v) => (v === null || v === undefined ? h('i', { class: 'null' }, 'NULL') : v instanceof Uint8Array ? h('i', { class: 'null' }, `<${v.length} bytes>`) : String(v));
    const fail = (e) => show('err', (e && e.message) || String(e));

    /* ---- tables list */
    let tableFilter = '';
    async function refreshTables() {
      let t; try { t = await drv.tables(); } catch (e) { side.textContent = ''; side.append(h('div', { class: 'dbt-h' }, 'TABLES'), h('div', { class: 'dbt-empty' }, 'Could not read the tables: ' + e.message)); return; }
      tablesSig = JSON.stringify(t); side.textContent = '';
      const f = h('input', { class: 'dbt-find', placeholder: 'Filter tables…', value: tableFilter }); f.oninput = () => { tableFilter = f.value; refreshTables(); };
      side.append(h('div', { class: 'dbt-h' }, 'TABLES'), f);
      const shown = t.filter((x) => x.name.toLowerCase().includes(tableFilter.toLowerCase()));
      if (!t.length) side.append(h('div', { class: 'dbt-empty' }, 'No tables yet. Use “＋ Table”, or write CREATE TABLE in the editor.'));
      for (const x of shown) {
        side.append(h('div', { class: 'dbt-t' + (browsing === x.name ? ' on' : ''), onclick: () => { pg.offset = 0; pg.sort = null; pg.filter = ''; structure = false; browse(x.name); }, title: x.type },
          h('span', { class: 'nm' }, (x.type === 'view' ? '👁 ' : '▦ ') + x.name), h('small', {}, String(x.rows)),
          h('button', { class: 'mini-btn', title: 'Drop', onclick: async (e) => { e.stopPropagation(); if (await VX.ui.confirm(`Delete ${x.type} “${x.name}” and all its rows?`)) { try { await drv.drop(x.name, x.type); } catch (er) { return fail(er); } if (browsing === x.name) { browsing = null; grid.textContent = ''; tools.textContent = ''; } refreshTables(); } } }, '🗑')));
      }
      f.focus && tableFilter && (f.selectionStart = f.selectionEnd = f.value.length);
    }

    /* ---- result / table grid */
    function drawSet(set) {
      grid.textContent = ''; if (!set) return;
      const tb = h('table', {}, h('thead', {}, h('tr', {}, set.columns.map((c) => h('th', {}, c))))); const body = h('tbody', {});
      for (const row of set.rows.slice(0, 1000)) body.append(h('tr', {}, row.map((v) => h('td', { title: String(v ?? '') }, cell(v)))));
      tb.append(body); grid.append(tb); if (set.rows.length > 1000) grid.append(h('div', { class: 'dbt-empty' }, `Showing the first 1000 of ${set.rows.length} rows.`));
    }
    const sel = new Set(); const kid = (k) => JSON.stringify(k);
    function drawTable(data) {
      const sc = grid.scrollTop; grid.textContent = ''; sel.clear(); const editable = !!data.keys;
      const tb = h('table', {}, h('thead', {}, h('tr', {}, editable ? h('th', { class: 'act' }, h('input', { type: 'checkbox', title: 'Select all rows on this page', onchange: (e) => { grid.querySelectorAll('tbody input[type=checkbox]').forEach((c) => { c.checked = e.target.checked; c.onchange(); }); } })) : null,
        data.columns.map((c) => { const col = cols.find((x) => x.name === c); return h('th', { class: 'sortable', title: (col ? col.type + (col.pk ? ' · primary key' : '') + (col.nullable ? '' : ' · required') : '') + ' — click to sort', onclick: () => { if (pg.sort === c) pg.dir = pg.dir === 'asc' ? 'desc' : 'asc'; else { pg.sort = c; pg.dir = 'asc'; } pg.offset = 0; browse(browsing); } }, c, pg.sort === c ? (pg.dir === 'asc' ? ' ▲' : ' ▼') : '', col && col.pk ? ' 🔑' : ''); }),
        editable ? h('th', { class: 'act' }, '') : null)));
      const body = h('tbody', {});
      data.rows.forEach((row, ri) => {
        const k = data.keys && data.keys[ri]; const tr = h('tr', {});
        if (editable) tr.append(h('td', { class: 'act' }, h('input', { type: 'checkbox', onchange: (e) => { const c = (e && e.target) || tr.querySelector('input'); if (c.checked) sel.add(kid(k)); else sel.delete(kid(k)); updateSel(); } })));
        data.columns.forEach((c, i) => {
          const td = h('td', { title: String(row[i] ?? '') }, cell(row[i])); const col = cols.find((x) => x.name === c);
          if (editable) td.addEventListener('dblclick', () => {
            const inp = h('input', { value: row[i] === null ? '' : String(row[i]) }); td.textContent = ''; td.append(inp); inp.focus(); inp.select(); let done = false;
            const commit = async (save) => { if (done) return; done = true; if (save && String(row[i] ?? '') !== inp.value) { try { await drv.update(browsing, k, { [c]: coerce(col, inp.value, row[i] === null) }); } catch (e) { fail(e); } } browse(browsing); };
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') commit(false); }); inp.addEventListener('blur', () => commit(true));
          });
          tr.append(td);
        });
        if (editable) tr.append(h('td', { class: 'act' }, h('button', { class: 'mini-btn', title: 'Edit this row', onclick: () => rowForm('Edit row', row, data.columns, async (obj) => { await drv.update(browsing, k, obj); }) }, '✎'), h('button', { class: 'mini-btn', title: 'Duplicate this row', onclick: () => rowForm('Duplicate row', row, data.columns, async (obj) => { await drv.insert(browsing, obj); }, true) }, '⧉'),
          h('button', { class: 'mini-btn', title: 'Delete this row', onclick: async () => { try { await drv.remove(browsing, k); } catch (e) { return fail(e); } browse(browsing); refreshTables(); } }, '✕')));
        body.append(tr);
      });
      tb.append(body); grid.append(tb); if (!data.rows.length) grid.append(h('div', { class: 'dbt-empty' }, pg.filter ? 'No rows match the filter.' : 'This table is empty. Use “＋ Add row”.')); grid.scrollTop = sc;
    }
    const selBtn = h('button', { class: 'btn sm danger', style: 'display:none', onclick: async () => { if (!(await VX.ui.confirm(`Delete ${sel.size} selected row${sel.size === 1 ? '' : 's'}?`))) return; try { for (const k of [...sel]) await drv.remove(browsing, JSON.parse(k)); } catch (e) { fail(e); } browse(browsing); refreshTables(); } }, '');
    const updateSel = () => { selBtn.style.display = sel.size ? '' : 'none'; selBtn.textContent = `🗑 Delete ${sel.size} selected`; };

    /* ---- add / edit a row in a form (errors stay inside the form) */
    function rowForm(title, values, names, submit, isNew) {
      const fields = cols.map((c) => { const v = values ? values[names.indexOf(c.name)] : undefined; const auto = c.auto || (c.def !== null && c.def !== undefined && c.def !== ''); const long = /json|blob|clob|mediumtext|longtext/i.test(c.type) || String(v ?? '').length > 80 || /\n/.test(String(v ?? ''));
        const inp = h(long ? 'textarea' : 'input', { rows: 3, value: v === null || v === undefined ? '' : String(v), placeholder: isNew || !values ? (c.auto ? '(automatic)' : c.def !== null && c.def !== undefined && c.def !== '' ? 'default: ' + c.def : c.nullable ? '(empty = NULL)' : 'required') : '' });
        if (long) inp.value = v === null || v === undefined ? '' : String(v); const nul = c.nullable ? h('input', { type: 'checkbox', checked: v === null && !!values && !isNew }) : null; if (nul) { nul.onchange = () => { inp.disabled = nul.checked; }; inp.disabled = nul.checked; }
        return { c, inp, nul, auto, row: h('div', { class: 'dbt-field' }, h('label', {}, h('b', {}, c.name), ' ', h('small', {}, c.type + (c.pk ? ' · key' : '') + (!c.nullable && !auto ? ' · required' : '')), nul ? h('label', { class: 'nl' }, nul, ' NULL') : null), inp) }; });
      const err = h('div', { class: 'form-error', style: 'display:none' }); const ok = h('button', { class: 'btn primary' }, isNew || !values ? 'Add row' : 'Save');
      const m = VX.ui.modal({ title, body: h('div', { class: 'dbt-form' }, ...fields.map((f) => f.row), err), actions: [ok] });
      ok.onclick = async () => {
        const obj = {}; for (const f of fields) {
          const raw = f.inp.value; if (f.nul && f.nul.checked) { obj[f.c.name] = null; continue; }
          if (raw === '' && (!values || isNew)) { if (f.auto || f.c.nullable) continue; err.style.display = ''; err.textContent = `“${f.c.name}” is required – it cannot be empty.`; f.inp.focus(); return; }
          if (values && !isNew && raw === String(values[names.indexOf(f.c.name)] ?? '')) continue; obj[f.c.name] = coerce(f.c, raw, false);
        }
        ok.disabled = true; try { await submit(obj); m.close(); if (isNew || !values) { const t = await drv.page(browsing, { ...pg, limit: 1, offset: 0, filter: '' }); if (!pg.sort && !pg.filter) pg.offset = Math.floor(Math.max(0, t.total - 1) / pg.limit) * pg.limit; } browse(browsing); refreshTables(); }
        catch (e) { ok.disabled = false; err.style.display = ''; err.textContent = (e && e.message) || String(e); }
      };
      setTimeout(() => { const f = fields.find((x) => !x.auto) || fields[0]; f && f.inp.focus(); }, 30);
    }

    /* ---- browsing a table */
    function drawTools(data) {
      tools.textContent = ''; const pages = Math.max(1, Math.ceil(data.total / pg.limit)), page = Math.floor(pg.offset / pg.limit) + 1;
      const find = h('input', { class: 'dbt-find', placeholder: 'Search rows…', value: pg.filter }); let ft = 0; find.oninput = () => { clearTimeout(ft); ft = setTimeout(() => { pg.filter = find.value; pg.offset = 0; browse(browsing, true); }, 300); };
      const size = h('select', {}, [50, 100, 250, 500].map((n) => h('option', { value: n, selected: n === pg.limit }, n + ' rows'))); size.onchange = () => { pg.limit = +size.value; pg.offset = 0; browse(browsing); };
      tools.append(h('button', { class: 'btn sm primary', onclick: () => rowForm('Add row', null, [], async (obj) => { await drv.insert(browsing, obj); }) }, '＋ Add row'), h('button', { class: 'btn sm', title: 'Reload now', onclick: () => browse(browsing) }, '⟳'), find, selBtn, h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm' + (structure ? ' primary' : ''), onclick: () => { structure = !structure; browse(browsing); } }, '☷ Structure'), h('button', { class: 'btn sm', title: 'Save every row of this table as a CSV file', onclick: () => exportCsv() }, '⬇ CSV'), size,
        h('button', { class: 'btn sm', disabled: page <= 1, onclick: () => { pg.offset -= pg.limit; browse(browsing); } }, '◀'), h('span', { class: 'dbt-page' }, `${page} / ${pages}`), h('button', { class: 'btn sm', disabled: page >= pages, onclick: () => { pg.offset += pg.limit; browse(browsing); } }, '▶'));
      updateSel();
    }
    async function drawStructure(name) {
      grid.textContent = ''; const tb = h('table', {}, h('thead', {}, h('tr', {}, ['Column', 'Type', 'Null', 'Key', 'Default', 'Auto'].map((c) => h('th', {}, c))))); const body = h('tbody', {});
      for (const c of cols) body.append(h('tr', {}, h('td', {}, c.name), h('td', {}, c.type), h('td', {}, c.nullable ? 'yes' : 'NO'), h('td', {}, c.pk ? '🔑 primary' : ''), h('td', {}, c.def === null || c.def === undefined ? '' : String(c.def)), h('td', {}, c.auto ? 'yes' : '')));
      tb.append(body); grid.append(tb); try { const sql = await drv.create(name); if (sql) grid.append(h('pre', { class: 'dbt-create' }, sql)); } catch { /* not available */ }
    }
    async function browse(name, soft) {
      if (!name || busy) return; busy = true; browsing = name;
      try {
        cols = await drv.columns(name); const data = await drv.page(name, pg); lastSig = JSON.stringify([name, pg, data.columns, data.rows, data.total]);
        if (pg.offset >= data.total && pg.offset > 0) { pg.offset = Math.max(0, Math.floor((data.total - 1) / pg.limit) * pg.limit); busy = false; return browse(name); }
        if (!soft || !tools.firstChild) drawTools(data); else { const f = tools.querySelector('.dbt-page'); if (f) f.textContent = `${Math.floor(pg.offset / pg.limit) + 1} / ${Math.max(1, Math.ceil(data.total / pg.limit))}`; }
        if (structure) await drawStructure(name); else drawTable(data);
        const a = data.total ? pg.offset + 1 : 0, b = pg.offset + data.rows.length; show('ok', `${name}: rows ${a}–${b} of ${data.total}${data.keys ? ' · double-click a cell to edit · ✎ edits a whole row' : ' · read-only (this table has no primary key)'}`);
      } catch (e) { grid.textContent = ''; show('err', e.message || String(e)); } finally { busy = false; }
      refreshTables();
    }
    /** quiet refresh used by Auto-update: only redraws when something changed */
    let quickBusy = false;
    async function quick() {
      if (quickBusy || !autoChk.checked || busy || !root.isConnected || document.querySelector('.modal-layer, .layer .modal') || grid.querySelector('td input[type=text], td input:not([type])')) return;
      quickBusy = true; try {
        if (local() && DB.path()) { const c = DB.current(); const m = await window.native.mtime(DB.path()).catch(() => 0); if (m && c && !c.dirty && c.mtime && m !== c.mtime) { await DB.reload(); refreshTables(); } }
        if (browsing) { const data = await drv.page(browsing, pg); const sig = JSON.stringify([browsing, pg, data.columns, data.rows, data.total]); if (sig !== lastSig) { busy = false; browse(browsing, true); } }
        if (local() || ++tick % 4 === 0) { const t = JSON.stringify(await drv.tables()); if (t !== tablesSig) refreshTables(); }
      } catch { /* the next tick tries again */ } finally { quickBusy = false; }
    }
    async function run() {
      browsing = null; tools.textContent = ''; const sql = code ? code.text(doc) : '';
      if (!sql.trim()) return show('warn', 'Type some SQL first, e.g.  SELECT * FROM users;');
      try { const r = await drv.exec(sql); const last = r.sets[r.sets.length - 1]; drawSet(last); show('ok', last ? `${last.rows.length} row${last.rows.length === 1 ? '' : 's'} · ${r.ms} ms` : `OK · ${r.changes} row${r.changes === 1 ? '' : 's'} changed · ${r.ms} ms`); refreshTables(); }
      catch (e) { grid.textContent = ''; show('err', e.message || String(e)); }
    }
    async function exportCsv() {
      try { let out = '', n = 0, off = 0, head = false; for (;;) { const d = await drv.page(browsing, { limit: 1000, offset: off, sort: pg.sort, dir: pg.dir, filter: pg.filter }); if (!head) { out += d.columns.map(csvCell).join(',') + '\r\n'; head = true; } for (const r of d.rows) out += r.map(csvCell).join(',') + '\r\n'; n += d.rows.length; off += 1000; if (off >= d.total || n >= 200000) break; } await window.native.saveAs(browsing + '.csv', out); }
      catch (e) { fail(e); }
    }
    async function newTable() {
      const name = h('input', { class: 'big', placeholder: 'table_name (e.g. users)' }); const list = h('div', { class: 'dbt-cols' });
      const add = (n = '', t = drv.types[1] || 'TEXT', pk = false) => { const r = h('div', { class: 'dbt-col' }, h('input', { placeholder: 'column', value: n }), h('select', {}, drv.types.map((x) => h('option', { selected: x === t }, x))), h('label', {}, h('input', { type: 'checkbox', checked: pk }), ' PK ', h('small', {}, '(auto)')), h('label', {}, h('input', { type: 'checkbox' }), ' NOT NULL'), h('button', { class: 'mini-btn', onclick: () => r.remove() }, '✕')); list.append(r); };
      add('id', drv.pkType, true); add('name', drv.types[1]); add('created_at', drv.types.find((x) => /^(datetime|timestamp)/i.test(x)) || drv.types[0]);
      const err = h('div', { class: 'form-error', style: 'display:none' });
      const m = VX.ui.modal({ title: 'New table', body: h('div', {}, name, h('div', { class: 'ask-hint' }, 'Columns'), list, h('button', { class: 'btn sm', style: 'margin-top:8px', onclick: () => add() }, '＋ Column'), err), actions: [h('button', { class: 'btn primary', onclick: async () => {
        const tn = name.value.trim(); err.style.display = ''; if (!/^[A-Za-z_]\w*$/.test(tn)) return (err.textContent = 'Table name: letters, digits and _ only (not starting with a digit).');
        const defs = [...list.children].map((r) => { const cs = r.querySelectorAll('input[type=checkbox]'); const cn = r.querySelector('input').value.trim(); return cn ? { name: cn, type: r.querySelector('select').value, pk: cs[0].checked, nn: cs[1].checked } : null; }).filter(Boolean);
        if (!defs.length) return (err.textContent = 'Add at least one column.');
        try { await drv.exec(drv.createSql(tn, defs)); m.close(); pg.offset = 0; pg.sort = null; browse(tn); } catch (e) { err.textContent = e.message || String(e); }
      } }, 'Create table')] }); setTimeout(() => name.focus(), 30);
    }
    async function importSql() { const fs = await VX.pickBrowserFile('.sql,.txt', false); if (!fs[0]) return; const text = await VX.readFileAsText(fs[0]); try { if (local()) await DB.exec(text); else await drv.raw(text); show('ok', `Imported ${fs[0].name}`); refreshTables(); if (browsing) browse(browsing); } catch (e) { show('err', 'Import failed: ' + e.message); } }
    async function importDb() { const fs = await VX.pickBrowserFile('.sqlite,.sqlite3,.db', false); if (!fs[0]) return; if (!(await VX.ui.confirm('Replace the current database with ' + fs[0].name + '? Tables in the current database will be lost.'))) return; const buf = new Uint8Array(await fs[0].arrayBuffer()); try { await DB.replace(buf); await DB.exec('SELECT 1'); show('ok', 'Opened ' + fs[0].name); browsing = null; grid.textContent = ''; tools.textContent = ''; refreshTables(); } catch (e) { show('err', 'Not a SQLite database: ' + e.message); } }
    async function exportSql() { const t = await DB.dump(); await window.native.saveAs('database.sql', t); }
    async function exportDb() { await window.native.saveBinary('database.sqlite', B64(await DB.exportBytes())); }

    /* ---- choose the database: the project's SQLite (default) or MySQL / MariaDB / PostgreSQL that is installed on this computer */
    async function connectDialog() {
      const saved = (await X().loadConfig()) || {}; const found = await X().detect();
      const kind = h('select', {}, h('option', { value: 'mysql' }, 'MySQL / MariaDB'), h('option', { value: 'postgres' }, 'PostgreSQL')); kind.value = (spec || saved).kind || 'mysql';
      const client = h('select', {}); const customClient = h('input', { placeholder: 'Full path to mysql / mariadb / psql (optional)', value: (spec || saved).customClient || '' });
      const fill = () => { client.textContent = ''; const want = kind.value; client.append(h('option', { value: '' }, 'Automatic (from your PATH)')); for (const c of found.filter((x) => x.kind === want)) client.append(h('option', { value: c.path }, c.path + (c.version ? '  ·  ' + c.version.slice(0, 50) : ''))); const cur = (spec || saved).client; if (cur) client.value = cur; };
      const host = h('input', { value: (spec || saved).host || '127.0.0.1' }), port = h('input', { type: 'number', value: (spec || saved).port || 3306, style: 'width:90px' }), user = h('input', { value: (spec || saved).user || 'root' });
      const pw = h('input', { type: 'password', placeholder: 'not saved to disk', value: X().passwords[X().key({ kind: kind.value, host: host.value, port: +port.value, user: user.value, database: (spec || saved).database || '' })] || '' }), dbn = h('input', { list: 'vx-dbnames', placeholder: 'database name', value: (spec || saved).database || '' }); const dl = h('datalist', { id: 'vx-dbnames' });
      kind.onchange = () => { port.value = kind.value === 'postgres' ? 5432 : 3306; user.value = kind.value === 'postgres' ? 'postgres' : 'root'; fill(); };
      fill(); const err = h('div', { class: 'form-error', style: 'display:none' }); const remember = h('input', { type: 'checkbox', checked: !!saved.kind });
      const current = () => ({ kind: kind.value, client: customClient.value.trim() || client.value || '', host: host.value.trim(), port: +port.value, user: user.value.trim(), database: dbn.value.trim(), password: pw.value });
      const listDbs = h('button', { class: 'btn sm', onclick: async () => { err.style.display = 'none'; try { const d = X().remote({ ...current(), database: '' }); const names = await d.databases(); dl.textContent = ''; names.forEach((n) => dl.append(h('option', { value: n }))); VX.ui.toast(names.length + ' databases found – pick one in the Database field'); dbn.focus(); } catch (e) { err.style.display = ''; err.textContent = e.message || String(e); } } }, 'List databases');
      const test = h('button', { class: 'btn', onclick: async () => { err.style.display = ''; err.className = 'form-error'; err.textContent = 'Testing…'; try { const r = await X().remote(current()).exec(X().remote(current()).version); err.className = 'dbt-msg ok'; err.textContent = 'Connected ✔  ' + (r.sets[0] ? r.sets[0].rows[0][0] : ''); } catch (e) { err.className = 'form-error'; err.textContent = e.message || String(e); } } }, 'Test connection');
      const useLocal = h('button', { class: 'btn', onclick: () => { spec = null; drv = X().sqlite(); m.close(); switched(); } }, 'Use the project SQLite');
      const go = h('button', { class: 'btn primary', onclick: async () => {
        const c = current(); err.style.display = ''; err.className = 'form-error'; err.textContent = 'Connecting…';
        try { const d = X().remote(c); await d.exec(d.version); X().passwords[X().key(c)] = c.password; spec = { ...c }; drv = d; if (remember.checked) await X().saveConfig({ ...c, customClient: customClient.value.trim() }); else await X().forgetConfig(); m.close(); switched(); } catch (e) { err.className = 'form-error'; err.textContent = e.message || String(e); }
      } }, 'Connect');
      const row = (l, ...c) => h('div', { class: 'dbt-field' }, h('label', {}, l), h('div', { style: 'display:flex;gap:6px;align-items:center' }, ...c));
      const m = VX.ui.modal({ title: 'Choose the database', body: h('div', { class: 'dbt-form' },
        h('p', { class: 'ask-hint' }, 'By default Vextra uses the SQLite database inside your project. To work with MySQL, MariaDB (for example from XAMPP) or PostgreSQL, Vextra uses the command-line program that came with it. Your password stays in memory and is never saved to the project.'),
        row('Type', kind), row('Client program', client), row('', customClient), row('Host and port', host, port), row('User', user), row('Password', pw), row('Database', dbn, listDbs, dl), h('label', {}, remember, ' Remember these settings (without the password) in this project'), err),
        actions: [useLocal, test, go] });
    }
    function switched() { browsing = null; structure = false; pg.offset = 0; pg.sort = null; pg.filter = ''; grid.textContent = ''; tools.textContent = ''; syncSource(); refreshTables(); show('ok', local() ? 'Using the project SQLite database.' : 'Connected: ' + drv.label); }

    const tab = await VX.tabs.open({ kind: 'preview', key, title: 'Database', icon: 'files', container: root, refresh() { refreshTables(); if (browsing) browse(browsing); }, onClose() { clearInterval(timer); offs.forEach((o) => o()); if (code && doc) code.releaseDoc(doc); DB.save().catch(() => {}); } });
    code = window.CodeEditor.create(editorHost, { onChange() {}, onCursor() {} }); doc = code.createDoc('-- Write SQL here and press Ctrl+Enter\nSELECT sqlite_version() AS sqlite;\n', 'sql', false); code.setDoc(doc);
    const look = () => { const st = VX.app.settings, th = VX.theme.current(); if (th) code.setLook(th, { fontSize: st.fontSize, tabSize: st.tabSize, wrap: false, fontFamily: st.fontFamily || 'JetBrains Mono, Consolas, monospace' }); }; look(); offs.push(VX.on('theme', look));
    editorHost.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
    timer = setInterval(quick, 2500); syncSource(); refreshTables(); return tab;
  };

  /* ------------------------------------------------------------ database access for live previews (window.VXDB) */
  VX.web.dbShim = (token, origin) => `<script>(function(){var __T=${VX.jsLit(token)},__O=${VX.jsLit(origin)},n=0,p={};window.addEventListener('message',function(e){var d=e.data;if(e.source===parent&&d&&d.token===__T&&d.vx==='db-result'&&p[d.id]){var r=p[d.id];delete p[d.id];d.error?r[1](new Error(d.error)):r[0](d.result)}});function call(op,sql,args){return new Promise(function(res,rej){var id=++n;p[id]=[res,rej];parent.postMessage({vx:'db',token:__T,id:id,op:op,sql:sql,params:args||[]},__O)})}window.VXDB={query:function(sql,params){return call('query',sql,params).then(function(r){return r.rows})},get:function(sql,params){return call('query',sql,params).then(function(r){return r.rows[0]||null})},run:function(sql,params){return call('query',sql,params).then(function(r){return{changes:r.changes}})},exec:function(sql){return call('exec',sql).then(function(r){return{changes:r.changes}})}}})();<\/script>`;
  VX.web.handleDbMessage = async function (e, frame, chan) {
    const d = e.data; if (!d || d.vx !== 'db' || e.source !== frame.contentWindow || !chan || d.token !== chan.token) return false;
    try { const result = d.op === 'exec' ? { changes: (await DB.exec(String(d.sql))).changes } : await DB.query(String(d.sql), Array.isArray(d.params) ? d.params : []); frame.contentWindow.postMessage({ vx: 'db-result', token: chan.token, id: d.id, result }, chan.origin); }
    catch (err) { frame.contentWindow.postMessage({ vx: 'db-result', token: chan.token, id: d.id, error: String(err.message || err) }, chan.origin); }
    return true;
  };
})();
