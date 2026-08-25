use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex as StdMutex,
    },
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{Notify, RwLock};
use uuid::Uuid;

use crate::{
    database::{Database, LogRecord, RecoverableTask, TaskRecord, TaskUpdate},
    desktop,
    google::{parse_drive_file_id, DownloadEvent, DriveError, GoogleService, UploadEvent},
    seven_zip,
};

const TEMP_SPACE_SAFETY_BYTES: u64 = 64 * 1024 * 1024;
const MIN_CONCURRENCY: usize = 1;
const MAX_CONCURRENCY: usize = 10;
const NETWORK_RECHECK_INITIAL: Duration = Duration::from_secs(5);
const NETWORK_RECHECK_MAX: Duration = Duration::from_secs(30);

pub struct PauseGate {
    paused: AtomicBool,
    notify: Notify,
}

impl PauseGate {
    fn new() -> Self {
        Self {
            paused: AtomicBool::new(false),
            notify: Notify::new(),
        }
    }

    fn new_paused() -> Self {
        Self {
            paused: AtomicBool::new(true),
            notify: Notify::new(),
        }
    }

    fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
    }

    fn resume(&self) {
        self.paused.store(false, Ordering::SeqCst);
        self.notify.notify_waiters();
    }

    fn is_paused(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }

    pub async fn wait(&self) {
        loop {
            let notified = self.notify.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if !self.paused.load(Ordering::SeqCst) {
                return;
            }
            notified.await;
        }
    }
}

struct TaskRuntime {
    record: TaskRecord,
    archive_path: Option<String>,
    session_uri: Option<String>,
}

struct TaskControl {
    gate: Arc<PauseGate>,
    runtime: Arc<StdMutex<TaskRuntime>>,
}

pub struct TaskEngine {
    controls: RwLock<HashMap<String, Arc<TaskControl>>>,
    pool: Arc<WorkerPool>,
    globally_paused: AtomicBool,
    network_waiters_changed: Notify,
}

impl TaskEngine {
    pub fn new(limit: usize) -> Self {
        Self {
            controls: RwLock::new(HashMap::new()),
            pool: Arc::new(WorkerPool::new(limit)),
            globally_paused: AtomicBool::new(false),
            network_waiters_changed: Notify::new(),
        }
    }
}

#[derive(Debug)]
enum WorkflowError {
    TransientNetwork(String),
    Fatal(String),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum NetworkParkState {
    Waiting,
    Paused,
}

impl WorkflowError {
    fn message(&self) -> &str {
        match self {
            Self::TransientNetwork(message) | Self::Fatal(message) => message,
        }
    }

    fn is_transient_network(&self) -> bool {
        matches!(self, Self::TransientNetwork(_))
    }
}

impl From<String> for WorkflowError {
    fn from(error: String) -> Self {
        Self::Fatal(error)
    }
}

impl From<&str> for WorkflowError {
    fn from(error: &str) -> Self {
        Self::Fatal(error.to_owned())
    }
}

impl From<DriveError> for WorkflowError {
    fn from(error: DriveError) -> Self {
        if error.is_transient_network() {
            Self::TransientNetwork(error.to_string())
        } else {
            Self::Fatal(error.to_string())
        }
    }
}

struct WorkerPool {
    limit: AtomicUsize,
    active: AtomicUsize,
    notify: Notify,
}

impl WorkerPool {
    fn new(limit: usize) -> Self {
        Self {
            limit: AtomicUsize::new(clamp_concurrency(limit)),
            active: AtomicUsize::new(0),
            notify: Notify::new(),
        }
    }

    fn limit(&self) -> usize {
        self.limit.load(Ordering::SeqCst)
    }

    fn active(&self) -> usize {
        self.active.load(Ordering::SeqCst)
    }

    fn set_limit(&self, limit: usize) {
        self.limit.store(clamp_concurrency(limit), Ordering::SeqCst);
        self.notify.notify_waiters();
    }

