# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 4.4.x   | ✅ security fixes (current) |
| 4.3.x   | ✅ security fixes (upgrade to 4.4.x) |
| 4.2.x   | ✅ security fixes (upgrade to 4.4.x) |
| 4.1.x   | ✅ security fixes (upgrade to 4.4.x) |
| 4.0.x   | ⚠️ please upgrade to 4.4.x |
| 3.12.x  | ⚠️ please upgrade to 4.4.x |
| 3.11.x  | ⚠️ please upgrade to 4.4.x |
| 3.10.x and older | ❌ please upgrade |

Current version: **4.6.0** (see `VERSION`). This policy was last reviewed for 4.6.0.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's **private vulnerability reporting** (the repository's *Security* tab → *Report a vulnerability*); no email address is needed. Include a description, reproduction steps and the affected version. You will get an acknowledgement within 5 working days; fixes are released as patch versions and listed in `CHANGELOG.md`.

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

## v3.0.0 additions (still apply in 3.1.0)
- **Library downloads** (`http_download`): https only, 50 MB cap, archive paths sanitised, user confirmation before anything is written. Templates and games are code: install only from sources you trust.
- **Process runner** (`run_start`): only `npm`, `npx`, `node`; working directory must be inside a `store-export` folder; arguments limited to `[A-Za-z0-9@./:=,+-_]`; no shell is used. npm packages named in generated `package.json` files run their install scripts as usual.

## v4.6.0 notes
- **File deployment (Helpdesk).** Uploads are admin-only (same rule as the rest of the Helpdesk: only the Vextra app on the server computer), stored under `helpdesk/files/` (directory mode 0700) with the SHA-256 computed on the server, limited to 200 MB, and uploaded in ordered chunks that are refused if they are out of order, oversized or incomplete. File names are restricted to letters, digits, spaces and `. _ ( ) + -` (no `..`, no slashes), and the target folder to `A–Z a–z 0–9 . _ - / \ :` without `..` or spaces, so neither can reach another path or act as an option.
- **Copy then verify.** Files are copied with `scp` using the same sign-in and host-key handling as ssh (password via the askpass helper, never on a command line). After the copy the device reports the file's SHA-256; if it differs from the uploaded file the copy is **deleted and nothing is run**. A dry run copies nothing.
- **Running a file is code execution on the device.** It happens only for packages that say so, only after the Deploy confirmation (which says the file will be run), with the rights of the chosen sign-in, and it is written to the audit log. The *Arguments* field is inserted as typed (so installers get their switches); it is limited to one line of 300 characters and is admin-only. Paths are always quoted. Only upload and run files you trust. A file that a package uses cannot be deleted.
- **Voices and lyrics** run entirely in the app (Web Audio); lyrics are never sent anywhere. Lyrics are limited to 600 characters per track, and numeric fields in the studio are range-checked.
- The simulated tilt/shake messages are still accepted only from the editor window that started the game (token + origin check); the game's browser motion events are only raised from those messages.

## v4.5.0 notes
- **Helpdesk threat model.** Network scanning is limited to private ranges (at most a /22, 2048 addresses per scan, rate limited) and is only probing/ARP. Management (devices, sign-ins, packages, deploy, actions, tickets admin) is refused unless the request comes from the Vextra app on the computer that runs the server (the same check as hosting); signed-in users can only raise and read their own tickets and never see internal notes.
- **Sign-ins** are encrypted with AES-256-GCM using a random key in `helpdesk/vault.key` (mode 0600). This keeps passwords out of backups and the JSON file; it does not protect against someone who controls the server computer. Prefer key files over passwords. Secrets are write-only through the API.
- **No injection:** scripts reach a device through ssh's standard input, never the command line; host names and user names that could be read as ssh options are refused; package names, versions, service names are validated and quoted; URLs must be https and installers need a SHA-256 that is verified before running; custom scripts are admin-only and flagged. SSH host keys are trusted on first use (`StrictHostKeyChecking=accept-new`) into the helpdesk's own known_hosts file.
- **Every change** (scan, add/remove device, deploy, action, sign-in, settings, ticket status) is written to an audit log. CSV exports neutralise spreadsheet formulas.
- Music/audio: recording asks for the microphone permission each time and nothing is uploaded.

