//! Managed AI-singer environment (SoulX-Singer).
//!
//! The app can install everything the singer needs by itself, into ONE folder that the uninstaller deletes:
//!   <app local data>/singer/  tools (uv) · python · env (venv) · src (SoulX-Singer code + models) · bridge · voices · logs
//! Steps (each leaves a marker, so an interrupted install resumes): uv → Python 3.10 → venv → PyTorch → SoulX-Singer code →
//! dependencies → language data → models → bridge. Large downloads (PyTorch, models) are several GB – the UI asks first.
//! This module has no Tauri dependency, so it can be tested on its own.

use serde::Serialize;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

/// Bump when the install recipe or the bridge changes: installed copies are then refreshed after an app update.
pub const ENGINE_REV: &str = "1";
const SRC_ZIP: &str = "https://github.com/Soul-AILab/SoulX-Singer/archive/refs/heads/main.zip";
const MODEL_REPOS: [(&str, &str); 2] = [("Soul-AILab/SoulX-Singer", "pretrained_models/SoulX-Singer"), ("Soul-AILab/SoulX-Singer-Preprocess", "pretrained_models/SoulX-Singer-Preprocess")];
pub const DEFAULT_PORT: u16 = 8765;

#[derive(Serialize, Clone, Debug)]
pub struct Prog {
    pub step: String,
    pub pct: u8,
    pub msg: String,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct Status {
    pub installed: bool,
    pub outdated: bool,
    pub partial: bool,
    pub dir: String,
    pub size_mb: u64,
    pub gpu: bool,
    pub engine_rev: String,
    pub supported: bool,
    pub note: String,
}

pub fn dir(base: &Path) -> PathBuf {
    base.join("singer")
}
fn steps_dir(d: &Path) -> PathBuf {
    d.join(".steps")
}
fn done(d: &Path, name: &str) -> bool {
    steps_dir(d).join(name).is_file()
}
fn mark(d: &Path, name: &str) -> Result<(), String> {
    fs::create_dir_all(steps_dir(d)).map_err(|e| e.to_string())?;
    fs::write(steps_dir(d).join(name), "ok").map_err(|e| e.to_string())
}
fn env_python(d: &Path) -> PathBuf {
    if cfg!(windows) { d.join("env").join("Scripts").join("python.exe") } else { d.join("env").join("bin").join("python") }
}
fn uv_path(d: &Path) -> PathBuf {
    d.join("tools").join(if cfg!(windows) { "uv.exe" } else { "uv" })
}

/// total size of a folder in bytes (best effort)
pub fn dir_size(p: &Path) -> u64 {
    let mut t = 0;
    if let Ok(rd) = fs::read_dir(p) {
        for e in rd.flatten() {
            let m = match e.metadata() { Ok(m) => m, Err(_) => continue };
            if m.is_dir() { t += dir_size(&e.path()); } else { t += m.len(); }
        }
    }
    t
}

/// NVIDIA graphics card present? (nvidia-smi answers)
pub fn has_gpu() -> bool {
    if cfg!(target_os = "macos") { return false; }
    let mut c = Command::new("nvidia-smi");
    c.arg("-L").stdout(Stdio::null()).stderr(Stdio::null());
    hide(&mut c);
    c.status().map(|s| s.success()).unwrap_or(false)
}

#[cfg(windows)]
fn hide(c: &mut Command) {
    use std::os::windows::process::CommandExt;
    c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
}
#[cfg(not(windows))]
fn hide(_c: &mut Command) {}

pub fn status(base: &Path) -> Status {
    let d = dir(base);
    let mut s = Status { dir: d.to_string_lossy().to_string(), engine_rev: ENGINE_REV.into(), gpu: has_gpu(), supported: true, ..Default::default() };
    if !(cfg!(windows) || cfg!(target_os = "linux") || cfg!(target_os = "macos")) { s.supported = false; s.note = "This system is not supported.".into(); }
    if d.is_dir() {
        s.size_mb = dir_size(&d) / 1_048_576;
        let meta = fs::read_to_string(d.join("installed.json")).unwrap_or_default();
        s.installed = done(&d, "bridge") && env_python(&d).is_file() && d.join("src").join("pretrained_models").is_dir();
        s.partial = !s.installed && steps_dir(&d).is_dir();
        s.outdated = s.installed && !meta.contains(&format!("\"engine_rev\":\"{}\"", ENGINE_REV));
    }
    s
}

/// Waits for a child while reporting folder growth and honouring cancel. Output goes to the log.
fn run(mut cmd: Command, d: &Path, label: &str, cancel: &AtomicBool, watch: Option<&Path>, progress: &dyn Fn(Prog), step: &str, pct: u8) -> Result<(), String> {
    hide(&mut cmd);
    let log = fs::OpenOptions::new().create(true).append(true).open(d.join("install.log")).map_err(|e| e.to_string())?;
    let log2 = log.try_clone().map_err(|e| e.to_string())?;
    let _ = writeln!(&log, "\n=== {} ===", label);
    cmd.stdout(Stdio::from(log)).stderr(Stdio::from(log2)).stdin(Stdio::null());
    let mut child = cmd.spawn().map_err(|e| format!("could not start {}: {}", label, e))?;
    let t0 = Instant::now();
    loop {
        if cancel.load(Ordering::SeqCst) { let _ = child.kill(); let _ = child.wait(); return Err("cancelled".into()); }
        match child.try_wait() {
            Ok(Some(st)) => {
                return if st.success() { Ok(()) } else { Err(format!("{} failed – see {}", label, d.join("install.log").display())) };
            }
            Ok(None) => {}
            Err(e) => return Err(e.to_string()),
        }
        let extra = watch.map(|w| format!(" · {} MB on disk", dir_size(w) / 1_048_576)).unwrap_or_default();
        progress(Prog { step: step.into(), pct, msg: format!("{} ({}s){}", label, t0.elapsed().as_secs(), extra) });
        std::thread::sleep(Duration::from_millis(900));
    }
}

fn download(url: &str, to: &Path, cancel: &AtomicBool, progress: &dyn Fn(Prog), step: &str, pct: u8, label: &str) -> Result<(), String> {
    let agent = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(20)).timeout_read(Duration::from_secs(60)).build();
    let resp = agent.get(url).call().map_err(|e| format!("download failed ({}): {}", label, e))?;
    let total: u64 = resp.header("Content-Length").and_then(|v| v.parse().ok()).unwrap_or(0);
    let mut r = resp.into_reader();
    let mut f = fs::File::create(to).map_err(|e| e.to_string())?;
    let (mut buf, mut got, mut last) = (vec![0u8; 64 * 1024], 0u64, Instant::now());
    loop {
        if cancel.load(Ordering::SeqCst) { return Err("cancelled".into()); }
        let n = r.read(&mut buf).map_err(|e| format!("download interrupted ({}): {}", label, e))?;
        if n == 0 { break; }
        f.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        got += n as u64;
        if last.elapsed() > Duration::from_millis(400) {
            last = Instant::now();
            progress(Prog { step: step.into(), pct, msg: format!("{}: {} / {} MB", label, got / 1_048_576, if total > 0 { (total / 1_048_576).to_string() } else { "?".into() }) });
        }
    }
    Ok(())
}