    async fn acquire(self: &Arc<Self>) -> WorkerPermit {
        loop {
            let notified = self.notify.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            let active = self.active.load(Ordering::SeqCst);
            if active < self.limit.load(Ordering::SeqCst)
                && self
                    .active
                    .compare_exchange(active, active + 1, Ordering::SeqCst, Ordering::SeqCst)
                    .is_ok()
            {
                return WorkerPermit { pool: self.clone() };
            }
            notified.await;
        }
    }
}

struct WorkerPermit {
    pool: Arc<WorkerPool>,
}

impl Drop for WorkerPermit {
    fn drop(&mut self) {
        self.pool.active.fetch_sub(1, Ordering::SeqCst);
        self.pool.notify.notify_waiters();
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerPoolConfig {
    concurrent_tasks: usize,
    active_tasks: usize,
}

fn clamp_concurrency(value: usize) -> usize {
    value.clamp(MIN_CONCURRENCY, MAX_CONCURRENCY)
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartCompressUploadRequest {
    source_path: String,
    drive_folder_id: String,
    archive_name: Option<String>,
    make_public: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartDownloadExtractRequest {
    drive_link_or_id: String,
    destination_path: String,
    create_subfolder: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchUploadOptions {
    watcher_id: String,
    upload_name: String,
    drive_folder_id: String,
    mime_type: String,
}

#[tauri::command]
pub fn list_tasks(database: State<'_, Database>) -> Result<Vec<TaskRecord>, String> {
    database
        .list_public_tasks()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_task_logs(
    task_id: String,
    database: State<'_, Database>,
) -> Result<Vec<LogRecord>, String> {
    database
        .list_task_logs(&task_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_worker_pool_config(engine: State<'_, TaskEngine>) -> WorkerPoolConfig {
    WorkerPoolConfig {
        concurrent_tasks: engine.pool.limit(),
        active_tasks: engine.pool.active(),
    }
}

#[tauri::command]
pub fn set_worker_pool_config(
    concurrent_tasks: usize,
    database: State<'_, Database>,
    engine: State<'_, TaskEngine>,
) -> Result<WorkerPoolConfig, String> {
    if !(MIN_CONCURRENCY..=MAX_CONCURRENCY).contains(&concurrent_tasks) {
        return Err("concurrent tasks must be between 1 and 10".to_owned());
    }
    database
        .set_setting("concurrent_uploads", &concurrent_tasks.to_string())
        .map_err(|error| error.to_string())?;
    engine.pool.set_limit(concurrent_tasks);
    Ok(WorkerPoolConfig {
        concurrent_tasks,
        active_tasks: engine.pool.active(),
    })
}

#[tauri::command]
pub async fn start_compress_upload(
    request: StartCompressUploadRequest,
    app: AppHandle,
    database: State<'_, Database>,
    engine: State<'_, TaskEngine>,
) -> Result<TaskRecord, String> {
    validate_drive_folder_id(&request.drive_folder_id)?;
    let source = PathBuf::from(request.source_path.trim())
        .canonicalize()
        .map_err(|error| format!("cannot access source folder: {error}"))?;
    if !source.is_dir() {
        return Err("source path must be a folder".to_owned());
    }
    let (seven_zip_path, _) =
        seven_zip::resolve_executable(&database).map_err(|error| error.to_string())?;
    let source_bytes = seven_zip::folder_size(source.clone())
        .await
        .map_err(|error| error.to_string())?;

    let temp_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("archives");
    tokio::fs::create_dir_all(&temp_root)
        .await
        .map_err(|error| format!("cannot create archive cache: {error}"))?;
    ensure_temp_space(&temp_root, source_bytes)?;

    let task_id = Uuid::new_v4().to_string();
    let upload_name = sanitize_archive_name(
        request.archive_name.as_deref(),
        source.file_name().and_then(|value| value.to_str()),
    );
    let archive_path = temp_root.join(format!("{task_id}-{upload_name}"));
    let task_name = format!("Compress & upload {upload_name}");
    let options_json = serde_json::to_string(&request)
        .map_err(|error| format!("cannot serialize task options: {error}"))?;

    database
        .create_compress_upload_task(
            &task_id,
            &task_name,
            &source.to_string_lossy(),
            &request.drive_folder_id,
            source_bytes,
            &options_json,
        )
        .map_err(|error| error.to_string())?;
    database
        .append_log(
            &task_id,
            "info",
            "task.created",
            "Compression upload task queued",
        )
        .map_err(|error| error.to_string())?;

    let record = database
        .list_tasks()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|task| task.id == task_id)
        .ok_or_else(|| "created task could not be loaded".to_owned())?;
    let control = Arc::new(TaskControl {
        gate: Arc::new(if engine.globally_paused.load(Ordering::SeqCst) {
            PauseGate::new_paused()
        } else {
            PauseGate::new()
        }),
        runtime: Arc::new(StdMutex::new(TaskRuntime {
            record: record.clone(),
            archive_path: Some(archive_path.to_string_lossy().into_owned()),
            session_uri: None,
        })),
    });
    engine
        .controls
        .write()
        .await
        .insert(task_id.clone(), control.clone());

    let workflow_request = WorkflowRequest {
        source,
        archive_path,
        upload_name,
        drive_folder_id: request.drive_folder_id,
        make_public: request.make_public,
        seven_zip_path,
        source_bytes,
        recovery_stage: None,
        existing_drive_file_id: None,
        existing_session_uri: None,
    };
    tauri::async_runtime::spawn(run_workflow(
        app,
        task_id,
        control,
        workflow_request,
        engine.pool.clone(),
    ));

    Ok(record)
}

#[tauri::command]
pub async fn start_download_extract(
    request: StartDownloadExtractRequest,
    app: AppHandle,
    database: State<'_, Database>,
    engine: State<'_, TaskEngine>,
    google: State<'_, GoogleService>,
) -> Result<TaskRecord, String> {
    let file_id =
        parse_drive_file_id(&request.drive_link_or_id).map_err(|error| error.to_string())?;
    let metadata = google
        .metadata(file_id.clone())
        .await
        .map_err(|error| error.to_string())?;
    let is_zip = metadata.mime_type.eq_ignore_ascii_case("application/zip")
        || metadata.name.to_ascii_lowercase().ends_with(".zip");
    if !is_zip {
        return Err(format!(
            "Google Drive file '{}' is not a ZIP archive",
            metadata.name
        ));
    }
    if metadata
        .capabilities
        .as_ref()
        .and_then(|capabilities| capabilities.can_download)
        == Some(false)
    {
        return Err("Google Drive permissions prohibit downloading this file".to_owned());
    }
    let compressed_bytes = metadata
        .size
        .as_deref()
        .ok_or_else(|| "Google Drive metadata does not include the ZIP size".to_owned())?
        .parse::<u64>()
        .map_err(|_| "Google Drive returned an invalid ZIP size".to_owned())?;

    let selected_destination = PathBuf::from(request.destination_path.trim())
        .canonicalize()
        .map_err(|error| format!("cannot access destination folder: {error}"))?;
    if !selected_destination.is_dir() {
        return Err("destination path must be a folder".to_owned());
    }
    let extraction_destination = if request.create_subfolder {
        unique_destination_path(
            &selected_destination,
            &sanitize_directory_name(
                Path::new(&metadata.name)
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .unwrap_or("extracted"),
            ),
        )
    } else {
        selected_destination
    };
    let (seven_zip_path, _) =
        seven_zip::resolve_executable(&database).map_err(|error| error.to_string())?;

    let temp_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("downloads");
    tokio::fs::create_dir_all(&temp_root)
        .await
        .map_err(|error| format!("cannot create download cache: {error}"))?;
    ensure_download_space(&temp_root, compressed_bytes)?;

    let task_id = Uuid::new_v4().to_string();
    let safe_name = sanitize_archive_name(Some(&metadata.name), None);
    let download_path = temp_root.join(format!("{task_id}-{safe_name}"));
    let task_name = format!("Download & extract {safe_name}");
    let options_json = serde_json::to_string(&request)
        .map_err(|error| format!("cannot serialize task options: {error}"))?;
    database
        .create_download_extract_task(
            &task_id,
            &task_name,
            request.drive_link_or_id.trim(),
            &extraction_destination.to_string_lossy(),
            &file_id,
            compressed_bytes,
            &options_json,
        )
        .map_err(|error| error.to_string())?;
    database
        .append_log(
            &task_id,
            "info",
            "task.created",
            "Download and extract task queued",
        )
        .map_err(|error| error.to_string())?;

    let record = database
        .list_tasks()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|task| task.id == task_id)
        .ok_or_else(|| "created task could not be loaded".to_owned())?;
    let control = Arc::new(TaskControl {
        gate: Arc::new(if engine.globally_paused.load(Ordering::SeqCst) {
            PauseGate::new_paused()
        } else {
            PauseGate::new()
        }),
        runtime: Arc::new(StdMutex::new(TaskRuntime {
            record: record.clone(),
            archive_path: Some(download_path.to_string_lossy().into_owned()),
            session_uri: None,
        })),
    });
    engine
        .controls
        .write()
        .await
        .insert(task_id.clone(), control.clone());

    tauri::async_runtime::spawn(run_download_workflow(
        app,
        task_id,
        control,
        DownloadWorkflowRequest {
            file_id,
            download_path,
            extraction_destination,
            seven_zip_path,
            compressed_bytes: Some(compressed_bytes),
            recovery_stage: None,
            resume_existing: false,
            verify_download_artifact: false,
        },
        engine.pool.clone(),
    ));
    Ok(record)
}

pub async fn enqueue_watch_upload(
    app: AppHandle,
    watcher_id: String,
    source_path: PathBuf,
    drive_folder_id: String,
) -> Result<TaskRecord, String> {
    validate_drive_folder_id(&drive_folder_id)?;
    let source_path = source_path
        .canonicalize()
        .map_err(|error| format!("cannot access detected file: {error}"))?;
    if !source_path.is_file() {
        return Err("detected path is not a file".to_owned());
    }
    let bytes_total = tokio::fs::metadata(&source_path)
        .await
        .map_err(|error| format!("cannot inspect detected file: {error}"))?
        .len();
    let upload_name = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "detected file name is not valid Unicode".to_owned())?
        .to_owned();
    let mime_type = mime_type_for_path(&source_path).to_owned();
    let options = WatchUploadOptions {
        watcher_id: watcher_id.clone(),
        upload_name: upload_name.clone(),
        drive_folder_id: drive_folder_id.clone(),
        mime_type: mime_type.clone(),
    };
    let options_json = serde_json::to_string(&options)
        .map_err(|error| format!("cannot serialize watcher task: {error}"))?;
    let task_id = Uuid::new_v4().to_string();
    let task_name = format!("Auto-upload {upload_name}");
    let database = app.state::<Database>();
    let record = database
        .create_watch_upload_task(
            &task_id,
            &watcher_id,
            &task_name,
            &source_path.to_string_lossy(),
            &drive_folder_id,
            bytes_total,
            &options_json,
        )
        .map_err(|error| error.to_string())?;
    let control = Arc::new(TaskControl {
        gate: Arc::new(
            if app
                .state::<TaskEngine>()
                .globally_paused
                .load(Ordering::SeqCst)
            {
                PauseGate::new_paused()
            } else {
                PauseGate::new()
            },
        ),
        runtime: Arc::new(StdMutex::new(TaskRuntime {
            record: record.clone(),
            archive_path: None,
            session_uri: None,
        })),
    });
    let pool = {
        let engine = app.state::<TaskEngine>();
        engine
            .controls
            .write()
            .await
            .insert(task_id.clone(), control.clone());
        engine.pool.clone()
    };
    emit_watcher_record(&app, &watcher_id);
    tauri::async_runtime::spawn(run_watch_upload_workflow(
        app,
        task_id,
        control,
        WatchWorkflowRequest {
            watcher_id,
            source_path,
            upload_name,
            drive_folder_id,
            mime_type,
            existing_session_uri: None,
        },
        pool,
    ));
    Ok(record)
}

#[tauri::command]
pub async fn pause_task(
    task_id: String,
    app: AppHandle,
    database: State<'_, Database>,
    engine: State<'_, TaskEngine>,
) -> Result<TaskRecord, String> {
    let control = engine
        .controls
        .read()
        .await
        .get(&task_id)
        .cloned()
        .ok_or_else(|| "task is not currently active".to_owned())?;
    {
        let mut runtime = control.runtime.lock().map_err(|_| "task lock poisoned")?;
        if !matches!(runtime.record.status.as_str(), "queued" | "running") {
            return Err("task is not currently running".to_owned());
        }
        control.gate.pause();
        runtime.record.status = "paused".to_owned();
    }
    publish(&app, &control.runtime)?;
    emit_watcher_for_task(&app, &task_id);
    database
        .append_log(&task_id, "info", "task.paused", "Task paused by user")
        .map_err(|error| error.to_string())?;
    snapshot(&control.runtime)
}

#[tauri::command]
pub async fn resume_task(
    task_id: String,
    app: AppHandle,
    database: State<'_, Database>,
    engine: State<'_, TaskEngine>,
) -> Result<TaskRecord, String> {
    if engine.globally_paused.load(Ordering::SeqCst) {
        return Err("all tasks are paused from the system tray".to_owned());
    }
    let control = engine
        .controls
        .read()
        .await
        .get(&task_id)
        .cloned()
        .ok_or_else(|| "task is not currently active".to_owned())?;
    {
        let mut runtime = control.runtime.lock().map_err(|_| "task lock poisoned")?;
        if runtime.record.status != "paused" {
            return Err("task is not paused".to_owned());
        }
        runtime.record.status = if runtime.record.stage == "queued" {
            "queued".to_owned()
        } else {
            "running".to_owned()
        };
    }
    control.gate.resume();
    publish(&app, &control.runtime)?;
    emit_watcher_for_task(&app, &task_id);
    database
        .append_log(&task_id, "info", "task.resumed", "Task resumed by user")
        .map_err(|error| error.to_string())?;
    snapshot(&control.runtime)
}

#[tauri::command]
pub async fn retry_task(
    task_id: String,
    app: AppHandle,
    database: State<'_, Database>,
    engine: State<'_, TaskEngine>,
) -> Result<TaskRecord, String> {
    if engine.controls.read().await.contains_key(&task_id) {
        return Err("task is still active".to_owned());
    }

    let task = database
        .claim_failed_task(&task_id)
        .map_err(|error| error.to_string())?;
    let task_name = task.record.name.clone();
    let watcher_id = task.watcher_id.clone();
    let is_watch_upload = task.task_type == "watch_upload";
    let _ = database.append_log(
        &task_id,
        "info",
        "task.retry_requested",
        "Failed task was queued for retry",
    );

    if let Err(error) = recover_task(&app, task).await {
        handle_recovery_failure(
            &app,
            &task_id,
            &task_name,
            watcher_id.as_deref(),
            is_watch_upload,
            &error,
        )
        .await;
        return Err(error);
    }

    database
        .list_tasks()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find(|record| record.id == task_id)
        .ok_or_else(|| "retried task could not be loaded".to_owned())
}

pub async fn pause_all(app: &AppHandle) -> usize {
    app.state::<TaskEngine>()
        .globally_paused
        .store(true, Ordering::SeqCst);
    let controls: Vec<Arc<TaskControl>> = app
        .state::<TaskEngine>()
        .controls
        .read()
        .await
        .values()
        .cloned()
        .collect();
    let mut changed = 0;
    for control in controls {
        if control.gate.is_paused() {
            continue;
        }
        let task_id = if let Ok(mut runtime) = control.runtime.lock() {
            if matches!(runtime.record.status.as_str(), "queued" | "running") {
                control.gate.pause();
                runtime.record.status = "paused".to_owned();
                Some(runtime.record.id.clone())
            } else {
                None
            }
        } else {
            None
        };
        let Some(task_id) = task_id else {
            continue;
        };
        if publish(app, &control.runtime).is_ok() {
            changed += 1;
        }
        emit_watcher_for_task(app, &task_id);
        let _ = app.state::<Database>().append_log(
            &task_id,
            "info",
            "task.paused_all",
            "Task paused from the system tray",
        );
    }
    changed
}

pub async fn resume_all(app: &AppHandle) -> usize {
    let engine = app.state::<TaskEngine>();
    engine.globally_paused.store(false, Ordering::SeqCst);
    engine.network_waiters_changed.notify_one();
    let controls: Vec<Arc<TaskControl>> = app
        .state::<TaskEngine>()
        .controls
        .read()
        .await
        .values()
        .cloned()
        .collect();
    let mut changed = 0;
    for control in controls {
        if !control.gate.is_paused() {
            continue;
        }
        let task_id = if let Ok(mut runtime) = control.runtime.lock() {
            if runtime.record.status == "paused" {
                runtime.record.status = if runtime.record.stage == "queued" {
                    "queued".to_owned()
                } else {
                    "running".to_owned()
                };
                Some(runtime.record.id.clone())
            } else {
                None
            }
        } else {
            None
        };
        let Some(task_id) = task_id else {
            continue;
        };
        control.gate.resume();
        if publish(app, &control.runtime).is_ok() {
            changed += 1;
        }
        emit_watcher_for_task(app, &task_id);
        let _ = app.state::<Database>().append_log(
            &task_id,
            "info",
            "task.resumed_all",
            "Task resumed from the system tray",
        );
    }
    changed
}

pub async fn recover_unfinished_tasks(app: AppHandle) {
    let tasks = match app.state::<Database>().list_recoverable_tasks() {
        Ok(tasks) => tasks,
        Err(error) => {
            eprintln!("FileForge task recovery could not load tasks: {error}");
            return;
        }
    };

    for task in tasks {
        // Waiting tasks are intentionally left parked without a runtime
        // control or worker permit. The shared connectivity monitor claims
        // them only after Google is reachable again.
        if task.record.status == "waiting_for_network" {
            continue;
        }
        let task_id = task.record.id.clone();
        let task_name = task.record.name.clone();
        let watcher_id = task.watcher_id.clone();
        let is_watch_upload = task.task_type == "watch_upload";
        if let Err(error) = recover_task(&app, task).await {
            handle_recovery_failure(
                &app,
                &task_id,
                &task_name,
                watcher_id.as_deref(),
                is_watch_upload,
                &error,
            )
            .await;
        }
    }
}

pub async fn monitor_waiting_tasks(app: AppHandle) {
    let mut delay = NETWORK_RECHECK_INITIAL;
    loop {
        let waiting = match app.state::<Database>().list_recoverable_tasks() {
            Ok(tasks) => tasks
                .into_iter()
                .filter(|task| task.record.status == "waiting_for_network")
                .collect::<Vec<_>>(),
            Err(error) => {
                eprintln!("FileForge network recovery could not load tasks: {error}");
                tokio::time::sleep(delay).await;
                delay = next_network_recheck(delay);
                continue;
            }
        };

        if waiting.is_empty() {
            delay = NETWORK_RECHECK_INITIAL;
            app.state::<TaskEngine>()
                .network_waiters_changed
                .notified()
                .await;
            continue;
        }

        if app
            .state::<TaskEngine>()
            .globally_paused
            .load(Ordering::SeqCst)
        {
            app.state::<TaskEngine>()
                .network_waiters_changed
                .notified()
                .await;
            continue;
        }

        // Always honor the current delay while tasks are parked. In particular,
        // a task that immediately receives another 429/5xx will notify this
        // monitor when it parks again, but cannot bypass the service backoff.
        tokio::time::sleep(delay).await;
        if app
            .state::<TaskEngine>()
            .globally_paused
            .load(Ordering::SeqCst)
        {
            continue;
        }

        if app.state::<GoogleService>().connectivity_available().await {
            let waiting = match app.state::<Database>().list_recoverable_tasks() {
                Ok(tasks) => tasks
                    .into_iter()
                    .filter(|task| task.record.status == "waiting_for_network")
                    .collect::<Vec<_>>(),
                Err(error) => {
                    eprintln!("FileForge network recovery could not refresh tasks: {error}");
                    delay = next_network_recheck(delay);
                    continue;
                }
            };
            for parked in waiting {
                let task_id = parked.record.id;
                if app
                    .state::<TaskEngine>()
                    .controls
                    .read()
                    .await
                    .contains_key(&task_id)
                {
                    continue;
                }
                let task = match app.state::<Database>().claim_waiting_task(&task_id) {
                    Ok(task) => task,
                    Err(crate::database::DatabaseError::TaskNotClaimable(_)) => continue,
                    Err(error) => {
                        eprintln!("FileForge could not claim waiting task {task_id}: {error}");
                        continue;
                    }
                };
                let task_name = task.record.name.clone();
                let watcher_id = task.watcher_id.clone();
                let is_watch_upload = task.task_type == "watch_upload";
                let _ = app.state::<Database>().append_log(
                    &task_id,
                    "info",
                    "network.restored",
                    "Network is reachable; task returned to the worker queue",
                );
                if let Err(error) = recover_task(&app, task).await {
                    handle_recovery_failure(
                        &app,
                        &task_id,
                        &task_name,
                        watcher_id.as_deref(),
                        is_watch_upload,
                        &error,
                    )
                    .await;
                }
            }
        }
        delay = next_network_recheck(delay);
    }
}

fn next_network_recheck(current: Duration) -> Duration {
    (current * 2).min(NETWORK_RECHECK_MAX)
}

fn resumable_session_for_archive(
    archive_ready: bool,
    existing_session_uri: Option<&str>,
) -> Option<&str> {
    archive_ready.then_some(existing_session_uri).flatten()
}

fn archive_matches_expected(path: &Path, expected_bytes: u64) -> bool {
    expected_bytes > 0
        && std::fs::metadata(path)
            .is_ok_and(|metadata| metadata.is_file() && metadata.len() == expected_bytes)
}

async fn handle_recovery_failure(
    app: &AppHandle,
    task_id: &str,
    task_name: &str,
    watcher_id: Option<&str>,
    is_watch_upload: bool,
    error: &str,
) {
    app.state::<TaskEngine>()
        .controls
        .write()
        .await
        .remove(task_id);
    if is_watch_upload {
        finish_watcher_file(
            app,
            task_id,
            watcher_id.unwrap_or_default(),
            false,
            Some(error),
        );
    } else {
        let _ = app.state::<Database>().mark_recovery_failed(task_id, error);
        let _ = app
            .state::<Database>()
            .append_log(task_id, "error", "recovery.failed", error);
        if let Ok(tasks) = app.state::<Database>().list_tasks() {
            if let Some(record) = tasks.into_iter().find(|record| record.id == task_id) {
                let _ = app.emit("task-progress", record);
            }
        }
        desktop::notify_task_result(app, task_name, false, Some(error));
    }
    eprintln!("FileForge could not recover task {task_id}: {error}");
}

async fn recover_task(app: &AppHandle, task: RecoverableTask) -> Result<(), String> {
    let original_status = task.record.status.clone();
    let legacy_failed_stage = task.record.stage == "failed";
    let original_stage = infer_recovery_stage(&task);
    let mut record = task.record;
    let should_pause = original_status == "paused"
        || app
            .state::<TaskEngine>()
            .globally_paused
            .load(Ordering::SeqCst);
    if should_pause {
        record.status = "paused".to_owned();
    } else {
        record.status = "queued".to_owned();
    }
    record.stage = original_stage.clone();
    record.speed_bytes_per_second = None;
    record.eta_seconds = None;
    record.error_message = None;

    let gate = Arc::new(if should_pause {
        PauseGate::new_paused()
    } else {
        PauseGate::new()
    });
    let control = Arc::new(TaskControl {
        gate,
        runtime: Arc::new(StdMutex::new(TaskRuntime {
            record: record.clone(),
            archive_path: task.archive_path.clone(),
            session_uri: task.resumable_session_uri.clone(),
        })),
    });

    let pool = {
        let engine = app.state::<TaskEngine>();
        let mut controls = engine.controls.write().await;
        if controls.contains_key(&record.id) {
            // Recovery may be requested concurrently by startup, reconnect,
            // or a user action. The existing control already owns the task,
            // so treating this as success keeps recovery idempotent and avoids
            // removing a live worker in the caller's failure cleanup.
            return Ok(());
        }
        controls.insert(record.id.clone(), control.clone());
        engine.pool.clone()
    };
    publish(app, &control.runtime)?;
    emit_watcher_for_task(app, &record.id);
    app.state::<Database>()
        .append_log(
            &record.id,
            "info",
            "task.recovered",
            &format!("Recovered after restart from stage '{original_stage}'"),
        )
        .map_err(|error| error.to_string())?;

    match task.task_type.as_str() {
        "compress_upload" => {
            let options =
                serde_json::from_str::<StartCompressUploadRequest>(&task.options_json).ok();
            let source = PathBuf::from(&record.source_path);
            let drive_folder_id = options
                .as_ref()
                .map(|value| value.drive_folder_id.clone())
                .or_else(|| record.destination_path.clone())
                .ok_or_else(|| "recovered upload has no Drive folder ID".to_owned())?;
            validate_drive_folder_id(&drive_folder_id)?;
            let upload_name = sanitize_archive_name(
                options
                    .as_ref()
                    .and_then(|value| value.archive_name.as_deref()),
                source.file_name().and_then(|value| value.to_str()),
            );
            let archive_path = match task.archive_path {
                Some(path) => PathBuf::from(path),
                None => app
                    .path()
                    .app_cache_dir()
                    .map_err(|error| error.to_string())?
                    .join("archives")
                    .join(format!("{}-{upload_name}", record.id)),
            };
            let can_resume_without_source =
                (matches!(original_stage.as_str(), "uploading" | "sharing")
                    && archive_matches_expected(&archive_path, record.bytes_total))
                    || (original_stage == "sharing" && record.drive_file_id.is_some());
            if !source.is_dir() && !can_resume_without_source {
                return Err(
                    "source folder no longer exists and no resumable archive is available"
                        .to_owned(),
                );
            }
            if let Ok(mut runtime) = control.runtime.lock() {
                runtime.archive_path = Some(archive_path.to_string_lossy().into_owned());
            }
            let seven_zip_path = if can_resume_without_source {
                PathBuf::new()
            } else {
                seven_zip::resolve_executable(&app.state::<Database>())
                    .map_err(|error| error.to_string())?
                    .0
            };
            let source_bytes = if source.is_dir() {
                seven_zip::folder_size(source.clone())
                    .await
                    .map_err(|error| error.to_string())?
            } else {
                record.bytes_total
            };
            let request = WorkflowRequest {
                source,
                archive_path,
                upload_name,
                drive_folder_id,
                make_public: options.map(|value| value.make_public).unwrap_or(true),
                seven_zip_path,
                source_bytes,
                recovery_stage: Some(original_stage),
                existing_drive_file_id: record.drive_file_id.clone(),
                existing_session_uri: task.resumable_session_uri,
            };
            let task_id = record.id.clone();
            let app = app.clone();
            tauri::async_runtime::spawn(run_workflow(app, task_id, control, request, pool));
        }
        "download_extract" => {
            let file_id = record
                .drive_file_id
                .clone()
                .or_else(|| parse_drive_file_id(&record.source_path).ok())
                .ok_or_else(|| "recovered download has no valid Drive file ID".to_owned())?;
            let extraction_destination = record
                .destination_path
                .as_deref()
                .map(PathBuf::from)
                .ok_or_else(|| "recovered download has no extraction destination".to_owned())?;
            let download_path = match task.archive_path {
                Some(path) => PathBuf::from(path),
                None => app
                    .path()
                    .app_cache_dir()
                    .map_err(|error| error.to_string())?
                    .join("downloads")
                    .join(format!("{}-download.zip", record.id)),
            };
            if let Some(parent) = download_path.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|error| format!("cannot restore download cache: {error}"))?;
            }
            if let Ok(mut runtime) = control.runtime.lock() {
                runtime.archive_path = Some(download_path.to_string_lossy().into_owned());
            }
            let (seven_zip_path, _) = seven_zip::resolve_executable(&app.state::<Database>())
                .map_err(|error| error.to_string())?;
            let request = DownloadWorkflowRequest {
                file_id,
                download_path,
                extraction_destination,
                seven_zip_path,
                // A recovered task may have last persisted bytes_total from
                // extraction rather than from the compressed Drive object.
                // Resolve the authoritative compressed size inside the worker
                // so an offline metadata lookup parks cleanly and remains safe
                // across any number of reconnect attempts.
                compressed_bytes: None,
                recovery_stage: Some(original_stage),
                resume_existing: true,
                verify_download_artifact: legacy_failed_stage,
            };
            let task_id = record.id.clone();
            let app = app.clone();
            tauri::async_runtime::spawn(run_download_workflow(
                app, task_id, control, request, pool,
            ));
        }
        "watch_upload" => {
            let options = serde_json::from_str::<WatchUploadOptions>(&task.options_json).ok();
            let source_path = PathBuf::from(&record.source_path);
            if !source_path.is_file() {
                return Err("watched file no longer exists".to_owned());
            }
            let watcher_id = options
                .as_ref()
                .map(|value| value.watcher_id.clone())
                .or(task.watcher_id)
                .ok_or_else(|| "recovered watch upload has no watcher ID".to_owned())?;
            let upload_name = options
                .as_ref()
                .map(|value| value.upload_name.clone())
                .or_else(|| {
                    source_path
                        .file_name()
                        .and_then(|value| value.to_str())
                        .map(str::to_owned)
                })
                .ok_or_else(|| "recovered watched file has no valid name".to_owned())?;
            let drive_folder_id = options
                .as_ref()
                .map(|value| value.drive_folder_id.clone())
                .or_else(|| record.destination_path.clone())
                .ok_or_else(|| "recovered watch upload has no Drive folder ID".to_owned())?;
            let mime_type = options
                .map(|value| value.mime_type)
                .unwrap_or_else(|| mime_type_for_path(&source_path).to_owned());
            let request = WatchWorkflowRequest {
                watcher_id,
                source_path,
                upload_name,
                drive_folder_id,
                mime_type,
                existing_session_uri: task.resumable_session_uri,
            };
            let task_id = record.id.clone();
            let app = app.clone();
            tauri::async_runtime::spawn(run_watch_upload_workflow(
                app, task_id, control, request, pool,
            ));
        }
        _ => {
            return Err(format!(
                "unsupported recoverable task type: {}",
                task.task_type
            ))
        }
    }
    Ok(())
}

fn infer_recovery_stage(task: &RecoverableTask) -> String {
    if task.record.stage == "completed" {
        return match task.task_type.as_str() {
            "compress_upload" if task.record.drive_file_id.is_some() => "sharing".to_owned(),
            "download_extract" => "opening".to_owned(),
            _ => "queued".to_owned(),
        };
    }

    if task.record.stage != "failed" {
        return task.record.stage.clone();
    }

    match task.task_type.as_str() {
        "compress_upload" if task.record.drive_file_id.is_some() => "sharing".to_owned(),
        "compress_upload"
            if task.resumable_session_uri.is_some()
                || task.archive_path.as_deref().is_some_and(|path| {
                    std::fs::metadata(path).is_ok_and(|metadata| {
                        task.record.bytes_total > 0 && metadata.len() == task.record.bytes_total
                    })
                }) =>
        {
            "uploading".to_owned()
        }
        "download_extract" if task.archive_path.is_some() => "downloading".to_owned(),
        "watch_upload" => "uploading".to_owned(),
        _ => "queued".to_owned(),
    }
}

struct WorkflowRequest {
    source: PathBuf,
    archive_path: PathBuf,
    upload_name: String,
    drive_folder_id: String,
    make_public: bool,
    seven_zip_path: PathBuf,
    source_bytes: u64,
    recovery_stage: Option<String>,
    existing_drive_file_id: Option<String>,
    existing_session_uri: Option<String>,
}

struct DownloadWorkflowRequest {
    file_id: String,
    download_path: PathBuf,
    extraction_destination: PathBuf,
    seven_zip_path: PathBuf,
    compressed_bytes: Option<u64>,
    recovery_stage: Option<String>,
    resume_existing: bool,
    verify_download_artifact: bool,
}

struct WatchWorkflowRequest {
    watcher_id: String,
    source_path: PathBuf,
    upload_name: String,
    drive_folder_id: String,
    mime_type: String,
    existing_session_uri: Option<String>,
}

async fn run_workflow(
    app: AppHandle,
    task_id: String,
    control: Arc<TaskControl>,
    request: WorkflowRequest,
    pool: Arc<WorkerPool>,
) {
    let permit = match wait_for_worker(&app, &task_id, &control, &pool).await {
        Ok(permit) => permit,
        Err(error) => {
            remove_control_if_same(&app, &task_id, &control).await;
            fail_task(&app, &task_id, &control, &error);
            return;
        }
    };
    match execute_workflow(&app, &control, &request).await {
        Ok(()) => {
            drop(permit);
            remove_control_if_same(&app, &task_id, &control).await;
            notify_task_success(&app, &control);
        }
        Err(error) if error.is_transient_network() => {
            drop(permit);
            if let Err(persist_error) =
                park_after_transient_network(&app, &task_id, &control, error.message()).await
            {
                remove_control_if_same(&app, &task_id, &control).await;
                fail_task(&app, &task_id, &control, &persist_error);
            }
        }
        Err(error) => {
            drop(permit);
            remove_control_if_same(&app, &task_id, &control).await;
            fail_task(&app, &task_id, &control, error.message());
        }
    }
}

async fn execute_workflow(
    app: &AppHandle,
    control: &Arc<TaskControl>,
    request: &WorkflowRequest,
) -> Result<(), WorkflowError> {
    let google = app.state::<GoogleService>();
    let recovered_at_sharing = request.recovery_stage.as_deref() == Some("sharing")
        && request.existing_drive_file_id.is_some();
    let uploaded = if recovered_at_sharing {
        google
            .metadata(request.existing_drive_file_id.clone().unwrap_or_default())
            .await?
    } else {
        let expected_archive_bytes = snapshot(&control.runtime)?.bytes_total;
        let archive_ready =
            matches!(
                request.recovery_stage.as_deref(),
                Some("uploading") | Some("sharing")
            ) && archive_matches_expected(&request.archive_path, expected_archive_bytes);
        let resumable_session_uri =
            resumable_session_for_archive(archive_ready, request.existing_session_uri.as_deref());
        if !archive_ready {
            // A resumable URI is tied to the exact byte sequence previously
            // uploaded. Recompression can produce different ZIP bytes, so the
            // old session must be cleared before rebuilding the archive.
            control
                .runtime
                .lock()
                .map_err(|_| "task lock poisoned")?
                .session_uri = None;
            if request.archive_path.exists() {
                tokio::fs::remove_file(&request.archive_path)
                    .await
                    .map_err(|error| format!("cannot replace incomplete archive: {error}"))?;
            }
            set_stage(app, control, "running", "compressing", 0.0)?;
            app.state::<Database>()
                .append_log(
                    &snapshot(&control.runtime)?.id,
                    "info",
                    "compression.started",
                    "7-Zip compression started",
                )
                .map_err(|error| error.to_string())?;

            let compression_started = Instant::now();
            let app_for_progress = app.clone();
            let runtime_for_progress = control.runtime.clone();
            let source_bytes = request.source_bytes;
            let on_compression_progress = Arc::new(move |percent: u8| {
                if let Ok(mut runtime) = runtime_for_progress.lock() {
                    let processed = source_bytes.saturating_mul(percent as u64) / 100;
                    let elapsed = compression_started.elapsed().as_secs_f64().max(0.001);
                    let speed = processed as f64 / elapsed;
                    runtime.record.progress = percent as f64 * 0.35;
                    runtime.record.bytes_processed = processed;
                    runtime.record.bytes_total = source_bytes;
                    runtime.record.speed_bytes_per_second = Some(speed);
                    runtime.record.eta_seconds = (speed > 0.0).then(|| {
                        ((source_bytes.saturating_sub(processed)) as f64 / speed).ceil() as u64
                    });
                }
                let _ = publish(&app_for_progress, &runtime_for_progress);
            });
            seven_zip::compress_folder(
                &request.seven_zip_path,
                &request.source,
                &request.archive_path,
                on_compression_progress,
            )
            .await
            .map_err(|error| error.to_string())?;
        }

        control.gate.wait().await;
        let archive_bytes = tokio::fs::metadata(&request.archive_path)
            .await
            .map_err(|error| format!("compressed archive is unavailable: {error}"))?
            .len();
        {
            let mut runtime = control.runtime.lock().map_err(|_| "task lock poisoned")?;
            runtime.record.stage = "uploading".to_owned();
            runtime.record.progress = runtime.record.progress.max(35.0);
            runtime.record.bytes_total = archive_bytes;
            runtime.record.speed_bytes_per_second = None;
            runtime.record.eta_seconds = None;
        }
        publish(app, &control.runtime)?;
        app.state::<Database>()
            .append_log(
                &snapshot(&control.runtime)?.id,
                "info",
                if archive_ready {
                    "upload.resumed"
                } else {
                    "upload.started"
                },
                if archive_ready {
                    "Resuming Google Drive upload from persisted session"
                } else {
                    "Google Drive resumable upload started"
                },
            )
            .map_err(|error| error.to_string())?;

        let app_for_upload = app.clone();
        let runtime_for_upload = control.runtime.clone();
        let on_upload_event = Arc::new(move |event: UploadEvent| {
            if let Ok(mut runtime) = runtime_for_upload.lock() {
                match event {
                    UploadEvent::SessionCreated(uri) => runtime.session_uri = Some(uri),
                    UploadEvent::Progress {
                        uploaded_bytes,
                        total_bytes,
                        speed_bytes_per_second,
                        eta_seconds,
                    } => {
                        runtime.record.bytes_processed = uploaded_bytes;
                        runtime.record.bytes_total = total_bytes;
                        runtime.record.progress = if total_bytes == 0 {
                            95.0
                        } else {
                            35.0 + uploaded_bytes as f64 / total_bytes as f64 * 60.0
                        };
                        runtime.record.speed_bytes_per_second = Some(speed_bytes_per_second);
                        runtime.record.eta_seconds = Some(eta_seconds);
                        runtime.record.error_message = None;
                    }
                    UploadEvent::Retry { count, message } => {
                        runtime.record.retry_count = runtime.record.retry_count.saturating_add(1);
                        runtime.record.error_message = Some(format!("Retry {count}: {message}"));
                        let _ = app_for_upload.state::<Database>().append_log(
                            &runtime.record.id,
                            "warn",
                            "upload.retry",
                            &message,
                        );
                    }
                }
            }
            let _ = publish(&app_for_upload, &runtime_for_upload);
        });
        google
            .upload_zip_resumable(
                &request.archive_path,
                &request.upload_name,
                &request.drive_folder_id,
                resumable_session_uri,
                control.gate.clone(),
                on_upload_event,
            )
            .await?
    };

    {
        let mut runtime = control
            .runtime
            .lock()
            .map_err(|_| "task lock poisoned".to_owned())?;
        runtime.record.drive_file_id = Some(uploaded.id.clone());
        runtime.record.drive_web_view_link = uploaded.web_view_link.clone();
    }
    set_stage(app, control, "running", "sharing", 96.0)?;
    if request.make_public {
        google.make_file_public(&uploaded.id).await?;
    }
    let metadata = google.metadata(uploaded.id.clone()).await?;
    {
        let mut runtime = control.runtime.lock().map_err(|_| "task lock poisoned")?;
        runtime.record.drive_file_id = Some(uploaded.id);
        runtime.record.drive_web_view_link = metadata.web_view_link;
        runtime.record.progress = 99.0;
        runtime.record.error_message = None;
    }
    publish(app, &control.runtime)?;

    let cleanup_result = tokio::fs::remove_file(&request.archive_path).await;
    if let Err(error) = cleanup_result {
        let _ = app.state::<Database>().append_log(
            &snapshot(&control.runtime)?.id,
            "warn",
            "cleanup.failed",
            &format!("uploaded successfully but could not delete temporary ZIP: {error}"),
        );
    }
    {
        let mut runtime = control.runtime.lock().map_err(|_| "task lock poisoned")?;
        runtime.record.status = "completed".to_owned();
        runtime.record.stage = "completed".to_owned();
        runtime.record.progress = 100.0;
        runtime.record.bytes_processed = runtime.record.bytes_total;
        runtime.record.speed_bytes_per_second = None;
        runtime.record.eta_seconds = Some(0);
        runtime.archive_path = None;
        runtime.session_uri = None;
    }
    publish(app, &control.runtime)?;
    if let Ok(record) = snapshot(&control.runtime) {
        let _ = app.state::<Database>().append_log(
            &record.id,
            "info",
            "task.completed",
            "ZIP uploaded and temporary archive cleaned up",
        );
    }
    Ok(())
}

async fn run_download_workflow(
    app: AppHandle,
    task_id: String,
    control: Arc<TaskControl>,
    request: DownloadWorkflowRequest,
    pool: Arc<WorkerPool>,
) {
    let permit = match wait_for_worker(&app, &task_id, &control, &pool).await {
        Ok(permit) => permit,
        Err(error) => {
            remove_control_if_same(&app, &task_id, &control).await;
            fail_task(&app, &task_id, &control, &error);
            return;
        }
    };
    match execute_download_workflow(&app, &control, &request).await {
        Ok(()) => {
            drop(permit);
            remove_control_if_same(&app, &task_id, &control).await;
            notify_task_success(&app, &control);
        }
        Err(error) if error.is_transient_network() => {
            drop(permit);
            if let Err(persist_error) =
                park_after_transient_network(&app, &task_id, &control, error.message()).await
            {
                remove_control_if_same(&app, &task_id, &control).await;
                fail_task(&app, &task_id, &control, &persist_error);
            }
        }
        Err(error) => {
            drop(permit);
            remove_control_if_same(&app, &task_id, &control).await;
            fail_task(&app, &task_id, &control, error.message());
        }
    }
}

async fn run_watch_upload_workflow(
    app: AppHandle,
    task_id: String,
    control: Arc<TaskControl>,
    request: WatchWorkflowRequest,
    pool: Arc<WorkerPool>,
) {
    let permit = match wait_for_worker(&app, &task_id, &control, &pool).await {
        Ok(permit) => permit,
        Err(error) => {
            remove_control_if_same(&app, &task_id, &control).await;
            fail_watch_upload_task(&app, &task_id, &control, &error);
            finish_watcher_file(&app, &task_id, &request.watcher_id, false, Some(&error));
            return;
        }
    };
    match execute_watch_upload_workflow(&app, &control, &request).await {
        Ok(()) => {
            drop(permit);
            remove_control_if_same(&app, &task_id, &control).await;
            finish_watcher_file(&app, &task_id, &request.watcher_id, true, None);
        }
        Err(error) if error.is_transient_network() => {
            drop(permit);
            if let Err(persist_error) =
                park_after_transient_network(&app, &task_id, &control, error.message()).await
            {
                remove_control_if_same(&app, &task_id, &control).await;
                fail_watch_upload_task(&app, &task_id, &control, &persist_error);
                finish_watcher_file(
                    &app,
                    &task_id,
                    &request.watcher_id,
                    false,
                    Some(&persist_error),
                );
            }
        }
        Err(error) => {
            drop(permit);
            remove_control_if_same(&app, &task_id, &control).await;
            fail_watch_upload_task(&app, &task_id, &control, error.message());
            finish_watcher_file(
                &app,
                &task_id,
                &request.watcher_id,
                false,
                Some(error.message()),
            );
        }
    }
}

async fn execute_watch_upload_workflow(
    app: &AppHandle,
    control: &Arc<TaskControl>,
    request: &WatchWorkflowRequest,
) -> Result<(), WorkflowError> {
    if !request.source_path.is_file() {
        return Err("watched file no longer exists".to_owned().into());
    }
    let total_bytes = tokio::fs::metadata(&request.source_path)
        .await
        .map_err(|error| format!("cannot inspect watched file: {error}"))?
        .len();
    // A watched source is mutable outside the app. Even when its byte length is
    // unchanged, its contents may have been replaced while the task was parked
    // or the app was closed. Reusing the old Drive offset could therefore join
    // an old prefix with new bytes, so recovered watch uploads restart at zero.
    let restarted_from_beginning = request.existing_session_uri.is_some();
    {
        let mut runtime = control.runtime.lock().map_err(|_| "task lock poisoned")?;
        runtime.record.status = "running".to_owned();
        runtime.record.stage = "uploading".to_owned();
        runtime.record.bytes_total = total_bytes;
        runtime.record.speed_bytes_per_second = None;
        runtime.record.eta_seconds = None;
        runtime.record.error_message = None;
        runtime.session_uri = None;
    }
    publish(app, &control.runtime)?;
    emit_watcher_record(app, &request.watcher_id);
    app.state::<Database>()
        .append_log(
            &snapshot(&control.runtime)?.id,
            "info",
            if restarted_from_beginning {
                "watch.upload_restarted"
            } else {
                "watch.upload_started"
            },
            if restarted_from_beginning {
                "Watched file may have changed; restarting upload from the beginning"
            } else {
                "Uploading stable watched file to Google Drive"
            },
        )
        .map_err(|error| error.to_string())?;

    let app_for_upload = app.clone();
    let runtime_for_upload = control.runtime.clone();
    let on_upload_event = Arc::new(move |event: UploadEvent| {
        if let Ok(mut runtime) = runtime_for_upload.lock() {
            match event {
                UploadEvent::SessionCreated(uri) => runtime.session_uri = Some(uri),
                UploadEvent::Progress {
                    uploaded_bytes,
                    total_bytes,
                    speed_bytes_per_second,
                    eta_seconds,
                } => {
                    runtime.record.bytes_processed = uploaded_bytes;
                    runtime.record.bytes_total = total_bytes;
                    runtime.record.progress = if total_bytes == 0 {
                        99.0
                    } else {
                        uploaded_bytes as f64 / total_bytes as f64 * 99.0
                    };
                    runtime.record.speed_bytes_per_second = Some(speed_bytes_per_second);
                    runtime.record.eta_seconds = Some(eta_seconds);
                    runtime.record.error_message = None;
                }
                UploadEvent::Retry { count, message } => {
                    runtime.record.retry_count = runtime.record.retry_count.saturating_add(1);
                    runtime.record.error_message = Some(format!("Retry {count}: {message}"));
                    let _ = app_for_upload.state::<Database>().append_log(
                        &runtime.record.id,
                        "warn",
                        "watch.upload_retry",
                        &message,
                    );
                }
            }
        }
        let _ = publish(&app_for_upload, &runtime_for_upload);
    });
    let uploaded = app
        .state::<GoogleService>()
        .upload_file_resumable(
            &request.source_path,
            &request.upload_name,
            &request.drive_folder_id,
            &request.mime_type,
            None,
            control.gate.clone(),
            on_upload_event,
        )
        .await?;
    {
        let mut runtime = control.runtime.lock().map_err(|_| "task lock poisoned")?;
        runtime.record.status = "completed".to_owned();
        runtime.record.stage = "completed".to_owned();
        runtime.record.progress = 100.0;
        runtime.record.bytes_processed = total_bytes;
        runtime.record.bytes_total = total_bytes;
        runtime.record.speed_bytes_per_second = None;
        runtime.record.eta_seconds = Some(0);
        runtime.record.error_message = None;
        runtime.record.drive_file_id = Some(uploaded.id);
        runtime.record.drive_web_view_link = uploaded.web_view_link;
        runtime.session_uri = None;
    }
    Ok(())
}

fn finish_watcher_file(
    app: &AppHandle,
    task_id: &str,
    watcher_id: &str,
    success: bool,
    error: Option<&str>,
) {
    match app
        .state::<Database>()
        .settle_watch_upload_task(task_id, watcher_id, success, error)
    {
        Ok(()) => emit_watcher_record(app, watcher_id),
        Err(initial_error) => {
            eprintln!("FileForge could not settle watcher upload: {initial_error}");
            let app = app.clone();
            let task_id = task_id.to_owned();
            let watcher_id = watcher_id.to_owned();
            let error = error.map(str::to_owned);
            tauri::async_runtime::spawn(async move {
                let mut delay = Duration::from_millis(250);
                loop {
                    tokio::time::sleep(delay).await;
                    match app.state::<Database>().settle_watch_upload_task(
                        &task_id,
                        &watcher_id,
                        success,
                        error.as_deref(),
                    ) {
                        Ok(()) => {
                            emit_watcher_record(&app, &watcher_id);
                            break;
                        }
                        Err(retry_error) => {
                            eprintln!("FileForge watcher settlement retry failed: {retry_error}");
                            delay = (delay * 2).min(Duration::from_secs(30));
                        }
                    }
                }
            });
        }
    }
}

fn emit_watcher_record(app: &AppHandle, watcher_id: &str) {
    if let Ok(watchers) = app.state::<Database>().list_watchers() {
        if let Some(record) = watchers
            .into_iter()
            .find(|watcher| watcher.id == watcher_id)
        {
            let _ = app.emit("watcher-progress", record);
        }
    }
}

fn emit_watcher_for_task(app: &AppHandle, task_id: &str) {
    if let Ok(Some(watcher_id)) = app.state::<Database>().task_watcher_id(task_id) {
        emit_watcher_record(app, &watcher_id);
    }
}

async fn wait_for_worker(
    app: &AppHandle,
    task_id: &str,
    control: &Arc<TaskControl>,
    pool: &Arc<WorkerPool>,
) -> Result<WorkerPermit, String> {
    app.state::<Database>()
        .append_log(
            task_id,
            "debug",
            "worker.queued",
            "Task entered the worker queue",
        )
        .map_err(|error| error.to_string())?;
    loop {
        control.gate.wait().await;
        let permit = pool.acquire().await;
        if control.gate.is_paused() {
            drop(permit);
            continue;
        }
        app.state::<Database>()
            .append_log(
                task_id,
                "debug",
                "worker.started",
                &format!("Worker slot acquired ({}/{})", pool.active(), pool.limit()),
            )
            .map_err(|error| error.to_string())?;
        return Ok(permit);
    }
}

async fn remove_control_if_same(app: &AppHandle, task_id: &str, expected: &Arc<TaskControl>) {
    let engine = app.state::<TaskEngine>();
    let mut controls = engine.controls.write().await;
    if controls
        .get(task_id)
        .is_some_and(|current| Arc::ptr_eq(current, expected))
    {
        controls.remove(task_id);
    }
}

async fn park_after_transient_network(
    app: &AppHandle,
    task_id: &str,
    control: &Arc<TaskControl>,
    error: &str,
) -> Result<(), String> {
    loop {
        match park_task_for_network(app, task_id, control, error)? {
            NetworkParkState::Waiting => {
                remove_control_if_same(app, task_id, control).await;
                return Ok(());
            }
            NetworkParkState::Paused => control.gate.wait().await,
        }
    }
}

fn park_task_for_network(
    app: &AppHandle,
    task_id: &str,
    control: &TaskControl,
    error: &str,
) -> Result<NetworkParkState, String> {
    let state = {
        let mut runtime = control.runtime.lock().map_err(|_| "task lock poisoned")?;
        let state = if runtime.record.status == "paused" || control.gate.is_paused() {
            runtime.record.status = "paused".to_owned();
            NetworkParkState::Paused
        } else {
            runtime.record.status = "waiting_for_network".to_owned();
            NetworkParkState::Waiting
        };
        runtime.record.error_message = Some(error.to_owned());
        runtime.record.speed_bytes_per_second = None;
        runtime.record.eta_seconds = None;
        state
    };
    publish(app, &control.runtime)?;
    emit_watcher_for_task(app, task_id);
    let (event, message) = match state {
        NetworkParkState::Waiting => (
            "network.waiting",
            "Network is unavailable; task parked until connectivity returns",
        ),
        NetworkParkState::Paused => (
            "network.waiting_paused",
            "Network was unavailable while pausing; reconnect recovery will begin after resume",
        ),
    };
    let _ = app
        .state::<Database>()
        .append_log(task_id, "warn", event, message);
    if state == NetworkParkState::Waiting {
        app.state::<TaskEngine>()
            .network_waiters_changed
            .notify_one();
    }
    Ok(state)
}

fn fail_task(app: &AppHandle, task_id: &str, control: &TaskControl, error: &str) {
    if let Ok(mut runtime) = control.runtime.lock() {
        runtime.record.status = "failed".to_owned();
        runtime.record.error_message = Some(error.to_owned());
        runtime.record.speed_bytes_per_second = None;
        runtime.record.eta_seconds = None;
    }
    let _ = app
        .state::<Database>()
        .append_log(task_id, "error", "task.failed", error);
    let _ = publish(app, &control.runtime);
    if let Ok(record) = snapshot(&control.runtime) {
        if record.kind != "watch-upload" {
            desktop::notify_task_result(app, &record.name, false, Some(error));
        }
    }
}

fn fail_watch_upload_task(app: &AppHandle, task_id: &str, control: &TaskControl, error: &str) {
    if let Ok(mut runtime) = control.runtime.lock() {
        runtime.record.status = "failed".to_owned();
        runtime.record.error_message = Some(error.to_owned());
        runtime.record.speed_bytes_per_second = None;
        runtime.record.eta_seconds = None;
    }
    let _ = app
        .state::<Database>()
        .append_log(task_id, "error", "task.failed", error);
}

fn notify_task_success(app: &AppHandle, control: &TaskControl) {
    if let Ok(record) = snapshot(&control.runtime) {
        desktop::notify_task_result(app, &record.name, true, None);
    }
}

async fn execute_download_workflow(
    app: &AppHandle,
    control: &Arc<TaskControl>,
    request: &DownloadWorkflowRequest,
) -> Result<(), WorkflowError> {
    let recovered_at_opening = request.recovery_stage.as_deref() == Some("opening")
        && request.extraction_destination.is_dir();
    if !recovered_at_opening {
        let mut archive_ready = matches!(
            request.recovery_stage.as_deref(),
            Some("inspecting") | Some("extracting")
        ) && request.download_path.is_file();
        let compressed_bytes = if !archive_ready || request.verify_download_artifact {
            match request.compressed_bytes {
                Some(bytes) if !request.verify_download_artifact => bytes,
                _ => {
                    let metadata = app
                        .state::<GoogleService>()
                        .metadata(request.file_id.clone())
                        .await?;
                    metadata
                        .size
                        .as_deref()
                        .ok_or_else(|| {
                            "Google Drive metadata does not include ZIP size".to_owned()
                        })?
                        .parse::<u64>()
                        .map_err(|_| "Google Drive returned an invalid ZIP size".to_owned())?
                }
            }
        } else {
            request.compressed_bytes.unwrap_or(0)
        };
        if request.verify_download_artifact {
            archive_ready = tokio::fs::metadata(&request.download_path)
                .await
                .is_ok_and(|metadata| metadata.len() == compressed_bytes);
        }
        if !archive_ready {
            set_stage(app, control, "running", "downloading", 5.0)?;
            app.state::<Database>()
                .append_log(
                    &snapshot(&control.runtime)?.id,
                    "info",
                    if request.resume_existing {
                        "download.resumed"
                    } else {
                        "download.started"
                    },
                    if request.resume_existing {
                        "Resuming authenticated Google Drive download"
                    } else {
                        "Authenticated Google Drive download started"
                    },
                )
                .map_err(|error| error.to_string())?;

            let app_for_download = app.clone();
            let runtime_for_download = control.runtime.clone();
            let on_download_event = Arc::new(move |event: DownloadEvent| {
                if let Ok(mut runtime) = runtime_for_download.lock() {
                    match event {
                        DownloadEvent::Progress {
                            downloaded_bytes,
                            total_bytes,
                            speed_bytes_per_second,
                            eta_seconds,
                        } => {
                            runtime.record.bytes_processed = downloaded_bytes;
                            runtime.record.bytes_total = total_bytes;
                            runtime.record.progress = if total_bytes == 0 {
                                65.0
                            } else {
                                5.0 + downloaded_bytes as f64 / total_bytes as f64 * 60.0
                            };
                            runtime.record.speed_bytes_per_second = Some(speed_bytes_per_second);
                            runtime.record.eta_seconds = Some(eta_seconds);
                            runtime.record.error_message = None;
                        }
                        DownloadEvent::Retry { count, message } => {
                            runtime.record.retry_count =
                                runtime.record.retry_count.saturating_add(1);
                            runtime.record.error_message =
                                Some(format!("Retry {count}: {message}"));
                            let _ = app_for_download.state::<Database>().append_log(
                                &runtime.record.id,
                                "warn",
                                "download.retry",
                                &message,
                            );
                        }
                    }
                }
                let _ = publish(&app_for_download, &runtime_for_download);
            });
            app.state::<GoogleService>()
                .download_file(
                    &request.file_id,
                    &request.download_path,
                    compressed_bytes,
                    request.resume_existing,
                    control.gate.clone(),
                    on_download_event,
                )
                .await?;
        }

        control.gate.wait().await;
        set_stage(app, control, "running", "inspecting", 66.0)?;
        let archive_info =
            seven_zip::inspect_archive(&request.seven_zip_path, &request.download_path)
                .await
                .map_err(|error| error.to_string())?;
        ensure_extraction_space(
            &request.extraction_destination,
            archive_info.uncompressed_bytes,
        )?;
        tokio::fs::create_dir_all(&request.extraction_destination)
            .await
            .map_err(|error| format!("cannot create extraction destination: {error}"))?;
        app.state::<Database>()
            .append_log(
                &snapshot(&control.runtime)?.id,
                "info",
                "archive.validated",
                &format!(
                    "ZIP contains {} entries and {} uncompressed bytes",
                    archive_info.entries, archive_info.uncompressed_bytes
                ),
            )
            .map_err(|error| error.to_string())?;

        {
            let mut runtime = control.runtime.lock().map_err(|_| "task lock poisoned")?;
            runtime.record.stage = "extracting".to_owned();
            runtime.record.progress = 67.0;
            runtime.record.bytes_processed = 0;
            runtime.record.bytes_total = archive_info.uncompressed_bytes;
            runtime.record.speed_bytes_per_second = None;
            runtime.record.eta_seconds = None;
        }
        publish(app, &control.runtime)?;

        let extraction_started = Instant::now();
        let app_for_extract = app.clone();
        let runtime_for_extract = control.runtime.clone();
        let uncompressed_bytes = archive_info.uncompressed_bytes;
        let on_extract_progress = Arc::new(move |percent: u8| {
            if let Ok(mut runtime) = runtime_for_extract.lock() {
                let processed = uncompressed_bytes.saturating_mul(percent as u64) / 100;
                let elapsed = extraction_started.elapsed().as_secs_f64().max(0.001);
                let speed = processed as f64 / elapsed;
                runtime.record.progress = 67.0 + percent as f64 * 0.31;
                runtime.record.bytes_processed = processed;
                runtime.record.bytes_total = uncompressed_bytes;
                runtime.record.speed_bytes_per_second = Some(speed);
                runtime.record.eta_seconds = (speed > 0.0).then(|| {
                    ((uncompressed_bytes.saturating_sub(processed)) as f64 / speed).ceil() as u64
                });
            }
            let _ = publish(&app_for_extract, &runtime_for_extract);
        });
        seven_zip::extract_archive(
            &request.seven_zip_path,
            &request.download_path,
            &request.extraction_destination,
            on_extract_progress,
        )
        .await
        .map_err(|error| error.to_string())?;
    }

    set_stage(app, control, "running", "opening", 99.0)?;
    if request.download_path.exists() {
        if let Err(error) = tokio::fs::remove_file(&request.download_path).await {
            let _ = app.state::<Database>().append_log(
                &snapshot(&control.runtime)?.id,
                "warn",
                "cleanup.failed",
                &format!("extracted successfully but could not delete temporary ZIP: {error}"),
            );
        } else if let Ok(mut runtime) = control.runtime.lock() {
            runtime.archive_path = None;
        }
    }

    let destination = request.extraction_destination.clone();
    if let Err(error) = tokio::task::spawn_blocking(move || open::that(destination))
        .await
        .map_err(|error| error.to_string())?
    {
        let _ = app.state::<Database>().append_log(
            &snapshot(&control.runtime)?.id,
            "warn",
            "explorer.failed",
            &format!("could not open extraction folder: {error}"),
        );
    }

    {
        let mut runtime = control.runtime.lock().map_err(|_| "task lock poisoned")?;
        runtime.record.status = "completed".to_owned();
        runtime.record.stage = "completed".to_owned();
        runtime.record.progress = 100.0;
        runtime.record.bytes_processed = runtime.record.bytes_total;
        runtime.record.speed_bytes_per_second = None;
        runtime.record.eta_seconds = Some(0);
        runtime.record.error_message = None;
        runtime.session_uri = None;
    }
    publish(app, &control.runtime)?;
    if let Ok(record) = snapshot(&control.runtime) {
        let _ = app.state::<Database>().append_log(
            &record.id,
            "info",
            "task.completed",
            "ZIP downloaded, extracted, cleaned up, and opened in Explorer",
        );
    }
    Ok(())
}

fn set_stage(
    app: &AppHandle,
    control: &TaskControl,
    status: &str,
    stage: &str,
    progress: f64,
) -> Result<(), String> {
    {
        let mut runtime = control.runtime.lock().map_err(|_| "task lock poisoned")?;
        runtime.record.status = status.to_owned();
        runtime.record.stage = stage.to_owned();
        runtime.record.progress = progress;
        runtime.record.error_message = None;
    }
    publish(app, &control.runtime)
}

fn publish(app: &AppHandle, runtime: &Arc<StdMutex<TaskRuntime>>) -> Result<(), String> {
    let mut runtime = runtime.lock().map_err(|_| "task lock poisoned")?;
    runtime.record.updated_at =
        chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let record = runtime.record.clone();
    app.state::<Database>()
        .update_task(&TaskUpdate {
            id: &record.id,
            status: &record.status,
            stage: &record.stage,
            progress: record.progress,
            bytes_processed: record.bytes_processed,
            bytes_total: record.bytes_total,
            speed_bytes_per_second: record.speed_bytes_per_second,
            eta_seconds: record.eta_seconds,
            retry_count: record.retry_count,
            error_message: record.error_message.as_deref(),
            archive_path: runtime.archive_path.as_deref(),
            resumable_session_uri: runtime.session_uri.as_deref(),
            drive_file_id: record.drive_file_id.as_deref(),
            drive_web_view_link: record.drive_web_view_link.as_deref(),
        })
        .map_err(|error| error.to_string())?;
    if record.kind != "watch-upload" {
        let _ = app.emit("task-progress", &record);
    }
    Ok(())
}

fn snapshot(runtime: &Arc<StdMutex<TaskRuntime>>) -> Result<TaskRecord, String> {
    runtime
        .lock()
        .map(|runtime| runtime.record.clone())
        .map_err(|_| "task lock poisoned".to_owned())
}

fn ensure_temp_space(path: &Path, source_bytes: u64) -> Result<(), String> {
    let free = fs2::available_space(path)
        .map_err(|error| format!("cannot inspect temporary disk space: {error}"))?;
    let required = source_bytes
        .saturating_add(source_bytes / 10)
        .saturating_add(TEMP_SPACE_SAFETY_BYTES);
    if free < required {
        return Err(format!(
            "insufficient temporary disk space: {} bytes available, {} required",
            free, required
        ));
    }
    Ok(())
}

fn ensure_download_space(path: &Path, download_bytes: u64) -> Result<(), String> {
    let free = fs2::available_space(path)
        .map_err(|error| format!("cannot inspect download cache space: {error}"))?;
    let required = download_bytes.saturating_add(TEMP_SPACE_SAFETY_BYTES);
    if free < required {
        return Err(format!(
            "insufficient download cache space: {free} bytes available, {required} required"
        ));
    }
    Ok(())
}

fn ensure_extraction_space(destination: &Path, uncompressed_bytes: u64) -> Result<(), String> {
    let existing_path = if destination.exists() {
        destination
    } else {
        destination
            .parent()
            .ok_or_else(|| "extraction destination has no parent directory".to_owned())?
    };
    let free = fs2::available_space(existing_path)
        .map_err(|error| format!("cannot inspect extraction disk space: {error}"))?;
    let required = uncompressed_bytes.saturating_add(TEMP_SPACE_SAFETY_BYTES);
    if free < required {
        return Err(format!(
            "insufficient extraction disk space: {free} bytes available, {required} required"
        ));
    }
    Ok(())
}

fn unique_destination_path(parent: &Path, base_name: &str) -> PathBuf {
    let initial = parent.join(base_name);
    if !initial.exists() {
        return initial;
    }
    for suffix in 2..10_000 {
        let candidate = parent.join(format!("{base_name} ({suffix})"));
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{base_name}-{}", Uuid::new_v4()))
}

fn sanitize_directory_name(value: &str) -> String {
    let safe: String = value
        .trim()
        .chars()
        .map(|character| {
            if matches!(
                character,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
            ) {
                '_'
            } else {
                character
            }
        })
        .collect();
    let safe = safe.trim_end_matches(['.', ' ']);
    let device_name = safe
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let reserved = matches!(device_name.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (device_name.len() == 4
            && (device_name.starts_with("COM") || device_name.starts_with("LPT"))
            && device_name.as_bytes()[3].is_ascii_digit()
            && device_name.as_bytes()[3] != b'0');
    if safe.is_empty() || matches!(safe, "." | "..") || reserved {
        "extracted".to_owned()
    } else {
        safe.to_owned()
    }
}

fn validate_drive_folder_id(value: &str) -> Result<(), String> {
    let valid = !value.is_empty()
        && value.len() <= 256
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'));
    valid
        .then_some(())
        .ok_or_else(|| "Google Drive folder ID is invalid".to_owned())
}

fn sanitize_archive_name(requested: Option<&str>, folder_name: Option<&str>) -> String {
    let base = requested
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or(folder_name)
        .unwrap_or("archive");
    let file_name = Path::new(base)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("archive");
    let mut safe: String = file_name
        .chars()
        .map(|character| {
            if matches!(
                character,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
            ) {
                '_'
            } else {
                character
            }
        })
        .collect();
    if !safe.to_ascii_lowercase().ends_with(".zip") {
        safe.push_str(".zip");
    }
    safe
}

fn mime_type_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mkv" => "video/x-matroska",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn worker_pool_enforces_limit_and_releases_slots() {
        let pool = Arc::new(WorkerPool::new(1));
        let first = pool.acquire().await;
        assert_eq!(pool.active(), 1);
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(30), pool.acquire())
                .await
                .is_err()
        );

        drop(first);
        let second = tokio::time::timeout(std::time::Duration::from_millis(200), pool.acquire())
            .await
            .expect("released worker slot");
        assert_eq!(pool.active(), 1);
        drop(second);
    }

    #[tokio::test]
    async fn worker_pool_limit_updates_without_interrupting_active_tasks() {
        let pool = Arc::new(WorkerPool::new(2));
        let first = pool.acquire().await;
        let second = pool.acquire().await;
        pool.set_limit(1);
        assert_eq!(pool.limit(), 1);
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(30), pool.acquire())
                .await
                .is_err()
        );
        drop(first);
        drop(second);
        let next = tokio::time::timeout(std::time::Duration::from_millis(200), pool.acquire())
            .await
            .expect("new limit accepts one task after active tasks finish");
        drop(next);
    }