## v4.4.2 notes
- **Form patterns:** custom regular expressions are rejected if longer than 200 characters, invalid, or shaped like nested repeats (`(a+)+`); the exported server evaluates them in a `vm` context with a 50 ms timeout and always re-validates what the browser checked.
- **Client validation is convenience only;** the server is authoritative. The login/sign-up popup changes no access rules, and "who sees it" (members/guests) stays cosmetic – members-only *pages* are enforced by the server.
- **`MIN_PASSWORD`** (Vextra Cloud server, 6–64, default 8) is enforced on register and password change; `/api/health` reports it.
- Map address search sends only the text you type to OpenStreetMap Nominatim.
- Anti-cheat variable guard no longer stacks proxies (stability fix, no change to checks).

## v4.4.1 notes
- Start-up fix only: native calls are retried for a few seconds when the webview briefly reports an opaque origin. Only that one error is retried; every other error, the capability set and the IPC origin checks are unchanged.

## v4.4.0 notes
- **Sites made with the website builder** run on a small server that ships inside the exported folder. It stores passwords only as salted **scrypt** hashes, uses random session tokens (stored hashed; `HttpOnly`, `SameSite=Strict`, `Secure` on HTTPS), validates every form field on the server, refuses cross-site posts (Origin / Sec-Fetch-Site), limits request size and rate, locks out repeated wrong logins, hides e-mail and private fields from public lists, sends a strict Content-Security-Policy (no inline scripts), `X-Frame-Options: DENY`, `nosniff` and HSTS on HTTPS, serves only `public/` (no dot-files, path traversal blocked) and protects `/admin` with a rate-limited password (PBKDF2-SHA256, 210 000 rounds, or a random one printed at first start). CSV downloads neutralise spreadsheet formulas.
- **The builder never writes raw HTML from the page author:** all text is escaped, links accept only http(s), mailto, tel and relative addresses, image sources cannot be `javascript:` URLs, and there is no raw-HTML block.
- CodeQL findings fixed in the site server template: the admin-password comparison uses scrypt (no plain SHA-256 of a password) and error replies never echo exception text.
- **Advanced blocks:** Markdown is escaped before it is formatted and only safe link addresses survive; style options are whitelisted (colours must be hex, numbers are clamped, so a value cannot add CSS or attributes). Video embeds are rebuilt from a YouTube / Vimeo id (never copied from the owner) and the exported server's `frame-src` is limited to a fixed list (YouTube privacy mode, Vimeo, OpenStreetMap) and only for embeds the site uses; otherwise frames are blocked. New field types (date, web address, phone, rating) and **conditional fields** are validated on the server; a field whose condition is not met is neither required nor stored. Phone fields are never listed publicly. **“Who sees it” (members / guests) only hides a block in the browser** – real access control is *Members only* pages, which the server enforces.
- **UI designer removed:** `.vxui` is no longer a special file type, and the plugin call `vx.designer.registerComponent('ui', …)` now returns an error (game objects are unaffected).
- **Not covered:** e-mail sending, payments, password-reset mails and multi-server scaling. Run it behind HTTPS (see the generated `HOSTING.md`) and back up the `data` folder. A single process keeps its data in one JSON file.
- **Anti-cheat** runs in the player's browser, so a determined cheater can still defeat it; it is documented as best-effort deterrence and reporting, and scores that matter should also be checked on a server. The admin passphrase is stored only as a SHA-256 proof inside the exported game; keep it long. Anti-cheat report routes on the Vextra server accept reports from anyone (size- and rate-limited) but are readable and bannable only from the app on the computer running the server (loopback + `X-Vextra-Admin`).
- **Port forward / tunnel on publish:** the app only opens the server to the internet after you choose to (or set it to remember). While public, sign-up needs the server invite code and admin routes answer only this computer (unchanged); the ghost tunnel keeps your IP hidden, a port forward does not – the dialog says so.
- **QR code for two-step sign-in** is generated locally in the app; the secret never leaves the app and the server.
- **Read aloud** uses the device's own speech voices; no text leaves the device.
- The server-outdated notice now re-checks automatically and only restarts the local server when the app is allowed to.

## v4.3.1 notes
- **Bundled server lifetime:** the desktop app passes its process id to the server it starts; the server exits when that process is gone. Leftover servers are ended only by the exact file name `vextra-server` (never by port or other names) and only when their reported version differs from the app's, before an update, or by the installer.
- Fixed CodeQL "incomplete string escaping" findings: PHP ini values escape `\` and `"` and cannot contain line breaks; database `LIKE` filters escape `\`, `%` and `_`; docs table cells escape `\` and `|`.
- The AI cool-down is read from the saved lock before every request, so it cannot be shortened by opening a new chat, switching chats or reloading.
- Terminal shells are chosen from a fixed list or a custom program you enter yourself; the terminal still only runs after you confirm it and only from the panel.

