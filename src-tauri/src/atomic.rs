

use std::path::Path;

pub fn write(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension(format!(
        "{}tmp{}",
        path.extension().map(|_| ".").unwrap_or(""),
        std::process::id()
    ));
    std::fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    if let Err(e) = std::fs::rename(&tmp, path) {

        let _ = std::fs::remove_file(&tmp);
        return Err(e.to_string());
    }
    Ok(())
}
