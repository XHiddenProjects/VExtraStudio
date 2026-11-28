/* Vextra Studio – Integrations tab: install, configure and remove the optional helpers that live outside the app itself.
   · AI singer (SoulX-Singer): Python + PyTorch + models, set up by the desktop app on request (several GB).
   · Blender: find Blender, install / remove the Vextra add-on, optionally download a portable Blender, open it with the link switched on.
   Nothing here is installed together with the application: it only happens when you press a button on this tab, and Uninstall removes it again. */
(function () {
  const { h } = VX;
  const MB = (n) => (n >= 1024 ? (n / 1024).toFixed(1) + ' GB' : n + ' MB');
  const desktop = () => !!(window.native && window.native.isDesktop);
  const msgOf = (e) => String(e && e.message ? e.message : e || 'Something went wrong.');

  /** progress window for a long job. start(): promise; subscribe(cb): promise of an unsubscribe function; cancel(): optional */
  function progress(title, note, start, subscribe, cancel) {
    return new Promise((resolve) => {
      const bar = h('div', { style: 'height:10px;border-radius:6px;background:var(--border,#333);overflow:hidden;margin:10px 0' }, h('i', { style: 'display:block;height:100%;width:1%;background:var(--accent,#5b8cff);transition:width .3s' }));
      const msg = h('div', { style: 'min-height:2.6em;opacity:.85;word-break:break-word' }, 'Starting…');
      let off = null, m = null, fin = false;
      const done = (v) => { if (fin) return; fin = true; try { if (off) off(); } catch { /* ignore */ } resolve(v); };
      m = VX.ui.modal({ title, body: h('div', {}, msg, bar, h('div', { style: 'opacity:.65;font-size:12px' }, note)), actions: cancel ? [h('button', { class: 'btn', onclick: () => cancel() }, 'Cancel')] : [] });
      subscribe((p) => { if (!p) return; bar.firstChild.style.width = Math.max(1, Math.min(100, p.pct || 0)) + '%'; msg.textContent = String(p.msg || ''); }).then((u) => { off = u; }, () => { /* no live progress */ });
      start().then(() => { if (m) m.close(); done(true); }, (e) => {
        if (m) m.close(); const t = msgOf(e);
        if (t !== 'cancelled') VX.ui.modal({ title: 'That did not work', body: h('div', {}, h('p', {}, t), h('p', { style: 'opacity:.7' }, 'Nothing is lost: press the button again to resume. Common causes: no internet, a full disk, or a security program blocking the download.')) });
        done(false);
      });
    });
  }

  const card = (title, sub, ...kids) => h('div', { class: 'bl-card', style: 'margin:10px 6px;padding:10px 12px;display:flex;flex-direction:column;gap:8px' }, h('div', {}, h('b', {}, title), h('div', { class: 'as-hint' }, sub)), ...kids);
  const row = (...k) => h('div', { class: 'row g6 wrap', style: 'align-items:center' }, ...k.filter(Boolean));
  const btn = (label, fn, opt = {}) => h('button', { class: 'btn sm' + (opt.primary ? ' primary' : ''), title: opt.title || '', disabled: !!opt.disabled, onclick: fn }, label);

  /* ---------------- AI singer ---------------- */
  async function singerCard(redraw) {
    const AI = VX.aiSinger, N = desktop() && window.native.singer;
    let st = null; if (N) { try { st = await N.status(); } catch { st = null; } }
    const body = [];
    if (N && st && st.supported) {
      const state = st.installed ? (st.outdated ? 'Installed – a newer bridge will be applied on the next start' : 'Installed') : st.partial ? 'A half-finished install was found' : 'Not installed';
      body.push(h('div', {}, h('span', { style: 'font-weight:600' }, state), st.size_mb ? h('span', { class: 'as-hint' }, ' · ' + MB(st.size_mb) + ' in ' + st.dir) : null));
      body.push(row(
        !st.installed ? btn(st.partial ? 'Resume install' : 'Install…', async () => {
          if (!(await VX.ui.confirm('Install the AI singer? It downloads about 8 GB once (Python 3.10, PyTorch, the SoulX-Singer code and its models) into Vextra Studio\'s own data folder' + (st.gpu ? '.' : '. No NVIDIA graphics card was found, so it will run on the processor, which is slow (minutes per song).') + ' You can uninstall it here any time.', 'Install', { title: 'Install the AI singer?' }))) return;
          await AI.installWithUI(); redraw();
        }, { primary: true }) : btn('Reinstall / update', async () => { if (await VX.ui.confirm('Run the installer again to repair or update the singer? Finished steps are skipped.', 'Run')) { try { await N.remove(); } catch { /* ignore */ } await AI.installWithUI(); redraw(); } }),
        st.installed || st.partial ? btn('Uninstall', async () => {
          if (!(await VX.ui.confirm('Delete the AI singer (' + MB(st.size_mb) + ': Python, libraries, models and your own voices in its voices folder)? You can install it again later.', 'Delete it', { title: 'Uninstall the AI singer?', danger: true }))) return;
          try { await N.stop(); await N.remove(); VX.ui.toast('The AI singer was removed.', 'ok'); } catch (e) { VX.ui.toast(msgOf(e), 'error'); } redraw();
        }) : null,
        st.installed ? btn('Test it', async () => { try { const p = await N.start(); const i = await AI.health('http://127.0.0.1:' + p, 15000); VX.ui.toast('The singer answers (' + i.engine + ') on port ' + p + '.', 'ok'); } catch (e) { VX.ui.toast(msgOf(e), 'error'); } }) : null,
        st.installed ? btn('Voices folder', () => { window.native.reveal(st.dir + (st.dir.includes('\\') ? '\\voices' : '/voices')); }, { title: 'Drop NAME.wav + NAME.json pairs here to add singers' }) : null));
      /* configure */
      const dev = h('select', { style: 'max-width:100%' }, [['auto', 'Automatic (graphics card if there is one)'], ['cuda', 'Graphics card (NVIDIA)'], ['cpu', 'Processor (slow)']].map(([v, t]) => h('option', { value: v, selected: st.device === v }, t)));
      const port = h('input', { type: 'number', min: 1024, max: 65535, value: st.port, style: 'width:90px' });
      body.push(h('b', { style: 'font-size:12px' }, 'Configure'), row(h('label', { style: 'display:flex;flex-direction:column;gap:3px;width:100%' }, 'Run on', dev), h('label', {}, 'Port ', port), btn('Save', async () => { try { await N.setConfig(dev.value, parseInt(port.value, 10) || 8765); if (AI) AI.setUrl('http://127.0.0.1:' + (parseInt(port.value, 10) || 8765)); VX.ui.toast('Saved. The singer restarts the next time you use it.', 'ok'); } catch (e) { VX.ui.toast(msgOf(e), 'error'); } })));
      body.push(h('div', { class: 'as-hint' }, 'English lyrics for now. Extra voices: put NAME.wav and NAME.json (a short reference recording and its metadata, see the SoulX-Singer docs) in the voices folder.'));
    } else {
      body.push(h('div', { class: 'as-hint' }, desktop() ? 'This system cannot run the built-in singer.' : 'The one-click install belongs to the desktop app. In a browser, start the bridge yourself (tools/singing-bridge/bridge.py, or its --demo mode) and enter its address below.'));
    }
    if (AI) {
      const url = h('input', { type: 'text', value: AI.getUrl(), style: 'min-width:0;width:100%' });
      body.push(h('b', { style: 'font-size:12px' }, 'Singing bridge address'), row(url, btn('Save', () => { try { AI.setUrl(AI.cleanUrl(url.value)); VX.ui.toast('Saved.', 'ok'); } catch (e) { VX.ui.toast(msgOf(e), 'error'); } }), btn('Check', async () => { try { const i = await AI.health(url.value); VX.ui.toast('Connected: ' + i.engine, 'ok'); } catch (e) { VX.ui.toast(msgOf(e), 'error'); } })));
    }
    return card('🎤 AI singer – SoulX-Singer', 'Solo and choir vocals in the Music studio (🎤 AI singer…). Open-source model, runs on your computer; nothing is installed until you press Install.', ...body);
  }

  /* ---------------- Blender ---------------- */
  async function blenderCard(redraw) {
    const B = VX.blender, N = desktop() && window.native.blender;
    let st = null; if (N) { try { st = await N.status(); } catch { st = null; } }
    const body = [];
    if (N && st) {
      if (!st.found.length) body.push(h('div', { class: 'as-hint' }, 'No Blender was found on this computer.'));
      for (const f of st.found) {
        body.push(h('div', { style: 'border:1px solid var(--border,#333);border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px' },
          h('div', {}, h('b', {}, 'Blender ' + f.version), h('span', { class: 'as-hint' }, f.kind === 'managed' ? ' · downloaded by Vextra Studio' : ' · installed on this computer'), h('div', { class: 'as-hint', style: 'word-break:break-all' }, f.path)),
          row(f.addon ? h('span', { style: 'color:var(--ok,#4caf50)' }, '✔ Vextra add-on installed') : h('span', { class: 'as-hint' }, 'Vextra add-on not installed'),
            f.addon ? btn('Remove add-on', async () => { try { await N.removeAddon(f.path); VX.ui.toast('The add-on was removed from Blender ' + f.version + '.', 'ok'); } catch (e) { VX.ui.toast(msgOf(e), 'error'); } redraw(); })
              : btn('Install add-on', async () => { try { const d = await N.installAddon(f.path); VX.ui.toast('Add-on installed in ' + d, 'ok'); } catch (e) { VX.ui.toast(msgOf(e), 'error'); } redraw(); }, { primary: true }),
            btn('Open Blender', async () => { try { if (!f.addon) await N.installAddon(f.path); await N.launch(f.path); VX.ui.toast('Blender is starting with the Vextra add-on switched on. In its 3D view press N → Vextra → Start link.', 'ok'); } catch (e) { VX.ui.toast(msgOf(e), 'error'); } redraw(); }, { title: 'Installs the add-on if needed, starts Blender and switches the add-on on' }))));
      }
      body.push(row(
        st.managed_supported && !st.managed_installed ? btn('Download portable Blender (~350 MB)…', async () => {
          if (!(await VX.ui.confirm('Download Blender 4.2 LTS (about 350 MB) from download.blender.org into Vextra Studio\'s own data folder? It does not touch an existing Blender and is removed again with “Remove downloaded Blender”.', 'Download', { title: 'Download Blender?' }))) return;
          await progress('Downloading Blender', 'This happens once. Blender is free and open source (blender.org).', () => N.installPortable(), (cb) => N.onProgress(cb), () => N.cancel()); redraw();
        }, { primary: !st.found.length }) : null,
        st.managed_installed ? btn('Remove downloaded Blender', async () => { if (await VX.ui.confirm('Delete the Blender that Vextra Studio downloaded (' + MB(st.managed_size_mb) + ')? Your own Blender installs are not touched.', 'Delete it', { danger: true, title: 'Remove downloaded Blender?' })) { try { await N.removePortable(); VX.ui.toast('Removed.', 'ok'); } catch (e) { VX.ui.toast(msgOf(e), 'error'); } redraw(); } }) : null));
      if (!st.managed_supported && !st.found.length) body.push(h('div', { class: 'as-hint' }, 'Install Blender from blender.org first (a portable download is not offered on this system), then come back here.'));
    } else {
      body.push(h('div', { class: 'as-hint' }, 'The one-click add-on install belongs to the desktop app. In a browser: in Blender use Edit → Preferences → Add-ons → Install from Disk… and pick tools/blender-addon/vextra_tools.py.'));
    }
    if (B) {
      const port = h('input', { type: 'number', min: 1024, max: 65535, value: B.cfg.port, style: 'width:90px' }), key = h('input', { type: 'text', value: B.cfg.key || '', placeholder: 'pairing key from Blender', style: 'min-width:0;width:100%' });
      const auto = h('input', { type: 'checkbox', checked: B.cfg.auto !== false });
      const stat = h('span', { class: 'as-hint' }, B.state.connected ? '● connected' : '○ not connected');
      body.push(h('b', { style: 'font-size:12px' }, 'Configure the link'), row(h('label', {}, 'Port ', port), key, h('label', {}, auto, ' auto-update linked models')),
        row(btn('Save', () => { B.cfg.port = parseInt(port.value, 10) || 7788; B.cfg.key = key.value.trim(); B.cfg.auto = auto.checked; B.saveCfg(); VX.ui.toast('Saved.', 'ok'); }), btn('Test connection', async () => { B.cfg.port = parseInt(port.value, 10) || 7788; B.cfg.key = key.value.trim(); B.saveCfg(); const i = await B.ping(); stat.textContent = B.state.connected ? '● connected to Blender ' + ((i && i.version) || '') : '○ ' + (B.state.error || 'not connected'); }), stat),
        h('div', { class: 'as-hint' }, 'The link only works on this computer (127.0.0.1) and every request needs the key. Pull and push models in Assets → 3D Models → 🟠 Blender.'));
    }
    return card('🟠 Blender', 'Live link with Blender and one-click .glb export. The add-on is only installed when you press the button, and can be removed again here.', ...body);
  }

  async function renderPanel(c) {
    c.textContent = '';
    const host = h('div', {}, h('div', { class: 'as-hint', style: 'padding:8px' }, 'Loading…'));
    c.append(h('div', { class: 'as-hint', style: 'padding:8px 12px;font-size:12px' }, 'Optional helpers. Nothing here is installed with the application – use Install on a card, and Uninstall removes it again.'), host);
    const draw = async () => { const kids = [await singerCard(draw), await blenderCard(draw)]; host.textContent = ''; host.append(...kids); };
    draw();
  }
  VX.integrations = { renderPanel, progress };
})();
