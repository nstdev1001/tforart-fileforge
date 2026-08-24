use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::database::Database;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskSpace {
    path: String,
    mount_point: String,
    total_bytes: u64,
    free_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseHealth {
    path: String,
    schema_version: i64,
    status: &'static str,
}

/// Opens the native OS folder picker away from Tauri's async runtime thread.
#[tauri::command]
pub async fn pick_folder() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Choose a FileForge folder")
            .pick_folder()
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| format!("folder picker failed: {error}"))
}

/// Returns total and free bytes for the volume containing `path`.
#[tauri::command]
pub fn get_disk_free_space(path: String) -> Result<DiskSpace, String> {
    disk_space_for_path(Path::new(&path))
}

fn disk_space_for_path(path: &Path) -> Result<DiskSpace, String> {
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("cannot access '{}': {error}", path.display()))?;

    if !canonical_path.is_dir() {
        return Err(format!("'{}' is not a directory", canonical_path.display()));
    }

    let mount_point = volume_root(&canonical_path);
    let total_bytes = fs2::total_space(&canonical_path)
        .map_err(|error| format!("cannot read total disk space: {error}"))?;
    let free_bytes = fs2::available_space(&canonical_path)
        .map_err(|error| format!("cannot read free disk space: {error}"))?;

    Ok(DiskSpace {
        path: canonical_path.to_string_lossy().into_owned(),
        mount_point: mount_point.to_string_lossy().into_owned(),
        total_bytes,
        free_bytes,
    })
}

fn volume_root(path: &Path) -> PathBuf {
    path.ancestors()
        .last()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| path.to_path_buf())
}

#[tauri::command]
pub fn get_database_health(database: State<'_, Database>) -> Result<DatabaseHealth, String> {
    let schema_version = database
        .schema_version()
        .map_err(|error| format!("database health check failed: {error}"))?;

    Ok(DatabaseHealth {
        path: database.path().to_string_lossy().into_owned(),
        schema_version,
        status: "ok",
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disk_space_rejects_missing_path() {
        let result = disk_space_for_path(Path::new("this-directory-should-not-exist-fileforge"));
        assert!(result.is_err());
    }

    #[test]
    fn disk_space_returns_sensible_values_for_temp_directory() {
        let temp = tempfile::tempdir().expect("temp directory");
        let result = disk_space_for_path(temp.path()).expect("disk space");
        assert!(result.total_bytes > 0);
        assert!(result.total_bytes >= result.free_bytes);
    }
}

