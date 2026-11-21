//! Vextra Studio – native backend. Everything the UI needs from the OS lives here:
//! file access, extension (plugin/theme) storage, settings, HTTP for cloud features, native menu.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    net::TcpListener,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::UpdaterExt;

mod builtin {
    include!(concat!(env!("OUT_DIR"), "/builtin.rs"));
}

type Res<T> = Result<T, String>;
fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

const SKIP_DIRS: [&str; 7] = ["node_modules", ".git", "target", "dist", ".next", "vendor", ".DS_Store"];

/* ---------------------------------------------------------------- paths */

fn user_dir(app: &AppHandle) -> Res<PathBuf> {
    let d = app.path().app_data_dir().map_err(err)?;
    fs::create_dir_all(&d).map_err(err)?;
    Ok(d)
}
fn kind_dir(app: &AppHandle, kind: &str) -> Res<PathBuf> {
    if kind != "plugins" && kind != "themes" {
        return Err("unknown extension kind".into());
    }
    let d = user_dir(app)?.join(kind);
    fs::create_dir_all(&d).map_err(err)?;
    Ok(d)
}
/// Reject file names that could escape the folder they are saved in.
fn safe_name(name: &str) -> Res<&str> {
    let bad = name.is_empty() || name.contains('/') || name.contains('\\') || name == ".." || name == ".";
    if bad {
        Err(format!("invalid file name: {name}"))
    } else {
        Ok(name)
    }
}
/// A relative path such as "css/site.css": no absolute paths and no `..` segments.
fn safe_rel(name: &str) -> Res<PathBuf> {
    let norm = name.replace('\\', "/");
    let mut out = PathBuf::new();
    for seg in norm.split('/') {
        if seg.is_empty() || seg == "." {
            continue;
        }
        if seg == ".." || seg.contains(':') {
            return Err(format!("invalid path: {name}"));
        }
        out.push(seg);
    }
    if out.as_os_str().is_empty() {
        return Err("empty name".into());
    }
    Ok(out)
}
fn s(p: &Path) -> String {
    p.to_string_lossy().to_string()
}

/* ---------------------------------------------------------------- dialogs */

#[tauri::command]
async fn fs_open_folder(app: AppHandle) -> Res<Option<String>> {
    Ok(app.dialog().file().blocking_pick_folder().and_then(|p| p.into_path().ok()).map(|p| s(&p)))
}

#[tauri::command]
async fn fs_open_file(app: AppHandle) -> Res<Vec<String>> {
    Ok(app
        .dialog()
        .file()
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|p| p.into_path().ok())
        .map(|p| s(&p))
        .collect())
}

#[tauri::command]
async fn fs_save_as(app: AppHandle, default_name: String, content: String) -> Res<Option<String>> {
    let Some(p) = app.dialog().file().set_file_name(&default_name).blocking_save_file() else { return Ok(None) };
    let path = p.into_path().map_err(err)?;
    fs::write(&path, content).map_err(err)?;
    Ok(Some(s(&path)))
}

/// Pick a file and return it as a data-less record {path,name}; the UI then reads it with fs_read_base64.
#[tauri::command]
async fn fs_pick_files(app: AppHandle, extensions: Vec<String>) -> Res<Vec<String>> {
    let exts: Vec<&str> = extensions.iter().map(|x| x.as_str()).collect();
    let mut b = app.dialog().file();
    if !exts.is_empty() {
        b = b.add_filter("Files", &exts);
    }
    Ok(b.blocking_pick_files().unwrap_or_default().into_iter().filter_map(|p| p.into_path().ok()).map(|p| s(&p)).collect())
}

/* ---------------------------------------------------------------- files */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
async fn fs_read_dir(dir: String) -> Res<Vec<Entry>> {
    let mut out: Vec<Entry> = fs::read_dir(&dir)
        .map_err(err)?
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if name == ".DS_Store" || name == "Thumbs.db" {
                return None;
            }
            let is_dir = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            Some(Entry { name, path: s(&e.path()), is_dir })
        })
        .collect();
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

#[tauri::command]
async fn fs_read_file(path: String) -> Res<String> {
    let bytes = fs::read(&path).map_err(err)?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

#[tauri::command]
async fn fs_read_base64(path: String) -> Res<String> {
    Ok(B64.encode(fs::read(&path).map_err(err)?))
}

#[tauri::command]
async fn fs_write_file(path: String, content: String) -> Res<()> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::write(&path, content).map_err(err)
}

#[tauri::command]
async fn fs_write_base64(path: String, data: String) -> Res<()> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::write(&path, B64.decode(data).map_err(err)?).map_err(err)
}

#[tauri::command]
async fn fs_create(dir: String, name: String, is_dir: bool) -> Res<String> {
    let p = Path::new(&dir).join(safe_rel(&name)?);
    if p.exists() {
        return Err(format!("{} already exists", p.file_name().unwrap_or_default().to_string_lossy()));
    }
    if is_dir {
        fs::create_dir_all(&p).map_err(err)?;
    } else {
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).map_err(err)?;
        }
        fs::write(&p, "").map_err(err)?;
    }
    Ok(s(&p))
}

#[tauri::command]
async fn fs_remove(path: String) -> Res<bool> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(err)?;
    } else {
        fs::remove_file(p).map_err(err)?;
    }
    Ok(true)
}

#[tauri::command]
async fn fs_rename(path: String, new_name: String) -> Res<String> {
    let p = Path::new(&path);
    let dest = p.parent().ok_or("no parent folder")?.join(safe_name(&new_name)?);
    if dest.exists() {
        return Err("a file with that name already exists".into());
    }
    fs::rename(p, &dest).map_err(err)?;
    Ok(s(&dest))
}

/// When a file was last changed (milliseconds since 1970), so the database viewer can notice another program writing to it.
#[tauri::command]
async fn fs_mtime(path: String) -> Res<u64> {
    let t = fs::metadata(&path).and_then(|m| m.modified()).map_err(err)?;
    Ok(t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0))
}

#[tauri::command]
async fn fs_exists(path: String) -> Res<bool> {
    Ok(Path::new(&path).exists())
}

#[tauri::command]
async fn fs_reveal(path: String) -> Res<()> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer").arg(format!("/select,{}", path)).spawn().map_err(err)?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg("-R").arg(Path::new(&path)).spawn().map_err(err)?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let p = Path::new(&path);
        let dir = if p.is_dir() { p.to_path_buf() } else { p.parent().unwrap_or(p).to_path_buf() };
        Command::new("xdg-open").arg(dir).spawn().map_err(err)?;
    }
    Ok(())
}

fn walk(dir: &Path, root: &Path, out: &mut Vec<String>, limit: usize) {
    if out.len() >= limit {
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else { return };
    let mut items: Vec<_> = rd.flatten().collect();
    items.sort_by_key(|e| e.file_name());
    for e in items {
        let name = e.file_name().to_string_lossy().to_string();
        let path = e.path();
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            if SKIP_DIRS.contains(&name.as_str()) || name.starts_with('.') {
                continue;
            }
            walk(&path, root, out, limit);
        } else if let Ok(rel) = path.strip_prefix(root) {
            out.push(rel.to_string_lossy().replace('\\', "/"));
            if out.len() >= limit {
                return;
            }
        }
    }
}

/// Every file below `root` as relative, forward-slash paths (used by Quick Open and project sharing).
#[tauri::command]
async fn fs_list_files(root: String, limit: Option<usize>) -> Res<Vec<String>> {
    let r = PathBuf::from(&root);
    let mut out = Vec::new();
    walk(&r, &r, &mut out, limit.unwrap_or(8000));
    Ok(out)
}

#[derive(Serialize)]
struct Hit {
    path: String,
    line: usize,
    col: usize,
    text: String,
}