fn tar_path() -> PathBuf {
    if cfg!(windows) {
        let sys = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
        let p = Path::new(&sys).join("System32").join("tar.exe");
        if p.is_file() { return p; }
    }
    PathBuf::from("tar")
}

fn extract(archive: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|e| e.to_string())?;
    let mut c = Command::new(tar_path());
    c.arg("-xf").arg(archive).arg("-C").arg(to).stdout(Stdio::null()).stderr(Stdio::piped());
    hide(&mut c);
    let o = c.output().map_err(|e| format!("could not unpack (tar): {}", e))?;
    if o.status.success() { Ok(()) } else { Err(format!("could not unpack: {}", String::from_utf8_lossy(&o.stderr).trim())) }
}

fn find_file(root: &Path, name: &str) -> Option<PathBuf> {
    for e in fs::read_dir(root).ok()?.flatten() {
        let p = e.path();
        if p.is_dir() { if let Some(f) = find_file(&p, name) { return Some(f); } } else if p.file_name().map(|n| n == name).unwrap_or(false) { return Some(p); }
    }
    None
}

fn uv_url() -> Result<String, String> {
    let arch = if cfg!(target_arch = "aarch64") { "aarch64" } else if cfg!(target_arch = "x86_64") { "x86_64" } else { return Err("This processor is not supported.".into()) };
    let (os, ext) = if cfg!(windows) { ("pc-windows-msvc", "zip") } else if cfg!(target_os = "macos") { ("apple-darwin", "tar.gz") } else { ("unknown-linux-gnu", "tar.gz") };
    Ok(format!("https://github.com/astral-sh/uv/releases/latest/download/uv-{}-{}.{}", arch, os, ext))
}

