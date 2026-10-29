/** @forge-plugin {"id":"markdown-preview","name":"Markdown Preview","version":"2.0.0","description":"Full Markdown viewer: outline, tables, task lists, syntax-highlighted code with line numbers and a Copy button that follows the scroll."} */
/** @forge-docs
 * ## Using Markdown Preview
 * Open any `.md` file and press **👁 Markdown Preview** in the toolbar, or run **Markdown: Preview current file** from the Command Palette.
 *
 * The viewer supports:
 * - headings with an **outline sidebar** that highlights where you are as you scroll
 * - tables, task lists (`- [x]`), blockquotes, images, links and auto-links
 * - **syntax-highlighted code blocks with line numbers** (JavaScript, TypeScript, JSON, HTML, CSS, PHP, SQL, Python, Shell, Rust, Go, Java, C/C++, C#, Ruby, YAML/INI/nginx/.htaccess)
 * - a **Copy** button on every code block that stays pinned to the top of the block while you scroll through it
 * - a **Rendered / Source** toggle to see the raw file
 *
 * The preview uses your current theme colours and never changes your file. Press the button again to refresh it after editing.
 */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function cssVar(name, fallback) {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; } catch { return fallback; }
}

function renderBody(src) {
  const VXg = typeof VX !== 'undefined' ? VX : null;
  if (VXg && VXg.markdown && VXg.markdown.render) return VXg.markdown.render(src);
  return `<pre>${esc(src)}</pre>`; // extremely defensive fallback
}
function sourceBlock(src) {
  const VXg = typeof VX !== 'undefined' ? VX : null;
  return VXg && VXg.codeBlock ? VXg.codeBlock(src, 'markdown') : `<pre>${esc(src)}</pre>`;
}
function highlightCss() { return typeof VX !== 'undefined' && VX.highlightCSS ? VX.highlightCSS.replace('.cb-pre{', '.codeblock .cb-pre{').replace('.cb-pre code{', '.codeblock .cb-pre code{') : ''; }