#[tauri::command]
async fn fs_search(root: String, query: String, case_sensitive: bool, use_regex: bool) -> Res<Vec<Hit>> {
    if query.is_empty() {
        return Ok(vec![]);
    }
    let rootp = PathBuf::from(&root);
    let mut files = Vec::new();
    walk(&rootp, &rootp, &mut files, 8000);
    let re = if use_regex {
        Some(regex::RegexBuilder::new(&query).case_insensitive(!case_sensitive).build().map_err(err)?)
    } else {
        None
    };
    let needle = if case_sensitive { query.clone() } else { query.to_lowercase() };
    let mut hits = Vec::new();
    'files: for rel in files {
        let full = rootp.join(&rel);
        let Ok(meta) = fs::metadata(&full) else { continue };
        if meta.len() > 1_500_000 {
            continue;
        }
        let Ok(bytes) = fs::read(&full) else { continue };
        let Ok(text) = String::from_utf8(bytes) else { continue };
        for (i, line) in text.lines().enumerate() {
            let col = match &re {
                Some(r) => r.find(line).map(|m| m.start()),
                None => {
                    if case_sensitive {
                        line.find(&needle)
                    } else {
                        line.to_lowercase().find(&needle)
                    }
                }
            };
            if let Some(c) = col {
                let shown: String = line.trim().chars().take(200).collect();
                hits.push(Hit { path: s(&full), line: i + 1, col: c + 1, text: shown });
                if hits.len() >= 600 {
                    break 'files;
                }
            }
        }
    }
    Ok(hits)
}

/* ---------------------------------------------------------------- extensions (plugins / themes) */

#[derive(Serialize)]
struct ExtFile {
    file: String,
    path: String,
    content: String,
    source: String,
}

#[tauri::command]
async fn ext_list(app: AppHandle, kind: String) -> Res<Vec<ExtFile>> {
    let builtins = if kind == "plugins" { builtin::PLUGINS } else { builtin::THEMES };
    let mut out: Vec<ExtFile> = builtins
        .iter()
        .map(|(name, content)| ExtFile { file: name.to_string(), path: String::new(), content: content.to_string(), source: "builtin".into() })
        .collect();
    let want = if kind == "plugins" { "js" } else { "json" };
    let dir = kind_dir(&app, &kind)?;
    let mut mine: Vec<_> = fs::read_dir(&dir).map_err(err)?.flatten().collect();
    mine.sort_by_key(|e| e.file_name());
    for e in mine {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) != Some(want) {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&p) {
            out.push(ExtFile { file: e.file_name().to_string_lossy().to_string(), path: s(&p), content, source: "user".into() });
        }
    }
    Ok(out)
}

#[tauri::command]
async fn ext_save(app: AppHandle, kind: String, file: String, content: String) -> Res<String> {
    let p = kind_dir(&app, &kind)?.join(safe_name(&file)?);
    fs::write(&p, content).map_err(err)?;
    Ok(s(&p))
}

