use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant, SystemTime},
};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{mpsc, Notify, RwLock};
use uuid::Uuid;

use crate::{
    database::{Database, WatcherRecord},
    google::GoogleService,
    task_engine,
};

const DEFAULT_AUTO_STOP_SECONDS: u64 = 30;
const MIN_SETTLING_DELAY_MS: u64 = 1_000;
const MAX_SETTLING_DELAY_MS: u64 = 10_000;
const GOOGLE_FOLDER_MIME_TYPE: &str = "application/vnd.google-apps.folder";

pub struct WatcherService {
    controls: RwLock<HashMap<String, Arc<WatcherControl>>>,
}

impl WatcherService {
    pub fn new() -> Self {
        Self {
            controls: RwLock::new(HashMap::new()),
        }
    }
}

struct WatcherControl {
    stop: AtomicBool,
    notify: Notify,
}

impl WatcherControl {
    fn new() -> Self {
        Self {
            stop: AtomicBool::new(false),
            notify: Notify::new(),
        }
    }

    fn stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
        self.notify.notify_waiters();
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWatcherRequest {
    name: String,
    local_path: String,
    drive_folder_id: String,
    settling_delay_ms: u64,
    include_extensions: Vec<String>,
}

#[derive(Clone)]
struct WatcherConfig {
    id: String,
    local_path: PathBuf,
    drive_folder_id: String,
    settling_delay: Duration,
    include_extensions: HashSet<String>,
    auto_stop: Duration,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct FileSignature {
    size: u64,
    modified: Option<SystemTime>,
}

struct Candidate {
    signature: Option<FileSignature>,
    unchanged_since: Instant,
}

#[tauri::command]
pub fn list_watchers(database: State<'_, Database>) -> Result<Vec<WatcherRecord>, String> {
    database.list_watchers().map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn create_watcher(
    request: CreateWatcherRequest,
    app: AppHandle,
    database: State<'_, Database>,
    google: State<'_, GoogleService>,
    service: State<'_, WatcherService>,
) -> Result<WatcherRecord, String> {
    validate_settling_delay(request.settling_delay_ms)?;
    let local_path = PathBuf::from(request.local_path.trim())
        .canonicalize()
        .map_err(|error| format!("cannot access watch folder: {error}"))?;
    if !local_path.is_dir() {
        return Err("watch path must be a folder".to_owned());
    }
    let extensions = normalize_extensions(request.include_extensions)?;
    let drive_folder_id = request.drive_folder_id.trim().to_owned();
    let folder = google.metadata(drive_folder_id.clone()).await?;
    if folder.mime_type != GOOGLE_FOLDER_MIME_TYPE || folder.trashed {
        return Err("Google Drive destination must be an active folder".to_owned());
    }

    let id = Uuid::new_v4().to_string();
    let name = if request.name.trim().is_empty() {
        local_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Watch folder")
            .to_owned()
    } else {
        request.name.trim().to_owned()
    };
    database
        .create_watcher(
            &id,
            &name,
            &local_path.to_string_lossy(),
            &drive_folder_id,
            request.settling_delay_ms,
            &extensions,
            DEFAULT_AUTO_STOP_SECONDS,
        )
        .map_err(|error| error.to_string())?;

    let record = find_watcher(&database, &id)?;
    launch_watcher(&app, &service, watcher_config(&record)?).await?;
    emit_watcher(&app, &id);
    Ok(record)
}

#[tauri::command]
pub async fn stop_watcher(
    watcher_id: String,
    service: State<'_, WatcherService>,
) -> Result<(), String> {
    let control = service
        .controls
        .read()
        .await
        .get(&watcher_id)
        .cloned()
        .ok_or_else(|| "watcher is not active".to_owned())?;
    control.stop();
    Ok(())
}

#[tauri::command]
pub async fn restart_watcher(
    watcher_id: String,
    app: AppHandle,
    database: State<'_, Database>,
    service: State<'_, WatcherService>,
) -> Result<WatcherRecord, String> {
    if service.controls.read().await.contains_key(&watcher_id) {
        return Err("watcher is already active".to_owned());
    }
    let record = find_watcher(&database, &watcher_id)?;
    database
        .update_watcher_state(&watcher_id, true, "watching", 0, 0, 0, None, None, true)
        .map_err(|error| error.to_string())?;
    launch_watcher(&app, &service, watcher_config(&record)?).await?;
    emit_watcher(&app, &watcher_id);
    find_watcher(&database, &watcher_id)
}

#[tauri::command]
pub async fn delete_watcher(
    watcher_id: String,
    database: State<'_, Database>,
    service: State<'_, WatcherService>,
) -> Result<(), String> {
    if service.controls.read().await.contains_key(&watcher_id) {
        return Err("stop the watcher before deleting it".to_owned());
    }
    database
        .delete_watcher(&watcher_id)
        .map_err(|error| error.to_string())
}

pub async fn restore_enabled_watchers(app: AppHandle) {
    let records = match app.state::<Database>().list_enabled_watchers() {
        Ok(records) => records,
        Err(error) => {
            eprintln!("FileForge could not restore watchers: {error}");
            return;
        }
    };
    for record in records {
        let id = record.id.clone();
        let config = match watcher_config(&record) {
            Ok(config) => config,
            Err(error) => {
                fail_watcher(&app, &id, &error);
                continue;
            }
        };
        let service = app.state::<WatcherService>();
        if let Err(error) = launch_watcher(&app, &service, config).await {
            fail_watcher(&app, &id, &error);
        }
    }
}

async fn launch_watcher(
    app: &AppHandle,
    service: &WatcherService,
    config: WatcherConfig,
) -> Result<(), String> {
    if !config.local_path.is_dir() {
        return Err("watch folder no longer exists".to_owned());
    }
    let control = Arc::new(WatcherControl::new());
    service
        .controls
        .write()
        .await
        .insert(config.id.clone(), control.clone());
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let id = config.id.clone();
        if let Err(error) = run_watcher(&app, config, control).await {
            fail_watcher(&app, &id, &error);
        }
        app.state::<WatcherService>()
            .controls
            .write()
            .await
            .remove(&id);
    });
    Ok(())
}

async fn run_watcher(
    app: &AppHandle,
    config: WatcherConfig,
    control: Arc<WatcherControl>,
) -> Result<(), String> {
    let (event_tx, mut event_rx) = mpsc::unbounded_channel();
    let mut native: RecommendedWatcher =
        notify::recommended_watcher(move |result: notify::Result<Event>| {
            let _ = event_tx.send(result);
        })
        .map_err(|error| format!("cannot initialize native watcher: {error}"))?;
    native
        .watch(&config.local_path, RecursiveMode::Recursive)
        .map_err(|error| format!("cannot watch folder: {error}"))?;

    app.state::<Database>()
        .update_watcher_state(&config.id, true, "watching", 0, 0, 0, None, None, true)
        .map_err(|error| error.to_string())?;
    emit_watcher(app, &config.id);

    let mut candidates = HashMap::<PathBuf, Candidate>::new();
    let mut dispatched = HashSet::<PathBuf>::new();
    let mut last_file_event = Instant::now();
    let mut stability_tick = tokio::time::interval(Duration::from_millis(250));

    loop {
        let stop_notified = control.notify.notified();
        tokio::pin!(stop_notified);
        stop_notified.as_mut().enable();
        if control.stop.load(Ordering::SeqCst) {
            break;
        }
        tokio::select! {
            _ = &mut stop_notified => break,
            event = event_rx.recv() => {
                match event {
                    Some(Ok(event)) if is_file_event(&event.kind) => {
                        for path in event.paths {
                            if is_included_file(&path, &config.include_extensions)
                                && !dispatched.contains(&path)
                            {
                                let now = Instant::now();
                                candidates.insert(path, Candidate {
                                    signature: None,
                                    unchanged_since: now,
                                });
                                last_file_event = now;
                            }
                        }
                    }
                    Some(Err(error)) => return Err(format!("native watcher error: {error}")),
                    None => return Err("native watcher event channel closed".to_owned()),
                    _ => {}
                }
            }
            _ = stability_tick.tick() => {
                let now = Instant::now();
                let mut stable = Vec::new();
                candidates.retain(|path, candidate| {
                    match file_signature(path) {
                        Ok(signature) => {
                            if candidate.signature != Some(signature) {
                                candidate.signature = Some(signature);
                                candidate.unchanged_since = now;
                            } else if now.duration_since(candidate.unchanged_since) >= config.settling_delay {
                                stable.push(path.clone());
                                return false;
                            }
                            true
                        }
                        Err(_) if !path.exists() => false,
                        Err(_) => true,
                    }
                });
                for path in stable {
                    dispatched.insert(path.clone());
                    app.state::<Database>()
                        .update_watcher_state(&config.id, true, "watching", 1, 0, 0, None, None, true)
                        .map_err(|error| error.to_string())?;
                    emit_watcher(app, &config.id);
                    if let Err(error) = task_engine::enqueue_watch_upload(
                        app.clone(),
                        config.id.clone(),
                        path,
                        config.drive_folder_id.clone(),
                    ).await {
                        app.state::<Database>()
                            .update_watcher_state(&config.id, true, "watching", 0, 0, 1, None, Some(&error), false)
                            .map_err(|database_error| database_error.to_string())?;
                        emit_watcher(app, &config.id);
                    }
                }
                if now.duration_since(last_file_event) >= config.auto_stop {
                    break;
                }
            }
        }
    }

    drop(native);
    app.state::<Database>()
        .update_watcher_state(&config.id, true, "draining", 0, 0, 0, None, None, false)
        .map_err(|error| error.to_string())?;
    emit_watcher(app, &config.id);
    loop {
        let active = app
            .state::<Database>()
            .count_active_watch_uploads(&config.id)
            .map_err(|error| error.to_string())?;
        if active == 0 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    let google = app.state::<GoogleService>();
    google.make_file_public(&config.drive_folder_id).await?;
    let metadata = google.metadata(config.drive_folder_id.clone()).await?;
    let existing_error = find_watcher(&app.state::<Database>(), &config.id)
        .ok()
        .and_then(|watcher| watcher.error_message);
    app.state::<Database>()
        .update_watcher_state(
            &config.id,
            false,
            "stopped",
            0,
            0,
            0,
            metadata.web_view_link.as_deref(),
            existing_error.as_deref(),
            false,
        )
        .map_err(|error| error.to_string())?;
    emit_watcher(app, &config.id);
    Ok(())
}

fn watcher_config(record: &WatcherRecord) -> Result<WatcherConfig, String> {
    validate_settling_delay(record.settling_delay_ms)?;
    let drive_folder_id = record
        .drive_folder_id
        .clone()
        .ok_or_else(|| "watcher has no Drive folder ID".to_owned())?;
    Ok(WatcherConfig {
        id: record.id.clone(),
        local_path: PathBuf::from(&record.local_path),
        drive_folder_id,
        settling_delay: Duration::from_millis(record.settling_delay_ms),
        include_extensions: normalize_extensions(record.include_extensions.clone())?
            .into_iter()
            .collect(),
        auto_stop: Duration::from_secs(record.auto_stop_seconds.max(1)),
    })
}

fn normalize_extensions(values: Vec<String>) -> Result<Vec<String>, String> {
    let mut extensions: Vec<String> = values
        .into_iter()
        .map(|value| value.trim().trim_start_matches('.').to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .collect();
    extensions.sort();
    extensions.dedup();
    if extensions.is_empty() {
        return Err("include at least one file extension".to_owned());
    }
    if extensions.iter().any(|value| {
        value.len() > 16
            || !value
                .chars()
                .all(|character| character.is_ascii_alphanumeric())
    }) {
        return Err("file extensions may only contain letters and numbers".to_owned());
    }
    Ok(extensions)
}

fn validate_settling_delay(value: u64) -> Result<(), String> {
    (MIN_SETTLING_DELAY_MS..=MAX_SETTLING_DELAY_MS)
        .contains(&value)
        .then_some(())
        .ok_or_else(|| "settling delay must be between 1 and 10 seconds".to_owned())
}

fn is_file_event(kind: &EventKind) -> bool {
    matches!(kind, EventKind::Create(_) | EventKind::Modify(_))
}

fn is_included_file(path: &Path, extensions: &HashSet<String>) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .filter(|value| !matches!(value.as_str(), "tmp" | "part"))
        .is_some_and(|value| extensions.contains(&value))
}

fn file_signature(path: &Path) -> std::io::Result<FileSignature> {
    let metadata = std::fs::metadata(path)?;
    if !metadata.is_file() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "watched path is not a file",
        ));
    }
    Ok(FileSignature {
        size: metadata.len(),
        modified: metadata.modified().ok(),
    })
}