    #[test]
    fn worker_pool_limit_is_clamped_to_supported_range() {
        assert_eq!(WorkerPool::new(0).limit(), 1);
        assert_eq!(WorkerPool::new(50).limit(), 10);
    }

    #[test]
    fn archive_name_is_sanitized_and_gets_zip_extension() {
        assert_eq!(
            sanitize_archive_name(Some("client:export?.zip"), None),
            "client_export_.zip"
        );
        assert_eq!(
            sanitize_archive_name(None, Some("Render Output")),
            "Render Output.zip"
        );
    }

    #[test]
    fn drive_folder_id_validation_blocks_query_characters() {
        assert!(validate_drive_folder_id("root").is_ok());
        assert!(validate_drive_folder_id("1Abc_def-2").is_ok());
        assert!(validate_drive_folder_id("root' or true").is_err());
    }

    #[test]
    fn extraction_directory_name_is_windows_safe() {
        assert_eq!(sanitize_directory_name("client:render?"), "client_render_");
        assert_eq!(sanitize_directory_name(".."), "extracted");
        assert_eq!(sanitize_directory_name("CON"), "extracted");
        assert_eq!(sanitize_directory_name("..."), "extracted");
    }

    #[test]
    fn watched_file_mime_types_cover_render_formats() {
        assert_eq!(mime_type_for_path(Path::new("render.JPG")), "image/jpeg");
        assert_eq!(mime_type_for_path(Path::new("clip.mov")), "video/quicktime");
        assert_eq!(
            mime_type_for_path(Path::new("unknown.bin")),
            "application/octet-stream"
        );
    }