#[tauri::command]
async fn ext_remove(app: AppHandle, kind: String, file: String) -> Res<()> {
    let p = kind_dir(&app, &kind)?.join(safe_name(&file)?);
    if p.exists() {
        fs::remove_file(p).map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
async fn ext_import(app: AppHandle, kind: String) -> Res<Vec<String>> {
    let dir = kind_dir(&app, &kind)?;
    let ext = if kind == "plugins" { "js" } else { "json" };
    let picked = app.dialog().file().add_filter(&kind, &[ext]).blocking_pick_files().unwrap_or_default();
    let mut names = Vec::new();
    for f in picked {
        let Ok(src) = f.into_path() else { continue };
        let Some(name) = src.file_name().map(|n| n.to_string_lossy().to_string()) else { continue };
        fs::copy(&src, dir.join(safe_name(&name)?)).map_err(err)?;
        names.push(name);
    }
    Ok(names)
}

#[tauri::command]
async fn ext_open_dir(app: AppHandle, kind: String) -> Res<()> {
    let d = kind_dir(&app, &kind)?;
    fs_reveal(s(&d)).await
}

/* ---------------------------------------------------------------- settings, info, cleaning */

fn json_file(app: &AppHandle, name: &str) -> Res<PathBuf> {
    Ok(user_dir(app)?.join(name))
}

#[tauri::command]
async fn settings_load(app: AppHandle) -> Res<serde_json::Value> {
    let p = json_file(&app, "settings.json")?;
    Ok(fs::read_to_string(p).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_else(|| serde_json::json!({})))
}

#[tauri::command]
async fn settings_save(app: AppHandle, data: serde_json::Value) -> Res<()> {
    fs::write(json_file(&app, "settings.json")?, serde_json::to_string_pretty(&data).map_err(err)?).map_err(err)
}

/// Small private store for the cloud sign-in token (kept out of settings.json so exporting settings never leaks it).
#[tauri::command]
async fn secret_get(app: AppHandle, key: String) -> Res<Option<String>> {
    let p = json_file(&app, "secrets.json")?;
    let v: serde_json::Value = fs::read_to_string(p).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_else(|| serde_json::json!({}));
    Ok(v.get(&key).and_then(|x| x.as_str()).map(|x| x.to_string()))
}

#[tauri::command]
async fn secret_set(app: AppHandle, key: String, value: Option<String>) -> Res<()> {
    let p = json_file(&app, "secrets.json")?;
    let mut v: serde_json::Value = fs::read_to_string(&p).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_else(|| serde_json::json!({}));
    if let Some(o) = v.as_object_mut() {
        match value {
            Some(val) => {
                o.insert(key, serde_json::Value::String(val));
            }
            None => {
                o.remove(&key);
            }
        }
    }
    fs::write(&p, serde_json::to_string(&v).map_err(err)?).map_err(err)
}

#[tauri::command]
async fn app_info(app: AppHandle) -> Res<serde_json::Value> {
    Ok(serde_json::json!({
        "name": "Vextra Studio",
        "version": app.package_info().version.to_string(),
        "platform": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "userDir": s(&user_dir(&app)?),
    }))
}

/// Deletes Vextra's own data. `what` is any of: plugins, themes, settings, secrets, all.
#[tauri::command]
async fn app_clean(app: AppHandle, what: Vec<String>) -> Res<Vec<String>> {
    let base = user_dir(&app)?;
    let all = what.iter().any(|w| w == "all");
    let mut removed = Vec::new();
    let mut rm = |p: PathBuf| {
        if p.is_dir() {
            if fs::remove_dir_all(&p).is_ok() {
                removed.push(s(&p));
            }
        } else if p.exists() && fs::remove_file(&p).is_ok() {
            removed.push(s(&p));
        }
    };
    for (key, rel) in [("plugins", "plugins"), ("themes", "themes"), ("settings", "settings.json"), ("secrets", "secrets.json")] {
        if all || what.iter().any(|w| w == key) {
            rm(base.join(rel));
        }
    }
    Ok(removed)
}

/* ---------------------------------------------------------------- auto-updater */

/// The updater's PUBLIC key (src-tauri/updater/pubkey.txt, made by `npm run updater:keygen`). Updates are only installed when their
/// signature matches this key, so only the holder of the private key (a GitHub secret) can ship an update. "NOT-SET…" = updater off.
const UPDATER_PUBKEY: &str = include_str!("../updater/pubkey.txt");
/// `latest.json` is attached to every GitHub release by the release workflow (tauri-action).
const UPDATER_ENDPOINT: &str = "https://github.com/XHiddenProjects/VExtraStudio/releases/latest/download/latest.json";

#[derive(Default)]
struct UpdaterState(Mutex<Option<tauri_plugin_updater::Update>>);

fn updater_key() -> Option<String> {
    let k = UPDATER_PUBKEY.trim();
    if k.len() < 40 || k.to_uppercase().starts_with("NOT-SET") {
        None
    } else {
        Some(k.to_string())
    }
}

#[derive(Serialize)]
struct UpdateInfo {
    /// false = this build has no updater key (the app then only tells you that a newer version exists)
    enabled: bool,
    available: bool,
    current: String,
    version: Option<String>,
    notes: Option<String>,
    date: Option<String>,
    reason: Option<String>,
}

/// Asks GitHub whether a newer signed version exists. Nothing is downloaded or installed.
#[tauri::command]
async fn updater_check(app: AppHandle, state: tauri::State<'_, UpdaterState>) -> Res<UpdateInfo> {
    let current = app.package_info().version.to_string();
    let Some(key) = updater_key() else {
        return Ok(UpdateInfo { enabled: false, available: false, current, version: None, notes: None, date: None, reason: Some("This build was made without an updater key.".into()) });
    };
    let url = UPDATER_ENDPOINT.parse().map_err(err)?;
    /* the key exists from here on: a failure below is a failed CHECK (no latest.json on the latest release, offline, bad signature…), never "no key" */
    let failed = |current: String, why: String| UpdateInfo { enabled: true, available: false, current, version: None, notes: None, date: None, reason: Some(why) };
    let updater = match app.updater_builder().pubkey(key).endpoints(vec![url]).map_err(err).and_then(|b| b.build().map_err(err)) {
        Ok(u) => u,
        Err(e) => return Ok(failed(current, format!("The updater could not start: {e}"))),
    };
    let found = match updater.check().await {
        Ok(f) => f,
        Err(e) => return Ok(failed(current, format!("The update check failed: {e}. The newest GitHub release needs a latest.json file (the release workflow makes it when the signing secrets are set)."))),
    };
    let info = match &found {
        Some(u) => UpdateInfo { enabled: true, available: true, current, version: Some(u.version.clone()), notes: u.body.clone(), date: u.date.map(|d| d.to_string()), reason: None },
        None => UpdateInfo { enabled: true, available: false, current, version: None, notes: None, date: None, reason: None },
    };
    *state.0.lock().map_err(err)? = found;
    Ok(info)
}

/// Copies the app's data folder (settings, plugins, themes, local server data) to `update-backups/<version>-<time>` before an update is installed.
/// Updates never touch this folder (it lives outside the install folder); the copy is only a safety net. Keeps the newest 3, skips itself, gives up above 500 MB.
fn snapshot_user_data(app: &AppHandle) -> Res<()> {
    fn copy(src: &Path, dst: &Path, skip: &Path, left: &mut i64) -> std::io::Result<()> {
        fs::create_dir_all(dst)?;
        for e in fs::read_dir(src)?.flatten() {
            let p = e.path();
            if p == skip { continue; }
            let t = e.file_type()?;
            if t.is_symlink() { continue; }
            let to = dst.join(e.file_name());
            if t.is_dir() { copy(&p, &to, skip, left)?; } else {
                *left -= e.metadata().map(|m| m.len() as i64).unwrap_or(0);
                if *left < 0 { return Err(std::io::Error::new(std::io::ErrorKind::Other, "data folder is larger than 500 MB")); }
                fs::copy(&p, &to)?;
            }
        }
        Ok(())
    }
    let base = user_dir(app)?;
    let root = base.join("update-backups");
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let dst = root.join(format!("{}-{}", app.package_info().version, stamp));
    let mut left: i64 = 500 * 1024 * 1024;
    if let Err(e) = copy(&base, &dst, &root, &mut left) { let _ = fs::remove_dir_all(&dst); return Err(err(e)); }
    let mut old: Vec<_> = fs::read_dir(&root).map_err(err)?.flatten().filter(|e| e.path().is_dir()).collect();
    old.sort_by_key(|e| e.file_name());
    while old.len() > 3 { let e = old.remove(0); let _ = fs::remove_dir_all(e.path()); }
    Ok(())
}

/// Downloads the update found by `updater_check`, checks its signature and installs it. Progress: event `updater:progress` { done, total }.
/// Windows: the installer starts and the app exits by itself. macOS / Linux: call `app_restart` afterwards.
#[tauri::command]
async fn updater_install(app: AppHandle, state: tauri::State<'_, UpdaterState>) -> Res<()> {
    let update = state.0.lock().map_err(err)?.clone().ok_or_else(|| "Check for updates first.".to_string())?;
    // safety net: copy the user's data first; a failure here never blocks the update (the data is outside the install folder anyway)
    if let Err(e) = snapshot_user_data(&app) { eprintln!("update snapshot skipped: {e}"); }
    /* the bundled server must not be running while its file is replaced */
    if let Some(mut c) = app.state::<ServerState>().inner().0.lock().map_err(err)?.take() {
        let _ = c.kill();
        let _ = c.wait();
    }
    kill_stale_servers();
    let handle = app.clone();
    let mut done: u64 = 0;
    update
        .download_and_install(
            move |chunk, total| {
                done += chunk as u64;
                let _ = handle.emit("updater:progress", serde_json::json!({ "done": done, "total": total }));
            },
            || {},
        )
        .await
        .map_err(err)?;
    *state.0.lock().map_err(err)? = None;
    Ok(())
}

#[tauri::command]
fn app_restart(app: AppHandle) {
    app.restart();
}

/* ---------------------------------------------------------------- http (cloud features) */

#[derive(Deserialize)]
struct HttpReq {
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    timeout_secs: Option<u64>,
}
#[derive(Serialize)]
struct HttpRes {
    status: u16,
    body: String,
}

/// Open the project's GitHub page in the default browser. Only the Vextra Studio repository is allowed.
#[tauri::command]
fn open_url(url: String) -> Res<()> {
    const BASE: &str = "https://github.com/XHiddenProjects/VExtraStudio";
    let ok_chars = url.chars().all(|c| c.is_ascii_alphanumeric() || "/:.-_~?=#%".contains(c));
    if !ok_chars || !(url == BASE || url.starts_with(&format!("{}/", BASE))) {
        return Err("blocked: only the Vextra Studio repository can be opened".into());
    }
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", &url]).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(&url).spawn();
    r.map(|_| ()).map_err(|e| e.to_string())
}

/// All cloud/publish traffic goes through here so the webview never hits CORS or mixed-content limits.
#[tauri::command]
async fn http_request(req: HttpReq) -> Res<HttpRes> {
    if !(req.url.starts_with("http://") || req.url.starts_with("https://")) {
        return Err("only http(s) URLs are allowed".into());
    }
    // this computer is always reached over IPv4 ("localhost" can resolve to ::1 first on Windows, which local servers do not listen on)
    let req = HttpReq { url: req.url.replacen("://localhost", "://127.0.0.1", 1).replacen("://[::1]", "://127.0.0.1", 1), ..req };
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(6)).build();
        let mut r = agent.request(&req.method.to_uppercase(), &req.url).timeout(Duration::from_secs(req.timeout_secs.unwrap_or(25).clamp(5, 3600)));
        for (k, v) in req.headers.unwrap_or_default() {
            r = r.set(&k, &v);
        }
        let result = match req.body {
            Some(b) => r.send_string(&b),
            None => r.call(),
        };
        match result {
            Ok(resp) => {
                let status = resp.status();
                Ok(HttpRes { status, body: resp.into_string().map_err(err)? })
            }
            Err(ureq::Error::Status(code, resp)) => Ok(HttpRes { status: code, body: resp.into_string().unwrap_or_default() }),
            Err(e) => Err(format!("network error: {e}")),
        }
    })
    .await
    .map_err(err)?
}

/// Download a binary file (zip, image…) and return it base64-encoded. https only, 50 MB cap. Used by the Library to install templates and games.
#[tauri::command]
async fn http_download(url: String) -> Res<String> {
    if !url.starts_with("https://") {
        return Err("only https:// links can be downloaded".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        const MAX: u64 = 50 * 1024 * 1024;
        let resp = ureq::get(&url).timeout(Duration::from_secs(90)).call().map_err(|e| format!("download failed: {e}"))?;
        let mut buf = Vec::new();
        resp.into_reader().take(MAX + 1).read_to_end(&mut buf).map_err(err)?;
        if buf.len() as u64 > MAX {
            return Err("file is larger than 50 MB".to_string());
        }
        Ok(B64.encode(&buf))
    })
    .await
    .map_err(err)?
}

