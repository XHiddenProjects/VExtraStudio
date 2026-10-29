/* Ace editor wrapper for Vextra. Exposes window.CodeEditor with a small, editor-agnostic API. */
(function () {
  ace.config.set('basePath', 'vendor/ace');
  ace.config.set('modePath', 'vendor/ace');
  ace.config.set('workerPath', 'vendor/ace');
  const MODE = { javascript: 'javascript', typescript: 'typescript', html: 'html', css: 'css', json: 'json', markdown: 'markdown', python: 'python', xml: 'xml', sql: 'sql', java: 'java', cpp: 'c_cpp', rust: 'rust', php: 'php', yaml: 'yaml', shell: 'sh', go: 'golang', ruby: 'ruby', lua: 'lua', csharp: 'csharp', kotlin: 'kotlin', swift: 'swift', toml: 'toml', ini: 'ini', plaintext: 'text', apache: 'apache_conf', nginx: 'nginx', dockerfile: 'dockerfile', makefile: 'makefile', mysql: 'mysql', pgsql: 'pgsql', blade: 'php_laravel_blade' };
  const EXT = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', html: 'html', htm: 'html', css: 'css', scss: 'css', json: 'json', forgeui: 'json', forgescene: 'json', vxui: 'json', vxgame: 'json', vxmodel: 'json', webmanifest: 'json', jsonc: 'json', vue: 'html', svelte: 'html', less: 'css', sass: 'css', mts: 'typescript', markdown: 'markdown', txt: 'plaintext', env: 'ini', csv: 'plaintext', md: 'markdown', py: 'python', xml: 'xml', svg: 'xml', sql: 'sql', java: 'java', c: 'cpp', h: 'cpp', cpp: 'cpp', hpp: 'cpp', cc: 'cpp', rs: 'rust', php: 'php', yml: 'yaml', yaml: 'yaml', sh: 'shell', bash: 'shell', go: 'go', rb: 'ruby', lua: 'lua', cs: 'csharp', kt: 'kotlin', swift: 'swift', toml: 'toml', ini: 'ini', cfg: 'ini' };
  const BASE = { '.htaccess': 'apache', 'httpd.conf': 'apache', '.htpasswd': 'plaintext', 'nginx.conf': 'nginx', 'dockerfile': 'dockerfile', 'makefile': 'makefile', 'gnumakefile': 'makefile', '.env': 'ini', '.gitignore': 'plaintext', '.editorconfig': 'ini', 'composer.json': 'json', 'package.json': 'json', '.babelrc': 'json', '.eslintrc': 'json', 'php.ini': 'ini', '.user.ini': 'ini' };
  Object.assign(EXT, { phtml: 'php', inc: 'php', php3: 'php', php4: 'php', php5: 'php', php7: 'php', phps: 'php', conf: 'nginx', htaccess: 'apache', nginx: 'nginx', mysql: 'mysql', pgsql: 'pgsql', sqlite: 'sql', ddl: 'sql', dump: 'sql', twig: 'html', ejs: 'html', njk: 'html', hbs: 'html', tpl: 'html', xhtml: 'html', rss: 'xml', xsl: 'xml', xsd: 'xml', plist: 'xml', mk: 'makefile', dockerfile: 'dockerfile', env: 'ini', htpasswd: 'plaintext', log: 'plaintext', lock: 'json', 'blade.php': 'blade', pl: 'plaintext', r: 'plaintext', dart: 'java', scala: 'java', gradle: 'java', groovy: 'java', bat: 'plaintext', ps1: 'plaintext', zsh: 'shell', fish: 'shell', vue: 'html', astro: 'html' });
  const langFromName = (name) => { const base = String(name).split(/[\\/]/).pop().toLowerCase(); if (/\.blade\.php$/.test(base)) return 'blade'; if (/^\.env(\.|$)/.test(base)) return 'ini'; return BASE[base] || EXT[(base.split('.').pop() || '')] || 'plaintext'; };
  const hex = (c, d) => (c ? (c[0] === '#' ? c : '#' + c) : d);
  const BEAUTIFY = new Set(['html', 'css', 'javascript', 'php', 'xml']);
  let themeN = 0;

  function defineTheme(theme) {
    const c = theme.colors, rules = (theme.editor || theme.monaco || {}).rules || [];
    const col = (tok, d) => hex(rules.find((r) => r.token === tok)?.foreground, d);
    const n = ++themeN, cls = 'ace-vextra-' + n, P = '.' + cls;
    const kw = col('keyword', c.accent), str = col('string', '#a5e075'), num = col('number', '#f5a26b'), typ = col('type', c.accent), com = col('comment', c.muted);
    const css = `
${P}{background:${c.bg};color:${c.text}}
${P} .ace_gutter{background:${c.bg};color:${c.muted}}
${P} .ace_gutter-active-line{background:${c.bg2};color:${c.text}}
${P} .ace_print-margin{display:none}
${P} .ace_cursor{color:${c.accent}}
${P} .ace_marker-layer .ace_selection{background:${c.accent}44}
${P}.ace_multiselect .ace_selection.ace_start{box-shadow:0 0 3px 0 ${c.bg}}
${P} .ace_marker-layer .ace_active-line{background:${c.bg2}}
${P} .ace_marker-layer .ace_selected-word{border:1px solid ${c.accent}66;background:${c.accent}22}
${P} .ace_marker-layer .ace_bracket{margin:-1px 0 0 -1px;border:1px solid ${c.accent}88}
${P} .ace_indent-guide{background:linear-gradient(to right,${c.border} 0,${c.border} 1px,transparent 1px) right repeat-y}
${P} .ace_invisible{color:${c.border}}
${P} .ace_comment{color:${com};font-style:italic}
${P} .ace_keyword,${P} .ace_storage,${P} .ace_keyword.ace_operator{color:${kw}}
${P} .ace_string,${P} .ace_string.ace_regexp{color:${str}}
${P} .ace_constant.ace_numeric,${P} .ace_constant.ace_language,${P} .ace_constant.ace_boolean,${P} .ace_constant.ace_character,${P} .ace_constant{color:${num}}
${P} .ace_support.ace_function,${P} .ace_entity.ace_name.ace_function,${P} .ace_support.ace_type,${P} .ace_support.ace_class,${P} .ace_storage.ace_type,${P} .ace_entity.ace_name.ace_tag,${P} .ace_meta.ace_tag,${P} .ace_entity.ace_name{color:${typ}}
${P} .ace_variable,${P} .ace_identifier{color:${c.text}}
${P} .ace_entity.ace_other.ace_attribute-name{color:${hex(c.accent, c.text)}}
${P} .ace_punctuation,${P} .ace_paren,${P} .ace_meta{color:${c.muted}}
${P} .ace_markup.ace_heading,${P} .ace_heading{color:${kw};font-weight:700}
${P} .ace_markup.ace_list,${P} .ace_list{color:${kw}}
${P} .ace_markup.ace_underline,${P} .ace_link{text-decoration:underline;color:${c.accent}}
${P} .ace_fold{background:${c.muted};border-color:${c.bg}}
${P} .ace_scrollbar-v::-webkit-scrollbar-thumb,${P} .ace_scrollbar-h::-webkit-scrollbar-thumb{background:${c.border}}`;
    const name = 'ace/theme/vextra-' + n;
    ace.define(name, ['require', 'exports', 'module', 'ace/lib/dom'], function (req, exports) {
      exports.isDark = theme.type !== 'light'; exports.cssClass = cls; exports.cssText = css;
      req('../lib/dom').importCssString(css, cls, false);
    });
    return name;
  }

  function create(host, { onChange, onCursor }) {
    const ed = ace.edit(host, {
      showPrintMargin: false, highlightActiveLine: true, useSoftTabs: true, behavioursEnabled: true, wrap: false, fixedWidthGutter: true,
      enableBasicAutocompletion: true, enableLiveAutocompletion: true, enableSnippets: true, scrollPastEnd: 0.3, showFoldWidgets: true,
      cursorStyle: 'smooth', animatedScroll: true, displayIndentGuides: true,
    });
    ed.renderer.setScrollMargin(8, 8);
    let cur = null, look = { tabSize: 2, wrap: false };
    const applySession = (s) => { s.setTabSize(look.tabSize); s.setUseWrapMode(!!look.wrap); };
    ed.selection.on('changeCursor', () => { const p = ed.getCursorPosition(); onCursor && onCursor(p.row + 1, p.column + 1); });
    new ResizeObserver(() => ed.resize()).observe(host);
    const api = {
      createDoc(text, langId, readOnly, opts = {}) {
        const session = ace.createEditSession(text, 'ace/mode/' + (MODE[langId] || 'text'));
        session.setUseSoftTabs(true); applySession(session);
        const doc = { session, lang: langId, readOnly: !!readOnly };
        const lintable = ['javascript', 'json', 'css', 'html'].includes(langId); session.setUseWorker(lintable);
        session.on('changeAnnotation', () => { if (opts.gameScript) { const all = session.getAnnotations(), keep = all.filter((x) => !/is not defined/.test(x.text || '')); if (keep.length !== all.length) { session.setAnnotations(keep); return; } } doc.problems = session.getAnnotations().map((a) => ({ row: a.row + 1, col: (a.column || 0) + 1, type: a.type, text: a.text })); api.onProblems && api.onProblems(doc); });
        session.on('change', () => { if (cur === doc) onChange && onChange(); });
        return doc;
      },
      setDoc(doc) { cur = doc; ed.setSession(doc.session); applySession(doc.session); ed.setReadOnly(!!doc.readOnly); ed.resize(true); const p = ed.getCursorPosition(); onCursor && onCursor(p.row + 1, p.column + 1); },
      releaseDoc(doc) { if (cur === doc) { cur = null; } doc.session.destroy && doc.session.destroy(); },
      text: (doc) => doc.session.getValue(),
      setLang(doc, langId) { doc.lang = langId; doc.session.setMode('ace/mode/' + (MODE[langId] || 'text')); doc.session.setUseWorker(['javascript', 'json', 'css', 'html'].includes(langId)); },
      goto(row, col) { ed.gotoLine(row, Math.max(0, (col || 1) - 1), true); ed.focus(); },
      find(text) { ed.find(text, { caseSensitive: false, wrap: true }); },
      undo: () => ed.undo(), redo: () => ed.redo(), selectAll: () => ed.selectAll(),
      cursor: () => { const p = ed.getCursorPosition(); return { row: p.row + 1, col: p.column + 1 }; },
      setLook(theme, opts) {
        look = opts; ed.setTheme(defineTheme(theme)); ed.setFontSize(opts.fontSize);
        ed.setOption('fontFamily', opts.fontFamily || 'monospace'); if (cur) applySession(cur.session); ed.resize(true);
      },
      getSelection: () => ed.getSelectedText(),
      replaceSelection(text) { ed.insert(text); ed.focus(); },
      setValue(text) {
        const s = ed.session, Range = ace.require('ace/range').Range;
        s.replace(new Range(0, 0, s.getLength(), 0), text);
      },
      format() {
        if (!cur) return false; const l = cur.lang;
        if (l === 'json') { try { api.setValue(JSON.stringify(JSON.parse(ed.session.getValue()), null, look.tabSize)); return true; } catch { return false; } }
        if (BEAUTIFY.has(l)) { ace.require('ace/ext/beautify').beautify(ed.session); return true; }
        return false;
      },
      focus: () => ed.focus(), langFromName, ed,
    };
    return api;
  }
  window.CodeEditor = { create, langFromName, MODE };
})();
