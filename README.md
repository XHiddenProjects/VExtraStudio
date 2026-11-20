# Vextra Studio

A desktop workspace (Tauri v2 + plain JavaScript) for **web development** and **2D / 3D game making**.

- **Code editor** (Ace) with live web preview and device frames
- **UI designer** – drag components onto a canvas, export HTML
- **Game editor** – 2D and 3D scenes, 100 visual logic blocks (Triggers, Logic & Math, Components, Properties, Text & Lists, GUI, Game Flow, Mobile Device, Behavior Bundles), a script view of the same logic, and your own assets: pixel-art sprites, a sound synthesizer with step sequencer, voxel / shape / OBJ models
- **Play, device simulator, export to a single HTML file**
- **Plugins** with in-app documentation (Docs → Plugins), themes
- **Accounts, collaboration, public hosting** via the bundled sharing server

## Run it
Requires Node.js 18+ and Rust (rustup). On Linux you also need the Tauri system packages (webkit2gtk etc., see tauri.app/start/prerequisites).

```
npm install        # also copies Ace + three.js into renderer/vendor
npm start          # desktop app (tauri dev)
npm run build      # installer / bundle
npm run web        # browser-only mode on http://localhost:5173 (no Rust needed; files are kept in memory)
npm test           # syntax checks + end-to-end test of the sharing server
```

## Share, collaborate, host
```
npm run server     # sharing server on http://localhost:8787  (PORT, DATA_DIR, PUBLIC_URL, ALLOW_REGISTER=0)
```
In the app: Cloud panel → *Server* → your URL → create an account → *Publish current project*. Games and sites are served at `/p/<user>/<name>/`; collaborators join with an invite code and sync every few seconds. To make links public, run the server on a machine/host that is reachable from the internet (put it behind HTTPS, e.g. Caddy or nginx) and set `PUBLIC_URL`.

## Uninstall / clean up
```
npm run clean            # remove build artefacts (node_modules, src-tauri/target, renderer/vendor)  – alias: npm run autoclean
npm run uninstall        # interactive; choose clean or full
npm run uninstall:auto   # no questions: artefacts + Vextra's settings, plugins, themes, saved sign-in
node scripts/uninstall.js --mode=full --dry-run          # preview only
node scripts/uninstall.js --mode=full --auto --toolchain  # also uninstall rustup (asks you to type a confirmation)
```
Your own projects and games are never deleted. The same clean-up of app data is available in the app under Settings.

## Write a plugin
Drop a `.js` file in the plugins folder (Plugins panel → Open folder) with a `/** @vx-plugin {...} */` manifest and an optional `/** @vx-docs ... */` block. See `plugins/` for examples and Docs → Plugins → Plugin API.

## What's new in 4.2.x
- **Host & collaborate (Settings → Host & share).** Private by default. Switch to public to share your server with people outside your device, either through a **ghost domain** (a tunnel address that hides your real IP; the helper download is asked for first) or a **direct port forward** (UPnP). You can create a **self-signed certificate**, hand out **invite codes**, and set an auto-stop timer. Switching back to private stops everything.
- **Project packs (`.vxpack`).** Double-click one (or File → Open): it is unpacked into its own folder and everything is built: `.vxs` scripts are compiled to blocks, every `.vxgame` is checked, and each game gets a web build in `build/`. Programs and unsafe paths are never written; nothing runs until you press Play.
- **VXScript (`.vxs`).** A small non-JavaScript language that compiles to the block graph (📜 button in the game editor). Scripts are compiled, never executed.
- **Night Shift: Tape 07.** A 3D found-footage horror game seen through a VHS camcorder (new *VHS Tape* shader block): 3 levels, 4 cutscenes, objectives, a stalker that hunts by sound. It is built **entirely from blocks**: open *Examples → Night Shift* in the game editor, or `examples/night-shift/night-shift.vxgame` (plus a ready `.vxpack` and web build in that folder) and edit every behaviour in the Logic tab.
- **Pause menu, frame rate & FPS counter:** every game pauses with Esc (Resume / Settings / Restart / Quit); *Game settings* has a frame-rate dropdown and a debug mode that shows the FPS.
- **Backup add-on** (`plugins/backup.js`).
- **Updates never touch your data.** It lives outside the install folder, and a safety copy is made before every update (`update-backups/`, last 3 kept).
- **Vextra AI** waits longer for slow models and retries instead of locking; only the token limit locks.
- **Everything is `vx` now:** `@vx-plugin`, `@vx-docs`, the `vx` plugin API. Old `@forge-*` tags and the `forge` name still work.

