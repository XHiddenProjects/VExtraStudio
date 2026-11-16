/* Vextra Studio – update indicator. Reads the VERSION file of the GitHub repo and compares it with this build.
 * VX.update.check({force}) -> { state: 'new'|'current'|'ahead'|'error', latest, current } */
(function () {
  const REPO = 'XHiddenProjects/VExtraStudio', BRANCHES = ['master', 'main'];
  const RAW = (b) => `https://raw.githubusercontent.com/${REPO}/${b}/VERSION`;
  const PAGE = `https://github.com/${REPO}`;
  const parse = (v) => { const m = /^\s*v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(v)); return m ? { n: [+m[1], +m[2], +m[3]], pre: m[4] || '' } : null; };
  /** -1 | 0 | 1 : a compared with b (a pre-release sorts before its release). */
  const cmp = (a, b) => { const x = parse(a), y = parse(b); if (!x || !y) return 0; for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] < y.n[i] ? -1 : 1; return x.pre === y.pre ? 0 : !x.pre ? 1 : !y.pre ? -1 : x.pre < y.pre ? -1 : 1; };
  const U = (VX.update = { repo: PAGE, cmp, parse, last: null, busy: false, canInstall: false, installing: false });

  async function fetchLatest() {
    let err = 'unreachable';
    for (const b of BRANCHES) {
      try { const r = await window.native.http({ method: 'GET', url: RAW(b) }); if (r.status === 200 && parse(r.body)) return String(r.body).trim().split(/\s/)[0].replace(/^v/, ''); err = r.status === 404 ? 'no VERSION file found in the repository' : 'HTTP ' + r.status; } catch (e) { err = e.message || String(e); }
    }
    throw new Error(err);
  }
  U.check = async function (opts) {
    opts = opts || {}; if (U.busy) return U.last; U.busy = true; VX.emit('update');
    try {
      const cur = VX.app.version; let nat = null;
      try { nat = await window.native.updater.check(); } catch (e) { nat = { enabled: false, error: e.message }; }
      if (nat && nat.enabled && !nat.reason) {         /* signed updater: GitHub releases + latest.json */
        U.canInstall = !!nat.available;
        U.last = { state: nat.available ? 'new' : 'current', latest: nat.available ? nat.version : cur, current: cur, notes: nat.notes || '', signed: true, at: Date.now() };
      } else {                          /* no updater key in this build / browser / the signed check failed: only compare the VERSION file */
        U.canInstall = false; const latest = await fetchLatest(), c = cmp(latest, cur);
        /* why the build cannot update itself: "no key" is only said when the key really is missing */
        const why = nat && nat.enabled ? nat.reason : nat && nat.error ? 'The updater could not run: ' + nat.error : nat && nat.reason ? nat.reason : '';
        U.last = { state: c > 0 ? 'new' : c < 0 ? 'ahead' : 'current', latest, current: cur, at: Date.now(), keyed: !!(nat && nat.enabled), why };
      }
      VX.app.settings.lastUpdateCheck = Date.now(); VX.app.settings.skipVersion = VX.app.settings.skipVersion || ''; VX.app.saveSettings();
    } catch (e) { U.last = { state: 'error', error: e.message, current: VX.app.version, at: Date.now() }; }
    U.busy = false; VX.emit('update'); if (opts.toast) VX.ui.toast(U.message(), U.last.state === 'error' ? 'error' : U.last.state === 'new' ? 'ok' : undefined);
    return U.last;
  };
  U.message = () => { const l = U.last; if (!l) return 'Not checked yet'; return l.state === 'new' ? `Update available: v${l.latest} (you have v${l.current})` : l.state === 'current' ? `You're up to date (v${l.current})` : l.state === 'ahead' ? `You're on a newer build (v${l.current}) than the published v${l.latest}` : 'Could not check for updates: ' + l.error; };
  /** Is there an update the user has not dismissed? */
  U.pending = () => U.last && U.last.state === 'new' && VX.app.settings.skipVersion !== U.last.latest;
  U.openPage = async () => {
    const url = PAGE; try { if (window.native.openExternal) await window.native.openExternal(url); else window.open(url, '_blank', 'noopener'); } catch (e) { VX.ui.toast('Could not open the browser: ' + e.message, 'error'); }
  };
  /** Downloads the signed update, verifies it and installs it. onProgress(done, total) is optional. */
  U.install = async function (onProgress) {
    if (!U.canInstall || U.installing) return false; U.installing = true; VX.emit('update'); let off = null;
    try {
      if (onProgress && window.native.updater.onProgress) off = await window.native.updater.onProgress((p) => onProgress(p.done, p.total));
      await window.native.updater.install();            /* Windows: the installer starts and the app closes itself */
      VX.ui.toast('Update installed – restarting…', 'ok'); setTimeout(() => window.native.updater.restart(), 600); return true;
    } catch (e) { VX.ui.toast('Update failed: ' + e.message, 'error'); return false; }
    finally { U.installing = false; if (off) off(); VX.emit('update'); }
  };
  U.dialog = function () {
    const l = U.last, h = VX.h;
    const prog = h('div', { style: 'display:none;margin-top:8px' }, h('div', { style: 'height:8px;border-radius:4px;background:var(--bg3);overflow:hidden' }, h('div', { class: 'upd-bar', style: 'height:100%;width:0;background:var(--accent)' })), h('div', { class: 'upd-txt', style: 'font-size:12px;color:var(--muted);margin-top:4px' }, 'Starting…'));
    const body = h('div', {}, h('p', {}, U.message()),
      l && l.state === 'new' && l.signed && l.notes ? h('pre', { style: 'max-height:160px;overflow:auto;white-space:pre-wrap;font-size:12px;background:var(--bg3);padding:8px;border-radius:6px' }, l.notes) : null,
      l && l.state === 'new' && U.canInstall ? h('p', { style: 'color:var(--muted);font-size:12.5px' }, 'The update is downloaded from GitHub and its signature is checked before anything is installed. Your projects and settings are kept.') : null,
      l && l.state === 'new' && !U.canInstall ? h('p', { style: 'color:var(--muted);font-size:12.5px' }, (l.keyed ? 'This build has an update key, but the automatic update could not run. ' + (l.why || '') : 'This build has no update key, so it cannot update itself.') + ' Download the latest installer from the Releases page of the project (or the source, then run ', h('code', {}, 'npm install'), ' and rebuild). Your projects and settings are kept.') : null, prog);
    const acts = [h('button', { class: 'btn', onclick: () => m.close() }, 'Close')];
    if (l && l.state === 'new') acts.unshift(h('button', { class: 'btn', onclick: () => { VX.app.settings.skipVersion = l.latest; VX.app.saveSettings(); VX.emit('update'); m.close(); } }, 'Skip this version'));
    acts.push(h('button', { class: 'btn', onclick: () => U.check({}).then(() => { m.close(); U.dialog(); }) }, 'Check again'));
    if (l && l.state === 'new' && U.canInstall) {
      const go = h('button', { class: 'btn primary', onclick: async () => { go.disabled = true; go.textContent = 'Installing…'; prog.style.display = 'block'; const bar = prog.querySelector('.upd-bar'), txt = prog.querySelector('.upd-txt');
        const ok = await U.install((d, t) => { bar.style.width = t ? Math.min(100, d / t * 100) + '%' : '60%'; txt.textContent = t ? `${(d / 1e6).toFixed(1)} / ${(t / 1e6).toFixed(1)} MB` : `${(d / 1e6).toFixed(1)} MB`; });
        if (!ok) { go.disabled = false; go.textContent = 'Install and restart'; prog.style.display = 'none'; } } }, 'Install and restart');
      acts.push(go);
    } else acts.push(h('button', { class: 'btn primary', onclick: U.openPage }, 'Open GitHub'));
    const m = VX.ui.modal({ title: 'Updates', size: 'small', body, actions: acts });
  };
  U.start = function () { const s = VX.app.settings; if (s.updateCheck === false) return; setTimeout(() => U.check({}), 2500); };
})();
