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
    open(project, onAdd) {
      const ta = h('textarea', { spellcheck: false, style: 'width:100%;height:300px;font:13px/1.5 var(--mono,monospace);background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px;resize:vertical;tab-size:4', value: EXAMPLE });
      ta.value = EXAMPLE; const out = h('div', { style: 'font-size:12.5px;margin-top:8px;min-height:44px' });
      let last = null;
      const check = () => { last = VX.vxs.compile(ta.value); out.textContent = '';
        if (last.errors.length) for (const e of last.errors.slice(0, 8)) out.append(h('div', { style: 'color:var(--danger,#e55)' }, `Line ${e.line}: ${e.message}`));
        else out.append(h('div', { style: 'color:var(--ok,#3fb950)' }, `✓ ${last.behaviors.length} behaviour${last.behaviors.length === 1 ? '' : 's'}, ${last.behaviors.reduce((a, b) => a + b.graph.nodes.length, 0)} blocks`));
        for (const w of last.warnings.slice(0, 4)) out.append(h('div', { style: 'color:var(--muted)' }, `Line ${w.line}: ${w.message}`)); add.disabled = !!last.errors.length || !last.behaviors.length; };
      const openFile = h('button', { class: 'btn', onclick: async () => { try { const ps = await window.native.openFile(); const p = ps && (Array.isArray(ps) ? ps[0] : ps); if (!p) return; ta.value = await window.native.readFile(p); check(); } catch (e) { VX.ui.toast(e.message || String(e), 'error'); } } }, 'Open a .vxs file…');
      const add = h('button', { class: 'btn primary', onclick: () => { check(); if (last.errors.length) return; const r = VX.vxs.addTo(project, ta.value); VX.ui.toast(`${r.added} behaviour${r.added === 1 ? '' : 's'} added${r.replaced ? `, ${r.replaced} updated` : ''}. Attach them to objects in the Logic tab.`); m.close(); onAdd && onAdd(r); } }, 'Add to this game');
      ta.addEventListener('input', check); ta.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('    ', s, ta.selectionEnd, 'end'); check(); } });
      const m = VX.ui.modal({ title: 'VXScript → blocks', wide: true, body: h('div', {}, h('p', { style: 'margin-top:0;color:var(--muted);font-size:12.5px' }, 'Write simple lines; they become blocks. Same name = the earlier import is updated. See Docs → VXScript.'), ta, out), actions: [openFile, add] });
      check();
    },
  };
})();
