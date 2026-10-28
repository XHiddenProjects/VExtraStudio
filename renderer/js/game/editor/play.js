/* Vextra game editor – Play panel: runs the exported game in a sandboxed iframe with a device simulator. */
(function () {
  const { h } = VX;
  const DEVICES = [['fit', 'Fit window'], ['actual', 'Game size'], ['390x844', 'Phone (portrait)'], ['844x390', 'Phone (landscape)'], ['820x1180', 'Tablet (portrait)'], ['1180x820', 'Tablet (landscape)'], ['1280x720', 'Desktop 720p']];

  class PlayPanel {
    /** ctx: { project(), onLog(level,text), onStop() } */
    constructor(ctx) {
      this.ctx = ctx; this.device = 'fit'; this.muted = false; this.paused = false; this.debug = false; this.token = 0;
      this.frame = h('iframe', { class: 'play-frame', sandbox: 'allow-scripts allow-pointer-lock allow-modals allow-popups allow-forms', allow: 'autoplay; fullscreen; gamepad; accelerometer; gyroscope' });
      this.stage = h('div', { class: 'play-stage' }, this.frame);
      const dev = h('select', { onchange: (e) => { this.device = e.target.value; this.layout(); } }, DEVICES.map(([v, l]) => h('option', { value: v }, l)));
      this.tilt = h('input', { type: 'range', min: -90, max: 90, value: 0, title: 'Tilt (accelerometer)', oninput: (e) => this.send('tilt', { x: +e.target.value / 9, ax: +e.target.value, ay: 0 }) });
      this.bar = h('div', { class: 'play-bar' },
        h('button', { class: 'btn sm primary', onclick: () => this.start() }, '↻ Restart'), h('button', { class: 'btn sm', onclick: () => { this.paused = !this.paused; this.send('pause', this.paused); this.pb.textContent = this.paused ? '▶ Resume' : '⏸ Pause'; } }, this.pb = h('span', {}, '⏸ Pause')),
        h('button', { class: 'btn sm', onclick: (e) => { this.muted = !this.muted; this.send('mute', this.muted); e.currentTarget.classList.toggle('on', this.muted); } }, '🔇'), h('button', { class: 'btn sm', title: 'Show colliders & stats', onclick: (e) => { this.debug = !this.debug; this.send('debug', this.debug); e.currentTarget.classList.toggle('on', this.debug); } }, '🐞 Debug'),
        h('span', { class: 'sp' }), h('label', { class: 'mini' }, 'Device'), dev, h('button', { class: 'btn sm', title: 'Simulate a device shake', onclick: () => this.send('shake') }, '📳 Shake'), h('label', { class: 'mini' }, 'Tilt'), this.tilt,
        h('button', { class: 'btn sm', onclick: () => this.ctx.onStop && this.ctx.onStop() }, '■ Stop'));
      this.el = h('div', { class: 'play' }, this.bar, this.stage);
      this.msg = (e) => { if (e.source !== this.frame.contentWindow) return; const d = e.data; if (d && d.vx === 'log') this.ctx.onLog && this.ctx.onLog(d.level, d.text); };
      window.addEventListener('message', this.msg); this.ro = new ResizeObserver(() => this.layout()); this.ro.observe(this.stage);
    }
    send(type, value) { try { this.frame.contentWindow.postMessage({ vx: 'sim', type, value }, '*'); } catch { /* not ready */ } }
    layout() {
      const s = this.stage.getBoundingClientRect(), st = this.ctx.project().settings; let w, hh;
      if (this.device === 'fit') { this.frame.style.cssText = 'width:100%;height:100%'; this.frame.classList.remove('dev'); return; }
      if (this.device === 'actual') { w = st.width; hh = st.height; } else [w, hh] = this.device.split('x').map(Number);
      const k = Math.min(1, (s.width - 24) / w, (s.height - 24) / hh); this.frame.classList.add('dev');
      this.frame.style.cssText = `width:${w}px;height:${hh}px;transform:scale(${k});transform-origin:center center;`;
    }
    async start() {
      const my = ++this.token; this.paused = false; this.pb && (this.pb.textContent = '⏸ Pause');
      try {
        const html = await VX.gameExport.toHTML(this.ctx.project()); if (my !== this.token) return;
        this.frame.srcdoc = html; this.layout(); this.frame.onload = () => { this.send('debug', this.debug); this.send('mute', this.muted); this.frame.focus(); };
        this.ctx.onLog && this.ctx.onLog('info', '▶ Game started');
      } catch (e) { this.ctx.onLog && this.ctx.onLog('error', 'Could not start: ' + e.message); VX.ui.toast('Could not start game: ' + e.message, 'error'); }
    }
    stop() { this.token++; this.frame.srcdoc = ''; this.frame.removeAttribute('srcdoc'); this.send('pause', true); }
    dispose() { this.token++; window.removeEventListener('message', this.msg); this.ro.disconnect(); this.frame.srcdoc = ''; }
  }
  VX.PlayPanel = PlayPanel;
})();