    #[test]
    fn legacy_failed_tasks_infer_resumable_stages_from_persisted_artifacts() {
        let base_record = TaskRecord {
            id: "task-one".to_owned(),
            name: "Retry me".to_owned(),
            kind: "compress-upload".to_owned(),
            status: "queued".to_owned(),
            stage: "failed".to_owned(),
            source_path: "C:\\source".to_owned(),
            destination_path: Some("root".to_owned()),
            progress: 50.0,
            bytes_processed: 10,
            bytes_total: 20,
            speed_bytes_per_second: None,
            eta_seconds: None,
            retry_count: 5,
            error_message: Some("offline".to_owned()),
            drive_file_id: None,
            drive_web_view_link: None,
            created_at: "2026-01-01T00:00:00.000Z".to_owned(),
            updated_at: "2026-01-01T00:00:00.000Z".to_owned(),
        };
        let upload = RecoverableTask {
            record: base_record.clone(),
            task_type: "compress_upload".to_owned(),
            archive_path: Some("C:\\cache\\archive.zip".to_owned()),
            resumable_session_uri: Some("https://upload.test/session".to_owned()),
            options_json: "{}".to_owned(),
            watcher_id: None,
        };
        assert_eq!(infer_recovery_stage(&upload), "uploading");

        let mut sharing = upload.clone();
        sharing.record.drive_file_id = Some("drive-file".to_owned());
        assert_eq!(infer_recovery_stage(&sharing), "sharing");

        let mut completed_upload = sharing.clone();
        completed_upload.record.stage = "completed".to_owned();
        assert_eq!(infer_recovery_stage(&completed_upload), "sharing");

        let download = RecoverableTask {
            record: TaskRecord {
                kind: "download-extract".to_owned(),
                ..base_record
            },
            task_type: "download_extract".to_owned(),
            archive_path: Some("C:\\cache\\partial.zip".to_owned()),
            resumable_session_uri: None,
            options_json: "{}".to_owned(),
            watcher_id: None,
        };
        assert_eq!(infer_recovery_stage(&download), "downloading");

        let mut completed_download = download;
        completed_download.record.stage = "completed".to_owned();
        assert_eq!(infer_recovery_stage(&completed_download), "opening");
    }