function page(src, title) {
  const words = (src.match(/\S+/g) || []).length;
  const vars = `--bg:${cssVar('--bg', '#0e1117')};--bg2:${cssVar('--bg2', '#161b24')};--bg3:${cssVar('--bg3', '#1d2330')};--text:${cssVar('--text', '#e6e9ef')};--muted:${cssVar('--muted', '#97a0b2')};--accent:${cssVar('--accent', '#6c8cff')};--border:${cssVar('--border', '#2c3445')};--hover:${cssVar('--hover', '#ffffff10')};--sel:${cssVar('--sel', '#6c8cff22')}`;
  const css = `:root{${vars}}*{box-sizing:border-box}html,body{height:100%;margin:0}body{display:flex;flex-direction:column;font:15.5px/1.7 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--text)}
a{color:var(--accent)}.bar{display:flex;align-items:center;gap:6px;padding:7px 14px;border-bottom:1px solid var(--border);background:var(--bg2);flex:none;font-size:12.5px}.bar .sp{flex:1}.bar .meta{color:var(--muted)}
.bar button{border:1px solid var(--border);background:var(--bg);color:inherit;border-radius:7px;padding:4px 11px;font:inherit;cursor:pointer}.bar button:hover{border-color:var(--accent)}.bar button.on{border-color:var(--accent);color:var(--accent)}
.main{flex:1;min-height:0;display:flex}.scroll{flex:1;min-width:0;overflow:auto;padding:0 28px 80px}.doc{max-width:860px;margin:0 auto;padding-top:18px}
.toc{width:clamp(150px,22%,250px);flex:none;overflow:auto;padding:16px 10px;border-left:1px solid var(--border);background:var(--bg2);font-size:12.5px}body.no-toc .toc{display:none}
.toc h6{margin:0 0 8px 8px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.toc a{display:block;padding:3px 8px;border-radius:6px;color:var(--muted);text-decoration:none;border-left:2px solid transparent;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.toc a:hover{background:var(--hover);color:var(--text)}.toc a.on{color:var(--accent);border-left-color:var(--accent);background:var(--sel)}.toc a.l2{padding-left:16px}.toc a.l3{padding-left:26px}.toc a.l4{padding-left:36px}
.doc h1,.doc h2{border-bottom:1px solid var(--border);padding-bottom:.25em}.doc h1,.doc h2,.doc h3,.doc h4,.doc h5,.doc h6{scroll-margin-top:12px}.doc code{background:var(--bg2);padding:1px 6px;border-radius:5px;font-size:.9em}
.doc blockquote{border-left:4px solid var(--accent);margin:12px 0;padding:2px 16px;color:var(--muted)}.doc table{border-collapse:collapse;display:block;overflow:auto}.doc td,.doc th{border:1px solid var(--border);padding:5px 12px}.doc th{background:var(--bg2)}.doc img{max-width:100%}.doc hr{border:0;border-top:1px solid var(--border)}
.doc li.task{list-style:none;margin-left:-1.2em}.doc li.task input{margin-right:6px;accent-color:var(--accent)}.doc pre:not(.cb-pre){background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;overflow:auto}
#src{display:none}body.show-src #rendered{display:none}body.show-src #src{display:block}body.show-src .toc{display:none}
@media(max-width:760px){.toc{display:none}.scroll{padding:0 14px 60px}}${highlightCss()}`;
  const js = `(function(){var $=function(s){return document.querySelector(s)},sc=$('.scroll'),toc=$('.toc'),doc=$('#rendered');
var hs=[].slice.call(doc.querySelectorAll('h1,h2,h3,h4')),h6=document.createElement('h6');h6.textContent='On this page';toc.appendChild(h6);
hs.forEach(function(h){var a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;a.className='l'+h.tagName.charAt(1);a.setAttribute('data-id',h.id);a.onclick=function(e){e.preventDefault();h.scrollIntoView({behavior:'smooth',block:'start'})};toc.appendChild(a)});
if(!hs.length)toc.insertAdjacentHTML('beforeend','<div style="color:var(--muted);padding:4px 8px">No headings</div>');
function spy(){var y=sc.getBoundingClientRect().top+30,cur=null;hs.forEach(function(h){if(h.getBoundingClientRect().top<=y)cur=h});[].forEach.call(toc.querySelectorAll('a'),function(a){a.classList.toggle('on',!!cur&&a.getAttribute('data-id')===cur.id)})}
var raf;sc.addEventListener('scroll',function(){cancelAnimationFrame(raf);raf=requestAnimationFrame(spy)});spy();
doc.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href^="#"]');if(a&&a.getAttribute('href').length>1){var t=doc.querySelector('#'+CSS.escape(a.getAttribute('href').slice(1)));if(t){e.preventDefault();t.scrollIntoView({behavior:'smooth'})}}});
function copy(text,done){function fb(){var ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done()}catch(x){}ta.remove()}
if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done,fb);else fb()}
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.cb-copy');if(!b)return;var t=[].map.call(b.closest('.codeblock').querySelectorAll('.cl'),function(l){return l.textContent.replace(/^\\u200b/,'').replace(/\\n$/,'')}).join('\\n');copy(t,function(){b.textContent='Copied ✓';b.classList.add('ok');setTimeout(function(){b.textContent='Copy';b.classList.remove('ok')},1400)})});
var bR=$('#bR'),bS=$('#bS'),bT=$('#bT');bR.onclick=function(){document.body.classList.remove('show-src');bR.classList.add('on');bS.classList.remove('on')};bS.onclick=function(){document.body.classList.add('show-src');bS.classList.add('on');bR.classList.remove('on')};bT.onclick=function(){document.body.classList.toggle('no-toc');bT.classList.toggle('on')};})();`;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}</style>
<div class="bar"><button id="bR" class="on">Rendered</button><button id="bS">Source</button><span class="sp"></span><span class="meta">${words} words · ~${Math.max(1, Math.round(words / 220))} min read</span><button id="bT" class="on" title="Show / hide the outline">☰ Outline</button></div>
<div class="main"><div class="scroll"><div class="doc"><div id="rendered">${renderBody(src)}</div><div id="src">${sourceBlock(src)}</div></div></div><nav class="toc"></nav></div><script>${js.replace(/<\/script/gi, '<\\/script')}<\/script>`;
}

const open = () => forge.ui.preview(page(forge.editor.getValue(), 'Markdown preview'), 'Markdown preview');
forge.commands.register({ id: 'preview', title: 'Markdown: Preview current file', run: open });
forge.toolbar.add({ id: 'btn', label: '👁 Markdown Preview', run: open, when: (ctx) => ctx.language === 'markdown' });
