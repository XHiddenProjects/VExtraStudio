//! Blender integration: find Blender, install / remove the Vextra add-on, optionally download a portable Blender into the app's
//! own folder (removable), and start Blender with the add-on switched on. No Tauri dependency (tested on its own).

use crate::singer::{dir_size, download, extract, find_file, hide, Prog};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::AtomicBool,
};

pub const PORTABLE_VERSION: &str = "4.2.3";
pub const ADDON_FILE: &str = "vextra_tools.py";

#[derive(Serialize, Clone, Debug)]
pub struct Found {
    pub path: String,
    pub version: String, // "4.2"
    pub kind: String,    // "managed" | "system"
    pub addon: bool,
}
#[derive(Serialize, Clone, Debug, Default)]
pub struct Status {
    pub found: Vec<Found>,
    pub managed_installed: bool,
    pub managed_supported: bool,
    pub managed_size_mb: u64,
    pub dir: String,
}

pub fn dir(base: &Path) -> PathBuf {
    base.join("blender")
}
fn managed_exe(base: &Path) -> PathBuf {
    dir(base).join("app").join(if cfg!(windows) { "blender.exe" } else { "blender" })
}
fn managed_scripts(base: &Path) -> PathBuf {
    dir(base).join("scripts")
}
/// "4.2" from a folder name like "Blender 4.2" or "blender-4.2.3-windows-x64"
pub fn version_from(name: &str) -> Option<String> {
    let mut it = name.split(|c: char| !(c.is_ascii_digit() || c == '.')).filter(|p| p.contains('.') && p.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false));
    let v = it.next()?;
    let mut parts = v.split('.');
    Some(format!("{}.{}", parts.next()?, parts.next()?))
}
/// where Blender looks for a user's add-ons
fn user_addons(version: &str) -> Option<PathBuf> {
    #[cfg(windows)]
    { std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join("Blender Foundation").join("Blender").join(version).join("scripts").join("addons")) }
    #[cfg(target_os = "macos")]
    { std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support/Blender").join(version).join("scripts/addons")) }
    #[cfg(all(unix, not(target_os = "macos")))]
    { std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config"))).map(|c| c.join("blender").join(version).join("scripts").join("addons")) }
}
fn addons_for(base: &Path, f: &Found) -> Option<PathBuf> {
    if f.kind == "managed" { Some(managed_scripts(base).join("addons")) } else { user_addons(&f.version) }
}

fn system_candidates() -> Vec<PathBuf> {
    let mut v = Vec::new();
    #[cfg(windows)]
    {
        for var in ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"] {
            if let Some(pf) = std::env::var_os(var) {
                let root = PathBuf::from(pf).join("Blender Foundation");
                if let Ok(rd) = fs::read_dir(root) { for e in rd.flatten() { let p = e.path().join("blender.exe"); if p.is_file() { v.push(p); } } }
            }
        }
        if let Some(la) = std::env::var_os("LOCALAPPDATA") {
            let root = PathBuf::from(la).join("Programs").join("Blender Foundation");
            if let Ok(rd) = fs::read_dir(root) { for e in rd.flatten() { let p = e.path().join("blender.exe"); if p.is_file() { v.push(p); } } }
        }
    }
    #[cfg(target_os = "macos")]
    { let p = PathBuf::from("/Applications/Blender.app/Contents/MacOS/Blender"); if p.is_file() { v.push(p); } }
    #[cfg(all(unix, not(target_os = "macos")))]
    { for p in ["/usr/bin/blender", "/usr/local/bin/blender", "/snap/bin/blender", "/var/lib/flatpak/exports/bin/org.blender.Blender"] { let p = PathBuf::from(p); if p.is_file() { v.push(p); } } }
    v
}
/// the version of an installed Blender: from its folder name, else by asking it (`--version`)
fn exe_version(p: &Path) -> Option<String> {
    if let Some(v) = p.parent().and_then(|d| d.file_name()).and_then(|n| n.to_str()).and_then(version_from) { return Some(v); }
    let mut c = Command::new(p);
    c.arg("--version").stdin(Stdio::null());
    hide(&mut c);
    let o = c.output().ok()?;
    version_from(&String::from_utf8_lossy(&o.stdout))
}

pub fn status(base: &Path) -> Status {
    let mut s = Status { dir: dir(base).to_string_lossy().to_string(), managed_supported: cfg!(windows) || cfg!(all(unix, not(target_os = "macos"))), ..Default::default() };
    let mut list: Vec<Found> = Vec::new();
    if managed_exe(base).is_file() {
        s.managed_installed = true;
        list.push(Found { path: managed_exe(base).to_string_lossy().to_string(), version: version_from(PORTABLE_VERSION).unwrap_or_default(), kind: "managed".into(), addon: false });
    }
    for p in system_candidates() {
        if let Some(v) = exe_version(&p) { list.push(Found { path: p.to_string_lossy().to_string(), version: v, kind: "system".into(), addon: false }); }
    }
    for f in list.iter_mut() { f.addon = addons_for(base, f).map(|d| d.join(ADDON_FILE).is_file()).unwrap_or(false); }
    s.managed_size_mb = dir_size(&dir(base)) / 1_048_576;
    s.found = list;
    s
}

