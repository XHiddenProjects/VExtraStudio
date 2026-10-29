/* Vextra Studio – tiny dependency-free syntax highlighter used by the Markdown viewer and the docs.
 * VX.highlight(code, lang) -> array of lines, each an HTML string with <span class="tk-…"> tokens (multi-line tokens are split per line). */
(function () {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const words = (s) => new RegExp('\\b(?:' + s.trim().split(/\s+/).join('|') + ')\\b');
  const KW = {
    js: 'abstract async await break case catch class const continue debugger default delete do else enum export extends finally for from function get if implements import in instanceof interface let new of package private protected public return set static super switch this throw try typeof var void while with yield as type namespace declare readonly',
    lit: 'true false null undefined NaN Infinity None True False nil self',
    java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record',
    c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while class namespace template typename using public private protected virtual override new delete bool nullptr constexpr',
    cs: 'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new object operator out override params private protected public readonly ref return sbyte sealed short sizeof static string struct switch this throw try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while async await record',
    go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
    rust: 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while',
    php: 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield',
    py: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case',
    sh: 'if then else elif fi for while until do done case esac function in select time return exit export local readonly set unset source alias echo cd ls cat grep sed awk npm npx node git sudo apt pip curl wget mkdir rm cp mv chmod chown tar',
    sql: 'select from where and or not in is null like between join inner left right outer full cross on as group by order having limit offset insert into values update set delete create table alter drop index view trigger primary key foreign references unique default check constraint autoincrement auto_increment integer int bigint smallint real float double decimal numeric text varchar char boolean date datetime timestamp blob distinct union all exists case when then else end asc desc begin commit rollback pragma if with returning',
    rb: 'alias and begin break case class def defined do else elsif end ensure for if in module next nil not or redo rescue retry return self super then undef unless until when while yield puts require',
    yml: 'true false null yes no on off',
  };
  const NUM = String.raw`\b(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?)\b`;
  const T = {}; // compiled [regex, class] lists
  const mk = (parts) => { const names = parts.map((p) => p[1]); const re = new RegExp(parts.map((p) => '(' + p[0] + ')').join('|'), 'g'); return { re, names }; };
  const cfg = (kw, o = {}) => {
    const parts = [];
    if (o.hash) parts.push([String.raw`#[^\n]*`, 'c']); if (o.slash !== false) parts.push([String.raw`\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)`, 'c']);
    if (o.dash) parts.push([String.raw`--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)`, 'c']); if (o.php) parts.push([String.raw`<\?php|\?>`, 'p']);
    parts.push([String.raw`"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?` + (o.tpl ? String.raw`|` + '`(?:\\\\[\\s\\S]|[^`\\\\])*`?' : ''), 's']);
    if (o.regex) parts.push([String.raw`(?<=[=(,:;!&|?{}\n]\s*)\/(?![*\/])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^\/\\\n])+\/[a-z]*`, 'r']);
    if (o.var) parts.push([String.raw`\$[A-Za-z_]\w*`, 'v']);
    parts.push([NUM, 'n']); parts.push([words(KW.lit).source, 'l']); parts.push([words(kw).source, 'k']);
    if (o.ci) { const r = mk(parts); r.re = new RegExp(r.re.source, 'gi'); return r; }
    parts.push([String.raw`[A-Za-z_$][\w$]*(?=\s*\()`, 'f']); parts.push([String.raw`\b[A-Z][A-Za-z0-9_]*\b`, 't']);
    return mk(parts);
  };
  T.js = cfg(KW.js, { tpl: true, regex: true }); T.java = cfg(KW.java); T.c = cfg(KW.c); T.cs = cfg(KW.cs); T.go = cfg(KW.go, { tpl: true }); T.rust = cfg(KW.rust);
  T.php = cfg(KW.php, { hash: true, var: true, php: true }); T.py = cfg(KW.py, { hash: true, slash: false }); T.sh = cfg(KW.sh, { hash: true, slash: false, var: true }); T.rb = cfg(KW.rb, { hash: true, slash: false });
  T.sql = cfg(KW.sql, { dash: true, slash: false, ci: true }); T.yml = cfg(KW.yml, { hash: true, slash: false });
  T.json = mk([[String.raw`"(?:\\.|[^"\\])*"(?=\s*:)`, 'p'], [String.raw`"(?:\\.|[^"\\])*"?`, 's'], [NUM, 'n'], [words('true false null').source, 'l']]);
  T.css = mk([[String.raw`\/\*[\s\S]*?(?:\*\/|$)`, 'c'], [String.raw`"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?`, 's'], [String.raw`@[\w-]+`, 'k'], [String.raw`#[0-9a-fA-F]{3,8}\b`, 'n'], [String.raw`-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b`, 'n'], [String.raw`[\w-]+(?=\s*:(?!\s*[\w-]+\s*\{))`, 'p'], [String.raw`[.#][\w-]+`, 't'], [String.raw`[\w-]+(?=\()`, 'f']]);
  T.html = mk([[String.raw`<!--[\s\S]*?(?:-->|$)`, 'c'], [String.raw`<!doctype[^>]*>`, 'k'], [String.raw`<\/?[A-Za-z][\w:-]*`, 'k'], [String.raw`\/?>`, 'k'], [String.raw`"[^"]*"?|'[^']*'?`, 's'], [String.raw`[\w:@.-]+(?==)`, 'p'], [String.raw`&[#\w]+;`, 'n']]);
  const ALIAS = { javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', typescript: 'js', tsx: 'js', node: 'js', json: 'json', jsonc: 'json', css: 'css', scss: 'css', less: 'css', html: 'html', htm: 'html', xml: 'html', svg: 'html', vue: 'html', java: 'java', kotlin: 'java', kt: 'java', swift: 'java', scala: 'java', c: 'c', h: 'c', cpp: 'c', 'c++': 'c', cc: 'c', hpp: 'c', cs: 'cs', csharp: 'cs', go: 'go', golang: 'go', rust: 'rust', rs: 'rust', php: 'php', python: 'py', py: 'py', bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', ruby: 'rb', rb: 'rb', sql: 'sql', sqlite: 'sql', mysql: 'sql', pgsql: 'sql', yaml: 'yml', yml: 'yml', toml: 'yml', ini: 'yml', conf: 'yml', nginx: 'yml', htaccess: 'yml' };
  for (const k of Object.keys(T)) ALIAS[k] = ALIAS[k] || k;
  const norm = (l) => ALIAS[String(l || '').toLowerCase().trim()] || '';

  /** Embedded <script>/<style> inside HTML get their own language. */
  function tokens(code, lang) {
    const L = norm(lang); const spec = T[L]; if (!spec) return [[null, code]];
    const out = []; let last = 0, m; spec.re.lastIndex = 0;
    while ((m = spec.re.exec(code))) {
      if (m[0] === '') { spec.re.lastIndex++; continue; }
      if (m.index > last) out.push([null, code.slice(last, m.index)]);
      let k = 1; while (k < m.length && m[k] === undefined) k++; out.push([spec.names[k - 1], m[0]]); last = m.index + m[0].length;
    }
    if (last < code.length) out.push([null, code.slice(last)]);
    if (L === 'html') { // highlight inline <script> / <style> bodies
      const res = []; let mode = null;
      for (let i = 0; i < out.length; i++) {
        const [c, t] = out[i];
        if (c === 'k' && /^<script/i.test(t)) mode = 'js'; else if (c === 'k' && /^<style/i.test(t)) mode = 'css';
        res.push([c, t]);
        if (mode && c === 'k' && t === '>' && out[i + 1] && out[i + 1][0] === null) { const body = out[i + 1][1]; const end = body.search(/<\/(script|style)/i); const inner = end < 0 ? body : body.slice(0, end); res.push(...tokens(inner, mode)); if (end >= 0) res.push([null, body.slice(end)]); i++; mode = null; }
      }
      return res;
    }
    return out;
  }

  function highlight(code, lang) {
    const toks = tokens(String(code).replace(/\r/g, ''), lang); const lines = [''];
    for (const [c, t] of toks) { const parts = t.split('\n'); parts.forEach((p, i) => { if (i > 0) lines.push(''); if (p !== '') lines[lines.length - 1] += c ? `<span class="tk-${c}">${esc(p)}</span>` : esc(p); }); }
    return lines;
  }
  /** A complete code block: header (language + copy button, sticky while scrolling) and numbered, highlighted lines. */
  function block(code, lang, opts = {}) {
    const lines = highlight(code.replace(/\n$/, ''), lang); const w = String(lines.length).length;
    const body = lines.map((l) => `<span class="cl"><span class="ln">${'\u200b'}</span>${l || '\n'}</span>`).join('');
    return `<div class="codeblock" data-lang="${esc(lang || '')}"><div class="cb-head"><span class="cb-lang">${esc(lang || 'text')}</span><span class="cb-meta">${lines.length} line${lines.length === 1 ? '' : 's'}</span><button type="button" class="cb-copy" title="Copy code">Copy</button></div><pre class="cb-pre${opts.noLines ? ' nolines' : ''}" style="--lnw:${w}ch"><code>${body}</code></pre></div>`;
  }
  /** Event delegation for the Copy buttons: call once on the element that contains rendered blocks. */
  function wireCopy(root) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('.cb-copy'); if (!b) return; const pre = b.closest('.codeblock').querySelector('code');
      const text = [...pre.querySelectorAll('.cl')].map((l) => l.textContent.replace(/^\u200b/, '').replace(/\n$/, '')).join('\n');
      const done = () => { b.textContent = 'Copied ✓'; b.classList.add('ok'); setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('ok'); }, 1400); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallback(text, done)); else fallback(text, done);
    });
    function fallback(text, done) { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); try { document.execCommand('copy'); done(); } catch { /* ignore */ } ta.remove(); }
  }
  const CSS = `.codeblock{margin:14px 0;border:1px solid var(--border,#2c3445);border-radius:10px;background:var(--bg2,#161b24)}
.cb-head{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:10px;padding:5px 8px 5px 14px;font:600 11px system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#97a0b2);background:var(--bg3,#1d2330);border-bottom:1px solid var(--border,#2c3445);border-radius:10px 10px 0 0}
.cb-head .cb-meta{flex:1;opacity:.6;font-weight:500;text-transform:none;letter-spacing:0}.cb-copy{border:1px solid var(--border,#2c3445);background:var(--bg2,#161b24);color:inherit;border-radius:6px;padding:3px 10px;font:600 11px system-ui,sans-serif;cursor:pointer}.cb-copy:hover{border-color:var(--accent,#6c8cff);color:var(--accent,#6c8cff)}.cb-copy.ok{color:#4cc38a;border-color:#4cc38a}
.cb-pre{margin:0;padding:10px 0;overflow:auto;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;tab-size:2;background:transparent!important;border:0!important}.cb-pre code{display:block;min-width:max-content;counter-reset:ln;background:none!important;border:0!important;padding:0!important}
.cl{display:block;padding:0 14px 0 0;white-space:pre}.cl .ln{display:inline-block;box-sizing:content-box;width:var(--lnw,2ch);padding:0 12px 0 14px;margin-right:12px;text-align:right;color:var(--muted,#6b7385);opacity:.7;user-select:none;border-right:1px solid var(--border,#2c3445);counter-increment:ln;position:sticky;left:0;background:var(--bg2,#161b24)}.cl .ln::before{content:counter(ln)}.cb-pre.nolines .ln{display:none}
.tk-c{color:#7c879c;font-style:italic}.tk-s{color:#a5d6a7}.tk-k{color:#c792ea}.tk-n{color:#f78c6c}.tk-l{color:#ff9d7a}.tk-f{color:#82aaff}.tk-t{color:#ffcb6b}.tk-p{color:#89ddff}.tk-v{color:#f07178}.tk-r{color:#c3e88d}
:root[data-theme="light"] .tk-c,body.light .tk-c{color:#6a737d}:root[data-theme="light"] .tk-s,body.light .tk-s{color:#22863a}:root[data-theme="light"] .tk-k,body.light .tk-k{color:#6f42c1}:root[data-theme="light"] .tk-n,body.light .tk-n,:root[data-theme="light"] .tk-l,body.light .tk-l{color:#b35900}:root[data-theme="light"] .tk-f,body.light .tk-f{color:#005cc5}:root[data-theme="light"] .tk-t,body.light .tk-t{color:#b08800}:root[data-theme="light"] .tk-p,body.light .tk-p{color:#0086b3}`;
  VX.highlight = highlight; VX.codeBlock = block; VX.wireCopy = wireCopy; VX.highlightCSS = CSS; VX.highlightLang = norm;
})();
