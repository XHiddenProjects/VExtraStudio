/* Vextra game editor – AI singer for the Music studio (VX.aiSinger).
   Sung vocals (solo or choir) from lyrics + a melody, made by an open-source singing-voice model such as SoulX-Singer (Apache-2.0).
   Such models need Python and usually a GPU, so they cannot run inside the app: they run in a small "singing bridge" on YOUR computer
   (see tools/singing-bridge/) and the studio talks to it over HTTP. The address is yours to set; it defaults to this computer only (127.0.0.1).
   Nothing is sent anywhere but the address you configure, and only when you press "Sing".
   Protocol:  GET  <url>/health → { ok, engine, languages?, voices?:[{id,name}] }
              POST <url>/sing   { lyrics, language, voice, bpm, part, seed, notes:[{start,dur,midi}] }  → audio/wav (start/dur in seconds, start = 0 at the first note)
   The result is a normal audio clip on the timeline. Choir = several parts (soprano … bass) made from the same melody, snapped to the song's scale. */
(function () {
  const KEY = 'vx-singer-url', DEFAULT_URL = 'http://127.0.0.1:8765', MAX = 600, MAX_NOTES = 400;
  const LANGS = [['en', 'English']]; // the bundled bridge phonemizes English; other languages need your own bridge (see tools/singing-bridge)
  /** choir layouts: semitone-ish offsets (in scale steps) from the melody, name, pan */
  const PARTS = [
    { id: 'soprano', name: 'Soprano', steps: 0, oct: 0, pan: -0.25, gain: 1 },
    { id: 'alto', name: 'Alto', steps: -2, oct: 0, pan: -0.55, gain: 0.85 },
    { id: 'tenor', name: 'Tenor', steps: -2, oct: -1, pan: 0.3, gain: 0.85 },
    { id: 'bass', name: 'Bass', steps: -4, oct: -1, pan: 0.6, gain: 0.8 }
  ];
  const CHOIRS = [['2', 'Duet (soprano + alto)'], ['3', 'Trio (soprano, alto, tenor)'], ['4', 'Full choir (SATB)']];
  const getUrl = () => { try { return localStorage.getItem(KEY) || DEFAULT_URL; } catch { return DEFAULT_URL; } };
  const setUrl = (u) => { try { localStorage.setItem(KEY, u); } catch { /* private window */ } };
  /** a clean base address or throws */
  function cleanUrl(u) {
    let x; try { x = new URL(String(u || '').trim()); } catch { throw new Error('That address is not valid. Example: ' + DEFAULT_URL); }
    if (x.protocol !== 'http:' && x.protocol !== 'https:') throw new Error('The address must start with http:// or https://');
    if (x.username || x.password) throw new Error('Do not put a password in the address.');
    return x.origin + (x.pathname === '/' ? '' : x.pathname.replace(/\/+$/, ''));
  }
  async function fetchT(url, opt, ms) {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), ms);
    try { return await fetch(url, Object.assign({}, opt, { signal: ac.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })); }
    catch (e) { if (e && e.name === 'AbortError') throw new Error('The singing bridge took too long to answer.'); throw new Error('Could not reach the singing bridge at ' + url + '. Is it running?'); }
    finally { clearTimeout(tm); }
  }
  /** asks the bridge who it is; returns { ok, engine, languages, voices } */
  async function health(url, ms) {
    const base = cleanUrl(url), r = await fetchT(base + '/health', { method: 'GET' }, ms || 6000);
    if (!r.ok) throw new Error('The singing bridge answered with an error (' + r.status + ').');
    let j; try { j = await r.json(); } catch { throw new Error('That address did not answer like a singing bridge.'); }
    if (!j || j.ok !== true) throw new Error('That address did not answer like a singing bridge.');
    const voices = Array.isArray(j.voices) ? j.voices.filter((v) => v && v.id).map((v) => ({ id: String(v.id).slice(0, 60), name: String(v.name || v.id).slice(0, 60) })).slice(0, 60) : [];
    return { ok: true, engine: String(j.engine || 'singing bridge').slice(0, 60), languages: Array.isArray(j.languages) ? j.languages.map(String) : LANGS.map((l) => l[0]), voices };
  }
  /** the nearest pitch of the scale to midi note m */
  function snap(m, key, scale) { for (let d = 0; d < 7; d++) for (const s of d ? [-d, d] : [0]) if (scale.includes((((m + s - key) % 12) + 12) % 12)) return m + s; return m; }
  /** moves a pitch by `steps` scale degrees (negative = down) and `oct` octaves */
  function degree(m, steps, oct, key, scale) {
    let p = snap(m, key, scale); const dir = steps < 0 ? -1 : 1; let left = Math.abs(steps);
    while (left > 0) { p += dir; if (scale.includes((((p - key) % 12) + 12) % 12)) left--; }
    return p + oct * 12;
  }
  /** one choir part from the melody: notes [{t,d,m}] in beats */
  function harmonise(notes, part, key, scale, lo, hi) {
    return notes.map((n) => { let m = degree(n.m, part.steps, part.oct, key, scale); while (m < lo) m += 12; while (m > hi) m -= 12; return { t: n.t, d: n.d, m }; });
  }
  /** melody → seconds, monophonic (the singer sings one line): of notes that start together only the highest is kept; first note = 0 s */
  function toRequest(notes, bpm) {
    const spb = 60 / (bpm || 120), s = notes.slice().sort((a, b) => a.t - b.t || b.m - a.m), out = []; let end = -1;
    for (const n of s) { if (n.t < end - 1e-6) continue; out.push(n); end = n.t + n.d; }
    const t0 = out.length ? out[0].t : 0;
    return { first: t0 * spb, notes: out.slice(0, MAX_NOTES).map((n) => ({ start: +((n.t - t0) * spb).toFixed(3), dur: +Math.max(0.05, n.d * spb).toFixed(3), midi: Math.round(n.m) })) };
  }
  const blobToUrl = (b) => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.onerror = () => rej(new Error('Could not read the sung audio.')); f.readAsDataURL(b); });
  /** asks the bridge to sing; returns { data: dataURL, first: seconds } */
  async function sing(o) {
    const lyrics = String(o.lyrics || '').replace(/\s+/g, ' ').trim().slice(0, MAX); if (!lyrics) throw new Error('Type the lyrics to sing.');
    if (!o.notes || !o.notes.length) throw new Error('There is no melody to sing – pick a track with notes first.');
    const base = cleanUrl(o.url || getUrl()), q = toRequest(o.notes, o.bpm);
    const body = { lyrics, language: ['en', 'zh', 'yue'].includes(o.language) ? o.language : 'en', voice: String(o.voice || '').slice(0, 60), bpm: Math.round(o.bpm || 120), part: String(o.part || 'solo').slice(0, 20), seed: (o.seed | 0) || 1, notes: q.notes };
    const r = await fetchT(base + '/sing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, o.timeout || 600000);
    if (!r.ok) { let m = ''; try { const j = await r.json(); m = j && j.error ? String(j.error).slice(0, 200) : ''; } catch { /* not json */ } throw new Error('The singer could not make that' + (m ? ': ' + m : ' (error ' + r.status + ').')); }
    const b = await r.blob(); if (!b.size || b.size > 60e6) throw new Error('The singing bridge sent back an unusable file.');
    return { data: await blobToUrl(b.type && /audio|octet/.test(b.type) ? b : new Blob([b], { type: 'audio/wav' })), first: q.first };
  }

  /* ---------- the managed (built-in) singer: desktop app only ---------- */
  const nat = () => (window.native && window.native.isDesktop && window.native.singer) || null;
  const SIZE_NOTE = 'about 8 GB (Python, PyTorch, the SoulX-Singer code and its models)';
  /** progress window for the one-time install; resolves true when the singer is ready */
  function installWithUI() {
    const N = nat(), h = VX.h;
    return new Promise((resolve) => {
      const bar = h('div', { style: 'height:10px;border-radius:6px;background:var(--border,#333);overflow:hidden;margin:10px 0' }, h('i', { style: 'display:block;height:100%;width:0;background:var(--accent,#5b8cff);transition:width .3s' }));
      const msg = h('div', { style: 'min-height:2.6em;opacity:.85;word-break:break-word' }, 'Starting…'), note = h('div', { style: 'opacity:.65;font-size:12px;margin-top:6px' }, 'This takes a while and only happens once. You can keep using Vextra Studio; closing this window does not stop it.');
      let m = null, off = null, fin = false;
      const done = (v) => { if (fin) return; fin = true; try { if (off) off(); } catch { /* ignore */ } resolve(v); };
      const cancel = h('button', { class: 'btn', onclick: () => { N.cancel(); } }, 'Cancel');
      m = VX.ui.modal({ title: 'Installing the AI singer', body: h('div', {}, msg, bar, note), actions: [cancel], dismissable: true, onClose: () => { /* the install keeps going in the background */ } });
      N.onProgress((p) => { if (!p) return; bar.firstChild.style.width = Math.max(1, Math.min(100, p.pct || 0)) + '%'; msg.textContent = String(p.msg || ''); }).then((u) => { off = u; });
      N.install().then(() => { VX.ui.toast('The AI singer is ready.', 'ok'); if (m) m.close(); done(true); }, (e) => {
        if (m) m.close(); const t = String(e && e.message ? e.message : e);
        if (t !== 'cancelled') VX.ui.modal({ title: 'The AI singer could not be installed', body: h('div', {}, h('p', {}, t), h('p', { style: 'opacity:.7' }, 'Nothing is lost: press AI singer again to resume where it stopped. Common causes: no internet, a full disk, or a security program blocking the downloads.')) });
        done(false);
      });
    });
  }
  /** desktop: make sure the built-in singer is installed and running. Returns { ok, managed, url? }; ok:false = stop (message already shown) */
  async function ensureManaged(say) {
    const N = nat(); if (!N) return { ok: true, managed: false };
    let st; try { st = await N.status(); } catch { return { ok: true, managed: false }; }
    if (!st.supported) return { ok: true, managed: false };
    if (!st.installed) {
      let using = false; try { using = !!(await health(DEFAULT_URL, 800)); } catch { /* not running */ }
      if (using) return { ok: true, managed: false }; // your own bridge is already answering
      const yes = await VX.ui.confirm('The AI singer is not installed yet. Vextra Studio can set it up for you now – ' + SIZE_NOTE + ', downloaded once' + (st.gpu ? '' : '. No NVIDIA graphics card was found, so it will run on the processor, which is slow (minutes per song)') + '. It is stored inside Vextra Studio\'s own data folder and removed when you uninstall the app. Install it now?', 'Install the AI singer', { title: 'Install the AI singer?' });
      if (!yes) { say('The AI singer was not installed.', true); return { ok: false }; }
      if (!(await installWithUI())) return { ok: false };
    }
    try { say('Starting the singer…'); const port = await N.start(); return { ok: true, managed: true, url: 'http://127.0.0.1:' + port }; }
    catch (e) { say(e && e.message ? e.message : 'The singer could not start.', true); return { ok: false }; }
  }
  /** after the setup wizard / an update left a note: offer the install once */
  async function handlePending(say) { const N = nat(); if (!N) return; let p = null; try { p = await N.pending(); } catch { return; } if (p === 'install') { try { const st = await N.status(); if (!st.installed) await installWithUI(); } catch { /* shown by the window */ } } }
  /** management dialog: status, location, remove everything */
  async function manage() {
    const N = nat(); if (!N) return VX.ui.toast('The built-in singer is part of the desktop app.', 'info');
    const st = await N.status();
    if (!st.installed && !st.partial) { if (await VX.ui.confirm('The AI singer is not installed. Install it now (' + SIZE_NOTE + ')?', 'Install')) await installWithUI(); return; }
    const ok = await VX.ui.confirm((st.installed ? 'The AI singer is installed' : 'A half-finished AI singer install was found') + ' (' + st.size_mb + ' MB in ' + st.dir + '). Delete all of it? Python, libraries, models and your own voices in its voices folder are removed; you can install it again later.', 'Delete it', { title: 'Remove the AI singer?', danger: true });
    if (!ok) return;
    try { await N.stop(); await N.remove(); VX.ui.toast('The AI singer was removed.', 'ok'); } catch (e) { VX.ui.toast(e && e.message ? e.message : 'Could not remove it.', 'error'); }
  }
  /** the choir parts for a count (2–4) */
  const choir = (n) => PARTS.slice(0, Math.max(2, Math.min(4, n | 0)));
  VX.aiSinger = { DEFAULT_URL, LANGS, PARTS, CHOIRS, MAX, getUrl, setUrl, cleanUrl, health, sing, choir, ensureManaged, installWithUI, handlePending, manage, hasManaged: () => !!nat(), harmonise, _t: { snap, degree, toRequest } };
})();
