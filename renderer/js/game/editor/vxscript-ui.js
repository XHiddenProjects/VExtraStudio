/* Vextra Studio – VXScript window: write or open a .vxs file, see it compile live, add the result to the open game as block behaviours. */
(function () {
  const { h } = VX;
  const EXAMPLE = `# VXScript turns these lines into blocks. Lines starting with "# " are comments.
behavior "Player controls"

when key left held:
    set velocity x -240
when key right held:
    set velocity x 240
when key space pressed:
    jump
    play sound snd_jump

when touching tag:coin:
    destroy other
    score += 1
    if score >= 5:
        show toast "You collected them all!" kind success
        load level next after 2 seconds
`;
  VX.vxsUI = {
    EXAMPLE,
    /** onAdd(result) is called after behaviours were added to `project`. */
    open(project, onAdd) { return VX.vxsUI._dialog(project, { onAdd }); },
    /** Right-click → “Edit as VXScript”: the behaviour is written as text; Apply replaces its blocks (the behaviour keeps its id and where it is attached). */
    edit(project, beh, onDone) {
      if (!beh || beh.mode === 'code') { VX.ui.toast('This behaviour is written as code, not blocks.', 'warn'); return; }
      const d = VX.vxs.decompile(beh);
      return VX.vxsUI._dialog(project, { beh, text: d.text, lossy: d.lossy, onDone });
    },
    _dialog(project, cfg) {
      const onAdd = cfg.onAdd, beh = cfg.beh, EXAMPLE_TEXT = cfg.text != null ? cfg.text : EXAMPLE;
      const host = h('div', { style: 'height:340px;border:1px solid var(--border);border-radius:8px;overflow:hidden' });
      let ce = null, doc = null;
      const ta = { get value() { return doc ? ce.text(doc) : this._v; }, set value(v) { this._v = v; if (doc) ce.setDocValue(doc, v); } };
      ta._v = EXAMPLE_TEXT; const out = h('div', { style: 'font-size:12.5px;margin-top:8px;min-height:44px' });
      let last = null;
      const check = () => { last = VX.vxs.compile(ta.value); out.textContent = '';
        if (last.errors.length) for (const e of last.errors.slice(0, 8)) out.append(h('div', { style: 'color:var(--danger,#e55)' }, `Line ${e.line}: ${e.message}`));
        else out.append(h('div', { style: 'color:var(--ok,#3fb950)' }, `✓ ${last.behaviors.length} behaviour${last.behaviors.length === 1 ? '' : 's'}, ${last.behaviors.reduce((a, b) => a + b.graph.nodes.length, 0)} blocks`));
        for (const w of last.warnings.slice(0, 4)) out.append(h('div', { style: 'color:var(--muted)' }, `Line ${w.line}: ${w.message}`)); add.disabled = !!last.errors.length || !last.behaviors.length; };
      const openFile = h('button', { class: 'btn', onclick: async () => { try { const ps = await window.native.openFile(); const p = ps && (Array.isArray(ps) ? ps[0] : ps); if (!p) return; ta.value = await window.native.readFile(p); check(); } catch (e) { VX.ui.toast(e.message || String(e), 'error'); } } }, 'Open a .vxs file…');
      const apply = async () => {
        check(); if (last.errors.length) return;
        if (last.behaviors.length !== 1) { VX.ui.toast('Write exactly one behavior here (found ' + last.behaviors.length + ').', 'error'); return; }
        if (cfg.lossy && cfg.lossy.length && !(await VX.ui.confirm('Some parts cannot be written exactly in VXScript:\n\n• ' + cfg.lossy.join('\n• ') + '\n\nApplying replaces the blocks with what the script says (block positions are re-arranged). Continue?', 'Apply anyway'))) return;
        const b = last.behaviors[0]; beh.graph = b.graph; if (VX.GameProject && VX.GameProject.fixWires) VX.GameProject.fixWires(beh.graph); if (b.name) beh.name = b.name; beh.mode = 'graph';
        VX.ui.toast('“' + beh.name + '” updated from the script.', 'ok'); m.close(); cfg.onDone && cfg.onDone(beh);
      };
      const add = h('button', { class: 'btn primary', onclick: beh ? apply : () => { check(); if (last.errors.length) return; const r = VX.vxs.addTo(project, ta.value); VX.ui.toast(`${r.added} behaviour${r.added === 1 ? '' : 's'} added${r.replaced ? `, ${r.replaced} updated` : ''}. Attach them to objects in the Logic tab.`); m.close(); onAdd && onAdd(r); } }, beh ? 'Apply to this behaviour' : 'Add to this game');
      const m = VX.ui.modal({ title: beh ? 'Edit “' + beh.name + '” as VXScript' : 'VXScript → blocks', wide: true, body: h('div', {}, h('p', { style: 'margin-top:0;color:var(--muted);font-size:12.5px' }, beh ? 'This behaviour as text. Change it and press Apply; the blocks are rebuilt. ' : 'Write simple lines; they become blocks. Colours and suggestions appear as you type (Ctrl+Space = all). Same name = the earlier import is updated. See Docs → VXScript.'), host, out), actions: beh ? [add] : [openFile, add] });
      const look = () => { const st = VX.app.settings, th = VX.theme.current(); if (th) ce.setLook(th, { fontSize: st.fontSize, tabSize: 4, wrap: false, fontFamily: st.fontFamily || 'JetBrains Mono, Consolas, monospace' }); };
      if (window.CodeEditor && window.ace) { try { ce = window.CodeEditor.create(host, { onChange: () => check() }); doc = ce.createDoc(EXAMPLE_TEXT, 'vxscript', false); ce.setDoc(doc); look(); setTimeout(() => ce.ed.resize(), 60); } catch { ce = null; doc = null; } }
      if (!ce) { const t = h('textarea', { spellcheck: false, style: 'width:100%;height:100%;box-sizing:border-box;font:13px/1.5 monospace;background:var(--bg);color:var(--text);border:0;padding:10px;tab-size:4' }); t.value = EXAMPLE_TEXT; host.append(t); Object.defineProperty(ta, 'value', { get: () => t.value, set: (v) => { t.value = v; } }); t.addEventListener('input', check); }
      check();
    },
  };
})();
