/* Vextra Studio – database drivers for the Database tab.
 *   sqlite    the project's own database (sql.js, always available, the default)
 *   mysql     MySQL and MariaDB through the `mysql` / `mariadb` command-line client you have installed
 *   postgres  PostgreSQL through `psql`
 * Every driver offers the same small set of calls, so the Database tab works the same way with all of them:
 *   exec(sql) · tables() · columns(t) · page(t, opts) · insert(t, obj) · update(t, key, col, val) · remove(t, key) · createTable(name, cols) · drop(t, type) */
(function () {
  const X = (VX.dbx = {});
  const S = VX.app.S;

  /** split SQL text into statements (understands '…' "…" `…` strings and -- / # / block comments) */
  X.split = (sql) => {
    const out = []; let cur = '', i = 0; const n = sql.length;
    while (i < n) {
      const c = sql[i], d = sql[i + 1];
      if (c === '-' && d === '-' || c === '#') { const e = sql.indexOf('\n', i); const t = e < 0 ? n : e; cur += sql.slice(i, t); i = t; continue; }
      if (c === '/' && d === '*') { const e = sql.indexOf('*/', i + 2); const t = e < 0 ? n : e + 2; cur += sql.slice(i, t); i = t; continue; }
      if (c === "'" || c === '"' || c === '`') { let j = i + 1; while (j < n) { if (sql[j] === '\\' && c !== '`') { j += 2; continue; } if (sql[j] === c) { if (sql[j + 1] === c) { j += 2; continue; } break; } j++; } cur += sql.slice(i, j + 1); i = j + 1; continue; }
      if (c === ';') { if (cur.replace(/--.*|#.*|\/\*[\s\S]*?\*\//g, '').trim()) out.push(cur.trim()); cur = ''; i++; continue; }
      cur += c; i++;
    }
    if (cur.replace(/--.*|#.*|\/\*[\s\S]*?\*\//g, '').trim()) out.push(cur.trim());
    return out;
  };

  /** CSV (RFC 4180) → rows of cells */
  const csv = (text) => {
    const rows = []; let row = [], cell = '', q = false, i = 0; const n = text.length;
    while (i < n) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; } cell += c; i++; continue; }
      if (c === '"') { q = true; i++; continue; }
      if (c === ',') { row.push(cell); cell = ''; i++; continue; }
      if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      cell += c; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  };
  const tsv = (text) => text.replace(/\r\n/g, '\n').split('\n').filter((l, i, a) => l !== '' || i < a.length - 1).map((l) => l.split('\t'));
  /** the mysql client writes \n \t \\ and \0 inside values as escapes (so a value never spans two lines) */
  const unesc = (c) => (c.indexOf('\\') < 0 ? c : c.replace(/\\([nt0\\r])/g, (m, k) => ({ n: '\n', t: '\t', 0: '\0', r: '\r', '\\': '\\' })[k]));
  /** keep just the useful line of a client error (mysql repeats the statement) */
  const clean = (e) => { const m = String((e && e.message) || e); const l = m.split('\n').map((x) => x.trim()).filter((x) => x && !/^-+$/.test(x)); return l.find((x) => /^ERROR/i.test(x)) || l.join(' ').slice(0, 500) || m; };
  const isNum = (t) => /int|serial|decimal|numeric|float|double|real|bit|year/i.test(t || '');

  /* ------------------------------------------------------------ SQLite (the project database, via VX.db) */
  X.sqlite = () => {
    const DB = VX.db, qi = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const where = (cols, filter) => (filter ? { sql: ' WHERE ' + cols.map((c) => `CAST(${qi(c)} AS TEXT) LIKE ?`).join(' OR '), args: cols.map(() => '%' + filter + '%') } : { sql: '', args: [] });
    const d = {
      kind: 'sqlite', label: 'SQLite · database.sqlite (project)', qi, canDump: true, version: 'SELECT sqlite_version() AS sqlite',
      types: ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC', 'DATETIME', 'BOOLEAN'], pkType: 'INTEGER',
      exec: (sql) => DB.exec(sql),
      tables: () => DB.tables(),
      async columns(t) { const r = await DB.exec(`PRAGMA table_info(${qi(t)})`); return (r.sets[0] ? r.sets[0].rows : []).map(([, name, type, notnull, dflt, pk]) => ({ name, type: type || '', nullable: !notnull && !pk, def: dflt, pk: !!pk, auto: !!pk && /int/i.test(type) })); },
      async page(t, o) {
        const cols = (await d.columns(t)).map((c) => c.name); const w = where(cols, o.filter); const order = o.sort && cols.includes(o.sort) ? ` ORDER BY ${qi(o.sort)} ${o.dir === 'desc' ? 'DESC' : 'ASC'}` : '';
        const total = (await DB.exec(`SELECT COUNT(*) FROM ${qi(t)}${w.sql}`, w.args)).sets[0].rows[0][0]; let rowid = true, r;
        try { r = await DB.exec(`SELECT rowid AS "__rowid__", * FROM ${qi(t)}${w.sql}${order} LIMIT ${o.limit} OFFSET ${o.offset}`, w.args); } catch { rowid = false; r = await DB.exec(`SELECT * FROM ${qi(t)}${w.sql}${order} LIMIT ${o.limit} OFFSET ${o.offset}`, w.args); }
        const s = r.sets[0] || { columns: cols, rows: [] }; return { columns: rowid ? s.columns.slice(1) : s.columns, rows: s.rows.map((x) => (rowid ? x.slice(1) : x)), keys: rowid ? s.rows.map((x) => ({ __rowid__: x[0] })) : null, total };
      },
      async insert(t, obj) { const ks = Object.keys(obj); if (!ks.length) await DB.exec(`INSERT INTO ${qi(t)} DEFAULT VALUES`); else await DB.exec(`INSERT INTO ${qi(t)} (${ks.map(qi).join(',')}) VALUES (${ks.map(() => '?').join(',')})`, ks.map((k) => obj[k])); },
      async update(t, key, obj) { const ks = Object.keys(obj); await DB.exec(`UPDATE ${qi(t)} SET ${ks.map((k) => qi(k) + ' = ?').join(', ')} WHERE rowid = ?`, [...ks.map((k) => obj[k]), key.__rowid__]); },
      async remove(t, key) { await DB.exec(`DELETE FROM ${qi(t)} WHERE rowid = ?`, [key.__rowid__]); },
      drop: (t, type) => DB.exec(`DROP ${type === 'view' ? 'VIEW' : 'TABLE'} ${qi(t)}`),
      async create(t) { const r = await DB.exec('SELECT sql FROM sqlite_master WHERE name = ?', [t]); return r.sets[0] && r.sets[0].rows[0] ? r.sets[0].rows[0][0] : ''; },
      createSql: (name, cols) => `CREATE TABLE ${qi(name)} (\n  ${cols.map((c) => `${qi(c.name)} ${c.type}${c.pk ? ' PRIMARY KEY' + (c.type === 'INTEGER' ? ' AUTOINCREMENT' : '') : ''}${c.nn && !c.pk ? ' NOT NULL' : ''}`).join(',\n  ')}\n)`,
    };
    return d;
  };

  /* ------------------------------------------------------------ MySQL / MariaDB / PostgreSQL through the installed client */
  X.remote = (spec) => {
    const pg = spec.kind === 'postgres'; const qi = pg ? (s) => '"' + String(s).replace(/"/g, '""') + '"' : (s) => '`' + String(s).replace(/`/g, '``') + '`';
    const lit = (v) => (v === null || v === undefined ? 'NULL' : "'" + String(v).replace(/'/g, "''").replace(/\\/g, pg ? '\\' : '\\\\') + "'");
    const run = (sql) => window.native.db.cli(spec, sql).catch((e) => { throw new Error(clean(e)); });
    const MARK = '<<vx>>';
    const table = (text) => { const rows = pg ? csv(text) : tsv(text); if (!rows.length) return { columns: [], rows: [] }; return { columns: rows[0], rows: rows.slice(1).map((r) => r.map((c) => (pg ? (c === '\\N' ? null : c) : c === 'NULL' ? null : unesc(c)))) }; };
    /** one statement → { sets, changes } */
    async function one(sql) {
      const t0 = performance.now();
      if (pg) { const out = await run(sql); const t = table(out); return { sets: t.columns.length ? [{ columns: t.columns, rows: t.rows }] : [], changes: 0, ms: Math.round(performance.now() - t0) }; }
      const out = await run(sql.replace(/;\s*$/, '') + `;\nSELECT '${MARK}' AS vx_marker, ROW_COUNT() AS vx_changes;`);
      const lines = out.replace(/\r\n/g, '\n').split('\n'); while (lines.length && lines[lines.length - 1] === '') lines.pop();
      let changes = 0; if (lines.length >= 2 && lines[lines.length - 1].startsWith(MARK)) { changes = Math.max(0, parseInt(lines[lines.length - 1].split('\t')[1], 10) || 0); lines.length -= 2; }
      const t = lines.length ? table(lines.join('\n')) : null; return { sets: t && t.columns.length ? [{ columns: t.columns, rows: t.rows }] : [], changes, ms: Math.round(performance.now() - t0) };
    }
    const d = {
      kind: spec.kind, label: (pg ? 'PostgreSQL' : 'MySQL / MariaDB') + ` · ${spec.database || '(no database)'} @ ${spec.host || '127.0.0.1'}`, qi, canDump: false, version: pg ? 'SELECT version() AS version' : 'SELECT VERSION() AS version',
      types: pg ? ['integer', 'bigint', 'text', 'varchar(255)', 'numeric', 'real', 'boolean', 'timestamp', 'date', 'jsonb'] : ['INT', 'BIGINT', 'VARCHAR(255)', 'TEXT', 'DECIMAL(10,2)', 'DOUBLE', 'BOOLEAN', 'DATETIME', 'DATE', 'JSON'], pkType: pg ? 'serial' : 'INT',
      async exec(sql) { const sets = []; let changes = 0, ms = 0; for (const st of X.split(sql)) { const r = await one(st); sets.push(...r.sets); changes = r.changes; ms += r.ms; } return { sets, changes, ms }; },
      /** many statements at once, without reading results (imports) */
      raw: (sql) => run(sql),
      async tables() {
        const r = pg ? await one("SELECT table_name, CASE table_type WHEN 'VIEW' THEN 'view' ELSE 'table' END FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 2, 1")
          : await one('SELECT table_name, CASE table_type WHEN \'VIEW\' THEN \'view\' ELSE \'table\' END FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY 2, 1'); const list = (r.sets[0] ? r.sets[0].rows : []).slice(0, 300).map(([name, type]) => ({ name, type, rows: 0 }));
        if (list.length) { try { const u = await one(list.map((t, i) => `SELECT ${i} AS i, COUNT(*) AS c FROM ${qi(t.name)}`).join(' UNION ALL ')); for (const [i, c] of (u.sets[0] ? u.sets[0].rows : [])) list[+i].rows = +c; } catch { /* views that fail */ } }
        return list;
      },
      async columns(t) {
        if (pg) { const r = await one(`SELECT c.column_name, c.data_type, c.is_nullable, c.column_default, (SELECT COUNT(*) FROM information_schema.key_column_usage k JOIN information_schema.table_constraints tc ON tc.constraint_name = k.constraint_name AND tc.table_schema = k.table_schema WHERE tc.constraint_type = 'PRIMARY KEY' AND k.table_name = c.table_name AND k.column_name = c.column_name AND k.table_schema = c.table_schema) AS pk FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = ${lit(t)} ORDER BY c.ordinal_position`); return (r.sets[0] ? r.sets[0].rows : []).map(([name, type, nul, def, pk]) => ({ name, type, nullable: nul === 'YES', def: def || null, pk: +pk > 0, auto: /^nextval|identity/i.test(def || '') })); }
        const r = await one(`SHOW FULL COLUMNS FROM ${qi(t)}`); return (r.sets[0] ? r.sets[0].rows : []).map((x) => ({ name: x[0], type: x[1], nullable: x[3] === 'YES', def: x[5], pk: x[4] === 'PRI', auto: /auto_increment/i.test(x[6] || '') || /DEFAULT_GENERATED/i.test(x[6] || '') }));
      },
      async page(t, o) {
        const cols = await d.columns(t); const names = cols.map((c) => c.name); const w = o.filter ? ' WHERE ' + names.map((c) => `CAST(${qi(c)} AS ${pg ? 'text' : 'CHAR'}) ${pg ? 'ILIKE' : 'LIKE'} ${lit('%' + o.filter.replace(/[\\%_]/g, '\\$&') + '%')}`).join(' OR ') : '';
        const order = o.sort && names.includes(o.sort) ? ` ORDER BY ${qi(o.sort)} ${o.dir === 'desc' ? 'DESC' : 'ASC'}` : (cols.some((c) => c.pk) ? ' ORDER BY ' + cols.filter((c) => c.pk).map((c) => qi(c.name)).join(', ') : '');
        const total = +(((await one(`SELECT COUNT(*) FROM ${qi(t)}${w}`)).sets[0] || { rows: [[0]] }).rows[0][0]); const r = await one(`SELECT * FROM ${qi(t)}${w}${order} LIMIT ${o.limit} OFFSET ${o.offset}`); const s = r.sets[0] || { columns: names, rows: [] };
        const pks = cols.filter((c) => c.pk).map((c) => c.name); const idx = pks.map((k) => s.columns.indexOf(k));
        return { columns: s.columns, rows: s.rows, keys: pks.length && idx.every((i) => i >= 0) ? s.rows.map((row) => Object.fromEntries(pks.map((k, j) => [k, row[idx[j]]]))) : null, total };
      },
      async insert(t, obj) { const ks = Object.keys(obj); await one(ks.length ? `INSERT INTO ${qi(t)} (${ks.map(qi).join(', ')}) VALUES (${ks.map((k) => lit(obj[k])).join(', ')})` : (pg ? `INSERT INTO ${qi(t)} DEFAULT VALUES` : `INSERT INTO ${qi(t)} () VALUES ()`)); },
      async update(t, key, obj) { const ks = Object.keys(obj); await one(`UPDATE ${qi(t)} SET ${ks.map((k) => `${qi(k)} = ${lit(obj[k])}`).join(', ')} WHERE ${Object.keys(key).map((k) => `${qi(k)} = ${lit(key[k])}`).join(' AND ')}`); },
      async remove(t, key) { await one(`DELETE FROM ${qi(t)} WHERE ${Object.keys(key).map((k) => `${qi(k)} = ${lit(key[k])}`).join(' AND ')}`); },
      drop: (t, type) => one(`DROP ${type === 'view' ? 'VIEW' : 'TABLE'} ${qi(t)}`),
      async create(t) { if (pg) return ''; const r = await one(`SHOW CREATE TABLE ${qi(t)}`); return r.sets[0] && r.sets[0].rows[0] ? r.sets[0].rows[0][1] : ''; },
      createSql: (name, cols) => `CREATE TABLE ${qi(name)} (\n  ${cols.map((c) => `${qi(c.name)} ${c.pk ? (pg ? 'serial' : c.type + ' AUTO_INCREMENT') : c.type}${c.pk ? ' PRIMARY KEY' : ''}${c.nn && !c.pk ? ' NOT NULL' : ''}`).join(',\n  ')}\n)`,
      async databases() { const r = await one(pg ? 'SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1' : 'SHOW DATABASES'); return (r.sets[0] ? r.sets[0].rows : []).map((x) => x[0]); },
    };
    return d;
  };

  /* ------------------------------------------------------------ connection settings (the password is never written to disk) */
  const cfgPath = () => (S.root ? VX.path.join(VX.path.join(S.root, '.vextra'), 'db.json') : null);
  X.passwords = {}; // kept in memory only
  X.loadConfig = async () => { const p = cfgPath(); try { if (p && (await window.native.exists(p))) return JSON.parse(await window.native.readFile(p)); } catch { /* none */ } return null; };
  X.saveConfig = async (spec) => { const p = cfgPath(); if (!p) return; const { password, ...rest } = spec; await window.native.create(S.root, '.vextra', true).catch(() => {}); await window.native.writeFile(p, JSON.stringify(rest, null, 2)); };
  X.forgetConfig = async () => { const p = cfgPath(); try { if (p && (await window.native.exists(p))) await window.native.remove(p); } catch { /* ignore */ } };
  X.key = (s) => [s.kind, s.host, s.port, s.user, s.database].join('|');
  X.detect = async () => { try { return await window.native.db.detect(); } catch { return []; } };
})();