/// requirements.txt adjusted for a desktop install: the torch pair is installed separately (right build for the graphics card),
/// the web UI / experiment tracker / GPU-only kernels are not needed to sing, and webrtcvad is replaced by its prebuilt-wheel twin.
pub fn filter_requirements(text: &str) -> String {
    let drop = ["torch==", "torchaudio==", "gradio", "wandb", "sageattention"];
    let mut out = Vec::new();
    for l in text.lines() {
        let t = l.trim();
        if t.is_empty() || t.starts_with('#') { continue; }
        let low = t.to_lowercase();
        if drop.iter().any(|d| low.starts_with(d)) { continue; }
        if low.starts_with("webrtcvad") { out.push("webrtcvad-wheels".to_string()); continue; }
        out.push(t.to_string());
    }
    out.push("huggingface_hub>=0.20.0".into());
    out.push("soundfile".into());
    out.join("\n") + "\n"
}

fn uv_cmd(d: &Path) -> Command {
    let mut c = Command::new(uv_path(d));
    c.env("UV_PYTHON_INSTALL_DIR", d.join("python")).env("UV_CACHE_DIR", d.join("cache")).env("UV_NO_PROGRESS", "1").env("UV_PYTHON_PREFERENCE", "only-managed");
    c
}

pub fn install(base: &Path, bridge_src: &Path, cancel: &AtomicBool, progress: &dyn Fn(Prog)) -> Result<(), String> {
    let d = dir(base);
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    cancel.store(false, Ordering::SeqCst);
    let p = |step: &str, pct: u8, msg: &str| progress(Prog { step: step.into(), pct, msg: msg.into() });
    let py = env_python(&d);
    let gpu = has_gpu();

    if !done(&d, "uv") {
        p("uv", 1, "Downloading the installer tool…");
        let url = uv_url()?;
        let arc = d.join(if url.ends_with(".zip") { "uv.zip" } else { "uv.tar.gz" });
        download(&url, &arc, cancel, progress, "uv", 2, "Installer tool")?;
        let tmp = d.join("tools_tmp");
        let _ = fs::remove_dir_all(&tmp);
        extract(&arc, &tmp)?;
        let bin = find_file(&tmp, if cfg!(windows) { "uv.exe" } else { "uv" }).ok_or("the installer tool was not in the download")?;
        fs::create_dir_all(d.join("tools")).map_err(|e| e.to_string())?;
        fs::copy(&bin, uv_path(&d)).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        { use std::os::unix::fs::PermissionsExt; let _ = fs::set_permissions(uv_path(&d), fs::Permissions::from_mode(0o755)); }
        let _ = fs::remove_dir_all(&tmp);
        let _ = fs::remove_file(&arc);
        mark(&d, "uv")?;
    }
    if !done(&d, "python") {
        let mut c = uv_cmd(&d);
        c.args(["python", "install", "3.10"]);
        run(c, &d, "Installing Python 3.10", cancel, Some(&d.join("python")), progress, "python", 6)?;
        let mut c = uv_cmd(&d);
        c.args(["venv", "--python", "3.10"]).arg(d.join("env"));
        run(c, &d, "Creating the Python environment", cancel, None, progress, "python", 10)?;
        mark(&d, "python")?;
    }
    if !done(&d, "torch") {
        let mut c = uv_cmd(&d);
        c.args(["pip", "install", "--python"]).arg(&py).args(["torch==2.2.0", "torchaudio==2.2.0"]);
        if !cfg!(target_os = "macos") {
            c.args(["--index-url", if gpu { "https://download.pytorch.org/whl/cu121" } else { "https://download.pytorch.org/whl/cpu" }, "--extra-index-url", "https://pypi.org/simple", "--index-strategy", "unsafe-best-match"]);
        }
        run(c, &d, if gpu { "Installing PyTorch (graphics-card build)" } else { "Installing PyTorch (CPU build)" }, cancel, Some(&d.join("cache")), progress, "torch", 14)?;
        mark(&d, "torch")?;
    }
    if !done(&d, "src") {
        p("src", 40, "Downloading the SoulX-Singer code…");
        let arc = d.join("soulx.zip");
        download(SRC_ZIP, &arc, cancel, progress, "src", 40, "SoulX-Singer code")?;
        let tmp = d.join("src_tmp");
        let _ = fs::remove_dir_all(&tmp);
        extract(&arc, &tmp)?;
        let top = fs::read_dir(&tmp).map_err(|e| e.to_string())?.flatten().map(|e| e.path()).find(|p| p.is_dir()).ok_or("the SoulX-Singer download was empty")?;
        let _ = fs::remove_dir_all(d.join("src"));
        fs::rename(&top, d.join("src")).map_err(|e| e.to_string())?;
        let _ = fs::remove_dir_all(&tmp);
        let _ = fs::remove_file(&arc);
        mark(&d, "src")?;
    }
    if !done(&d, "deps") {
        let req = fs::read_to_string(d.join("src").join("requirements.txt")).map_err(|e| format!("requirements.txt missing: {}", e))?;
        let f = d.join("requirements.desktop.txt");
        fs::write(&f, filter_requirements(&req)).map_err(|e| e.to_string())?;
        let mut c = uv_cmd(&d);
        c.args(["pip", "install", "--python"]).arg(&py).arg("-r").arg(&f);
        run(c, &d, "Installing the singing libraries", cancel, Some(&d.join("cache")), progress, "deps", 46)?;
        mark(&d, "deps")?;
    }
    if !done(&d, "nltk") {
        let mut c = Command::new(&py);
        c.args(["-c", "import nltk,sys; [nltk.download(x, download_dir=sys.argv[1]) for x in ('averaged_perceptron_tagger','averaged_perceptron_tagger_eng','cmudict','punkt','punkt_tab')]"]).arg(d.join("nltk_data"));
        run(c, &d, "Downloading language data", cancel, None, progress, "nltk", 74)?;
        mark(&d, "nltk")?;
    }
    if !done(&d, "models") {
        let src = d.join("src");
        let code = format!("from huggingface_hub import snapshot_download as s\n{}", MODEL_REPOS.iter().map(|(r, l)| format!("s('{}', local_dir='{}')", r, l)).collect::<Vec<_>>().join("\n"));
        let mut c = Command::new(&py);
        c.arg("-c").arg(code).current_dir(&src).env("HF_HUB_DISABLE_PROGRESS_BARS", "1").env("HF_HUB_DISABLE_TELEMETRY", "1");
        run(c, &d, "Downloading the singing models", cancel, Some(&src.join("pretrained_models")), progress, "models", 78)?;
        mark(&d, "models")?;
    }
    p("bridge", 97, "Finishing up…");
    fs::create_dir_all(d.join("bridge")).map_err(|e| e.to_string())?;
    fs::create_dir_all(d.join("voices")).map_err(|e| e.to_string())?;
    fs::copy(bridge_src.join("bridge.py"), d.join("bridge").join("bridge.py")).map_err(|e| format!("bridge.py missing: {}", e))?;
    fs::write(d.join("installed.json"), format!("{{\"engine_rev\":\"{}\",\"gpu\":{},\"source\":\"{}\"}}", ENGINE_REV, gpu, SRC_ZIP)).map_err(|e| e.to_string())?;
    mark(&d, "bridge")?;
    p("done", 100, "The AI singer is ready.");
    Ok(())
}

