# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 2.0.x   | ✅ security fixes |
| 1.0.x   | ❌ please upgrade |

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Email the maintainers (see `author` in `package.json`) with a description, reproduction steps and the affected version. You will get an acknowledgement within 5 working days; fixes are released as patch versions and listed in `CHANGELOG.md`.

## How Vextra Studio protects you

- **Sandboxed previews.** Game *Play* and web *Preview* run in sandboxed iframes without `allow-same-origin`, so user code cannot reach the editor, your files or the Tauri bridge.
- **Authenticated cross-window messaging.** Every parent ⇄ preview message carries a random per-session token (`VX.channel`). The editor ignores messages without the token or from a different `source` window, and replies are posted to a pinned origin. The one exception is the Play iframe: it is sandboxed with an *opaque* origin, which browsers only address with `'*'`. That channel is protected by the token and the `source` check instead, and carries no secrets beyond the session token.
- **Local servers** (PHP preview, "Local server") bind to `127.0.0.1` only and serve only the opened project folder; path traversal is rejected.
- **Archive writers** strip `..` and absolute path segments from entry names.
- **Plugins** run with editor privileges. Only install plugins you trust; review the source first.
- **Dependencies** are declared with `^` ranges and refreshed for each release (`npm audit`, `cargo update`).

## Known advisories

### RUSTSEC-2024-0429 – unsoundness in `Iterator`/`DoubleEndedIterator` for `glib::VariantStrIter` (glib 0.18.5)

- **Status:** not exploitable from Vextra Studio; cannot be upgraded yet.
- **Why:** `glib 0.18` is a *transitive* dependency of the Linux GTK3 stack (`gtk → tao / muda / wry → tauri 2.x`). The fixed `glib ≥ 0.20` is a semver-incompatible GTK-rs release that Tauri 2 does not yet use, and `Cargo.lock` is already at the newest compatible versions of every crate (`cargo update` makes no change).
- **Our code:** Vextra never calls `glib::VariantStrIter` (or any `glib::Variant` API); the affected iterator is not reachable from our Rust sources or from the web frontend.
- **Scope:** Linux builds only. Windows and macOS builds do not link glib.
- **Plan:** moves with Tauri. We will upgrade as soon as a Tauri release depends on a fixed glib. Track this entry in `CHANGELOG.md`.

## Hardening tips for deployments

- Keep the optional cloud/sharing server (`npm run server`) behind HTTPS and set a strong secret.
- Exported websites ship `.htaccess` / `nginx.conf` with conservative headers; review them for your host.

## Static analysis

The repository is scanned by GitHub CodeQL. Values embedded in generated inline `<script>` blocks are serialised with `VX.jsLit`, which escapes `<`, `>`, `&`, U+2028 and U+2029, so they cannot terminate the script or inject code.
