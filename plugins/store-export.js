/** @forge-plugin {"id":"store-export","name":"Store Export","version":"1.0.0","description":"Package a game as ready-to-build projects for Steam (Electron), Google Play (Android) and the App Store (iOS)."} */
/** @forge-docs
 * ## Using Store Export
 * Open a game and press **📦 Store export** in its toolbar (or run **Store Export: Package game…** from the Command Palette). A project folder must be open so the files have somewhere to go.
 *
 * Pick your targets, fill in the app name, a reverse-domain **package id** (e.g. `com.yourname.mygame`), version and orientation, and choose an icon. The plugin writes everything to `store-export/<game>/` inside your folder:
 *
 * | Target | You get | You still need |
 * |---|---|---|
 * | **Google Play** | A Capacitor project (`mobile/`) + patch script + Play checklist | Node, Android Studio, a signing key, a Play Console account |
 * | **App Store** | The same `mobile/` project, iOS steps | A Mac with Xcode, an Apple Developer account |
 * | **Steam** | An Electron project (`steam/`) with Windows/macOS/Linux builds, optional Steamworks, `steamcmd` build files | A Steamworks account + App ID, `steamcmd` |
 *
 * Every folder has its own **README** with the exact commands, and `STORE-CHECKLIST.md` lists the store assets (screenshots, descriptions, age ratings, privacy policy) you must prepare.
 *
 * ### What this does *not* do
 * It does not sign, build or upload anything – signing keys and store accounts are yours, and Apple only builds on a Mac. It prepares projects that build with a few commands. Package versions in the generated `package.json` files are starting points; update them if your tools complain.
 *
 * ### Icons
 * Choose a sprite from your game or leave blank for a generated letter icon. App stores need a square, **opaque** 1024×1024 icon; the plugin creates it plus an Android adaptive-icon pair and a splash image.
 */
