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
use tokio::sync::{mpsc, Mutex, Notify, RwLock};
use uuid::Uuid;

use crate::{
    database::{Database, WatcherRecord},
    desktop,
    google::{DriveError, GoogleService},
    task_engine,
};

const DEFAULT_AUTO_STOP_SECONDS: u64 = 30;
const MIN_SETTLING_DELAY_MS: u64 = 1_000;
const MAX_SETTLING_DELAY_MS: u64 = 10_000;
const GOOGLE_FOLDER_MIME_TYPE: &str = "application/vnd.google-apps.folder";
const FINALIZE_RETRY_INITIAL: Duration = Duration::from_secs(5);
const FINALIZE_RETRY_MAX: Duration = Duration::from_secs(30);

pub struct WatcherService {
    controls: RwLock<HashMap<String, Arc<WatcherControl>>>,
    lifecycle: Mutex<()>,
}

impl WatcherService {
    pub fn new() -> Self {
        Self {
            controls: RwLock::new(HashMap::new()),
            lifecycle: Mutex::new(()),
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
    name: String,
    local_path: PathBuf,
    drive_folder_id: String,
    drive_web_view_link: String,
    settling_delay: Duration,
    include_extensions: HashSet<String>,
    auto_stop: Duration,
    files_failed_at_start: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum LaunchOutcome {
    Started,
    AlreadyActive,
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
pub async fn list_watchers(
    database: State<'_, Database>,
    google: State<'_, GoogleService>,
) -> Result<Vec<WatcherRecord>, String> {
    let records = database
        .list_watchers()
        .map_err(|error| error.to_string())?;
    let needs_backfill = records.iter().any(|record| {
        record
            .drive_folder_name
            .as_deref()
            .map_or(true, |name| name.trim().is_empty())
            && record
                .drive_folder_id
                .as_deref()
                .is_some_and(|id| !id.trim().is_empty())
    });
    if !needs_backfill {
        return Ok(records);
    }

    let _ = tokio::time::timeout(Duration::from_secs(5), async {
        for record in &records {
            if record
                .drive_folder_name
                .as_deref()
                .is_some_and(|name| !name.trim().is_empty())
            {
                continue;
            }
            let Some(drive_folder_id) = record
                .drive_folder_id
                .as_deref()
                .map(str::trim)
                .filter(|id| !id.is_empty())
            else {
                continue;
            };

            let drive_folder_name = if drive_folder_id == "root" {
                "My Drive".to_owned()
            } else {
                let folder = match google.metadata(drive_folder_id.to_owned()).await {
                    Ok(folder)
                        if folder.mime_type == GOOGLE_FOLDER_MIME_TYPE
                            && !folder.trashed
                            && !folder.name.trim().is_empty() =>
                    {
                        folder
                    }
                    Ok(_) | Err(_) => continue,
                };
                folder.name
            };

            if let Err(error) = database.cache_watcher_drive_folder_name(
                &record.id,
                drive_folder_id,
                &drive_folder_name,
            ) {
                eprintln!(
                    "FileForge could not cache the Drive folder name for watcher {}: {error}",
                    record.id
                );
            }
        }
    })
    .await;

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
    let local_path_text = local_path.to_string_lossy().into_owned();
    let extensions = normalize_extensions(request.include_extensions)?;

    // Treat the canonical local path as the watcher identity. Persisted
    // `enabled` is authoritative even before asynchronous startup restoration
    // reserves a runtime control, so retries cannot overwrite a draining run.
    {
        let _lifecycle = service.lifecycle.lock().await;
        if let Some(existing) = database
            .find_watcher_by_local_path(&local_path_text)
            .map_err(|error| error.to_string())?
        {
            if should_return_existing_watcher(
                existing.enabled,
                service.controls.read().await.contains_key(&existing.id),
            ) {
                return Ok(existing);
            }
        }
    }

    let drive_folder_id = request.drive_folder_id.trim().to_owned();
    let folder = google
        .metadata(drive_folder_id.clone())
        .await
        .map_err(|error| error.to_string())?;
    if folder.mime_type != GOOGLE_FOLDER_MIME_TYPE || folder.trashed {
        return Err("Google Drive destination must be an active folder".to_owned());
    }
    let drive_web_view_link = folder_web_view_link(&folder.id, folder.web_view_link.as_deref());

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

    // Google validation can take time, so re-check under the lifecycle lock.
    // A concurrent create/restart may have activated this path while the
    // metadata request was in flight.
    let _lifecycle = service.lifecycle.lock().await;
    if let Some(existing) = database
        .find_watcher_by_local_path(&local_path_text)
        .map_err(|error| error.to_string())?
    {
        if should_return_existing_watcher(
            existing.enabled,
            service.controls.read().await.contains_key(&existing.id),
        ) {
            return Ok(existing);
        }
    }

    let id = database
        .create_or_reconfigure_watcher(
            &id,
            &name,
            &local_path_text,
            &drive_folder_id,
            &folder.name,
            &drive_web_view_link,
            request.settling_delay_ms,
            &extensions,
            DEFAULT_AUTO_STOP_SECONDS,
        )
        .map_err(|error| error.to_string())?;

    let record = find_watcher(&database, &id)?;
    let config = match watcher_config(&record) {
        Ok(config) => config,
        Err(error) => {
            fail_watcher(&app, &id, &error);
            return Err(error);
        }
    };
    if let Err(error) = launch_watcher(&app, &service, config).await {
        fail_watcher(&app, &id, &error);
        return Err(error);
    }
    find_watcher(&database, &id)
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
    let _lifecycle = service.lifecycle.lock().await;
    let record = find_watcher(&database, &watcher_id)?;
    if service.controls.read().await.contains_key(&watcher_id) {
        return Ok(record);
    }
    let config = match watcher_config(&record) {
        Ok(config) => config,
        Err(error) => {
            fail_watcher(&app, &watcher_id, &error);
            return Err(error);
        }
    };
    let launch_result = if should_resume_finalization(&record.status) {
        launch_watcher_finalizer(&app, &service, config).await
    } else {
        launch_watcher(&app, &service, config).await
    };
    if let Err(error) = launch_result {
        fail_watcher(&app, &watcher_id, &error);
        return Err(error);
    }
    find_watcher(&database, &watcher_id)
}

#[tauri::command]
pub async fn delete_watcher(
    watcher_id: String,
    database: State<'_, Database>,
    service: State<'_, WatcherService>,
) -> Result<(), String> {
    let _lifecycle = service.lifecycle.lock().await;
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
        let service = app.state::<WatcherService>();
        let _lifecycle = service.lifecycle.lock().await;
        let current = match find_watcher(&app.state::<Database>(), &id) {
            Ok(record) if record.enabled => record,
            Ok(_) => continue,
            Err(error) => {
                eprintln!("FileForge could not restore watcher {id}: {error}");
                continue;
            }
        };
        if service.controls.read().await.contains_key(&id) {
            continue;
        }
        let config = match watcher_config(&current) {
            Ok(config) => config,
            Err(error) => {
                fail_watcher(&app, &id, &error);
                continue;
            }
        };
        let launch_result = if should_resume_finalization(&current.status) {
            launch_watcher_finalizer(&app, &service, config).await
        } else {
            launch_watcher(&app, &service, config).await
        };
        if let Err(error) = launch_result {
            fail_watcher(&app, &id, &error);
        }
    }
}

async fn launch_watcher(
    app: &AppHandle,
    service: &WatcherService,
    config: WatcherConfig,
) -> Result<LaunchOutcome, String> {
    if !config.local_path.is_dir() {
        return Err("watch folder no longer exists".to_owned());
    }
    let Some(control) = reserve_watcher_control(service, &config.id).await else {
        return Ok(LaunchOutcome::AlreadyActive);
    };

    let (native, event_rx) = match initialize_native_watcher(&config.local_path) {
        Ok(native) => native,
        Err(error) => {
            release_watcher_control(service, &config.id, &control).await;
            return Err(error);
        }
    };
    if let Err(error) = app.state::<Database>().update_watcher_state(
        &config.id,
        true,
        "watching",
        0,
        0,
        0,
        Some(&config.drive_web_view_link),
        None,
        true,
    ) {
        release_watcher_control(service, &config.id, &control).await;
        return Err(error.to_string());
    }
    emit_watcher(app, &config.id);

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let id = config.id.clone();
        let runtime_control = control.clone();
        if let Err(error) = run_watcher(&app, config, runtime_control, native, event_rx).await {
            fail_watcher(&app, &id, &error);
        }
        release_watcher_control(&app.state::<WatcherService>(), &id, &control).await;
    });
    Ok(LaunchOutcome::Started)
}

async fn launch_watcher_finalizer(
    app: &AppHandle,
    service: &WatcherService,
    config: WatcherConfig,
) -> Result<LaunchOutcome, String> {
    let Some(control) = reserve_watcher_control(service, &config.id).await else {
        return Ok(LaunchOutcome::AlreadyActive);
    };

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let id = config.id.clone();
        if let Err(error) = drain_and_finalize_watcher(&app, &config, false).await {
            fail_watcher(&app, &id, &error);
        }
        release_watcher_control(&app.state::<WatcherService>(), &id, &control).await;
    });
    Ok(LaunchOutcome::Started)
}

