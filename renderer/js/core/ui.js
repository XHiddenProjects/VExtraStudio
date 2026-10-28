/* Vextra Studio – dialogs, toasts, menus and form helpers. */
(function () {
  const { h, $ } = VX;
  const layers = [];

  function toast(msg, kind = '') {
    const t = h('div', { class: 'toast ' + kind }, msg);
    $('#toasts').append(t);
    setTimeout(() => t.remove(), kind === 'error' ? 7000 : 3400);
    return t;
  }

  function layer(node, { dismissable = true, onClose, align } = {}) {
    const o = h('div', { class: 'overlay' + (align === 'top' ? ' top' : '') }, node);
    const close = (v) => { const i = layers.indexOf(rec); if (i < 0) return; layers.splice(i, 1); o.remove(); onClose && onClose(v); };
    const rec = { o, close, dismissable };
    o.addEventListener('mousedown', (e) => { if (e.target === o && dismissable) close(); });
    layers.push(rec); $('#overlays').append(o);
    return rec;
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && layers.length) { const top = layers[layers.length - 1]; if (top.dismissable) { e.stopPropagation(); e.preventDefault(); top.close(); } }
  }, true);

  function modal({ title, body, wide, size, actions, onClose, dismissable = true, className = '' }) {
    let rec;
    const m = h('div', { class: 'modal ' + (wide ? 'wide ' : '') + (size || '') + ' ' + className },
      h('div', { class: 'modal-head' }, h('span', {}, title || ''), h('button', { class: 'btn sm ghost', title: 'Close', onclick: () => rec.close() }, VX.icon('x', 14))),
      h('div', { class: 'modal-body' }, typeof body === 'string' ? h('div', { html: body }) : body),
      actions && actions.length ? h('div', { class: 'modal-foot' }, actions) : null);
    rec = layer(m, { dismissable, onClose });
    return { el: m, close: (v) => rec.close(v) };
  }

  function ask(message, def = '', opts = {}) {
    return new Promise((resolve) => {
      let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
      const inp = h('input', { class: 'big', value: def, placeholder: opts.placeholder || message, type: opts.type || 'text' });
      const box = h('div', { class: 'modal small' }, h('div', { class: 'ask-msg' }, message), inp, opts.hint ? h('div', { class: 'ask-hint' }, opts.hint) : null);
      const rec = layer(box, { onClose: () => fin(null), align: 'top' });
      inp.focus(); inp.select();
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = inp.value.trim(); fin(v || null); rec.close(); } });
    });
  }

  function confirm(message, okLabel = 'OK', opts = {}) {
    return new Promise((resolve) => {
      let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
      let rec;
      const ok = h('button', { class: 'btn ' + (opts.danger ? 'danger-fill' : 'primary'), onclick: () => { fin(true); rec.close(); } }, okLabel);
      const box = h('div', { class: 'modal small' },
        h('div', { class: 'confirm-msg' }, opts.title ? h('b', {}, opts.title) : null, typeof message === 'string' ? h('div', {}, message) : message),
        h('div', { class: 'modal-foot' }, h('button', { class: 'btn', onclick: () => { fin(false); rec.close(); } }, 'Cancel'), ok));
      rec = layer(box, { onClose: () => fin(false) });
      ok.focus();
    });
  }

  /** Form dialog. fields: [{key,label,type,value,options,placeholder,hint,required}] → resolves values or null. */
  function form({ title, fields, submit = 'OK', intro, validate, danger }) {
    return new Promise((resolve) => {
      let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
      const inputs = {}; let rec;
      const err = h('div', { class: 'form-error hidden' });
      const rows = fields.map((f) => {
        let input;
        if (f.type === 'select') { input = h('select', {}, (f.options || []).map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v }, l); })); input.value = f.value ?? ''; }
        else if (f.type === 'textarea') input = h('textarea', { rows: f.rows || 4, placeholder: f.placeholder || '' }, f.value ?? '');
        else if (f.type === 'checkbox') { input = h('input', { type: 'checkbox' }); input.checked = !!f.value; }
        else input = h('input', { type: f.type || 'text', value: f.value ?? '', placeholder: f.placeholder || '', autocomplete: f.type === 'password' ? 'off' : undefined });
        inputs[f.key] = input;
        return h('div', { class: 'frow' + (f.type === 'checkbox' ? ' check' : '') }, h('label', {}, f.label), input, f.hint ? h('div', { class: 'hint' }, f.hint) : null);
      });
      const values = () => Object.fromEntries(fields.map((f) => [f.key, f.type === 'checkbox' ? inputs[f.key].checked : f.type === 'number' ? parseFloat(inputs[f.key].value) : inputs[f.key].value]));
      const go = async () => {
        const v = values();
        for (const f of fields) if (f.required && !String(v[f.key] ?? '').trim()) { err.textContent = f.label + ' is required'; err.classList.remove('hidden'); inputs[f.key].focus(); return; }
        if (validate) { const m = await validate(v); if (m) { err.textContent = m; err.classList.remove('hidden'); return; } }
        fin(v); rec.close();
      };
      const body = h('div', { class: 'form' }, intro ? h('p', { class: 'intro' }, intro) : null, rows, err);
      body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); go(); } });
      const m = modal({ title, body, size: 'small', onClose: () => fin(null), actions: [h('button', { class: 'btn', onclick: () => { fin(null); rec.close(); } }, 'Cancel'), h('button', { class: 'btn ' + (danger ? 'danger-fill' : 'primary'), onclick: go }, submit)] });
      rec = { close: m.close };
      const first = Object.values(inputs)[0]; first && first.focus();
    });
  }

  function menu(x, y, items) {
    document.querySelectorAll('.ctx').forEach((n) => n.remove());
    const m = h('div', { class: 'ctx' }, items.map((it) => it === '-' ? h('div', { class: 'ctx-sep' }) : h('div', { class: 'ctx-item' + (it.disabled ? ' disabled' : '') + (it.danger ? ' danger' : ''), onclick: () => { off(); if (!it.disabled) it.run && it.run(); } }, h('span', {}, it.label), it.hint ? h('small', {}, it.hint) : null)));
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 6) + 'px'; m.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
    function off() { m.remove(); document.removeEventListener('mousedown', away, true); }
    function away(e) { if (!m.contains(e.target)) off(); }
    setTimeout(() => document.addEventListener('mousedown', away, true), 0);
    return off;
  }

  /** Preview an HTML string in a sandboxed iframe inside a modal. */
  function preview(html, title) {
    const frame = h('iframe', { class: 'preview-frame', sandbox: 'allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock' });
    frame.srcdoc = html; return modal({ title: title || 'Preview', body: frame, wide: true, className: 'flush' });
  }

  /* form building blocks used by the inspectors */
  const field = (label, input, hint) => h('div', { class: 'field' }, h('label', { title: hint || '' }, label), input);
  const sw = (on, fn) => { const b = h('button', { class: 'switch' + (on ? ' on' : ''), onclick: () => { on = !on; b.classList.toggle('on', on); fn(on); } }); return b; };
  const segmented = (opts, val, fn) => { const wrap = h('div', { class: 'seg' }); const draw = () => { wrap.textContent = ''; for (const [v, l, t] of opts) wrap.append(h('button', { class: v === val ? 'on' : '', title: t || '', onclick: () => { val = v; draw(); fn(v); } }, l)); }; draw(); return wrap; };

  VX.ui = { toast, modal, ask, confirm, form, menu, preview, layer, field, sw, segmented };
})();
