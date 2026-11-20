/** @vx-plugin {"id":"backup","name":"Project Backup","version":"1.0.0","description":"One-click and automatic ZIP backups of the open folder, with a restore list, a safety copy before every restore and a retention limit."} */
/** @vx-docs
 * ## Using Project Backup
 * - **Back up now** (Command Palette → *Backup: Back up now*, or the 💾 panel) saves the whole open folder as a ZIP in the **`_backups`** folder inside it.
 * - **Automatic backups**: ⚙ Configure → set *Back up every … minutes* (0 = off). A backup is only made when something changed since the last one.
 * - **Keep the newest …**: older automatic backups are deleted; manual backups and "before restore" copies are never deleted automatically.
 * - **Restore**: pick a backup in the panel. Vextra first saves a **before-restore** copy of the current files, then writes the files from the backup. Files that are not in the backup are left alone.
 * - **Save a copy elsewhere**: the *Export* button saves the ZIP anywhere you choose (another drive, a USB stick, a cloud folder).
 * - Not included: `_backups`, `node_modules`, `.git`, `dist`, `target`, `vendor` and files larger than the *Largest file* setting (default 50 MB).
 *
 * Backups are plain ZIP files – you can open them with any unzip tool.
 */
const SKIP = /^(_backups|node_modules|\.git|dist|target|vendor|\.next)(\/|$)/;
const DIR = '_backups';
const num = (v, d) => (Number.isFinite(+v) && +v >= 0 ? +v : d);
const cfg = () => ({ every: num(vx.settings.get('every', 0), 0), keep: Math.max(1, num(vx.settings.get('keep', 10), 10)), maxMb: Math.max(1, num(vx.settings.get('maxMb', 50), 50)), totalMb: 600 });
const root = () => { const r = vx.fs.root(); return r ? String(r).replace(/\\/g, '/').replace(/\/+$/, '') : null; };
const two = (n) => String(n).padStart(2, '0');
const stamp = (d = new Date()) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}`;
const size = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
let busy = false, lastSig = '', timer = 0, panelBox = null;
const item = vx.statusBar.add({ id: 'last', text: '💾 no backup yet', align: 'right', tooltip: 'Project Backup – click to back up now', onClick: () => backup('manual') });

/** What a backup of this folder would contain – a cheap signature used to skip automatic backups when nothing changed. */
async function signature(files) { return files.length + ':' + files.slice(0, 400).join('|').length; }

async function backup(kind = 'manual', quiet = false) {
  const r = root(); if (!r) { if (!quiet) vx.ui.toast('Open a folder first', 'warn'); return null; }
  if (busy) return null; busy = true; item.update('💾 backing up …');
  const c = cfg(); let prog = null;
  try {
    const all = (await vx.fs.list(20000)).filter((f) => !SKIP.test(f));
    if (!all.length) { if (!quiet) vx.ui.toast('Nothing to back up', 'warn'); return null; }
    if (!quiet) prog = vx.ui.progress('Backing up …');
    const entries = []; let total = 0, skipped = 0;
    for (let i = 0; i < all.length; i++) {
      if (prog && prog.cancelled) throw new Error('Cancelled');
      const f = all[i]; let b64;
      try { b64 = await vx.fs.readBase64(r + '/' + f); } catch { skipped++; continue; }
      const bytes = Math.floor(b64.length * 3 / 4);
      if (bytes > c.maxMb * 1048576) { skipped++; continue; }
      total += bytes; if (total > c.totalMb * 1048576) throw new Error(`The folder is larger than ${c.totalMb} MB – exclude big files or raise nothing: backups are kept in memory while they are built.`);
      entries.push({ path: f, data: VX.archive.fromB64(b64) });
      if (prog && i % 25 === 0) { prog.set(5 + 85 * i / all.length, f); await new Promise((x) => setTimeout(x, 0)); }
    }
    const sig = await signature(all) + ':' + total;
    if (kind === 'auto' && sig === lastSig) return null;
    if (prog) prog.set(92, 'Compressing …');
    const zip = await VX.archive.zip(entries);
    const name = `${kind === 'restore' ? 'before-restore' : kind === 'auto' ? 'auto' : 'manual'}_${stamp()}.zip`;
    await vx.fs.writeBase64(`${r}/${DIR}/${name}`, VX.archive.toB64(zip));
    lastSig = sig; vx.settings.set('last', Date.now());
    if (kind === 'auto') await prune(r, c.keep);
    item.update(`💾 backed up ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    if (prog) { prog.set(100, `${entries.length} files · ${size(zip.length)}${skipped ? ` · ${skipped} skipped` : ''}`); prog.done('Close'); }
    else if (!quiet) vx.ui.toast(`Backup saved: ${name}`);
    renderList();
    return name;
  } catch (e) {
    if (prog) prog.close(); item.update('💾 backup failed'); vx.ui.toast('Backup failed: ' + (e.message || e), 'error'); return null;
  } finally { busy = false; }
}

async function listBackups() {
  const r = root(); if (!r) return [];
  let ents = []; try { ents = await vx.fs.readDir(`${r}/${DIR}`); } catch { return []; }
  const out = [];
  for (const e of ents) { if (e.is_dir || !/\.zip$/i.test(e.name)) continue; const m = e.name.match(/^(manual|auto|before-restore)_(\d{4})-(\d\d)-(\d\d)_(\d\d)-(\d\d)-(\d\d)\.zip$/); out.push({ name: e.name, path: e.path, kind: m ? m[1] : 'other', at: m ? new Date(+m[2], +m[3] - 1, +m[4], +m[5], +m[6], +m[7]) : null }); }
  out.sort((a, b) => (b.at || 0) - (a.at || 0) || b.name.localeCompare(a.name)); return out;
}
async function prune(r, keep) {
  const autos = (await listBackups()).filter((b) => b.kind === 'auto');
  for (const b of autos.slice(keep)) { try { await vx.fs.remove(`${DIR}/${b.name}`); } catch { /* ignore */ } }
}