    #[test]
    fn network_rechecks_back_off_and_cap_at_thirty_seconds() {
        let mut delay = NETWORK_RECHECK_INITIAL;
        delay = next_network_recheck(delay);
        assert_eq!(delay, Duration::from_secs(10));
        delay = next_network_recheck(delay);
        assert_eq!(delay, Duration::from_secs(20));
        delay = next_network_recheck(delay);
        assert_eq!(delay, NETWORK_RECHECK_MAX);
        assert_eq!(next_network_recheck(delay), NETWORK_RECHECK_MAX);
    }

    #[test]
    fn resumable_session_is_used_only_for_the_same_archive_bytes() {
        let session = Some("https://upload.test/session");
        assert_eq!(resumable_session_for_archive(true, session), session);
        assert_eq!(resumable_session_for_archive(false, session), None);
    }

    #[test]
    fn resumable_archive_must_still_match_its_persisted_size() {
        let directory = tempfile::tempdir().expect("temporary archive directory");
        let archive = directory.path().join("upload.zip");
        std::fs::write(&archive, b"zip-bytes").expect("write archive fixture");

        assert!(archive_matches_expected(&archive, 9));
        assert!(!archive_matches_expected(&archive, 8));
        assert!(!archive_matches_expected(
            &directory.path().join("missing.zip"),
            9
        ));
    }
}