const slugify = (s) => (String(s || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game');
const JSONF = (o) => JSON.stringify(o, null, 2) + '\n';
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const b64 = (canvas) => canvas.toDataURL('image/png').split(',')[1];

async function makeCanvases(project, o) {
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const sprite = o.icon && project.assets.sprites[o.icon]; const img = sprite ? await loadImg(sprite.frames[0]) : null;
  const drawArt = (ctx, size, scale) => {
    if (img) { const k = Math.min(size * scale / img.naturalWidth, size * scale / img.naturalHeight); const w = img.naturalWidth * k, h = img.naturalHeight * k; ctx.imageSmoothingEnabled = !project.settings.pixelArt; ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h); }
    else { ctx.fillStyle = '#ffffff'; ctx.font = `800 ${size * scale}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((o.name.trim()[0] || 'G').toUpperCase(), size / 2, size / 2 + size * 0.03); }
  };
  const iconOnly = mk(1024, 1024); let x = iconOnly.getContext('2d'); x.fillStyle = o.color; x.fillRect(0, 0, 1024, 1024); drawArt(x, 1024, 0.7);
  const fg = mk(1024, 1024); drawArt(fg.getContext('2d'), 1024, 0.5);
  const bg = mk(1024, 1024); x = bg.getContext('2d'); x.fillStyle = o.color; x.fillRect(0, 0, 1024, 1024);
  const splash = mk(2732, 2732); x = splash.getContext('2d'); x.fillStyle = o.color; x.fillRect(0, 0, 2732, 2732); x.save(); x.translate((2732 - 900) / 2, (2732 - 900) / 2); drawArt(x, 900, 0.9); x.restore();
  return { iconOnly, fg, bg, splash };
}

function mobileFiles(o, slug) {
  const land = o.orientation === 'landscape', port = o.orientation === 'portrait';
  const f = {};
  f['package.json'] = JSONF({ name: slug + '-mobile', version: o.version, private: true, description: o.name, scripts: { setup: 'npx cap add android && npx cap add ios && npm run assets && npm run patch', assets: 'npx capacitor-assets generate --iconBackgroundColor ' + o.color + ' --splashBackgroundColor ' + o.color, patch: 'node scripts/patch-native.js', sync: 'npx cap sync', 'open:android': 'npx cap open android', 'open:ios': 'npx cap open ios' }, dependencies: { '@capacitor/core': '^7.0.0', '@capacitor/android': '^7.0.0', '@capacitor/ios': '^7.0.0' }, devDependencies: { '@capacitor/cli': '^7.0.0', '@capacitor/assets': '^3.0.5' } });
  f['capacitor.config.json'] = JSONF({ appId: o.id, appName: o.name, webDir: 'www', backgroundColor: o.color, android: { allowMixedContent: false }, ios: { contentInset: 'never' } });
  f['scripts/patch-native.js'] = [
    "// Best-effort patches after `cap add`: orientation + version numbers. Safe to run repeatedly.",
    "const fs = require('fs'), path = require('path');",
    'const cfg = ' + JSON.stringify({ orientation: o.orientation, version: o.version, code: o.code }) + ';',
    "const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);",
    "const edit = (p, fn) => { const s = read(p); if (s === null) return console.log('skip (not found): ' + p); const n = fn(s); if (n !== s) { fs.writeFileSync(p, n); console.log('patched ' + p); } };",
    "const man = path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml');",
    "const ori = { landscape: 'sensorLandscape', portrait: 'sensorPortrait' }[cfg.orientation];",
    "if (ori) edit(man, (s) => (/screenOrientation=/.test(s) ? s.replace(/android:screenOrientation=\"[^\"]*\"/, 'android:screenOrientation=\"' + ori + '\"') : s.replace('<activity', '<activity android:screenOrientation=\"' + ori + '\"')));",
    "for (const g of ['build.gradle', 'build.gradle.kts']) edit(path.join('android', 'app', g), (s) => s.replace(/versionCode\\s*=?\\s*\\d+/, (m) => m.replace(/\\d+/, cfg.code)).replace(/versionName\\s*=?\\s*\"[^\"]*\"/, (m) => m.replace(/\"[^\"]*\"/, '\"' + cfg.version + '\"')));",
    "const plist = path.join('ios', 'App', 'App', 'Info.plist');",
    "const dirs = { landscape: ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'], portrait: ['UIInterfaceOrientationPortrait'] }[cfg.orientation];",
    "if (dirs) edit(plist, (s) => s.replace(/(<key>UISupportedInterfaceOrientations<\\/key>\\s*<array>)[\\s\\S]*?(<\\/array>)/, (m, a, b) => a + dirs.map((d) => '<string>' + d + '</string>').join('') + b));",
    "edit(plist, (s) => s.replace(/(<key>CFBundleShortVersionString<\\/key>\\s*<string>)[^<]*/, '$1' + cfg.version));",
    "console.log('Done. In Xcode set the build number; in Android Studio check the signing config.');", '',
  ].join('\n');
  f['README-MOBILE.md'] = `# ${o.name} – Google Play & App Store

Generated by Vextra Studio **Store Export**. The game lives in \`www/index.html\` and runs inside a native web view (Capacitor).

## One-time setup
1. Install Node.js 18+.
2. \`npm install\`
3. \`npm run setup\` – adds the Android and iOS projects, generates icons/splash from \`assets/\`, applies orientation/version patches.

## Whenever the game changes
Re-export from Vextra (it overwrites \`www/index.html\`), then \`npm run sync\`.

## Google Play (Android)
- Needs: Android Studio (with SDK), a Google Play Console developer account.
- \`npm run open:android\` → in Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle**. Create a keystore and **back it up** – you need the same key for every update (or enrol in Play App Signing).
- Upload the \`.aab\` in Play Console → your app → Production (or Internal/Closed testing first).
- Application id: \`${o.id}\` – it can never change after publishing. Version name \`${o.version}\`, version code \`${o.code}\` (increase the code on every upload).

## App Store (iOS)
- Needs: a Mac with Xcode and an Apple Developer Program membership. This step cannot be done on Windows or Linux.
- \`npm run open:ios\` → select the *App* target → Signing & Capabilities → choose your Team. Bundle identifier: \`${o.id}\`.
- **Product → Archive → Distribute App → App Store Connect**. Then finish the listing in App Store Connect and submit for review.

## Notes
- Audio starts after the first tap/click (browser rule) – the engine handles this.
- Test on real devices; web-view performance varies, especially for 3D on older phones.
- The Ad, Game Center and Vibrate blocks use web fallbacks. For real ads or Game Center, add a Capacitor plugin and call it from a custom block.
`;
  return f;
}

function steamFiles(o, slug) {
  const f = {}; const d = o.depotBase;
  f['package.json'] = JSONF({ name: slug, productName: o.name, version: o.version, description: o.name, author: o.publisher, main: 'main.js', private: true,
    scripts: { start: 'electron .', 'build:win': 'electron-builder --win --dir', 'build:mac': 'electron-builder --mac --dir', 'build:linux': 'electron-builder --linux --dir', 'build:all': 'electron-builder -wml --dir', upload: 'node scripts/upload.js' },
    devDependencies: { electron: '^33.0.0', 'electron-builder': '^25.0.0' }, optionalDependencies: { 'steamworks.js': '^0.4.0' },
    build: { appId: o.id, productName: o.name, directories: { output: 'dist', buildResources: 'build' }, files: ['main.js', 'preload.js', 'www/**/*', 'package.json'], asar: true, win: { target: 'dir', icon: 'build/icon.png' }, mac: { target: 'dir', icon: 'build/icon.png', category: 'public.app-category.games' }, linux: { target: 'dir', icon: 'build/icon.png', category: 'Game' } } });
  f['main.js'] = [
    "const { app, BrowserWindow, Menu, globalShortcut } = require('electron');",
    "const path = require('path');",
    'const STEAM_APP_ID = ' + (o.steamId ? JSON.stringify(o.steamId) : 'null') + ';',
    "let steam = null;",
    "if (STEAM_APP_ID) { try { steam = require('steamworks.js').init(Number(STEAM_APP_ID)); console.log('Steam connected as', steam.localplayer.getName()); } catch (e) { console.log('Steam not available (' + e.message + ') – running without it'); } }",
    "app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');",
    "function create() {",
    "  const win = new BrowserWindow({ width: 1280, height: 720, backgroundColor: " + JSON.stringify(o.color) + ", title: " + JSON.stringify(o.name) + ", autoHideMenuBar: true, fullscreenable: true, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true } });",
    "  Menu.setApplicationMenu(null); win.loadFile(path.join(__dirname, 'www', 'index.html'));",
    "  const toggle = () => win.setFullScreen(!win.isFullScreen());",
    "  win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && (i.key === 'F11' || (i.alt && i.key === 'Enter'))) { toggle(); e.preventDefault(); } });",
    "}",
    "app.whenReady().then(create);",
    "app.on('window-all-closed', () => app.quit());", '',
  ].join('\n');
  f['preload.js'] = "// Exposes nothing by default. Add a contextBridge here if you need Steam features in the game.\n";
  f['steam/app_build.vdf'] = `"appbuild"\n{\n\t"appid" "${o.steamId || 'YOUR_APP_ID'}"\n\t"desc" "${o.name} ${o.version}"\n\t"buildoutput" "../steam-output"\n\t"contentroot" "../dist"\n\t"setlive" ""\n\t"preview" "0"\n\t"local" ""\n\t"depots"\n\t{\n\t\t"${d}" "depot_win.vdf"\n\t\t"${d + 1}" "depot_mac.vdf"\n\t\t"${d + 2}" "depot_linux.vdf"\n\t}\n}\n`;
  for (const [n, id, dir] of [['win', d, 'win-unpacked'], ['mac', d + 1, 'mac'], ['linux', d + 2, 'linux-unpacked']]) f[`steam/depot_${n}.vdf`] = `"DepotBuildConfig"\n{\n\t"DepotID" "${id}"\n\t"contentroot" "../dist/${dir}"\n\t"FileMapping"\n\t{\n\t\t"LocalPath" "*"\n\t\t"DepotPath" "."\n\t\t"recursive" "1"\n\t}\n}\n`;
  f['scripts/upload.js'] = [
    "// Uploads the built folders with steamcmd. Usage: STEAM_USER=you node scripts/upload.js   (steamcmd must be on PATH)",
    "const cp = require('child_process'), path = require('path');",
    "const user = process.env.STEAM_USER; if (!user) { console.error('Set STEAM_USER to your Steamworks build account name.'); process.exit(1); }",
    "const vdf = path.resolve(__dirname, '..', 'steam', 'app_build.vdf');",
    "const r = cp.spawnSync('steamcmd', ['+login', user, '+run_app_build', vdf, '+quit'], { stdio: 'inherit', shell: process.platform === 'win32' });",
    "process.exit(r.status === null ? 1 : r.status);", '',
  ].join('\n');
  if (o.steamId) f['steam_appid.txt'] = o.steamId + '\n';
  f['README-STEAM.md'] = `# ${o.name} – Steam

Generated by Vextra Studio **Store Export**. The game (\`www/index.html\`) runs in an Electron window; \`steamworks.js\` is optional and initialises only when an App ID is set.

## Try it
\`\`\`
npm install
npm start          # run the game in a desktop window (F11 or Alt+Enter = fullscreen)
\`\`\`

## Build for each OS
\`\`\`
npm run build:win     # best on Windows
npm run build:mac     # must run on a Mac
npm run build:linux   # best on Linux
\`\`\`
Folders appear in \`dist/\`. (Cross-building is limited; build each OS on that OS, or use CI.)

## Steamworks setup (once)
1. Join Steamworks and create your app; note the **App ID**${o.steamId ? ` (you entered ${o.steamId})` : ' and put it in steam/app_build.vdf and main.js (STEAM_APP_ID)'}.
2. In Steamworks → SteamPipe → Depots, create three depots and use their ids in \`steam/depot_*.vdf\` (currently ${d}, ${d + 1}, ${d + 2} – change them if yours differ).
3. Set the **launch options** for each OS to the executable: Windows \`${o.name}.exe\`, macOS \`${o.name}.app\`, Linux \`${slug}\`.
4. Install \`steamcmd\`, create a build-only Steam account, then:
\`\`\`
STEAM_USER=yourbuilduser npm run upload
\`\`\`
5. In Steamworks, set the build live on a branch, complete the store page and submit for review (see STORE-CHECKLIST.md).

## Notes
- Achievements/leaderboards from the game's blocks are Vextra's own services; to use Steam's, call \`steam\` from \`preload.js\` and expose it with \`contextBridge\`.
- The first build downloads Electron (~100 MB per platform).
`;
  return f;
}

function checklist(o) { return `# Store checklist – ${o.name}

## Everyone
- [ ] Final icon and name checked, no trademarked material you do not own
- [ ] Privacy policy URL (required if the game collects any data, uses ads, accounts, leaderboards or cloud saves)
- [ ] Short and long description, keywords, support e-mail / website
- [ ] Age/content rating questionnaire completed honestly
- [ ] Tested on real hardware (touch, tilt, sound, back button, pausing, rotation)

## Google Play
- [ ] 512×512 icon, 1024×500 feature graphic, 2–8 phone screenshots
- [ ] Data-safety form, content rating, target audience, ads declaration
- [ ] Signed .aab uploaded; keystore backed up; versionCode increases each release
- [ ] Check Play Console for current testing requirements for new developer accounts before planning your launch date

## App Store
- [ ] 1024×1024 icon without transparency (provided: assets/icon-only.png)
- [ ] Screenshots for the required device sizes (iPhone, and iPad if supported)
- [ ] App privacy "nutrition label", age rating, export-compliance answers
- [ ] A way for App Review to play (no login walls, or provide a demo account)

## Steam
- [ ] Store page: capsule images (header, small, main, vertical), screenshots, trailer (optional), description, tags
- [ ] Release date, price, system requirements, supported languages
- [ ] Build set live on the default branch; store page and build both approved
- [ ] Review the Steam rules for AI-generated content and for third-party code/assets, and answer the disclosure questions truthfully
`; }

async function run() {
  const project = forge.game.current(); const root = forge.fs.root();
  if (!project) return forge.ui.toast('Open a game first (a .vxgame tab).', 'warn');
  if (!root) return forge.ui.toast('Open a folder first – the packages are written into it (store-export/).', 'warn');
  const sprites = Object.values(project.assets.sprites);
  const v = await forge.ui.form({ title: 'Store Export', submit: 'Create packages', intro: 'Prepares build-ready projects. Signing, building and uploading are done with the store tools (see the README in each folder).', fields: [
    { key: 'name', label: 'App name', value: project.settings.title, required: true },
    { key: 'id', label: 'Package id', value: 'com.yourname.' + slugify(project.settings.title).replace(/-/g, ''), hint: 'Reverse-domain, lowercase. Cannot change after publishing.', required: true },
    { key: 'version', label: 'Version', value: '1.0.0', required: true }, { key: 'code', label: 'Android version code', type: 'number', value: 1 },
    { key: 'orientation', label: 'Orientation', type: 'select', value: project.settings.width >= project.settings.height ? 'landscape' : 'portrait', options: [['landscape', 'Landscape'], ['portrait', 'Portrait'], ['any', 'Any']] },
    { key: 'color', label: 'Brand / splash colour', type: 'color', value: project.settings.bg || '#10131a' },
    { key: 'icon', label: 'Icon sprite', type: 'select', value: '', options: [['', 'Letter icon'], ...sprites.map((s) => [s.id, s.name])] },
    { key: 'publisher', label: 'Publisher / author', value: forge.account.current()?.displayName || '' },
    { key: 'steamId', label: 'Steam App ID (optional)', placeholder: 'e.g. 1234560' },
    { key: 'depotBase', label: 'First Steam depot id', type: 'number', value: 1234561, hint: 'Windows, macOS, Linux use this and the next two.' },
    { key: 'android', label: 'Google Play + App Store project (Capacitor)', type: 'checkbox', value: true }, { key: 'steam', label: 'Steam project (Electron)', type: 'checkbox', value: true },
  ], validate: (x) => (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(x.id) ? 'Package id must look like com.company.game' : !/^\d+(\.\d+){0,2}$/.test(x.version) ? 'Version must be numbers like 1.0.0' : !x.android && !x.steam ? 'Pick at least one target' : null) });
  if (!v) return;
  const o = Object.assign({}, v, { code: Math.max(1, Math.round(v.code) || 1), depotBase: Math.round(v.depotBase) || 1234561, steamId: String(v.steamId || '').trim().replace(/\D/g, ''), publisher: v.publisher || 'Your Name' });
  const slug = slugify(o.name), out = root.replace(/[\\/]$/, '') + '/store-export/' + slug;
  try {
    forge.ui.toast('Exporting game…');
    const html = await forge.game.exportHTML(project); const cv = await makeCanvases(project, o);
    const write = (rel, text) => forge.fs.writeFile(out + '/' + rel, text), writeImg = (rel, c) => forge.fs.writeBase64(out + '/' + rel, b64(c));
    await write('STORE-CHECKLIST.md', checklist(o)); await writeImg('assets/icon-only.png', cv.iconOnly);
    if (o.android) {
      await write('mobile/www/index.html', html); for (const [k, rel] of Object.entries(mobileFiles(o, slug))) await write('mobile/' + k, rel);
      await writeImg('mobile/assets/icon-only.png', cv.iconOnly); await writeImg('mobile/assets/icon-foreground.png', cv.fg); await writeImg('mobile/assets/icon-background.png', cv.bg); await writeImg('mobile/assets/splash.png', cv.splash); await writeImg('mobile/assets/splash-dark.png', cv.splash);
    }
    if (o.steam) {
      await write('steam/www/index.html', html); for (const [k, rel] of Object.entries(steamFiles(o, slug))) await write('steam/' + k, rel); await writeImg('steam/build/icon.png', cv.iconOnly);
    }
    forge.ui.toast('Packages written to store-export/' + slug, 'ok');
    forge.ui.modal({ title: 'Packages ready', html: `<div style="line-height:1.6"><p>Created in <code>store-export/${slug}/</code>:</p><ul>${o.android ? '<li><b>mobile/</b> – Google Play + App Store (Capacitor). Open <code>README-MOBILE.md</code>.</li>' : ''}${o.steam ? '<li><b>steam/</b> – Steam (Electron + steamcmd files). Open <code>README-STEAM.md</code>.</li>' : ''}<li><b>STORE-CHECKLIST.md</b> – assets and forms the stores require.</li></ul><p>Next: <code>npm install</code> in the target folder and follow its README. Signing and uploading happen with your own store accounts.</p></div>` });
  } catch (e) { forge.ui.toast('Store export failed: ' + e.message, 'error'); }
}
forge.commands.register({ id: 'package', title: 'Store Export: Package game…', run });
