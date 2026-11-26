/* Vextra game runtime – sensors: microphone, camera, VR and AR services used by the Microphone / Camera / VR / AR blocks.
 * Everything is per game (g.sense), reference-counted (several blocks share one microphone / camera) and released when the game stops.
 * VR and AR use WebXR when the browser/headset supports it and otherwise a desktop/phone fallback (split-screen stereo, camera pass-through + device tilt). */
(function () {
  const VXRT = window.VXRT, U = VXRT.util; const S = (VXRT.sense = {});
  const st = (g) => (g.sense || (g.sense = { mic: { n: 0 }, cam: { n: 0 }, noise: [], vr: { active: false, mode: null, rig: { x: 0, y: 0, z: 0, yaw: 0 }, head: { x: 0, y: 1.6, z: 0, yaw: 0, pitch: 0, roll: 0 }, ctrl: {}, ipd: 0.064, grabbed: new Map(), sim: {} }, ar: { active: false, mode: null, hit: null, found: false, head: { yaw: 0, pitch: 0, roll: 0 }, sim: {} } }));
  S.state = st;
  const need = (api, what) => { if (!api) throw new Error(what + ' is not available here (needs a secure https / localhost page and a supported browser)'); };

  /* ---------- editor bridge ----------
   * In the editor the game runs in a sandboxed frame (no origin) where the browser refuses the microphone / camera. The editor opens the
   * devices instead and streams plain data in (see editor/sense-host.js). Outside the editor (exported page, phone) the game uses the devices directly. */
  const hosted = (g) => !!(g.opts && g.opts.channel && window.parent !== window);
  const friendly = (e, kind) => { const n = e && e.name; return n === 'NotAllowedError' || n === 'SecurityError' ? new Error('The ' + kind + ' was blocked – allow it in the browser / system permission prompt (Windows: Settings → Privacy & security → ' + (kind === 'camera' ? 'Camera' : 'Microphone') + ')') : n === 'NotFoundError' ? new Error('No ' + kind + ' was found') : n === 'NotReadableError' ? new Error('The ' + kind + ' is in use by another program') : e; };
  const bridge = (g) => { const s = st(g); if (s.br) return s.br; const ch = g.opts.channel, pend = new Map(); let seq = 0;
    const on = (e) => { const d = e.data; if (!d || d.vx !== 'sim' || e.source !== window.parent || d.token !== ch.token) return; const v = d.value;
      if (d.type === 'sense-ack') { const p = pend.get(v.id); if (p) { pend.delete(v.id); v.ok ? p.res(v) : p.rej(Object.assign(new Error(v.error || 'failed'), { name: v.name })); } }
      else if (d.type === 'mic') { const m = s.mic; if (m && m.bridged) { m.td = v.td; m.fd = v.fd; } }
      else if (d.type === 'cam') { const c = s.cam, cv = c && c.video; if (cv && c.bridged) { if (cv.width !== v.bmp.width) { cv.width = v.bmp.width; cv.height = v.bmp.height; cv.getContext('2d').imageSmoothingEnabled = true; } cv.getContext('2d').drawImage(v.bmp, 0, 0); cv.videoWidth = v.w; cv.videoHeight = v.h; cv.readyState = 4; } try { v.bmp.close(); } catch { /* gone */ } }
      else if (d.type === 'speech' && s.sp) s.sp.onText(v.text, v.final, v.conf);
      else if (d.type === 'speech-state' && s.sp) s.sp.onState(v.state, v.error); };
    window.addEventListener('message', on);
    return (s.br = { call: (op, extra) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); try { window.parent.postMessage(Object.assign({ vx: 'sense', token: ch.token, op, id }, extra), ch.origin); } catch (e) { pend.delete(id); rej(e); } setTimeout(() => { if (pend.delete(id)) rej(new Error('The editor did not answer – restart the game')); }, 120000); }), off: () => window.removeEventListener('message', on) }); };

  /* ---------- microphone ---------- */
  S.micAcquire = (g) => { const m = st(g).mic; m.n++; if (!m.p) m.p = (async () => {
    if (hosted(g)) { const a = await bridge(g).call('mic-start'); m.bridged = true; m.sr = a.sr; m.fft = a.fft; m.td = new Float32Array(a.fft); m.fd = new Uint8Array(a.fft / 2); m.ready = true; return true; }
    need(navigator.mediaDevices && navigator.mediaDevices.getUserMedia, 'The microphone');
    try { m.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); } catch (e) { throw friendly(e, 'microphone'); }
    const AC = window.AudioContext || window.webkitAudioContext; m.ctx = new AC(); try { await m.ctx.resume(); } catch { /* needs a gesture */ }
    const src = m.ctx.createMediaStreamSource(m.stream); m.an = m.ctx.createAnalyser(); m.an.fftSize = 2048; m.an.smoothingTimeConstant = 0.3; src.connect(m.an);
    m.td = new Float32Array(m.an.fftSize); m.fd = new Uint8Array(m.an.frequencyBinCount); m.ready = true; return true;
  })().catch((e) => { m.p = null; m.n = Math.max(0, m.n - 1); throw e; }); return m.p; };
  S.micRelease = (g) => { const m = st(g).mic; if (--m.n > 0) return; m.n = 0; if (m.bridged) { try { bridge(g).call('mic-stop').catch(() => {}); } catch { /* gone */ } m.bridged = false; } try { m.stream && m.stream.getTracks().forEach((t) => t.stop()); } catch { /* gone */ } try { m.ctx && m.ctx.close(); } catch { /* gone */ } Object.assign(m, { p: null, ready: false, stream: null, ctx: null, an: null, r: null, td: null, fd: null }); };
  /** { level 0–1, db, peak, pitch (Hz, 0 = none), low, mid, high (0–1) } – computed once per frame */
  S.micRead = (g, gain = 1) => {
    const m = st(g).mic; if (!m.ready) return null; if (m.frame === g.frame && m.r) return m.r; m.frame = g.frame; if (!m.bridged) { m.an.getFloatTimeDomainData(m.td); m.an.getByteFrequencyData(m.fd); }
    let sum = 0, peak = 0; for (let i = 0; i < m.td.length; i++) { const v = m.td[i]; sum += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); } const rms = Math.sqrt(sum / m.td.length);
    const sr = m.bridged ? m.sr : m.ctx.sampleRate, bin = sr / (m.bridged ? m.fft : m.an.fftSize); let bi = 0, bv = 0, lo = 0, mi = 0, hi = 0, nl = 0, nm = 0, nh = 0;
    for (let i = 1; i < m.fd.length; i++) { const f = i * bin, v = m.fd[i]; if (f < 300) { lo += v; nl++; } else if (f < 2000) { mi += v; nm++; } else if (f < 8000) { hi += v; nh++; } if (f > 80 && f < 3000 && v > bv) { bv = v; bi = i; } }
    return (m.r = { level: U.clamp(rms * 5 * gain, 0, 1), db: 20 * Math.log10(Math.max(rms, 1e-5)), peak: U.clamp(peak * gain, 0, 1), pitch: bv > 90 ? bi * bin : 0, low: lo / Math.max(1, nl) / 255, mid: mi / Math.max(1, nm) / 255, high: hi / Math.max(1, nh) / 255 });
  };
  /** Noise bus: anything that makes noise (voice, footsteps, explosions) posts here; Hearing blocks listen. */
  S.makeNoise = (g, x, y, z, radius, src) => { const b = st(g).noise; b.push({ x, y, z, radius, t: g.time, src: src || null }); if (b.length > 64) b.shift(); };
  S.noises = (g) => { const b = st(g).noise; while (b.length && g.time - b[0].t > 2) b.shift(); return b; };
  /** speech recognition (voice commands). Returns a handle or null when the browser has no speech recognition. */
  S.speech = (opts, onText, onState, g) => {
    if (g && hosted(g)) { const s = st(g), h = { on: true, stop() { h.on = false; if (s.sp === h) s.sp = null; try { bridge(g).call('speech-stop').catch(() => {}); } catch { /* gone */ } } }; h.onText = onText; h.onState = onState; s.sp = h; bridge(g).call('speech-start', { lang: opts.lang || 'en-US', interim: !!opts.interim, engine: opts.engine || 'settings' }).catch((e) => { h.on = false; onState('error', e.message); }); return h; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return null; const r = new SR(); r.lang = opts.lang || 'en-US'; r.continuous = true; r.interimResults = !!opts.interim; const h = { on: true, stop() { h.on = false; try { r.abort(); } catch { /* idle */ } } };
    r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; onText(String(res[0].transcript || '').trim(), res.isFinal, res[0].confidence); } };
    r.onerror = (e) => { if (e.error === 'no-speech' || e.error === 'aborted') return; h.on = e.error === 'network' ? h.on : false; onState('error', e.error); };
    r.onend = () => { if (h.on) setTimeout(() => { try { r.start(); } catch { /* already running */ } }, 250); }; r.onstart = () => onState('listening'); try { r.start(); } catch (e) { onState('error', e.message); } return h;
  };

  /* ---------- camera ---------- */
  S.camAcquire = (g, facing) => { const c = st(g).cam; c.n++; if (!c.p) c.p = (async () => {
    if (hosted(g)) { const a = await bridge(g).call('cam-start', { facing: facing || 'user' }); const v = document.createElement('canvas'); v.width = 480; v.height = 360; v.readyState = 0; v.videoWidth = a.w; v.videoHeight = a.h; v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;display:none'; v.setAttribute('data-vx-camera', '1'); g.stageEl && g.stageEl.parentElement && g.stageEl.parentElement.append(v);
      c.video = v; c.bridged = true; c.W = 64; c.H = 48; c.cv = document.createElement('canvas'); c.cv.width = c.W; c.cv.height = c.H; c.cx = c.cv.getContext('2d', { willReadFrequently: true }); c.mirror = (facing || 'user') === 'user'; c.ready = true; return true; }
    need(navigator.mediaDevices && navigator.mediaDevices.getUserMedia, 'The camera');
    try { c.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing || 'user', width: { ideal: 640 }, height: { ideal: 480 } } }); } catch (e) { throw friendly(e, 'camera'); }
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.autoplay = true; v.srcObject = c.stream; v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;display:none'; v.setAttribute('data-vx-camera', '1'); g.stageEl && g.stageEl.parentElement && g.stageEl.parentElement.append(v);
    try { await v.play(); } catch { /* autoplay policy */ } c.video = v; c.W = 64; c.H = 48; c.cv = document.createElement('canvas'); c.cv.width = c.W; c.cv.height = c.H; c.cx = c.cv.getContext('2d', { willReadFrequently: true }); c.mirror = (facing || 'user') === 'user'; c.ready = true; return true;
  })().catch((e) => { c.p = null; c.n = Math.max(0, c.n - 1); throw e; }); return c.p; };
  S.camRelease = (g) => { const c = st(g).cam; if (--c.n > 0) return; c.n = 0; if (c.bridged) { try { bridge(g).call('cam-stop').catch(() => {}); } catch { /* gone */ } c.bridged = false; } try { c.stream && c.stream.getTracks().forEach((t) => t.stop()); } catch { /* gone */ } if (c.video) c.video.remove(); Object.assign(c, { p: null, ready: false, stream: null, video: null, prev: null }); };
  /** current camera frame, 64×48 RGBA (mirrored for the selfie camera), cached per game frame */
  S.camFrame = (g) => { const c = st(g).cam; if (!c.ready || !c.video || c.video.readyState < 2) return null; if (c.frame === g.frame && c.img) return c.img; c.frame = g.frame; c.cx.save(); if (c.mirror) { c.cx.translate(c.W, 0); c.cx.scale(-1, 1); } c.cx.drawImage(c.video, 0, 0, c.W, c.H); c.cx.restore(); return (c.img = c.cx.getImageData(0, 0, c.W, c.H)); };
  /** how the camera picture is shown: hidden | corner | overlay | behind (3D games: the 3D scene is drawn over it) */
  S.camShow = (g, mode, opacity) => { const c = st(g).cam; const v = c.video; if (!v) return; v.style.transform = c.mirror ? 'scaleX(-1)' : ''; v.style.opacity = String(U.clamp(U.num(opacity, 1), 0, 1));
    if (mode === 'hidden') { v.style.display = 'none'; S.transparent3D(g, false); return; }
    v.style.display = 'block'; if (mode === 'corner') { Object.assign(v.style, { inset: 'auto', right: '12px', bottom: '12px', width: '200px', height: '150px', borderRadius: '10px', zIndex: '30', border: '2px solid #fff6' }); S.transparent3D(g, false); }
    else { Object.assign(v.style, { inset: '0', right: '', bottom: '', width: '100%', height: '100%', borderRadius: '0', border: 'none', zIndex: mode === 'behind' ? '0' : '30' }); if (mode === 'behind') { S.transparent3D(g, true); if (g.stageEl) g.stageEl.style.zIndex = '1'; } else S.transparent3D(g, false); } };
  /** make the 3D canvas see-through (camera pass-through / AR) and back */
  S.transparent3D = (g, on) => { const T = g.THREE, r = g.renderer3d, sc = g.scene3d; if (!T || !r || !sc) return; const a = st(g); if (on && !a.clear) { a.clear = { bg: sc.background }; sc.background = null; r.setClearColor(0x000000, 0); } else if (!on && a.clear) { sc.background = a.clear.bg; a.clear = null; r.setClearColor(g.data && g.data.scenes ? 0x1a2233 : 0x1a2233, 1); } };
  /** motion between this and the previous frame: { amount 0–1, x, y (0–1 centre of motion), cells[3x3] } */
  S.motion = (g, thresh) => { const c = st(g).cam, img = S.camFrame(g); if (!img) return null; const cur = new Uint8Array(c.W * c.H); for (let i = 0; i < cur.length; i++) cur[i] = (img.data[i * 4] * 77 + img.data[i * 4 + 1] * 150 + img.data[i * 4 + 2] * 29) >> 8;
    const prev = c.prev; c.prev = cur; if (!prev) return { amount: 0, x: 0.5, y: 0.5, cells: new Array(9).fill(0) }; let n = 0, sx = 0, sy = 0; const cells = new Array(9).fill(0);
    for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) { const i = y * c.W + x; if (Math.abs(cur[i] - prev[i]) > thresh) { n++; sx += x; sy += y; cells[Math.floor(y / (c.H / 3)) * 3 + Math.floor(x / (c.W / 3))]++; } }
    return { amount: n / (c.W * c.H), x: n ? sx / n / c.W : 0.5, y: n ? sy / n / c.H : 0.5, cells: cells.map((v) => v / (c.W * c.H / 9)) };
  };
  S.brightness = (g) => { const img = S.camFrame(g); if (!img) return null; let s = 0; for (let i = 0; i < img.data.length; i += 4) s += img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114; return s / (img.data.length / 4) / 255; };
  const hsv = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx]; };
  /** find the biggest area of a colour: { found, x, y (0–1), size (0–1) } */
  S.trackColor = (g, hex, tol) => { const c = st(g).cam, img = S.camFrame(g); if (!img) return null; const t = hsv(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)); let n = 0, sx = 0, sy = 0;
    for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) { const i = (y * c.W + x) * 4, p = hsv(img.data[i], img.data[i + 1], img.data[i + 2]); let dh = Math.abs(p[0] - t[0]); dh = Math.min(dh, 360 - dh); if (dh <= tol && p[1] > 0.35 && p[2] > 0.2) { n++; sx += x; sy += y; } }
    return { found: n > c.W * c.H * 0.004, x: n ? sx / n / c.W : 0.5, y: n ? sy / n / c.H : 0.5, size: n / (c.W * c.H) };
  };

  /* ---------- head / pointer simulation shared by the VR and AR fallbacks ---------- */
  function simHead(g, v) {
    const I = g.input, m = I.motion; const tilt = (('ontouchstart' in window) || m.sim) && (m.ax || m.ay || m.az || m.sim);
    if (tilt) { if (v.sim.yaw0 === undefined) v.sim.yaw0 = m.az || 0; v.head.yaw = v.sim.yaw0 - (m.az || 0); v.head.pitch = U.clamp((m.ax || 0) - 90, -85, 85); v.head.roll = m.ay || 0; return; }
    const r = (g.activeCanvas || g.container).getBoundingClientRect(); const mx = r.width ? (I.mouse.cx || r.width / 2) / r.width - 0.5 : 0, my = r.height ? (I.mouse.cy || r.height / 2) / r.height - 0.5 : 0;
    const kx = (I.isDown('arrowright') ? 1 : 0) - (I.isDown('arrowleft') ? 1 : 0), ky = (I.isDown('arrowup') ? 1 : 0) - (I.isDown('arrowdown') ? 1 : 0);
    v.sim.kyaw = (v.sim.kyaw || 0) - kx * 90 * g.dt; v.sim.kpit = U.clamp((v.sim.kpit || 0) + ky * 60 * g.dt, -80, 80); v.head.yaw = -mx * 120 + v.sim.kyaw; v.head.pitch = U.clamp(-my * 80 + v.sim.kpit, -85, 85); v.head.roll = 0;
  }

  /* ---------- VR ---------- */
  S.vrSupported = async () => { try { return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr')); } catch { return false; } };
  S.arSupported = async () => { try { return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-ar')); } catch { return false; } };
  S.vrEnter = async (g, mode) => {
    if (g.dim !== '3d') throw new Error('VR needs a 3D game'); const v = st(g).vr; if (v.active) return v.mode; const T = g.THREE, r = g.renderer3d;
    if ((mode === 'auto' || mode === 'webxr') && await S.vrSupported()) {
      try { r.xr.enabled = true; r.xr.setReferenceSpaceType('local-floor'); const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] }); await r.xr.setSession(s); v.session = s; v.mode = 'webxr'; v.active = true; r.setAnimationLoop((t) => g.tick(t));
        [0, 1].forEach((i) => { const c = r.xr.getController(i); g.scene3d.add(c); c.addEventListener('connected', (e) => { const h = e.data && e.data.handedness; if (h) v.ctrl[h] = Object.assign(v.ctrl[h] || {}, { obj: c, src: e.data }); }); c.addEventListener('disconnected', () => { for (const k of Object.keys(v.ctrl)) if (v.ctrl[k].obj === c) delete v.ctrl[k]; }); });
        s.addEventListener('end', () => S.vrExit(g)); return 'webxr'; } catch (e) { r.xr.enabled = false; if (mode === 'webxr') throw e; }
    }
    if (mode === 'webxr') throw new Error('WebXR VR is not supported by this browser / device'); v.mode = 'stereo'; v.active = true; v.sim = {}; return 'stereo';
  };
  S.vrExit = (g) => { const v = st(g).vr; if (!v.active) return; const r = g.renderer3d; try { if (v.session) { const s = v.session; v.session = null; s.end().catch(() => {}); } if (r) { r.setAnimationLoop(null); r.xr.enabled = false; r.setViewport(0, 0, r.domElement.clientWidth, r.domElement.clientHeight); r.setScissorTest(false); } } catch { /* ended */ } v.active = false; v.mode = null; g.emit && g.emit('vrExit'); };
  /** every frame: head pose (fallback), controller state */
  S.vrFrame = (g) => {
    const v = st(g).vr; if (!v.active || v.frame === g.frame) return v; v.frame = g.frame;
    if (v.mode === 'stereo') { simHead(g, v); const I = g.input; const kd = (k) => (I.isDown(k) ? 1 : 0); const cam = g.cam3d, y = U.rad(cam.yaw + v.head.yaw + v.rig.yaw), p = U.rad(v.head.pitch); v.pos = v.pos || { x: cam.pos.x, y: cam.pos.y, z: cam.pos.z }; v.head.x = v.pos.x; v.head.y = v.pos.y; v.head.z = v.pos.z; /* the head is where the camera is – VR Head and VR Gaze need a real position, not 0,0,0 */ const fwd = { x: -Math.sin(y) * Math.cos(p), y: Math.sin(p), z: -Math.cos(y) * Math.cos(p) }, right = { x: Math.cos(y), y: 0, z: -Math.sin(y) };
      v.ctrl.right = { sim: true, pos: { x: v.pos.x + fwd.x * 0.6 + right.x * 0.25, y: v.pos.y + fwd.y * 0.6 - 0.25, z: v.pos.z + fwd.z * 0.6 + right.z * 0.25 }, dir: fwd, trigger: I.mouse.down ? 1 : 0, grip: kd('e') || (I.mouse.buttons && I.mouse.buttons.has && I.mouse.buttons.has(2) ? 1 : 0), a: kd('q'), b: kd('f'), stickX: kd('d') - kd('a'), stickY: kd('s') - kd('w') };
      v.ctrl.left = v.ctrl.left || { sim: true, trigger: 0, grip: 0, a: 0, b: 0, stickX: 0, stickY: 0, pos: v.ctrl.right.pos, dir: fwd }; Object.assign(v.ctrl.left, { pos: v.ctrl.right.pos, dir: fwd });
    } else if (v.mode === 'webxr') {
      const T = g.THREE; for (const h of ['left', 'right']) { const c = v.ctrl[h]; if (!c || !c.obj) continue; const gp = c.src && c.src.gamepad; if (gp) { c.trigger = gp.buttons[0] ? gp.buttons[0].value : 0; c.grip = gp.buttons[1] ? gp.buttons[1].value : 0; c.a = gp.buttons[4] ? gp.buttons[4].value : 0; c.b = gp.buttons[5] ? gp.buttons[5].value : 0; c.stickX = gp.axes[2] || 0; c.stickY = gp.axes[3] || 0; }
        const wp = new T.Vector3(), wd = new T.Vector3(0, 0, -1); c.obj.getWorldPosition(wp); wd.applyQuaternion(c.obj.getWorldQuaternion(new T.Quaternion())); c.pos = { x: wp.x, y: wp.y, z: wp.z }; c.dir = { x: wd.x, y: wd.y, z: wd.z }; }
      const cam = g.camera3d; if (cam) { const xc = g.renderer3d.xr.getCamera ? g.renderer3d.xr.getCamera() : cam; const wp = new T.Vector3(), q = new T.Quaternion(); xc.getWorldPosition(wp); xc.getWorldQuaternion(q); const e = new T.Euler().setFromQuaternion(q, 'YXZ'); v.head.x = wp.x; v.head.y = wp.y; v.head.z = wp.z; v.head.yaw = U.deg(e.y); v.head.pitch = U.deg(e.x); v.head.roll = U.deg(e.z); }
    }
    return v;
  };
  /** camera pose before drawing (called by the 3D renderer) */
  S.vrPre = (g, c) => { const v = st(g).vr; if (!v.active) return; S.vrFrame(g); const base = v.base || (v.base = { x: c.pos.x, y: c.pos.y, z: c.pos.z });
    if (v.mode === 'stereo') { const y = U.rad(c.yaw + v.head.yaw + v.rig.yaw), p = U.rad(v.head.pitch); v.pos = { x: c.pos.x + v.rig.x, y: c.pos.y + v.rig.y, z: c.pos.z + v.rig.z }; c.pos = { x: v.pos.x, y: v.pos.y, z: v.pos.z }; c.target = { x: c.pos.x - Math.sin(y) * Math.cos(p), y: c.pos.y + Math.sin(p), z: c.pos.z - Math.cos(y) * Math.cos(p) }; v.head.x = c.pos.x; v.head.y = c.pos.y; v.head.z = c.pos.z; }
    else { c.pos = { x: c.pos.x + v.rig.x, y: c.pos.y + v.rig.y, z: c.pos.z + v.rig.z }; c.target = { x: c.pos.x - Math.sin(U.rad(v.rig.yaw)), y: c.pos.y, z: c.pos.z - Math.cos(U.rad(v.rig.yaw)) }; v.pos = { x: c.pos.x, y: c.pos.y, z: c.pos.z }; } };
  /** returns true when it drew the frame itself (split-screen stereo) */
  S.vrRender = (g, cam) => {
    const v = st(g).vr; if (!v.active || v.mode !== 'stereo') return false; const r = g.renderer3d, T = g.THREE, size = r.getSize(new T.Vector2()), w = size.x, h = size.y, half = w / 2, ipd = v.ipd, aspect = half / h; const keepAsp = cam.aspect;
    const right = new T.Vector3(1, 0, 0).applyQuaternion(cam.quaternion); const p0 = cam.position.clone(); r.setScissorTest(true); r.autoClear = false; r.clear();
    for (let e = 0; e < 2; e++) { cam.aspect = aspect; cam.updateProjectionMatrix(); cam.position.copy(p0).addScaledVector(right, (e ? 1 : -1) * ipd / 2); cam.updateMatrixWorld(); r.setViewport(e * half, 0, half, h); r.setScissor(e * half, 0, half, h); r.render(g.scene3d, cam); }
    cam.position.copy(p0); cam.aspect = keepAsp; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); r.setScissorTest(false); r.setViewport(0, 0, w, h); r.autoClear = true; return true;
  };

  /* ---------- AR ---------- */
  S.arEnter = async (g, mode, facing) => {
    if (g.dim !== '3d') throw new Error('AR needs a 3D game'); const a = st(g).ar, T = g.THREE, r = g.renderer3d; if (a.active) return a.mode;
    if ((mode === 'auto' || mode === 'webxr') && await S.arSupported()) {
      try { r.xr.enabled = true; r.xr.setReferenceSpaceType('local'); const s = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['local-floor', 'anchors', 'light-estimation'] }); S.transparent3D(g, true); await r.xr.setSession(s); a.session = s; a.mode = 'webxr'; a.active = true; const vs = await s.requestReferenceSpace('viewer'); a.hitSrc = await s.requestHitTestSource({ space: vs });
        r.setAnimationLoop((t, frame) => { a.frame = frame; g.tick(t); }); s.addEventListener('end', () => S.arExit(g)); return 'webxr'; } catch (e) { r.xr.enabled = false; S.transparent3D(g, false); if (mode === 'webxr') throw e; }
    }
    if (mode === 'webxr') throw new Error('WebXR AR is not supported by this browser / device');
    await S.camAcquire(g, facing || 'environment'); a.camHeld = true; S.camShow(g, 'behind', 1); a.mode = 'camera'; a.active = true; a.sim = { kpit: -20 }; return 'camera';
  };
  S.arExit = (g) => { const a = st(g).ar; if (!a.active) return; const r = g.renderer3d; try { if (a.session) { const s = a.session; a.session = null; s.end().catch(() => {}); } if (r) { r.setAnimationLoop(null); r.xr.enabled = false; } } catch { /* ended */ } if (a.camHeld) { S.camShow(g, 'hidden'); S.camRelease(g); a.camHeld = false; } S.transparent3D(g, false); if (a.reticle && a.reticle.parent) a.reticle.parent.remove(a.reticle); a.active = false; a.mode = null; a.found = false; };
  S.arPre = (g, c) => { const a = st(g).ar; if (!a.active || a.mode !== 'camera') return; const v = st(g).vr; simHead(g, a); const y = U.rad(c.yaw + a.head.yaw), p = U.rad(a.head.pitch); c.target = { x: c.pos.x - Math.sin(y) * Math.cos(p), y: c.pos.y + Math.sin(p), z: c.pos.z - Math.cos(y) * Math.cos(p) }; a.cam = { x: c.pos.x, y: c.pos.y, z: c.pos.z }; a.dir = { x: c.target.x - c.pos.x, y: c.target.y - c.pos.y, z: c.target.z - c.pos.z }; };
  /** where the surface is: WebXR hit-test, or (camera mode) the floor plane the camera looks at */
  S.arSurface = (g, floorY) => { const a = st(g).ar; if (!a.active) return null; const T = g.THREE;
    if (a.mode === 'webxr' && a.hitSrc && a.frame) { const rs = g.renderer3d.xr.getReferenceSpace(), res = a.frame.getHitTestResults(a.hitSrc); if (res.length) { const p = res[0].getPose(rs).transform.position; a.hit = { x: p.x, y: p.y, z: p.z }; a.found = true; } else a.found = false; return a.found ? a.hit : null; }
    const c = a.cam || g.cam3d.pos, d = a.dir || { x: 0, y: -0.3, z: -1 }; if (d.y >= -0.02) { a.found = false; return null; } const t = (floorY - c.y) / d.y; if (t <= 0 || t > 60) { a.found = false; return null; } a.hit = { x: c.x + d.x * t, y: floorY, z: c.z + d.z * t }; a.found = true; return a.hit;
  };
  S.destroy = (g) => { const s = g.sense; if (!s) return; try { if (s.br) { if (s.mic.bridged) s.br.call('mic-stop').catch(() => {}); if (s.cam.bridged) s.br.call('cam-stop').catch(() => {}); if (s.sp) s.br.call('speech-stop').catch(() => {}); s.br.off(); } } catch { /* ignore */ } try { S.vrExit(g); S.arExit(g); } catch { /* ignore */ } try { if (s.mic.stream) s.mic.stream.getTracks().forEach((t) => t.stop()); if (s.mic.ctx) s.mic.ctx.close(); if (s.cam.stream) s.cam.stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ } g.sense = null; };
})();
