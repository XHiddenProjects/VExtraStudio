/* Vextra Studio – small, safe Markdown renderer used by the docs and the Markdown preview. */
(function () {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const slug = (s) => String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const safeUrl = (u) => (/^\s*(javascript|data|vbscript):/i.test(u) && !/^\s*data:image\//i.test(u) ? '#' : u);
  function inline(t) {
    const codes = []; t = t.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    t = esc(t);
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a, u) => `<img alt="${a}" src="${esc(safeUrl(u.replace(/&amp;/g, '&')))}">`);
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, a, u) => { u = u.replace(/&amp;/g, '&'); return /^(doc|docs):/.test(u) ? `<a href="#" data-doc="${esc(u.replace(/^docs?:/, ''))}">${a}</a>` : `<a href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${a}</a>`; });
    t = t.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>').replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>').replace(/~~([^~]+)~~/g, '<s>$1</s>');
    t = t.replace(/\u0000(\d+)\u0000/g, (m, i) => '<code>' + esc(codes[+i]) + '</code>');
    return t;
  }
  function render(md, opts = {}) {
    const lines = String(md || '').replace(/\r/g, '').split('\n'); const out = []; let i = 0; const seen = opts.seen || new Set();
    const isTable = (k) => lines[k] && lines[k].includes('|') && lines[k + 1] && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[k + 1]);
    while (i < lines.length) {
      const l = lines[i];
      if (/^(```|~~~)/.test(l)) { const fence = l.slice(0, 3); const lang = l.slice(3).trim().split(/[\s{]/)[0]; const buf = []; i++; while (i < lines.length && !lines[i].startsWith(fence)) buf.push(lines[i++]); i++; out.push(VX.codeBlock && !opts.plain ? VX.codeBlock(buf.join('\n'), lang) : `<pre data-lang="${esc(lang)}"><code>${esc(buf.join('\n'))}</code></pre>`); continue; }
      const hm = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l); if (hm) { const n = hm[1].length; let id = slug(hm[2]) || 'section', k = 2; while (seen.has(id)) id = slug(hm[2]) + '-' + k++; seen.add(id); out.push(`<h${n} id="${id}">${inline(hm[2])}</h${n}>`); i++; continue; }
      if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(l)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); out.push(`<blockquote>${render(buf.join('\n'), { seen, plain: opts.plain })}</blockquote>`); continue; }
      if (isTable(i)) { const row = (s) => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()); const head = row(lines[i]); i += 2; const body = []; while (i < lines.length && lines[i].includes('|') && lines[i].trim()) body.push(row(lines[i++])); out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`); continue; }
      if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
        const items = []; const ordered = /^\s*\d+\./.test(l);
        while (i < lines.length && (/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) || (/^\s+\S/.test(lines[i]) && items.length))) {
          const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i]);
          if (m) items.push({ indent: m[1].length, text: m[3] }); else items[items.length - 1].text += ' ' + lines[i].trim(); i++;
        }
        const build = (arr, from, indent) => { let html = ''; let k = from; while (k < arr.length && arr[k].indent >= indent) { if (arr[k].indent > indent) { const sub = build(arr, k, arr[k].indent); html = html.replace(/<\/li>$/, sub.html + '</li>'); k = sub.next; continue; } html += `<li>${inline(arr[k].text)}</li>`; k++; } return { html: `${html ? '' : ''}${html}`, next: k }; };
        const base = items[0].indent; const tag = ordered ? 'ol' : 'ul'; let html = ''; let k = 0;
        while (k < items.length) { if (items[k].indent > base) { const sub = build(items, k, items[k].indent); html = html.replace(/<\/li>$/, `<${tag}>${sub.html}</${tag}></li>`); k = sub.next; } else { const tk = /^\[( |x|X)\]\s+(.*)$/.exec(items[k].text); html += tk ? `<li class="task"><input type="checkbox" disabled${tk[1] === ' ' ? '' : ' checked'}> ${inline(tk[2])}</li>` : `<li>${inline(items[k].text)}</li>`; k++; } }
        out.push(`<${tag}>${html}</${tag}>`); continue;
      }
      if (!l.trim()) { i++; continue; }
      const buf = [l]; i++; while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|~~~|>|\s*([-*+]|\d+\.)\s)/.test(lines[i]) && !isTable(i)) buf.push(lines[i++]);
      out.push(`<p>${buf.map((x, k) => inline(x.replace(/\s*\\$/, '')) + (k < buf.length - 1 && (/ {2,}$/.test(x) || /\\$/.test(x)) ? '<br>' : (k < buf.length - 1 ? ' ' : ''))).join('')}</p>`);
    }
    return out.join('\n');
  }

  VX.markdown = { render, inline, slug, esc };
})();
