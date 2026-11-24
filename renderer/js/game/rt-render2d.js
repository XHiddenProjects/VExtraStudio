/* Vextra game runtime – 2D renderer. Also used by the editor viewport (draw2D.object with an `env`). */
(function () {
  const VXRT = window.VXRT, U = VXRT.util;
  VXRT.LAYERS = ['background', 'world', 'ui']; VXRT.layerRank = (o) => { const i = VXRT.LAYERS.indexOf(o && o.layer); return i < 0 ? 1 : i; };
  const BLEND = { normal: 'source-over', add: 'lighter', multiply: 'multiply', screen: 'screen' };

  /* env = { assets, imgs:Map, time, vars, onImageLoad } – the editor builds one with makeEnv(), the runtime passes the Game itself. */
  VXRT.makeEnv = (data, onImageLoad) => ({ assets: data.assets || {}, data, imgs: new Map(), time: 0, vars: {}, onImageLoad });
  const assetsOf = (env) => env.assets || (env.data && env.data.assets) || {};
  function getImage(env, spriteId, frame = 0) {
    const sp = assetsOf(env).sprites?.[spriteId]; if (!sp) return null; const fr = sp.frames?.[frame % (sp.frames.length || 1)]; if (!fr) return null;
    const imgs = env.imgs || (env.imgs = new Map()); const key = spriteId + ':' + (frame % sp.frames.length) + ':' + fr.length;
    let im = imgs.get(key); if (!im) { im = new Image(); im.src = fr; im.onload = () => env.onImageLoad && env.onImageLoad(); imgs.set(key, im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  VXRT.getImage = getImage;

  let tmp = null; const getTmp = (w, h) => { if (!tmp) tmp = document.createElement('canvas'); if (tmp.width !== w || tmp.height !== h) { tmp.width = w; tmp.height = h; } return tmp; };
  let tmp2 = null; const getTmp2 = (w, h) => { if (!tmp2) tmp2 = document.createElement('canvas'); if (tmp2.width !== w || tmp2.height !== h) { tmp2.width = w; tmp2.height = h; } return tmp2; };

  function shape(ctx, o) {
    const hw = o.w / 2, hh = o.h / 2, p = o.props || {};
    if (o.type === 'ellipse') { ctx.beginPath(); ctx.ellipse(0, 0, Math.abs(hw), Math.abs(hh), 0, 0, Math.PI * 2); }
    else if (o.type === 'triangle') { ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(hw, hh); ctx.lineTo(-hw, hh); ctx.closePath(); }
    else { ctx.beginPath(); const r = Math.min(U.num(p.radius, 0), Math.abs(hw), Math.abs(hh)); if (r > 0 && ctx.roundRect) ctx.roundRect(-hw, -hh, o.w, o.h, r); else ctx.rect(-hw, -hh, o.w, o.h); }
  }

  const rgba = (hex, a) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '#ffffff') || [0, 'ff', 'ff', 'ff']; return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`; };
  const flick = (p, env) => { const f = U.num(p.flicker, 0); if (!f) return 1; const t = (env.time || 0) * 9; return 1 - f * (0.5 + 0.25 * Math.sin(t) + 0.25 * Math.sin(t * 2.3 + 1.7)) * 0.8; };
  let _dk = null;
  /** Darkness overlay: fills the view with the scene's dark colour and cuts a soft hole for every Light. ctx must already carry the world transform. */
  VXRT.drawDarkness = function (ctx, objects, sc, env, cap) {
    let d = U.clamp(U.num(sc && sc.darkness, 0), 0, 1); if (!d) return; if (cap) d = Math.min(d, cap);
    const W = ctx.canvas.width, H = ctx.canvas.height; if (!_dk) _dk = document.createElement('canvas'); if (_dk.width !== W || _dk.height !== H) { _dk.width = W; _dk.height = H; }
    const x = _dk.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.clearRect(0, 0, W, H); x.globalAlpha = d; x.fillStyle = sc.darkColor || '#000000'; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
    x.setTransform(ctx.getTransform()); x.globalCompositeOperation = 'destination-out';
    for (const o of objects) { if (o.type !== 'light2d' || o.alive === false || o.enabled === false || o.visible === false || o.hidden) continue; const p = o.props || {}, r = U.num(p.radius, 260), I = U.clamp(U.num(p.intensity, 1) * flick(p, env), 0, 1), soft = U.clamp(U.num(p.softness, 0.55), 0, 1);
      x.save(); x.translate(o.x, o.y); const gr = x.createRadialGradient(0, 0, r * (1 - soft) * 0.9, 0, 0, r); gr.addColorStop(0, `rgba(0,0,0,${I})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.beginPath();
      if (p.shape === 'cone') { x.moveTo(0, 0); const dir = U.rad(U.num(p.direction, 0) + (o.rot || 0)), a = U.rad(U.num(p.angle, 60)) / 2; x.arc(0, 0, r, dir - a, dir + a); x.closePath(); } else x.arc(0, 0, r, 0, Math.PI * 2); x.fill(); x.restore(); }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(_dk, 0, 0); ctx.restore();
  };
  function drawBody(ctx, o, env) {
    const p = o.props || {};
    switch (o.type) {
      case 'rect': case 'ellipse': case 'triangle':
        shape(ctx, o); ctx.fillStyle = o.color || '#6c8cff'; ctx.fill();
        if (U.num(p.strokeWidth, 0) > 0) { ctx.lineWidth = p.strokeWidth; ctx.strokeStyle = p.stroke || '#ffffff'; ctx.stroke(); } break;
      case 'sprite': {
        const sp = assetsOf(env).sprites?.[p.sprite];
        if (sp) {
          const im = getImage(env, p.sprite, o.anim ? o.anim.frame : 0);
          if (im) { ctx.imageSmoothingEnabled = !(env.settings && env.settings.pixelArt) && !(env.data && env.data.settings && env.data.settings.pixelArt); ctx.drawImage(im, -o.w / 2, -o.h / 2, o.w, o.h); if (p.tint) { /* tint is applied by the Colors block through o.color */ } }
          else { ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); }
        } else if (p.emoji) { ctx.font = Math.min(Math.abs(o.w), Math.abs(o.h)) * 0.8 + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(p.emoji, 0, 2); }
        else { ctx.fillStyle = '#394155'; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h); ctx.strokeStyle = '#6c8cff'; ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h); }
        break;
      }
      case 'light2d': { const r = U.num(p.radius, 260), I = U.clamp(U.num(p.intensity, 1) * flick(p, env), 0, 2); const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, rgba(o.color, 0.45 * I)); gr.addColorStop(1, rgba(o.color, 0)); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = gr; ctx.beginPath(); if (p.shape === 'cone') { ctx.moveTo(0, 0); const d = U.rad(U.num(p.direction, 0)), a = U.rad(U.num(p.angle, 60)) / 2; ctx.arc(0, 0, r, d - a, d + a); ctx.closePath(); } else ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); break; }
      case 'text': {
        const txt = U.tpl(p.text ?? 'Text', Object.assign({}, env.vars, env.sceneVars)); ctx.font = `${p.bold ? 700 : 400} ${U.num(p.size, 24)}px ${p.font || 'system-ui, sans-serif'}`;
        ctx.textAlign = p.align || 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = o.color || '#ffffff';
        const ax = p.align === 'left' ? -o.w / 2 : p.align === 'right' ? o.w / 2 : 0; String(txt).split('\n').forEach((ln, i, a) => ctx.fillText(ln, ax, (i - (a.length - 1) / 2) * U.num(p.size, 24) * 1.2)); break;
      }
      default: { const ct = VXRT.objectTypes && VXRT.objectTypes[o.type]; if (ct && ct.draw) { try { ct.draw(ctx, o, env); } catch (e) { if (!ct._err) { ct._err = 1; console.warn('Object type ' + o.type + ' draw failed: ' + e.message); } } } break; }
    }
  }

  let _bg = null; const getBg = (w, h) => { if (!_bg) _bg = document.createElement('canvas'); if (_bg.width !== w || _bg.height !== h) { _bg.width = w; _bg.height = h; } return _bg; };
  function withShader(ctx, o, env, draw) {
    if (o.fx && o.fx.length && VXRT.fx && VXRT.fx.active1(o)) {
      const pad = 16, W = Math.min(1024, Math.ceil(Math.abs(o.w)) + pad * 2), H = Math.min(1024, Math.ceil(Math.abs(o.h)) + pad * 2), tc = getTmp(W, H), tx = tc.getContext('2d', { willReadFrequently: false });
      tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, W, H); tx.save(); tx.translate(W / 2, H / 2); draw(tx); tx.restore(); if (VXRT.fx.object(env, ctx, o, W, H, tc)) return; return ctx.drawImage(tc, -W / 2, -H / 2);
    }
    const sh = o.shader; if (!sh || !sh.name || sh.name === 'none') return draw(ctx);
    const pad = 28; const W = Math.min(1024, Math.ceil(Math.abs(o.w)) + pad * 2), H = Math.min(1024, Math.ceil(Math.abs(o.h)) + pad * 2); const amt = U.clamp(U.num(sh.amount, 1), 0, 1);
    const tc = getTmp(W, H), tx = tc.getContext('2d', { willReadFrequently: true }); tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, W, H); tx.save(); tx.translate(W / 2, H / 2); draw(tx); tx.restore();
    if (['grayscale', 'invert', 'sepia', 'tint', 'brightness'].includes(sh.name)) {
      const im = tx.getImageData(0, 0, W, H), d = im.data; let tr = 0, tg = 0, tb = 0; if (sh.name === 'tint') { const c = (sh.color || '#ff0000').replace('#', ''); tr = parseInt(c.slice(0, 2), 16); tg = parseInt(c.slice(2, 4), 16); tb = parseInt(c.slice(4, 6), 16); }
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], b = d[i + 2]; let nr = r, ng = gg, nb = b;
        if (sh.name === 'grayscale') { const l = 0.299 * r + 0.587 * gg + 0.114 * b; nr = ng = nb = l; }
        else if (sh.name === 'invert') { nr = 255 - r; ng = 255 - gg; nb = 255 - b; }
        else if (sh.name === 'sepia') { nr = 0.393 * r + 0.769 * gg + 0.189 * b; ng = 0.349 * r + 0.686 * gg + 0.168 * b; nb = 0.272 * r + 0.534 * gg + 0.131 * b; }
        else if (sh.name === 'tint') { nr = (r * tr) / 255; ng = (gg * tg) / 255; nb = (b * tb) / 255; }
        else if (sh.name === 'brightness') { const k = 1 + U.num(sh.value, 0.5); nr = r * k; ng = gg * k; nb = b * k; }
        d[i] = r + (nr - r) * amt; d[i + 1] = gg + (ng - gg) * amt; d[i + 2] = b + (nb - b) * amt;
      }
      tx.putImageData(im, 0, 0); ctx.drawImage(tc, -W / 2, -H / 2);
    } else if (sh.name === 'pixelate') {
      const s = Math.max(2, Math.round(U.num(sh.value, 8) * (0.4 + amt))); const sw = Math.max(1, Math.round(W / s)), shh = Math.max(1, Math.round(H / s)); const t2 = getTmp2(sw, shh), c2 = t2.getContext('2d'); c2.clearRect(0, 0, sw, shh); c2.imageSmoothingEnabled = true; c2.drawImage(tc, 0, 0, sw, shh);
      const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false; ctx.drawImage(t2, -W / 2, -H / 2, W, H); ctx.imageSmoothingEnabled = sm;
    } else if (sh.name === 'blur') {
      const s = Math.max(2, Math.round(U.num(sh.value, 4) * (0.5 + amt))); const sw = Math.max(1, Math.round(W / s)), shh = Math.max(1, Math.round(H / s)); const t2 = getTmp2(sw, shh), c2 = t2.getContext('2d'); c2.clearRect(0, 0, sw, shh); c2.imageSmoothingEnabled = true; c2.drawImage(tc, 0, 0, sw, shh);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(t2, -W / 2, -H / 2, W, H);
    } else if (sh.name === 'glow') {
      ctx.save(); ctx.shadowColor = sh.color || '#6c8cff'; ctx.shadowBlur = 18 * (0.4 + amt); ctx.drawImage(tc, -W / 2, -H / 2); ctx.drawImage(tc, -W / 2, -H / 2); ctx.restore();
    } else if (sh.name === 'outline') {
      const t2 = getTmp2(W, H), c2 = t2.getContext('2d'); c2.clearRect(0, 0, W, H); c2.drawImage(tc, 0, 0); c2.globalCompositeOperation = 'source-in'; c2.fillStyle = sh.color || '#ffffff'; c2.fillRect(0, 0, W, H); c2.globalCompositeOperation = 'source-over';
      const t = Math.max(1, Math.round(U.num(sh.value, 3))); for (let a = 0; a < 8; a++) ctx.drawImage(t2, -W / 2 + Math.cos((a * Math.PI) / 4) * t, -H / 2 + Math.sin((a * Math.PI) / 4) * t); ctx.drawImage(tc, -W / 2, -H / 2);
    } else if (sh.name === 'shadow') {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 10; ctx.shadowOffsetX = 6; ctx.shadowOffsetY = 8; ctx.drawImage(tc, -W / 2, -H / 2); ctx.restore();
    } else ctx.drawImage(tc, -W / 2, -H / 2);
  }
  VXRT.SHADERS_2D = ['none', 'grayscale', 'invert', 'sepia', 'tint', 'brightness', 'pixelate', 'blur', 'glow', 'outline', 'shadow'];

  const draw2D = (VXRT.draw2D = {
    object(ctx, o, env) {
      if (!o.visible || o.type === 'empty' || o.type === 'light' || o.type === 'camera') return;
      const fx = o.fxo || null; ctx.save(); ctx.translate(o.x + (fx && fx.x || 0), o.y + (fx && fx.y || 0)); if (o.rot || (fx && fx.rot)) ctx.rotate(U.rad(o.rot + (fx && fx.rot || 0))); if (fx && (fx.sx || fx.sy)) ctx.scale(fx.sx || 1, fx.sy || 1); if (o.flipX || o.flipY) ctx.scale(o.flipX ? -1 : 1, o.flipY ? -1 : 1);
      ctx.globalAlpha *= U.clamp(o.alpha * (fx && fx.alpha !== undefined ? fx.alpha : 1), 0, 1); ctx.globalCompositeOperation = BLEND[o.blend] || 'source-over';
      withShader(ctx, o, env, (c) => drawBody(c, o, env)); ctx.restore();
    },
    collider(ctx, o) {
      if (o.type === 'empty' || o.isScene) return; ctx.save(); ctx.strokeStyle = o.physics && o.physics.body !== 'none' ? '#4cc38a' : '#f5c451'; ctx.lineWidth = 1; ctx.translate(o.x, o.y);
      if (o.physics && o.physics.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, Math.min(o.w, o.h) / 2, 0, Math.PI * 2); ctx.stroke(); } else ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h); ctx.restore();
    },
    sorted: (objs) => objs.map((o, i) => [o, i]).sort((a, b) => (VXRT.layerRank(a[0]) - VXRT.layerRank(b[0])) || (a[0].order - b[0].order) || (a[1] - b[1])).map((x) => x[0]),
  });

  /* ---- sprite animation ---- */
  VXRT.stepAnim = function (g, o, dt) {
    if (o.type === 'model') { // 3D model pose animation (made in the Model editor → Animate)
      const as = g.data.assets?.models?.[o.props.model], clip = as && as.anims && as.anims[o.anim.name]; if (!clip || !o.obj3d) return;
      if (o._poseName !== o.anim.name) { o._poseName = o.anim.name; VXRT.poseReset(o.obj3d); }
      o.anim.t += dt * (o.anim.speed || 1); const f = VXRT.clipFold(clip, o.anim.t, o.anim.mode || (o.anim.loop === false ? 'once' : clip.loop || 'loop')); const vals = {}; for (const tr of clip.tracks || []) vals[tr.prop] = VXRT.trackValue(tr, f.t);
      VXRT.poseModel(o.obj3d, vals); if (f.done) { o.anim.playing = false; g.emit('animEnd:' + o.id, o.anim.name); o.anim.onDone && o.anim.onDone(); } return;
    }
    if (o.type !== 'sprite') return; const sp = g.data.assets?.sprites?.[o.props.sprite]; if (!sp || !sp.frames || sp.frames.length < 2) return;
    const meta = sp.animMeta && sp.animMeta[o.anim.name]; const list = (sp.anims && sp.anims[o.anim.name]) || sp.frames.map((_, i) => i); const fps = U.num(o.anim.fps || (meta && meta.fps) || sp.fps, 8);
    o.anim.t += dt * fps; let i = Math.floor(o.anim.t); const n = list.length; const mode = o.anim.mode || (meta && meta.loop) || (o.anim.loop === false ? 'once' : 'loop');
    if (mode === 'pingpong' && n > 1) { const period = 2 * n - 2, k = i % period; i = k < n ? k : period - k; }
    else if (mode === 'once' && i >= n) { i = n - 1; if (o.anim.playing) { o.anim.playing = false; g.emit('animEnd:' + o.id, o.anim.name); o.anim.onDone && o.anim.onDone(); } }
    o.anim.frame = list[i % n];
  };

  /* ---- particles (shared by 2D and 3D) ---- */
  VXRT.emitParticles = function (g, p) {
    const list = g.particles || (g.particles = []); const n = Math.min(400, Math.max(1, Math.round(U.num(p.count, 12))));
    for (let i = 0; i < n; i++) {
      const spread = U.rad(U.num(p.spread, 360)), base = U.rad(U.num(p.angle, -90)), a = base + (Math.random() - 0.5) * spread, sp = U.num(p.speed, 120) * (0.5 + Math.random() * 0.8);
      const is3 = g.dim === '3d'; const el = Math.random() * Math.PI * 2;
      list.push({ x: p.x, y: p.y, z: p.z || 0, vx: Math.cos(a) * sp, vy: is3 ? Math.abs(Math.sin(a)) * sp : Math.sin(a) * sp, vz: is3 ? Math.sin(el) * sp * 0.5 : 0, life: 0, max: U.num(p.life, 0.8) * (0.7 + Math.random() * 0.6), size: U.num(p.size, 6) * (0.7 + Math.random() * 0.6), color: p.color || '#ffd54a', emoji: p.emoji || '', gravity: U.num(p.gravity, 0), fade: p.fade !== false, shrink: !!p.shrink });
    }
  };
  VXRT.stepParticles = function (g, dt) {
    const l = g.particles; if (!l || !l.length) return; const is3 = g.dim === '3d';
    for (let i = l.length - 1; i >= 0; i--) { const p = l[i]; p.life += dt; if (p.life >= p.max) { l.splice(i, 1); continue; } p.vy += p.gravity * dt * (is3 ? -1 : 1); p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt * 0.01 * (is3 ? 100 : 0); }
  };
  function drawParticles2D(ctx, g) {
    for (const p of g.particles || []) {
      const t = p.life / p.max; ctx.globalAlpha = p.fade ? 1 - t : 1; const s = p.shrink ? p.size * (1 - t) : p.size;
      if (p.emoji) { ctx.font = s * 2 + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.emoji, p.x, p.y); } else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, s / 2), 0, Math.PI * 2); ctx.fill(); }
    } ctx.globalAlpha = 1;
  }

  /* ---- camera + coordinate helpers ---- */
  VXRT.screenToWorld = (g, sx, sy) => { const c = g.camera2d, W = g.settings.width, H = g.settings.height; return { x: (sx - W / 2) / c.zoom + c.x, y: (sy - H / 2) / c.zoom + c.y }; };
  VXRT.worldToScreen = (g, o) => {
    if (g.dim === '3d') return VXRT.worldToScreen3D ? VXRT.worldToScreen3D(g, o) : { x: 0, y: 0 };
    const c = g.camera2d, W = g.settings.width, H = g.settings.height; return { x: (o.x - c.x) * c.zoom + W / 2, y: (o.y - c.y) * c.zoom + H / 2 };
  };
  VXRT.isInView = function (g, o, margin = 0) {
    if (g.dim === '3d') return VXRT.isInView3D ? VXRT.isInView3D(g, o) : true;
    const c = g.camera2d, vw = g.settings.width / c.zoom / 2 + margin, vh = g.settings.height / c.zoom / 2 + margin;
    return Math.abs(o.x - c.x) - Math.abs(o.w) / 2 < vw && Math.abs(o.y - c.y) - Math.abs(o.h) / 2 < vh;
  };
  function updateCamera2D(g, dt) {
    const c = g.camera2d; if (c.follow && c.follow.alive) { const k = c.lerp >= 1 ? 1 : 1 - Math.pow(1 - c.lerp, dt * 60); c.x += (c.follow.x + c.offX - c.x) * k; c.y += (c.follow.y + c.offY - c.y) * k; }
    if (c.shake > 0) c.shake = Math.max(0, c.shake - dt * 30);
  }

  /* ---- init / resize / render ---- */
  VXRT.initRender = function (g) { g.canvas2d = null; g.canvas3d = null; };
  VXRT.setupScene = function (g, sc) {
    g.particles = []; g.sceneVars = g.sceneVars || {};
    if (g.dim === '2d') {
      if (!g.canvas2d) { const c = document.createElement('canvas'); c.width = g.settings.width; c.height = g.settings.height; c.style.cssText = 'display:block;position:absolute'; g.stageEl.append(c); g.canvas2d = c; g.ctx2d = c.getContext('2d'); }
      g.canvas2d.style.display = 'block'; if (g.canvas3d) g.canvas3d.style.display = 'none'; g.activeCanvas = g.canvas2d; g.canvas2d.style.imageRendering = g.settings.pixelArt ? 'pixelated' : 'auto';
    } else { VXRT.setupScene3D(g, sc); if (g.canvas2d) g.canvas2d.style.display = 'none'; g.activeCanvas = g.canvas3d; }
    VXRT.resizeRender(g);
  };
  VXRT.resizeRender = function (g) {
    if (!g.container) return; const cw = g.container.clientWidth, ch = g.container.clientHeight; if (!cw || !ch) return;
    if (g.canvas2d) { const W = g.settings.width, H = g.settings.height, s = Math.min(cw / W, ch / H); g.canvas2d.style.left = (cw - W * s) / 2 + 'px'; g.canvas2d.style.top = (ch - H * s) / 2 + 'px'; g.canvas2d.style.width = W * s + 'px'; g.canvas2d.style.height = H * s + 'px'; g.guiScale2d = s; }
    if (g.canvas3d && VXRT.resize3D) VXRT.resize3D(g, cw, ch);
    if (g.guiEl) { g.guiEl.style.setProperty('--vx-w', cw + 'px'); }
  };
  VXRT.destroyRender = function (g) { if (VXRT.destroy3D) VXRT.destroy3D(g); g.canvas2d = null; };
  VXRT.render = function (g) {
    const dt = g.paused ? 0 : g.dt; VXRT.stepParticles(g, dt); VXRT.guiUpdate && VXRT.guiUpdate(g, dt);
    if (g.dim === '3d') return VXRT.render3D(g, dt);
    updateCamera2D(g, dt);
    const ctx = g.ctx2d, W = g.settings.width, H = g.settings.height, c = g.camera2d; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g.scene.bg || g.settings.bg; ctx.fillRect(0, 0, W, H);
    const sx = c.shake ? (Math.random() - 0.5) * c.shake : 0, sy = c.shake ? (Math.random() - 0.5) * c.shake : 0;
    ctx.setTransform(c.zoom, 0, 0, c.zoom, W / 2 - c.x * c.zoom + sx, H / 2 - c.y * c.zoom + sy);
    g.imgs = g.imgs || new Map(); if (!g.vars) g.vars = {}; g.assets = g.data.assets;
    const sorted = draw2D.sorted(g.objects), bgFx = VXRT.fx && VXRT.fx.active(g, 'bg'); let rest = sorted;
    if (bgFx) { // Background layer: the scene colour + objects tagged "background" go through their own shader pass
      const isBg = (o) => (o.tags || []).includes('background'); const bc = getBg(W, H), bx = bc.getContext('2d'); bx.setTransform(1, 0, 0, 1, 0, 0); bx.fillStyle = g.scene.bg || g.settings.bg; bx.fillRect(0, 0, W, H); bx.setTransform(c.zoom, 0, 0, c.zoom, W / 2 - c.x * c.zoom + sx, H / 2 - c.y * c.zoom + sy);
      for (const o of sorted) if (isBg(o) && o.alive && o.enabled) draw2D.object(bx, o, g); bx.setTransform(1, 0, 0, 1, 0, 0); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); if (!VXRT.fx.layer(g, ctx, 'bg', bc, W, H)) ctx.drawImage(bc, 0, 0); ctx.restore(); rest = sorted.filter((o) => !isBg(o));
    }
    for (const o of rest) if (o.alive && o.enabled && o.layer !== 'ui') draw2D.object(ctx, o, g);
    drawParticles2D(ctx, g); VXRT.drawDarkness(ctx, g.objects, g.scene, g); if (g.debug) for (const o of g.objects) if (o.layer !== 'ui') draw2D.collider(ctx, o);
    /* UI layer: drawn last in screen space (ignores the camera and screen shake) */
    if (rest.some((o) => o.layer === 'ui')) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(0, 0); for (const o of rest) if (o.layer === 'ui' && o.alive && o.enabled) draw2D.object(ctx, o, g); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); VXRT.fx && VXRT.fx.screen(g, g.canvas2d);
  };
  VXRT.camera2dView = (g) => g.camera2d;
})();