## How Vextra compares
Broad strokes, from each project's public information as of November 2026 (please verify before deciding; all of these are good tools and change often). Vextra is young and focused; it is not a replacement for a full AAA pipeline.

| | Vextra Studio | Unity | Unreal Engine | Godot | GameMaker | Construct | Phaser / three.js |
|---|---|---|---|---|---|---|---|
| Kind | Web + game workspace | Game engine | Game engine | Game engine | 2D engine | 2D (browser) | JS libraries |
| 2D / 3D | Both (basic 3D) | Both | Mostly 3D | Both | 2D | 2D | 2D / 3D |
| Visual logic | Blocks + script view + VXScript | Visual Scripting | Blueprints | VisualScript removed; GDScript/C# | GML Visual | Event sheets | No (code) |
| Web / code editor built in | Yes | No | No | Partly | No | Browser-based | No |
| Web export | Single HTML file | WebGL | Limited | Yes | Yes | Yes | Native |
| Source open | Yes | No | Source available | Yes (MIT) | No | No | Yes |
| Heavy 3D / consoles | No | Yes | Yes | Partly | Some | No | Library only |
| Install size | Small | Large | Very large | Small | Medium | None (web) | n/a |

## What's new in 3.11.x
- A **live Blender link** (`tools/blender-addon`): pull models from Blender, send models to it, auto-sync edits – plus one-click glb export and a **model optimizer** (`tools/model-optimize`).
- **Store Export understands VR / AR games:** **Meta Quest (Horizon Store)** package, Android WebXR package, phone permissions, Steam VR launcher.
- **Download installers from the Releases page** – built automatically by GitHub Actions (newest runners and Node.js LTS) for Linux, macOS (Apple silicon + Intel) and Windows, with SHA-256 checksums. The Windows installers (.exe and .msi) both offer to delete your app data when you uninstall (see Docs → Uninstalling).
- **Live demo in your browser** (GitHub Pages) – look around without installing. Build it yourself with `npm run build:web`. To publish it from your fork: Settings → Pages → Source: *GitHub Actions*, then push to the default branch.

## What was new in 3.10.0
- **Skeletons, animations, Draco and Meshopt** in 3D models, plus a **Model Animation** block to play clips.
- **Import from other tools:** FBX (Mixamo, Maya, 3ds Max…), Collada, STL, PLY, 3MF → game-ready `.glb`.
- Bluetooth now works in the Play tab (permission fix).

## What was new in 3.9.0
- **GLB / glTF models** – import 3D models from Blender and others in Assets → Models.
- **A demo video for every block** in the documentation.
- **Voice commands can use a local model** (Whisper server on your computer) **or a cloud service**, like the AI plugin.
- **VR and AR demo games** – Toy Toss, Orb Garden, AR Garden, AR Tape Measure – and floating **3D Text**.
- **Bluetooth blocks** (Connect, Read, Write, Notify), a **Get Field** block, and readable results instead of `[object Object]`.
- **13 more blocks in the Block Extras plugin** and demo clips for plugin blocks.
- **Live values** in the Logic tab (▶ Live), Exit Game ✕ + force close, Pause Game toggle fix, VR Toy Toss faces the table.
- VR / AR *Look At* is more reliable.
- Sky Parkour's fallen tiles come back when you respawn.

