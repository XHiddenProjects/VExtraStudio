/** @vx-plugin {"id":"word-count","name":"Word Count","version":"1.1.0","description":"Shows words, characters and reading time in the status bar."} */
/** @vx-docs
 * ## Using Word Count
 * Nothing to click – the **status bar** (bottom right) shows words, characters and an estimated reading time for the active file.
 * If you select text, the numbers describe only the selection.
 */
const item = vx.statusBar.add({ id: 'wc', text: '', align: 'right', tooltip: 'Word count' });
function refresh() {
  const t = vx.editor.getSelection() || vx.editor.getValue();
  const words = (t.trim().match(/\S+/g) || []).length;
  item.update(`${words} words · ${t.length} chars · ~${Math.max(1, Math.round(words / 220))} min read`);
}
vx.editor.onChange(refresh);
vx.editor.onTabChange(refresh);
refresh();
