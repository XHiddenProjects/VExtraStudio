/* Vextra Studio – tiny QR code generator (byte mode, error correction M, versions 1-10 = up to 213 characters). No dependencies.
 * VX.qr.matrix(text) -> array of rows of 0/1;  VX.qr.svg(text, { scale, margin, dark, light, label }) -> SVG string. */
(function () {
  const EC = { // error-correction level M: [ec codewords per block, [[blocks, data codewords per block], …]]
    1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]], 6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]],
  };
  const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function rsGen(n) { let p = [1]; for (let i = 0; i < n; i++) { const q = new Array(p.length + 1).fill(0); for (let j = 0; j < p.length; j++) { q[j] ^= p[j]; q[j + 1] ^= gmul(p[j], EXP[i]); } p = q; } return p; }
  function rsRem(data, n) { const g = rsGen(n), r = new Array(n).fill(0); for (const d of data) { const f = d ^ r[0]; r.shift(); r.push(0); if (f) for (let i = 0; i < n; i++) r[i] ^= gmul(g[i + 1], f); } return r; }
  const dataCap = (v) => EC[v][1].reduce((a, [n, k]) => a + n * k, 0);
  function bch(v, poly, bits) { let x = v << bits; const hi = (n) => 31 - Math.clz32(n); for (let i = hi(x); i >= hi(poly); i--) if ((x >> i) & 1) x ^= poly << (i - hi(poly)); return x; }

  function encode(text) {
    const bytes = [...new TextEncoder().encode(String(text))];
    let v = 1; while (v <= 10 && dataCap(v) < bytes.length + (v < 10 ? 2 : 3)) v++;
    if (v > 10) throw new Error('Text too long for the QR code');
    const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
    const cap = dataCap(v) * 8; put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
    const cw = []; for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let pad = 0xec; cw.length < dataCap(v); pad ^= 0xec ^ 0x11) cw.push(pad);
    const [ecn, groups] = EC[v]; const blocks = []; let pos = 0;
    for (const [n, k] of groups) for (let i = 0; i < n; i++) { const d = cw.slice(pos, pos + k); pos += k; blocks.push({ d, e: rsRem(d, ecn) }); }
    const out = []; const maxd = Math.max(...blocks.map((b) => b.d.length));
    for (let i = 0; i < maxd; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
    for (let i = 0; i < ecn; i++) for (const b of blocks) out.push(b.e[i]);
    return { v, words: out };
  }

  function build(v, words, mask) {
    const n = 17 + 4 * v; const m = Array.from({ length: n }, () => new Int8Array(n).fill(-1)); const fn = Array.from({ length: n }, () => new Uint8Array(n));
    const set = (r, c, val) => { if (r >= 0 && c >= 0 && r < n && c < n) { m[r][c] = val ? 1 : 0; fn[r][c] = 1; } };
    const finder = (r, c) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) { const on = i >= 0 && i <= 6 && j >= 0 && j <= 6 && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)); set(r + i, c + j, on); } };
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
    for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const al = ALIGN[v]; for (const r of al) for (const c of al) { if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (c === 6 && r === al[al.length - 1])) continue; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) set(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1); }
    set(n - 8, 8, 1);
    for (let i = 0; i < 9; i++) { if (!fn[8][i]) set(8, i, 0); if (!fn[i][8]) set(i, 8, 0); } for (let i = 0; i < 8; i++) { set(8, n - 1 - i, 0); set(n - 1 - i, 8, 0); }
    set(n - 8, 8, 1);
    if (v >= 7) { const info = (v << 12) | bch(v, 0x1f25, 12); for (let i = 0; i < 18; i++) { const b = (info >> i) & 1; set(Math.floor(i / 3), n - 11 + (i % 3), b); set(n - 11 + (i % 3), Math.floor(i / 3), b); } }
    // data
    const bitsArr = []; for (const w of words) for (let i = 7; i >= 0; i--) bitsArr.push((w >> i) & 1);
    const mk = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0, (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0][mask];
    let bi = 0, up = true;
    for (let c = n - 1; c > 0; c -= 2) { if (c === 6) c--; for (let k = 0; k < n; k++) { const r = up ? n - 1 - k : k; for (let j = 0; j < 2; j++) { const cc = c - j; if (fn[r][cc]) continue; let bit = bi < bitsArr.length ? bitsArr[bi++] : 0; if (mk(r, cc)) bit ^= 1; m[r][cc] = bit; } } up = !up; }
    // format information (level M = 00)
    const fmt = (((0 << 3) | mask) << 10 | bch((0 << 3) | mask, 0x537, 10)) ^ 0x5412;
    const fb = (i) => (fmt >> i) & 1;
    for (let i = 0; i <= 5; i++) m[i][8] = fb(i); m[7][8] = fb(6); m[8][8] = fb(7); m[8][7] = fb(8); for (let i = 9; i < 15; i++) m[8][14 - i] = fb(i);
    for (let i = 0; i < 8; i++) m[8][n - 1 - i] = fb(i); for (let i = 8; i < 15; i++) m[n - 15 + i][8] = fb(i);
    m[n - 8][8] = 1;
    return m.map((row) => Array.from(row, (x) => (x === 1 ? 1 : 0)));
  }
  function penalty(m) {
    const n = m.length; let p = 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { let run = 1; for (let j = 1; j < n; j++) { const a = pass ? m[j][i] : m[i][j], b = pass ? m[j - 1][i] : m[i][j - 1]; if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) if (m[i][j] === m[i][j + 1] && m[i][j] === m[i + 1][j] && m[i][j] === m[i + 1][j + 1]) p += 3;
    const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], rev = [...pat].reverse();
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) for (let j = 0; j + 11 <= n; j++) { const s = []; for (let k = 0; k < 11; k++) s.push(pass ? m[j + k][i] : m[i][j + k]); if (s.every((x, k) => x === pat[k]) || s.every((x, k) => x === rev[k])) p += 40; }
    let dark = 0; for (const r of m) for (const x of r) dark += x; p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
    return p;
  }
  function matrix(text) { const { v, words } = encode(text); let best = null, bp = Infinity; for (let k = 0; k < 8; k++) { const m = build(v, words, k); const p = penalty(m); if (p < bp) { bp = p; best = m; } } return best; }
  function svg(text, o) {
    o = o || {}; const m = matrix(text), n = m.length, q = o.margin == null ? 4 : o.margin, s = o.scale || 6, W = (n + 2 * q) * s; let d = '';
    for (let r = 0; r < n; r++) { let c = 0; while (c < n) { if (!m[r][c]) { c++; continue; } let e = c; while (e < n && m[r][e]) e++; d += `M${(c + q) * s} ${(r + q) * s}h${(e - c) * s}v${s}h${-(e - c) * s}z`; c = e; } }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}" role="img" aria-label="${(o.label || 'QR code').replace(/[&<>"]/g, '')}" shape-rendering="crispEdges"><rect width="${W}" height="${W}" fill="${o.light || '#fff'}"/><path d="${d}" fill="${o.dark || '#000'}"/></svg>`;
  }
  const api = { matrix, svg };
  if (typeof window !== 'undefined') { window.VX = window.VX || {}; window.VX.qr = api; }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
