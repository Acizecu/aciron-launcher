

const BUILD_ENV: [&str; 8] = [
    "ACIRON_ID_URL",
    "ACIRON_CF_PROXY_URL",
    "ACIRON_CLIENT_KEY",
    "ACIRON_PROXY_TOKEN",
    "ACIRON_MS_CLIENT_ID",

    "ACIRON_REPORT_URL",

    "ACIRON_LOG_URL",
    "ACIRON_BUILD_CHANNEL",
];

fn main() {
    for var in BUILD_ENV {
        println!("cargo:rerun-if-env-changed={var}");
    }

    let channel = std::env::var("ACIRON_BUILD_CHANNEL").unwrap_or_default();
    let channel_eff = if channel.is_empty() {
        "stable".to_string()
    } else {
        channel
    };
    println!("cargo:rustc-env=ACIRON_BUILD_CHANNEL={channel_eff}");

    let sha = std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    let dirty = std::process::Command::new("git")
        .args(["status", "--porcelain"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| !String::from_utf8_lossy(&o.stdout).trim().is_empty())
        .unwrap_or(false);

    println!("cargo:rustc-env=ACIRON_GIT_SHA={sha}");
    println!(
        "cargo:rustc-env=ACIRON_GIT_DIRTY={}",
        if dirty { "1" } else { "0" }
    );

    let git_out = |args: &[&str]| {
        std::process::Command::new("git")
            .args(args)
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .filter(|s| !s.is_empty())
    };
    if let Some(git_dir) = git_out(&["rev-parse", "--git-dir"]) {
        println!("cargo:rerun-if-changed={git_dir}/HEAD");
        println!("cargo:rerun-if-changed={git_dir}/index");
        println!("cargo:rerun-if-changed={git_dir}/packed-refs");
        if let Some(head_ref) = git_out(&["symbolic-ref", "--quiet", "HEAD"]) {
            println!("cargo:rerun-if-changed={git_dir}/{head_ref}");
        }
    }
    println!("cargo:rerun-if-changed=src");
    println!("cargo:rerun-if-changed=../src");

    tauri_build::build()
}