fn initialize_native_watcher(
    local_path: &Path,
) -> Result<
    (
        RecommendedWatcher,
        mpsc::UnboundedReceiver<notify::Result<Event>>,
    ),
    String,
> {
    let (event_tx, event_rx) = mpsc::unbounded_channel();
    let mut native: RecommendedWatcher =
        notify::recommended_watcher(move |result: notify::Result<Event>| {
            let _ = event_tx.send(result);
        })
        .map_err(|error| format!("cannot initialize native watcher: {error}"))?;
    native
        .watch(local_path, RecursiveMode::Recursive)
        .map_err(|error| format!("cannot watch folder: {error}"))?;
    Ok((native, event_rx))
}

async fn reserve_watcher_control(
    service: &WatcherService,
    id: &str,
) -> Option<Arc<WatcherControl>> {
    let mut controls = service.controls.write().await;
    if controls.contains_key(id) {
        return None;
    }
    let control = Arc::new(WatcherControl::new());
    controls.insert(id.to_owned(), control.clone());
    Some(control)
}

async fn release_watcher_control(
    service: &WatcherService,
    id: &str,
    expected: &Arc<WatcherControl>,
) {
    let mut controls = service.controls.write().await;
    if controls
        .get(id)
        .is_some_and(|current| Arc::ptr_eq(current, expected))
    {
        controls.remove(id);
    }
}

