/* Vextra game editor – Play panel: runs the exported game in a sandboxed iframe with a device simulator. */
(function () {
  const { h } = VX;
  const DEVICES = [['fit', 'Fit window'], ['actual', 'Game size'], ['390x844', 'Phone (portrait)'], ['844x390', 'Phone (landscape)'], ['820x1180', 'Tablet (portrait)'], ['1180x820', 'Tablet (landscape)'], ['1280x720', 'Desktop 720p']];

  class PlayPanel {
    /** ctx: { project(), onLog(level,text), onStop() } */
    constructor(ctx) {
      this.ctx = ctx; this.device = 'fit'; this.muted = false; this.paused = false; this.debug = false; this.token = 0;
      this.frame = h('iframe', { class: 'play-frame', sandbox: 'allow-scripts allow-pointer-lock allow-modals allow-popups allow-forms', allow: 'autoplay; fullscreen; gamepad; accelerometer; gyroscope; microphone; camera; xr-spatial-tracking; speech-recognition; bluetooth; usb; serial; hid' });
      this.loadBar = h('i', {}); this.loadTxt = h('span', {}, 'Loading…');
      this.loadEl = h('div', { class: 'play-load', role: 'progressbar', 'aria-label': 'Starting the game', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', hidden: true }, h('div', { class: 'pl-card' }, h('b', {}, 'Starting your game'), h('div', { class: 'pl-bar' }, this.loadBar), this.loadTxt));
      this.tiltWrap = h('div', { class: 'play-tilt' }, this.frame); this.stage = h('div', { class: 'play-stage' }, this.tiltWrap, this.loadEl);
      const dev = h('select', { onchange: (e) => { this.device = e.target.value; this.layout(); } }, DEVICES.map(([v, l]) => h('option', { value: v }, l)));
      this.tiltV = { gamma: 0, beta: 0 };
      /* tilt like a phone: left/right (gamma) and forward/back (beta); gravity is split over x, y and z the way a real accelerometer reports it (m/s²) */
      const pushTilt = () => { const g = this.tiltV.gamma * Math.PI / 180, b = this.tiltV.beta * Math.PI / 180, G = 9.81; this.send('tilt', { x: +(G * Math.sin(g) * Math.cos(b)).toFixed(3), y: +(G * Math.sin(b)).toFixed(3), z: +(G * Math.cos(g) * Math.cos(b)).toFixed(3), ax: this.tiltV.beta, ay: this.tiltV.gamma }); showTilt({ x: G * Math.sin(g) * Math.cos(b), y: G * Math.sin(b), z: G * Math.cos(g) * Math.cos(b) }); };
      const readout = h('span', { class: 'mini tiltout', 'aria-live': 'off', title: 'What the game receives: acceleration in m/s² (x, y, z) and the tilt angles' }, 'x 0.0 · y 0.0 · z 9.8');
      /* the preview tilts like the device does, so the sliders visibly do something even before a game reads them */
      const showTilt = (a) => { const g = this.tiltV.gamma, b = this.tiltV.beta; if (this.tiltWrap) this.tiltWrap.style.transform = (g || b) ? `rotateX(${(-b * 0.45).toFixed(1)}deg) rotateY(${(g * 0.45).toFixed(1)}deg)` : ''; readout.textContent = `x ${a.x.toFixed(1)} · y ${a.y.toFixed(1)} · z ${a.z.toFixed(1)}  (${Math.round(g)}° / ${Math.round(b)}°)`; };
      this.tiltOut = readout; this.showTilt = showTilt;
      this.pushTilt = pushTilt;
      const slider = (key, label) => { const i = h('input', { type: 'range', min: -90, max: 90, value: 0, 'aria-label': label, title: label + ' – double-click to level', oninput: (e) => { this.tiltV[key] = +e.target.value; pushTilt(); }, ondblclick: (e) => { e.target.value = 0; this.tiltV[key] = 0; pushTilt(); } }); return i; };
      this.tilt = h('span', { class: 'tiltbox' }, h('span', { class: 'mini' }, '↔'), slider('gamma', 'Tilt left / right'), h('span', { class: 'mini' }, '↕'), slider('beta', 'Tilt forward / back'), h('button', { type: 'button', class: 'btn sm', title: 'Level the device', onclick: () => { this.tiltV.gamma = 0; this.tiltV.beta = 0; this.tilt.querySelectorAll('input').forEach((i) => { i.value = 0; }); pushTilt(); } }, 'Level'), readout);
      /* shake: the editor frame jolts and the game gets a burst of strong accelerometer readings, then the shake event */
      this.shake = () => { const w = this.tiltWrap, calm = VX.a11y && VX.a11y.reduceMotion && VX.a11y.reduceMotion();
        /* only the independent translate / rotate properties are animated, so the frame's own centring and scaling transform is never replaced and it always comes back to the exact centre */
        if (w && w.animate && !calm && window.CSS && CSS.supports && CSS.supports('translate', '1px')) { const k = (x, y, r) => ({ translate: x + 'px ' + y + 'px', rotate: r + 'deg' }); const an = w.animate([k(0, 0, 0), k(-9, 4, -1), k(8, -5, 1), k(-6, -3, -0.6), k(5, 4, 0.5), k(0, 0, 0)], { duration: 450, easing: 'ease-out' }); an.onfinish = an.oncancel = () => { w.style.translate = ''; w.style.rotate = ''; }; }
        let i = 0; const t = setInterval(() => { const a = i % 2 ? 1 : -1; this.send('tilt', { x: a * 22, y: -a * 14, z: 9.81 + a * 10, burst: true }); if (++i >= 8) { clearInterval(t); pushTilt(); } }, 50); this.send('shake', { force: 28 }); };
      this.bar = h('div', { class: 'play-bar' },
        this.restartBtn = h('button', { class: 'btn sm primary', onclick: () => this.start() }, '↻ Restart'), h('button', { class: 'btn sm', onclick: () => { this.paused = !this.paused; this.send('pause', this.paused); this.pb.textContent = this.paused ? '▶ Resume' : '⏸ Pause'; } }, this.pb = h('span', {}, '⏸ Pause')),
        h('button', { class: 'btn sm', onclick: (e) => { this.muted = !this.muted; this.send('mute', this.muted); e.currentTarget.classList.toggle('on', this.muted); } }, '🔇'), h('button', { class: 'btn sm', title: 'Show colliders & stats', onclick: (e) => { this.debug = !this.debug; this.send('debug', this.debug); e.currentTarget.classList.toggle('on', this.debug); } }, '🐞 Debug'),
        h('span', { class: 'sp' }), h('label', { class: 'mini' }, 'Device'), dev, h('button', { class: 'btn sm', title: 'Simulate a device shake', onclick: () => this.shake() }, '📳 Shake'), h('label', { class: 'mini' }, 'Tilt'), this.tilt,
        h('button', { class: 'btn sm', onclick: () => this.ctx.onStop && this.ctx.onStop() }, '■ Stop'));
      this.el = h('div', { class: 'play' }, this.bar, this.stage);
      this.sense = new VX.SenseHost((type, value, tr) => this.send(type, value, tr));
      this.msg = (e) => { if (e.source !== this.frame.contentWindow) return; const d = e.data; if (d && d.vx === 'sense' && this.chan && d.token === this.chan.token) { this.sense.handle(d); return; } if (d && d.vx === 'live' && this.chan && d.token === this.chan.token) { this.ctx.onLive && this.ctx.onLive(d.data); return; } if (d && d.vx === 'exit' && this.chan && d.token === this.chan.token) { this.stop(); return; } if (d && d.vx === 'log' && this.chan && d.token === this.chan.token) this.ctx.onLog && this.ctx.onLog(d.level, d.text); };
      window.addEventListener('message', this.msg); this.ro = new ResizeObserver(() => this.layout()); this.ro.observe(this.stage);
    }
    /* The game frame is sandboxed without allow-same-origin, so its origin is opaque and "*" is the only possible target. Every message carries a one-time token the game verifies, and carries no secrets. */
    send(type, value, transfer) { if (!this.chan) return; try { this.frame.contentWindow.postMessage({ vx: 'sim', token: this.chan.token, type, value }, '*', transfer || []); } catch { /* not ready */ } }
    layout() {
      const s = this.stage.getBoundingClientRect(), st = this.ctx.project().settings; let w, hh;
      if (this.device === 'fit') { this.frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; this.frame.classList.remove('dev'); return; }
      if (this.device === 'actual') { w = st.width; hh = st.height; } else [w, hh] = this.device.split('x').map(Number);
      if (s.width < 40 || s.height < 40) return; const k = Math.max(0.05, Math.min(1, (s.width - 44) / w, (s.height - 44) / hh)); this.frame.classList.add('dev');
      this.frame.style.cssText = `position:absolute;left:50%;top:50%;width:${w}px;height:${hh}px;transform:translate(-50%,-50%) scale(${k});transform-origin:center center;`;
    }
    /* loading bar: the button and the Play tab stay locked until the game has really started, so a double click can't start it twice */
    busy(on, pct, label) {
      if (on) { this.loading = true; this.loadEl.hidden = false; } else { this.loading = false; clearInterval(this._lt); this._lt = null; this.loadEl.hidden = true; }
      if (this.restartBtn) { this.restartBtn.disabled = !!on; this.restartBtn.classList.toggle('busy', !!on); }
      if (on) this.progress(pct, label); this.ctx.onBusy && this.ctx.onBusy(!!on);
    }
    progress(pct, label) {
      if (pct != null) this._p = Math.max(this._p || 0, pct); this._cap = Math.min(96, (pct == null ? this._cap : pct + 18) || 20); if (label) this.loadTxt.textContent = label;
      const draw = () => { const v = Math.round(this._p); this.loadBar.style.width = v + '%'; this.loadEl.setAttribute('aria-valuenow', String(v)); };
      draw(); if (!this._lt) this._lt = setInterval(() => { if (this._p < this._cap) { this._p += (this._cap - this._p) * 0.08 + 0.15; draw(); } }, 80);
    }
    async start() {
      if (this.loading) return; const my = ++this.token; this._p = 0; this._cap = 20; this.busy(true, 4, 'Packing your project…');
      this.sense && this.sense.destroy(); this.paused = false; this.pb && (this.pb.textContent = '⏸ Pause');
      try {
        this.chan = { token: VX.channel.token(), origin: VX.channel.origin() }; const html = await VX.gameExport.toHTML(this.ctx.project(), { channel: this.chan, live: !!this.ctx.onLive }); if (my !== this.token) return this.busy(false);
        this.progress(55, 'Starting the game…');
        this.frame.srcdoc = html; this.layout(); this.frame.onload = () => { this.progress(88, 'Loading sounds and images…'); this.send('debug', this.debug); this.pushTilt(); this.send('mute', this.muted); if (this.ctx.onLive) for (const ms of [0, 400, 1200, 2500]) setTimeout(() => { if (my === this.token) this.send('live', true); }, ms); this.frame.focus(); setTimeout(() => { if (my !== this.token) return; this.progress(100, 'Ready'); setTimeout(() => { if (my === this.token) this.busy(false); }, 220); }, 450); };
        this.ctx.onLog && this.ctx.onLog('info', '▶ Game started');
      } catch (e) { this.busy(false); this.ctx.onLog && this.ctx.onLog('error', 'Could not start: ' + (e && e.message || 'unknown error')); VX.ui.toast('Could not start game: ' + (e && e.message || 'unknown error'), 'error'); }
    }
    stop() { this.token++; this.busy(false); this.sense && this.sense.destroy(); this.frame.srcdoc = ''; this.frame.removeAttribute('srcdoc'); this.send('pause', true); }
    dispose() { this.token++; clearInterval(this._lt); window.removeEventListener('message', this.msg); this.ro.disconnect(); this.frame.srcdoc = ''; }
  }
  VX.PlayPanel = PlayPanel;
})();
