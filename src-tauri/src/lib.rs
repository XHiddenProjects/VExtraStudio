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
    sync::Mutex,
    time::Duration,
};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_dialog::DialogExt;

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

/* ---------------------------------------------------------------- http (cloud features) */

#[derive(Deserialize)]
struct HttpReq {
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
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
    tauri::async_runtime::spawn_blocking(move || {
        let mut r = ureq::request(&req.method.to_uppercase(), &req.url).timeout(Duration::from_secs(25));
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
#[derive(Default)]
struct PhpState(Mutex<HashMap<String, Child>>);

#[derive(Serialize)]
struct PhpInfo {
    url: String,
    port: u16,
    version: String,
}

fn php_bin() -> String {
    std::env::var("VEXTRA_PHP").unwrap_or_else(|_| "php".into())
}

fn php_version() -> Res<String> {
    let out = Command::new(php_bin())
        .arg("-v")
        .output()
        .map_err(|_| "PHP was not found on this computer. Install PHP (php.net/downloads) and make sure `php` is on your PATH, or set the VEXTRA_PHP environment variable to its full path.".to_string())?;
    Ok(String::from_utf8_lossy(&out.stdout).lines().next().unwrap_or("PHP").to_string())
}

#[tauri::command]
async fn php_check() -> Res<String> {
    php_version()
}

#[tauri::command]
async fn php_start(state: tauri::State<'_, PhpState>, root: String) -> Res<PhpInfo> {
    let version = php_version()?;
    let mut map = state.inner().0.lock().map_err(err)?;
    if let Some(mut old) = map.remove(&root) {
        let _ = old.kill();
        let _ = old.wait();
    }
    let port = TcpListener::bind("127.0.0.1:0").map_err(err)?.local_addr().map_err(err)?.port();
    let child = Command::new(php_bin())
        .args(["-S", &format!("127.0.0.1:{}", port), "-t", &root])
        .current_dir(&root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(err)?;
    map.insert(root, child);
    drop(map);
    std::thread::sleep(Duration::from_millis(450));
    Ok(PhpInfo { url: format!("http://127.0.0.1:{}/", port), port, version })
}

#[tauri::command]
async fn php_stop(state: tauri::State<'_, PhpState>, root: Option<String>) -> Res<()> {
    let mut map = state.inner().0.lock().map_err(err)?;
    match root {
        Some(r) => {
            if let Some(mut c) = map.remove(&r) {
                let _ = c.kill();
                let _ = c.wait();
            }
        }
        None => {
            for (_, mut c) in map.drain() {
                let _ = c.kill();
                let _ = c.wait();
            }
        }
    }
    Ok(())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PhpState::default())
        .manage(ServeState::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Ok(mut map) = window.app_handle().state::<PhpState>().inner().0.lock() {
                    for (_, mut c) in map.drain() {
                        let _ = c.kill();
                        let _ = c.wait();
                    }
                }
            }
        })
        .plugin(tauri_plugin_dialog::init())
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
            fs_write_base64, fs_create, fs_remove, fs_rename, fs_exists, fs_reveal, fs_list_files, fs_search, ext_list, ext_save,
            ext_remove, ext_import, ext_open_dir, settings_load, settings_save, secret_get, secret_set, app_info, app_clean,
            http_request, open_url, php_check, php_start, php_stop, serve_start, serve_stop
        ])
        .run(tauri::generate_context!())
        .expect("error while running Vextra Studio");
}
