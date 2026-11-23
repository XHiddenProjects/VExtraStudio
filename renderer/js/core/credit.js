/* Vextra Studio credit: the "made with" line and copyright that exported websites and games carry.
   Games show it on their loading page (see game/editor/loader.js); websites get a footer.
   The text is fixed; colours, alignment and which pages carry it are customizable. */
(function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HEX = /^#[0-9a-f]{3,8}$/i;
  const C = {
    app: 'Vextra Studio', owner: 'XHiddenProjects', url: 'https://github.com/XHiddenProjects',
    year() { return new Date().getFullYear(); },
    /** "Made with Vextra Studio · © 2026 XHiddenProjects" as plain text */
    text() { return `Made with ${C.app} · © ${C.year()} ${C.owner}`; },
    /** footer options: align left|center|right, theme auto|light|dark, pages all|home */
    footerHTML(o = {}) {
      const align = ['left', 'center', 'right'].includes(o.align) ? o.align : 'center'; const theme = ['light', 'dark', 'auto'].includes(o.theme) ? o.theme : 'auto';
      const col = theme === 'light' ? '#ffffffcc' : theme === 'dark' ? '#333333cc' : 'inherit'; const bg = theme === 'light' ? '#1a1d26' : theme === 'dark' ? '#f1f3f7' : 'transparent';
      return `<footer data-vextra-credit style="box-sizing:border-box;width:100%;padding:14px 16px;text-align:${align};font:12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:${col};background:${bg};opacity:.85"><span>Made with <strong>${esc(C.app)}</strong></span> · <span>&copy; ${C.year()} ${esc(C.owner)}</span></footer>`;
    },
    /** put the footer right before </body> (or at the end); pages that already carry it are left alone */
    injectFooter(html, o) {
      html = String(html); if (/data-vextra-credit/i.test(html)) return html; const f = C.footerHTML(o); const i = html.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i);
      return i >= 0 ? html.slice(0, i) + f + '\n' + html.slice(i) : (/<\/html\s*>/i.test(html) ? html : html + '\n' + f);
    },
    safeColor(c, d) { return HEX.test(String(c || '')) ? String(c) : d; },
  };
  VX.credit = C;
})();
