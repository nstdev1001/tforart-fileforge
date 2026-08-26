use std::{
    io::ErrorKind,
    path::{Path, PathBuf},
};

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenFolderError {
    code: &'static str,
    message: String,
}

impl OpenFolderError {
    fn from_io(context: String, error: std::io::Error) -> Self {
        Self {
            code: if error.kind() == ErrorKind::NotFound {
                "folder_not_found"
            } else {
                "open_failed"
            },
            message: format!("{context}: {error}"),
        }
    }

    fn not_a_directory(path: &Path) -> Self {
        Self {
            code: "not_a_directory",
            message: format!("'{}' is not a directory", path.display()),
        }
    }

    fn open_failed(message: String) -> Self {
        Self {
            code: "open_failed",
            message,
        }
    }
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

/// Opens an existing local folder in the native file manager.
#[tauri::command]
pub async fn open_folder(path: String) -> Result<(), OpenFolderError> {
    let canonical_path = folder_path_to_open(Path::new(&path))?;

    tauri::async_runtime::spawn_blocking(move || open::that(canonical_path))
        .await
        .map_err(|error| {
            OpenFolderError::open_failed(format!("folder opener task failed: {error}"))
        })?
        .map_err(|error| OpenFolderError::from_io("could not open folder".to_owned(), error))
}

/// Returns total and free bytes for the volume containing `path`.
#[tauri::command]
pub fn get_disk_free_space(path: String) -> Result<DiskSpace, String> {
    disk_space_for_path(Path::new(&path))
}

fn disk_space_for_path(path: &Path) -> Result<DiskSpace, String> {
    let canonical_path = canonical_folder_path(path)?;

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

fn canonical_folder_path(path: &Path) -> Result<PathBuf, String> {
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("cannot access '{}': {error}", path.display()))?;

    if !canonical_path.is_dir() {
        return Err(format!("'{}' is not a directory", canonical_path.display()));
    }

    Ok(canonical_path)
}

fn folder_path_to_open(path: &Path) -> Result<PathBuf, OpenFolderError> {
    let canonical_path = path.canonicalize().map_err(|error| {
        OpenFolderError::from_io(format!("cannot access '{}'", path.display()), error)
    })?;

    if !canonical_path.is_dir() {
        return Err(OpenFolderError::not_a_directory(&canonical_path));
    }

    Ok(canonical_path)
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

    #[test]
    fn canonical_folder_path_rejects_files() {
        let file = tempfile::NamedTempFile::new().expect("temporary file");
        let result = canonical_folder_path(file.path());

        assert!(result.is_err_and(|error| error.contains("is not a directory")));
    }

    #[test]
    fn folder_path_to_open_classifies_missing_folders() {
        let result = folder_path_to_open(Path::new(
            "this-directory-should-not-exist-fileforge-open-folder",
        ));

        assert_eq!(
            result.expect_err("missing folder should fail").code,
            "folder_not_found"
        );
    }

    #[test]
    fn folder_path_to_open_rejects_files_with_a_stable_code() {
        let file = tempfile::NamedTempFile::new().expect("temporary file");
        let result = folder_path_to_open(file.path());

        assert_eq!(
            result.expect_err("file should fail").code,
            "not_a_directory"
        );
    }
}
