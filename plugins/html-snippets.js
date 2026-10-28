/** @forge-plugin {"id":"html-snippets","name":"HTML Snippets","version":"1.1.0","description":"Insert HTML5 boilerplate, flex layouts, forms and more from the command palette."} */
/** @forge-docs
 * ## Using HTML Snippets
 * Open the **Command Palette** (Ctrl+Shift+P) and type **HTML: Insert**.
 *
 * | Command | Inserts |
 * |---|---|
 * | HTML: Insert boilerplate | A complete HTML5 page skeleton |
 * | HTML: Insert flex | A flexbox row with three items |
 * | HTML: Insert grid | A responsive auto-fill grid |
 * | HTML: Insert form | A simple form with name and e-mail |
 *
 * The snippet is inserted at the cursor of the active code tab. Combine it with the **Web → Live preview** button to see the result at once.
 */
const S = {
  boilerplate: `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>Document</title>\n  <style>\n    body { font-family: system-ui, sans-serif; margin: 0; }\n  </style>\n</head>\n<body>\n  \n</body>\n</html>\n`,
  flex: `<div style="display:flex;gap:16px;align-items:center;justify-content:space-between">\n  <div>One</div>\n  <div>Two</div>\n  <div>Three</div>\n</div>\n`,
  grid: `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px">\n  <div>Card</div>\n  <div>Card</div>\n  <div>Card</div>\n</div>\n`,
  form: `<form>\n  <label>Name <input name="name" required></label>\n  <label>Email <input type="email" name="email" required></label>\n  <button type="submit">Send</button>\n</form>\n`,
};
for (const [k, v] of Object.entries(S)) forge.commands.register({ id: k, title: 'HTML: Insert ' + k, run: () => forge.editor.insertText(v) });
