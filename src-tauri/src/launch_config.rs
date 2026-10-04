use serde_json::Value;
use std::path::{Component, Path, PathBuf};

pub fn validate_java(runtime: &str, path: &str) -> Result<(), String> {
    match runtime {
        ""
        | "jre-legacy"
        | "java-runtime-gamma"
        | "java-runtime-delta"
        | "java-runtime-epsilon" => Ok(()),
        "custom" if Path::new(path).is_file() => Ok(()),
        "custom" => Err("Выберите существующий файл Java".into()),
        _ => Err("Неизвестная версия Java".into()),
    }
}

pub fn game_arguments(
    metadata: &Value,
    values: &[(&str, String)],
    allow_rules: impl Fn(&Value) -> bool,
) -> Result<Vec<String>, String> {
    let mut templates = Vec::new();
    if let Some(game) = metadata["arguments"]["game"].as_array() {
        for entry in game {
            if let Some(text) = entry.as_str() {
                templates.push(text.to_string());
            } else if allow_rules(&entry["rules"]) {
                match &entry["value"] {
                    Value::String(text) => templates.push(text.clone()),
                    Value::Array(list) => {
                        templates.extend(list.iter().filter_map(Value::as_str).map(String::from))
                    }
                    _ => {}
                }
            }
        }
    } else {
        let legacy = metadata["minecraftArguments"].as_str().unwrap_or(
            "--username ${auth_player_name} --version ${version_name} --gameDir ${game_directory} --assetsDir ${assets_root} --assetIndex ${assets_index_name} --uuid ${auth_uuid} --accessToken ${auth_access_token} --userProperties ${user_properties} --userType ${user_type} --versionType ${version_type}"
        );
        templates.extend(legacy.split_whitespace().map(String::from));
    }
    templates
        .into_iter()
        .map(|mut arg| {
            for (key, value) in values {
                arg = arg.replace(&format!("${{{key}}}"), value);
            }
            if arg.contains("${") {
                return Err(format!("Unknown Minecraft argument: {arg}"));
            }
            Ok(arg)
        })
        .collect()
}

pub fn game_assets(index: &Value, assets: &Path, game: &Path, id: &str) -> PathBuf {
    if index["map_to_resources"].as_bool() == Some(true) {
        game.join("resources")
    } else if index["virtual"].as_bool() == Some(true) {
        assets.join("virtual").join(id)
    } else {
        assets.to_path_buf()
    }
}

