/* Vextra game editor – Play panel: runs the exported game in a sandboxed iframe with a device simulator. */
(function () {
  const { h } = VX;
  const DEVICES = [['fit', 'Fit window'], ['actual', 'Game size'], ['390x844', 'Phone (portrait)'], ['844x390', 'Phone (landscape)'], ['820x1180', 'Tablet (portrait)'], ['1180x820', 'Tablet (landscape)'], ['1280x720', 'Desktop 720p']];

  class PlayPanel {
    /** ctx: { project(), onLog(level,text), onStop() } */
    constructor(ctx) {
      this.ctx = ctx; this.device = 'fit'; this.muted = false; this.paused = false; this.debug = false; this.token = 0;
      this.frame = h('iframe', { class: 'play-frame', sandbox: 'allow-scripts allow-pointer-lock allow-modals allow-popups allow-forms', allow: 'autoplay; fullscreen; gamepad; accelerometer; gyroscope; microphone; camera; xr-spatial-tracking; speech-recognition; bluetooth; usb; serial; hid' });
      this.stage = h('div', { class: 'play-stage' }, this.frame);
      const dev = h('select', { onchange: (e) => { this.device = e.target.value; this.layout(); } }, DEVICES.map(([v, l]) => h('option', { value: v }, l)));
      this.tiltV = { gamma: 0, beta: 0 };
      /* tilt like a phone: left/right (gamma) and forward/back (beta); gravity is split over x, y and z the way a real accelerometer reports it (m/s²) */
      const pushTilt = () => { const g = this.tiltV.gamma * Math.PI / 180, b = this.tiltV.beta * Math.PI / 180, G = 9.81; this.send('tilt', { x: +(G * Math.sin(g) * Math.cos(b)).toFixed(3), y: +(G * Math.sin(b)).toFixed(3), z: +(G * Math.cos(g) * Math.cos(b)).toFixed(3), ax: this.tiltV.beta, ay: this.tiltV.gamma }); };
      this.pushTilt = pushTilt;
      const slider = (key, label) => { const i = h('input', { type: 'range', min: -90, max: 90, value: 0, 'aria-label': label, title: label + ' – double-click to level', oninput: (e) => { this.tiltV[key] = +e.target.value; pushTilt(); }, ondblclick: (e) => { e.target.value = 0; this.tiltV[key] = 0; pushTilt(); } }); return i; };
      this.tilt = h('span', { class: 'tiltbox' }, h('span', { class: 'mini' }, '↔'), slider('gamma', 'Tilt left / right'), h('span', { class: 'mini' }, '↕'), slider('beta', 'Tilt forward / back'));
      /* shake: the editor frame jolts and the game gets a burst of strong accelerometer readings, then the shake event */
      this.shake = () => { const f = this.frame; if (f && f.animate) f.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-9px,4px) rotate(-1deg)' }, { transform: 'translate(8px,-5px) rotate(1deg)' }, { transform: 'translate(-6px,-3px)' }, { transform: 'translate(5px,4px)' }, { transform: 'translate(0,0)' }], { duration: 450, easing: 'ease-out' });
        let i = 0; const t = setInterval(() => { const a = i % 2 ? 1 : -1; this.send('tilt', { x: a * 22, y: -a * 14, z: 9.81 + a * 10 }); if (++i >= 8) { clearInterval(t); pushTilt(); } }, 50); this.send('shake', { force: 28 }); };
      this.bar = h('div', { class: 'play-bar' },
        h('button', { class: 'btn sm primary', onclick: () => this.start() }, '↻ Restart'), h('button', { class: 'btn sm', onclick: () => { this.paused = !this.paused; this.send('pause', this.paused); this.pb.textContent = this.paused ? '▶ Resume' : '⏸ Pause'; } }, this.pb = h('span', {}, '⏸ Pause')),
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
    async start() {
      const my = ++this.token; this.sense && this.sense.destroy(); this.paused = false; this.pb && (this.pb.textContent = '⏸ Pause');
      try {
        this.chan = { token: VX.channel.token(), origin: VX.channel.origin() }; const html = await VX.gameExport.toHTML(this.ctx.project(), { channel: this.chan, live: !!this.ctx.onLive }); if (my !== this.token) return;
        this.frame.srcdoc = html; this.layout(); this.frame.onload = () => { this.send('debug', this.debug); this.pushTilt(); this.send('mute', this.muted); if (this.ctx.onLive) for (const ms of [0, 400, 1200, 2500]) setTimeout(() => { if (my === this.token) this.send('live', true); }, ms); this.frame.focus(); };
        this.ctx.onLog && this.ctx.onLog('info', '▶ Game started');
      } catch (e) { this.ctx.onLog && this.ctx.onLog('error', 'Could not start: ' + e.message); VX.ui.toast('Could not start game: ' + e.message, 'error'); }
    }
    stop() { this.token++; this.sense && this.sense.destroy(); this.frame.srcdoc = ''; this.frame.removeAttribute('srcdoc'); this.send('pause', true); }
    dispose() { this.token++; window.removeEventListener('message', this.msg); this.ro.disconnect(); this.frame.srcdoc = ''; }
  }
  VX.PlayPanel = PlayPanel;
})();