/* ---------------------------------------------------------------- run npm / npx / node with live output (Store Export) */
struct Run {
    lines: Arc<Mutex<Vec<String>>>,
    done: Arc<AtomicBool>,
    code: Arc<Mutex<Option<i32>>>,
    child: Arc<Mutex<Child>>,
    stdin: Arc<Mutex<Option<std::process::ChildStdin>>>,
}
#[derive(Default)]
struct RunState(Mutex<HashMap<u32, Run>>, AtomicU32);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunPoll {
    lines: Vec<String>,
    done: bool,
    code: Option<i32>,
}

/// Start `npm` / `npx` / `node` inside a `store-export` folder. No shell is involved, arguments are restricted to a safe character set.
#[tauri::command]
async fn run_start(state: tauri::State<'_, RunState>, cwd: String, program: String, args: Vec<String>) -> Res<u32> {
    if !matches!(program.as_str(), "npm" | "npx" | "node") {
        return Err("only npm, npx and node can be run".into());
    }
    let dir = PathBuf::from(&cwd);
    if !dir.is_dir() {
        return Err("the folder does not exist".into());
    }
    if !cwd.replace('\\', "/").split('/').any(|s| s == "store-export") {
        return Err("commands can only run inside a store-export folder".into());
    }
    for a in &args {
        if a.is_empty() || a.len() > 200 || !a.chars().all(|c| c.is_ascii_alphanumeric() || "@./:=,+-_".contains(c)) {
            return Err(format!("argument not allowed: {a}"));
        }
    }
    let exe = if cfg!(windows) && program != "node" { format!("{program}.cmd") } else { program.clone() };
    let mut cmd = Command::new(exe);
    cmd.args(&args).current_dir(&dir).stdout(Stdio::piped()).stderr(Stdio::piped()).env("CI", "1").env("CSC_IDENTITY_AUTO_DISCOVERY", "false").env("ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES", "true").env("FORCE_COLOR", "0").env("NO_COLOR", "1");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    launch(state.inner(), cmd, &program, false)
}

/// Starts `cmd` with piped output (and optionally piped input) and collects its output lines for run_poll.
fn launch(state: &RunState, mut cmd: Command, name: &str, piped_stdin: bool) -> Res<u32> {
    cmd.stdin(if piped_stdin { Stdio::piped() } else { Stdio::null() });
    let mut child = cmd.spawn().map_err(|e| format!("could not start {name}: {e}"))?;
    let stdin = Arc::new(Mutex::new(if piped_stdin { child.stdin.take() } else { None }));
    let lines = Arc::new(Mutex::new(Vec::<String>::new()));
    let pump = |stream: Option<Box<dyn std::io::Read + Send>>, lines: Arc<Mutex<Vec<String>>>| {
        if let Some(mut s) = stream {
            std::thread::spawn(move || {
                use std::io::Read;
                let mut buf = Vec::new();
                let mut chunk = [0u8; 4096];
                loop {
                    match s.read(&mut chunk) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                            buf.extend_from_slice(&chunk[..n]);
                            while let Some(p) = buf.iter().position(|b| *b == b'\n') {
                                let line: Vec<u8> = buf.drain(..=p).collect();
                                if let Ok(mut l) = lines.lock() {
                                    if l.len() < 5000 {
                                        l.push(String::from_utf8_lossy(&line).trim_end().to_string());
                                    }
                                }
                            }
                        }
                    }
                }
                if !buf.is_empty() {
                    if let Ok(mut l) = lines.lock() {
                        l.push(String::from_utf8_lossy(&buf).trim_end().to_string());
                    }
                }
            });
        }
    };
    pump(child.stdout.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>), lines.clone());
    pump(child.stderr.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>), lines.clone());
    let child = Arc::new(Mutex::new(child));
    let done = Arc::new(AtomicBool::new(false));
    let code = Arc::new(Mutex::new(None));
    {
        let (child, done, code) = (child.clone(), done.clone(), code.clone());
        std::thread::spawn(move || loop {
            let st = child.lock().ok().and_then(|mut c| c.try_wait().ok().flatten());
            if let Some(s) = st {
                if let Ok(mut c) = code.lock() {
                    *c = Some(s.code().unwrap_or(-1));
                }
                std::thread::sleep(Duration::from_millis(150));
                done.store(true, Ordering::SeqCst);
                break;
            }
            std::thread::sleep(Duration::from_millis(120));
        });
    }
    let id = state.1.fetch_add(1, Ordering::SeqCst) + 1;
    state.0.lock().map_err(err)?.insert(id, Run { lines, done, code, child, stdin });
    Ok(id)
}

#[tauri::command]
async fn run_poll(state: tauri::State<'_, RunState>, id: u32) -> Res<RunPoll> {
    let mut map = state.inner().0.lock().map_err(err)?;
    let (out, done, code) = match map.get(&id) {
        Some(r) => {
            let mut l = r.lines.lock().map_err(err)?;
            let n = l.len().min(400);
            let out: Vec<String> = l.drain(..n).collect();
            let empty = l.is_empty();
            let done = r.done.load(Ordering::SeqCst) && empty;
            let code = r.code.lock().map_err(err)?.clone();
            (out, done, code)
        }
        None => return Ok(RunPoll { lines: vec![], done: true, code: None }),
    };
    if done {
        map.remove(&id);
    }
    Ok(RunPoll { lines: out, done, code })
}

#[tauri::command]
async fn run_cancel(state: tauri::State<'_, RunState>, id: u32) -> Res<()> {
    let map = state.inner().0.lock().map_err(err)?;
    if let Some(r) = map.get(&id) {
        if let Ok(mut c) = r.child.lock() {
            kill_tree(c.id());
            let _ = c.kill();
        }
    }
    Ok(())
}


/// Ends a process and everything it started (npm starts node, which starts more).
fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]).creation_flags(0x0800_0000).output();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("pkill").args(["-TERM", "-P", &pid.to_string()]).output();
    }
}

/// True when `name` is an executable found in a folder on PATH (the .exe/.cmd/.bat forms are tried on Windows).
fn on_path(name: &str) -> bool {
    let exts: Vec<String> = if cfg!(windows) {
        std::env::var("PATHEXT").unwrap_or(".EXE;.CMD;.BAT".into()).split(';').map(|e| e.to_lowercase()).collect()
    } else {
        vec![String::new()]
    };
    let Some(paths) = std::env::var_os("PATH") else { return false };
    for dir in std::env::split_paths(&paths) {
        for e in &exts {
            if dir.join(format!("{name}{e}")).is_file() {
                return true;
            }
        }
        if cfg!(windows) && dir.join(name).is_file() {
            return true;
        }
    }
    false
}

#[derive(serde::Serialize)]
struct ShellInfo {
    id: String,
    label: String,
    available: bool,
}

/// The shells the Terminal panel can offer on this computer (only the ones that were found are marked available).
#[tauri::command]
fn term_shells() -> Vec<ShellInfo> {
    let mut v: Vec<(&str, &str, bool)> = Vec::new();
    v.push(("default", if cfg!(windows) { "Default (Command Prompt)" } else { "Default (sh)" }, true));
    if cfg!(windows) {
        v.push(("cmd", "Command Prompt (cmd)", true));
        v.push(("powershell", "Windows PowerShell", on_path("powershell")));
        v.push(("pwsh", "PowerShell 7 (pwsh)", on_path("pwsh")));
        v.push(("bash", "Bash (Git Bash / WSL)", on_path("bash")));
        v.push(("wsl", "WSL", on_path("wsl")));
    } else {
        v.push(("sh", "sh", on_path("sh")));
        v.push(("bash", "Bash", on_path("bash")));
        v.push(("zsh", "Zsh", on_path("zsh")));
        v.push(("fish", "Fish", on_path("fish")));
        v.push(("pwsh", "PowerShell (pwsh)", on_path("pwsh")));
    }
    v.into_iter().map(|(id, label, available)| ShellInfo { id: id.into(), label: label.into(), available }).collect()
}

