/** @forge-plugin {"id":"text-tools","name":"Text Tools","version":"1.1.0","description":"Handy commands: format JSON, sort lines, change case, insert date."} */
/** @forge-docs
 * ## Using Text Tools
 * Select some text (or select nothing to affect the whole file) and run a command from the **Command Palette**:
 *
 * - **Text: Format JSON** – pretty-prints valid JSON, shows an error otherwise.
 * - **Text: Sort lines** and **Remove duplicate lines**.
 * - **Text: UPPERCASE** / **lowercase**.
 * - **Text: Insert today's date** (ISO format).
 */
const sel = () => forge.editor.getSelection();
const apply = (fn) => {
  const s = sel();
  if (s) forge.editor.replaceSelection(fn(s)); else forge.editor.setValue(fn(forge.editor.getValue()));
};
forge.commands.register({ id: 'json', title: 'Text: Format JSON', run() {
  try { apply((t) => JSON.stringify(JSON.parse(t), null, 2)); forge.ui.toast('JSON formatted', 'ok'); }
  catch (e) { forge.ui.toast('Not valid JSON: ' + e.message, 'error'); }
} });
forge.commands.register({ id: 'sort', title: 'Text: Sort lines', run: () => apply((t) => t.split('\n').sort((a, b) => a.localeCompare(b)).join('\n')) });
forge.commands.register({ id: 'dedupe', title: 'Text: Remove duplicate lines', run: () => apply((t) => [...new Set(t.split('\n'))].join('\n')) });
forge.commands.register({ id: 'upper', title: 'Text: UPPERCASE', run: () => apply((t) => t.toUpperCase()) });
forge.commands.register({ id: 'lower', title: 'Text: lowercase', run: () => apply((t) => t.toLowerCase()) });
forge.commands.register({ id: 'date', title: 'Text: Insert today\'s date', run: () => forge.editor.insertText(new Date().toISOString().slice(0, 10)) });
