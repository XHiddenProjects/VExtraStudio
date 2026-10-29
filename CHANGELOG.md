# Changelog

All notable changes to Vextra Studio. Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [2.0.0] — current

Everything after the first downloadable build (v1.0.0).

### Added
- **Close workspace** (explorer toolbar button and Command Palette). Closes all tabs (asking about unsaved changes), returns to the Welcome page and no longer auto-reopens the last folder.
- **Remove items from Recent**: ✕ on each entry plus *Clear all*; the Welcome page updates immediately.
- Full **Markdown Preview** plugin (outline sidebar, tables, task lists, syntax-highlighted code with line numbers, sticky Copy button, Rendered/Source toggle).
- **Web backend tooling**: any file type, internal SQLite database (`database.sqlite`, `VXDB` in previews), PHP preview (needs PHP installed), local static server, templates (blank first, PHP + SQLite).
- **Export website** as ZIP or tar.gz including `.htaccess` and `nginx.conf`.
- **Store export** plugin (Steam / Google Play / Apple App Store packaging helpers; store accounts required to publish).
- Blocks: `once` trigger, Expression inputs A–F, Ad block *service* option, camera width/height follow (2D) and first-person camera (3D); first-person 3D demo.
- Real **Simple / Advanced** mode; collapsible block editor panels and nodes; device frames that stay in view.
- Blank new 2D / 3D / UI / web projects.
- `SECURITY.md` and this changelog.

### Changed
- Dependencies now use `^` ranges: `@tauri-apps/cli ^2.12.4`, `ace-builds ^1.45.2`, `three ^0.186.1`, `sql.js ^1.15.2`, `esbuild ^0.28.2`.
- three.js upgraded 0.170 → 0.186. Its split build (`three.module.js` + `three.core.js`) is bundled into a single file by `scripts/vendor.js` (via esbuild) so exported games still inline one module.
- Selection outline, preview interactivity hardening, adaptive layout, sticky documentation Copy button.

### Fixed
- **Double paste**: copy / paste / duplicate / undo / redo fired twice because the viewport or graph handler and the editor root both handled the same key press. Keys handled by a canvas are now flagged and skipped by the root.
- Labels disappearing after a game reset; Timer → Camera/Label wiring; Play device frame invisibility; Expression input state; unused-variable Rust warning.

### Security
- **Cross-window communication with unrestricted target origin**: all editor ⇄ preview messages now require a per-session token and a verified `source`; targets are pinned to the page origin (Play iframe uses `'*'` because it has an opaque origin, protected by the token). See `SECURITY.md`.
- **glib `VariantStrIter` unsoundness (RUSTSEC-2024-0429)**: transitive via Tauri's GTK3 stack, unused by Vextra, Linux only; documented in `SECURITY.md` and will be resolved with the Tauri upgrade.

## [1.0.0] — first downloadable build

- Tauri v2 desktop app: code editor, UI designer, 2D/3D game editor with block graph and script views (≈100 blocks in 9 categories), asset studios (sprite, model, sound), live web preview, plugin system with docs, cloud/sharing server with accounts, uninstaller/cleanup tools, documentation viewer, themes.
- Game export to standalone HTML; demo 2D and 3D games.