pub fn materialize_assets(
    index: &Value,
    assets: &Path,
    game: &Path,
    id: &str,
) -> Result<(), String> {
    let mut roots = Vec::new();
    if index["virtual"].as_bool() == Some(true) {
        roots.push(assets.join("virtual").join(id));
    }
    if index["map_to_resources"].as_bool() == Some(true) {
        roots.push(game.join("resources"));
    }
    if roots.is_empty() {
        return Ok(());
    }
    let objects = index["objects"]
        .as_object()
        .ok_or("Asset index has no objects")?;
    for (name, object) in objects {
        let relative = Path::new(name);
        if name.contains('\\')
            || name.contains(':')
            || relative
                .components()
                .any(|part| !matches!(part, Component::Normal(_)))
        {
            return Err(format!("Invalid asset path: {name}"));
        }
        let hash = object["hash"]
            .as_str()
            .filter(|hash| hash.len() == 40 && hash.bytes().all(|b| b.is_ascii_hexdigit()))
            .ok_or_else(|| format!("Invalid asset hash: {name}"))?;
        let source = assets.join("objects").join(&hash[..2]).join(hash);
        let size = std::fs::metadata(&source)
            .map_err(|e| format!("Missing asset {name}: {e}"))?
            .len();
        if object["size"]
            .as_u64()
            .is_some_and(|expected| expected != size)
        {
            return Err(format!("Invalid asset size: {name}"));
        }
        for root in &roots {
            let target = root.join(relative);
            if std::fs::metadata(&target).is_ok_and(|meta| meta.len() == size) {
                continue;
            }
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let temporary = target.with_extension("aciron-part");
            std::fs::copy(&source, &temporary).map_err(|e| e.to_string())?;
            std::fs::rename(&temporary, &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn normalize_legacy_language(client_jar: &Path, game: &Path) -> Result<(), String> {
    let path = game.join("options.txt");
    if !path.exists() {
        return Ok(());
    }
    let existing = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let Some(language) = existing.lines().find_map(|line| line.strip_prefix("lang:")) else {
        return Ok(());
    };
    let file = std::fs::File::open(client_jar).map_err(|e| e.to_string())?;
    let zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let requested = format!("lang/{language}.lang");
    let canonical = zip
        .file_names()
        .find(|name| name.eq_ignore_ascii_case(&requested))
        .and_then(|name| name.strip_prefix("lang/"))
        .and_then(|name| name.strip_suffix(".lang"))
        .unwrap_or("en_US");
    if language == canonical {
        return Ok(());
    }
    let lines: Vec<String> = existing
        .lines()
        .map(|line| {
            if line.starts_with("lang:") {
                format!("lang:{canonical}")
            } else {
                line.to_string()
            }
        })
        .collect();
    crate::atomic::write(&path, &(lines.join("\n") + "\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn positional_arguments_preserve_paths_and_session() {
        let args = game_arguments(&json!({"minecraftArguments": "${auth_player_name} ${auth_session} --assetsDir ${game_assets}"}),
            &[("auth_player_name", "Player".into()), ("auth_session", "token:0:uuid".into()), ("game_assets", "C:/Game Folder/resources".into())], |_| false).unwrap();
        assert_eq!(
            args,
            [
                "Player",
                "token:0:uuid",
                "--assetsDir",
                "C:/Game Folder/resources"
            ]
        );
    }

    #[test]
    fn modern_optional_arguments_obey_rules_and_unknown_values_fail() {
        let meta = json!({"arguments": {"game": ["--username", "${auth_player_name}", {"rules": [], "value": ["--demo"]}]}});
        assert_eq!(
            game_arguments(&meta, &[("auth_player_name", "Player".into())], |_| false).unwrap(),
            ["--username", "Player"]
        );
        assert!(game_arguments(&meta, &[], |_| false).is_err());
    }

    #[test]
    fn legacy_layout_uses_resource_directory_and_rejects_traversal() {
        let meta =
            json!({"map_to_resources": true, "objects": {"../escape": {"hash": "a".repeat(40)}}});
        assert_eq!(
            game_assets(&meta, Path::new("assets"), Path::new("game"), "pre-1.6"),
            Path::new("game/resources")
        );
        assert!(
            materialize_assets(&meta, Path::new("assets"), Path::new("game"), "pre-1.6")
                .unwrap_err()
                .contains("Invalid asset path")
        );
    }

    #[test]
    fn java_selection_rejects_missing_custom_executable() {
        assert!(validate_java("java-runtime-delta", "").is_ok());
        assert!(validate_java("custom", "missing-java.exe").is_err());
        assert!(validate_java("../runtime", "").is_err());
    }

    #[test]
    fn old_instances_default_to_automatic_and_java_choice_is_persisted() {
        let old = json!({"id": "test", "name": "Test", "mc_version": "1.20.4", "loader": "fabric"});
        let mut build: crate::builds::Build = serde_json::from_value(old).unwrap();
        assert!(build.java_runtime.is_empty() && build.java_path.is_empty());
        build.java_runtime = "java-runtime-gamma".into();
        let restored: crate::builds::Build =
            serde_json::from_str(&serde_json::to_string(&build).unwrap()).unwrap();
        assert_eq!(restored.java_runtime, "java-runtime-gamma");
        build.java_runtime = "custom".into();
        build.java_path = "C:/Program Files/Java/bin/java.exe".into();
        let restored: crate::builds::Build =
            serde_json::from_str(&serde_json::to_string(&build).unwrap()).unwrap();
        assert_eq!(restored.java_path, build.java_path);
    }

    #[test]
    #[ignore]
    fn installed_client_fixtures() {
        let root = PathBuf::from(std::env::var("ACIRON_PROBE_GAME_ROOT").unwrap());
        let output = PathBuf::from(std::env::var("ACIRON_PROBE_OUTPUT").unwrap());
        for version in ["1.5.2", "1.7.10", "1.8.9", "1.12.2", "26.3"] {
            let game = output.join(version);
            std::fs::create_dir_all(&game).unwrap();
            let meta: Value = serde_json::from_slice(
                &std::fs::read(root.join(format!("versions/{version}/{version}.json"))).unwrap(),
            )
            .unwrap();
            let id = meta["assetIndex"]["id"].as_str().unwrap();
            let index: Value = serde_json::from_slice(
                &std::fs::read(root.join(format!("assets/indexes/{id}.json"))).unwrap(),
            )
            .unwrap();
            let assets = root.join("assets");
            if version == "1.5.2" {
                std::fs::write(game.join("options.txt"), "lang:en_us\nfullscreen:false\n").unwrap();
                materialize_assets(&index, &assets, &game, id).unwrap();
                normalize_legacy_language(
                    &root.join(format!("versions/{version}/{version}.jar")),
                    &game,
                )
                .unwrap();
                assert!(std::fs::read_to_string(game.join("options.txt"))
                    .unwrap()
                    .contains("lang:en_US"));
                assert!(game.join("resources/icons/icon_16x16.png").is_file());
            }
            let args = game_arguments(
                &meta,
                &[
                    ("auth_player_name", "AcironLaunchTest".into()),
                    (
                        "auth_session",
                        "token:0:00000000000000000000000000000001".into(),
                    ),
                    ("auth_uuid", "00000000000000000000000000000001".into()),
                    ("auth_access_token", "0".into()),
                    ("user_type", "msa".into()),
                    ("user_properties", "{}".into()),
                    ("version_name", version.into()),
                    ("version_type", "release".into()),
                    ("game_directory", game.to_string_lossy().into_owned()),
                    ("assets_root", assets.to_string_lossy().into_owned()),
                    (
                        "game_assets",
                        game_assets(&index, &assets, &game, id)
                            .to_string_lossy()
                            .into_owned(),
                    ),
                    ("assets_index_name", id.into()),
                    ("clientid", String::new()),
                    ("auth_xuid", String::new()),
                ],
                |_| false,
            )
            .unwrap();
            std::fs::write(
                game.join("arguments.json"),
                serde_json::to_vec_pretty(&args).unwrap(),
            )
            .unwrap();
        }
    }
}