/// Builds the command line for the chosen shell. `custom` = (program, argument list with {cmd} where the command goes).
fn shell_command(shell: &str, custom: Option<(String, Vec<String>)>, command: &str) -> Res<Command> {
    #[allow(unused_mut)]
    let mut c: Command;
    match shell {
        "" | "default" | "cmd" | "sh" => {
            #[cfg(windows)]
            {
                if shell == "sh" {
                    c = Command::new("sh");
                    c.arg("-c").arg(command);
                } else {
                    use std::os::windows::process::CommandExt;
                    c = Command::new("cmd");
                    c.args(["/D", "/S", "/C"]).raw_arg(format!("\"{}\"", command));
                }
            }
            #[cfg(not(windows))]
            {
                if shell == "cmd" {
                    return Err("Command Prompt only exists on Windows".into());
                }
                c = Command::new("sh");
                c.arg("-c").arg(command);
            }
        }
        "powershell" | "pwsh" => {
            c = Command::new(if shell == "powershell" { "powershell" } else { "pwsh" });
            c.args(["-NoLogo", "-NoProfile", "-Command"]).arg(command);
        }
        "bash" | "zsh" | "fish" => {
            c = Command::new(shell);
            c.arg("-c").arg(command);
        }
        "wsl" => {
            c = Command::new("wsl");
            c.args(["--", "sh", "-c"]).arg(command);
        }
        "custom" => {
            let (prog, args) = custom.ok_or("choose the program for your custom terminal first")?;
            let prog = prog.trim().to_string();
            if prog.is_empty() || prog.len() > 500 || prog.contains('\0') || prog.contains('\n') {
                return Err("the custom terminal program is not valid".into());
            }
            if args.len() > 12 || args.iter().any(|a| a.len() > 500 || a.contains('\0')) {
                return Err("the custom terminal arguments are not valid".into());
            }
            c = Command::new(&prog);
            let mut used = false;
            for a in &args {
                if a.contains("{cmd}") {
                    used = true;
                    c.arg(a.replace("{cmd}", command));
                } else {
                    c.arg(a);
                }
            }
            if !used {
                c.arg(command);
            }
        }
        other => return Err(format!("unknown terminal: {other}")),
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
    }
    Ok(c)
}

/// Terminal: runs one command line in a folder with the shell the person picked (default: the computer's own shell) and streams the output (poll with run_poll, stop with run_cancel).
/// It is a normal user shell – like any terminal – so it is only started by the Terminal panel after the person confirmed it, never by plugins or previews.
#[tauri::command]
async fn term_start(state: tauri::State<'_, RunState>, cwd: String, command: String, shell: Option<String>, custom_program: Option<String>, custom_args: Option<Vec<String>>) -> Res<u32> {
    let dir = PathBuf::from(&cwd);
    if !dir.is_dir() {
        return Err("that folder does not exist".into());
    }
    if command.trim().is_empty() || command.len() > 8000 || command.contains('\0') {
        return Err("that command is empty or too long".into());
    }
    let custom = custom_program.map(|p| (p, custom_args.unwrap_or_default()));
    let mut cmd = shell_command(shell.as_deref().unwrap_or("default"), custom, &command)?;
    cmd.current_dir(&dir).env("NO_COLOR", "1").env("FORCE_COLOR", "0").env("TERM", "dumb").stderr(Stdio::piped()).stdout(Stdio::piped());
    launch(state.inner(), cmd, "the shell", true)
}

/// Sends a line of text to the running terminal command (for prompts such as `npm init`).
#[tauri::command]
async fn term_write(state: tauri::State<'_, RunState>, id: u32, text: String) -> Res<()> {
    if text.len() > 8192 {
        return Err("that is too much text".into());
    }
    let map = state.inner().0.lock().map_err(err)?;
    if let Some(r) = map.get(&id) {
        if let Ok(mut g) = r.stdin.lock() {
            if let Some(i) = g.as_mut() {
                use std::io::Write;
                i.write_all(text.as_bytes()).map_err(err)?;
                let _ = i.flush();
            }
        }
    }
    Ok(())
}

/* ---------------------------------------------------------------- menu & entry point */

fn build_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let item = |id: &str, label: &str| MenuItemBuilder::with_id(id, label).build(app);
    let file = SubmenuBuilder::new(app, "File")
        .item(&item("newFile", "New File")?)
        .item(&item("newProject", "New Project…")?)
        .item(&item("newUI", "New UI Design")?)
        .item(&item("newGame", "New Game")?)
        .separator()
        .item(&item("openFile", "Open File…")?)
        .item(&item("openFolder", "Open Folder…")?)
        .separator()
        .item(&item("save", "Save  (Ctrl+S)")?)
        .item(&item("saveAs", "Save As…")?)
        .item(&item("closeTab", "Close Tab")?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .separator()
        .item(&item("findInFiles", "Find in Files…")?)
        .build()?;
    let view = SubmenuBuilder::new(app, "View")
        .item(&item("palette", "Command Palette…  (Ctrl+Shift+P)")?)
        .item(&item("quickOpen", "Quick Open…  (Ctrl+P)")?)
        .item(&item("toggleSidebar", "Toggle Sidebar  (Ctrl+B)")?)
        .item(&item("togglePanel", "Toggle Bottom Panel  (Ctrl+J)")?)
        .item(&item("preview", "Live Preview")?)
        .build()?;
    let cloud = SubmenuBuilder::new(app, "Cloud")
        .item(&item("account", "Account…")?)
        .item(&item("publish", "Publish…")?)
        .item(&item("share", "Share / Collaborate…")?)
        .build()?;
    let help = SubmenuBuilder::new(app, "Help")
        .item(&item("docs", "Documentation")?)
        .item(&item("welcome", "Welcome")?)
        .item(&item("openExtensions", "Open Extensions Folder")?)
        .build()?;
    MenuBuilder::new(app).item(&file).item(&edit).item(&view).item(&cloud).item(&help).build()
}

/* ---------- PHP preview: runs PHP's built-in web server (`php -S`) for a project folder. Needs PHP installed on this computer. ---------- */
struct PhpRun {
    child: Child,
    log: Arc<Mutex<Vec<String>>>,
}
#[derive(Default)]
struct PhpState(Mutex<HashMap<String, PhpRun>>);

#[derive(Serialize)]
struct PhpInfo {
    url: String,
    port: u16,
    version: String,
}

fn php_bin() -> String {
    std::env::var("VEXTRA_PHP").unwrap_or_else(|_| "php".into())
}

/// A command that never opens a console window on Windows.
fn quiet(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut c = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
    }
    c
}

fn php_version() -> Res<String> {
    let out = quiet(&php_bin())
        .arg("-v")
        .stdin(Stdio::null())
        .output()
        .map_err(|_| "PHP was not found on this computer. Install PHP (php.net/downloads) and make sure `php` is on your PATH, or set the VEXTRA_PHP environment variable to its full path.".to_string())?;
    Ok(String::from_utf8_lossy(&out.stdout).lines().next().unwrap_or("PHP").to_string())
}

#[tauri::command]
async fn php_check() -> Res<String> {
    php_version()
}