async fn run_watcher(
    app: &AppHandle,
    config: WatcherConfig,
    control: Arc<WatcherControl>,
    native: RecommendedWatcher,
    mut event_rx: mpsc::UnboundedReceiver<notify::Result<Event>>,
) -> Result<(), String> {
    let mut candidates = HashMap::<PathBuf, Candidate>::new();
    let mut dispatched = HashSet::<PathBuf>::new();
    // An export can spend longer than the inactivity window preparing its first
    // output. Start the auto-stop countdown only after a matching file has
    // actually become stable, otherwise an empty watcher reports success before
    // the exporter writes anything.
    let mut last_detected_file = None;
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
                if !stable.is_empty() {
                    last_detected_file = Some(now);
                }
                for path in stable {
                    dispatched.insert(path.clone());
                    if let Err(error) = task_engine::enqueue_watch_upload(
                        app.clone(),
                        config.id.clone(),
                        path,
                        config.drive_folder_id.clone(),
                    ).await {
                        app.state::<Database>()
                            .update_watcher_state(&config.id, true, "watching", 1, 0, 1, None, Some(&error), true)
                            .map_err(|database_error| database_error.to_string())?;
                        emit_watcher(app, &config.id);
                    }
                }
                if should_auto_stop(
                    last_detected_file,
                    !candidates.is_empty(),
                    now,
                    config.auto_stop,
                ) {
                    break;
                }
            }
        }
    }

    drop(native);
    drain_and_finalize_watcher(app, &config, true).await
}