## v4.3.0 notes
- **Share certificate:** a self-signed certificate is created per share, lives only as long as the share and is deleted when sharing stops (or earlier with *Delete certificate*; refused while in use). The auto-detected public address is looked up only when you start a public share; you can override it.
- **Terminal / PHP / database commands** exist only in the desktop app. The terminal runs with your own user rights in your project folder. The PHP server binds to `127.0.0.1`, runs without a console window and is killed (with its children) on stop or exit.
- **Database clients:** only `mysql`/`mariadb`/`psql` executables are accepted; host, user and database names are validated; passwords go through an environment variable (never on the command line, never saved to the project). SQL is sent on stdin.
- **PHP recommended setup** disables remote includes/URL fopen, hides PHP version and errors, hardens session cookies and disables shell-execution functions; changes are shown before saving and stored in your project (`.vextra/php.ini`), never in the system php.ini.
- **VXScript** remains compile-only; the new `block` statements are checked against the real block registry.

## v4.2.0 notes
- **Hosting:** private by default and never switched to public automatically. The host controls (`/api/host/*`) answer only to this computer (loopback, no proxy headers, localhost Host, `X-Vextra-Admin` header). The ghost-domain helper (cloudflared) is downloaded only after you agree. A direct port forward (UPnP) exposes your real IP address; the ghost domain hides it. Invite codes are required for new accounts while public. Self-signed certificates are for testing and collaboration and will show a browser warning.
- **.vxpack / .vxs:** unpacking skips programs (.exe, .sh …), absolute and `..` paths and enforces size/file limits; scripts are compiled to blocks and never executed; games run only in the play sandbox.
- **Updates:** a copy of your data is saved before installing; data is removed only by uninstalling with the data option.
- Plugins can read files via `readBase64` / `readDir` only inside their permitted folders.

## v4.1.0 notes
- **Play-test & screenshots (AI):** the game or page runs in a hidden iframe with `sandbox="allow-scripts"` only (no `allow-same-origin`, no forms, popups, pointer lock, camera or microphone), so it cannot reach the editor, your files or the Tauri bridge. Messages from it are accepted only from that frame's window and only with a one-time random token; the frame is removed when the test ends and a 25 s (games) / 12 s (pages) time limit stops runaway code. The probe script injected into the test copy is never written to your project or exported games. Screenshots are JPEG data URLs held in memory; they leave your computer only when you use a provider that receives images (below).
- **Attachments (AI):** files are read in the browser, kept in memory for the session and never written anywhere unless the AI uses `save_attachment` (needs the *Create & edit files* permission; same protected-path rules as every file write: inside the open folder only, never `.env`/keys/`.git`/`node_modules`). Limits: 8 files per message, 12 MB pictures, 80 MB video, 40 MB audio, 25 MB other. Videos are reduced to four small frames. **Pictures, video frames, text-file contents and play-test screenshots are sent to the AI provider you selected** – use a local model (Ollama, LM Studio) to keep them on your computer. Attached text files are treated as data, not instructions, but remember any model can be influenced by text it reads; keep the permissions on *Ask* when working with files you do not trust.
- **Permission:** *Play-test & take screenshots* is Deny / Ask / Allow like every other ability; it changes nothing in your project. Chat-only mode turns it off.
- **Loop guard:** a run that repeats itself is stopped after one warning, so a misbehaving model cannot keep changing files or spending tokens indefinitely (the *Max actions per request* limit still applies).
- **Token limit:** a per-hour cap; on reaching it the AI stops, sends one extra hand-over request to the provider you chose, and locks for an hour. The count is stored locally.
- **Design permission:** opening editors and the Blender link are gated by the `design` permission (default *ask*). Blender is reached only on localhost through the add-on's pairing key; no other desktop apps are controlled.
- **Visible play-test window** uses the same `allow-scripts`-only sandbox.