## What's new in 3.8.0
- **10 interface languages** (incl. right-to-left Arabic) in Settings → Language.
- **Accessibility:** screen-reader labels and dialogs, keyboard moving of blocks, skip link, reduce motion, high-contrast themes, interface zoom.
- **Store Export installs Java, Gradle and the Android SDK itself**, replaces old versions when updating, and produces an APK in `mobile/dist` that opens in Android Studio or on a Mac.

## What's new in 3.7.0
- **Customizable loading page** for every game (title, colours, logo, tips, progress style) with the Vextra Studio credit.
- Exported websites and UI designs carry a "Made with Vextra Studio · © XHiddenProjects" footer.
- Store Export builds with **Java 27** and retries slow downloads.
- Fixed spawned objects that were invisible in some games; Echo Maze now hears your voice.

## What's new in 3.6.0
- **Layers** (Background / World / UI) with show / lock, and UI-layer objects that stay on screen.
- **Edit UI layout:** drag labels and bars to where you want them, or type the anchor and X / Y.
- **Live cursor + selected-object position** in the 2D and 3D viewports.
- Object scripts are now **behaviours** (Logic tab) – old projects convert automatically.
- **All ten example games are block graphs** – open one in Logic and read or rewire it. New **Light** block for live 3D lights.
- New **[ACCESSIBILITY.md](ACCESSIBILITY.md)**.

