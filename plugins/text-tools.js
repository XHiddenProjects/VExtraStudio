/** @vx-plugin {"id":"text-tools","name":"Text Tools","version":"1.1.0","description":"Handy commands: format JSON, sort lines, change case, insert date."} */
/** @vx-docs
 * ## Using Text Tools
 * Select some text (or select nothing to affect the whole file) and run a command from the **Command Palette**:
 *
 * - **Text: Format JSON** – pretty-prints valid JSON, shows an error otherwise.
 * - **Text: Sort lines** and **Remove duplicate lines**.
 * - **Text: UPPERCASE** / **lowercase**.
 * - **Text: Insert today's date** (ISO format).
 */
const sel = () => vx.editor.getSelection();
const apply = (fn) => {
  const s = sel();
  if (s) vx.editor.replaceSelection(fn(s)); else vx.editor.setValue(fn(vx.editor.getValue()));
};
vx.commands.register({ id: 'json', title: 'Text: Format JSON', run() {
  try { apply((t) => JSON.stringify(JSON.parse(t), null, 2)); vx.ui.toast('JSON formatted', 'ok'); }
  catch (e) { vx.ui.toast('Not valid JSON: ' + e.message, 'error'); }
} });
vx.commands.register({ id: 'sort', title: 'Text: Sort lines', run: () => apply((t) => t.split('\n').sort((a, b) => a.localeCompare(b)).join('\n')) });
vx.commands.register({ id: 'dedupe', title: 'Text: Remove duplicate lines', run: () => apply((t) => [...new Set(t.split('\n'))].join('\n')) });
vx.commands.register({ id: 'upper', title: 'Text: UPPERCASE', run: () => apply((t) => t.toUpperCase()) });
vx.commands.register({ id: 'lower', title: 'Text: lowercase', run: () => apply((t) => t.toLowerCase()) });
vx.commands.register({ id: 'date', title: 'Text: Insert today\'s date', run: () => vx.editor.insertText(new Date().toISOString().slice(0, 10)) });