/// Starts `php -S` for a folder. `defines` are php.ini settings ("name=value") from the project's PHP configuration; they are passed with -d on top of the normal php.ini.
#[tauri::command]
async fn php_start(state: tauri::State<'_, PhpState>, root: String, defines: Option<Vec<String>>) -> Res<PhpInfo> {
    let version = php_version()?;
    let mut args: Vec<String> = Vec::new();
    for d in defines.unwrap_or_default().iter().take(200) {
        let (k, v) = d.split_once('=').ok_or("a PHP setting must look like name=value")?;
        if k.is_empty() || k.len() > 80 || !k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.') || v.len() > 2000 || v.chars().any(|c| c.is_control()) {
            return Err(format!("PHP setting not allowed: {k}"));
        }
        args.push("-d".into());
        args.push(format!("{k}={v}"));
    }
    let mut map = state.inner().0.lock().map_err(err)?;
    if let Some(mut old) = map.remove(&root) {
        let _ = old.child.kill();
        let _ = old.child.wait();
    }
    let port = TcpListener::bind("127.0.0.1:0").map_err(err)?.local_addr().map_err(err)?.port();
    let mut child = quiet(&php_bin())
        .args(&args)
        .args(["-S", &format!("127.0.0.1:{}", port), "-t", &root])
        .current_dir(&root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(err)?;
    let log = Arc::new(Mutex::new(Vec::<String>::new()));
    if let Some(e) = child.stderr.take() {
        let log = log.clone();
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            for line in BufReader::new(e).lines().map_while(Result::ok) {
                if let Ok(mut l) = log.lock() {
                    if l.len() < 2000 {
                        l.push(line);
                    }
                }
            }
        });
    }
    map.insert(root.clone(), PhpRun { child, log: log.clone() });
    drop(map);
    std::thread::sleep(Duration::from_millis(450));
    let mut map = state.inner().0.lock().map_err(err)?;
    if let Some(r) = map.get_mut(&root) {
        if let Ok(Some(_)) = r.child.try_wait() {
            let msg = log.lock().map(|l| l.join("\n")).unwrap_or_default();
            map.remove(&root);
            return Err(format!("PHP stopped right after starting. {}", msg.trim()));
        }
    }
    Ok(PhpInfo { url: format!("http://127.0.0.1:{}/", port), port, version })
}

/// Is the PHP server for this folder still running? (The preview tab closes itself when it is not.)
#[tauri::command]
async fn php_status(state: tauri::State<'_, PhpState>, root: String) -> Res<bool> {
    let mut map = state.inner().0.lock().map_err(err)?;
    let alive = match map.get_mut(&root) {
        Some(r) => matches!(r.child.try_wait(), Ok(None)),
        None => false,
    };
    if !alive {
        map.remove(&root);
    }
    Ok(alive)
}

/// New lines the PHP server printed (requests, warnings, errors) since the last call.
#[tauri::command]
async fn php_log(state: tauri::State<'_, PhpState>, root: String) -> Res<Vec<String>> {
    let map = state.inner().0.lock().map_err(err)?;
    Ok(match map.get(&root) {
        Some(r) => r.log.lock().map(|mut l| l.drain(..).collect()).unwrap_or_default(),
        None => vec![],
    })
}

#[tauri::command]
async fn php_stop(state: tauri::State<'_, PhpState>, root: Option<String>) -> Res<()> {
    let mut map = state.inner().0.lock().map_err(err)?;
    match root {
        Some(r) => {
            if let Some(mut c) = map.remove(&r) {
                let _ = c.child.kill();
                let _ = c.child.wait();
            }
        }
        None => {
            for (_, mut c) in map.drain() {
                let _ = c.child.kill();
                let _ = c.child.wait();
            }
        }
    }
    Ok(())
}

/* ---------- Other databases: Vextra talks to MySQL / MariaDB / PostgreSQL through the command-line client the person already has installed
   (mysql / mariadb / psql). No driver is built in; the password goes through an environment variable, never the command line. ---------- */
#[derive(Serialize)]
struct DbClient {
    kind: String,
    path: String,
    version: String,
}

fn db_client_ok(path: &str) -> bool {
    let stem = Path::new(path).file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    matches!(stem.as_str(), "mysql" | "mariadb" | "psql")
}

/// Looks for installed database clients on the PATH and in the usual install folders (XAMPP, WAMP, MariaDB, MySQL, PostgreSQL, Homebrew).
#[tauri::command]
async fn db_detect() -> Res<Vec<DbClient>> {
    let mut cands: Vec<(String, String)> = Vec::new();
    for (k, n) in [("mysql", "mysql"), ("mysql", "mariadb"), ("postgres", "psql")] {
        cands.push((k.into(), n.into()));
    }
    let mut dirs: Vec<PathBuf> = Vec::new();
    for d in ["C:/xampp/mysql/bin", "C:/wamp64/bin/mariadb", "C:/laragon/bin/mysql", "/opt/homebrew/bin", "/usr/local/bin", "/opt/lampp/bin", "/Applications/XAMPP/xamppfiles/bin"] {
        dirs.push(PathBuf::from(d));
    }
    for base in ["C:/Program Files/MariaDB", "C:/Program Files/MySQL", "C:/Program Files/PostgreSQL", "/usr/local/mysql"] {
        if let Ok(rd) = fs::read_dir(base) {
            for e in rd.flatten() {
                dirs.push(e.path().join("bin"));
            }
        }
    }
    for d in dirs {
        for n in ["mysql", "mariadb", "psql"] {
            for ext in ["", ".exe"] {
                let p = d.join(format!("{n}{ext}"));
                if p.is_file() {
                    cands.push((if n == "psql" { "postgres".into() } else { "mysql".into() }, p.to_string_lossy().to_string()));
                }
            }
        }
    }
    let mut out: Vec<DbClient> = Vec::new();
    for (kind, path) in cands {
        if out.iter().any(|c| c.path == path) {
            continue;
        }
        if let Ok(o) = quiet(&path).arg("--version").stdin(Stdio::null()).output() {
            if o.status.success() {
                let v = String::from_utf8_lossy(&o.stdout).lines().next().unwrap_or("").trim().to_string();
                out.push(DbClient { kind, path, version: v });
            }
        }
    }
    Ok(out)
}

#[derive(Deserialize)]
struct DbConn {
    kind: String,
    client: Option<String>,
    host: Option<String>,
    port: Option<u16>,
    user: Option<String>,
    database: Option<String>,
    password: Option<String>,
}

fn db_word(v: &Option<String>, def: &str, what: &str) -> Res<String> {
    let t = v.clone().unwrap_or_default();
    let t = if t.trim().is_empty() { def.to_string() } else { t.trim().to_string() };
    if t.len() > 128 || !t.chars().all(|c| c.is_ascii_alphanumeric() || "_.:@-".contains(c)) {
        return Err(format!("{what} may only contain letters, digits and _ . : @ -"));
    }
    Ok(t)
}

