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
Drop a `.js` file in the plugins folder (Plugins panel → Open folder) with a `/** @forge-plugin {...} */` manifest and an optional `/** @forge-docs ... */` block. See `plugins/` for examples and Docs → Plugins → Plugin API.

## Known limits (please read)
- The Rust side (`src-tauri`) was written but **not compiled** in the environment this was built in. The whole front end, game runtime, and server were run and tested in a headless browser. Expect to fix small compile errors on first `npm start`.
- Ads, Game Center, achievements and device features are web fallbacks / simulations with hooks, not native SDK integrations.
- No glTF import (voxel, primitive-group and OBJ models only).
- Plugin blocks must be self-contained functions to survive export.
- Legacy `.forgescene` files are converted best-effort. Data from the old McDev app folder is not migrated.
