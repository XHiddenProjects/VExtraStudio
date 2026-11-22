/* Vextra game editor – Anti-cheat settings and reports (stored in project.settings.antiCheat; the runtime is js/game/rt-anticheat.js). */
(function () {
  const { h } = VX;
  const ACTIONS = [['log', 'Only record it'], ['warn', 'Warn the player'], ['pause', 'Pause with a message'], ['revert', 'Undo the value (limits only), else warn'], ['reset', 'Restart the game'], ['kick', 'Remove from the game'], ['ban', 'Ban this device']];
  const CHECKS = [['speed', 'Speed / time manipulation', 'Game time runs faster than the clock (speed-hack tools).'], ['rules', 'Variable limits (your rules below)', 'A variable goes outside the limits you set.'], ['tamper', 'Outside edits', 'A variable is changed by something that is not part of your game (console, injected script).'], ['input', 'Automated input', 'Script-generated key/mouse events, or impossibly many inputs per second.'], ['devtools', 'Developer tools open', 'A rough guess from the window size. Off by default – can misfire.'], ['integrity', 'Edited game file', 'The game data no longer matches what you exported.']];
  const A = (VX.anticheatUI = {});
  const defaults = () => (window.VXRT && VXRT.antiCheatDefaults ? VXRT.antiCheatDefaults() : { enabled: false, checks: {}, rules: [] });
  const rulesToText = (r) => (r || []).map((x) => [x.var, x.min ?? '', x.max ?? '', x.perSecond ?? ''].join(' | ')).join('\n');
  const textToRules = (t) => String(t || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((a) => a[0]).map((a) => ({ var: a[0], min: a[1] === '' || a[1] === undefined ? '' : +a[1], max: a[2] === '' || a[2] === undefined ? '' : +a[2], perSecond: a[3] === '' || a[3] === undefined ? '' : +a[3] }));
  const call = async (method, path, body) => { const r = await window.native.http({ method, url: VX.cloud.base() + '/api/anticheat' + path, headers: { 'Content-Type': 'application/json', 'X-Vextra-Admin': '1' }, body: body ? JSON.stringify(body) : undefined }); let j = {}; try { j = JSON.parse(r.body || '{}'); } catch { /* ignore */ } if (r.status >= 400) throw new Error(j.error || 'Server error ' + r.status); return j; };

  A.open = function (project, onSave) {
    const cur = Object.assign(defaults(), (project.settings || {}).antiCheat || {}); cur.checks = Object.assign({}, defaults().checks, cur.checks || {});
    const lab = (t, el, hint) => h('label', { class: 'sb-f', style: 'display:flex;flex-direction:column;gap:3px;margin:8px 0;font-size:13px' }, h('span', { style: 'color:var(--muted)' }, t), el, hint ? h('small', { style: 'color:var(--muted)' }, hint) : null);
    const txt = (v) => h('input', { type: 'text', value: v ?? '' }); const num = (v) => h('input', { type: 'number', value: v });
    const sel = (v) => { const s = h('select', {}, ACTIONS.map(([a, l]) => h('option', { value: a }, l))); s.value = v; return s; };
    const en = h('input', { type: 'checkbox' }); en.checked = !!cur.enabled; const rep = h('input', { type: 'checkbox' }); rep.checked = !!cur.report;
    const pass = h('input', { type: 'password', placeholder: cur.adminHash ? 'Set – type a new one to change it' : 'Choose a long passphrase', autocomplete: 'new-password' });
    const warn = txt(cur.warnText), kick = txt(cur.kickText), banT = txt(cur.banText), esc = num(cur.escalateAt), escA = sel(cur.escalateAction), banM = num(cur.banMinutes), cool = num(cur.cooldown), mips = num(cur.maxInputsPerSecond);
    const rules = h('textarea', { rows: 4, placeholder: 'score | 0 | 100000 | 500' }); rules.value = rulesToText(cur.rules);
    const checks = {}; const crow = CHECKS.map(([k, l, d]) => { const c = h('input', { type: 'checkbox' }); c.checked = !!(cur.checks[k] || {}).on; const a = sel((cur.checks[k] || {}).action || 'log'); checks[k] = { c, a }; return h('div', { style: 'display:grid;grid-template-columns:auto 1fr 190px;gap:8px;align-items:center;margin:6px 0' }, c, h('div', {}, h('b', {}, l), h('div', { style: 'color:var(--muted);font-size:12px' }, d)), a); });
    const settings = h('div', {}, h('p', { style: 'margin-top:0;color:var(--muted);font-size:13px' }, 'Decide which checks run and what happens to a player who trips one. You are never affected: playing from the editor is always exempt. Honest note: a game runs on the player’s device, so this deters and records cheating but cannot make it impossible.'),
      h('label', { style: 'display:flex;gap:8px;align-items:center;font-weight:600' }, en, 'Turn anti-cheat on for the exported game'),
      h('h4', {}, 'Checks and what happens'), ...crow,
      lab('Your variable limits (one per line: variable | lowest | highest | most it may rise per second)', rules, 'Example: score | 0 | 100000 | 500 – leave a part empty to skip it.'),
      lab('Admin passphrase (exempts you in the exported game)', pass, 'Open your exported game once with #vx-admin=your-passphrase after the address; that browser is then never checked or banned.'),
      h('h4', {}, 'Strikes'), lab('After this many alerts do the escalation (0 = never)', esc), lab('Escalation', escA), lab('Ban length in minutes (0 = permanent)', banM), lab('Seconds between alerts of the same kind', cool), lab('Most inputs per second before “automated input”', mips),
      h('h4', {}, 'Messages the player sees'), lab('Warning', warn), lab('Removed from the game', kick), lab('Banned', banT),
      h('label', { style: 'display:flex;gap:8px;align-items:center;margin-top:10px' }, rep, 'Send reports to my Vextra server (needed for the Reports & bans tab and server-side bans)'));
    const reports = h('div', {}); let loaded = false;
    const loadReports = async () => {
      reports.textContent = 'Loading…'; try {
        const j = await call('GET', '/events?game=' + encodeURIComponent(project.settings.id || 'game')); reports.textContent = '';
        reports.append(h('p', { style: 'color:var(--muted);font-size:13px;margin-top:0' }, 'Reports sent by players’ devices to ' + VX.cloud.base() + ' (only this app can read them).'), h('h4', {}, 'Bans (' + j.bans.length + ')'), ...(j.bans.length ? j.bans.map((b) => h('div', { class: 'srow' }, h('span', {}, b.player + (b.until ? ' – until ' + new Date(b.until).toLocaleString() : ' – permanent')), h('button', { class: 'btn sm', onclick: async () => { await call('POST', '/unban', { game: b.game, player: b.player }); loadReports(); } }, 'Unban'))) : [h('p', { style: 'color:var(--muted)' }, 'No bans.')]), h('h4', {}, 'Events (' + j.events.length + ')'),
          ...(j.events.length ? j.events.slice(0, 80).map((e) => h('div', { class: 'srow', style: 'align-items:flex-start' }, h('span', {}, new Date(e.at).toLocaleString() + ' · ', h('b', {}, e.check), ' · ' + e.detail + ' · ' + e.action + ' · player ' + e.player.slice(0, 8)), h('button', { class: 'btn sm', onclick: async () => { const m = await VX.ui.ask('Ban this player for how many minutes? (0 = permanent)', '0'); if (m === null || m === undefined) return; await call('POST', '/ban', { game: e.game, player: e.player, minutes: +m || 0 }); loadReports(); } }, 'Ban'))) : [h('p', { style: 'color:var(--muted)' }, 'Nothing reported yet.')]));
      } catch (e) { reports.textContent = ''; reports.append(h('p', { class: 'form-error' }, e.message + ' – start the local server (Settings → Cloud, sharing & publishing).')); }
    };
    const tabs = h('div', { class: 'sb-tabs', style: 'display:flex;gap:6px;margin-bottom:10px' }); const pane = h('div', {});
    const show = (which) => { pane.textContent = ''; pane.append(which === 'r' ? reports : settings); for (const b of tabs.children) b.classList.toggle('primary', b.dataset.t === which); if (which === 'r' && !loaded) { loaded = true; loadReports(); } };
    tabs.append(h('button', { class: 'btn sm', 'data-t': 's', onclick: () => show('s') }, 'Settings'), h('button', { class: 'btn sm', 'data-t': 'r', onclick: () => show('r') }, 'Reports & bans'));
    const m = VX.ui.modal({ title: '🛡 Anti-cheat', wide: true, body: h('div', {}, tabs, pane), actions: [h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => {
      const out = { enabled: en.checked, report: rep.checked, warnText: warn.value, kickText: kick.value, banText: banT.value, escalateAt: Math.max(0, +esc.value || 0), escalateAction: escA.value, banMinutes: Math.max(0, +banM.value || 0), cooldown: Math.max(1, +cool.value || 10), maxInputsPerSecond: Math.max(5, +mips.value || 30), adminHash: pass.value ? VXRT.adminProof(pass.value, project.settings.id || 'game') : cur.adminHash || '', rules: textToRules(rules.value), checks: {} };
      for (const [k] of CHECKS) out.checks[k] = { on: checks[k].c.checked, action: checks[k].a.value };
      project.settings.antiCheat = out; m.close(); VX.ui.toast(out.enabled ? 'Anti-cheat saved – it is part of the next export' : 'Anti-cheat saved (off)', 'ok'); onSave && onSave(out);
    } }, 'Save')] });
    show('s'); return m;
  };
})();
