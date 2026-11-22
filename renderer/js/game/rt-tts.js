/* Vextra – read-aloud with word highlighting. Plain script (no dependencies) used by the app, the docs, exported games and built websites.
 * window.VXTTS: supported() · voices() · config() · set({voice,rate,pitch,color}) · read(target, opts) · readSelection(opts) · speakText(text, opts) · stop() · pause() · resume() · state()
 * It speaks with the voices of the device (speechSynthesis) and wraps the words being read in <span class="vxtts-w">; the current one gets .vxtts-on. */
(function (root) {
  'use strict';
  const KEY = 'vx-tts', DEF = { voice: '', rate: 1, pitch: 1, color: '#ffd23f' };
  const synth = () => root.speechSynthesis, supported = () => !!(root.speechSynthesis && root.SpeechSynthesisUtterance);
  function config() { try { return Object.assign({}, DEF, JSON.parse(root.localStorage.getItem(KEY) || '{}')); } catch { return Object.assign({}, DEF); } }
  function css() { const c = config().color; try { root.document.documentElement.style.setProperty('--vxtts-c', /^#[0-9a-f]{3,8}$/i.test(c) ? c : DEF.color); } catch { /* no document */ } }
  function set(o) { const c = Object.assign(config(), o || {}); try { root.localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage blocked */ } css(); return c; }
  const voices = () => { try { return supported() ? synth().getVoices() || [] : []; } catch { return []; } };
  function injectCss() {
    const d = root.document; if (!d || d.getElementById('vxtts-css')) return; const s = d.createElement('style'); s.id = 'vxtts-css';
    s.textContent = '.vxtts-on{background:var(--vxtts-c,#ffd23f)!important;color:#111!important;border-radius:3px;box-shadow:0 0 0 2px var(--vxtts-c,#ffd23f)}.vxtts-cap{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(90vw,720px);z-index:2147483000;background:#0b1220ee;color:#fff;font:600 20px/1.5 system-ui,sans-serif;padding:12px 18px;border-radius:12px;text-align:center;box-shadow:0 4px 24px #0006}';
    (d.head || d.documentElement).append(s); css();
  }
  let cur = null; // the reading in progress
  const BLOCK = /^(P|DIV|LI|UL|OL|H[1-6]|TD|TH|TR|SECTION|ARTICLE|HEADER|FOOTER|NAV|MAIN|BLOCKQUOTE|PRE|FIGURE|FIGCAPTION|FORM|LABEL|BUTTON|A|TABLE|DT|DD|ASIDE)$/;
  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|SELECT|OPTION|SVG|CANVAS|IFRAME|CODE-SKIP)$/i;
  const blockOf = (n) => { let e = n.parentElement; while (e && !BLOCK.test(e.tagName)) e = e.parentElement; return e; };
  function skipped(el) { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { if (SKIP.test(e.tagName) || e.hidden || e.getAttribute('aria-hidden') === 'true' || e.classList.contains('vxtts-skip')) return true; } try { if (el.checkVisibility && !el.checkVisibility()) return true; } catch { /* old engine */ } return false; }

  /** wraps the words of every text node under `target` (limited to `range` when given) → { words, restore } */
  function wrap(target, range) {
    const d = target.ownerDocument || root.document, words = [], saved = [];
    const walker = d.createTreeWalker(target, 4); const nodes = []; for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    let lastBlock = null, prev = null;
    for (const n of nodes) {
      if (!n.data.trim() || skipped(n.parentElement)) continue;
      let s = 0, e = n.data.length;
      if (range) { if (!range.intersectsNode(n)) continue; if (n === range.startContainer) s = range.startOffset; if (n === range.endContainer) e = range.endOffset; if (e <= s || !n.data.slice(s, e).trim()) continue; }
      const blk = blockOf(n); if (prev && blk !== lastBlock) prev.brk = true; lastBlock = blk;
      const text = n.data, parent = n.parentNode, made = [], add = (x) => { made.push(x); };
      if (s) add(d.createTextNode(text.slice(0, s)));
      for (const part of text.slice(s, e).split(/(\s+)/)) { if (!part) continue; if (/^\s+$/.test(part)) add(d.createTextNode(part)); else { const sp = d.createElement('span'); sp.className = 'vxtts-w'; sp.textContent = part; add(sp); const w = { el: sp, text: part, brk: false }; words.push(w); prev = w; } }
      if (e < text.length) add(d.createTextNode(text.slice(e)));
      for (const x of made) parent.insertBefore(x, n); parent.removeChild(n); saved.push({ parent, orig: n, made });
    }
    return { words, restore() { for (const r of saved) { if (!r.made[0] || !r.made[0].parentNode) continue; r.made[0].parentNode.insertBefore(r.orig, r.made[0]); for (const x of r.made) if (x.parentNode) x.parentNode.removeChild(x); } saved.length = 0; } };
  }
  /** sentence-sized chunks: [{ text, from, offs:[char offset of each word] }] */
  function chunks(words) {
    const out = []; let from = 0, text = '', offs = [];
    const flush = (i) => { if (offs.length) out.push({ text, from, offs }); from = i; text = ''; offs = []; };
    words.forEach((w, i) => { offs.push(text.length + (text ? 1 : 0)); text += (text ? ' ' : '') + w.text; const end = /[.!?…]["')\]]?$/.test(w.text) || w.brk; if (end || text.length > 220) { if (w.brk && !/[.!?…:;,]$/.test(w.text)) text += '.'; flush(i + 1); } });
    flush(words.length); return out;
  }
  function stop() { const c = cur; cur = null; if (!c) return; c.done(); }
  function read(target, opts) {
    opts = opts || {}; injectCss(); stop();
    if (!supported()) return Promise.resolve({ ok: false, error: 'This device has no text-to-speech voices.' });
    const el = typeof target === 'string' ? root.document.querySelector(target) : target || root.document.body; if (!el) return Promise.resolve({ ok: false, error: 'Nothing to read.' });
    const w = wrap(el, opts.range); if (!w.words.length) { w.restore(); return Promise.resolve({ ok: false, error: 'There is no text to read here.' }); }
    const cs = chunks(w.words), conf = Object.assign(config(), opts.voiceOptions || {}); const rate = opts.rate || conf.rate;
    return new Promise((resolve) => {
      let ci = 0, wi = -1, paused = false, timer = null, ended = false;
      const mark = (i) => { if (i === wi || i < 0 || i >= w.words.length) return; if (wi >= 0 && w.words[wi]) w.words[wi].el.classList.remove('vxtts-on'); wi = i; const e = w.words[i].el; e.classList.add('vxtts-on'); try { const r = e.getBoundingClientRect(); if (r.top < 0 || r.bottom > (root.innerHeight || 800)) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* ignore */ } opts.onWord && opts.onWord(w.words[i].text, i); };
      const finish = (res) => { if (ended) return; ended = true; clearInterval(timer); try { synth().cancel(); } catch { /* ignore */ } if (wi >= 0 && w.words[wi]) w.words[wi].el.classList.remove('vxtts-on'); w.restore(); if (cur === me) cur = null; opts.onEnd && opts.onEnd(res); resolve(res); };
      const me = { done: () => finish({ ok: true, stopped: true }), pause() { paused = true; try { synth().pause(); } catch { /* ignore */ } }, resume() { paused = false; try { synth().resume(); } catch { /* ignore */ } }, get paused() { return paused; } };
      cur = me;
      const next = () => {
        if (ended) return; if (ci >= cs.length) return finish({ ok: true });
        const ch = cs[ci++]; const u = new root.SpeechSynthesisUtterance(ch.text); u.rate = rate; u.pitch = conf.pitch;
        const vs = voices(); const v = (conf.voice && vs.find((x) => x.name === conf.voice)) || (opts.lang ? vs.find((x) => x.lang && x.lang.toLowerCase().startsWith(String(opts.lang).toLowerCase())) : null) || (vs.find((x) => x.lang && root.document && root.document.documentElement.lang && x.lang.toLowerCase().startsWith(root.document.documentElement.lang.toLowerCase().slice(0, 2)))); if (v) { u.voice = v; u.lang = v.lang; }
        let got = false, k = 0; const at = (charIndex) => { let i = 0; for (let j = 0; j < ch.offs.length; j++) if (ch.offs[j] <= charIndex) i = j; mark(ch.from + i); };
        u.onstart = () => { mark(ch.from); setTimeout(() => { if (!got && !ended && cur === me) { /* this voice sends no word events: step through the words by their length */ const step = () => { if (ended || got) return; if (!paused) { k++; if (k < ch.offs.length) mark(ch.from + k); } timer = setTimeout(step, Math.max(140, (w.words[ch.from + Math.min(k, ch.offs.length - 1)].text.length * 65 + 120) / rate)); }; step(); } }, 700); };
        u.onboundary = (e) => { if (e.name && e.name !== 'word') return; got = true; clearTimeout(timer); at(e.charIndex || 0); };
        u.onend = () => { clearTimeout(timer); next(); };
        u.onerror = (e) => { clearTimeout(timer); if (e && (e.error === 'interrupted' || e.error === 'canceled')) return; finish({ ok: false, error: (e && e.error) || 'speech error' }); };
        try { synth().speak(u); } catch (e2) { finish({ ok: false, error: e2.message }); }
      };
      next();
    });
  }
  function readSelection(opts) {
    const sel = root.getSelection && root.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return Promise.resolve({ ok: false, error: 'Select some text first.' });
    const r = sel.getRangeAt(0).cloneRange(); let n = r.commonAncestorContainer; if (n.nodeType === 3) n = n.parentElement; sel.removeAllRanges();
    return read(n, Object.assign({}, opts, { range: r }));
  }
  /** speaks text that is not on the page and shows it as a caption with the current word highlighted */
  function speakText(text, opts) {
    opts = opts || {}; injectCss(); const d = root.document; const cap = d.createElement('div'); cap.className = 'vxtts-cap'; if (opts.caption === false) cap.style.display = 'none'; cap.textContent = String(text); d.body.append(cap);
    return read(cap, Object.assign({}, opts, { onEnd: (r) => { cap.remove(); opts.onEnd && opts.onEnd(r); } })).then((r) => { cap.remove(); return r; });
  }
  const state = () => (!cur ? 'idle' : cur.paused ? 'paused' : 'speaking');
  root.VXTTS = { supported, voices, config, set, read, readSelection, speakText, stop, pause() { cur && cur.pause(); }, resume() { cur && cur.resume(); }, state };
  if (root.document) { if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', injectCss); else injectCss(); }
})(typeof window !== 'undefined' ? window : globalThis);
