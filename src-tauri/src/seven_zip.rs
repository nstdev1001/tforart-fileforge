use std::{
    path::{Path, PathBuf},
    process::Stdio,
    sync::Arc,
};

use serde::Serialize;
use tauri::State;
use thiserror::Error;
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::Command,
};
use walkdir::WalkDir;

use crate::database::Database;

const SEVEN_ZIP_SETTING: &str = "seven_zip_path";

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SevenZipStatus {
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub source: Option<String>,
}

#[derive(Debug, Error)]
pub enum SevenZipError {
    #[error("7-Zip was not found. Install 7-Zip or configure 7z.exe in Settings")]
    NotFound,
    #[error("configured 7-Zip path does not point to 7z.exe: {0}")]
    InvalidPath(String),
    #[error("could not start 7-Zip: {0}")]
    Start(#[from] std::io::Error),
    #[error("7-Zip compression failed: {0}")]
    Compression(String),
    #[error("could not inspect source folder: {0}")]
    Source(String),
}

#[tauri::command]
pub async fn get_7zip_status(database: State<'_, Database>) -> Result<SevenZipStatus, String> {
    status(&database).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn set_7zip_path(
    path: String,
    database: State<'_, Database>,
) -> Result<SevenZipStatus, String> {
    let executable =
        validate_executable(Path::new(path.trim())).map_err(|error| error.to_string())?;
    database
        .set_setting(SEVEN_ZIP_SETTING, &executable.to_string_lossy())
        .map_err(|error| error.to_string())?;
    status(&database).await.map_err(|error| error.to_string())
}

pub async fn status(database: &Database) -> Result<SevenZipStatus, SevenZipError> {
    let (path, source) = resolve_executable(database)?;
    let version = read_version(&path).await.ok();
    Ok(SevenZipStatus {
        available: true,
        path: Some(path.to_string_lossy().into_owned()),
        version,
        source: Some(source),
    })
}

pub fn resolve_executable(database: &Database) -> Result<(PathBuf, String), SevenZipError> {
    if let Ok(Some(configured)) = database.get_setting(SEVEN_ZIP_SETTING) {
        if let Ok(path) = validate_executable(Path::new(&configured)) {
            return Ok((path, "settings".to_owned()));
        }
    }

    let standard_paths = [
        PathBuf::from(r"C:\Program Files\7-Zip\7z.exe"),
        PathBuf::from(r"C:\Program Files (x86)\7-Zip\7z.exe"),
    ];
    for candidate in standard_paths {
        if let Ok(path) = validate_executable(&candidate) {
            return Ok((path, "auto-detected".to_owned()));
        }
    }

    if let Some(path) = std::env::var_os("PATH").and_then(|value| {
        std::env::split_paths(&value)
            .map(|directory| directory.join("7z.exe"))
            .find(|candidate| candidate.is_file())
    }) {
        return Ok((path, "path".to_owned()));
    }

    Err(SevenZipError::NotFound)
}

pub async fn folder_size(source: PathBuf) -> Result<u64, SevenZipError> {
    tokio::task::spawn_blocking(move || {
        if !source.is_dir() {
            return Err(SevenZipError::Source(format!(
                "'{}' is not a directory",
                source.display()
            )));
        }

        WalkDir::new(&source)
            .follow_links(false)
            .into_iter()
            .try_fold(0_u64, |total, entry| {
                let entry = entry.map_err(|error| SevenZipError::Source(error.to_string()))?;
                if entry.file_type().is_file() {
                    let length = entry
                        .metadata()
                        .map_err(|error| SevenZipError::Source(error.to_string()))?
                        .len();
                    Ok(total.saturating_add(length))
                } else {
                    Ok(total)
                }
            })
    })
    .await
    .map_err(|error| SevenZipError::Source(error.to_string()))?
}

pub async fn compress_folder(
    executable: &Path,
    source: &Path,
    archive: &Path,
    on_progress: Arc<dyn Fn(u8) + Send + Sync>,
) -> Result<(), SevenZipError> {
    if !source.is_dir() {
        return Err(SevenZipError::Source(format!(
            "'{}' is not a directory",
            source.display()
        )));
    }

    let mut command = Command::new(executable);
    command
        .current_dir(source)
        .arg("a")
        .arg("-tzip")
        .arg(archive)
        .arg(".")
        .arg("-mx=5")
        .arg("-bsp1")
        .arg("-bb0")
        .arg("-y")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_no_window(&mut command);

    let mut child = command.spawn()?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| SevenZipError::Compression("7-Zip stdout was not captured".to_owned()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| SevenZipError::Compression("7-Zip stderr was not captured".to_owned()))?;

    let stdout_reader = read_progress_stream(stdout, on_progress.clone());
    let stderr_reader = read_progress_stream(stderr, on_progress.clone());
    let ((stdout_result, stdout_text), (stderr_result, stderr_text)) =
        tokio::join!(stdout_reader, stderr_reader);
    stdout_result?;
    stderr_result?;

    let exit = child.wait().await?;
    if !exit.success() {
        let detail = if stderr_text.trim().is_empty() {
            stdout_text
        } else {
            stderr_text
        };
        return Err(SevenZipError::Compression(detail.trim().to_owned()));
    }

    on_progress(100);
    Ok(())
}

async fn read_progress_stream<R: AsyncRead + Unpin>(
    mut reader: R,
    on_progress: Arc<dyn Fn(u8) + Send + Sync>,
) -> (Result<(), std::io::Error>, String) {
    let mut bytes = [0_u8; 4096];
    let mut output = String::new();
    loop {
        match reader.read(&mut bytes).await {
            Ok(0) => return (Ok(()), output),
            Ok(read) => {
                let chunk = String::from_utf8_lossy(&bytes[..read]);
                output.push_str(&chunk);
                for progress in parse_progress_values(&chunk) {
                    on_progress(progress);
                }
            }
            Err(error) => return (Err(error), output),
        }
    }
}

fn parse_progress_values(output: &str) -> Vec<u8> {
    let characters: Vec<char> = output.chars().collect();
    let mut values = Vec::new();
    for percent_index in characters
        .iter()
        .enumerate()
        .filter_map(|(index, value)| (*value == '%').then_some(index))
    {
        let mut start = percent_index;
        while start > 0 && characters[start - 1].is_ascii_digit() {
            start -= 1;
        }
        if start < percent_index {
            let value: String = characters[start..percent_index].iter().collect();
            if let Ok(value) = value.parse::<u8>() {
                if value <= 100 {
                    values.push(value);
                }
            }
        }
    }
    values
}

fn validate_executable(path: &Path) -> Result<PathBuf, SevenZipError> {
    let valid_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("7z.exe"));
    if !path.is_file() || !valid_name {
        return Err(SevenZipError::InvalidPath(path.display().to_string()));
    }
    path.canonicalize()
        .map_err(|_| SevenZipError::InvalidPath(path.display().to_string()))
}

async fn read_version(executable: &Path) -> Result<String, SevenZipError> {
    let mut command = Command::new(executable);
    command.arg("i").stdin(Stdio::null());
    configure_no_window(&mut command);
    let output = command.output().await?;
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .find(|line| line.contains("7-Zip"))
        .map(str::trim)
        .map(str::to_owned)
        .ok_or_else(|| SevenZipError::Compression("could not read 7-Zip version".to_owned()))
}

fn configure_no_window(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn parses_multiple_7zip_progress_updates() {
        assert_eq!(
            parse_progress_values("  1% foo\r 42% bar\r100%"),
            vec![1, 42, 100]
        );
    }

    #[test]
    fn ignores_invalid_percent_values() {
        assert_eq!(
            parse_progress_values("999% and x% and 20"),
            Vec::<u8>::new()
        );
    }

    #[cfg(target_os = "windows")]
    #[tokio::test]
    async fn installed_7zip_creates_a_valid_archive() {
        let executable = PathBuf::from(r"C:\Program Files\7-Zip\7z.exe");
        if !executable.is_file() {
            return;
        }

        let temp = tempfile::tempdir().expect("temporary test directory");
        let source = temp.path().join("source");
        std::fs::create_dir(&source).expect("source directory");
        std::fs::write(source.join("hello.txt"), b"FileForge 7-Zip integration")
            .expect("test input");
        let archive = temp.path().join("output.zip");
        let progress = Arc::new(Mutex::new(Vec::<u8>::new()));
        let captured = progress.clone();

        compress_folder(
            &executable,
            &source,
            &archive,
            Arc::new(move |value| captured.lock().expect("progress lock").push(value)),
        )
        .await
        .expect("7-Zip compression");

        assert!(archive.is_file());
        assert!(archive.metadata().expect("archive metadata").len() > 0);
        assert!(progress.lock().expect("progress lock").contains(&100));
    }
}