/// Runs SQL (sent on stdin) with the installed client and returns what it printed. MySQL/MariaDB: tab-separated with a header line (\n \t \\ escaped, NULL as NULL); PostgreSQL: CSV (NULL as \N).
#[tauri::command]
async fn db_cli(conn: DbConn, sql: String) -> Res<String> {
    if sql.len() > 8_000_000 {
        return Err("that SQL is too large".into());
    }
    let host = db_word(&conn.host, "127.0.0.1", "The host")?;
    let user = db_word(&conn.user, if conn.kind == "postgres" { "postgres" } else { "root" }, "The user name")?;
    let dbname = db_word(&conn.database, "", "The database name")?;
    let port = conn.port.unwrap_or(if conn.kind == "postgres" { 5432 } else { 3306 });
    let pw = conn.password.clone().unwrap_or_default();
    let bin = match conn.client.as_deref().map(str::trim).filter(|c| !c.is_empty()) {
        Some(c) => {
            if !db_client_ok(c) {
                return Err("The client must be mysql, mariadb or psql.".into());
            }
            c.to_string()
        }
        None => if conn.kind == "postgres" { "psql".into() } else { "mysql".into() },
    };
    let mut cmd = quiet(&bin);
    match conn.kind.as_str() {
        "mysql" => {
            cmd.args(["--batch", "--default-character-set=utf8mb4", "--connect-timeout=8", "-h", &host, "-P", &port.to_string(), "-u", &user]);
            if !dbname.is_empty() {
                cmd.arg(&dbname);
            }
            cmd.env("MYSQL_PWD", &pw);
        }
        "postgres" => {
            cmd.args(["-X", "-q", "--csv", "-P", "null=\\N", "-v", "ON_ERROR_STOP=1", "-h", &host, "-p", &port.to_string(), "-U", &user]);
            if !dbname.is_empty() {
                cmd.args(["-d", &dbname]);
            }
            cmd.env("PGPASSWORD", &pw).env("PGCONNECT_TIMEOUT", "8");
        }
        _ => return Err("unknown database type".into()),
    }
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("could not start {bin}: {e}. Install the {} command-line client or choose its location.", if conn.kind == "postgres" { "PostgreSQL (psql)" } else { "MySQL / MariaDB (mysql)" }))?;
    let pid = child.id();
    if let Some(mut i) = child.stdin.take() {
        use std::io::Write;
        let data = sql.into_bytes();
        std::thread::spawn(move || {
            let _ = i.write_all(&data);
        });
    }
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(child.wait_with_output());
    });
    match rx.recv_timeout(Duration::from_secs(90)) {
        Ok(Ok(o)) => {
            if o.stdout.len() > 40_000_000 {
                return Err("that result is too large – add a LIMIT".into());
            }
            if o.status.success() {
                Ok(String::from_utf8_lossy(&o.stdout).to_string())
            } else {
                let e = String::from_utf8_lossy(&o.stderr).trim().to_string();
                Err(if e.is_empty() { "the database client reported an error".into() } else { e })
            }
        }
        Ok(Err(e)) => Err(err(e)),
        Err(_) => {
            kill_tree(pid);
            Err("the database did not answer within 90 seconds".into())
        }
    }
}

/* ---------- Local preview server: serves a project folder over http://127.0.0.1:<port>/ so previews run with a real origin
   (localStorage, fetch of relative files, ES modules, service workers all work). Read-only, loopback only, no directory traversal. ---------- */
struct StaticServer {
    port: u16,
    stop: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

#[derive(Default)]
struct ServeState(Mutex<HashMap<String, StaticServer>>);

fn mime_for(p: &Path) -> &'static str {
    match p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" | "webmanifest" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "wasm" => "application/wasm",
        "txt" | "md" | "sql" | "log" => "text/plain; charset=utf-8",
        "xml" => "application/xml",
        _ => "application/octet-stream",
    }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = ((b[i + 1] as char).to_digit(16), (b[i + 2] as char).to_digit(16)) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn handle_conn(mut stream: std::net::TcpStream, root: &Path) {
    use std::io::{Read, Write};
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buf = [0u8; 8192];
    let n = match stream.read(&mut buf) {
        Ok(n) if n > 0 => n,
        _ => return,
    };
    let req = String::from_utf8_lossy(&buf[..n]).to_string();
    let mut parts = req.lines().next().unwrap_or("").split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("/");
    let reply = |stream: &mut std::net::TcpStream, code: &str, ctype: &str, body: &[u8], head_only: bool| {
        let h = format!("HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n", code, ctype, body.len());
        let _ = stream.write_all(h.as_bytes());
        if !head_only {
            let _ = stream.write_all(body);
        }
    };
    if method != "GET" && method != "HEAD" {
        return reply(&mut stream, "405 Method Not Allowed", "text/plain", b"Only GET is supported by the preview server", false);
    }
    let path_only = target.split(|c| c == '?' || c == '#').next().unwrap_or("/");
    let decoded = percent_decode(path_only);
    let mut file = root.to_path_buf();
    for seg in decoded.split('/') {
        if seg.is_empty() || seg == "." {
            continue;
        }
        if seg == ".." || seg.contains('\\') || seg.contains(':') {
            return reply(&mut stream, "403 Forbidden", "text/plain", b"Forbidden", method == "HEAD");
        }
        file.push(seg);
    }
    if file.is_dir() {
        file.push("index.html");
    }
    // the resolved file must still live inside the root (defends against symlinks)
    let ok = match (fs::canonicalize(&file), fs::canonicalize(root)) {
        (Ok(f), Ok(r)) => f.starts_with(r),
        _ => false,
    };
    if !ok || !file.is_file() {
        return reply(&mut stream, "404 Not Found", "text/plain; charset=utf-8", format!("404 – {} not found", decoded).as_bytes(), method == "HEAD");
    }
    match fs::read(&file) {
        Ok(bytes) => reply(&mut stream, "200 OK", mime_for(&file), &bytes, method == "HEAD"),
        Err(_) => reply(&mut stream, "500 Internal Server Error", "text/plain", b"Could not read the file", method == "HEAD"),
    }
}

#[tauri::command]
async fn serve_start(state: tauri::State<'_, ServeState>, root: String) -> Res<String> {
    let mut map = state.inner().0.lock().map_err(err)?;
    if let Some(s) = map.get(&root) {
        return Ok(format!("http://127.0.0.1:{}/", s.port));
    }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(err)?;
    let port = listener.local_addr().map_err(err)?.port();
    listener.set_nonblocking(true).map_err(err)?;
    let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let flag = stop.clone();
    let base = PathBuf::from(&root);
    std::thread::spawn(move || {
        while !flag.load(std::sync::atomic::Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    let b = base.clone();
                    std::thread::spawn(move || handle_conn(stream, &b));
                }
                Err(_) => std::thread::sleep(Duration::from_millis(25)),
            }
        }
    });
    map.insert(root, StaticServer { port, stop });
    Ok(format!("http://127.0.0.1:{}/", port))
}

#[tauri::command]
async fn serve_stop(state: tauri::State<'_, ServeState>, root: Option<String>) -> Res<()> {
    let mut map = state.inner().0.lock().map_err(err)?;
    let keys: Vec<String> = match root {
        Some(r) => vec![r],
        None => map.keys().cloned().collect(),
    };
    for k in keys {
        if let Some(s) = map.remove(&k) {
            s.stop.store(true, std::sync::atomic::Ordering::Relaxed);
        }
    }
    Ok(())
}

/* ---------------------------------------------------------------- local Vextra server (started from the Cloud panel, no terminal needed) */
#[derive(Default)]
struct ServerState(Mutex<Option<Child>>);

#[derive(Serialize)]
struct ServerInfo {
    running: bool,
    url: String,
    mode: String,
    detail: String,
}

/// The version a server on this port reports (plain HTTP on loopback, no extra crate).
fn server_version(port: u16) -> Option<String> {
    use std::io::{Read, Write};
    let mut s = std::net::TcpStream::connect_timeout(&std::net::SocketAddr::from(([127, 0, 0, 1], port)), Duration::from_millis(400)).ok()?;
    s.set_read_timeout(Some(Duration::from_millis(900))).ok()?;
    s.write_all(b"GET /api/health HTTP/1.0\r\nHost: localhost\r\n\r\n").ok()?;
    let mut buf = String::new();
    let _ = s.read_to_string(&mut buf);
    let i = buf.find("\"version\":\"")? + 11;
    Some(buf[i..].chars().take_while(|c| *c != '"').collect())
}

/// Ends leftover Vextra servers (our own bundled binary, found by its file name) so a new one can start and the installer can replace the file.
fn kill_stale_servers() {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill").args(["/F", "/T", "/IM", "vextra-server.exe"]).creation_flags(0x0800_0000).stdout(Stdio::null()).stderr(Stdio::null()).status();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("pkill").args(["-x", "vextra-server"]).stdout(Stdio::null()).stderr(Stdio::null()).status();
    }
}

fn port_open(port: u16) -> bool {
    std::net::TcpStream::connect_timeout(&std::net::SocketAddr::from(([127, 0, 0, 1], port)), Duration::from_millis(250)).is_ok()
}

