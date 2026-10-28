/** @forge-plugin {"id":"markdown-preview","name":"Markdown Preview","version":"1.1.0","description":"Adds a Preview button and command for .md files."} */
/** @forge-docs
 * ## Using Markdown Preview
 * Open any `.md` file and press **👁 Markdown Preview** in the toolbar, or run **Markdown: Preview current file** from the Command Palette.
 *
 * The preview supports headings, bold, italics, inline code, fenced code blocks, links and bullet lists. It opens in a window on top of the editor and does not change your file.
 */
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function md(src) {
  let h = esc(src);
  h = h.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  h = h.replace(/^###### (.*)$/gm, '<h6>$1</h6>').replace(/^##### (.*)$/gm, '<h5>$1</h5>').replace(/^#### (.*)$/gm, '<h4>$1</h4>')
       .replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h2>$1</h2>').replace(/^# (.*)$/gm, '<h1>$1</h1>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  h = h.replace(/^(?:- |\* )(.*)$/gm, '<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  h = h.split(/\n{2,}/).map((p) => (/^<(h\d|ul|pre)/.test(p.trim()) ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`)).join('\n');
  return `<!doctype html><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;max-width:760px;margin:32px auto;padding:0 20px;color:#222}code{background:#eee;padding:2px 5px;border-radius:4px}pre{background:#f3f4f7;padding:14px;border-radius:8px;overflow:auto}pre code{background:none}</style>${h}`;
}
const open = () => forge.ui.preview(md(forge.editor.getValue()), 'Markdown preview');
forge.commands.register({ id: 'preview', title: 'Markdown: Preview current file', run: open });
forge.toolbar.add({ id: 'btn', label: '👁 Markdown Preview', run: open, when: (ctx) => ctx.language === 'markdown' });
