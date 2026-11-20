/* Vextra game runtime – post-processing shader effects (WebGL). One engine drives the whole screen (Everything / Game layer / Background)
 * and individual objects. UI and label layers use the CSS-filter equivalents of the effects that have one.
 *   VXRT.FX            list of built-in effects  [{ id, label, desc, passes, def, frag }]
 *   VXRT.fx.add(g, entry) / remove / clear     entry: { mode, effect, p:{amount,size,a,b,color,x,y}, file }
 *   VXRT.fx.screen(g, srcCanvas)               called by the renderers after a frame is drawn
 *   VXRT.fx.object(ctx, o, W, H, drawFn)       per-object effects (2D) */
(function () {
  const VXRT = window.VXRT, U = VXRT.util;

  const HEAD = `precision highp float;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uTime, uT, uAmount, uSize, uA, uB, uScale; uniform vec4 uColor; uniform vec2 uPos, uDir;
varying vec2 vUv;
#define uPx (1.0 / uRes)
vec4 T(vec2 uv) { return texture2D(uTex, uv); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec4 blurAt(vec2 uv, vec2 step, float rad) {
  vec4 acc = vec4(0.0); float w = 0.0;
  for (int i = -4; i <= 4; i++) { float f = float(i); float k = exp(-f * f / 8.0); vec4 s = T(uv + step * rad * f / 4.0); acc += vec4(s.rgb * s.a, s.a) * k; w += k; }
  acc /= w; return acc.a > 0.0001 ? vec4(acc.rgb / acc.a, acc.a) : vec4(0.0);
}
`;
  const E = (id, label, desc, def, body, extra) => Object.assign({ id, label, desc, def: Object.assign({ amount: 100, size: 8, a: 0, b: 0, color: '#ffffff', x: 0.5, y: 0.5 }, def), frag: HEAD + 'void main() {\n' + body + '\n}', passes: 1 }, extra || {});

  const LIST = (VXRT.FX = [
    E('bloom', 'Bloom', 'bright areas bleed a soft glow into their surroundings. Layer modes only: it draws outside the sprite, so <i>This object only</i> has no effect', { amount: 70, size: 8, a: 0.55 },
      'vec4 c = T(vUv); vec3 acc = vec3(0.0); float w = 0.0; for (int r = 1; r <= 3; r++) { for (int i = 0; i < 8; i++) { float ang = float(i) * 0.785398; vec2 o = vec2(cos(ang), sin(ang)) * uSize * float(r) / 3.0 * uPx; vec4 s = T(vUv + o); float l = luma(s.rgb); acc += s.rgb * max(l - uA, 0.0) / (1.0 - uA + 0.001) * s.a; w += 1.0; } }\n vec3 glow = acc / w * uAmount * 3.0; gl_FragColor = vec4(c.rgb + glow, max(c.a, min(1.0, luma(glow))));'),
    E('blur', 'Blur', 'a mild, fixed-size softening. For a real adjustable blur use Gaussian Blur', { amount: 100 },
      'vec4 s = vec4(0.0); for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) { vec4 t = T(vUv + vec2(float(x), float(y)) * 1.5 * uPx); s += vec4(t.rgb * t.a, t.a); } s /= 9.0; vec4 b = s.a > 0.0001 ? vec4(s.rgb / s.a, s.a) : vec4(0.0); gl_FragColor = mix(T(vUv), b, uAmount);'),
    E('calibration', 'Calibration', 'adjusts brightness, contrast and saturation of the target', { amount: 100, size: 100, a: 0, b: 0 },
      'vec4 c = T(vUv); vec3 rgb = c.rgb; rgb += uA / 100.0; rgb = (rgb - 0.5) * (1.0 + uB / 100.0) + 0.5; float l = luma(rgb); rgb = mix(vec3(l), rgb, uSize / 100.0); gl_FragColor = vec4(mix(c.rgb, clamp(rgb, 0.0, 1.0), uAmount), c.a);'),
    E('colorShift', 'Color Shift', 'rotates every color around the hue wheel. Ramp it from 0 to 100 for a continuous rainbow', { amount: 0 },
      'vec4 c = T(vUv); float a = uAmount * 6.28318; const mat3 toY = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312); const mat3 fromY = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703); vec3 y = toY * c.rgb; float cs = cos(a), sn = sin(a); y.yz = mat2(cs, -sn, sn, cs) * y.yz; gl_FragColor = vec4(clamp(fromY * y, 0.0, 1.0), c.a);'),
    E('dissolve', 'Dissolve', 'the image crumbles away in blocky cells as <i>amount</i> rises from 0 to 100, with an optional glowing burn rim; run it in reverse to materialize', { amount: 0, size: 12, a: 0.12, color: '#ffa030' },
      'vec4 c = T(vUv); float n = hash(floor(vUv * uRes / uSize)); float thr = uAmount * (1.0 + uA) - uA; if (n < thr) { gl_FragColor = vec4(0.0); return; } if (n < thr + uA) { gl_FragColor = vec4(mix(c.rgb, uColor.rgb, 0.85), c.a); return; } gl_FragColor = c;'),
    E('dotScreen', 'Dot Screen', 'a newsprint halftone of dots whose size follows brightness', { amount: 100, size: 8 },
      'vec2 p = vUv * uRes; vec2 cell = (floor(p / uSize) + 0.5) * uSize; vec4 col = T(cell / uRes); float r = sqrt(luma(col.rgb)) * 0.72; float d = length(p - cell) / uSize; float m = smoothstep(r + 0.08, r - 0.08, d); vec4 o = vec4(col.rgb * m, col.a * (m > 0.02 ? 1.0 : 0.0)); gl_FragColor = mix(T(vUv), o, uAmount);'),
    E('film', 'Film', 'old film stock: animated grain and rolling scan bands', { amount: 60, size: 1 },
      'vec4 c = T(vUv); float g = hash(vUv * uRes * uSize + fract(uTime) * 91.7); float band = smoothstep(0.0, 0.08, abs(fract(vUv.y * 0.6 - uTime * 0.25) - 0.5) - 0.38); vec3 rgb = c.rgb * (1.0 - 0.18 * (1.0 - band) * uAmount) + (g - 0.5) * 0.35 * uAmount; float l = luma(rgb); rgb = mix(rgb, vec3(l) * vec3(1.06, 0.98, 0.86), 0.45 * uAmount); gl_FragColor = vec4(rgb, c.a);'),
    E('gaussianBlur', 'Gaussian Blur', 'a smooth blur with separate horizontal and vertical strength in pixels. Large radii cost frames on big displays', { amount: 100, size: 6, a: 6 },
      'vec2 dir = uDir; float rad = dir.x > 0.5 ? uSize : uA; vec4 b = blurAt(vUv, dir * uPx, rad * uScale); gl_FragColor = b;', { passes: 2 }),
    E('glitch', 'Glitch', 'horizontal bands jump sideways with color fringing, like a corrupted video signal', { amount: 50, size: 24, a: 10 },
      'float tick = floor(uTime * 9.0); float band = floor(vUv.y * uSize); float r = hash(vec2(band, tick)); float on = step(1.0 - uAmount * 0.45, r); float off = (hash(vec2(band + 7.0, tick)) - 0.5) * uA * 0.02 * on; float split = uAmount * 0.006 * on * uA * 0.1; vec2 uv = vUv + vec2(off, 0.0); gl_FragColor = vec4(T(uv + vec2(split, 0.0)).r, T(uv).g, T(uv - vec2(split, 0.0)).b, T(uv).a);'),
    E('grayscale', 'Grayscale', 'drains all color to gray', { amount: 100 },
      'vec4 c = T(vUv); gl_FragColor = vec4(mix(c.rgb, vec3(luma(c.rgb)), uAmount), c.a);'),
    E('hexagon', 'Hexagon', 'rebuilds the target as a honeycomb of flat-colored hexagons', { amount: 100, size: 12 },
      'vec2 p = vUv * uRes / uSize; vec2 r = vec2(1.0, 1.7320508); vec2 h = r * 0.5; vec2 a = mod(p, r) - h; vec2 b = mod(p - h, r) - h; vec2 gv = dot(a, a) < dot(b, b) ? a : b; vec2 id = p - gv; gl_FragColor = mix(T(vUv), T(id * uSize / uRes), uAmount);'),
    E('hq2x', 'HQ2X', 'a gentle smoothing filter that takes the hard edge off scaled-up pixel art', { amount: 100 },
      'vec4 P = T(vUv); vec4 s = P; float n = 1.0; vec2 d[8]; d[0] = vec2(1.0, 0.0); d[1] = vec2(-1.0, 0.0); d[2] = vec2(0.0, 1.0); d[3] = vec2(0.0, -1.0); d[4] = vec2(1.0, 1.0); d[5] = vec2(-1.0, 1.0); d[6] = vec2(1.0, -1.0); d[7] = vec2(-1.0, -1.0);\n for (int i = 0; i < 8; i++) { vec4 q = T(vUv + d[i] * uPx * uScale * 0.5); float w = step(length(q - P), 0.28) * (i < 4 ? 1.0 : 0.6); s += q * w; n += w; } gl_FragColor = mix(P, s / n, uAmount);'),
    E('invert', 'Invert', 'a photographic negative; transparent areas stay transparent', { amount: 100 },
      'vec4 c = T(vUv); gl_FragColor = vec4(mix(c.rgb, 1.0 - c.rgb, uAmount), c.a);'),
    E('lcd', 'LCD', 'RGB subpixel stripes like a handheld screen. The stripes are locked to the display, so they do not move with the camera or the object', { amount: 100 },
      'vec4 c = T(vUv); vec2 p = gl_FragCoord.xy; float s = mod(floor(p.x), 3.0); vec3 m = s < 0.5 ? vec3(1.0, 0.25, 0.25) : s < 1.5 ? vec3(0.25, 1.0, 0.25) : vec3(0.25, 0.25, 1.0); float row = mod(floor(p.y), 3.0) < 1.0 ? 0.7 : 1.0; vec3 o = c.rgb * m * row * 1.45; gl_FragColor = vec4(mix(c.rgb, o, uAmount), c.a);'),
    E('led', 'LED', 'a grid of round glowing dots on black, like a scoreboard. Locked to the display like LCD', { amount: 100, size: 8 },
      'vec2 p = gl_FragCoord.xy; vec2 cell = (floor(p / uSize) + 0.5) * uSize; vec4 col = T(vUv - (p - cell) * uPx); float d = length(p - cell) / uSize; float m = smoothstep(0.46, 0.3, d); vec4 o = vec4(col.rgb * (m * 1.2), 1.0); gl_FragColor = mix(T(vUv), o, uAmount);'),
    E('pixelResolution', 'Pixel Resolution', 're-renders the target at a fixed low resolution, for example 80 by 60 cells across it', { amount: 100, size: 80, a: 60 },
      'vec2 res = vec2(max(uSize, 1.0), max(uA, 1.0)); gl_FragColor = mix(T(vUv), T((floor(vUv * res) + 0.5) / res), uAmount);'),
    E('pixelSize', 'Pixel Size', 'square blocks of a given size in art pixels, staying the same apparent size at any zoom', { amount: 100, size: 4 },
      'float s = max(uSize * uScale, 1.0); vec2 p = vUv * uRes; gl_FragColor = mix(T(vUv), T((floor(p / s) + 0.5) * s / uRes), uAmount);'),
    E('pixelize', 'Pixelize', 'coarse pixel blocks set in the properties panel. This one has no runtime inputs; use Pixel Size to animate block size', { amount: 100, size: 8 },
      'float s = max(uSize, 1.0); vec2 p = vUv * uRes; gl_FragColor = mix(T(vUv), T((floor(p / s) + 0.5) * s / uRes), uAmount);'),
    E('retroTV', 'Retro TV', 'a curved CRT picture tube with scanlines and a soft vignetted edge', { amount: 100, size: 1 },
      'vec2 q = vUv * 2.0 - 1.0; q *= 1.0 + dot(q, q) * 0.1 * uAmount; vec2 uv = q * 0.5 + 0.5; if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; } vec4 c = vec4(T(uv + vec2(0.0012, 0.0)).r, T(uv).g, T(uv - vec2(0.0012, 0.0)).b, max(T(uv).a, 0.0)); float scan = 0.86 + 0.14 * sin(uv.y * uRes.y * 3.14159 / max(uSize, 0.5)); float vig = clamp(1.0 - dot(vUv - 0.5, vUv - 0.5) * 1.5, 0.0, 1.0); c.rgb *= mix(1.0, scan * vig, uAmount); c.a = max(c.a, 0.0); gl_FragColor = vec4(c.rgb, mix(T(vUv).a, 1.0, uAmount));'),
    E('vhs', 'VHS Tape', 'a worn video tape: colour bleed, a rolling tracking glitch band, scanlines, tape noise and a dark vignette', { amount: 100, size: 2 },
      'vec2 uv = vUv; float t = uTime; float by = fract(t * 0.09); float inb = smoothstep(0.06, 0.0, abs(uv.y - by)); uv.x += (hash(vec2(floor(uv.y * uRes.y * 0.5), floor(t * 24.0))) - 0.5) * 0.06 * inb * uAmount + sin(uv.y * uRes.y * 0.2 + t * 4.0) * 0.0007 * uAmount; float cs = (1.0 + uSize) * uPx.x; vec4 c0 = T(uv); vec3 rgb = vec3(T(uv + vec2(cs * 2.0, 0.0)).r, c0.g, T(uv - vec2(cs * 2.0, 0.0)).b); float l = luma(rgb); rgb = mix(vec3(l), rgb, 0.82) * vec3(0.96, 1.02, 1.04); rgb = rgb * 0.9 + 0.045; rgb *= 0.93 + 0.07 * sin(uv.y * uRes.y * 3.14159); rgb += (hash(uv * uRes + fract(t) * 77.0) - 0.5) * (0.10 + 0.25 * inb); rgb += inb * 0.07; rgb *= 1.0 + 0.02 * sin(t * 60.0); float vig = clamp(1.0 - dot(vUv - 0.5, vUv - 0.5) * 1.25, 0.0, 1.0); rgb *= mix(1.0, vig, 0.9); if (uv.x < 0.0 || uv.x > 1.0) rgb = vec3(0.0); gl_FragColor = vec4(mix(T(vUv).rgb, clamp(rgb, 0.0, 1.0), uAmount), mix(T(vUv).a, 1.0, uAmount));'),
    E('scatter', 'Scatter', 'the target blows apart as <i>amount</i> rises from 0 to 100, pixels drifting in a chosen direction and fading; reverse the amount to reassemble', { amount: 0, size: 120, a: 0 },
      'float n = hash(floor(vUv * uRes / 2.0)); float ang = radians(uA) + (n - 0.5) * 1.4; vec2 dv = vec2(cos(ang), -sin(ang)); vec2 uv = vUv - dv * uAmount * uSize * (0.35 + n) * uPx; vec4 c = T(uv); float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0); gl_FragColor = vec4(c.rgb, c.a * inside * (1.0 - uAmount));'),
    E('scroll', 'Scroll', 'slides the texture within its own bounds and wraps it seamlessly, for repeating backgrounds, conveyor belts, flowing water or lava. It has no panel settings; the offsets come from its x and y inputs, in pixels', { amount: 100, a: 0, b: 0 },
      'gl_FragColor = T(fract(vUv - vec2(uA, uB) * uPx));'),
    E('shockwave', 'Shockwave', 'a circular ripple expands outward from a point. Set <i>xpos</i> and <i>ypos</i> first, then send <i>on</i>: the position is read when the shader is turned on', { amount: 60, size: 0.5, a: 0.08, b: 2, x: 0.5, y: 0.5 },
      'vec2 asp = vec2(uRes.x / uRes.y, 1.0); vec2 ctr = vec2(uPos.x, 1.0 - uPos.y); vec2 dv = (vUv - ctr) * asp; float d = length(dv); float r = uT * uSize; float fade = clamp(1.0 - uT / max(uB, 0.1), 0.0, 1.0); float ring = smoothstep(uA, 0.0, abs(d - r)) * fade; vec2 uv = vUv - normalize(dv + 1e-5) / asp * ring * uAmount * 0.12 * sin((d - r) * 30.0); gl_FragColor = T(uv);'),
    E('sphere', 'Sphere', 'wraps the object’s sprite, treated as an equirectangular “unwrapped planet” map, onto a lit, rotating sphere for planets, globes, rolling balls and eyes. Selecting it switches the mode to <i>This object only</i>', { amount: 100, size: 1 },
      'vec2 p = (vUv - 0.5) * 2.0; float r2 = dot(p, p); if (r2 > 1.0) { gl_FragColor = vec4(0.0); return; } float z = sqrt(1.0 - r2); vec3 n = vec3(p, z); float lon = atan(n.x, n.z) + uTime * uSize * 0.6; float lat = asin(clamp(n.y, -1.0, 1.0)); vec4 c = T(vec2(fract(lon / 6.28318 + 0.5), lat / 3.14159 + 0.5)); float lit = clamp(dot(n, normalize(vec3(-0.5, 0.55, 0.7))), 0.0, 1.0) * 0.75 + 0.25; float edge = smoothstep(1.0, 0.97, sqrt(r2)); gl_FragColor = vec4(c.rgb * lit, c.a * edge);', { only: true }),
    E('threshold', 'Threshold', 'hard two-tone: pixels brighter than the limit become white, the rest become transparent. The original colors are discarded', { amount: 100, a: 0.5 },
      'vec4 c = T(vUv); vec4 o = luma(c.rgb) > uA ? vec4(1.0, 1.0, 1.0, c.a) : vec4(0.0); gl_FragColor = mix(c, o, uAmount);'),
    E('wavy', 'Wavy', 'the image ripples with a travelling wave, for underwater or heat haze', { amount: 40, size: 18, a: 3 },
      'vec2 uv = vUv + vec2(sin(vUv.y * uSize + uTime * uA) * 0.02 * uAmount, cos(vUv.x * uSize * 0.8 + uTime * uA * 0.8) * 0.006 * uAmount); gl_FragColor = T(uv);'),
    E('realism', 'Realism (hyper-real camera)', 'a cinematic camera look: filmic tone curve, soft bloom on highlights, lens vignette and colour fringing, fine film grain and a touch of sharpening. In a 3D game it also switches on filmic tone mapping, soft shadows and image-based lighting. Size = bloom radius, Extra A = bloom threshold (0–1), Extra B = grain (0–1)', { amount: 100, size: 10, a: 0.65, b: 0.25 },
      'vec2 d = vUv - 0.5; float r2 = dot(d, d); vec2 ca = d * r2 * 0.012 * uAmount; vec3 c; c.r = T(vUv + ca).r; c.g = T(vUv).g; c.b = T(vUv - ca).b; float al = T(vUv).a; vec3 base = c;\n' +
      'vec3 bl = vec3(0.0); float w = 0.0; for (int k = 1; k <= 3; k++) { for (int i = 0; i < 8; i++) { float ang = float(i) * 0.785398 + float(k) * 0.4; vec2 o = vec2(cos(ang), sin(ang)) * uSize * float(k) / 3.0 * uPx; vec3 s = T(vUv + o).rgb; float l = luma(s); bl += s * smoothstep(uA, 1.0, l); w += 1.0; } } bl /= w; c += bl * 0.9 * uAmount;\n' +
      'vec3 soft = vec3(0.0); for (int i = 0; i < 4; i++) { float ang = float(i) * 1.5708; soft += T(vUv + vec2(cos(ang), sin(ang)) * 1.2 * uPx).rgb; } soft *= 0.25; c += (base - soft) * 0.6 * uAmount;\n' +
      'c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14); c = mix(base, clamp(c, 0.0, 1.0), uAmount);\n' +
      'c *= 1.0 - smoothstep(0.25, 0.85, r2 * 2.2) * 0.55 * uAmount;\n' +
      'float gr = hash(vUv * uRes + fract(uTime) * 91.7) - 0.5; c += gr * uB * 0.18 * uAmount; gl_FragColor = vec4(clamp(c, 0.0, 1.0), al);'),
  ]);
  const BY = new Map(LIST.map((e) => [e.id, e]));
  VXRT.fxById = (id) => BY.get(id);

  VXRT.FX_MODES = [
    ['all', 'Everything', 'apply the shader to the entire game'], ['bg', 'Background', 'only apply the shader to the background layer'], ['game', 'Game Layer', 'only apply the shader to the game layer'],
    ['ui', 'UI Layer', 'only apply the shader to the user interface layer'], ['labels', 'Labels Only', 'only apply the shader to labels'],
    ['object', 'This object only', 'only apply the shader to the current object. An object can carry one shader at a time in this mode; a second Shader behavior on the same object replaces the first'],
  ];

  /* ---------------- WebGL engine ---------------- */
  const VS = 'attribute vec2 p; varying vec2 vUv; void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
  class Engine {
    constructor(visible) {
      this.canvas = document.createElement('canvas'); this.ok = false; this.progs = new Map(); this.failed = new Set(); this.visible = visible;
      const gl = this.canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true, antialias: false, preserveDrawingBuffer: !!visible }); if (!gl) return; this.gl = gl;
      this.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.tex = [gl.createTexture(), gl.createTexture(), gl.createTexture()]; this.fbo = gl.createFramebuffer(); this.ok = true; this.size = [0, 0];
    }
    program(key, frag, log) {
      if (this.progs.has(key)) return this.progs.get(key); if (this.failed.has(key)) return null; const gl = this.gl;
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) || 'shader error'); return o; };
      try { const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, frag)); gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr)); const u = {}; for (const n of ['uTex', 'uRes', 'uTime', 'uT', 'uAmount', 'uSize', 'uA', 'uB', 'uScale', 'uColor', 'uPos', 'uDir']) u[n] = gl.getUniformLocation(pr, n); const rec = { pr, u }; this.progs.set(key, rec); return rec; }
      catch (e) { this.failed.add(key); log && log('Shader "' + key + '" failed: ' + String(e.message).slice(0, 300)); return null; }
    }
    _tex(i, w, h) { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.tex[i]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); }
    /** Run a chain of effects over `src` (a canvas). Result ends up on this.canvas. chain: [{ fx:def, frag?, p, t, scale }] */
    run(src, chain, time, log) {
      const gl = this.gl, W = src.width, H = src.height; if (!W || !H) return false;
      if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
      if (this.size[0] !== W || this.size[1] !== H) { this._tex(1, W, H); this._tex(2, W, H); this.size = [W, H]; }
      gl.viewport(0, 0, W, H); gl.disable(gl.BLEND); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.bindTexture(gl.TEXTURE_2D, this.tex[0]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      for (const c of chain) if (!this.program(c.key, c.frag, log)) return false;
      const passes = []; for (const c of chain) { const n = c.fx.passes || 1; for (let i = 0; i < n; i++) passes.push([c, i]); }
      let cur = 0; // texture holding the current image
      passes.forEach(([c, idx], k) => {
        const last = k === passes.length - 1; const rec = this.program(c.key, c.frag, log); if (!rec) return;
        const target = last ? null : (cur === 1 ? 2 : 1);
        if (target) { gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex[target], 0); } else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.useProgram(rec.pr); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[cur]); const u = rec.u, p = c.p;
        gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uRes, W, H); gl.uniform1f(u.uTime, time); gl.uniform1f(u.uT, c.t || 0); gl.uniform1f(u.uAmount, U.clamp(U.num(p.amount, 100) / 100, 0, 1)); gl.uniform1f(u.uSize, U.num(p.size, 8)); gl.uniform1f(u.uA, U.num(p.a, 0)); gl.uniform1f(u.uB, U.num(p.b, 0)); gl.uniform1f(u.uScale, c.scale || 1);
        const col = String(p.color || '#ffffff').replace('#', '').padEnd(6, '0'); gl.uniform4f(u.uColor, parseInt(col.slice(0, 2), 16) / 255, parseInt(col.slice(2, 4), 16) / 255, parseInt(col.slice(4, 6), 16) / 255, 1); gl.uniform2f(u.uPos, U.num(p.x, 0.5), U.num(p.y, 0.5)); gl.uniform2f(u.uDir, idx === 0 ? 1 : 0, idx === 0 ? 0 : 1);
        if (!last) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } else { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); if (target) cur = target;
      });
      return true;
    }
  }
  VXRT.FxEngine = Engine;

  /* ---------------- entries ---------------- */
  const CUSTOM_HEAD = HEAD; // user shaders get the same uniforms and helpers
  function resolve(g, e) {
    if (e._def) return e._def;
    if (e.effect === 'custom') { const sh = g.data && g.data.assets && g.data.assets.shaders && g.data.assets.shaders[e.file]; if (!sh) { g.log('warn', 'Shader file not found for the Shader block (choose one in its Custom shader setting).'); return null; } const code = String(sh.code || ''); const frag = VXRT.fxCustomFrag(code); return (e._def = { fx: { id: 'custom:' + sh.id, passes: 1 }, frag, key: 'custom:' + sh.id + ':' + frag.length }); }
    const d = BY.get(e.effect); if (!d) return null; return (e._def = { fx: d, frag: d.frag, key: d.id });
  }
  /** Full fragment source for a user shader file (either a whole shader with main(), or just a main body). */
  VXRT.fxCustomFrag = (code) => { code = String(code || ''); return /void\s+main\s*\(/.test(code) ? CUSTOM_HEAD + code.replace(/^\s*precision\s+\w+\s+float\s*;/m, '') : CUSTOM_HEAD + 'void main() {\n' + code + '\n}'; };
  const fx = (VXRT.fx = {
    layers: ['all', 'bg', 'game', 'ui', 'labels'],
    state(g) { return (g.fxState ||= { all: [], bg: [], game: [], ui: [], labels: [] }); },
    /** Add (or replace the entry of the same owner node). entry: { id, mode, effect, file, p, on, owner } */
    set(g, entry) {
      const st = fx.state(g); const d = entry.effect === 'none' ? null : entry.effect === 'custom' ? true : BY.get(entry.effect); entry.t0 = g.time;
      if (entry.mode === 'object') { const o = entry.object; if (!o) return; o.fx = d ? [entry] : []; return; }
      for (const k of fx.layers) st[k] = st[k].filter((x) => x.id !== entry.id); if (d) (st[entry.mode] || st.all).push(entry); fx.sync(g);
    },
    clear(g) { g.fxState = null; fx.sync(g); if (g.fxEngine && g.fxEngine.canvas.parentNode) g.fxEngine.canvas.remove(); g.fxEngine = null; },
    active(g, mode) { const s = g.fxState; return !!(s && s[mode] && s[mode].some((e) => e.on !== false)); },
    sync(g) { /* css layers */
      const s = g.fxState || {}; const css = (list) => { const parts = []; for (const e of list || []) { if (e.on === false) continue; const f = cssOf(e); if (f) parts.push(f); } return parts.join(' '); };
      const ui = css([...(s.all || []), ...(s.ui || [])]); if (g.guiEl) g.guiEl.style.filter = ui || ''; g._fxLabels = css(s.labels); fx.applyLabels(g);
    },
    applyLabels(g) { if (!g.guiEl) return; for (const el of g.guiEl.querySelectorAll('[data-vx-label]')) el.style.filter = g._fxLabels || ''; },
    /** Called after the frame has been drawn on `src`. Returns true when the visible result is now the overlay. */
    screen(g, src) {
      const s = g.fxState; const list = s ? [...s.all, ...s.game].filter((e) => e.on !== false) : []; const eng = g.fxEngine;
      if (!list.length) { if (eng && eng.canvas.style.display !== 'none') { eng.canvas.style.display = 'none'; src.style.visibility = ''; } return false; }
      const e2 = eng || (g.fxEngine = new Engine(true)); if (!e2.ok) { if (!g._fxWarned) { g._fxWarned = 1; g.log('warn', 'Shaders need WebGL, which is not available here.'); } return false; }
      const chain = []; const scale = src.width / Math.max(1, g.settings.width); for (const e of list) { const r = resolve(g, e); if (!r) continue; chain.push({ fx: r.fx, frag: r.frag, key: r.key, p: e.p, t: Math.max(0, g.time - (e.t0 || 0)), scale }); }
      if (!chain.length || !e2.run(src, chain, g.time, (m) => g.log('warn', m))) return false;
      const c = e2.canvas; if (c.parentNode !== src.parentNode) src.parentNode.insertBefore(c, src.nextSibling);
      const st = src.style; c.style.cssText = `position:absolute;left:${st.left || 0};top:${st.top || 0};width:${st.width || '100%'};height:${st.height || '100%'};pointer-events:none;display:block;image-rendering:${st.imageRendering || 'auto'}`; src.style.visibility = 'hidden'; return true;
    },
    active1(o) { return (o.fx || []).some((e) => e.on !== false); },
    /** Run the background-layer effects over `bc` and draw the result into ctx. */
    layer(g, ctx, mode, bc, W, H) {
      const list = (g.fxState[mode] || []).filter((e) => e.on !== false); const eng = g.fxObjEngine || (g.fxObjEngine = new Engine(false)); if (!eng.ok || !list.length) return false;
      const chain = []; for (const e of list) { const r = resolve(g, e); if (r) chain.push({ fx: r.fx, frag: r.frag, key: r.key, p: e.p, t: Math.max(0, g.time - (e.t0 || 0)), scale: W / Math.max(1, g.settings.width) }); }
      if (!chain.length || !eng.run(bc, chain, g.time, (m) => g.log('warn', m))) return false; ctx.drawImage(eng.canvas, 0, 0); return true;
    },
    /** 2D per-object effects. Returns true when it drew the object. */
    object(g, ctx, o, W, H, tc) {
      const list = (o.fx || []).filter((e) => e.on !== false); if (!list.length) return false;
      const eng = g.fxObjEngine || (g.fxObjEngine = new Engine(false)); if (!eng.ok) return false;
      const chain = []; for (const e of list) { const r = resolve(g, e); if (!r) continue; chain.push({ fx: r.fx, frag: r.frag, key: r.key, p: e.p, t: Math.max(0, g.time - (e.t0 || 0)), scale: 1 }); }
      if (!chain.length || !eng.run(tc, chain, g.time, (m) => g.log('warn', m))) return false; ctx.drawImage(eng.canvas, -W / 2, -H / 2); return true;
    },
  });
  /** CSS-filter equivalents used for the UI and label layers (and the GUI part of "Everything"). */
  function cssOf(e) {
    const a = U.clamp(U.num(e.p.amount, 100) / 100, 0, 1), s = U.num(e.p.size, 8);
    switch (e.effect) {
      case 'grayscale': return `grayscale(${a})`; case 'invert': return `invert(${a})`; case 'blur': return `blur(${(1.5 * a).toFixed(2)}px)`; case 'gaussianBlur': return `blur(${(Math.max(U.num(e.p.size, 6), U.num(e.p.a, 6)) * 0.5 * a).toFixed(2)}px)`;
      case 'colorShift': return `hue-rotate(${(a * 360).toFixed(1)}deg)`; case 'calibration': return `brightness(${1 + U.num(e.p.a, 0) / 100}) contrast(${1 + U.num(e.p.b, 0) / 100}) saturate(${U.num(e.p.size, 100) / 100})`;
      case 'bloom': return `drop-shadow(0 0 ${Math.max(2, s * 0.6).toFixed(1)}px rgba(255,255,255,${(0.7 * a).toFixed(2)}))`; case 'film': return `sepia(${(0.5 * a).toFixed(2)}) contrast(${1 + 0.1 * a})`; case 'threshold': return `grayscale(1) contrast(${1 + 40 * a})`;
      default: return '';
    }
  }
})();

(function () {
  const VXRT = window.VXRT; if (!VXRT) return;
  /** Fragment source for a shader FILE used on a 3D object (the same file also works as a screen effect). T(uv) returns the lit surface colour. */
  VXRT.fxCustomFrag3D = (code) => { let f = VXRT.fxCustomFrag(code); f = f.replace('vec4 T(vec2 uv) { return texture2D(uTex, uv); }', 'vec4 T(vec2 uv) { float l = 0.35 + 0.65 * max(dot(normalize(vN), normalize(vV)), 0.0); return vec4(uColor.rgb * l, 1.0); }').replace('varying vec2 vUv;', 'varying vec2 vUv; varying vec3 vN; varying vec3 vV;'); return f; };
})();
