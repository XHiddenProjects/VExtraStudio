/* Vextra Studio – dependency-free ZIP and tar.gz writers (used by "Export website"). Runs in the browser and in Tauri.
 * VX.archive.zip(entries) / VX.archive.tarGz(entries) -> Promise<Uint8Array>.  entries: [{ path, data: Uint8Array|string, mode?, mtime? }] */
(function () {
  const enc = new TextEncoder();
  const bytes = (d) => (typeof d === 'string' ? enc.encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d));
  const clean = (p) => String(p).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\.\.(\/|$)/g, '').replace(/\/+$/, '');

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  async function pipe(data, kind) {
    if (typeof CompressionStream === 'undefined') return null;
    const cs = new CompressionStream(kind); const w = cs.writable.getWriter(); w.write(data); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }
  const concat = (parts) => { let n = 0; for (const p of parts) n += p.length; const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
  const dosTime = (d) => ({ time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() });
  const NO_DEFLATE = /\.(zip|gz|png|jpe?g|gif|webp|mp3|ogg|mp4|webm|woff2?|7z|rar)$/i;

  async function zip(entries) {
    const files = [], central = []; let offset = 0;
    for (const e of entries) {
      const name = enc.encode(clean(e.path) + (e.dir ? '/' : '')); const raw = e.dir ? new Uint8Array(0) : bytes(e.data); const crc = crc32(raw);
      let data = raw, method = 0; if (raw.length > 64 && !NO_DEFLATE.test(e.path)) { const d = await pipe(raw, 'deflate-raw'); if (d && d.length < raw.length) { data = d; method = 8; } }
      const { time, date } = dosTime(e.mtime ? new Date(e.mtime) : new Date());
      const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      files.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 0x031e, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(38, ((e.dir ? 0o40755 : (e.mode || 0o100644)) << 16) >>> 0, true); ch.setUint32(42, offset, true); central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const cd = concat(central); const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cd.length, true); end.setUint32(16, offset, true);
    return concat([...files, cd, new Uint8Array(end.buffer)]);
  }

  function tarHeader(name, size, mode, mtime, type) {
    const h = new Uint8Array(512); const put = (s, o, n) => { const b = enc.encode(s); h.set(b.subarray(0, n), o); };
    let nm = name, prefix = '';
    if (enc.encode(nm).length > 100) { const i = nm.lastIndexOf('/', nm.length - 1); const cut = nm.slice(0, 155).lastIndexOf('/'); if (cut > 0 && nm.length - cut - 1 <= 100) { prefix = nm.slice(0, cut); nm = nm.slice(cut + 1); } else nm = nm.slice(-100); void i; }
    put(nm, 0, 100); put(mode.toString(8).padStart(7, '0') + '\0', 100, 8); put('0000000\0', 108, 8); put('0000000\0', 116, 8); put(size.toString(8).padStart(11, '0') + '\0', 124, 12); put(Math.floor(mtime / 1000).toString(8).padStart(11, '0') + '\0', 136, 12);
    put('        ', 148, 8); put(type, 156, 1); put('ustar\0', 257, 6); put('00', 263, 2); put(prefix, 345, 155);
    let sum = 0; for (let i = 0; i < 512; i++) sum += h[i]; put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8); return h;
  }
  function tar(entries) {
    const parts = [];
    for (const e of entries) {
      const name = clean(e.path) + (e.dir ? '/' : ''); const data = e.dir ? new Uint8Array(0) : bytes(e.data); const mt = e.mtime || Date.now();
      parts.push(tarHeader(name, data.length, e.dir ? 0o755 : (e.mode || 0o644), mt, e.dir ? '5' : '0'), data); const pad = (512 - (data.length % 512)) % 512; if (pad) parts.push(new Uint8Array(pad));
    }
    parts.push(new Uint8Array(1024)); return concat(parts);
  }
  async function tarGz(entries) { const t = tar(entries); const g = await pipe(t, 'gzip'); if (!g) throw new Error('This runtime has no gzip support (CompressionStream). Use ZIP instead.'); return g; }
  const toB64 = (u8) => { let s = ''; const C = 0x8000; for (let i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C)); return btoa(s); };
  const fromB64 = (b) => { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  VX.archive = { zip, tar, tarGz, crc32, toB64, fromB64, hasGzip: () => typeof CompressionStream !== 'undefined' };
})();
