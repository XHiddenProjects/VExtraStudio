/* Vextra game runtime – 3D renderer (three.js). `VXRT.build3D` is shared with the editor viewport so both look identical. */
(function () {
  const VXRT = window.VXRT, U = VXRT.util;
  VXRT.SHADERS_3D = ['none', 'toon', 'wireframe', 'unlit', 'glass', 'hologram', 'fresnel', 'gradient', 'custom'];
  const PRIMS = new Set(['cube', 'sphere', 'cylinder', 'cone', 'plane', 'torus', 'capsule', 'pyramid', 'ramp']);
  VXRT.PRIMS_3D = [...PRIMS];

  /* ---------- geometry ---------- */
  function primGeometry(T, type) {
    switch (type) {
      case 'sphere': return new T.SphereGeometry(0.5, 32, 20);
      case 'cylinder': return new T.CylinderGeometry(0.5, 0.5, 1, 32);
      case 'cone': return new T.ConeGeometry(0.5, 1, 32);
      case 'plane': { const g = new T.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; }
      case 'torus': return new T.TorusGeometry(0.35, 0.15, 16, 48);
      case 'capsule': return new T.CapsuleGeometry(0.3, 0.4, 8, 20);
      case 'pyramid': { const g = new T.ConeGeometry(0.7071, 1, 4); g.rotateY(Math.PI / 4); return g; }
      case 'ramp': { const s = new T.Shape(); s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.5); s.lineTo(0.5, 0.5); s.closePath(); const g = new T.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g; }
      default: return new T.BoxGeometry(1, 1, 1);
    }
  }
  /** Parse a Wavefront .obj text into a BufferGeometry normalised to fit a unit cube. */
  VXRT.parseOBJ = function (T, text) {
    const v = [], pos = [];
    for (const line of text.split(/\r?\n/)) {
      const p = line.trim().split(/\s+/);
      if (p[0] === 'v') v.push([+p[1], +p[2], +p[3]]);
      else if (p[0] === 'f') { const idx = p.slice(1).map((s) => { let i = parseInt(s.split('/')[0], 10); return i < 0 ? v.length + i : i - 1; }); for (let i = 1; i < idx.length - 1; i++) for (const k of [0, i, i + 1]) pos.push(...v[idx[k]]); }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); g.computeBoundingBox();
    const b = g.boundingBox, s = 1 / Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 1e-6); g.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -(b.max.z + b.min.z) / 2); g.scale(s, s, s); return g;
  };
  /** Voxel model -> merged geometry with per-vertex colours, hidden faces culled. */
  VXRT.voxelGeometry = function (T, model) {
    const key = (x, y, z) => x + ',' + y + ',' + z, set = new Map(); for (const [x, y, z, c] of model.voxels || []) set.set(key(x, y, z), c);
    const pos = [], col = [], nor = [], idx = []; const pal = (model.palette || ['#ffffff']).map((h) => new T.Color(h));
    const faces = [[1, 0, 0, [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]], [-1, 0, 0, [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]], [0, 1, 0, [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]], [0, -1, 0, [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]], [0, 0, 1, [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]]], [0, 0, -1, [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]]];
    let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
    for (const [x, y, z, c] of model.voxels || []) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z); maxX = Math.max(maxX, x + 1); maxY = Math.max(maxY, y + 1); maxZ = Math.max(maxZ, z + 1);
      for (const [dx, dy, dz, corners] of faces) {
        if (set.has(key(x + dx, y + dy, z + dz))) continue; const base = pos.length / 3; const color = pal[c % pal.length] || pal[0];
        for (const [cx, cy, cz] of corners) { pos.push(x + cx, y + cy, z + cz); nor.push(dx, dy, dz); col.push(color.r, color.g, color.b); }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    if (pos.length) { const sx = maxX - minX, sy = maxY - minY, sz = maxZ - minZ, s = 1 / Math.max(sx, sy, sz); g.translate(-(minX + maxX) / 2, -minY - sy / 2, -(minZ + maxZ) / 2); g.scale(s, s, s); } return g;
  };

  /* ---------- materials ---------- */
  function texture(T, env, id, rx, ry) {
    const sp = (env.assets || (env.data && env.data.assets) || {}).sprites?.[id]; if (!sp || !sp.frames || !sp.frames[0]) return null;
    const cache = env.tex3d || (env.tex3d = new Map()); const key = id + ':' + sp.frames[0].length; let t = cache.get(key);
    if (!t) { t = new T.TextureLoader().load(sp.frames[0], () => env.onImageLoad && env.onImageLoad()); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.magFilter = T.NearestFilter; cache.set(key, t); }
    const c = t.clone(); c.needsUpdate = true; c.repeat.set(rx || 1, ry || 1); return c;
  }
  function makeMaterial(T, o, env, vertexColors) {
    const m = o.material || {}; const alpha = U.clamp(o.alpha ?? 1, 0, 1), op = (m.opacity ?? 1) * alpha;
    const mat = new T.MeshStandardMaterial({ color: o.color || m.color || '#cccccc', metalness: m.metalness ?? 0.1, roughness: m.roughness ?? 0.7, emissive: m.emissive || '#000000', emissiveIntensity: m.emissiveIntensity ?? 1, transparent: op < 1, opacity: op, wireframe: !!m.wireframe, flatShading: !!m.flat, vertexColors: !!vertexColors, side: o.type === 'plane' ? T.DoubleSide : T.FrontSide });
    if (vertexColors) mat.color.set('#ffffff');
    if (m.texture) { const t = texture(T, env, m.texture, m.repeatX, m.repeatY); if (t) { mat.map = t; } }
    return mat;
  }
  const VERT = 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }';
  function shaderMaterial(T, o, base) {
    const sh = o.shader; if (!sh || !sh.name || sh.name === 'none') return base;
    const col = new T.Color(sh.color || o.color || '#6c8cff'); const U3 = { uTime: { value: 0 }, uColor: { value: col }, uColor2: { value: new T.Color(sh.color2 || '#34e1c5') }, uAmount: { value: U.num(sh.amount, 1) } };
    const mk = (frag, extra) => { const m = new T.ShaderMaterial(Object.assign({ uniforms: U3, vertexShader: VERT, fragmentShader: frag, transparent: true }, extra || {})); m.isVxShader = true; return m; };
    switch (sh.name) {
      case 'toon': { const m = new T.MeshToonMaterial({ color: o.color || '#cccccc', map: base.map || null, vertexColors: base.vertexColors }); return m; }
      case 'wireframe': return new T.MeshBasicMaterial({ color: sh.color || o.color || '#6c8cff', wireframe: true });
      case 'unlit': return new T.MeshBasicMaterial({ color: o.color || '#cccccc', map: base.map || null, vertexColors: base.vertexColors });
      case 'glass': return new T.MeshStandardMaterial({ color: o.color || '#bfe8ff', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.35 });
      case 'hologram': return mk('uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.0-abs(dot(normalize(vN),normalize(vV))),2.0); float scan=0.5+0.5*sin(vUv.y*80.0-uTime*4.0); gl_FragColor=vec4(uColor*(0.35+f*1.4)*(0.6+0.4*scan),0.35+f*0.6); }', { blending: T.AdditiveBlending, depthWrite: false });
      case 'fresnel': return mk('uniform vec3 uColor; uniform vec3 uColor2; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.0-abs(dot(normalize(vN),normalize(vV))),3.0); gl_FragColor=vec4(mix(uColor,uColor2,f),1.0); }', { transparent: false });
      case 'gradient': return mk('uniform vec3 uColor; uniform vec3 uColor2; varying vec2 vUv; void main(){ gl_FragColor=vec4(mix(uColor2,uColor,vUv.y),1.0); }', { transparent: false });
      case 'custom': { try { return mk(sh.code && sh.code.includes('main') ? 'precision highp float; uniform float uTime; uniform vec3 uColor; uniform vec3 uColor2; uniform float uAmount; varying vec2 vUv; varying vec3 vN; varying vec3 vV; ' + sh.code : 'uniform vec3 uColor; void main(){ gl_FragColor=vec4(uColor,1.0); }', { transparent: false }); } catch { return base; } }
      default: return base;
    }
  }
  VXRT.applyShader3D = function (T, o, env) {
    const root = o.obj3d; if (!root) return; root.traverse((ch) => { if (ch.isMesh && ch.userData.baseMat) { ch.material = shaderMaterial(T, o, ch.userData.baseMat); } });
  };

  /* ---------- object builder ---------- */
  VXRT.build3D = function (T, o, env) {
    const p = o.props || {}; let root;
    if (o.type === 'light') {
      const kind = p.kind || 'point', color = o.color || '#ffffff', inten = U.num(p.intensity, 1);
      let L; if (kind === 'directional') { L = new T.DirectionalLight(color, inten * 2); L.castShadow = p.shadows !== false; L.shadow.mapSize.set(1024, 1024); const c = L.shadow.camera; c.left = c.bottom = -30; c.right = c.top = 30; c.near = 0.5; c.far = 120; }
      else if (kind === 'spot') { L = new T.SpotLight(color, inten * 60, 0, U.rad(U.num(p.angle, 40)), 0.4); L.castShadow = p.shadows !== false; }
      else if (kind === 'ambient') L = new T.AmbientLight(color, inten); else if (kind === 'hemisphere') L = new T.HemisphereLight(color, '#223', inten); else { L = new T.PointLight(color, inten * 120, U.num(p.range, 0)); L.castShadow = !!p.shadows; }
      L.userData.isLight = true; root = L;
    } else if (o.type === 'camera' || o.type === 'empty') { root = new T.Group(); }
    else if (o.type === 'model') {
      const as = (env.assets || (env.data && env.data.assets) || {}).models?.[p.model]; root = new T.Group();
      if (as) { const part = buildModel(T, as, o, env); root.add(part); }
      else { const m = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ color: '#ff5577', wireframe: true })); root.add(m); }
    } else if (VXRT.objectTypes && VXRT.objectTypes[o.type] && VXRT.objectTypes[o.type].build) {
      try { root = VXRT.objectTypes[o.type].build(T, o, env) || new T.Group(); } catch (e) { console.warn('Object type ' + o.type + ' build failed: ' + e.message); root = new T.Group(); }
    } else {
      const geo = primGeometry(T, PRIMS.has(o.type) ? o.type : 'cube'); const mat = makeMaterial(T, o, env); const mesh = new T.Mesh(geo, mat); mesh.userData.baseMat = mat; mesh.castShadow = o.castShadow !== false; mesh.receiveShadow = o.receiveShadow !== false; root = mesh;
    }
    root.userData.vxObj = o; root.traverse((c) => { c.userData.vxObj = o; }); return root;
  };
  function buildModel(T, as, o, env) {
    const g = new T.Group();
    if (as.kind === 'voxel') { const geo = VXRT.voxelGeometry(T, as); const mat = makeMaterial(T, o, env, true); const m = new T.Mesh(geo, mat); m.userData.baseMat = mat; m.castShadow = m.receiveShadow = true; g.add(m); }
    else if (as.kind === 'obj') { const geo = VXRT.parseOBJ(T, as.text || ''); const mat = makeMaterial(T, o, env); const m = new T.Mesh(geo, mat); m.userData.baseMat = mat; m.castShadow = m.receiveShadow = true; g.add(m); }
    else if (as.kind === 'group') {
      for (const part of as.parts || []) {
        const sub = Object.assign({ type: 'cube', x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, w: 1, h: 1, d: 1, color: '#cccccc', alpha: 1, material: {}, props: {} }, part);
        const mesh = VXRT.build3D(T, sub, env); mesh.position.set(sub.x, sub.y, sub.z); mesh.rotation.set(U.rad(sub.rx), U.rad(sub.ry), U.rad(sub.rz), 'YXZ'); mesh.scale.set(sub.w, sub.h, sub.d); mesh.traverse((c) => { if (c.userData) c.userData.keepColor = true; }); g.add(mesh);
      }
      const box = new T.Box3().setFromObject(g); const sz = new T.Vector3(); box.getSize(sz); const s = 1 / Math.max(sz.x, sz.y, sz.z, 1e-6); const c = new T.Vector3(); box.getCenter(c);
      g.children.forEach((ch) => { ch.position.sub(c); ch.position.multiplyScalar(s); ch.scale.multiplyScalar(s); });
    }
    return g;
  }
  VXRT.syncTransform3D = function (T, o) {
    const r = o.obj3d; if (!r) return; const fx = o.fxo || {}; r.position.set(o.x + (fx.x || 0), o.y + (fx.y || 0), o.z); r.rotation.set(U.rad(o.rx), U.rad(o.ry), U.rad(o.rz + (fx.rot || 0)), 'YXZ');
    if (!r.userData.isLight && o.type !== 'camera') r.scale.set(o.w * (o.flipX ? -1 : 1) * (fx.sx || 1), o.h * (o.flipY ? -1 : 1) * (fx.sy || 1), o.d * (fx.sx || 1));
  };

  /* ---------- runtime hooks ---------- */
  VXRT.setupScene3D = function (g, sc) {
    const T = window.THREE; if (!T) throw new Error('This scene is 3D but three.js is not loaded');
    if (!g.canvas3d) { const c = document.createElement('canvas'); c.style.cssText = 'display:block;position:absolute;inset:0;width:100%;height:100%'; g.stageEl.append(c); g.canvas3d = c; g.renderer3d = new T.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: !!g.opts.preserveBuffer }); g.renderer3d.shadowMap.enabled = true; g.renderer3d.shadowMap.type = T.PCFSoftShadowMap; g.renderer3d.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); }
    g.canvas3d.style.display = 'block';
    const env = sc.env || {}; g.scene3d = new T.Scene(); g.THREE = T;
    if (env.skyMode === 'gradient') { const cv = document.createElement('canvas'); cv.width = 2; cv.height = 256; const x = cv.getContext('2d'); const gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, env.skyTop || '#3a6bd8'); gr.addColorStop(1, env.skyBottom || '#cfe8ff'); x.fillStyle = gr; x.fillRect(0, 0, 2, 256); const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; g.scene3d.background = t; } else g.scene3d.background = new T.Color(env.sky || sc.bg || '#1a2233');
    if (env.fog) g.scene3d.fog = new T.Fog(env.fogColor || env.sky || '#1a2233', U.num(env.fogNear, 20), U.num(env.fogFar, 120));
    if (env.ambient !== false) g.scene3d.add(new T.AmbientLight(env.ambientColor || '#ffffff', U.num(env.ambientIntensity, 0.45)));
    g.renderer3d.shadowMap.enabled = env.shadows !== false;
    g.cam3d = { mode: 'fixed', fov: 60, pos: { x: 8, y: 6, z: 10 }, target: { x: 0, y: 1, z: 0 }, follow: null, distance: 8, height: 3, lerp: 0.1, yaw: 0, pitch: 0, shake: 0, eye: 1.6 };
    const c3 = sc.camera3d || {}; Object.assign(g.cam3d, c3); g.camera3d = new T.PerspectiveCamera(g.cam3d.fov, 1, 0.1, 1000); g.tex = g.tex || new Map();
    g.renderer3d.setClearColor(env.sky || '#1a2233'); g.raycaster3d = new T.Raycaster(); g.particles3d = null;
  };
  VXRT.onObjectAdded = function (g, o) {
    if (g.dim !== '3d' || !g.scene3d) return; const T = g.THREE; if (o.isScene) return;
    g.imgs = g.imgs || new Map(); g.assets = g.data.assets; const obj = VXRT.build3D(T, o, g); o.obj3d = obj; g.scene3d.add(obj); VXRT.syncTransform3D(T, o);
    if (o.shader && o.shader.name) VXRT.applyShader3D(T, o, g);
    if (o.type === 'camera' && !g._camObj) { g._camObj = o; Object.assign(g.cam3d.pos, { x: o.x, y: o.y, z: o.z }); const d = new T.Vector3(0, 0, -1).applyEuler(new T.Euler(U.rad(o.rx), U.rad(o.ry), U.rad(o.rz), 'YXZ')); g.cam3d.target = { x: o.x + d.x * 10, y: o.y + d.y * 10, z: o.z + d.z * 10 }; if (o.props.fov) g.cam3d.fov = o.props.fov; }
  };
  VXRT.onObjectRemoved = function (g, o) { if (o.obj3d && g.scene3d) { g.scene3d.remove(o.obj3d); o.obj3d.traverse((c) => { if (c.geometry) c.geometry.dispose(); }); o.obj3d = null; } if (g._camObj === o) g._camObj = null; };
  VXRT.resize3D = function (g, cw, ch) { if (!g.renderer3d) return; g.renderer3d.setSize(cw, ch, false); if (g.camera3d) { g.camera3d.aspect = cw / ch; g.camera3d.updateProjectionMatrix(); } };
  VXRT.destroy3D = function (g) { if (g.renderer3d) { g.renderer3d.dispose(); g.renderer3d = null; } };
  VXRT.worldToScreen3D = (g, o) => { if (!g.camera3d) return { x: 0, y: 0 }; const T = g.THREE, v = new T.Vector3(o.x, o.y, o.z).project(g.camera3d); return { x: (v.x * 0.5 + 0.5) * g.container.clientWidth, y: (-v.y * 0.5 + 0.5) * g.container.clientHeight }; };
  VXRT.isInView3D = (g, o) => { if (!g.camera3d) return true; const T = g.THREE; const f = new T.Frustum(); f.setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(g.camera3d.projectionMatrix, g.camera3d.matrixWorldInverse)); return f.intersectsSphere(new T.Sphere(new T.Vector3(o.x, o.y, o.z), Math.max(o.w, o.h, o.d) / 2)); };
  VXRT.pick3D = function (g, sx, sy) {
    if (!g.camera3d) return null; const T = g.THREE, w = g.container.clientWidth, h = g.container.clientHeight; g.raycaster3d.setFromCamera(new T.Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1), g.camera3d);
    const meshes = []; for (const o of g.objects) if (o.obj3d && o.alive && o.visible && !o.isScene) meshes.push(o.obj3d); const hits = g.raycaster3d.intersectObjects(meshes, true); return hits.length ? hits[0].object.userData.vxObj : null;
  };

  VXRT.render3D = function (g, dt) {
    const T = g.THREE; if (!g.renderer3d || !g.scene3d) return; const c = g.cam3d, cam = g.camera3d;
    // sync objects
    for (const o of g.objects) {
      if (!o.obj3d) continue; VXRT.syncTransform3D(T, o); const vis = o.visible && o.enabled; if (o.obj3d.visible !== vis) o.obj3d.visible = vis;
      if (o.dirty3d) { o.dirty3d = false; if (o.obj3d) { g.scene3d.remove(o.obj3d); VXRT.onObjectAdded(g, o); } continue; }
      if (o.obj3d.isMesh || o.obj3d.type === 'Group') o.obj3d.traverse((m) => {
        if (!m.isMesh) return; const mat = m.userData.baseMat; if (mat) {
          if (o._lastColor !== o.color && !mat.map && !mat.vertexColors && !m.userData.keepColor) { mat.color.set(o.color); }
          const op = U.clamp(o.alpha, 0, 1) * ((o.material && o.material.opacity) ?? 1); if (mat.opacity !== op) { mat.opacity = op; mat.transparent = op < 1; mat.needsUpdate = true; }
          if (o.material) { if (o.material.metalness !== undefined) mat.metalness = o.material.metalness; if (o.material.roughness !== undefined) mat.roughness = o.material.roughness; if (o.material.emissive) mat.emissive.set(o.material.emissive); mat.wireframe = !!o.material.wireframe; }
        }
        if (m.material && m.material.isVxShader) m.material.uniforms.uTime.value = g.time;
      });
      o._lastColor = o.color;
      if (o.shaderDirty) { o.shaderDirty = false; VXRT.applyShader3D(T, o, g); }
    }
    // camera
    const fo = c.follow && c.follow.alive ? c.follow : null; const k = c.lerp >= 1 ? 1 : 1 - Math.pow(1 - c.lerp, dt * 60 + 0.0001);
    if (c.mode === 'follow' && fo) { const yaw = U.rad(c.yaw), pit = U.rad(c.pitch); const dx = Math.sin(yaw) * Math.cos(pit) * c.distance, dz = Math.cos(yaw) * Math.cos(pit) * c.distance, dy = Math.sin(pit) * c.distance + c.height; const tx = fo.x + dx, ty = fo.y + dy, tz = fo.z + dz; c.pos.x += (tx - c.pos.x) * k; c.pos.y += (ty - c.pos.y) * k; c.pos.z += (tz - c.pos.z) * k; c.target = { x: fo.x, y: fo.y + 1, z: fo.z }; }
    else if (c.mode === 'orbit') { const t = fo ? { x: fo.x, y: fo.y, z: fo.z } : c.target; const yaw = U.rad(c.yaw), pit = U.rad(c.pitch); c.pos = { x: t.x + Math.sin(yaw) * Math.cos(pit) * c.distance, y: t.y + Math.sin(pit) * c.distance, z: t.z + Math.cos(yaw) * Math.cos(pit) * c.distance }; c.target = { x: t.x, y: t.y, z: t.z }; }
    else if (c.mode === 'fps' && fo) { if (fo.obj3d) fo.obj3d.visible = false; c.pos = { x: fo.x, y: fo.y + c.eye, z: fo.z }; const yaw = U.rad(c.yaw), pit = U.rad(c.pitch); c.target = { x: c.pos.x - Math.sin(yaw) * Math.cos(pit), y: c.pos.y + Math.sin(pit), z: c.pos.z - Math.cos(yaw) * Math.cos(pit) }; }
    cam.fov = c.fov; cam.updateProjectionMatrix(); const sh = c.shake > 0 ? c.shake * 0.05 : 0; if (c.shake > 0) c.shake = Math.max(0, c.shake - dt * 20);
    cam.position.set(c.pos.x + (Math.random() - 0.5) * sh, c.pos.y + (Math.random() - 0.5) * sh, c.pos.z + (Math.random() - 0.5) * sh); cam.lookAt(c.target.x, c.target.y, c.target.z); cam.updateMatrixWorld(); cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    // particles
    const P = g.particles || []; if (P.length) {
      if (!g.particles3d) { const geo = new T.BufferGeometry(); const mat = new T.PointsMaterial({ size: 0.25, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }); g.particles3d = new T.Points(geo, mat); g.particles3d.frustumCulled = false; g.scene3d.add(g.particles3d); }
      const n = P.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), cc = new T.Color(); P.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; cc.set(p.color); const f = p.fade ? 1 - p.life / p.max : 1; col[i * 3] = cc.r * f; col[i * 3 + 1] = cc.g * f; col[i * 3 + 2] = cc.b * f; });
      g.particles3d.geometry.setAttribute('position', new T.BufferAttribute(pos, 3)); g.particles3d.geometry.setAttribute('color', new T.BufferAttribute(col, 3)); g.particles3d.visible = true; g.particles3d.material.size = Math.max(0.1, (P[0].size || 6) / 24);
    } else if (g.particles3d) g.particles3d.visible = false;
    g.renderer3d.render(g.scene3d, cam);
  };
})();
