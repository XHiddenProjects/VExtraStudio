/* Vextra Studio – Terminal (bottom panel). Type a command and run it in the project folder: npm install, npm run dev, node, git …
 * Desktop app only. It is an ordinary shell, like the terminal in any editor, so the first use asks you to confirm. Only the person typing can run commands:
 * plugins and previews have no access to it. Each command runs on its own (cd works, but variables do not carry over to the next command). */
(function () {
  const { h } = VX;
  const S = VX.app.S;
  const T = (VX.terminal = {});
  let el = null, out, input, prompt, stopBtn, cwd = '', running = null, hist = [], hi = 0;
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
  const setPrompt = () => { const w = where(); prompt.textContent = (w ? VX.path.base(w) || w : 'no folder') + ' ›'; prompt.title = w; };

  async function consent() {
    const st = VX.app.settings; if (st.terminalOk) return true;
    const ok = await VX.ui.confirm('The terminal runs the commands you type on this computer, with your user permissions – exactly like a normal terminal. Only run commands you understand and trust. Turn it on?', 'Turn on the terminal');
    if (ok) VX.app.set('terminalOk', true); return ok;
  }

  async function runLine(text) {
    text = text.trim(); if (!text) return;
    if (hist[hist.length - 1] !== text) { hist.push(text); hist = hist.slice(-100); try { localStorage.setItem('vx-term-history', JSON.stringify(hist)); } catch { /* ignore */ } } hi = hist.length;
    if (running) { line('› ' + text, 'in'); try { await native().term.write(running.id, text + '\n'); } catch (e) { line(e.message || String(e), 'err'); } return; }
    line(where() + ' › ' + text, 'cmd');
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
    let id; try { id = await native().term.start(where(), text); } catch (e) { line(e.message || String(e), 'err'); return; }
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
    const quick = (label, cmd) => h('button', { class: 'btn sm', title: cmd, onclick: () => T.run(cmd) }, label);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const v = input.value; input.value = ''; runLine(v); }
      else if (e.key === 'ArrowUp') { if (hi > 0) input.value = hist[--hi] || ''; e.preventDefault(); } else if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; e.preventDefault(); }
      else if (e.key === 'c' && e.ctrlKey && running && input.selectionStart === input.selectionEnd) { e.preventDefault(); T.stop(); }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); out.textContent = ''; }
    });
    el = h('div', { class: 'term' }, h('div', { class: 'term-bar' }, quick('npm install', 'npm install'), quick('npm run dev', 'npm run dev'), quick('npm test', 'npm test'), quick('node -v', 'node -v'), h('span', { class: 'spacer' }), stopBtn, h('button', { class: 'btn sm', onclick: () => { out.textContent = ''; } }, 'Clear')), out, h('div', { class: 'term-row' }, prompt, input));
    el.addEventListener('mousedown', (e) => { if (!window.getSelection().toString() && e.target === out) setTimeout(() => input.focus(), 0); });
    line('Vextra terminal – commands run in your project folder. Type help for tips.', 'dim'); if (!native().term || !window.__TAURI_INTERNALS__ && !window.__TAURI__) line('The terminal needs the desktop app; in the browser version commands cannot run.', 'dim'); setPrompt(); return el;
  };
  T.show = () => { VX.bottom.show('terminal'); setTimeout(() => input && input.focus(), 30); };
  VX.on('root', () => { cwd = ''; if (el) setPrompt(); });
})();