/// Looks for the server next to the app: a compiled binary first, then server.js (needs Node.js), then the source tree (development).
fn find_server(app: &AppHandle) -> Option<(PathBuf, bool)> {
    let exe = if cfg!(windows) { "vextra-server.exe" } else { "vextra-server" };
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(r) = app.path().resource_dir() {
        dirs.push(r.join("resources").join("server"));
        dirs.push(r.join("server"));
    }
    if let Ok(e) = std::env::current_exe() {
        if let Some(d) = e.parent() {
            dirs.push(d.join("server"));
            dirs.push(d.join("resources").join("server"));
        }
    }
    dirs.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("resources").join("server"));
    for d in &dirs {
        let b = d.join(exe);
        if b.is_file() {
            return Some((b, true));
        }
    }
    for d in dirs.iter().chain(std::iter::once(&Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("server"))) {
        let j = d.join("server.js");
        if j.is_file() {
            return Some((j, false));
        }
    }
    None
}

#[tauri::command]
async fn server_start(app: AppHandle, state: tauri::State<'_, ServerState>, port: Option<u16>) -> Res<ServerInfo> {
    let port = port.unwrap_or(8787);
    let url = format!("http://localhost:{port}");
    {
        let mut g = state.inner().0.lock().map_err(err)?;
        if let Some(c) = g.as_mut() {
            if matches!(c.try_wait(), Ok(None)) && port_open(port) {
                return Ok(ServerInfo { running: true, url, mode: "started".into(), detail: "already running".into() });
            }
            *g = None;
        }
    }
    if port_open(port) {
        /* a server from an older version (left running after an update or crash) is replaced; a server of this version is reused */
        if server_version(port).as_deref() != Some(env!("CARGO_PKG_VERSION")) {
            kill_stale_servers();
            for _ in 0..20 {
                if !port_open(port) {
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        }
        if port_open(port) {
            return Ok(ServerInfo { running: true, url, mode: "external".into(), detail: "a server is already listening on this port".into() });
        }
    }
    let (path, compiled) = find_server(&app).ok_or("The server files were not found in this build. Run `npm run server` once, or rebuild the app with `npm run build:win` / `build:linux` / `build:mac`.")?;
    let data = app.path().app_data_dir().map_err(err)?.join("server-data");
    fs::create_dir_all(&data).map_err(err)?;
    let mut cmd = if compiled {
        Command::new(&path)
    } else {
        let mut c = Command::new(if cfg!(windows) { "node.exe" } else { "node" });
        c.arg(&path);
        c
    };
    cmd.env("PORT", port.to_string()).env("HOST", "127.0.0.1").env("DATA_DIR", &data).env("VEXTRA_PARENT_PID", std::process::id().to_string()).stdin(Stdio::null());
    let log_path = data.join("server.log");
    match fs::File::create(&log_path) {
        Ok(f) => {
            cmd.stdout(f.try_clone().map_err(err)?).stderr(f);
        }
        Err(_) => {
            cmd.stdout(Stdio::null()).stderr(Stdio::null());
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().map_err(|e| {
        if compiled {
            format!("could not start the server: {e}")
        } else {
            format!("could not start the server: {e}. Install Node.js (nodejs.org) or use a build that includes the compiled server.")
        }
    })?;
    for _ in 0..40 {
        std::thread::sleep(Duration::from_millis(150));
        if port_open(port) {
            let mode = if compiled { "binary" } else { "node" };
            *state.inner().0.lock().map_err(err)? = Some(child);
            return Ok(ServerInfo { running: true, url, mode: mode.into(), detail: format!("data: {}", data.display()) });
        }
        if let Ok(Some(status)) = child.try_wait() {
            let msg = fs::read_to_string(&log_path).unwrap_or_default().lines().rev().take(4).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join(" ");
            return Err(format!("the server stopped right away ({status}). {msg}"));
        }
    }
    let _ = child.kill();
    Err("the server did not start in time".into())
}

#[tauri::command]
async fn server_status(state: tauri::State<'_, ServerState>, port: Option<u16>) -> Res<ServerInfo> {
    let port = port.unwrap_or(8787);
    let mut g = state.inner().0.lock().map_err(err)?;
    let ours = match g.as_mut() {
        Some(c) => matches!(c.try_wait(), Ok(None)),
        None => false,
    };
    if !ours {
        *g = None;
    }
    Ok(ServerInfo { running: port_open(port), url: format!("http://localhost:{port}"), mode: if ours { "started".into() } else { "external".into() }, detail: String::new() })
}

#[tauri::command]
async fn server_stop(state: tauri::State<'_, ServerState>) -> Res<()> {
    if let Some(mut c) = state.inner().0.lock().map_err(err)?.take() {
        let _ = c.kill();
        let _ = c.wait();
    }
    Ok(())
}

/// Files the operating system asked us to open (double-click on a .vxpack / .vxgame / .vxs, or "Open with").
#[derive(Default)]
struct LaunchFiles(Mutex<Vec<String>>);

fn is_launch_file(p: &str) -> bool {
    let l = p.to_lowercase();
    (l.ends_with(".vxpack") || l.ends_with(".vxgame") || l.ends_with(".vxs")) && Path::new(p).is_file()
}

/// Returns (and forgets) the files the app was started with.
#[tauri::command]
fn app_launch_files(state: tauri::State<'_, LaunchFiles>) -> Vec<String> {
    state.0.lock().map(|mut g| std::mem::take(&mut *g)).unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let launch: Vec<String> = std::env::args().skip(1).filter(|a| is_launch_file(a)).collect();
    let app = tauri::Builder::default()
        .manage(LaunchFiles(Mutex::new(launch)))
        .manage(PhpState::default())
        .manage(ServeState::default())
        .manage(RunState::default())
        .manage(ServerState::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Ok(mut g) = window.app_handle().state::<ServerState>().inner().0.lock() {
                    if let Some(mut c) = g.take() {
                        let _ = c.kill();
                        let _ = c.wait();
                    }
                }
                if let Ok(mut map) = window.app_handle().state::<PhpState>().inner().0.lock() {
                    for (_, mut c) in map.drain() {
                        let _ = c.child.kill();
                        let _ = c.child.wait();
                    }
                }
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(UpdaterState::default())
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                let _ = app.emit("menu:action", event.id().0.clone());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fs_open_folder, fs_open_file, fs_save_as, fs_pick_files, fs_read_dir, fs_read_file, fs_read_base64, fs_write_file,
            fs_write_base64, fs_create, fs_remove, fs_rename, fs_exists, fs_mtime, fs_reveal, fs_list_files, fs_search, ext_list, ext_save,
            ext_remove, ext_import, ext_open_dir, settings_load, settings_save, secret_get, secret_set, app_info, app_clean,
            http_request, http_download, run_start, run_poll, run_cancel, term_start, term_write, term_shells, php_status, php_log, db_detect, db_cli, open_url, php_check, php_start, php_stop, serve_start, serve_stop, server_start, server_status, server_stop,
            updater_check, updater_install, app_restart, app_launch_files
        ])
        .build(tauri::generate_context!())
        .expect("error while building Vextra Studio");
    app.run(|_handle, _event| {
        /* every OS: when the app really quits (Cmd+Q on macOS, last window on Linux/Windows, a restart for an update) the bundled server and PHP servers go with it */
        if let tauri::RunEvent::Exit = _event {
            if let Ok(mut g) = _handle.state::<ServerState>().inner().0.lock() {
                if let Some(mut c) = g.take() {
                    let _ = c.kill();
                    let _ = c.wait();
                }
            }
            if let Ok(mut map) = _handle.state::<PhpState>().inner().0.lock() {
                for (_, mut c) in map.drain() {
                    let _ = c.child.kill();
                    let _ = c.child.wait();
                }
            }
        }
        // macOS delivers "open with" / double-click as an event while the app is already running
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = _event {
            let files: Vec<String> = urls.iter().filter_map(|u| u.to_file_path().ok()).map(|p| p.to_string_lossy().to_string()).filter(|p| is_launch_file(p)).collect();
            if !files.is_empty() {
                let _ = _handle.emit("open-file", files);
            }
        }
    });
}
