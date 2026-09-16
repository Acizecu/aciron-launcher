

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

    tauri_build::build()
}