fn find_watcher(database: &Database, id: &str) -> Result<WatcherRecord, String> {
    database
        .list_watchers()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|watcher| watcher.id == id)
        .ok_or_else(|| "watcher was not found".to_owned())
}

fn emit_watcher(app: &AppHandle, id: &str) {
    if let Ok(record) = find_watcher(&app.state::<Database>(), id) {
        let _ = app.emit("watcher-progress", record);
    }
}

fn fail_watcher(app: &AppHandle, id: &str, error: &str) {
    let _ = app.state::<Database>().update_watcher_state(
        id,
        false,
        "failed",
        0,
        0,
        0,
        None,
        Some(error),
        false,
    );
    emit_watcher(app, id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extension_filter_is_case_insensitive_and_blocks_temporary_files() {
        let allowed = HashSet::from(["jpg".to_owned(), "mp4".to_owned()]);
        let directory = tempfile::tempdir().expect("temporary folder");
        let jpg = directory.path().join("render.JPG");
        let temporary = directory.path().join("render.part");
        std::fs::write(&jpg, b"image").expect("write image");
        std::fs::write(&temporary, b"partial").expect("write partial");
        assert!(is_included_file(&jpg, &allowed));
        assert!(!is_included_file(&temporary, &allowed));
    }

    #[test]
    fn extensions_are_normalized_and_validated() {
        assert_eq!(
            normalize_extensions(vec![".JPG".to_owned(), "jpg".to_owned(), "MP4".to_owned()])
                .expect("valid extensions"),
            vec!["jpg".to_owned(), "mp4".to_owned()]
        );
        assert!(normalize_extensions(vec!["*.jpg".to_owned()]).is_err());
        assert!(normalize_extensions(Vec::new()).is_err());
    }

    #[test]
    fn settling_delay_is_limited_to_phase_six_range() {
        assert!(validate_settling_delay(1_000).is_ok());
        assert!(validate_settling_delay(10_000).is_ok());
        assert!(validate_settling_delay(999).is_err());
        assert!(validate_settling_delay(10_001).is_err());
    }

    #[test]
    fn file_signature_changes_when_a_render_grows() {
        let directory = tempfile::tempdir().expect("temporary folder");
        let path = directory.path().join("render.mp4");
        std::fs::write(&path, b"first").expect("write first version");
        let first = file_signature(&path).expect("first signature");
        std::fs::write(&path, b"first-second").expect("grow file");
        let second = file_signature(&path).expect("second signature");
        assert_ne!(first.size, second.size);
    }
}
