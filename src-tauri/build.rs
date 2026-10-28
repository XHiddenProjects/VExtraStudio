// Generates `builtin.rs`: embeds every file in ../plugins and ../themes into the executable.
use std::{env, fs, path::Path};

fn main() {
    let manifest = env::var("CARGO_MANIFEST_DIR").unwrap();
    let out = env::var("OUT_DIR").unwrap();
    let mut code = String::new();
    for kind in ["plugins", "themes"] {
        let dir = Path::new(&manifest).join("..").join(kind);
        println!("cargo:rerun-if-changed={}", dir.display());
        code.push_str(&format!("pub const {}: &[(&str, &str)] = &[\n", kind.to_uppercase()));
        if let Ok(rd) = fs::read_dir(&dir) {
            let mut names: Vec<String> = rd.flatten().filter_map(|e| e.file_name().into_string().ok()).collect();
            names.sort();
            for n in names {
                let p = dir.join(&n).canonicalize().unwrap();
                code.push_str(&format!("    ({:?}, include_str!({:?})),\n", n, p.to_string_lossy().replace('\\', "/")));
            }
        }
        code.push_str("];\n");
    }
    fs::write(Path::new(&out).join("builtin.rs"), code).unwrap();
    tauri_build::build();
}
