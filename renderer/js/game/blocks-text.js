/* Vextra blocks – 5. Text & Lists (12). Lists travel through wires as arrays; named lists live in the game (see List Modify). */
(function () {
  const VXRT = window.VXRT, U = VXRT.util, B = VXRT.registerBlock, P = VXRT.P;
  const isNum = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v));
  const str = (v) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const listIn = (n, g, v) => (Array.isArray(v) ? v : n.p.list ? g.lists[n.p.list] || [] : v === undefined || v === true ? [] : [v]);
  const LIST = P.text('list', 'Named list (used when no list arrives)', '', { hint: 'Name of a list stored in the game by List Modify' });

  B({ id: 'text', cat: 'text', label: 'Text', desc: 'A piece of text. Put {name} to insert a global variable and {value} for the incoming signal: "Score: {score}".',
    inputs: ['in'], outputs: ['out'], params: [P.area('text', 'Text', 'Hello {value}!')],
    onInput(n, port, v, g) { g.send(n, 'out', U.tpl(n.p.text, Object.assign({}, g.vars, g.sceneVars, { value: str(v) }))); } });

  const CASE = { upper: (s) => s.toUpperCase(), lower: (s) => s.toLowerCase(), title: (s) => s.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()), sentence: (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(), camel: (s) => s.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase()), snake: (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'), kebab: (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'), reverse: (s) => [...s].reverse().join('') };
  B({ id: 'textCase', cat: 'text', label: 'Text Case', desc: 'Changes capitalisation: UPPER, lower, Title Case, Sentence case, camelCase, snake_case, kebab-case, or reverses the text.',
    inputs: ['in'], outputs: ['out'], params: [P.sel('mode', 'Convert to', Object.keys(CASE))], onInput(n, port, v, g) { g.send(n, 'out', CASE[n.p.mode](str(v))); } });

  B({ id: 'textLength', cat: 'text', label: 'Text Length', desc: 'Counts characters, words or lines in the incoming text.',
    inputs: ['in'], outputs: ['out'], params: [P.sel('unit', 'Count', ['characters', 'words', 'lines'])],
    onInput(n, port, v, g) { const s = str(v); g.send(n, 'out', n.p.unit === 'words' ? (s.trim().match(/\S+/g) || []).length : n.p.unit === 'lines' ? (s ? s.split(/\r?\n/).length : 0) : [...s].length); } });

  B({ id: 'toNumber', cat: 'text', label: 'To Number', desc: 'Converts text to a number. If the text is not a number it goes out of "invalid" instead (or uses the fallback).',
    inputs: ['in'], outputs: ['out', 'invalid'], params: [P.bool('useFallback', 'Use fallback instead of "invalid"', false), P.num('fallback', 'Fallback', 0), P.bool('stripSymbols', 'Ignore symbols like $ , %', true)],
    onInput(n, port, v, g) { let s = str(v).trim(); if (n.p.stripSymbols) s = s.replace(/[,$€£%\s]/g, ''); if (s !== '' && Number.isFinite(+s)) g.send(n, 'out', +s); else if (n.p.useFallback) g.send(n, 'out', U.num(n.p.fallback)); else g.send(n, 'invalid', v); } });

  B({ id: 'textCompare', cat: 'text', label: 'Text Compare', desc: 'Compares the incoming text (a) with another text (b input or the field). Sends to "true" or "false" and also outputs a boolean on "out".',
    inputs: ['in', 'b'], outputs: ['true', 'false', 'out'], params: [P.sel('mode', 'Test', ['equals', 'equalsIgnoreCase', 'contains', 'startsWith', 'endsWith', 'regex', 'lessThan', 'greaterThan']), P.text('with', 'Compare with', '')],
    onInput(n, port, v, g) { if (port === 'b') { n.st.b = str(v); return; } const a = str(v), b = n.st.b !== undefined ? n.st.b : n.p.with; let r = false; switch (n.p.mode) { case 'equals': r = a === b; break; case 'equalsIgnoreCase': r = a.toLowerCase() === b.toLowerCase(); break; case 'contains': r = a.includes(b); break; case 'startsWith': r = a.startsWith(b); break; case 'endsWith': r = a.endsWith(b); break; case 'regex': try { r = new RegExp(b).test(a); } catch { r = false; } break; case 'lessThan': r = a.localeCompare(b, undefined, { numeric: true }) < 0; break; case 'greaterThan': r = a.localeCompare(b, undefined, { numeric: true }) > 0; break; } g.send(n, r ? 'true' : 'false', a); g.send(n, 'out', r); } });

  const SAN = { trim: (s) => s.trim(), collapse: (s) => s.replace(/\s+/g, ' '), stripHtml: (s) => s.replace(/<[^>]*>/g, ''), escapeHtml: (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), alnum: (s) => s.replace(/[^a-zA-Z0-9 ]/g, ''), noEmoji: (s) => s.replace(/\p{Extended_Pictographic}/gu, ''), noControl: (s) => s.replace(/[\u0000-\u001f\u007f]/g, ''), lettersOnly: (s) => s.replace(/[^\p{L} ]/gu, '') };
  B({ id: 'textSanitize', cat: 'text', label: 'Text Sanitize', desc: 'Cleans text, e.g. player names before saving them to a leaderboard: trim, collapse spaces, strip/escape HTML, keep letters or letters+digits only, remove emoji and control characters, and limit the length.',
    inputs: ['in'], outputs: ['out'], params: [P.multi('ops', 'Clean-up steps', Object.keys(SAN), 'trim,collapse,stripHtml'), P.num('maxLength', 'Max length (0 = unlimited)', 0, { min: 0 }), P.text('fallback', 'If empty use', '')],
    onInput(n, port, v, g) { let s = str(v); for (const k of String(n.p.ops || '').split(',').map((x) => x.trim()).filter(Boolean)) if (SAN[k]) s = SAN[k](s); if (U.num(n.p.maxLength) > 0) s = [...s].slice(0, n.p.maxLength).join(''); if (s === '' && n.p.fallback) s = n.p.fallback; g.send(n, 'out', s); } });

  B({ id: 'textList', cat: 'text', label: 'Text List', desc: 'Makes a list of texts: one item per line in the field, or split incoming text by a separator (e.g. "red,green,blue" with separator ",").',
    inputs: ['in'], outputs: ['out', 'count'], params: [P.area('items', 'Items (one per line)', 'apple\nbanana\ncherry'), P.text('separator', 'Split incoming text by', ''), P.bool('trim', 'Trim items', true)],
    onInput(n, port, v, g) { let a; if (n.p.separator && typeof v === 'string' && v !== '') a = v.split(n.p.separator); else a = String(n.p.items).split(/\r?\n/); if (n.p.trim) a = a.map((x) => x.trim()); a = a.filter((x) => x !== ''); g.send(n, 'count', a.length); g.send(n, 'out', a); } });

  B({ id: 'numberList', cat: 'text', label: 'Number List', desc: 'Makes a list of numbers: a typed list ("1, 2, 3") or a range (start, end, step).',
    inputs: ['in'], outputs: ['out', 'count'], params: [P.sel('mode', 'Mode', [['list', 'Typed list'], ['range', 'Range']]), P.text('items', 'Numbers (comma separated)', '1, 2, 3, 4, 5'), P.num('start', 'Start', 0), P.num('end', 'End', 10), P.num('step', 'Step', 1)],
    onInput(n, port, v, g) { let a = []; if (n.p.mode === 'range') { const st = U.num(n.p.step, 1) || 1, s = U.num(n.p.start), e = U.num(n.p.end, 10); for (let x = s; st > 0 ? x <= e : x >= e; x += st) { a.push(Math.round(x * 1e9) / 1e9); if (a.length > 10000) break; } } else a = String(n.p.items).split(/[,\s]+/).filter((x) => x !== '' && isNum(x)).map(Number); g.send(n, 'count', a.length); g.send(n, 'out', a); } });

  B({ id: 'listModify', cat: 'text', label: 'List Modify', desc: 'Changes a named list stored in the game (inventory, high scores, queue): add, insert, remove, set, clear, pop, shift, reverse. Sends the updated list. The incoming value is the item.',
    inputs: ['in'], outputs: ['out', 'item'], params: [P.text('list', 'List name', 'inventory'), P.sel('op', 'Operation', ['add', 'insert', 'removeAt', 'removeValue', 'set', 'clear', 'pop', 'shift', 'reverse', 'replaceAll']), P.num('index', 'Index', 0), P.text('value', 'Item (empty = incoming signal)', '')],
    onInput(n, port, v, g) { const nm = n.p.list; const L = (g.lists[nm] ||= []); const item = n.p.value !== '' ? (isNum(n.p.value) ? +n.p.value : n.p.value) : v; const i = Math.floor(U.num(n.p.index)); let out;
      switch (n.p.op) { case 'add': L.push(item); break; case 'insert': L.splice(U.clamp(i, 0, L.length), 0, item); break; case 'removeAt': out = L.splice(i, 1)[0]; break; case 'removeValue': { const k = L.indexOf(item); if (k >= 0) out = L.splice(k, 1)[0]; break; } case 'set': if (i >= 0 && i < L.length) L[i] = item; break; case 'clear': L.length = 0; break; case 'pop': out = L.pop(); break; case 'shift': out = L.shift(); break; case 'reverse': L.reverse(); break; case 'replaceAll': g.lists[nm] = Array.isArray(v) ? v.slice() : []; break; }
      if (out !== undefined) g.send(n, 'item', out); g.send(n, 'out', g.lists[nm].slice()); } });

  B({ id: 'listOrder', cat: 'text', label: 'List Order', desc: 'Sorts or rearranges a list: ascending, descending, numeric, shuffle, reverse, remove duplicates, or pick a random item.',
    inputs: ['in'], outputs: ['out'], params: [P.sel('mode', 'Order', ['ascending', 'descending', 'numericAsc', 'numericDesc', 'shuffle', 'reverse', 'unique', 'randomItem']), LIST],
    onInput(n, port, v, g) { let a = listIn(n, g, v).slice(); switch (n.p.mode) { case 'ascending': a.sort((x, y) => str(x).localeCompare(str(y), undefined, { numeric: true })); break; case 'descending': a.sort((x, y) => str(y).localeCompare(str(x), undefined, { numeric: true })); break; case 'numericAsc': a.sort((x, y) => U.num(x) - U.num(y)); break; case 'numericDesc': a.sort((x, y) => U.num(y) - U.num(x)); break; case 'shuffle': for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } break; case 'reverse': a.reverse(); break; case 'unique': a = [...new Set(a)]; break; case 'randomItem': return g.send(n, 'out', a[Math.floor(Math.random() * a.length)]); } g.send(n, 'out', a); } });

  B({ id: 'listEach', cat: 'text', label: 'List Each', desc: 'Goes through every item of a list: sends each one out of "item" (with its position on "index"), then "done". With an interval it steps through the list over time.',
    inputs: ['in', 'stop'], outputs: ['item', 'index', 'done'], params: [P.num('interval', 'Interval (s, 0 = all at once)', 0, { min: 0, step: 0.05 }), LIST],
    onInput(n, port, v, g) { if (port === 'stop') { n.st.run = false; return; } const a = listIn(n, g, v).slice(); if (U.num(n.p.interval) <= 0) { a.forEach((x, i) => { g.send(n, 'index', i); g.send(n, 'item', x); }); g.send(n, 'done', a.length); } else { n.st.a = a; n.st.i = 0; n.st.t = 0; n.st.run = true; } },
    update(n, dt, g) { const s = n.st; if (!s.run) return; s.t += dt; while (s.run && s.t >= n.p.interval) { s.t -= n.p.interval; if (s.i >= s.a.length) { s.run = false; g.send(n, 'done', s.a.length); break; } g.send(n, 'index', s.i); g.send(n, 'item', s.a[s.i++]); } } });

  B({ id: 'listCount', cat: 'text', label: 'List Count', desc: 'Counts the items in a list (all, only numbers, or unique values) and tells you if it is empty.',
    inputs: ['in'], outputs: ['out', 'isEmpty'], params: [P.sel('what', 'Count', [['all', 'All items'], ['numbers', 'Numbers only'], ['unique', 'Unique values']]), LIST],
    onInput(n, port, v, g) { const a = listIn(n, g, v); const c = n.p.what === 'numbers' ? a.filter(isNum).length : n.p.what === 'unique' ? new Set(a).size : a.length; g.send(n, 'isEmpty', c === 0); g.send(n, 'out', c); } });
})();
