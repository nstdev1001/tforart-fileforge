use std::{
    path::{Component, Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex as StdMutex},
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
const SEVEN_ZIP_DOWNLOAD_URL: &str = "https://www.7-zip.org/download.html";

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

#[derive(Clone, Debug)]
pub struct ArchiveInfo {
    pub uncompressed_bytes: u64,
    pub entries: usize,
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
    map_get_status(status(&database).await)
}

#[tauri::command]
pub async fn open_7zip_download_page() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| open::that(SEVEN_ZIP_DOWNLOAD_URL))
        .await
        .map_err(|error| format!("7-Zip download page opener failed: {error}"))?
        .map_err(|error| format!("could not open the 7-Zip download page: {error}"))
}

#[tauri::command]
pub async fn set_7zip_path(
    path: String,
    database: State<'_, Database>,
) -> Result<SevenZipStatus, String> {
    let executable =
        validate_executable(Path::new(path.trim())).map_err(|error| error.to_string())?;
    let version = read_version(&executable)
        .await
        .map_err(|error| format!("could not verify configured 7z.exe: {error}"))?;
    database
        .set_setting(SEVEN_ZIP_SETTING, &executable.to_string_lossy())
        .map_err(|error| error.to_string())?;
    Ok(SevenZipStatus {
        available: true,
        path: Some(executable.to_string_lossy().into_owned()),
        version: Some(version),
        source: Some("settings".to_owned()),
    })
}

pub async fn status(database: &Database) -> Result<SevenZipStatus, SevenZipError> {
    let (path, source) = resolve_executable(database)?;
    let version = read_version(&path).await?;
    Ok(SevenZipStatus {
        available: true,
        path: Some(path.to_string_lossy().into_owned()),
        version: Some(version),
        source: Some(source),
    })
}

fn map_get_status(result: Result<SevenZipStatus, SevenZipError>) -> Result<SevenZipStatus, String> {
    match result {
        Ok(status) => Ok(status),
        Err(SevenZipError::NotFound) => Ok(SevenZipStatus {
            available: false,
            path: None,
            version: None,
            source: None,
        }),
        Err(error) => Err(error.to_string()),
    }
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

    let report_progress = monotonic_progress_callback(on_progress);
    let stdout_reader = read_progress_stream(stdout, report_progress.clone());
    let stderr_reader = read_progress_stream(stderr, report_progress.clone());
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

    report_progress(100);
    Ok(())
}

pub async fn inspect_archive(
    executable: &Path,
    archive: &Path,
) -> Result<ArchiveInfo, SevenZipError> {
    let mut command = Command::new(executable);
    command
        .arg("l")
        .arg("-slt")
        .arg("-ba")
        .arg(archive)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_no_window(&mut command);
    let output = command.output().await?;
    if !output.status.success() {
        return Err(SevenZipError::Compression(
            String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        ));
    }
    parse_archive_listing(&String::from_utf8_lossy(&output.stdout))
}

pub async fn extract_archive(
    executable: &Path,
    archive: &Path,
    destination: &Path,
    on_progress: Arc<dyn Fn(u8) + Send + Sync>,
) -> Result<(), SevenZipError> {
    let mut command = Command::new(executable);
    command
        .arg("x")
        .arg(archive)
        .arg(format!("-o{}", destination.display()))
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
    let report_progress = monotonic_progress_callback(on_progress);
    let ((stdout_result, stdout_text), (stderr_result, stderr_text)) = tokio::join!(
        read_progress_stream(stdout, report_progress.clone()),
        read_progress_stream(stderr, report_progress.clone())
    );
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
    report_progress(100);
    Ok(())
}

fn parse_archive_listing(listing: &str) -> Result<ArchiveInfo, SevenZipError> {
    let mut uncompressed_bytes = 0_u64;
    let mut entries = 0_usize;
    for line in listing.lines() {
        if let Some(entry) = line.strip_prefix("Path = ") {
            validate_archive_entry(entry.trim())?;
            entries += 1;
        } else if let Some(size) = line.strip_prefix("Size = ") {
            if let Ok(size) = size.trim().parse::<u64>() {
                uncompressed_bytes = uncompressed_bytes.saturating_add(size);
            }
        }
    }
    Ok(ArchiveInfo {
        uncompressed_bytes,
        entries,
    })
}

