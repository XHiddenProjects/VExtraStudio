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
    cur = { db: bytes && bytes.length ? new SQL.Database(bytes) : new SQL.Database(), path: p, dirty: false, timer: 0 };
    return cur;
  };
  DB.replace = async (bytes) => { const SQL = await DB.engine(); const c = await DB.open(); try { c.db.close(); } catch { /* ignore */ } c.db = bytes ? new SQL.Database(bytes) : new SQL.Database(); c.dirty = true; DB.touch(); return c; };
  DB.touch = () => { if (!cur) return; cur.dirty = true; clearTimeout(cur.timer); cur.timer = setTimeout(() => DB.save().catch(() => {}), 900); VX.emit('dbChanged'); };
  DB.save = async () => {
    if (!cur || !cur.path) return false; clearTimeout(cur.timer);
    await window.native.writeBase64(cur.path, B64(cur.db.export())); cur.dirty = false; VX.emit('dbSaved'); return true;
  };

  /** Run one or many statements. Returns [{ columns, rows: [[...]] }] (rows as arrays) and the number of changed rows. */
  DB.exec = async (sql, params) => {
    const c = await DB.open(); const t0 = performance.now(); let results;
    if (params && params.length) { const st = c.db.prepare(sql); try { st.bind(params); const rows = []; while (st.step()) rows.push(st.get()); results = [{ columns: st.getColumnNames(), values: rows }]; } finally { st.free(); } }
    else results = c.db.exec(sql);
    const changes = c.db.getRowsModified(); if (/\b(insert|update|delete|create|drop|alter|replace|pragma|vacuum|attach|begin|commit)\b/i.test(sql)) DB.touch();
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
  VX.web.openDatabase = async function () {
    if (!S.root) { VX.ui.toast('Open a project folder first – the database is stored inside it as database.sqlite.', 'warn'); return VX.app.openFolder && VX.app.openFolder(); }
    const key = 'tool:database';
    if (S.tabs.find((x) => x.key === key)) return VX.tabs.open({ key, kind: 'preview' });
    try { await DB.open(); } catch (e) { return VX.ui.toast(e.message, 'error'); }

    const side = h('div', { class: 'dbt-side' }), grid = h('div', { class: 'dbt-grid' }), msg = h('div', { class: 'dbt-msg' }), editorHost = h('div', { class: 'dbt-code' });
    const status = h('span', { class: 'tag' }, 'saved'); let doc = null, code = null, browsing = null;
    const root = h('div', { class: 'dbt' },
      h('div', { class: 'dbt-bar' },
        h('button', { class: 'btn sm primary', title: 'Run (Ctrl+Enter)', onclick: () => run() }, '▶ Run'),
        h('button', { class: 'btn sm', onclick: () => newTable() }, '＋ Table'),
        h('span', { class: 'sep' }),
        h('button', { class: 'btn sm', title: 'Run a .sql file against this database', onclick: () => importSql() }, '⬆ Import .sql'),
        h('button', { class: 'btn sm', title: 'Replace this database with a .sqlite / .db file', onclick: () => importDb() }, '⬆ Open .sqlite'),
        h('button', { class: 'btn sm', onclick: () => exportSql() }, '⬇ Export .sql'),
        h('button', { class: 'btn sm', onclick: () => exportDb() }, '⬇ Export .sqlite'),
        h('span', { class: 'spacer' }), status, h('span', { class: 'tag', title: DB.path() }, 'database.sqlite')),
      h('div', { class: 'dbt-main' }, side, h('div', { class: 'dbt-work' }, editorHost, msg, grid)));

    const setStatus = () => { const c = DB.current(); status.textContent = c && c.dirty ? 'saving…' : 'saved'; };
    const offs = [VX.on('dbChanged', setStatus), VX.on('dbSaved', setStatus)];

    async function refreshTables() {
      const t = await DB.tables(); side.textContent = '';
      side.append(h('div', { class: 'dbt-h' }, 'TABLES'));
      if (!t.length) side.append(h('div', { class: 'dbt-empty' }, 'No tables yet. Use “＋ Table”, or write CREATE TABLE in the editor.'));
      for (const x of t) {
        side.append(h('div', { class: 'dbt-t' + (browsing === x.name ? ' on' : ''), onclick: () => browse(x.name), title: x.type },
          h('span', { class: 'nm' }, (x.type === 'view' ? '👁 ' : '▦ ') + x.name), h('small', {}, String(x.rows)),
          h('button', { class: 'mini-btn', title: 'Drop', onclick: async (e) => { e.stopPropagation(); if (await VX.ui.confirm(`Delete table “${x.name}” and all its rows?`)) { await DB.exec(`DROP ${x.type === 'view' ? 'VIEW' : 'TABLE'} "${x.name.replace(/"/g, '""')}"`); if (browsing === x.name) { browsing = null; grid.textContent = ''; } refreshTables(); } } }, '🗑')));
      }
    }
    const show = (kind, text) => { msg.className = 'dbt-msg ' + kind; msg.textContent = text; };
    const cell = (v) => (v === null || v === undefined ? h('i', { class: 'null' }, 'NULL') : v instanceof Uint8Array ? h('i', { class: 'null' }, `<${v.length} bytes>`) : String(v));
    function drawSet(set, editable) {
      grid.textContent = ''; if (!set) return;
      const cols = editable ? set.columns.slice(1) : set.columns; const off = editable ? 1 : 0; const rows = set.rows.slice(0, 500);
      const tb = h('table', {}, h('thead', {}, h('tr', {}, editable ? h('th', { class: 'act' }, '') : null, cols.map((c) => h('th', {}, c)))));
      const body = h('tbody', {});
      rows.forEach((row) => {
        const tr = h('tr', {}); if (editable) tr.append(h('td', { class: 'act' }, h('button', { class: 'mini-btn', title: 'Delete row', onclick: async () => { await DB.exec(`DELETE FROM "${browsing.replace(/"/g, '""')}" WHERE rowid = ?`, [row[0]]); browse(browsing); refreshTables(); } }, '✕')));
        cols.forEach((c, i) => {
          const td = h('td', { title: String(row[i + off] ?? '') }, cell(row[i + off]));
          if (editable) td.addEventListener('dblclick', () => {
            const inp = h('input', { value: row[i + off] === null ? '' : String(row[i + off]) }); td.textContent = ''; td.append(inp); inp.focus(); inp.select();
            const commit = async (save) => { if (!save) return browse(browsing); try { const v = inp.value === '' && row[i + off] === null ? null : isNaN(+inp.value) || inp.value.trim() === '' ? inp.value : +inp.value; await DB.exec(`UPDATE "${browsing.replace(/"/g, '""')}" SET "${c.replace(/"/g, '""')}" = ? WHERE rowid = ?`, [v, row[0]]); } catch (e) { show('err', e.message); } browse(browsing); };
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') commit(false); }); inp.addEventListener('blur', () => commit(true));
          });
          tr.append(td);
        });
        body.append(tr);
      });
      tb.append(body); grid.append(tb); if (set.rows.length > 500) grid.append(h('div', { class: 'dbt-empty' }, `Showing the first 500 of ${set.rows.length} rows.`));
    }
    async function browse(name) {
      browsing = name; const qn = name.replace(/"/g, '""');
      try { const r = await DB.exec(`SELECT rowid AS "__rowid__", * FROM "${qn}" LIMIT 1000`); drawSet(r.sets[0], true); show('ok', `${name}: ${r.sets[0] ? r.sets[0].rows.length : 0} rows · double-click a cell to edit`); }
      catch { try { const r = await DB.exec(`SELECT * FROM "${qn}" LIMIT 1000`); drawSet(r.sets[0], false); show('ok', `${name}: read-only (no rowid)`); } catch (e) { show('err', e.message); } }
      grid.prepend(h('div', { class: 'dbt-gtools' }, h('button', { class: 'btn sm', onclick: async () => { try { await DB.exec(`INSERT INTO "${qn}" DEFAULT VALUES`); } catch (e) { show('err', e.message); } browse(name); refreshTables(); } }, '＋ Row')));
      refreshTables();
    }
    async function run() {
      browsing = null; const sql = code ? code.text(doc) : '';
      if (!sql.trim()) return show('warn', 'Type some SQL first, e.g.  SELECT * FROM users;');
      try {
        const r = await DB.exec(sql); const last = r.sets[r.sets.length - 1]; drawSet(last, false);
        show('ok', last ? `${last.rows.length} row${last.rows.length === 1 ? '' : 's'} · ${r.ms} ms` : `OK · ${r.changes} row${r.changes === 1 ? '' : 's'} changed · ${r.ms} ms`); refreshTables();
      } catch (e) { grid.textContent = ''; show('err', e.message); }
    }
    async function newTable() {
      const name = h('input', { class: 'big', placeholder: 'table_name (e.g. users)' }); const list = h('div', { class: 'dbt-cols' });
      const TYPES = ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC', 'DATETIME', 'BOOLEAN'];
      const add = (n = '', t = 'TEXT', pk = false) => { const r = h('div', { class: 'dbt-col' }, h('input', { placeholder: 'column', value: n }), h('select', {}, TYPES.map((x) => h('option', { selected: x === t }, x))), h('label', {}, h('input', { type: 'checkbox', checked: pk }), ' PK ', h('small', {}, '(auto)')), h('label', {}, h('input', { type: 'checkbox' }), ' NOT NULL'), h('button', { class: 'btn sm ghost', onclick: () => r.remove() }, '✕')); list.append(r); };
      add('id', 'INTEGER', true); add('name', 'TEXT'); add('created_at', 'DATETIME');
      const m = VX.ui.modal({ title: 'New table', body: h('div', {}, name, h('div', { class: 'ask-hint' }, 'Columns'), list, h('button', { class: 'btn sm', style: 'margin-top:8px', onclick: () => add() }, '＋ Column')), actions: [h('button', { class: 'btn primary', onclick: async () => {
        const tn = name.value.trim(); if (!/^[A-Za-z_]\w*$/.test(tn)) return VX.ui.toast('Table name: letters, digits and _ only (not starting with a digit).', 'warn');
        const defs = [...list.children].map((r) => { const [ci, sel, pk, nn] = [r.querySelector('input'), r.querySelector('select'), r.querySelectorAll('input[type=checkbox]')[0], r.querySelectorAll('input[type=checkbox]')[1]]; const cn = ci.value.trim(); if (!cn) return null; return `"${cn.replace(/"/g, '""')}" ${sel.value}${pk.checked ? ' PRIMARY KEY' + (sel.value === 'INTEGER' ? ' AUTOINCREMENT' : '') : ''}${nn.checked ? ' NOT NULL' : ''}${sel.value === 'DATETIME' && /created|updated/i.test(cn) ? " DEFAULT CURRENT_TIMESTAMP" : ''}`; }).filter(Boolean);
        if (!defs.length) return VX.ui.toast('Add at least one column.', 'warn');
        try { await DB.exec(`CREATE TABLE "${tn}" (\n  ${defs.join(',\n  ')}\n)`); m.close(); refreshTables(); browse(tn); } catch (e) { VX.ui.toast(e.message, 'error'); }
      } }, 'Create table')] }); setTimeout(() => name.focus(), 30);
    }
    async function importSql() { const fs = await VX.pickBrowserFile('.sql,.txt', false); if (!fs[0]) return; const text = await VX.readFileAsText(fs[0]); try { await DB.exec(text); show('ok', `Imported ${fs[0].name}`); refreshTables(); } catch (e) { show('err', 'Import failed: ' + e.message); } }
    async function importDb() { const fs = await VX.pickBrowserFile('.sqlite,.sqlite3,.db', false); if (!fs[0]) return; if (!(await VX.ui.confirm('Replace the current database with ' + fs[0].name + '? Tables in the current database will be lost.'))) return; const buf = new Uint8Array(await fs[0].arrayBuffer()); try { await DB.replace(buf); await DB.exec('SELECT 1'); show('ok', 'Opened ' + fs[0].name); refreshTables(); grid.textContent = ''; } catch (e) { show('err', e.message); } }
    async function exportSql() { const t = await DB.dump(); await window.native.saveAs('database.sql', t); }
    async function exportDb() { await window.native.saveBinary('database.sqlite', B64(await DB.exportBytes())); }

    const tab = await VX.tabs.open({ kind: 'preview', key, title: 'Database', icon: 'files', container: root, refresh() { refreshTables(); }, onClose() { offs.forEach((o) => o()); if (code && doc) code.releaseDoc(doc); DB.save().catch(() => {}); } });
    code = window.CodeEditor.create(editorHost, { onChange() {}, onCursor() {} }); doc = code.createDoc('-- Write SQL here and press Ctrl+Enter\nSELECT sqlite_version() AS sqlite;\n', 'sql', false); code.setDoc(doc);
    const look = () => { const st = VX.app.settings, th = VX.theme.current(); if (th) code.setLook(th, { fontSize: st.fontSize, tabSize: st.tabSize, wrap: false, fontFamily: st.fontFamily || 'JetBrains Mono, Consolas, monospace' }); }; look(); offs.push(VX.on('theme', look));
    editorHost.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
    refreshTables(); return tab;
  };

  /* ------------------------------------------------------------ database access for live previews (window.VXDB) */
  VX.web.dbShim = (token, origin) => `<script>(function(){var __T=${JSON.stringify(token)},__O=${JSON.stringify(origin)},n=0,p={};window.addEventListener('message',function(e){var d=e.data;if(e.source===parent&&d&&d.token===__T&&d.vx==='db-result'&&p[d.id]){var r=p[d.id];delete p[d.id];d.error?r[1](new Error(d.error)):r[0](d.result)}});function call(op,sql,args){return new Promise(function(res,rej){var id=++n;p[id]=[res,rej];parent.postMessage({vx:'db',token:__T,id:id,op:op,sql:sql,params:args||[]},__O)})}window.VXDB={query:function(sql,params){return call('query',sql,params).then(function(r){return r.rows})},get:function(sql,params){return call('query',sql,params).then(function(r){return r.rows[0]||null})},run:function(sql,params){return call('query',sql,params).then(function(r){return{changes:r.changes}})},exec:function(sql){return call('exec',sql).then(function(r){return{changes:r.changes}})}}})();<\/script>`;
  VX.web.handleDbMessage = async function (e, frame, chan) {
    const d = e.data; if (!d || d.vx !== 'db' || e.source !== frame.contentWindow || !chan || d.token !== chan.token) return false;
    try { const result = d.op === 'exec' ? { changes: (await DB.exec(String(d.sql))).changes } : await DB.query(String(d.sql), Array.isArray(d.params) ? d.params : []); frame.contentWindow.postMessage({ vx: 'db-result', token: chan.token, id: d.id, result }, chan.origin); }
    catch (err) { frame.contentWindow.postMessage({ vx: 'db-result', token: chan.token, id: d.id, error: String(err.message || err) }, chan.origin); }
    return true;
  };
})();
