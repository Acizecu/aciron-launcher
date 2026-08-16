

const BUILD_ENV: [&str; 6] = [
    "ACIRON_ID_URL",
    "ACIRON_CF_PROXY_URL",
    "ACIRON_CLIENT_KEY",
    "ACIRON_PROXY_TOKEN",
    "ACIRON_MS_CLIENT_ID",
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

    println!("cargo:rerun-if-changed=../.git/HEAD");

    tauri_build::build()
}