fn validate_archive_entry(entry: &str) -> Result<(), SevenZipError> {
    let path = Path::new(entry);
    let unsafe_component = path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    });
    if entry.is_empty() || path.is_absolute() || unsafe_component {
        return Err(SevenZipError::Compression(format!(
            "archive contains an unsafe path: {entry}"
        )));
    }
    Ok(())
}

async fn read_progress_stream<R: AsyncRead + Unpin>(
    mut reader: R,
    on_progress: Arc<dyn Fn(u8) + Send + Sync>,
) -> (Result<(), std::io::Error>, String) {
    let mut bytes = [0_u8; 4096];
    let mut output = String::new();
    let mut parser = ProgressParser::default();
    loop {
        match reader.read(&mut bytes).await {
            Ok(0) => {
                if let Some(progress) = parser.finish() {
                    on_progress(progress);
                }
                return (Ok(()), output);
            }
            Ok(read) => {
                let chunk = String::from_utf8_lossy(&bytes[..read]);
                output.push_str(&chunk);
                for progress in parser.push(&chunk) {
                    on_progress(progress);
                }
            }
            Err(error) => return (Err(error), output),
        }
    }
}

#[derive(Default)]
struct ProgressParser {
    state: ProgressParseState,
}

#[derive(Default)]
enum ProgressParseState {
    #[default]
    RecordStart,
    Digits(String),
    AwaitingBoundary(u8),
    IgnoreRecord,
}

impl ProgressParser {
    fn push(&mut self, chunk: &str) -> Vec<u8> {
        let mut values = Vec::new();
        for character in chunk.chars() {
            let is_record_boundary = matches!(character, '\r' | '\n' | '\u{8}');
            let state = std::mem::take(&mut self.state);
            self.state = match state {
                ProgressParseState::RecordStart if is_record_boundary => {
                    ProgressParseState::RecordStart
                }
                ProgressParseState::RecordStart if character.is_ascii_whitespace() => {
                    ProgressParseState::RecordStart
                }
                ProgressParseState::RecordStart if character.is_ascii_digit() => {
                    ProgressParseState::Digits(character.to_string())
                }
                ProgressParseState::RecordStart => ProgressParseState::IgnoreRecord,
                ProgressParseState::Digits(_) if is_record_boundary => {
                    ProgressParseState::RecordStart
                }
                ProgressParseState::Digits(mut digits) if character.is_ascii_digit() => {
                    if digits.len() < 3 {
                        digits.push(character);
                        ProgressParseState::Digits(digits)
                    } else {
                        ProgressParseState::IgnoreRecord
                    }
                }
                ProgressParseState::Digits(digits) if character == '%' => digits
                    .parse::<u8>()
                    .ok()
                    .filter(|value| *value <= 100)
                    .map_or(
                        ProgressParseState::IgnoreRecord,
                        ProgressParseState::AwaitingBoundary,
                    ),
                ProgressParseState::Digits(_) => ProgressParseState::IgnoreRecord,
                ProgressParseState::AwaitingBoundary(value) if is_record_boundary => {
                    values.push(value);
                    ProgressParseState::RecordStart
                }
                ProgressParseState::AwaitingBoundary(value) if character.is_ascii_whitespace() => {
                    values.push(value);
                    ProgressParseState::IgnoreRecord
                }
                ProgressParseState::AwaitingBoundary(_) => ProgressParseState::IgnoreRecord,
                ProgressParseState::IgnoreRecord if is_record_boundary => {
                    ProgressParseState::RecordStart
                }
                ProgressParseState::IgnoreRecord => ProgressParseState::IgnoreRecord,
            };
        }
        values
    }

    fn finish(&mut self) -> Option<u8> {
        match std::mem::take(&mut self.state) {
            ProgressParseState::AwaitingBoundary(value) => Some(value),
            _ => None,
        }
    }
}

