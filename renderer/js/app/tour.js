/* Vextra Studio – first-run tour for beginners: a short spotlight walk-through with Back / Next / Skip. Shown once (Simple mode), replay any time from the command menu or the Welcome page. */
(function () {
  const { h } = VX;
  const STEPS = [
    { sel: '#activity', title: 'Welcome to Vextra Studio', text: 'This bar on the left switches the side panel: your files, search, things to create, plugins, themes and the cloud. Let us take a 1-minute look around.', side: 'right' },
    { sel: '#activity [data-view="explorer"]', title: 'Your files', text: 'Open a folder or start a New project here. Everything you make – websites, games, code – lives in files you can see.', side: 'right' },
    { sel: '#activity [data-view="create"]', title: 'Create', text: 'Drag ready-made objects, pages and blocks from here into your game or website. No code needed to start.', side: 'right' },
    { sel: '#tabbar', title: 'Tabs', text: 'Every file, game and website opens as a tab. Games have Scene, Logic (blocks), Assets and Play views. Websites have Pages, Data and Site.', side: 'bottom' },
    { sel: '#activity [data-view="cloud"]', title: 'Cloud & Helpdesk', text: 'Sign in to publish your work to the web, share a project with friends, or open the Helpdesk for computers and tickets.', side: 'right' },
    { sel: '#st-right', title: 'Simple and Advanced', text: 'You are in Simple mode, which hides the expert tools. Click the mode label down here whenever you want everything.', side: 'top' },
    { sel: null, title: 'You are ready', text: 'Press F1 any time for the documentation, or open the Welcome page to start from an example. You can replay this tour from the command menu (“Take the tour”).', side: 'center' },
  ];
  let state = null;

  function end(done) { if (!state) return; const s = state; state = null; s.root.remove(); document.removeEventListener('keydown', s.key, true); window.removeEventListener('resize', s.pos); try { s.prev && s.prev.focus && s.prev.focus(); } catch { /* gone */ } if (done !== false) try { VX.app.set('tourDone', true); } catch { /* settings not ready */ } }

  function start(opts) {
    if (state) return; const steps = STEPS.filter((s) => !s.sel || document.querySelector(s.sel)); if (!steps.length) return;
    const spot = h('div', { class: 'tour-spot', 'aria-hidden': 'true' }), card = h('div', { class: 'tour-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tour-t', 'aria-describedby': 'tour-d' });
    const root = h('div', { class: 'tour' }, h('div', { class: 'tour-shade' }), spot, card); document.body.append(root);
    const s = state = { root, i: 0, prev: document.activeElement };
    const draw = () => {
      const st = steps[s.i], last = s.i === steps.length - 1; card.textContent = '';
      const back = h('button', { class: 'btn sm', disabled: s.i === 0, onclick: () => go(-1) }, 'Back'), next = h('button', { class: 'btn sm primary', onclick: () => (last ? end() : go(1)) }, last ? 'Finish' : 'Next');
      card.append(h('div', { class: 'tour-n' }, `Step ${s.i + 1} of ${steps.length}`), h('h3', { id: 'tour-t' }, st.title), h('p', { id: 'tour-d' }, st.text), h('div', { class: 'tour-b' }, h('button', { class: 'btn sm ghost', onclick: () => end() }, 'Skip tour'), h('span', { class: 'sp' }), back, next));
      s.pos(); next.focus();
    };
    const go = (d) => { s.i = Math.max(0, Math.min(steps.length - 1, s.i + d)); draw(); };
    s.pos = () => {
      const st = steps[s.i], el = st.sel && document.querySelector(st.sel), r = el && el.getBoundingClientRect(), pad = 6, W = innerWidth, H = innerHeight;
      if (r && r.width) { Object.assign(spot.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' }); } else Object.assign(spot.style, { display: 'none' });
      const cw = Math.min(340, W - 24), ch = card.offsetHeight || 170; card.style.width = cw + 'px'; let x = (W - cw) / 2, y = (H - ch) / 2;
      if (r && r.width) { if (st.side === 'right') { x = r.right + 16; y = r.top; } else if (st.side === 'bottom') { x = r.left + 12; y = r.bottom + 16; } else if (st.side === 'top') { x = r.right - cw; y = r.top - ch - 16; } }
      card.style.left = Math.max(12, Math.min(W - cw - 12, x)) + 'px'; card.style.top = Math.max(12, Math.min(H - ch - 12, y)) + 'px';
    };
    s.key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); } else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); s.i === steps.length - 1 ? end() : go(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(-1); } else if (e.key === 'Tab') { const f = [...card.querySelectorAll('button:not([disabled])')]; if (!f.length) return; const i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); } };
    document.addEventListener('keydown', s.key, true); window.addEventListener('resize', s.pos); draw();
  }
  /** Beginners (Simple mode) see the tour once; everyone can replay it. */
  function maybe() { const S = VX.app && VX.app.settings; if (S && S.mode === 'simple' && !S.tourDone) setTimeout(() => start(), 900); }
  VX.tour = { start, end, maybe, steps: STEPS };
})();