## v4.0.1 notes
- **Updater diagnostics (release workflow):** the "prepare the signed updater" step prints only yes/no and the public key's length. The private key (`TAURI_SIGNING_PRIVATE_KEY`) and its password are read from repository secrets into an environment variable, are never echoed, and GitHub masks them in logs. A missing secret or placeholder public key keeps the updater **off** (fail closed) – installers are still built, and no unsigned update is ever offered.
- **Keep the private key out of the repo and zips:** `C:\Users\<you>\.tauri\vextra-updater.key` stays outside the project. Do not overwrite your committed `src-tauri/updater/pubkey.txt` with the placeholder shipped in source archives.

## v4.0.0 notes
- **Windows signing secrets:** the certificate (`WINDOWS_CERTIFICATE`, base64 `.pfx`) is written to the runner only long enough to import it into the user store and is deleted immediately; Azure credentials are read from repository secrets and never written to files. `sign.conf.json` (thumbprint or signing command, no secrets) is generated per build and git-ignored. Signing changes nothing for users who verify the checksums.
- **Hash links in previews:** the preview frame is still sandboxed; the injected handler only changes the page's own `location.hash` and scrolls. It does not read other frames or the parent.
- **vxui export:** link targets and anchor names are sanitised (`#`, `/`, `http(s):`, `mailto:`, `tel:` only; anchor ids reduced to `A-Z a-z 0-9 _ -`), every value is HTML-escaped, and the countdown embeds only a number and an escaped string in its script. `javascript:` links are not produced.
- **Extras plugin:** all text is escaped; the 2D/3D object code is self-contained and runs only inside the game's own sandbox.
- **Editor suggestions:** not a security change, but nothing is sent anywhere – suggestions are local.
- **CodeQL:** the two *Improper code sanitization* alerts (vxui exporter, Extras countdown) are fixed: values embedded in an inline `<script>` go through an escaper for `<`, `>`, `&` and U+2028/9 instead of a `</script>` search-and-replace.
- **AI background runs:** `vx.pin()` only exposes the tab the request started in; a closed tab is reported as "no longer open" and nothing is written elsewhere. Permissions (deny / ask / allow) apply unchanged to background runs, and previews are not opened over another tab.
- **AI model list:** the list request goes to the URL you typed, with your key only when you entered one. It is sent through the app's own network call (https, or http only for this computer).
- **vxui pages and previews:** page names and anchors are reduced to `A-Z a-z 0-9 _ -`; the phone/tablet preview is a sandboxed frame; `#` links change only the page's own hash.
- **Updater errors** are shown as text only (no markup) and never expose the signing key.

## v3.12.0 notes
- **Auto-updater:** updates are verified with a minisign public key compiled from `src-tauri/updater/pubkey.txt`; an unsigned or tampered download is rejected. The private key lives only in GitHub secrets (never in the repo), the endpoint is HTTPS-only, no `dangerous*` options are used, and the updater commands are Rust-side only (no `updater:default` capability for the webview). The downgrade guard (`requireSignedVersion`) is not enabled yet.

## v3.11.3 notes
- **MSI data removal:** deleting data on uninstall is destructive, so it is opt-in at every step: the question defaults to *No* (also after a 2-minute timeout), a silent uninstall deletes nothing unless `REMOVEUSERDATA=1` is passed, upgrades never delete (`UPGRADINGPRODUCTCODE`), and the paths are fixed (`%APPDATA%\studio.vextra.app`, `%LOCALAPPDATA%\studio.vextra.app`) – never a folder the user chose. The question is a small inline JScript custom action; it only shows a Yes / No box and sets a property, and its failure is ignored (`Return="ignore"`). Some antivirus products treat any script custom action in an MSI as suspicious; installers may be unsigned unless Windows signing secrets are configured (see v4.0.0 notes) – verify downloads against `SHA256SUMS.txt`.
- **Updater:** *(superseded in 3.12.0, which added a signed auto-updater – see below.)* The private updater key must be stored only as an encrypted repository secret (or kept outside the project folder), never in the repository or a release zip.
- **Delete-everything button:** it only touches Vextra's own data folder and browser storage and asks for confirmation first.

