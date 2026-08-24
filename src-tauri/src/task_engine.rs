use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex as StdMutex,
    },
    time::Instant,
};

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{Notify, RwLock};
use uuid::Uuid;

use crate::{
    database::{Database, TaskRecord, TaskUpdate},
    google::{parse_drive_file_id, DownloadEvent, GoogleService, UploadEvent},
    seven_zip,
};

const TEMP_SPACE_SAFETY_BYTES: u64 = 64 * 1024 * 1024;

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

    fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
    }

    fn resume(&self) {
        self.paused.store(false, Ordering::SeqCst);
        self.notify.notify_waiters();
    }

    pub async fn wait(&self) {
        while self.paused.load(Ordering::SeqCst) {
            self.notify.notified().await;
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
}

impl TaskEngine {
    pub fn new() -> Self {
        Self {
            controls: RwLock::new(HashMap::new()),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartCompressUploadRequest {
    source_path: String,
    drive_folder_id: String,
    archive_name: Option<String>,
    make_public: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartDownloadExtractRequest {
    drive_link_or_id: String,
    destination_path: String,
    create_subfolder: bool,
}

#[tauri::command]
pub fn list_tasks(database: State<'_, Database>) -> Result<Vec<TaskRecord>, String> {
    database.list_tasks().map_err(|error| error.to_string())
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

    database
        .create_compress_upload_task(
            &task_id,
            &task_name,
            &source.to_string_lossy(),
            &request.drive_folder_id,
            source_bytes,
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
        gate: Arc::new(PauseGate::new()),
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
    };
    tauri::async_runtime::spawn(run_workflow(app, task_id, control, workflow_request));

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
    let metadata = google.metadata(file_id.clone()).await?;
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
    database
        .create_download_extract_task(
            &task_id,
            &task_name,
            request.drive_link_or_id.trim(),
            &extraction_destination.to_string_lossy(),
            &file_id,
            compressed_bytes,
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
        gate: Arc::new(PauseGate::new()),
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
            compressed_bytes,
        },
    ));
    Ok(record)
}

#[tauri::command]
pub async fn pause_task(
    task_id: String,
    app: AppHandle,
    engine: State<'_, TaskEngine>,
) -> Result<TaskRecord, String> {
    let control = engine
        .controls
        .read()
        .await
        .get(&task_id)
        .cloned()
        .ok_or_else(|| "task is not currently active".to_owned())?;
    control.gate.pause();
    {
        let mut runtime = control.runtime.lock().map_err(|_| "task lock poisoned")?;
        runtime.record.status = "paused".to_owned();
    }
    publish(&app, &control.runtime)?;
    snapshot(&control.runtime)
}

#[tauri::command]
pub async fn resume_task(
    task_id: String,
    app: AppHandle,
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
        runtime.record.status = "running".to_owned();
    }
    control.gate.resume();
    publish(&app, &control.runtime)?;
    snapshot(&control.runtime)
}

struct WorkflowRequest {
    source: PathBuf,
    archive_path: PathBuf,
    upload_name: String,
    drive_folder_id: String,
    make_public: bool,
    seven_zip_path: PathBuf,
    source_bytes: u64,
}

struct DownloadWorkflowRequest {
    file_id: String,
    download_path: PathBuf,
    extraction_destination: PathBuf,
    seven_zip_path: PathBuf,
    compressed_bytes: u64,
}

async fn run_workflow(
    app: AppHandle,
    task_id: String,
    control: Arc<TaskControl>,
    request: WorkflowRequest,
) {
    let result = execute_workflow(&app, &control, &request).await;
    if let Err(error) = result {
        if let Ok(mut runtime) = control.runtime.lock() {
            runtime.record.status = "failed".to_owned();
            runtime.record.stage = "failed".to_owned();
            runtime.record.error_message = Some(error.clone());
            runtime.record.speed_bytes_per_second = None;
            runtime.record.eta_seconds = None;
        }
        let _ = app
            .state::<Database>()
            .append_log(&task_id, "error", "task.failed", &error);
        let _ = publish(&app, &control.runtime);
    }

    app.state::<TaskEngine>()
        .controls
        .write()
        .await
        .remove(&task_id);
}

async fn execute_workflow(
    app: &AppHandle,
    control: &Arc<TaskControl>,
    request: &WorkflowRequest,
) -> Result<(), String> {
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
            runtime.record.eta_seconds = (speed > 0.0)
                .then(|| ((source_bytes.saturating_sub(processed)) as f64 / speed).ceil() as u64);
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

    control.gate.wait().await;
    let archive_bytes = tokio::fs::metadata(&request.archive_path)
        .await
        .map_err(|error| format!("compressed archive is unavailable: {error}"))?
        .len();
    {
        let mut runtime = control.runtime.lock().map_err(|_| "task lock poisoned")?;
        runtime.record.stage = "uploading".to_owned();
        runtime.record.progress = 35.0;
        runtime.record.bytes_processed = 0;
        runtime.record.bytes_total = archive_bytes;
        runtime.record.speed_bytes_per_second = None;
        runtime.record.eta_seconds = None;
    }
    publish(app, &control.runtime)?;
    app.state::<Database>()
        .append_log(
            &snapshot(&control.runtime)?.id,
            "info",
            "upload.started",
            "Google Drive resumable upload started",
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
                }
            }
        }
        let _ = publish(&app_for_upload, &runtime_for_upload);
    });

    let google = app.state::<GoogleService>();
    let uploaded = google
        .upload_zip_resumable(
            &request.archive_path,
            &request.upload_name,
            &request.drive_folder_id,
            control.gate.clone(),
            on_upload_event,
        )
        .await?;

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
    app.state::<Database>()
        .append_log(
            &snapshot(&control.runtime)?.id,
            "info",
            "task.completed",
            "ZIP uploaded and temporary archive cleaned up",
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn run_download_workflow(
    app: AppHandle,
    task_id: String,
    control: Arc<TaskControl>,
    request: DownloadWorkflowRequest,
) {
    let result = execute_download_workflow(&app, &control, &request).await;
    if let Err(error) = result {
        if let Ok(mut runtime) = control.runtime.lock() {
            runtime.record.status = "failed".to_owned();
            runtime.record.stage = "failed".to_owned();
            runtime.record.error_message = Some(error.clone());
            runtime.record.speed_bytes_per_second = None;
            runtime.record.eta_seconds = None;
        }
        let _ = app
            .state::<Database>()
            .append_log(&task_id, "error", "task.failed", &error);
        let _ = publish(&app, &control.runtime);
    }
    app.state::<TaskEngine>()
        .controls
        .write()
        .await
        .remove(&task_id);
}

async fn execute_download_workflow(
    app: &AppHandle,
    control: &Arc<TaskControl>,
    request: &DownloadWorkflowRequest,
) -> Result<(), String> {
    set_stage(app, control, "running", "downloading", 5.0)?;
    app.state::<Database>()
        .append_log(
            &snapshot(&control.runtime)?.id,
            "info",
            "download.started",
            "Authenticated Google Drive download started",
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
                    runtime.record.retry_count = runtime.record.retry_count.saturating_add(1);
                    runtime.record.error_message = Some(format!("Retry {count}: {message}"));
                }
            }
        }
        let _ = publish(&app_for_download, &runtime_for_download);
    });
    app.state::<GoogleService>()
        .download_file(
            &request.file_id,
            &request.download_path,
            request.compressed_bytes,
            control.gate.clone(),
            on_download_event,
        )
        .await?;

    control.gate.wait().await;
    set_stage(app, control, "running", "inspecting", 66.0)?;
    let archive_info = seven_zip::inspect_archive(&request.seven_zip_path, &request.download_path)
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

    set_stage(app, control, "running", "opening", 99.0)?;
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
    app.state::<Database>()
        .append_log(
            &snapshot(&control.runtime)?.id,
            "info",
            "task.completed",
            "ZIP downloaded, extracted, cleaned up, and opened in Explorer",
        )
        .map_err(|error| error.to_string())?;
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
    app.emit("task-progress", &record)
        .map_err(|error| error.to_string())?;
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
    let safe = safe.trim_end_matches(|character| character == '.' || character == ' ');
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