## What's new in 3.5.0
- **Ten example games** (5 × 2D, 5 × 3D) in Library → Games.
- **Store Export** checks Java / Gradle / Android SDK automatically (JAVA_HOME), installs and updates them for you, and shows a simple checklist.
- **vxui as a site builder** (pages, ready-made sections, tablet/phone preview) and **Vextra AI 2.0** (guide, code blocks, entity/scene/game behaviour targets, runs in the background).
- **Vextra AI 2.2**: token limit with a one-hour cooldown and checkpoint, status icon, per-model settings, design editors / Blender, visible play-tests. (2.1: plays and screenshots its own work (games and web pages), accepts attached pictures / video / audio / files, and no longer loops without changing anything.
- **Responsive vxui**: exported designs scale to any screen, stack on phones and support `#` links and multiple pages. **Designer & Game Extras 2.0** adds 7 designer components and 6 game objects. Optional **Windows code signing** (SmartScreen) in the release workflow.
- **Signed auto-updates** on desktop (Settings → About → Install and restart); set up once with `npm run updater:keygen`.
- Voice Command speech-service fallback, mouse-look and kinematic-gravity fixes. See `CHANGELOG.md`.
- Community files: contributing guide, code of conduct, issue and pull request templates.

## What's new in 3.4.1
- Microphone and camera blocks now work in the editor's Play panel (the editor hands the devices to the sandboxed game), with clear error messages.

## What's new in 3.4.0
- **Realism**: physically based materials + screen effect for hyper-realistic 3D.
- **New block groups**: Microphone, Camera, VR and AR (with desktop fallbacks).
- Custom shader / material **drop-downs** in the Shader block and the Inspector.

## What's new in 3.3.0
- **Drag to reorder** editor tabs, bottom-panel tabs and sidebar icons.
- **Vextra AI**: Build & change site permission, checkpoints (Continue), token usage bar, context window for every provider, time-out lock, Reconnect with auto-countdown, more providers.
- **Security**: CodeQL findings in Vextra Shield fixed (see `SECURITY.md`).

### Pushing to GitHub (Git LFS)
`vextra-server.exe` (the bundled local server, built by `npm run build:server`) is about 100 MB, and GitHub rejects normal files that large. It is stored with **Git LFS** instead (`.gitattributes` already lists it, and it is not in `.gitignore`):
```
# once, after installing Git LFS from https://git-lfs.com
npm run lfs:setup
git add .gitattributes src-tauri/resources/server
git commit -m "Add server binary via LFS"
git push
```
If the exe was already committed *without* LFS, convert it: `git lfs migrate import --include="src-tauri/resources/server/vextra-server.exe" --everything`, then `git push --force-with-lease`. GitHub's free plan allows 2 GB per LFS file but only 10 GiB of LFS storage + bandwidth per month; for many releases publish builds on the **Releases** page instead.

## What's new in 3.2.0
- **Vextra Shield** security plugin with a ⚙ Configure button; plugin hooks and `vx.config`.
- **One Animation block** for everything (sprite/model/clip, Auto walk-idle-jump), synced with its target; **F3** cycles 1st / 3rd-back / 3rd-front camera in 3D.
- **Vextra AI** plugin (Claude, OpenAI, Gemini, Groq, Ollama… with Deny/Ask/Allow permissions) and **account security** (authenticator app, recovery codes, security keys).
- **Start local server** button in the desktop app (bundled server, no terminal); every object/target field is a dropdown; settings open as `plugin:<name>` tabs.
- Fixed leftover outlines when scaling 3D objects. `esbuild` install script allowed by default.

## What was new in 3.1.0
- Separate **animation studios** for sprites and 3D models (🎞 Animate tab), with a calm, paused-by-default preview.
- **2D lights** with scene darkness; clearer 3D light helpers.

## What was new in 3.0.0
- **Library**: install website templates and 2D/3D games from a URL, GitHub repo or catalog (defaults included).
- **Animation clips**, **material files** (also in the model editor), a 25-effect **shader** list with modes and custom shader files.
- Blocks: self-connect, Switch / Toggle switch, Number rounding, Collision side, Cursor *none*, icons on blocks and file types, resizable block settings.
- **Store Export** installs, assigns and builds automatically with a progress bar.
- Flexible layout that reflows with the window; more default 2D/3D assets; read-only notice moved to the top of the code pane.
- Build scripts: `npm run build:win`, `build:linux`, `build:mac` (replaces `build:exe`).

## What was new in 2.0.0
- Web projects: any file type, a built-in SQLite database (browse/edit/SQL/import/export), `window.VXDB` in previews, PHP run (desktop, needs PHP installed), local-server preview, and **Export website** to ZIP / tar.gz with `.htaccess`, `nginx.conf`, database and deploy notes.
- Games: `Once` trigger, Expression variables a–f, camera view width/height, GUI banner ads with an ad-service choice (house, image, HTML tag, AdSense, own code), first-person 3D demo, blank new projects (demos under the Command Palette), labels that survive restarts, working device frames in Play.
- Editor: collapsible block palette / settings / nodes, panels that adapt to window size, real Simple vs Advanced modes.
- Markdown Preview plugin: outline, syntax-highlighted code with line numbers and a Copy button that follows the scroll. Docs use the same code blocks.

## Known limits (please read)
- The Rust side (`src-tauri`) was written but **not compiled** in the environment this was built in. The whole front end, game runtime, and server were run and tested in a headless browser. The PHP-server and local-preview-server code was compiled and run on its own (std only) but not inside Tauri. Expect to fix small compile errors on first `npm start`.
- PHP features need PHP installed on your computer. AdSense / ad tags need your own approved account and internet access. Store export prepares build-ready projects; signing and uploading need your own developer accounts.
- Ads, Game Center, achievements and device features are web fallbacks / simulations with hooks, not native SDK integrations.
- No glTF import (voxel, primitive-group and OBJ models only).
- Plugin blocks must be self-contained functions to survive export.
- Legacy `.forgescene` files are converted best-effort. Data from the old McDev app folder is not migrated.

See [CHANGELOG.md](CHANGELOG.md) for release notes, [SECURITY.md](SECURITY.md) for the security policy and known advisories, and [ACCESSIBILITY.md](ACCESSIBILITY.md) for accessibility.
