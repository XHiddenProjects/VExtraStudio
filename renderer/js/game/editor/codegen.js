/* Vextra game editor – block graph <-> script conversion, so every behaviour can be read as blocks or as code. */
(function () {
  const ident = (s) => { let v = String(s).replace(/[^A-Za-z0-9_$]/g, '_').replace(/^(\d)/, '_$1'); if (!v || /^(break|case|catch|class|const|continue|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|let|static|await|async|enum|self|game|input|vars|log|on|after|every|emit|fire|block|connect|bundle|at)$/.test(v)) v = 'n_' + v; return v; };
  const lit = (v) => JSON.stringify(v);
  const objLit = (o) => { const e = Object.entries(o); if (!e.length) return '{}'; return '{ ' + e.map(([k, v]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : lit(k)}: ${lit(v)}`).join(', ') + ' }'; };

  /** graph -> {code, nodeLine:{id:line}, lineNode:[id|null...]} – only settings that differ from defaults are written. */
  function graphToCode(graph, name) {
    const lines = []; const nodeLine = {}; const lineNode = []; const push = (txt, id) => { lines.push(txt); lineNode.push(id || null); };
    push(`// Behavior "${name || 'Behavior'}" – generated from the blocks.`); push('// Use "Convert to code" to edit this script directly.'); push('');
    const used = new Set();
    const emit = (g, indent) => {
      const pad = '  '.repeat(indent); const names = new Map();
      for (const n of g.nodes || []) { let v = ident(n.label || n.id); while (used.has(v)) v += '_'; used.add(v); names.set(n.id, v); }
      for (const n of g.nodes || []) {
        const v = names.get(n.id);
        if (n.type === 'bundle' && n.graph) {
          const nm = (n.params && n.params.name) || 'Bundle'; push(`${pad}const ${v} = bundle(${lit(nm)}, () => {`, n.id); nodeLine[n.id] = lines.length; emit(n.graph, indent + 1); push(`${pad}});`, n.id);
          continue;
        }
        const def = window.VXRT && VXRT.blocks[n.type]; const defaults = def ? VXRT.paramDefaults(def) : {}; const diff = {};
        for (const [k, val] of Object.entries(n.params || {})) if (!def || JSON.stringify(defaults[k]) !== JSON.stringify(val)) diff[k] = val;
        const at = n.x || n.y ? `, at(${Math.round(n.x || 0)}, ${Math.round(n.y || 0)})` : '';
        nodeLine[n.id] = lines.length + 1; push(`${pad}const ${v} = block(${lit(n.type)}, ${objLit(diff)}${at});`, n.id);
      }
      if ((g.wires || []).length) push('');
      for (const w of g.wires || []) { const a = names.get(w.from), b = names.get(w.to); if (!a || !b) continue; push(`${pad}connect(${a}, ${lit(w.out || 'out')}, ${b}, ${lit(w.in || 'in')});`, w.from); }
    };
    emit(graph || { nodes: [], wires: [] }, 0);
    push(''); push('// Free-form scripting also works here, for example:'); push("// on('key:space', () => log('jump!'));");
    return { code: lines.join('\n'), nodeLine, lineNode };
  }

  /** Execute a script in "dry run" mode and collect the blocks it declares. Nothing in it touches a game. */
  function codeToGraph(code) {
    const stack = [{ nodes: [], wires: [] }]; let counter = 0; const cur = () => stack[stack.length - 1]; const logs = [];
    const handle = (node) => ({ id: node.id, type: node.type, to(next, out, inp) { cur().wires.push({ from: node.id, out: out || 'out', to: next.id, in: inp || 'in' }); return next; }, connect(next, out, inp) { return this.to(next, out, inp); } });
    const noop = () => {}; const anyObj = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : anyObj), apply: () => anyObj, set: () => true });
    const api = {
      block: (type, params, pos) => { const node = { id: 'c' + ++counter + '_' + type, type, params: params || {}, x: pos?.x ?? 0, y: pos?.y ?? 0 }; cur().nodes.push(node); return handle(node); },
      connect: (a, out, b, inp) => a.to(b, out, inp), at: (x, y) => ({ x, y }),
      bundle: (label, fn) => { const sub = { nodes: [], wires: [] }; stack.push(sub); try { fn(); } finally { stack.pop(); } const node = { id: 'c' + ++counter + '_bundle', type: 'bundle', params: { name: label }, graph: sub }; cur().nodes.push(node); return handle(node); },
      on: noop, after: noop, every: noop, emit: noop, fire: noop, log: (...a) => logs.push(a.join(' ')), self: anyObj, game: anyObj, input: anyObj, vars: anyObj, Math, U: window.VXRT ? VXRT.util : {},
    };
    const names = Object.keys(api);
    try { new Function(...names, '"use strict";\n' + code)(...names.map((k) => api[k])); } catch (e) { return { error: e.message, graph: null, logs }; }
    return { graph: stack[0], logs };
  }
  /** Map code lines to dry-run node ids (nth block() call = nth node, in creation order). */
  function codeLineMap(code, graph) {
    const flat = []; const walk = (g) => { for (const n of g.nodes) { flat.push(n); } }; if (graph) walk(graph);
    const out = {}; const lineNode = []; let k = 0; code.split('\n').forEach((ln, i) => { lineNode[i] = null; if (/\bblock\(\s*['"`]/.test(ln) && !/^\s*\/\//.test(ln)) { const n = flat[k++]; if (n) { out[n.id] = i + 1; lineNode[i] = n.id; } } });
    return { nodeLine: out, lineNode };
  }
  VX.codegen = { graphToCode, codeToGraph, codeLineMap, ident };
})();
