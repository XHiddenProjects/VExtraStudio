/* Vextra Studio – application state: settings, workspace root, recent projects. */
(function () {
  const DEFAULTS = {
    mode: 'advanced', theme: 'vextra-dark', fontSize: 14, fontFamily: '', tabSize: 2, wrap: false, autosave: false, formatOnSave: false,
    disabledPlugins: [], plugins: {}, recent: [], updateCheck: true, skipVersion: '', lastUpdateCheck: 0, serverUrl: '', sidebarWidth: 270, bottomHeight: 220, previewDelay: 400, lastView: 'explorer', welcome: true,
  };
  const S = { root: null, settings: Object.assign({}, DEFAULTS), tabs: [], active: null, view: 'explorer' };
  let t;
  const app = (VX.app = {
    S,
    get settings() { return S.settings; },
    async loadSettings() { try { const d = await window.native.settings.load(); S.settings = Object.assign({}, DEFAULTS, d || {}); } catch (e) { console.warn('settings', e); } return S.settings; },
    saveSettings() { clearTimeout(t); t = setTimeout(() => { window.native.settings.save(S.settings).catch((e) => console.warn('save settings', e)); }, 250); },
    set(k, v) { S.settings[k] = v; app.saveSettings(); if (k === 'mode') { document.body.dataset.mode = v; VX.emit('gameBlocks'); VX.emit('modeChanged', v); } VX.emit('settings', k, v); },
    addRecent(path, name, kind) { const r = S.settings.recent.filter((x) => x.path !== path); r.unshift({ path, name: name || VX.path.base(path), kind: kind || 'folder', at: Date.now() }); S.settings.recent = r.slice(0, 12); app.saveSettings(); VX.emit('recent'); },
    removeRecent(path) { S.settings.recent = (S.settings.recent || []).filter((x) => x.path !== path); app.saveSettings(); VX.emit('recent'); },
    clearRecent() { S.settings.recent = []; app.saveSettings(); VX.emit('recent'); },
    /** Close the current workspace folder (closes its tabs first; asks about unsaved changes). */
    async closeWorkspace() {
      if (!S.root) return false; if (VX.tabs && !(await VX.tabs.closeAll())) return false;
      S.settings.autoOpen = false; app.saveSettings(); S.root = null; VX.emit('root', null); VX.emit('status'); if (VX.sidebar) VX.sidebar.show('explorer'); if (app.showWelcome) app.showWelcome(); return true;
    },
    setRoot(path) { S.root = path; VX.emit('root', path); },
    rel: (p) => (S.root ? VX.path.rel(S.root, p) : VX.path.base(p)),
    version: '2.0.0',
  });
  /* file classification */
  const IMG = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif']);
  const AUDIO = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac']);
  const BIN = new Set(['zip', 'exe', 'dll', 'so', 'dylib', 'woff', 'woff2', 'ttf', 'otf', 'pdf', 'mp4', 'webm', 'mov', 'wasm', 'bin', 'gz', 'tar', '7z']);
  app.fileKind = (path) => {
    const e = VX.path.ext(path);
    if (e === 'vxgame' || e === 'forgescene') return 'game';
    if (e === 'vxui' || e === 'forgeui') return 'ui';
    if (IMG.has(e) && e !== 'svg') return 'image';
    if (AUDIO.has(e)) return 'audio';
    if (BIN.has(e)) return 'binary';
    return 'code';
  };
  app.fileIcon = (name, isDir) => {
    if (isDir) return ['folder', 'ft-dir'];
    const e = VX.path.ext(name);
    if (e === 'vxgame' || e === 'forgescene') return ['game', 'ft-game'];
    if (e === 'vxui' || e === 'forgeui') return ['blocks', 'ft-ui'];
    if (['html', 'htm'].includes(e)) return ['globe', 'ft-html'];
    if (['js', 'mjs', 'ts', 'jsx', 'tsx'].includes(e)) return ['code', 'ft-js'];
    if (['css', 'scss', 'less'].includes(e)) return ['brush', 'ft-css'];
    if (['json'].includes(e)) return ['file', 'ft-json'];
    if (IMG.has(e)) return ['image', 'ft-img'];
    if (AUDIO.has(e)) return ['sound', 'ft-img'];
    return ['file', ''];
  };
  VX.threeReady = () => new Promise((res) => { if (window.VX_THREE) res(); else window.addEventListener('three-ready', () => res(), { once: true }); });
})();
