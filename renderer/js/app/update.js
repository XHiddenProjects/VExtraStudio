/* Vextra Studio – update indicator. Reads the VERSION file of the GitHub repo and compares it with this build.
 * VX.update.check({force}) -> { state: 'new'|'current'|'ahead'|'error', latest, current } */
(function () {
  const REPO = 'XHiddenProjects/VExtraStudio', BRANCHES = ['master', 'main'];
  const RAW = (b) => `https://raw.githubusercontent.com/${REPO}/${b}/VERSION`;
  const PAGE = `https://github.com/${REPO}`;
  const parse = (v) => { const m = /^\s*v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(v)); return m ? { n: [+m[1], +m[2], +m[3]], pre: m[4] || '' } : null; };
  /** -1 | 0 | 1 : a compared with b (a pre-release sorts before its release). */
  const cmp = (a, b) => { const x = parse(a), y = parse(b); if (!x || !y) return 0; for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] < y.n[i] ? -1 : 1; return x.pre === y.pre ? 0 : !x.pre ? 1 : !y.pre ? -1 : x.pre < y.pre ? -1 : 1; };
  const U = (VX.update = { repo: PAGE, cmp, parse, last: null, busy: false });

  async function fetchLatest() {
    let err = 'unreachable';
    for (const b of BRANCHES) {
      try { const r = await window.native.http({ method: 'GET', url: RAW(b), headers: { 'Cache-Control': 'no-cache' } }); if (r.status === 200 && parse(r.body)) return String(r.body).trim().split(/\s/)[0].replace(/^v/, ''); err = r.status === 404 ? 'no VERSION file found in the repository' : 'HTTP ' + r.status; } catch (e) { err = e.message || String(e); }
    }
    throw new Error(err);
  }
  U.check = async function (opts) {
    opts = opts || {}; if (U.busy) return U.last; U.busy = true; VX.emit('update');
    try {
      const cur = VX.app.version, latest = await fetchLatest(), c = cmp(latest, cur);
      U.last = { state: c > 0 ? 'new' : c < 0 ? 'ahead' : 'current', latest, current: cur, at: Date.now() };
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
  U.dialog = function () {
    const l = U.last, h = VX.h;
    const body = h('div', {}, h('p', {}, U.message()), l && l.state === 'new' ? h('p', { style: 'color:var(--muted);font-size:12.5px' }, 'Download the latest source from the project page, then run ', h('code', {}, 'npm install'), ' and rebuild. Your projects and settings are kept.') : null);
    const acts = [h('button', { class: 'btn', onclick: () => m.close() }, 'Close')];
    if (l && l.state === 'new') acts.unshift(h('button', { class: 'btn', onclick: () => { VX.app.settings.skipVersion = l.latest; VX.app.saveSettings(); VX.emit('update'); m.close(); } }, 'Skip this version'));
    acts.push(h('button', { class: 'btn', onclick: () => U.check({}).then(() => { m.close(); U.dialog(); }) }, 'Check again'), h('button', { class: 'btn primary', onclick: U.openPage }, 'Open GitHub'));
    const m = VX.ui.modal({ title: 'Updates', size: 'small', body, actions: acts });
  };
  U.start = function () { const s = VX.app.settings; if (s.updateCheck === false) return; setTimeout(() => U.check({}), 2500); };
})();