fn monotonic_progress_callback(
    on_progress: Arc<dyn Fn(u8) + Send + Sync>,
) -> Arc<dyn Fn(u8) + Send + Sync> {
    let last_progress = Arc::new(StdMutex::new(None::<u8>));
    Arc::new(move |progress| {
        if let Ok(mut last_progress) = last_progress.lock() {
            if last_progress.map_or(true, |previous| progress > previous) {
                *last_progress = Some(progress);
                on_progress(progress);
            }
        }
    })
}

#[cfg(test)]
fn parse_progress_values(output: &str) -> Vec<u8> {
    let mut parser = ProgressParser::default();
    let mut values = parser.push(output);
    values.extend(parser.finish());
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
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        return Err(SevenZipError::Compression(format!(
            "version probe failed{}",
            if detail.is_empty() {
                String::new()
            } else {
                format!(": {detail}")
            }
        )));
    }
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
    fn missing_7zip_maps_to_an_unavailable_status() {
        let status = map_get_status(Err(SevenZipError::NotFound))
            .expect("missing 7-Zip should be a status, not a command error");

        assert!(!status.available);
        assert!(status.path.is_none());
        assert!(status.version.is_none());
        assert!(status.source.is_none());
    }

    #[test]
    fn status_probe_errors_are_not_hidden_as_missing_7zip() {
        let error = map_get_status(Err(SevenZipError::InvalidPath("bad.exe".to_owned())))
            .expect_err("invalid paths should remain actionable errors");

        assert!(error.contains("7z.exe"));
        assert!(error.contains("bad.exe"));
    }

    #[test]
    fn parses_multiple_7zip_progress_updates() {
        assert_eq!(
            parse_progress_values("  1% foo\r 42% bar\u{8}\u{8}100%"),
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

    #[test]
    fn ignores_percentages_embedded_in_archive_paths() {
        assert_eq!(
            parse_progress_values(
                "Extracting archive: C:\\renders\\100%.zip\r\n100%.zip\r\n 1% file\r 42% file"
            ),
            vec![1, 42]
        );
    }

    #[test]
    fn parses_progress_split_across_stream_reads() {
        let mut parser = ProgressParser::default();
        assert_eq!(parser.push(" 1% file\r 4"), vec![1]);
        assert_eq!(parser.push("2% file\r10"), vec![42]);
        assert_eq!(parser.push("0%"), Vec::<u8>::new());
        assert_eq!(parser.finish(), Some(100));
    }

    #[test]
    fn emits_only_monotonic_unique_progress() {
        let values = Arc::new(Mutex::new(Vec::<u8>::new()));
        let captured = values.clone();
        let report_progress = monotonic_progress_callback(Arc::new(move |value| {
            captured.lock().expect("progress lock").push(value);
        }));

        for value in [1, 1, 0, 42, 40, 42, 100, 100] {
            report_progress(value);
        }

        assert_eq!(*values.lock().expect("progress lock"), vec![1, 42, 100]);
    }

    #[cfg(target_os = "windows")]
    #[tokio::test]
    async fn installed_7zip_creates_a_valid_archive() {
        let executable = PathBuf::from(r"C:\Program Files\7-Zip\7z.exe");
        if !executable.is_file() {
            return;
        }

        let version = read_version(&executable)
            .await
            .expect("installed 7-Zip version probe");
        assert!(version.contains("7-Zip"));

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

        let info = inspect_archive(&executable, &archive)
            .await
            .expect("archive inspection");
        assert_eq!(info.entries, 1);
        assert_eq!(info.uncompressed_bytes, 27);

        let extracted = temp.path().join("extracted");
        std::fs::create_dir(&extracted).expect("extraction directory");
        extract_archive(&executable, &archive, &extracted, Arc::new(|_| {}))
            .await
            .expect("7-Zip extraction");
        assert_eq!(
            std::fs::read(extracted.join("hello.txt")).expect("extracted content"),
            b"FileForge 7-Zip integration"
        );
    }

    #[test]
    fn archive_listing_blocks_zip_slip_paths() {
        assert!(parse_archive_listing("Path = safe/file.txt\nSize = 10").is_ok());
        assert!(parse_archive_listing("Path = ../escape.txt\nSize = 10").is_err());
        assert!(parse_archive_listing("Path = C:\\escape.txt\nSize = 10").is_err());
    }
}
