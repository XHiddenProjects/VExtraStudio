/** @forge-plugin {"id":"css-tools","name":"CSS Tools","version":"1.0.0","description":"Insert a CSS reset, a modern font stack or a colour palette of CSS variables."} */
/** @forge-docs
 * ## Using CSS Tools
 * Run these from the **Command Palette** (Ctrl+Shift+P) while a CSS, HTML or Svelte-style file is active:
 *
 * - **CSS: Insert reset** – a small modern reset.
 * - **CSS: Insert system font stack**.
 * - **CSS: Insert colour variables** – a light/dark ready `:root` palette.
 */
const put = (t) => forge.editor.insertText(t);
forge.commands.register({ id: 'reset', title: 'CSS: Insert reset', run: () => put('*, *::before, *::after { box-sizing: border-box; }\nbody { margin: 0; line-height: 1.5; -webkit-font-smoothing: antialiased; }\nimg, svg, video { max-width: 100%; display: block; }\n') });
forge.commands.register({ id: 'font', title: 'CSS: Insert system font stack', run: () => put("font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;\n") });
forge.commands.register({ id: 'vars', title: 'CSS: Insert colour variables', run: () => put(':root {\n  --bg: #ffffff;\n  --text: #1b1f2a;\n  --accent: #5b7cff;\n  --muted: #6b7280;\n}\n@media (prefers-color-scheme: dark) {\n  :root { --bg: #0f1218; --text: #e6e9f2; --muted: #9aa3bd; }\n}\n') });
