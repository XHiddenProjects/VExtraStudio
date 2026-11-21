/* Vextra Studio – PHP settings: edit the project's PHP configuration and apply a recommended, secure setup.
 * The settings live in <project>/.vextra/php.ini. When you press Run PHP they are handed to PHP's built-in server one by one (php -d name=value)
 * on top of the normal php.ini, so your installed extensions keep working. You can also point the editor at any other php.ini file. */
(function () {
  const { h } = VX;
  const S = VX.app.S;
  const Web = VX.web;

  /** every setting the editor knows. rec = recommended value, dev = value for the development profile (when different), why = plain-language reason. */
  const DIRS = [
    { g: 'Errors', k: 'display_errors', rec: 'Off', dev: 'On', bool: true, why: 'Error messages show file paths, queries and sometimes passwords. Hide them from visitors (they stay in the log).' },
    { g: 'Errors', k: 'display_startup_errors', rec: 'Off', dev: 'On', bool: true, why: 'Same as above, for errors while PHP starts.' },
    { g: 'Errors', k: 'log_errors', rec: 'On', bool: true, why: 'Keep a record of errors so you can still find them.' },
    { g: 'Errors', k: 'html_errors', rec: 'Off', bool: true, why: 'Plain-text errors cannot be used to inject markup.' },
    { g: 'Errors', k: 'error_reporting', rec: 'E_ALL', why: 'Report every problem, including notices and deprecations.' },
    { g: 'Exposure', k: 'expose_php', rec: 'Off', bool: true, why: 'Stops PHP from announcing its version in every response.' },
    { g: 'Exposure', k: 'allow_url_include', rec: 'Off', bool: true, why: 'include/require of a web address lets an attacker run their own code.' },
    { g: 'Exposure', k: 'allow_url_fopen', rec: 'Off', bool: true, why: 'Blocks file functions from fetching web addresses (use cURL or fetch when you need to). Turn on if your site reads remote files.' },
    { g: 'Exposure', k: 'disable_functions', rec: 'exec,passthru,shell_exec,system,proc_open,popen,pcntl_exec,show_source', why: 'Functions that run programs on the server. Websites rarely need them.' },
    { g: 'Exposure', k: 'zend.assertions', rec: '-1', why: 'Assertions are for development; switch them off.' },
    { g: 'Sessions', k: 'session.use_strict_mode', rec: '1', bool: true, why: 'Refuses session ids the server did not create (stops session fixation).' },
    { g: 'Sessions', k: 'session.use_only_cookies', rec: '1', bool: true, why: 'Never accept a session id from the web address.' },
    { g: 'Sessions', k: 'session.use_trans_sid', rec: '0', bool: true, why: 'Do not put session ids in links.' },
    { g: 'Sessions', k: 'session.cookie_httponly', rec: '1', bool: true, why: 'JavaScript cannot read the session cookie.' },
    { g: 'Sessions', k: 'session.cookie_samesite', rec: 'Lax', why: 'The browser does not send the cookie along with other sites’ requests.' },
    { g: 'Limits', k: 'file_uploads', rec: 'On', bool: true, why: 'Leave on if your site has upload forms, otherwise Off.' },
    { g: 'Limits', k: 'upload_max_filesize', rec: '8M', why: 'Largest single upload.' },
    { g: 'Limits', k: 'post_max_size', rec: '10M', why: 'Largest form submission (must be at least the upload size).' },
    { g: 'Limits', k: 'max_file_uploads', rec: '10', why: 'Files per request.' },
    { g: 'Limits', k: 'memory_limit', rec: '128M', why: 'Memory one request may use.' },
    { g: 'Limits', k: 'max_execution_time', rec: '30', why: 'Seconds one request may run.' },
    { g: 'Limits', k: 'max_input_time', rec: '60', why: 'Seconds PHP may spend reading the request.' },
    { g: 'Limits', k: 'default_charset', rec: 'UTF-8', why: 'One character set everywhere.' },
    { g: 'Optional', k: 'open_basedir', rec: '', optional: true, why: 'Locks PHP into the project folder (and the folders you list, separated by ; on Windows or : elsewhere). Add the temp folder if you use sessions or uploads. Not applied automatically.' },
    { g: 'Optional', k: 'date.timezone', rec: '', optional: true, why: 'Your time zone, e.g. Europe/Berlin. Not applied automatically.' },
  ];
  Web.phpDirectives = DIRS;

  const norm = (v) => String(v ?? '').trim().replace(/^["']|["']$/g, '');
  const truthy = (v) => /^(on|1|true|yes)$/i.test(norm(v)); const falsy = (v) => /^(off|0|false|no|none|)$/i.test(norm(v));
  const same = (d, a, b) => (d.bool ? truthy(a) === truthy(b) : norm(a).toLowerCase().replace(/\s+/g, '') === norm(b).toLowerCase().replace(/\s+/g, ''));

  /** parse ini text → { key: { value, line } } (last uncommented assignment wins) */
  Web.phpIniParse = (text) => { const m = {}; String(text).split(/\r?\n/).forEach((l, i) => { const x = /^\s*([A-Za-z0-9_.]+)\s*=\s*("[^"]*"|'[^']*'|[^;]*?)\s*(?:;.*)?$/.exec(l); if (x && !/^\s*[;#]/.test(l)) m[x[1]] = { value: x[2], line: i }; }); return m; };
  /** set (or add) one directive, keeping every other line as it is */
  Web.phpIniSet = (text, key, value) => {
    const lines = String(text).split(/\r?\n/); const val = /[\s;=]/.test(value) && !/^["']/.test(value) ? '"' + value.replace(/"/g, '\\"') + '"' : value; const cur = Web.phpIniParse(text)[key];
    if (cur) lines[cur.line] = `${key} = ${val}`; else { while (lines.length && lines[lines.length - 1] === '') lines.pop(); lines.push(`${key} = ${val}`); }
    return lines.join('\n') + '\n';
  };
  /** the settings as php -d arguments (extensions are never overridden here) */
  Web.phpIniDefines = (text) => Object.entries(Web.phpIniParse(text)).filter(([k, v]) => !/^(extension|zend_extension)$/i.test(k) && v.value !== '').map(([k, v]) => `${k}=${norm(v.value)}`);
  Web.phpIniTemplate = (profile) => ['; Vextra Studio – PHP settings for this project', '; Applied when you press Run PHP (they are added on top of your installed php.ini).', '; Open Settings ▸ PHP settings to change them with explanations.', ''].join('\n') + (profile ? '' : '');
  Web.phpRecommended = (profile) => DIRS.filter((d) => !d.optional).map((d) => [d.k, profile === 'dev' && d.dev !== undefined ? d.dev : d.rec]);
  Web.phpConfigPath = () => (S.root ? VX.path.join(VX.path.join(S.root, '.vextra'), 'php.ini') : null);
  Web.phpDefines = async () => { const p = Web.phpConfigPath(); try { if (p && (await window.native.exists(p))) return Web.phpIniDefines(await window.native.readFile(p)); } catch { /* none */ } return []; };

  /** Settings ▸ PHP: the editor window */
  Web.openPhpSettings = async function (onApplied) {
    if (!S.root) return VX.ui.toast('Open a project folder first.', 'warn');
    let path = Web.phpConfigPath(), text = ''; let profile = 'prod';
    const load = async () => { try { text = (await window.native.exists(path)) ? await window.native.readFile(path) : Web.phpIniTemplate(); } catch { text = Web.phpIniTemplate(); } };
    await load(); let dirty = false;
    const body = h('div', { class: 'phpcfg' }), summary = h('div', { class: 'phpcfg-sum' });
    const file = h('span', { class: 'tag', title: path }, '');
    const draw = () => {
      const cur = Web.phpIniParse(text); const bad = DIRS.filter((d) => !d.optional && !same(d, (cur[d.k] || {}).value, profile === 'dev' && d.dev !== undefined ? d.dev : d.rec));
      file.textContent = VX.path.base(path) + (dirty ? ' • unsaved' : ''); summary.className = 'phpcfg-sum ' + (bad.length ? 'warn' : 'ok');
      summary.textContent = bad.length ? `${bad.length} setting${bad.length === 1 ? ' does' : 's do'} not match the recommended ${profile === 'dev' ? 'development' : 'secure'} setup.` : 'Everything matches the recommended setup.';
      body.textContent = ''; let grp = '';
      for (const d of DIRS) {
        if (d.g !== grp) { grp = d.g; body.append(h('div', { class: 'phpcfg-g' }, grp)); }
        const want = profile === 'dev' && d.dev !== undefined ? d.dev : d.rec; const has = cur[d.k]; const ok = d.optional ? true : same(d, has && has.value, want);
        const inp = d.bool ? h('select', {}, ['On', 'Off', ''].map((o) => h('option', { value: o, selected: has ? (o === '' ? false : truthy(has.value) === (o === 'On')) && o !== '' : o === '' }, o === '' ? '(PHP default)' : o))) : h('input', { value: has ? norm(has.value) : '', placeholder: d.optional ? '(not set)' : '(PHP default)', spellcheck: false });
        inp.onchange = () => { const v = inp.value.trim(); if (v === '') { text = text.split(/\r?\n/).filter((_, i) => !(cur[d.k] && cur[d.k].line === i)).join('\n'); } else text = Web.phpIniSet(text, d.k, v); dirty = true; draw(); };
        body.append(h('div', { class: 'phpcfg-row ' + (d.optional ? 'opt' : ok ? 'ok' : 'bad') }, h('span', { class: 'st', title: d.optional ? 'optional' : ok ? 'matches' : 'differs from the recommendation' }, d.optional ? '○' : ok ? '✔' : '⚠'), h('code', { class: 'k' }, d.k), inp,
          !d.optional && !ok ? h('button', { class: 'btn sm', title: 'Set to ' + (want || '(empty)'), onclick: () => { text = Web.phpIniSet(text, d.k, want); dirty = true; draw(); } }, 'Use ' + want.slice(0, 24) + (want.length > 24 ? '…' : '')) : h('span', {}), h('div', { class: 'why' }, d.why)));
      }
    };
    const apply = () => { for (const [k, v] of Web.phpRecommended(profile)) text = Web.phpIniSet(text, k, v); dirty = true; draw(); };
    const save = async () => { await window.native.create(S.root, '.vextra', true).catch(() => {}); await window.native.writeFile(path, text); dirty = false; draw(); VX.ui.toast('PHP settings saved' + (onApplied ? ' – restarting PHP' : ' – they apply the next time you press Run PHP')); if (onApplied) onApplied(); };
    const pick = async () => { try { const p = (await window.native.openFile())[0]; if (!p) return; if (dirty && !(await VX.ui.confirm('Discard unsaved changes?'))) return; path = p; await load(); dirty = false; draw(); VX.ui.toast('Editing ' + p + ' – saving changes that file directly. Restart PHP/Apache for it to take effect.'); } catch (e) { VX.ui.toast(e.message || String(e), 'error'); } };
    const prof = h('select', {}, h('option', { value: 'prod' }, 'Secure (production)'), h('option', { value: 'dev' }, 'Development (show errors)')); prof.onchange = () => { profile = prof.value; draw(); };
    const raw = h('button', { class: 'btn sm', onclick: async () => { if (dirty) await save(); m.close(); VX.tabs.open({ path }); } }, 'Open as text');
    const content = h('div', {}, h('div', { class: 'phpcfg-bar' }, h('label', {}, 'Profile ', prof), h('button', { class: 'btn sm primary', title: 'Sets every recommended value below', onclick: apply }, '🛡 Apply recommended setup'), h('button', { class: 'btn sm', title: 'Edit a php.ini somewhere else on this computer', onclick: pick }, 'Choose another php.ini…'), raw, h('span', { class: 'spacer' }), file), summary, body);
    const saveBtn = h('button', { class: 'btn primary', onclick: () => save().catch((e) => VX.ui.toast(e.message || String(e), 'error')) }, 'Save');
    const m = VX.ui.modal({ title: 'PHP settings', wide: true, body: content, actions: [saveBtn] }); draw();
  };
})();