async fn drain_and_finalize_watcher(
    app: &AppHandle,
    config: &WatcherConfig,
    transition_to_draining: bool,
) -> Result<(), String> {
    if transition_to_draining {
        // This transition intentionally leaves counters and error_message
        // untouched so a concurrently settling child cannot be overwritten.
        app.state::<Database>()
            .mark_watcher_draining(&config.id)
            .map_err(|error| error.to_string())?;
        emit_watcher(app, &config.id);
    }
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

    let drive_web_view_link = finalize_drive_folder(&app.state::<GoogleService>(), config).await?;
    let current = find_watcher(&app.state::<Database>(), &config.id)?;
    let files_failed = new_failure_count(current.files_failed, config.files_failed_at_start);
    // `error_message` is cleared when a watcher run starts. It therefore also
    // preserves the result if the app crashes after entering `draining`, when
    // the run's original failure-count baseline is no longer in memory.
    let completed_with_failures = files_failed > 0 || current.error_message.is_some();
    let completion_error = current.error_message.or_else(|| {
        completed_with_failures.then(|| {
            format!(
                "{} watched file{} failed to upload",
                files_failed,
                if files_failed == 1 { "" } else { "s" }
            )
        })
    });
    app.state::<Database>()
        .update_watcher_state(
            &config.id,
            false,
            if completed_with_failures {
                "failed"
            } else {
                "stopped"
            },
            0,
            0,
            0,
            drive_web_view_link.as_deref(),
            completion_error.as_deref(),
            false,
        )
        .map_err(|error| error.to_string())?;
    emit_watcher(app, &config.id);
    desktop::notify_watcher_result(
        app,
        &config.name,
        !completed_with_failures,
        completion_error.as_deref(),
    );
    Ok(())
}