/// After an app update: copy the newer bridge in place (cheap). Returns true when something was refreshed.
pub fn refresh_bridge(base: &Path, bridge_src: &Path) -> bool {
    let d = dir(base);
    if !done(&d, "bridge") { return false; }
    let ok = fs::copy(bridge_src.join("bridge.py"), d.join("bridge").join("bridge.py")).is_ok();
    if ok { let _ = fs::write(d.join("installed.json"), format!("{{\"engine_rev\":\"{}\",\"gpu\":{},\"source\":\"{}\"}}", ENGINE_REV, has_gpu(), SRC_ZIP)); }
    ok
}

/// Starts the bridge (127.0.0.1 only). The caller keeps the child and kills it on exit.
pub fn start(base: &Path, port: u16) -> Result<Child, String> {
    let d = dir(base);
    if !done(&d, "bridge") { return Err("The AI singer is not installed yet.".into()); }
    let log = fs::OpenOptions::new().create(true).append(true).open(d.join("bridge.log")).map_err(|e| e.to_string())?;
    let log2 = log.try_clone().map_err(|e| e.to_string())?;
    let mut c = Command::new(env_python(&d));
    c.arg(d.join("bridge").join("bridge.py")).arg("--soulx").arg(d.join("src")).arg("--voices").arg(d.join("voices"))
        .args(["--host", "127.0.0.1", "--port", &port.to_string(), "--device", if has_gpu() { "cuda" } else { "cpu" }])
        .current_dir(&d).env("NLTK_DATA", d.join("nltk_data")).env("HF_HUB_OFFLINE", "1").env("PYTHONIOENCODING", "utf-8")
        .stdin(Stdio::null()).stdout(Stdio::from(log)).stderr(Stdio::from(log2));
    hide(&mut c);
    c.spawn().map_err(|e| format!("could not start the singer: {}", e))
}

