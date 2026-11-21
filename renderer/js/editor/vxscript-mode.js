/* Vextra Studio – VXScript in the code editor: colours, auto-complete (as you type), hover-free hints and live error markers.
 * Loaded after Ace and before code-editor.js. The word lists come from VX.vxs.help and (for `block TYPE`) the real block registry, so they always match the engine. */
(function () {
  if (typeof ace === 'undefined') return;
  const H = () => (window.VX && VX.vxs && VX.vxs.help) || { triggers: [], statements: [], flow: [], keys: [], anchors: [], options: {} };
  const words = (a) => a.map((x) => x.name.split(/\s/)[0]).filter((w) => /^[a-z]+$/i.test(w));

  ace.define('ace/mode/vxscript_highlight_rules', ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text_highlight_rules'], function (req, exports) {
    const oop = req('../lib/oop'), TextHighlightRules = req('./text_highlight_rules').TextHighlightRules;
    const Rules = function () {
      const h = H(); const stm = words(h.statements).join('|') || 'set|add|play|show', trg = words(h.triggers).join('|') || 'start|key|click', opt = ['volume', 'pitch', 'loop', 'once', 'speed', 'after', 'over', 'target', 'at', 'to', 'with', 'count', 'size', 'color', 'bold', 'title', 'kind', 'button', 'for', 'within', 'leaves', 'pressed', 'held', 'released', 'enter', 'stay', 'exit', 'axis', 'variable', 'max', 'ease', 'burst', 'anywhere', 'payload', 'from', 'out', 'seconds', 'second', 'times', 'every', 'changed'].join('|');
      this.$rules = {
        start: [
          { token: 'comment', regex: '^\\s*#.*$' }, { token: 'comment', regex: '\\s#(?:\\s.*)?$' },
          { token: ['keyword.control', 'text', 'string'], regex: '^(\\s*behaviou?r)(\\s+)("[^"]*")' },
          { token: ['keyword.control', 'text', 'support.type'], regex: '^(\\s*(?:when|on))(\\s+)(' + trg + ')\\b' },
          { token: 'keyword.control', regex: '^\\s*(?:every|after|always|when|on)\\b' },
          { token: 'keyword.control', regex: '^\\s*(?:if|unless|else|chance|repeat|wait)\\b' },
          { token: ['keyword.control', 'text', 'support.class'], regex: '(\\bblock)(\\s+)([A-Za-z_]\\w*)' },
          { token: 'support.function', regex: '^\\s*(?:' + stm + ')\\b' },
          { token: 'string', regex: '"', next: 'str' },
          { token: 'constant.numeric', regex: '-?\\b\\d+(?:\\.\\d+)?%?' },
          { token: 'keyword.operator', regex: '\\+=|-=|\\*=|/=|==|!=|>=|<=|=|>|<' },
          { token: 'constant.language', regex: '\\b(?:tag|name):[\\w-]+' },
          { token: 'constant.language', regex: '\\b(?:true|false|self|other|any|next|all|game|scene|reset|toast|modal|settings)\\b' },
          { token: 'variable.parameter', regex: '\\b[A-Za-z_]\\w*(?==)' },
          { token: 'variable.parameter', regex: '\\b(?:' + opt + ')\\b' },
          { token: 'storage.type', regex: '\\b(?:topLeft|topRight|bottomLeft|bottomRight|top|bottom|center)\\b' },
          { token: 'punctuation.operator', regex: ':\\s*$' },
        ],
        str: [{ token: 'constant.character.escape', regex: '\\\\.' }, { token: 'constant.other', regex: '\\{[A-Za-z_][\\w.]*\\}' }, { token: 'string', regex: '"', next: 'start' }, { token: 'string', regex: '$', next: 'start' }, { defaultToken: 'string' }],
      };
    };
    oop.inherits(Rules, TextHighlightRules); exports.VXScriptHighlightRules = Rules;
  });
  ace.define('ace/mode/vxscript', ['require', 'exports', 'module', 'ace/lib/oop', 'ace/mode/text', 'ace/mode/vxscript_highlight_rules'], function (req, exports) {
    const oop = req('../lib/oop'), TextMode = req('./text').Mode, Rules = req('./vxscript_highlight_rules').VXScriptHighlightRules;
    const Mode = function () { this.HighlightRules = Rules; };
    oop.inherits(Mode, TextMode);
    (function () {
      this.lineCommentStart = '#'; this.$id = 'ace/mode/vxscript';
      this.getNextLineIndent = function (state, line, tab) { const m = /^\s*/.exec(line)[0]; return /:\s*$/.test(line.replace(/\s#\s.*$/, '')) ? m + tab : m; };
      this.checkOutdent = function (state, line, input) { return /^\s+else\s*:?$/.test(line + input) && input === ':' ? false : false; };
    }).call(Mode.prototype);
    exports.Mode = Mode;
  });

  /* ---------------------------------------------------------------- auto-complete */
  const item = (caption, snippet, meta, doc, score) => ({ caption, snippet, meta, score: score || 1000, docHTML: doc ? '<div style="max-width:420px;padding:2px 4px">' + doc + '</div>' : undefined });
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const tpl = (e) => '<b>' + esc(e.usage) + '</b><br>' + esc(e.desc) + (e.ex ? '<pre style="margin:6px 0 0;white-space:pre-wrap;font-size:11.5px">' + esc(e.ex) + '</pre>' : '');
  const snip = (e) => { const first = (e.ex || e.name).split('\n')[0].replace(/^(when |every |after )/, ''); return first.replace(/[\$\\}]/g, '\\$&').replace(/"([^"]*)"/g, '"${1:$1}"'); };

  function suggestions(session, pos, prefix) {
    const line = session.getLine(pos.row).slice(0, pos.column); const h = H(); const indent = /^\s*/.exec(line)[0].length; const body = line.trimStart(); const w = body.split(/\s+/); const first = (w[0] || '').toLowerCase(); const out = [];
    const rest = body.replace(/^\S+\s*/, '');
    /* a `block TYPE …` line: block types, then the real settings / ports of that block */
    const bm = /(?:^|\s)block\s+([A-Za-z_]\w*)?(\s+.*)?$/.exec(body);
    if (bm) {
      const cat = VX.vxs.catalog(); if (!bm[2] && !/\s$/.test(body.replace(/block\s+\S*$/, 'block '))) { /* typing the type name */ }
      if (bm[1] === undefined || (bm[2] === undefined && !/\s$/.test(body))) return cat.map((b) => item(b.id, b.id, b.cat || 'block', '<b>' + esc(b.label) + '</b><br>' + esc(b.desc), b.trigger ? 1100 : 1000));
      const b = cat.find((x) => x.id === bm[1]); if (!b) return [];
      const used = new Set((bm[2] || '').match(/[A-Za-z_]\w*(?==)/g) || []);
      for (const q of b.params) if (!used.has(q.key)) out.push(item(q.key + '=', q.key + '=' + (q.options ? '${1|' + q.options.map((o) => (Array.isArray(o) ? o[0] : o)).join(',') + '|}' : q.type === 'bool' ? '${1|true,false|}' : '${1:' + String(q.def ?? '') + '}'), 'setting', '<b>' + esc(q.label) + '</b> (' + esc(q.type) + ')' + (q.def !== undefined ? '<br>default: ' + esc(q.def) : ''), 1200));
      if (b.inputs.length) out.push(item('from', 'from ${1|' + b.inputs.join(',') + '|}', 'input port', 'Inputs: ' + esc(b.inputs.join(', ')), 900));
      if (b.outputs.length) out.push(item('out', 'out ${1|' + b.outputs.join(',') + '|}', 'output port', 'Outputs: ' + esc(b.outputs.join(', ')), 900));
      return out;
    }
    if (/^on\s*$/i.test(body.slice(0, 3)) && indent > 0 && first === 'on' && w.length === 2) { /* on PORT: */ }
    if (indent === 0) {
      if (w.length <= 1) { out.push(item('behavior', 'behavior "${1:Name}"', 'top level', 'Names a group of rules. Importing again with the same name updates it.')); for (const t of ['when', 'every', 'after', 'always']) out.push(item(t, t === 'every' || t === 'after' ? t + ' ${1:2} seconds:\n    $0' : t === 'always' ? 'always:\n    $0' : 'when ${1:start}:\n    $0', 'trigger', 'Starts a rule.')); return out; }
      if (first === 'when' || first === 'on') {
        if (w.length === 2) { for (const t of h.triggers.filter((x) => !['every', 'after', 'always'].includes(x.name))) out.push(item(t.name, t.name === 'block' ? 'block ${1:type}' : snip({ ex: t.ex.split('\n')[0].replace(/^when /, '').replace(/:$/, ''), name: t.name }), 'trigger', tpl(t))); return out; }
        const kind = (w[1] || '').toLowerCase(); if (kind === 'key' && w.length === 3) return h.keys.map((k) => item(k, k, 'key')); if (kind === 'key') return ['pressed', 'held', 'released'].map((k) => item(k, k, 'when')); if (kind === 'touching' && w.length === 3) return [item('tag:', 'tag:${1:name}', 'touch'), item('name:', 'name:${1:object}', 'touch'), item('any', 'any', 'touch')]; if (kind === 'touching') return ['enter', 'stay', 'exit', 'top', 'bottom', 'left', 'right'].map((k) => item(k, k, 'touch'));
        if (kind === 'click') return ['left', 'right', 'middle', 'any'].map((k) => item(k, k, 'button')); if (kind === 'near') return w.length === 3 ? [item('tag:player', 'tag:${1:player}', 'target')] : [item('within', 'within ${1:200}', 'distance'), item('leaves', 'leaves', 'when')]; if (kind === 'setting') return [item('changed', 'changed', 'when'), item('volume', 'volume', 'setting'), item('sensitivity', 'sensitivity', 'setting'), item('fps', 'fps', 'setting')];
      }
      return out;
    }
    /* indented: statements and flow */
    if (w.length <= 1 && (body === "" || !/\s$/.test(line))) {
      for (const s of h.statements) out.push(item(s.name, snip(s), 'statement', tpl(s)));
      for (const f of h.flow.filter((x) => /^(if|chance|repeat|block)$/.test(x.name))) out.push(item(f.name, f.name === 'if' ? 'if ${1:score} ${2:>=} ${3:5}:\n    $0' : f.name === 'chance' ? 'chance ${1:30}%:\n    $0' : f.name === 'repeat' ? 'repeat ${1:3} times:\n    $0' : 'block ${1:type}', 'flow', tpl(f)));
      for (const k of ['unless', 'else', 'wait', 'on']) out.push(item(k, k === 'else' ? 'else:\n    $0' : k === 'wait' ? 'wait ${1:1} seconds' : k === 'on' ? 'on ${1:port}:\n    $0' : 'unless ${1:score} ${2:>} ${3:0}:\n    $0', 'flow', ''));
      return out;
    }
    const opts = h.options[first]; if (opts) for (const o of opts) out.push(item(o, o, first));
    if (first === 'label' || first === 'bar') for (const a of h.anchors) out.push(item(a, a, 'anchor'));
    if (first === 'set' && w.length >= 3 && (w[1] || '').toLowerCase() === 'setting') for (const k of ['volume', 'sensitivity', 'fps', 'showFps']) out.push(item(k, k, 'setting'));
    if (first === 'open' || first === 'close' || first === 'reset') out.push(item('settings', 'settings', 'player settings'));
    if (first === 'wait' || first === 'every' || first === 'after') out.push(item('seconds', 'seconds', 'unit'));
    return out;
  }
  const completer = {
    identifierRegexps: [/[A-Za-z0-9_:.=%$-]/],
    getCompletions(editor, session, pos, prefix, cb) {
      if (!session.getMode() || session.getMode().$id !== 'ace/mode/vxscript' || !window.VX || !VX.vxs) return cb(null, []);
      try { cb(null, suggestions(session, pos, prefix)); } catch { cb(null, []); }
    },
    getDocTooltip(item) { if (item.docHTML && !item.docText) item.docText = ''; },
  };
  try { ace.require('ace/ext/language_tools').addCompleter(completer); } catch { /* tools not loaded */ }

  /* ---------------------------------------------------------------- live error markers */
  window.VXSMode = {
    /** call with an Ace session of a .vxs document: marks compile errors in the gutter while you type */
    attach(session) {
      let t = 0; const run = () => { if (!window.VX || !VX.vxs) return; const r = VX.vxs.compile(session.getValue()); session.setAnnotations([...r.errors.map((e) => ({ row: Math.max(0, (e.line || 1) - 1), column: 0, text: e.message, type: 'error' })), ...r.warnings.map((e) => ({ row: Math.max(0, (e.line || 1) - 1), column: 0, text: e.message, type: 'warning' }))]); };
      session.on('change', () => { clearTimeout(t); t = setTimeout(run, 250); }); setTimeout(run, 50);
    },
  };
})();
