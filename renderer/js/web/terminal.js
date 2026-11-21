/* Vextra Studio – Terminal (bottom panel). Type a command and run it in the project folder: npm install, npm run dev, node, git …
 * Desktop app only. It is an ordinary shell, like the terminal in any editor, so the first use asks you to confirm. Only the person typing can run commands:
 * plugins and previews have no access to it. Each command runs on its own (cd works, but variables do not carry over to the next command). */
(function () {
  const { h } = VX;
  const S = VX.app.S;
  const T = (VX.terminal = {});
  let el = null, out, input, prompt, stopBtn, shellSel, cwd = '', running = null, hist = [], hi = 0, shells = [{ id: 'default', label: 'Default', available: true }];
  try { hist = JSON.parse(localStorage.getItem('vx-term-history') || '[]').slice(-100); } catch { hist = []; }
  const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;
  const native = () => window.native;

  function line(text, cls) {
    const row = h('div', { class: 'tl ' + (cls || '') });
    const parts = String(text).replace(ANSI, '').replace(/\r/g, '').split(/(https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?[^\s)'"]*)/);
    parts.forEach((p, i) => { if (i % 2) row.append(h('a', { href: '#', class: 'tlink', title: 'Open in your browser', onclick: (e) => { e.preventDefault(); native().openExternal(p); } }, p)); else if (p) row.append(p); });
    if (!row.firstChild) row.append(' ');
    out.append(row); while (out.childElementCount > 3000) out.firstChild.remove(); out.scrollTop = out.scrollHeight;
  }
  const where = () => cwd || S.root || '';
  /* which shell runs the commands: default, cmd, PowerShell, bash … or a program of your own */
  const shellId = () => (VX.app.settings && VX.app.settings.terminalShell) || 'default';
  const customShell = () => { const c = VX.app.settings && VX.app.settings.terminalCustom; return c && c.program ? { program: String(c.program), args: Array.isArray(c.args) ? c.args : ['{cmd}'] } : null; };
  const shellName = () => { const id = shellId(); if (id === 'custom') { const c = customShell(); return c ? VX.path.base(c.program).replace(/\.exe$/i, '') : 'custom'; } return (shells.find((x) => x.id === id) || { label: id }).label.replace(/\s*\(.*\)$/, ''); };
  async function loadShells() { try { const l = await native().term.shells(); if (Array.isArray(l) && l.length) shells = l; } catch { /* keep the default */ } drawShells(); }
  function drawShells() {
    if (!shellSel) return; shellSel.textContent = ''; const cur = shellId();
    for (const sh of shells) shellSel.append(h('option', { value: sh.id, disabled: !sh.available && sh.id !== cur }, sh.label + (sh.available ? '' : ' (not found)')));
    const c = customShell(); shellSel.append(h('option', { value: 'custom' }, c ? 'Custom: ' + VX.path.base(c.program) : 'Custom…'), h('option', { value: '__edit', hidden: !c }, 'Edit custom terminal…'));
    shellSel.value = cur === 'custom' && !c ? 'default' : cur;
  }
  async function editCustom() {
    const c = customShell() || { program: '', args: ['{cmd}'] };
    const v = await VX.ui.form({ title: 'Custom terminal', fields: [
      { key: 'program', label: 'Program', value: c.program, placeholder: 'C:\\Program Files\\Git\\bin\\bash.exe  or  /usr/bin/fish', hint: 'The full path of the shell or terminal program.' },
      { key: 'args', label: 'Arguments (one per line)', type: 'textarea', value: c.args.join('\n'), hint: 'Use {cmd} where the command you type should go. Examples:  -c  then {cmd}   (bash, zsh, fish)  ·  /C  then {cmd}   (cmd)  ·  -Command  then {cmd}   (PowerShell).' },
    ], submit: 'Use this terminal' });
    if (!v) return false;
    const program = String(v.program || '').trim(); if (!program) { VX.ui.toast('Enter the program to run.', 'error'); return false; }
    const args = String(v.args || '{cmd}').split(/\r?\n/).map((x) => x.trim()).filter(Boolean); if (!args.length) args.push('{cmd}');
    VX.app.set('terminalCustom', { program, args }); VX.app.set('terminalShell', 'custom'); drawShells(); setPrompt(); return true;
  }
  const setPrompt = () => { const w = where(); prompt.textContent = (w ? VX.path.base(w) || w : 'no folder') + ' ›'; prompt.title = w + ' · ' + shellName(); };

  async function consent() {
    const st = VX.app.settings; if (st.terminalOk) return true;
    const ok = await VX.ui.confirm('The terminal runs the commands you type on this computer, with your user permissions – exactly like a normal terminal. Only run commands you understand and trust. Turn it on?', 'Turn on the terminal');
    if (ok) VX.app.set('terminalOk', true); return ok;
  }

  async function runLine(text) {
    text = text.trim(); if (!text) return;
    if (hist[hist.length - 1] !== text) { hist.push(text); hist = hist.slice(-100); try { localStorage.setItem('vx-term-history', JSON.stringify(hist)); } catch { /* ignore */ } } hi = hist.length;
    if (running) { line('› ' + text, 'in'); try { await native().term.write(running.id, text + '\n'); } catch (e) { line(e.message || String(e), 'err'); } return; }
    line(where() + ' [' + shellName() + '] › ' + text, 'cmd');
    const m = /^(cd|chdir)(?:\s+(.*))?$/i.exec(text);
    if (/^(clear|cls)$/i.test(text)) { out.textContent = ''; return; }
    if (/^help$/i.test(text)) { for (const l of ['Run any command in this folder, for example:', '  npm install        npm run dev        node -v        git status', 'cd <folder> changes the folder · clear empties this panel · ↑ ↓ repeat earlier commands', 'While a command runs: Ctrl+C stops it, and anything you type is sent to it (for questions like “Package name:”).']) line(l, 'dim'); return; }
    if (m) {
      const target = (m[2] || '').trim().replace(/^["']|["']$/g, ''); if (!target) { line(where(), 'dim'); return; }
      const base = where(); const next = /^([A-Za-z]:[\\/]|\/|~)/.test(target) ? target : VX.path.join(base, target); const norm = next.replace(/\\/g, '/').split('/').reduce((a, p) => { if (p === '..') a.pop(); else if (p && p !== '.') a.push(p); return a; }, []);
      const abs = (/^[A-Za-z]:/.test(next) ? '' : '/') + norm.join('/'); try { if (!(await native().exists(abs))) throw new Error('missing'); await native().readDir(abs); cwd = abs; setPrompt(); } catch { line('The folder does not exist: ' + target, 'err'); } return;
    }
    if (!native().term || !(await consent())) return;
    if (!where()) { line('Open a folder first (File ▸ Open Folder).', 'err'); return; }
    let id; try { id = await native().term.start(where(), text, shellId(), shellId() === 'custom' ? customShell() : null); } catch (e) { line(e.message || String(e), 'err'); return; }
    running = { id }; stopBtn.disabled = false; input.placeholder = 'Type here to answer the running command…';
    const t0 = Date.now();
    const tick = async () => {
      if (!running || running.id !== id) return;
      try { const r = await native().runPoll(id); for (const l of r.lines) line(l); if (r.done) { line(`[finished${r.code === null || r.code === undefined ? '' : ' · exit code ' + r.code} · ${((Date.now() - t0) / 1000).toFixed(1)} s]`, r.code ? 'err' : 'dim'); running = null; stopBtn.disabled = true; input.placeholder = 'Type a command – npm install, node -v, git status …'; VX.emit('fsChange'); return; } } catch (e) { line(e.message || String(e), 'err'); running = null; stopBtn.disabled = true; return; }
      setTimeout(tick, 120);
    };
    tick();
  }
  T.run = (cmd) => { T.show(); return runLine(cmd); };
  T.stop = async () => { if (!running) return; const id = running.id; try { await native().runCancel(id); line('^C', 'dim'); } catch (e) { line(e.message || String(e), 'err'); } };

  T.element = () => {
    if (el) { setPrompt(); setTimeout(() => { out.scrollTop = out.scrollHeight; }, 0); return el; }
    out = h('div', { class: 'term-out' }); input = h('input', { class: 'term-input', spellcheck: false, autocomplete: 'off', placeholder: 'Type a command – npm install, node -v, git status …' }); prompt = h('span', { class: 'term-prompt' }, '›');
    stopBtn = h('button', { class: 'btn sm danger', disabled: true, title: 'Stop the running command (Ctrl+C)', onclick: T.stop }, '■ Stop');
    shellSel = h('select', { class: 'term-shell', title: 'Which terminal runs your commands', onchange: async () => {
      const v = shellSel.value;
      if (v === '__edit' || (v === 'custom' && !customShell())) { const ok = await editCustom(); if (!ok) drawShells(); return; }
      VX.app.set('terminalShell', v); setPrompt(); line('Terminal: ' + shellName(), 'dim');
    } }); drawShells(); loadShells();
    const quick = (label, cmd) => h('button', { class: 'btn sm', title: cmd, onclick: () => T.run(cmd) }, label);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const v = input.value; input.value = ''; runLine(v); }
      else if (e.key === 'ArrowUp') { if (hi > 0) input.value = hist[--hi] || ''; e.preventDefault(); } else if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; e.preventDefault(); }
      else if (e.key === 'c' && e.ctrlKey && running && input.selectionStart === input.selectionEnd) { e.preventDefault(); T.stop(); }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); out.textContent = ''; }
    });
    el = h('div', { class: 'term' }, h('div', { class: 'term-bar' }, shellSel, quick('npm install', 'npm install'), quick('npm run dev', 'npm run dev'), quick('npm test', 'npm test'), quick('node -v', 'node -v'), h('span', { class: 'spacer' }), stopBtn, h('button', { class: 'btn sm', onclick: () => { out.textContent = ''; } }, 'Clear')), out, h('div', { class: 'term-row' }, prompt, input));
    el.addEventListener('mousedown', (e) => { if (!window.getSelection().toString() && e.target === out) setTimeout(() => input.focus(), 0); });
    line('Vextra terminal – commands run in your project folder. Type help for tips.', 'dim'); if (!native().term || !window.__TAURI_INTERNALS__ && !window.__TAURI__) line('The terminal needs the desktop app; in the browser version commands cannot run.', 'dim'); setPrompt(); return el;
  };
  T.show = () => { VX.bottom.show('terminal'); setTimeout(() => input && input.focus(), 30); };
  VX.on('root', () => { cwd = ''; if (el) setPrompt(); });
})();
