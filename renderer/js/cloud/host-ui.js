/* Vextra Studio – Settings → Hosting & collaboration.
   Talks to the local Vextra server (/api/host/*, answered only for this computer). Private is the default and the state after every restart. */
(function () {
  const { h } = VX;
  const H = (VX.hostUI = {});
  const err = (e) => VX.ui.toast(e.message || String(e), 'error');
  const copy = (t) => { try { navigator.clipboard.writeText(t); VX.ui.toast('Copied', 'ok'); } catch { /* clipboard blocked */ } };
  async function call(method, path, body) {
    const r = await window.native.http({ method, url: VX.cloud.base() + '/api/host' + path, headers: { 'Content-Type': 'application/json', 'X-Vextra-Admin': '1' }, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = r.body ? JSON.parse(r.body) : {}; } catch { j = { error: r.body }; }
    if (r.status === 404 && /Unknown hosting action/.test(j.error || '')) throw new Error('The Vextra server that is running is older than this app and does not know this action. Stop it (Settings → Local server → Stop, or end the "vextra-server" / node process in Task Manager) and start it again.');
    if (r.status >= 400) { const e = new Error(j.error || 'Server error ' + r.status); e.status = r.status; throw e; } return j;
  }
  const srow = (title, desc, ...ctl) => h('div', { class: 'srow' }, h('div', { class: 'l' }, h('b', {}, title), h('span', {}, desc)), h('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end' }, ...ctl));
  const when = (t) => new Date(t).toLocaleString();
  const span = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); if (m < 60) return m + ' min'; const hh = Math.floor(m / 60); if (hh < 48) return hh + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : ''); return Math.round(hh / 24) + ' days'; };
  const certText = (c) => { const left = c.notAfter - Date.now(); return (left <= 60000 ? 'EXPIRED – delete it and create a new one (if this keeps happening, the running server is older than the app: restart it). ' : `Created ${when(c.notBefore || Date.now())}, valid for ${span(c.notAfter - (c.notBefore || Date.now()))}, expires ${when(c.notAfter)} (${span(left)} left). `) + 'Deleted when you stop sharing. Fingerprint: ' + c.fingerprint; };

  /** Returns the settings section (it fills itself in). */
  H.section = function () {
    const sec = h('div', { class: 'settings-sec' }, h('h3', {}, 'Hosting & collaboration'));
    let s = null, tick = 0;
    const load = async () => { try { s = await call('GET', ''); } catch (e) { s = { offline: e.message }; } draw(); };
    const act = (fn) => async (ev) => { const b = ev && ev.currentTarget; if (b) b.disabled = true; try { s = await fn(); } catch (e) { err(e); try { s = await call('GET', ''); } catch { /* offline */ } } draw(); };
    const txt = (v, ph, w = 200, type = 'text') => h('input', { value: v || '', placeholder: ph || '', type, style: `width:${w}px` });
    function draw() {
      clearInterval(tick); sec.textContent = ''; sec.append(h('h3', {}, 'Hosting & collaboration'));
      if (!s) { sec.append(h('div', { class: 'srow' }, 'Loading …')); return; }
      if (s.offline) { sec.append(srow('Local server is not running', 'Hosting is controlled by the Vextra server on this computer. Start it under “Cloud, sharing & publishing” above, then reopen this page.', h('button', { class: 'btn sm', onclick: load }, 'Check again'))); return; }
      const c = s.config;
      if (s.version !== (VX.app.version) && !s.offline) sec.append(h('div', { class: 'form-error' }, `The running Vextra server is ${s.version ? 'version ' + s.version : 'an older version'}, the app is ${VX.app.version}. Restart the server (Settings → Local server) so every hosting feature works.`));
      if (s.on) {
        const left = h('span', {}, ''); const upd = () => { left.textContent = s.until ? ` · stops automatically at ${when(s.until)}` : ' · stays public until you stop it'; }; upd();
        sec.append(h('div', { class: 'card', style: 'border:1px solid var(--accent);margin:8px 0' }, h('h4', {}, h('span', { class: 'tag ok' }, 'PUBLIC'), ' ', s.mode === 'tunnel' ? 'Ghost address' : 'Direct port forward'), h('div', { class: 'url-box' }, h('input', { readonly: true, value: s.url, style: 'width:100%' }), h('button', { class: 'btn sm', onclick: () => copy(s.url) }, 'Copy')),
          h('p', { style: 'font-size:12px;color:var(--muted)' }, s.mode === 'tunnel' ? 'People who use this address never see your IP address. ' : 'Your public IP address is visible in this address. ', 'Share it together with the invite code. Visitors without an account cannot do anything else on this server.', left),
          s.upnp ? h('p', { style: 'font-size:12px;color:var(--muted)' }, s.upnp) : null,
          h('div', { style: 'display:flex;gap:6px;align-items:center' }, h('span', { style: 'font-size:12px' }, 'Invite code: '), h('code', {}, c.invite), h('button', { class: 'btn sm', onclick: () => copy(c.invite) }, 'Copy'), h('span', { class: 'spacer', style: 'flex:1' }), h('button', { class: 'btn sm danger', onclick: act(() => call('POST', '/stop', {})) }, 'Make private (stop sharing)'))));
        sec.append(srow('Settings are locked while public', 'Make the server private to change the port, domain, certificate or timer.'));
        tick = setInterval(() => { if (!sec.isConnected) clearInterval(tick); }, 5000); return;
      }
      sec.append(h('div', { class: 'srow' }, h('div', { class: 'l' }, h('b', {}, h('span', { class: 'tag' }, 'PRIVATE'), ' Only this computer can reach your server'), h('span', {}, 'Go public to let people outside your device sign in, join your projects and open your published sites.'))));
      if (s.error) sec.append(h('div', { class: 'form-error' }, s.error));
      const mode = c.mode === 'direct' ? 'direct' : 'tunnel';
      sec.append(srow('How to share', 'The ghost tunnel needs no router settings and hides your IP address. A direct port forward exposes your IP address.', VX.ui.segmented([['tunnel', '👻 Ghost tunnel (recommended)'], ['direct', 'Direct port forward']], mode, (v) => act(() => call('POST', '/config', { mode: v }))())));
      if (mode === 'tunnel') {
        if (!s.cloudflared.found) {
          sec.append(srow('Tunnel program', s.cloudflared.canDownload ? 'The tunnel uses Cloudflare’s free “cloudflared” program. It is not installed. Vextra can download it from GitHub (about 30 MB) and keep it inside its own data folder.' : 'Install “cloudflared” (macOS: brew install cloudflared), then reopen this page.',
            s.cloudflared.canDownload ? h('button', { class: 'btn sm', onclick: async (ev) => { if (!(await VX.ui.confirm('Download cloudflared from github.com/cloudflare/cloudflared and store it in Vextra’s data folder? Vextra only runs it while you share.', 'Download'))) return; await act(() => call('POST', '/cloudflared', {}))(ev); } }, 'Download') : null));
        }
        const host = txt(c.hostname, 'sub.yourdomain.com', 220), tok = txt('', c.hasToken ? '(saved – leave empty to keep)' : 'Cloudflare tunnel token', 220, 'password');
        sec.append(srow('Your own domain (optional)', 'Leave empty for a random address ending in .trycloudflare.com. For your own name, create a tunnel in your Cloudflare dashboard (Zero Trust → Networks → Tunnels), point it at http://localhost:' + (VX.cloud.base().split(':').pop() || '8787') + ', and paste its token and the domain here.', host, tok,
          h('button', { class: 'btn sm', onclick: act(() => call('POST', '/config', { hostname: host.value, token: tok.value || undefined })) }, 'Save'),
          c.hasToken ? h('button', { class: 'btn sm', onclick: act(() => call('POST', '/config', { token: '', hostname: '' })) }, 'Remove') : null));
      } else {
        const port = txt(String(c.directPort), '8788', 80, 'number'), https = h('input', { type: 'checkbox' }); https.checked = !!c.https;
        sec.append(srow('Public port', 'A second port that is opened to the network. Vextra asks your router to forward it (UPnP); if the router says no, forward this port to this computer yourself.', port, h('button', { class: 'btn sm', onclick: act(() => call('POST', '/config', { directPort: port.value })) }, 'Save')));
        const pubIn = txt(c.publicHost || '', 'detected automatically', 200, 'text');
        sec.append(srow('Your public address', 'Found automatically when you go public (a small request to a “what is my IP” service). Type your own IP or domain name here only if detection fails or you use a domain name that points to this computer.', pubIn, h('button', { class: 'btn sm', onclick: async (ev) => { ev.target.disabled = true; try { const r = await call('GET', '/ip'); pubIn.value = r.ip || ''; if (!r.ip) VX.ui.toast('Could not detect your public IP (no internet?).', 'warn'); else await call('POST', '/config', { publicHost: r.ip }); } catch (e) { VX.ui.toast(e.message, 'error'); } ev.target.disabled = false; } }, 'Detect now'), h('button', { class: 'btn sm', onclick: act(() => call('POST', '/config', { publicHost: pubIn.value })) }, 'Save')));
        sec.append(srow('Use HTTPS', s.cert.ready ? 'Encrypts the traffic with your own certificate. Visitors see a browser warning once because you made the certificate yourself.' : 'Create a certificate below first.', VX.ui.sw(!!c.https, (v) => act(() => call('POST', '/config', { https: v }))())));
      }
      sec.append(srow('Stop sharing automatically', 'A safety net so you do not leave your computer public by accident.', (() => { const sel = h('select', {}, ...[[1, '1 hour'], [4, '4 hours'], [8, '8 hours'], [24, '24 hours'], [0, 'Never']].map(([v, l]) => h('option', { value: v, selected: c.hours === v }, l))); sel.onchange = act(() => call('POST', '/config', { hours: sel.value })); return sel; })()));
      sec.append(srow('Invite code', 'Needed to create an account while the server is public. Change it whenever you like; existing accounts keep working.', h('code', {}, c.invite), h('button', { class: 'btn sm', onclick: () => copy(c.invite) }, 'Copy'), h('button', { class: 'btn sm', onclick: act(() => call('POST', '/config', { newInvite: true })) }, 'New code')));
      sec.append(srow('Security certificate', s.cert.ready ? certText(s.cert) : 'Create a self-made certificate for the direct port forward with HTTPS. The certificate lasts only as long as the sharing (it follows “Stop sharing automatically”) and is deleted the moment you stop sharing; going public with HTTPS makes a fresh one that includes your public IP. (The ghost tunnel already has HTTPS from Cloudflare.)', s.cert.ready ? h('button', { class: 'btn sm danger', onclick: async (ev) => { if (await VX.ui.confirm('Delete the security certificate? A new one is made automatically the next time you go public with HTTPS.', 'Delete')) await act(() => call('POST', '/cert/delete', {}))(ev); } }, 'Delete certificate') : null, h('button', { class: 'btn sm', onclick: act(() => call('POST', '/cert', {})) }, s.cert.ready ? 'Create a new one' : 'Create certificate')));
      sec.append(h('div', { class: 'srow' }, h('div', { class: 'l' }, h('b', {}, h('button', { class: 'btn primary', onclick: act(async () => { await call('POST', '/start', { mode }); return call('GET', ''); }) }, '🌐 Go public')), h('span', {}, 'Nothing is shared until you press this. After a restart of Vextra the server is private again.'))));
    }
    load(); return sec;
  };
})();
