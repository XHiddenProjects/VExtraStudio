/* Vextra game runtime – lightweight 2D/3D physics: AABB + circle/sphere colliders, gravity, bounce, friction,
   collision events (enter/stay/exit), joints and ray casts. */
(function () {
  const VXRT = window.VXRT, U = VXRT.util;
  const NONSOLID = new Set(['empty', 'light', 'camera', 'text']);

  function half(o, is3) {
    const circ = o.physics.shape === 'circle' || o.physics.shape === 'sphere';
    const hw = Math.abs(o.w) / 2, hh = Math.abs(o.h) / 2, hd = is3 ? Math.abs(o.d) / 2 : 0;
    return { hw, hh, hd, r: circ ? (is3 ? Math.min(hw, hh, hd) : Math.min(hw, hh)) : 0, circ };
  }
  function pair(a, b, is3, ha, hb) {
    // returns {n:[nx,ny,nz], pen} with normal pointing from a to b, or null
    const dx = b.x - a.x, dy = b.y - a.y, dz = is3 ? b.z - a.z : 0;
    if (ha.circ && hb.circ) {
      const d = Math.hypot(dx, dy, dz), s = ha.r + hb.r; if (d >= s) return null; const inv = d > 1e-6 ? 1 / d : 0;
      return { n: d > 1e-6 ? [dx * inv, dy * inv, dz * inv] : [0, -1, 0], pen: s - d };
    }
    if (ha.circ || hb.circ) {
      const c = ha.circ ? a : b, bx = ha.circ ? b : a, hc = ha.circ ? ha : hb, hx = ha.circ ? hb : ha;
      const px = U.clamp(c.x, bx.x - hx.hw, bx.x + hx.hw), py = U.clamp(c.y, bx.y - hx.hh, bx.y + hx.hh), pz = is3 ? U.clamp(c.z, bx.z - hx.hd, bx.z + hx.hd) : 0;
      let vx = c.x - px, vy = c.y - py, vz = is3 ? c.z - pz : 0; const d = Math.hypot(vx, vy, vz);
      if (d > hc.r) return null;
      if (d > 1e-6) { const inv = 1 / d; const n = [vx * inv, vy * inv, vz * inv]; return { n: ha.circ ? n.map((x) => -x) : n, pen: hc.r - d }; }
      // center inside the box: fall through to AABB
    }
    const ox = ha.hw + hb.hw - Math.abs(dx), oy = ha.hh + hb.hh - Math.abs(dy), oz = is3 ? ha.hd + hb.hd - Math.abs(dz) : Infinity;
    if (ox <= 0 || oy <= 0 || oz <= 0) return null;
    if (ox <= oy && ox <= oz) return { n: [Math.sign(dx) || 1, 0, 0], pen: ox };
    if (oy <= oz) return { n: [0, Math.sign(dy) || 1, 0], pen: oy };
    return { n: [0, 0, Math.sign(dz) || 1], pen: oz };
  }
  /* The circle/box branch above is easy to get backwards, so verify the normal orientation at the end */
  function fixNormal(a, b, r, is3) { const dot = r.n[0] * (b.x - a.x) + r.n[1] * (b.y - a.y) + (is3 ? r.n[2] * (b.z - a.z) : 0); if (dot < 0) r.n = r.n.map((x) => -x); return r; }

  VXRT.stepPhysics = function (g, dt) {
    const is3 = g.dim === '3d', G = g.gravity; const list = [];
    for (const o of g.objects) {
      if (!o.alive || !o.enabled || o.isScene) continue;
      o.grounded = false;
      if (o.physics.body === 'dynamic') {
        o.vx += G.x * o.physics.gravityScale * dt; o.vy += G.y * o.physics.gravityScale * dt; if (is3) o.vz += G.z * o.physics.gravityScale * dt;
        const drag = o.physics.drag || 0; if (drag) { const k = Math.max(0, 1 - drag * dt); o.vx *= k; o.vy *= k; if (is3) o.vz *= k; }
        o.x += o.vx * dt; o.y += o.vy * dt; if (is3) o.z += o.vz * dt;
      }
      if (!NONSOLID.has(o.type) && o.physics.shape !== 'none') list.push(o);
    }
    // joints (distance / spring)
    for (const o of g.objects) if (o.joints) for (const j of o.joints) {
      const t = j.target; if (!t || !t.alive) continue; const dx = t.x - o.x, dy = t.y - o.y, dz = is3 ? t.z - o.z : 0; const d = Math.hypot(dx, dy, dz) || 1e-6; const diff = d - j.distance;
      const k = j.stiffness; const ia = o.physics.body === 'dynamic' ? 1 / o.mass : 0, ib = t.physics.body === 'dynamic' ? 1 / t.mass : 0, s = ia + ib || 1;
      const cx = (dx / d) * diff * k, cy = (dy / d) * diff * k, cz = (dz / d) * diff * k;
      if (ia) { o.x += cx * (ia / s); o.y += cy * (ia / s); if (is3) o.z += cz * (ia / s); o.vx += cx * 8 * (ia / s) * dt * 60 * 0.1; o.vy += cy * 8 * (ia / s) * dt * 60 * 0.1; }
      if (ib) { t.x -= cx * (ib / s); t.y -= cy * (ib / s); if (is3) t.z -= cz * (ib / s); }
    }
    // broad phase: sweep and prune on x
    const hs = new Map(); for (const o of list) hs.set(o, half(o, is3));
    const ext = (o) => { const h = hs.get(o); return h.circ ? h.r : h.hw; };
    list.sort((a, b) => a.x - ext(a) - (b.x - ext(b)));
    const now = new Set();
    for (let i = 0; i < list.length; i++) {
      const a = list[i], ha = hs.get(a), aMax = a.x + ext(a);
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]; if (b.x - ext(b) > aMax) break;
        const pa = a.physics, pb = b.physics; const wantA = pa.body !== 'none' || a.wantsContacts, wantB = pb.body !== 'none' || b.wantsContacts; if (!wantA && !wantB) continue;
        if (a.parent === b || b.parent === a) continue;
        const r0 = pair(a, b, is3, ha, hs.get(b)); if (!r0) continue; const r = fixNormal(a, b, r0, is3);
        const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id; now.add(key);
        const solid = pa.body !== 'none' && pb.body !== 'none' && !pa.sensor && !pb.sensor && (pa.body === 'dynamic' || pb.body === 'dynamic');
        if (solid) {
          const ia = pa.body === 'dynamic' ? 1 / a.mass : 0, ib = pb.body === 'dynamic' ? 1 / b.mass : 0, sum = ia + ib; const [nx, ny, nz] = r.n;
          const corr = r.pen * 1.0;
          a.x -= nx * corr * (ia / sum); a.y -= ny * corr * (ia / sum); if (is3) a.z -= nz * corr * (ia / sum);
          b.x += nx * corr * (ib / sum); b.y += ny * corr * (ib / sum); if (is3) b.z += nz * corr * (ib / sum);
          const rvx = b.vx - a.vx, rvy = b.vy - a.vy, rvz = is3 ? b.vz - a.vz : 0; const vn = rvx * nx + rvy * ny + rvz * nz;
          if (vn < 0) {
            let e = Math.max(pa.bounce, pb.bounce); if (Math.abs(vn) < (is3 ? 2 : 40)) e = 0; const jn = (-(1 + e) * vn) / sum;
            a.vx -= jn * ia * nx; a.vy -= jn * ia * ny; if (is3) a.vz -= jn * ia * nz; b.vx += jn * ib * nx; b.vy += jn * ib * ny; if (is3) b.vz += jn * ib * nz;
            // friction
            const tx = rvx - vn * nx, ty = rvy - vn * ny, tz = rvz - vn * nz; const tl = Math.hypot(tx, ty, tz);
            if (tl > 1e-6) { const mu = Math.sqrt((pa.friction ?? 0.1) * (pb.friction ?? 0.1)); const jt = Math.min(tl / sum, mu * Math.abs(jn)); const ux = tx / tl, uy = ty / tl, uz = tz / tl; a.vx += jt * ia * ux; a.vy += jt * ia * uy; if (is3) a.vz += jt * ia * uz; b.vx -= jt * ib * ux; b.vy -= jt * ib * uy; if (is3) b.vz -= jt * ib * uz; }
          }
          // normal a->b: in 2D y points down (ny>0 => a rests on b); in 3D y points up (ny>0 => b rests on a)
          if (is3) { if (ny > 0.5) b.grounded = true; if (ny < -0.5) a.grounded = true; } else { if (ny > 0.5) a.grounded = true; if (ny < -0.5) b.grounded = true; }
        }
        const had = a.contacts.has(b.id);
        if (!had) { a.contacts.add(b.id); b.contacts.add(a.id); a.lastOther = b; b.lastOther = a; g.emit('collide:' + a.id, { other: b, phase: 'enter' }); g.emit('collide:' + b.id, { other: a, phase: 'enter' }); }
        else { g.emit('collide:' + a.id, { other: b, phase: 'stay' }); g.emit('collide:' + b.id, { other: a, phase: 'stay' }); }
      }
    }
    // exits
    for (const o of list) for (const id of [...o.contacts]) {
      const other = g.byId.get(id); const key = o.id < id ? o.id + '|' + id : id + '|' + o.id;
      if (!now.has(key)) { o.contacts.delete(id); if (other) { other.contacts.delete(o.id); } if (other && o.id < id) { g.emit('collide:' + o.id, { other, phase: 'exit' }); g.emit('collide:' + id, { other: o, phase: 'exit' }); } else if (!other) g.emit('collide:' + o.id, { other: null, phase: 'exit' }); }
    }
    // world bounds (optional)
    const wb = g.scene && g.scene.bounds; if (wb) for (const o of g.objects) if (o.physics.body === 'dynamic') { if (o.y > wb.bottom) { o.y = wb.bottom; o.vy = 0; } }
  };

  /** Ray cast. from/dir are {x,y,z}; returns {obj, dist, x,y,z} or null. filter(o) optional. */
  VXRT.raycast = function (g, from, dir, maxDist, filter) {
    const is3 = g.dim === '3d'; const len = Math.hypot(dir.x, dir.y, is3 ? dir.z || 0 : 0) || 1; const d = { x: dir.x / len, y: dir.y / len, z: (dir.z || 0) / len }; let best = null;
    for (const o of g.objects) {
      if (!o.alive || !o.enabled || o.isScene || NONSOLID.has(o.type) || (filter && !filter(o))) continue;
      const h = half(o, is3); let tmin = 0, tmax = maxDist, ok = true;
      const axes = is3 ? [['x', h.hw], ['y', h.hh], ['z', h.hd]] : [['x', h.hw], ['y', h.hh]];
      for (const [ax, hv] of axes) {
        const p = (from[ax] || 0) - o[ax], dv = d[ax]; if (Math.abs(dv) < 1e-9) { if (Math.abs(p) > hv) { ok = false; break; } continue; }
        let t1 = (-hv - p) / dv, t2 = (hv - p) / dv; if (t1 > t2) [t1, t2] = [t2, t1]; tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) { ok = false; break; }
      }
      if (ok && tmin >= 0 && tmin <= maxDist && (!best || tmin < best.dist)) best = { obj: o, dist: tmin, x: (from.x || 0) + d.x * tmin, y: (from.y || 0) + d.y * tmin, z: (from.z || 0) + d.z * tmin };
    }
    return best;
  };
})();