/** Paths inside a backup are untrusted data: only plain relative paths are written. */
const safeRel = (p) => { const q = String(p).replace(/\\/g, '/'); return !q || q.startsWith('/') || /^[a-z]:/i.test(q) || q.split('/').some((x) => x === '..' || x === '') || SKIP.test(q) ? null : q; };

async function restore(b) {
  const r = root(); if (!r) return;
  if (!(await vx.ui.confirm(`Restore “${b.name}”?\n\nFiles in the backup replace the current files with the same name. Files that are not in the backup stay as they are. A before-restore copy of the current folder is saved first.`, 'Restore'))) return;
  const safe = await backup('restore', true); if (!safe) { vx.ui.toast('Restore cancelled: the safety copy could not be made', 'error'); return; }
  const prog = vx.ui.progress('Restoring …');
  try {
    const files = await VX.archive.unzip(VX.archive.fromB64(await vx.fs.readBase64(b.path)), { files: 50000, bytes: 600 * 1048576 });
    let n = 0, bad = 0;
    for (let i = 0; i < files.length; i++) {
      if (prog.cancelled) break; const f = files[i]; if (f.dir) continue; const rel = safeRel(f.path); if (!rel) { bad++; continue; }
      await vx.fs.writeBase64(`${r}/${rel}`, VX.archive.toB64(f.data)); n++; if (i % 20 === 0) prog.set(100 * i / files.length, rel);
    }
    prog.set(100, `${n} files restored${bad ? ` · ${bad} unsafe path(s) ignored` : ''}`); prog.done('Close');
    vx.ui.toast('Restored. Reopen files that were open in tabs to see the restored version.');
  } catch (e) { prog.close(); vx.ui.toast('Restore failed: ' + (e.message || e) + ' – your files were saved in the before-restore copy.', 'error'); }
  renderList();
}

async function exportCopy(b) {
  try { const p = await window.native.saveBinary(b.name, await vx.fs.readBase64(b.path)); if (p) vx.ui.toast('Saved to ' + p); } catch (e) { vx.ui.toast('Export failed: ' + (e.message || e), 'error'); }
}

function renderList() { if (panelBox && panelBox.isConnected) fill(panelBox); }
async function fill(box) {
  const h = VX.h; box.textContent = '';
  const top = h('div', { style: 'padding:10px;display:flex;gap:6px;flex-wrap:wrap' }, h('button', { class: 'btn primary', onclick: () => backup('manual') }, 'Back up now'), h('button', { class: 'btn', onclick: () => vx.config.open() }, '⚙ Settings'));
  box.append(top);
  if (!root()) { box.append(h('div', { style: 'padding:10px;color:var(--muted)' }, 'Open a folder to use backups.')); return; }
  const list = await listBackups(); const c = cfg();
  box.append(h('div', { style: 'padding:0 10px 8px;color:var(--muted);font-size:12px' }, c.every ? `Automatic: every ${c.every} min, keeping the newest ${c.keep}.` : 'Automatic backups are off (⚙ Settings).'));
  if (!list.length) { box.append(h('div', { style: 'padding:10px;color:var(--muted)' }, 'No backups yet.')); return; }
  for (const b of list) {
    box.append(h('div', { style: 'padding:7px 10px;border-top:1px solid var(--border)' },
      h('div', { style: 'font-size:12.5px' }, (b.at ? b.at.toLocaleString() : b.name), h('span', { style: 'color:var(--muted)' }, '  · ' + b.kind)),
      h('div', { style: 'display:flex;gap:6px;margin-top:5px' }, h('button', { class: 'btn', onclick: () => restore(b) }, 'Restore'), h('button', { class: 'btn', onclick: () => exportCopy(b) }, 'Export'),
        h('button', { class: 'btn', onclick: async () => { if (await vx.ui.confirm(`Delete backup “${b.name}”?`, 'Delete')) { try { await vx.fs.remove(`${DIR}/${b.name}`); } catch (e) { vx.ui.toast('Could not delete: ' + (e.message || e), 'error'); } renderList(); } } }, 'Delete'))));
  }
}
vx.panels.register({ id: 'list', title: 'Backups', icon: 'save', render(el) { panelBox = el; fill(el); } });
vx.commands.register({ id: 'now', title: 'Backup: Back up now', run: () => backup('manual') });
vx.commands.register({ id: 'show', title: 'Backup: Show backups', run: () => vx.ui.toast('Open the Backups panel in the activity bar') });

function schedule() { clearInterval(timer); const c = cfg(); if (c.every > 0 && root()) timer = setInterval(() => { if (root()) backup('auto', true); }, Math.max(1, c.every) * 60000); }
vx.config.register({ title: 'Project Backup – settings', intro: 'Backups are ZIP files saved in the “_backups” folder of the open folder.', fields: [
  { key: 'every', label: 'Back up every … minutes (0 = off)', type: 'number', value: 0 },
  { key: 'keep', label: 'Keep the newest … automatic backups', type: 'number', value: 10 },
  { key: 'maxMb', label: 'Largest single file to include (MB)', type: 'number', value: 50 },
], save(v) { for (const k of ['every', 'keep', 'maxMb']) vx.settings.set(k, num(v[k], 0)); schedule(); }, load: () => ({ every: cfg().every, keep: cfg().keep, maxMb: cfg().maxMb }) });
schedule();
vx.onUnload(() => clearInterval(timer));
