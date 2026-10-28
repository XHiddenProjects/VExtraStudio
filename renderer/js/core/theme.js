/* Vextra Studio – themes. A theme = {id,name,type,colors:{bg,bg2,bg3,border,text,muted,accent,accentFg}, editor:{rules}}. */
(function () {
  const themes = new Map();
  let current = null;
  const Theme = {
    list: () => [...themes.values()].filter((t) => t.id !== '__draft'),
    get: (id) => themes.get(id),
    register(t) { if (!t || !t.id || !t.colors) throw new Error('Theme needs id and colors'); themes.set(t.id, t); VX.emit('registry'); },
    unregister(id) { themes.delete(id); VX.emit('registry'); },
    current: () => current,
    async load() {
      for (const [id, t] of [...themes]) if (t.source === 'builtin' || t.source === 'user') themes.delete(id);
      for (const f of await window.native.ext.list('themes')) {
        try { const t = JSON.parse(f.content); t.source = f.source; t.file = f.file; t.path = f.path; Theme.register(t); } catch (e) { console.warn('Bad theme', f.file, e); }
      }
    },
    apply(id, { draft } = {}) {
      const t = themes.get(id) || themes.get('vextra-dark') || [...themes.values()][0]; if (!t) return null;
      const c = t.colors, r = document.documentElement.style, light = t.type === 'light';
      const map = { bg: c.bg, bg2: c.bg2, bg3: c.bg3, panel: c.bg2, border: c.border, text: c.text, muted: c.muted, accent: c.accent, 'accent-fg': c.accentFg || '#fff' };
      for (const [k, v] of Object.entries(map)) r.setProperty('--' + k, v);
      r.setProperty('--hover', light ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.06)');
      r.setProperty('--sel', `color-mix(in srgb, ${c.accent} 20%, transparent)`);
      r.setProperty('--canvas', light ? '#dfe3ec' : '#0d0f13'); r.setProperty('--dots', light ? '#c9cfdb' : '#252a35');
      r.setProperty('--shadow', light ? 'rgba(20,30,60,.18)' : 'rgba(0,0,0,.5)');
      document.documentElement.style.colorScheme = light ? 'light' : 'dark';
      current = t; VX.emit('theme', t, !!draft); return t;
    },
  };
  VX.theme = Theme;
})();
