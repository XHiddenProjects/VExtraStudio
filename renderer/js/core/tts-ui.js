/* Vextra Studio – read-aloud for the app: Alt+R reads the selected text (or the page you are on) and highlights each word. Needs js/game/rt-tts.js. */
(function () {
  const { h } = VX; const T = () => window.VXTTS;
  /** what to read when nothing is selected: the open dialog, the docs page, a web preview … otherwise the main editor area */
  function target() {
    const modal = [...document.querySelectorAll('.modal .modal-body')].pop(); if (modal) return modal;
    const docs = document.querySelector('.docs-main .md, #view-host .md'); if (docs && docs.offsetParent) return docs;
    const md = document.querySelector('#view-host .md, .md-preview, .md'); if (md && md.offsetParent) return md;
    return document.querySelector('#editor-host') || document.querySelector('main') || document.body;
  }
  const ui = (VX.ttsUI = {
    supported: () => !!T() && T().supported(),
    async read(el) {
      if (!ui.supported()) return VX.ui.toast('This device has no text-to-speech voices.', 'warn');
      if (T().state() !== 'idle') { T().stop(); ui.sync(); return; }
      const sel = window.getSelection && window.getSelection(); let r;
      if (!el && sel && !sel.isCollapsed) r = T().readSelection({ onEnd: ui.sync }); else r = T().read(el || target(), { onEnd: ui.sync });
      ui.sync(); const res = await r; if (res && res.ok === false && res.error) VX.ui.toast(res.error, 'warn'); ui.sync();
    },
    toggle() { return ui.read(); },
    pause() { if (!T()) return; if (T().state() === 'paused') T().resume(); else if (T().state() === 'speaking') T().pause(); ui.sync(); },
    stop() { T() && T().stop(); ui.sync(); },
    _btns: new Set(),
    sync() { const on = T() && T().state() !== 'idle'; for (const b of ui._btns) { if (!b.isConnected) { ui._btns.delete(b); continue; } b.textContent = on ? '⏹ Stop reading' : '🔊 Read aloud'; b.setAttribute('aria-pressed', String(!!on)); } },
    /** a 🔊 button; getEl() returns what to read */
    button(getEl) { const b = h('button', { class: 'btn sm', title: 'Read aloud and highlight the words (Alt+R)', onclick: () => ui.read(getEl && getEl()) }, '🔊 Read aloud'); ui._btns.add(b); ui.sync(); return b; },
    settingsRows(row) {
      if (!T()) return [];
      const c = T().config(); const voiceSel = h('select', {}, h('option', { value: '' }, 'Automatic (matches the language)'));
      const fill = () => { const cur = T().config().voice; voiceSel.querySelectorAll('option:not(:first-child)').forEach((o) => o.remove()); for (const v of T().voices()) voiceSel.append(h('option', { value: v.name }, v.name + ' (' + v.lang + ')')); voiceSel.value = cur; };
      fill(); if (window.speechSynthesis) { setTimeout(fill, 600); try { window.speechSynthesis.addEventListener('voiceschanged', fill); } catch { /* old engine */ } }
      voiceSel.onchange = () => T().set({ voice: voiceSel.value });
      const rate = h('input', { type: 'range', min: 0.5, max: 2, step: 0.1, value: c.rate, oninput: () => T().set({ rate: +rate.value }) });
      const pitch = h('input', { type: 'range', min: 0.5, max: 2, step: 0.1, value: c.pitch, oninput: () => T().set({ pitch: +pitch.value }) });
      const color = h('input', { type: 'color', value: c.color, oninput: () => T().set({ color: color.value }) });
      const test = h('button', { class: 'btn sm', onclick: () => T().speakText('This is how the read-aloud voice sounds. Each word is highlighted as it is spoken.') }, 'Test');
      return [
        row('Read aloud (Alt+R)', ui.supported() ? 'Reads the selected text, or the page you are on, with your device voice and highlights each word as it is spoken. Press Alt+R again to stop.' : 'Your device reports no text-to-speech voices, so this is unavailable.', test),
        row('Voice', '', voiceSel), row('Speed', '', rate), row('Pitch', '', pitch), row('Highlight colour', 'The colour behind the word being read.', color),
      ];
    },
  });
  document.addEventListener('keydown', (e) => { if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'r') { e.preventDefault(); ui.toggle(); } });
})();