async fn finalize_drive_folder(
    google: &GoogleService,
    config: &WatcherConfig,
) -> Result<Option<String>, String> {
    let mut delay = FINALIZE_RETRY_INITIAL;
    loop {
        let result: Result<Option<String>, DriveError> =
            match google.make_file_public(&config.drive_folder_id).await {
                Ok(()) => google
                    .metadata(config.drive_folder_id.clone())
                    .await
                    .map(|metadata| metadata.web_view_link),
                Err(error) => Err(error),
            };
        match result {
            Ok(link) => return Ok(link),
            Err(error) if error.is_transient_network() => {
                eprintln!(
                    "FileForge watcher {} is waiting to finalize its Drive folder: {error}",
                    config.id
                );
                tokio::time::sleep(delay).await;
                delay = next_finalize_retry(delay);
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

fn next_finalize_retry(current: Duration) -> Duration {
    (current * 2).min(FINALIZE_RETRY_MAX)
}

fn should_resume_finalization(status: &str) -> bool {
    status == "draining"
}

fn should_return_existing_watcher(enabled: bool, has_runtime_control: bool) -> bool {
    enabled || has_runtime_control
}

fn watcher_config(record: &WatcherRecord) -> Result<WatcherConfig, String> {
    validate_settling_delay(record.settling_delay_ms)?;
    let drive_folder_id = record
        .drive_folder_id
        .clone()
        .ok_or_else(|| "watcher has no Drive folder ID".to_owned())?;
    let drive_web_view_link = record
        .drive_web_view_link
        .clone()
        .filter(|link| !link.trim().is_empty())
        .unwrap_or_else(|| folder_web_view_link(&drive_folder_id, None));
    Ok(WatcherConfig {
        id: record.id.clone(),
        name: record.name.clone(),
        local_path: PathBuf::from(&record.local_path),
        drive_folder_id,
        drive_web_view_link,
        settling_delay: Duration::from_millis(record.settling_delay_ms),
        include_extensions: normalize_extensions(record.include_extensions.clone())?
            .into_iter()
            .collect(),
        auto_stop: Duration::from_secs(record.auto_stop_seconds.max(1)),
        files_failed_at_start: record.files_failed,
    })
}

fn folder_web_view_link(folder_id: &str, metadata_link: Option<&str>) -> String {
    metadata_link
        .map(str::trim)
        .filter(|link| !link.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| {
            if folder_id == "root" {
                "https://drive.google.com/drive/my-drive".to_owned()
            } else {
                format!("https://drive.google.com/drive/folders/{folder_id}")
            }
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

fn should_auto_stop(
    last_detected_file: Option<Instant>,
    has_pending_candidates: bool,
    now: Instant,
    inactivity_window: Duration,
) -> bool {
    !has_pending_candidates
        && last_detected_file
            .is_some_and(|last_detected| now.duration_since(last_detected) >= inactivity_window)
}

fn new_failure_count(total: u64, at_start: u64) -> u64 {
    total.saturating_sub(at_start)
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
    let name = find_watcher(&app.state::<Database>(), id)
        .map(|watcher| watcher.name)
        .unwrap_or_else(|_| "Folder watcher".to_owned());
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
    desktop::notify_watcher_result(app, &name, false, Some(error));
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

    #[test]
    fn auto_stop_waits_for_a_detected_file_and_pending_candidates() {
        let detected_at = Instant::now();
        let inactivity_window = Duration::from_secs(30);

        assert!(!should_auto_stop(
            None,
            false,
            detected_at + Duration::from_secs(60),
            inactivity_window,
        ));
        assert!(!should_auto_stop(
            Some(detected_at),
            true,
            detected_at + Duration::from_secs(60),
            inactivity_window,
        ));
        assert!(!should_auto_stop(
            Some(detected_at),
            false,
            detected_at + Duration::from_secs(29),
            inactivity_window,
        ));
        assert!(should_auto_stop(
            Some(detected_at),
            false,
            detected_at + inactivity_window,
            inactivity_window,
        ));
    }

    #[test]
    fn folder_link_is_available_before_watcher_completion() {
        assert_eq!(
            folder_web_view_link(
                "folder-id",
                Some("https://drive.google.com/drive/folders/from-metadata"),
            ),
            "https://drive.google.com/drive/folders/from-metadata"
        );
        assert_eq!(
            folder_web_view_link("folder-id", None),
            "https://drive.google.com/drive/folders/folder-id"
        );
        assert_eq!(
            folder_web_view_link("root", None),
            "https://drive.google.com/drive/my-drive"
        );
    }

    #[test]
    fn earlier_run_failures_do_not_poison_a_clean_restart() {
        assert_eq!(new_failure_count(3, 3), 0);
        assert_eq!(new_failure_count(5, 3), 2);
        assert_eq!(new_failure_count(2, 3), 0);
    }

    #[test]
    fn draining_watchers_resume_only_the_finalization_phase() {
        assert!(should_resume_finalization("draining"));
        assert!(!should_resume_finalization("watching"));
        assert!(!should_resume_finalization("failed"));
    }

    #[test]
    fn persisted_enabled_watcher_is_active_before_runtime_restore_finishes() {
        assert!(should_return_existing_watcher(true, false));
        assert!(should_return_existing_watcher(false, true));
        assert!(!should_return_existing_watcher(false, false));
    }

    #[test]
    fn watcher_finalization_retry_is_bounded() {
        let mut delay = FINALIZE_RETRY_INITIAL;
        delay = next_finalize_retry(delay);
        assert_eq!(delay, Duration::from_secs(10));
        delay = next_finalize_retry(delay);
        assert_eq!(delay, Duration::from_secs(20));
        delay = next_finalize_retry(delay);
        assert_eq!(delay, FINALIZE_RETRY_MAX);
        assert_eq!(next_finalize_retry(delay), FINALIZE_RETRY_MAX);
    }

    #[tokio::test]
    async fn watcher_control_reservation_never_overwrites_a_live_control() {
        let service = WatcherService::new();
        let first = reserve_watcher_control(&service, "watcher-one")
            .await
            .expect("first reservation");
        assert!(reserve_watcher_control(&service, "watcher-one")
            .await
            .is_none());

        let stored = service
            .controls
            .read()
            .await
            .get("watcher-one")
            .cloned()
            .expect("stored control");
        assert!(Arc::ptr_eq(&stored, &first));

        let unrelated = Arc::new(WatcherControl::new());
        release_watcher_control(&service, "watcher-one", &unrelated).await;
        assert!(service.controls.read().await.contains_key("watcher-one"));

        release_watcher_control(&service, "watcher-one", &first).await;
        assert!(!service.controls.read().await.contains_key("watcher-one"));
    }
}