/// Deletes the whole singer folder (retries: Windows may still hold files for a moment).
pub fn remove(base: &Path) -> Result<(), String> {
    let d = dir(base);
    if !d.exists() { return Ok(()); }
    let mut last = String::new();
    for _ in 0..8 {
        match fs::remove_dir_all(&d) { Ok(_) => return Ok(()), Err(e) => { last = e.to_string(); std::thread::sleep(Duration::from_millis(500)); } }
    }
    if d.exists() { Err(format!("could not delete {}: {}", d.display(), last)) } else { Ok(()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn requirements_are_adjusted() {
        let r = filter_requirements("accelerate==1.11.0\ngradio==6.3.0\ntorch==2.2.0\ntorchaudio==2.2.0\nwebrtcvad==2.0.10\nwandb==0.24.2\nsageattention==1.0.6\ntorchcodec==0.10.0\n# c\n\nnumpy<2.0.0\n");
        assert!(r.contains("accelerate==1.11.0") && r.contains("torchcodec==0.10.0") && r.contains("numpy<2.0.0") && r.contains("webrtcvad-wheels\n"));
        assert!(!r.contains("gradio") && !r.contains("torch==") && !r.contains("torchaudio") && !r.contains("wandb") && !r.contains("sageattention") && !r.contains("webrtcvad=="));
        assert!(r.contains("huggingface_hub") && r.contains("soundfile"));
    }
    #[test]
    fn status_and_remove() {
        let b = std::env::temp_dir().join(format!("vxs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&b);
        assert!(!status(&b).installed);
        let d = dir(&b);
        fs::create_dir_all(d.join(".steps")).unwrap();
        mark(&d, "uv").unwrap();
        let s = status(&b);
        assert!(s.partial && !s.installed);
        remove(&b).unwrap();
        assert!(!d.exists());
        assert!(uv_url().unwrap().contains("uv-"));
    }
    #[test]
    fn size_and_find() {
        let b = std::env::temp_dir().join(format!("vxf-{}", std::process::id()));
        fs::create_dir_all(b.join("a/b")).unwrap();
        fs::write(b.join("a/b/x.bin"), vec![1u8; 2048]).unwrap();
        assert_eq!(dir_size(&b), 2048);
        assert!(find_file(&b, "x.bin").is_some() && find_file(&b, "nope").is_none());
        let _ = fs::remove_dir_all(&b);
    }
}