## v3.11.2 notes
- **Workflow dependencies:** the release and Pages workflows use the newest major versions of the official actions (`actions/*`, `tauri-apps/tauri-action`, `swatinem/rust-cache`, `dtolnay/rust-toolchain`) and the newest runner images and Node.js LTS, so they get upstream security fixes. Actions are referenced by major-version tag, not pinned to a commit hash; if your threat model requires it, pin them to full commit SHAs (Dependabot's `github-actions` ecosystem can keep those up to date). Permissions are unchanged: `contents: write` only for the build / checksum jobs, `pages: write` + `id-token: write` only for the Pages deploy.

## v3.11.1 notes
- **Pages workflow:** no longer triggered by releases (tags cannot deploy to the protected `github-pages` environment). It keeps the minimum permissions (`contents: read`, `pages: write`, `id-token: write`); the deploy step is the only one that can publish, and only from the default branch.

## v3.11.0 notes
- **Store Export for VR / AR (Steam):** the generated launcher serves the game from a local http server bound to `127.0.0.1` on a random port (path-traversal safe, `Cache-Control: no-store`) and starts the player's installed Edge / Chrome with a separate profile folder; nothing is reachable from the network. The generated Android / iOS projects only add the permissions a VR / AR game needs (camera for AR, motion sensors) and iOS explains them to the player.
- **Blender live link:** off until you press *Start link* in Blender. The add-on's server listens on `127.0.0.1` only (never the network), every request except a harmless `/ping` needs the random pairing key (constant-time compare; *New key* in the add-on preferences revokes it), uploads are capped at 200 MB and models sent from Vextra are imported with Blender's own glTF / OBJ importers. The key is stored in the editor's local storage on your computer. Anyone who can already run code on your computer could read the key, which is why the link is not a security boundary against local malware.
- **Release builds (GitHub Actions):** `release-build.yml` runs only when a release is published (or when someone with write access starts it by hand). It uses the built-in `GITHUB_TOKEN` with `contents: write` limited to the build and checksum jobs, needs no other secrets, validates the release ID as a number and passes it through environment variables (no shell injection from release text). Every installer gets a SHA-256 in `SHA256SUMS.txt`. **Unless the Windows signing secrets are configured (see v4.0.0 notes), the installers are not code-signed or notarised**, so Windows SmartScreen and macOS Gatekeeper may warn on first start – verify the hash against `SHA256SUMS.txt` and download only from the Releases page of this repository.
- **Live demo site (GitHub Pages):** `pages.yml` publishes a static copy of the browser build (`scripts/build-web.js`). It runs entirely in the visitor's browser: no server, no accounts, nothing uploaded; projects stay in that browser's storage. The workflow has read access to the code and write access only to the Pages deployment. Plugins in the demo are the built-in ones; the sandboxed Play / Preview frames behave exactly as in the app.

## v3.10.0 notes
- **Model loaders:** `.glb` / `.gltf` are parsed by three.js' official GLTFLoader (bundled, no network access, no external URIs – only data inside the file). Draco and Meshopt are decoded by their official WebAssembly decoders; Draco runs in a Web Worker created from a Blob and fed only the file's bytes. Files over 40 MB are refused.
- **Importing other formats (FBX, DAE, STL, PLY, 3MF):** the readers run only in the editor, are loaded on demand, and the result is re-saved as an ordinary `.glb`; they are never included in exported games. Imports are limited to 60 MB. Textures that would need a file path or URL are dropped, so an imported file can never make the editor fetch anything.
- **Bluetooth permission:** the Play frame is allowed to ask for *bluetooth* (and usb / serial / hid); the browser still shows its own picker and nothing is paired without a click.
- **Blender add-on / optimizer script:** plain, readable scripts. The add-on only calls Blender's own glTF exporter; the optimizer runs `npx @gltf-transform/cli` (downloaded from npm on first use) – read it before running.

## v3.9.0 notes
- **Bluetooth blocks** use Web Bluetooth: the browser always shows its own picker (needs a click / key / touch and https or localhost), a game can only reach the device you choose and the services listed in the block, and nothing pairs in the background. Connections are closed when the game stops.
- **Plugin block demo clips:** `demo.video` is accepted only as an `https://` or relative `.webm` / `.mp4` link (never `javascript:` / `data:`), shown muted in a `<video>` element with no autoplay.
- **Live values view:** only in the editor – the game sends short text previews of block outputs (max 34 characters each) to the editor over the same one-time-token channel as logs; exported games never send them unless the editor asks.
- **Readable values:** the new text conversion only reads values; it never evaluates anything.
- **GLB / glTF import:** a built-in parser (no third-party code) reads only the file's own bytes. Limits: 40 MB per file, node depth 64; Draco / Meshopt-compressed files are refused; a `.gltf` may only use embedded `data:` buffers and images (no file or network references); images are decoded by the browser from a `Blob`. A model that cannot be read is replaced by a wireframe box and a console warning – it never stops the game.
- **Voice commands – local and cloud speech services:** a *local model* address must be on this computer (`localhost`, `127.x.x.x`, `[::1]`); a *cloud service* address must use `https://`. Both are checked again when listening starts. The service key is stored on your computer only and is sent only to the address you typed, as a Bearer header. Audio is sent only while a Voice Command block is listening, and these services work only while testing in Vextra – exported games never contain a key and use the player's own browser speech recognition.
- **3D Text objects** are drawn on a canvas with `fillText` (text only, never HTML); the `{variable}` template is the same one Labels use.
- **Documentation clips:** the docs play only local `.webm` / `.mp4` files from `docs/clips/` (muted, with controls, no autoplay) and pass the path through the same URL check as images. The clip generator in `tools/block-demos/` is a developer tool and is not part of the app.
- **XR demo games** (VR / AR) use the existing VR / AR blocks; they request camera or headset access only when you press Enter VR / Start AR.

## v3.8.0 notes
- **Loading page** (`settings.loading`): the title, subtitle, tips and colours you type are HTML-escaped when the page is generated, colours must be `#hex` values, and the logo must be a `data:image/` URL taken from your own sprites. Nothing from these settings is evaluated as code.
- **Credit footer** for exported websites and UI designs is fixed text with no links or scripts; only its alignment and colours are configurable.
- **Store Export toolchain:** downloads still use HTTPS to the same fixed list of hosts with SHA-256 verification. The new retry only repeats the same verified request (up to 4 times) after network errors; a download that fails its checksum is never retried or used. Java 27 is the requested JDK.
- **CodeQL fix (incomplete string escaping):** the Gradle wrapper URL written to `gradle-wrapper.properties` now has backslashes escaped before colons, and replacements use function replacers so `$` sequences in a value are never interpreted.
- **Touch blocks** (Joystick, Touch Button, Touch Look) only create DOM elements and synthetic key / mouse-move events inside the game; sprites come from your own project and labels are set as text, never HTML.
- **Loading page:** the minimum display time is clamped to 1.5–10 seconds.
- **Spawn fix:** an `undefined` override no longer replaces a default value on a spawned object.

## v3.6.0 notes
- **Script → behaviour conversion** only moves text from one field of the project file to another; nothing is executed during conversion. Code behaviours run exactly as before: inside the sandboxed Play frame / exported page, never in the editor's own context.
- The **Logic tab preview** of a code behaviour runs the script once against inert stand-ins (`game`, `self`, `VXRT`… do nothing), so previewing no longer reaches real engine services such as the microphone or camera.
- **UI layout** (`scene.uiLayout`) stores only an anchor name and two numbers per element id; values are validated as numbers/known anchors when applied and are never evaluated as code.
- Layer visibility / lock in the editor is view-only state and is not saved into the game.
- **Example games are block graphs**, so they run through the same block runtime as any project (Expressions are parsed by the engine's arithmetic parser, not `eval`). The new **Light** block only sets a light's numeric brightness and a colour string on the object.
- Accessibility reports can be filed publicly (see `ACCESSIBILITY.md`); security problems should still go through the process above.

## v3.5.0 notes
- **Android toolchain auto-install (Store Export):** HTTPS only; hosts limited to api.adoptium.net, github.com / githubusercontent.com, services.gradle.org / downloads.gradle.org, developer.android.com and dl.google.com; every archive's SHA-256 is verified before it is unpacked; archive paths are checked (no zip-slip); installs go to your user folder (`~/.vextra/toolchain`), never need administrator rights, and no shell is used except Gradle's own launcher. The process runner restrictions above are unchanged.
- **Speech service fallback** is off unless you set a URL and key in Settings. The key is stored in the app settings on your computer and audio is sent only to that URL while a Voice Command block is listening.
- Example games are ordinary projects (scripts included) – review any game you import from elsewhere.

## v3.4.1 notes
- The editor's Play frame stays sandboxed (no `allow-same-origin`). Instead of loosening it for the microphone and camera, the editor opens the devices and sends the game only data (audio analysis arrays, small camera frames, recognised text). Only the frame the panel started may ask (one-time token + source check); the streams are stopped when the game stops, and nothing leaves the computer.

## v3.4.0 notes
- **Microphone, camera, VR and AR** blocks ask the browser for permission and only work while the game is open. Microphone sound and camera frames are analysed **locally in memory** (level, motion, colour) – no audio or video is recorded, stored or sent anywhere by Vextra. The *Photo* block keeps a picture only in a game variable (or a download the player triggers). Speech recognition (Voice Command) is done by the browser's own service, which may send audio to its vendor (Google / Apple) – mention this in your game's privacy notice.
- Games run inside a sandboxed frame in the editor; the frame is allowed `microphone`, `camera` and `xr-spatial-tracking` only (no geolocation, no clipboard).
- Streams are released when a block stops, the scene changes or the game is closed (reference-counted, so the camera light turns off).

## v3.3.0 notes
- **CodeQL findings fixed** (`plugins/vextra-shield.js`): *Improper code sanitization* (×3) – the exported-game scripts (save guard, embed guard) are now fixed text and read their settings from escaped `data-` attributes instead of having JSON spliced into JavaScript; *Bad HTML filtering regexp* – script-tag matching now also handles end tags such as `</script foo>`. The same regular expression was corrected in the AI site preview and the web tools.
- **Repository hygiene**: the generated server binary (`vextra-server[.exe]`) is stored with Git LFS and installers are git-ignored; publish release builds with checksums and verify downloads against them. LFS objects are fetched from GitHub over HTTPS like any other file.
- **Vextra AI**: new *Build & change site* permission (Deny / Ask / Allow); website files are written only under it, and `new_site` never overwrites existing files. Stop now aborts a pending request or approval immediately. The *Context window* limit trims what is sent to the provider.
- Dependencies were updated to their latest releases (`npm audit`: 0 known vulnerabilities).
- Drag-to-reorder uses the pointer only and moves no data outside the window.

## v3.1.0 notes (still apply in 3.3.0)
- No new network, file or process permissions. The new animation studios, 2D lights and model poses are pure front-end features that run inside the existing sandboxed game preview.
- Sprite/model animation data is stored as plain JSON inside the game file and is validated on load (frame indices outside the sprite are dropped; unknown track names are ignored).

## v3.2.0 notes
- **Vextra Shield** (built-in plugin, configurable via its ⚙ button) hardens exported games with a Content-Security-Policy (inline scripts pinned by SHA-256, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`, network limited to HTTPS/WSS plus hosts you list; `unsafe-eval` stays because the engine and code behaviours need it), signs local saves to detect edits, enforces a password policy and client-side sign-in lockout, signs out idle sessions, warns before sending passwords over `http://` to non-local servers, and scans files for secrets before publishing. These are defence-in-depth measures: client-side checks can be bypassed by someone modifying the app, so the server's own controls (scrypt hashing, rate limiting) remain authoritative.
- New plugin hooks (`game.export.html`, `account.*`, `publish.before`) let plugins veto or change those actions. Plugins already run with editor privileges, so only install plugins you trust.
- `package.json` allows install scripts only for `esbuild` (`allowScripts` for npm 11.16+/12, `pnpm.onlyBuiltDependencies`, `trustedDependencies`, `dependenciesMeta`). Review any dependency before adding it to those lists.
- Fixed: selection outlines left in the 3D editor after scaling (no security impact).
- **Two-step sign-in** (server): authenticator-app codes (TOTP, SHA-1/6 digits/30 s, ±1 step, a code cannot be reused), 8 one-time recovery codes (stored hashed), and WebAuthn security keys (ES256, attestation `none`, signature-counter check). The second step uses a 5-minute ticket limited to 6 tries, plus the per-IP rate limit. Turning it on/off, adding/removing keys and new recovery codes require the account password. The TOTP secret is stored in the server's `users.json` (protect the data folder like any credential store). Keys only work from the app address they were added from.
- **Vextra AI** plugin: prompts and anything the AI reads go to the provider you choose (local providers stay on your computer). API keys are stored in Vextra's local settings. Abilities (read, edit open file, create & edit files, delete/move, build & change game) are Deny / Ask / Allow; file deletion and moves have their own permission and never touch `.git`, `node_modules` or secret-looking files; secret-looking files (`.env`, keys, certificates) are never read or written; writes stay inside the open folder. Treat model output as untrusted – review changes you allow automatically (Agent mode).
- **Local server** started from the desktop app listens on `127.0.0.1` only and keeps its data in the app's data folder. `vx.net.request` only allows `https://` (and `http://localhost`).
- Store Export projects approve install scripts only for `electron`, `sharp` and `esbuild`.