fn target(base: &Path, path: &str) -> Result<Found, String> {
    status(base).found.into_iter().find(|f| f.path == path).ok_or_else(|| "That Blender was not found any more.".to_string())
}
pub fn install_addon(base: &Path, res: &Path, path: &str) -> Result<String, String> {
    let f = target(base, path)?;
    let d = addons_for(base, &f).ok_or("Could not work out Blender's add-on folder.")?;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    fs::copy(res.join(ADDON_FILE), d.join(ADDON_FILE)).map_err(|e| format!("could not copy the add-on: {}", e))?;
    Ok(d.to_string_lossy().to_string())
}
pub fn remove_addon(base: &Path, path: &str) -> Result<(), String> {
    let f = target(base, path)?;
    if let Some(d) = addons_for(base, &f) {
        let _ = fs::remove_file(d.join(ADDON_FILE));
        let _ = fs::remove_dir_all(d.join("__pycache__"));
    }
    Ok(())
}

fn portable_url() -> Result<(String, &'static str), String> {
    let v = PORTABLE_VERSION;
    let mm = version_from(v).unwrap_or_default();
    if cfg!(all(windows, target_arch = "x86_64")) { Ok((format!("https://download.blender.org/release/Blender{}/blender-{}-windows-x64.zip", mm, v), "zip")) }
    else if cfg!(all(windows, target_arch = "aarch64")) { Ok((format!("https://download.blender.org/release/Blender{}/blender-{}-windows-arm64.zip", mm, v), "zip")) }
    else if cfg!(all(target_os = "linux", target_arch = "x86_64")) { Ok((format!("https://download.blender.org/release/Blender{}/blender-{}-linux-x64.tar.xz", mm, v), "tar.xz")) }
    else { Err("A portable Blender is not offered for this system. Install Blender from blender.org and use it here.".into()) }
}
/// Downloads a portable Blender into the app's folder (about 350 MB).
pub fn install_portable(base: &Path, res: &Path, cancel: &AtomicBool, progress: &dyn Fn(Prog)) -> Result<(), String> {
    let (url, ext) = portable_url()?;
    let d = dir(base);
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    let arc = d.join(format!("blender.{}", ext));
    download(&url, &arc, cancel, progress, "blender", 5, "Blender")?;
    progress(Prog { step: "blender".into(), pct: 80, msg: "Unpacking Blender…".into() });
    let tmp = d.join("unpack");
    let _ = fs::remove_dir_all(&tmp);
    extract(&arc, &tmp)?;
    let exe = find_file(&tmp, if cfg!(windows) { "blender.exe" } else { "blender" }).ok_or("Blender was not in the download")?;
    let top = exe.parent().ok_or("unexpected folder layout")?.to_path_buf();
    let _ = fs::remove_dir_all(d.join("app"));
    fs::rename(&top, d.join("app")).map_err(|e| e.to_string())?;
    let _ = fs::remove_dir_all(&tmp);
    let _ = fs::remove_file(&arc);
    fs::create_dir_all(managed_scripts(base).join("addons")).map_err(|e| e.to_string())?;
    fs::copy(res.join(ADDON_FILE), managed_scripts(base).join("addons").join(ADDON_FILE)).map_err(|e| e.to_string())?;
    progress(Prog { step: "done".into(), pct: 100, msg: "Blender is ready.".into() });
    Ok(())
}
pub fn remove_managed(base: &Path) -> Result<(), String> {
    let d = dir(base);
    if !d.exists() { return Ok(()); }
    let mut last = String::new();
    for _ in 0..8 {
        match fs::remove_dir_all(&d) { Ok(_) => return Ok(()), Err(e) => { last = e.to_string(); std::thread::sleep(std::time::Duration::from_millis(500)); } }
    }
    if d.exists() { Err(format!("could not delete {}: {}", d.display(), last)) } else { Ok(()) }
}
/// Starts Blender with the Vextra add-on switched on (and, for the downloaded one, its own add-on folder).
pub fn launch(base: &Path, path: &str) -> Result<(), String> {
    let f = target(base, path)?;
    let mut c = Command::new(&f.path);
    c.arg("--python-expr").arg("import addon_utils; addon_utils.enable('vextra_tools', default_set=True, persistent=True)");
    if f.kind == "managed" { c.env("BLENDER_USER_SCRIPTS", managed_scripts(base)); }
    c.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    hide(&mut c);
    c.spawn().map(|_| ()).map_err(|e| format!("could not start Blender: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn versions() {
        assert_eq!(version_from("Blender 4.2").as_deref(), Some("4.2"));
        assert_eq!(version_from("blender-4.2.3-windows-x64").as_deref(), Some("4.2"));
        assert_eq!(version_from("Blender 4.2.3 LTS\nBuild").as_deref(), Some("4.2"));
        assert!(version_from("nothing").is_none());
    }
    #[test]
    fn addon_roundtrip_and_status() {
        let b = std::env::temp_dir().join(format!("vxb-{}", std::process::id()));
        let _ = fs::remove_dir_all(&b);
        let res = b.join("res");
        fs::create_dir_all(&res).unwrap();
        fs::write(res.join(ADDON_FILE), "# addon").unwrap();
        fs::create_dir_all(dir(&b).join("app")).unwrap();
        fs::write(managed_exe(&b), "x").unwrap();
        let s = status(&b);
        let m = s.found.iter().find(|f| f.kind == "managed").unwrap();
        assert!(s.managed_installed && !m.addon);
        install_addon(&b, &res, &m.path).unwrap();
        assert!(status(&b).found.iter().find(|f| f.kind == "managed").unwrap().addon);
        remove_addon(&b, &m.path).unwrap();
        assert!(!status(&b).found.iter().find(|f| f.kind == "managed").unwrap().addon);
        assert!(install_addon(&b, &res, "/nope").is_err());
        remove_managed(&b).unwrap();
        assert!(!dir(&b).exists());
        let _ = fs::remove_dir_all(&b);
    }
}
