use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
    time::Duration,
};

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};
use thiserror::Error;

const DATABASE_FILE: &str = "fileforge.db";
const LATEST_SCHEMA_VERSION: i64 = 5;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRecord {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub status: String,
    pub stage: String,
    pub source_path: String,
    pub destination_path: Option<String>,
    pub progress: f64,
    pub bytes_processed: u64,
    pub bytes_total: u64,
    pub speed_bytes_per_second: Option<f64>,
    pub eta_seconds: Option<u64>,
    pub retry_count: u32,
    pub error_message: Option<String>,
    pub drive_file_id: Option<String>,
    pub drive_web_view_link: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug)]
pub struct RecoverableTask {
    pub record: TaskRecord,
    pub task_type: String,
    pub archive_path: Option<String>,
    pub resumable_session_uri: Option<String>,
    pub options_json: String,
    pub watcher_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogRecord {
    pub id: i64,
    pub task_id: Option<String>,
    pub level: String,
    pub event: String,
    pub message: String,
    pub context_json: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatcherRecord {
    pub id: String,
    pub name: String,
    pub local_path: String,
    pub drive_folder_id: Option<String>,
    pub enabled: bool,
    pub status: String,
    pub settling_delay_ms: u64,
    pub include_extensions: Vec<String>,
    pub exclude_patterns: Vec<String>,
    pub auto_stop_seconds: u64,
    pub last_activity_at: Option<String>,
    pub drive_web_view_link: Option<String>,
    pub files_detected: u64,
    pub files_uploaded: u64,
    pub files_failed: u64,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug)]
pub struct TaskUpdate<'a> {
    pub id: &'a str,
    pub status: &'a str,
    pub stage: &'a str,
    pub progress: f64,
    pub bytes_processed: u64,
    pub bytes_total: u64,
    pub speed_bytes_per_second: Option<f64>,
    pub eta_seconds: Option<u64>,
    pub retry_count: u32,
    pub error_message: Option<&'a str>,
    pub archive_path: Option<&'a str>,
    pub resumable_session_uri: Option<&'a str>,
    pub drive_file_id: Option<&'a str>,
    pub drive_web_view_link: Option<&'a str>,
}

pub struct Database {
    connection: Mutex<Connection>,
    path: PathBuf,
}

#[derive(Debug, Error)]
pub enum DatabaseError {
    #[error("could not resolve application data directory: {0}")]
    AppData(#[from] tauri::Error),
    #[error("could not create database directory: {0}")]
    CreateDirectory(#[from] std::io::Error),
    #[error("SQLite operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("database lock is poisoned")]
    Poisoned,
}

impl Database {
    pub fn initialize<R: Runtime>(app: &AppHandle<R>) -> Result<Self, DatabaseError> {
        let app_data_dir = app.path().app_data_dir()?;
        fs::create_dir_all(&app_data_dir)?;
        Self::open(app_data_dir.join(DATABASE_FILE))
    }

    fn open(path: PathBuf) -> Result<Self, DatabaseError> {
        let mut connection = Connection::open(&path)?;
        configure_connection(&connection)?;
        apply_migrations(&mut connection)?;

        Ok(Self {
            connection: Mutex::new(connection),
            path,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn schema_version(&self) -> Result<i64, DatabaseError> {
        let connection = self.lock()?;
        connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(DatabaseError::from)
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, DatabaseError> {
        let connection = self.lock()?;
        connection
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                row.get(0)
            })
            .optional()
            .map_err(DatabaseError::from)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), DatabaseError> {
        let connection = self.lock()?;
        connection.execute(
            "INSERT INTO settings (key, value, value_type) VALUES (?1, ?2, 'string')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn create_compress_upload_task(
        &self,
        id: &str,
        name: &str,
        source_path: &str,
        drive_folder_id: &str,
        bytes_total: u64,
        options_json: &str,
    ) -> Result<(), DatabaseError> {
        let connection = self.lock()?;
        connection.execute(
            "INSERT INTO tasks (
               id, name, task_type, status, stage, source_path, destination_path, bytes_total,
               options_json
             ) VALUES (?1, ?2, 'compress_upload', 'queued', 'queued', ?3, ?4, ?5, ?6)",
            params![
                id,
                name,
                source_path,
                drive_folder_id,
                bytes_total,
                options_json
            ],
        )?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_download_extract_task(
        &self,
        id: &str,
        name: &str,
        source_link: &str,
        destination_path: &str,
        drive_file_id: &str,
        bytes_total: u64,
        options_json: &str,
    ) -> Result<(), DatabaseError> {
        let connection = self.lock()?;
        connection.execute(
            "INSERT INTO tasks (
               id, name, task_type, status, stage, source_path, destination_path,
               drive_file_id, bytes_total, options_json
             ) VALUES (?1, ?2, 'download_extract', 'queued', 'queued', ?3, ?4, ?5, ?6, ?7)",
            params![
                id,
                name,
                source_link,
                destination_path,
                drive_file_id,
                bytes_total,
                options_json
            ],
        )?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_watch_upload_task(
        &self,
        id: &str,
        watcher_id: &str,
        name: &str,
        source_path: &str,
        drive_folder_id: &str,
        bytes_total: u64,
        options_json: &str,
    ) -> Result<(), DatabaseError> {
        let connection = self.lock()?;
        connection.execute(
            "INSERT INTO tasks (
               id, watcher_id, name, task_type, status, stage, source_path,
               destination_path, bytes_total, options_json
             ) VALUES (?1, ?2, ?3, 'watch_upload', 'queued', 'queued', ?4, ?5, ?6, ?7)",
            params![
                id,
                watcher_id,
                name,
                source_path,
                drive_folder_id,
                bytes_total,
                options_json
            ],
        )?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_watcher(
        &self,
        id: &str,
        name: &str,
        local_path: &str,
        drive_folder_id: &str,
        settling_delay_ms: u64,
        include_extensions: &[String],
        auto_stop_seconds: u64,
    ) -> Result<(), DatabaseError> {
        let connection = self.lock()?;
        connection.execute(
            "INSERT INTO watchers (
               id, name, local_path, drive_folder_id, enabled, status,
               settling_delay_ms, include_extensions, auto_stop_seconds
             ) VALUES (?1, ?2, ?3, ?4, 1, 'watching', ?5, ?6, ?7)",
            params![
                id,
                name,
                local_path,
                drive_folder_id,
                settling_delay_ms,
                serde_json::to_string(include_extensions).unwrap_or_else(|_| "[]".to_owned()),
                auto_stop_seconds
            ],
        )?;
        Ok(())
    }

    pub fn list_watchers(&self) -> Result<Vec<WatcherRecord>, DatabaseError> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT id, name, local_path, drive_folder_id, enabled, status,
                    settling_delay_ms, include_extensions, exclude_patterns,
                    auto_stop_seconds, last_activity_at, drive_web_view_link,
                    files_detected, files_uploaded, files_failed, error_message,
                    created_at, updated_at
             FROM watchers ORDER BY created_at DESC",
        )?;
        let rows = statement.query_map([], map_watcher_record)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(DatabaseError::from)
    }

    pub fn list_enabled_watchers(&self) -> Result<Vec<WatcherRecord>, DatabaseError> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT id, name, local_path, drive_folder_id, enabled, status,
                    settling_delay_ms, include_extensions, exclude_patterns,
                    auto_stop_seconds, last_activity_at, drive_web_view_link,
                    files_detected, files_uploaded, files_failed, error_message,
                    created_at, updated_at
             FROM watchers WHERE enabled = 1 ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map([], map_watcher_record)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(DatabaseError::from)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_watcher_state(
        &self,
        id: &str,
        enabled: bool,
        status: &str,
        detected_delta: u64,
        uploaded_delta: u64,
        failed_delta: u64,
        drive_web_view_link: Option<&str>,
        error_message: Option<&str>,
        touch_activity: bool,
    ) -> Result<(), DatabaseError> {
        let connection = self.lock()?;
        connection.execute(
            "UPDATE watchers SET enabled = ?2, status = ?3,
                    files_detected = files_detected + ?4,
                    files_uploaded = files_uploaded + ?5,
                    files_failed = files_failed + ?6,
                    drive_web_view_link = COALESCE(?7, drive_web_view_link),
                    error_message = ?8,
                    last_activity_at = CASE WHEN ?9
                      THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE last_activity_at END,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?1",
            params![
                id,
                enabled,
                status,
                detected_delta,
                uploaded_delta,
                failed_delta,
                drive_web_view_link,
                error_message,
                touch_activity
            ],
        )?;
        Ok(())
    }

    pub fn delete_watcher(&self, id: &str) -> Result<(), DatabaseError> {
        let connection = self.lock()?;
        connection.execute("DELETE FROM watchers WHERE id = ?1 AND enabled = 0", [id])?;
        Ok(())
    }

    pub fn count_active_watch_uploads(&self, watcher_id: &str) -> Result<u64, DatabaseError> {
        let connection = self.lock()?;
        connection
            .query_row(
                "SELECT COUNT(*) FROM tasks
                 WHERE watcher_id = ?1 AND status IN ('queued', 'running', 'paused')",
                [watcher_id],
                |row| row.get(0),
            )
            .map_err(DatabaseError::from)
    }

    pub fn update_task(&self, task: &TaskUpdate<'_>) -> Result<(), DatabaseError> {
        let connection = self.lock()?;
        connection.execute(
            "UPDATE tasks SET
               status = ?2, stage = ?3, progress = ?4,
               bytes_processed = ?5, bytes_total = ?6,
               speed_bytes_per_second = ?7, eta_seconds = ?8,
               retry_count = ?9, error_message = ?10,
               archive_path = ?11,
               resumable_session_uri = ?12,
               drive_file_id = COALESCE(?13, drive_file_id),
               drive_web_view_link = COALESCE(?14, drive_web_view_link),
               started_at = CASE WHEN started_at IS NULL AND ?2 = 'running'
                 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE started_at END,
               completed_at = CASE WHEN ?2 = 'completed'
                 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE completed_at END,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?1",
            params![
                task.id,
                task.status,
                task.stage,
                task.progress,
                task.bytes_processed,
                task.bytes_total,
                task.speed_bytes_per_second,
                task.eta_seconds,
                task.retry_count,
                task.error_message,
                task.archive_path,
                task.resumable_session_uri,
                task.drive_file_id,
                task.drive_web_view_link,
            ],
        )?;
        Ok(())
    }

    pub fn append_log(
        &self,
        task_id: &str,
        level: &str,
        event: &str,
        message: &str,
    ) -> Result<(), DatabaseError> {
        let connection = self.lock()?;
        connection.execute(
            "INSERT INTO logs (task_id, level, event, message) VALUES (?1, ?2, ?3, ?4)",
            params![task_id, level, event, message],
        )?;
        Ok(())
    }

    pub fn list_tasks(&self) -> Result<Vec<TaskRecord>, DatabaseError> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT id, name, task_type, status, stage, COALESCE(source_path, ''),
                    destination_path, progress, bytes_processed, bytes_total,
                    speed_bytes_per_second, eta_seconds, retry_count, error_message,
                    drive_file_id, drive_web_view_link, created_at, updated_at
             FROM tasks ORDER BY created_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            let task_type: String = row.get(2)?;
            Ok(TaskRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: task_type.replace('_', "-"),
                status: row.get(3)?,
                stage: row.get(4)?,
                source_path: row.get(5)?,
                destination_path: row.get(6)?,
                progress: row.get(7)?,
                bytes_processed: row.get(8)?,
                bytes_total: row.get(9)?,
                speed_bytes_per_second: row.get(10)?,
                eta_seconds: row.get(11)?,
                retry_count: row.get(12)?,
                error_message: row.get(13)?,
                drive_file_id: row.get(14)?,
                drive_web_view_link: row.get(15)?,
                created_at: row.get(16)?,
                updated_at: row.get(17)?,
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(DatabaseError::from)
    }

    pub fn list_recoverable_tasks(&self) -> Result<Vec<RecoverableTask>, DatabaseError> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT id, name, task_type, status, stage, COALESCE(source_path, ''),
                    destination_path, progress, bytes_processed, bytes_total,
                    speed_bytes_per_second, eta_seconds, retry_count, error_message,
                    drive_file_id, drive_web_view_link, created_at, updated_at,
                    archive_path, resumable_session_uri, options_json, watcher_id
             FROM tasks
             WHERE status IN ('queued', 'running', 'paused')
               AND task_type IN ('compress_upload', 'download_extract', 'watch_upload')
             ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map([], |row| {
            let task_type: String = row.get(2)?;
            Ok(RecoverableTask {
                record: task_record_from_row(row, task_type.clone())?,
                task_type,
                archive_path: row.get(18)?,
                resumable_session_uri: row.get(19)?,
                options_json: row.get(20)?,
                watcher_id: row.get(21)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(DatabaseError::from)
    }

    pub fn list_task_logs(&self, task_id: &str) -> Result<Vec<LogRecord>, DatabaseError> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(
            "SELECT id, task_id, level, event, message, context_json, created_at
             FROM logs WHERE task_id = ?1 ORDER BY created_at ASC, id ASC",
        )?;
        let rows = statement.query_map([task_id], |row| {
            Ok(LogRecord {
                id: row.get(0)?,
                task_id: row.get(1)?,
                level: row.get(2)?,
                event: row.get(3)?,
                message: row.get(4)?,
                context_json: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(DatabaseError::from)
    }

    pub fn mark_recovery_failed(&self, task_id: &str, message: &str) -> Result<(), DatabaseError> {
        let connection = self.lock()?;
        connection.execute(
            "UPDATE tasks SET status = 'failed', stage = 'failed', error_message = ?2,
                    speed_bytes_per_second = NULL, eta_seconds = NULL,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?1",
            params![task_id, message],
        )?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn connection(&self) -> Result<MutexGuard<'_, Connection>, DatabaseError> {
        self.lock()
    }

    fn lock(&self) -> Result<MutexGuard<'_, Connection>, DatabaseError> {
        self.connection.lock().map_err(|_| DatabaseError::Poisoned)
    }
}

fn configure_connection(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.busy_timeout(Duration::from_secs(5))?;
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;",
    )?;
    Ok(())
}

fn apply_migrations(connection: &mut Connection) -> Result<(), rusqlite::Error> {
    let current_version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;

    if current_version < 1 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(include_str!("../migrations/0001_initial.sql"))?;
        transaction.pragma_update(None, "user_version", 1)?;
        transaction.commit()?;
    }

    let current_version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if current_version < 2 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(include_str!("../migrations/0002_task_workflow.sql"))?;
        transaction.pragma_update(None, "user_version", 2)?;
        transaction.commit()?;
    }

    let current_version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if current_version < 3 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(include_str!("../migrations/0003_task_recovery.sql"))?;
        transaction.pragma_update(None, "user_version", 3)?;
        transaction.commit()?;
    }

    let current_version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if current_version < 4 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(include_str!("../migrations/0004_watch_automation.sql"))?;
        transaction.pragma_update(None, "user_version", 4)?;
        transaction.commit()?;
    }

    let current_version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if current_version < 5 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(include_str!("../migrations/0005_desktop_experience.sql"))?;
        transaction.pragma_update(None, "user_version", 5)?;
        transaction.commit()?;
    }

    let final_version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if final_version != LATEST_SCHEMA_VERSION {
        return Err(rusqlite::Error::InvalidQuery);
    }

    Ok(())
}

fn task_record_from_row(
    row: &rusqlite::Row<'_>,
    task_type: String,
) -> rusqlite::Result<TaskRecord> {
    Ok(TaskRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        kind: task_type.replace('_', "-"),
        status: row.get(3)?,
        stage: row.get(4)?,
        source_path: row.get(5)?,
        destination_path: row.get(6)?,
        progress: row.get(7)?,
        bytes_processed: row.get(8)?,
        bytes_total: row.get(9)?,
        speed_bytes_per_second: row.get(10)?,
        eta_seconds: row.get(11)?,
        retry_count: row.get(12)?,
        error_message: row.get(13)?,
        drive_file_id: row.get(14)?,
        drive_web_view_link: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

fn map_watcher_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<WatcherRecord> {
    let include_json: String = row.get(7)?;
    let exclude_json: String = row.get(8)?;
    Ok(WatcherRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        local_path: row.get(2)?,
        drive_folder_id: row.get(3)?,
        enabled: row.get(4)?,
        status: row.get(5)?,
        settling_delay_ms: row.get(6)?,
        include_extensions: serde_json::from_str(&include_json).unwrap_or_default(),
        exclude_patterns: serde_json::from_str(&exclude_json).unwrap_or_default(),
        auto_stop_seconds: row.get(9)?,
        last_activity_at: row.get(10)?,
        drive_web_view_link: row.get(11)?,
        files_detected: row.get(12)?,
        files_uploaded: row.get(13)?,
        files_failed: row.get(14)?,
        error_message: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_creates_all_phase_one_tables_and_indexes() {
        let mut connection = Connection::open_in_memory().expect("in-memory SQLite");
        configure_connection(&connection).expect("configure SQLite");
        apply_migrations(&mut connection).expect("run migrations");

        for table in ["tasks", "watchers", "settings", "logs"] {
            let exists: Option<String> = connection
                .query_row(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |row| row.get(0),
                )
                .optional()
                .expect("inspect schema");
            assert_eq!(exists.as_deref(), Some(table));
        }

        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("schema version");
        assert_eq!(version, LATEST_SCHEMA_VERSION);

        let stage_column: Option<String> = connection
            .query_row(
                "SELECT name FROM pragma_table_info('tasks') WHERE name = 'stage'",
                [],
                |row| row.get(0),
            )
            .optional()
            .expect("inspect task columns");
        assert_eq!(stage_column.as_deref(), Some("stage"));

        let recovery_column: Option<String> = connection
            .query_row(
                "SELECT name FROM pragma_table_info('tasks') WHERE name = 'options_json'",
                [],
                |row| row.get(0),
            )
            .optional()
            .expect("inspect recovery columns");
        assert_eq!(recovery_column.as_deref(), Some("options_json"));

        let watcher_column: Option<String> = connection
            .query_row(
                "SELECT name FROM pragma_table_info('tasks') WHERE name = 'watcher_id'",
                [],
                |row| row.get(0),
            )
            .optional()
            .expect("inspect watcher task columns");
        assert_eq!(watcher_column.as_deref(), Some("watcher_id"));

        let notifications: String = connection
            .query_row(
                "SELECT value FROM settings WHERE key = 'notifications_enabled'",
                [],
                |row| row.get(0),
            )
            .expect("desktop notification setting");
        assert_eq!(notifications, "true");
    }

    #[test]
    fn task_status_constraint_rejects_unknown_status() {
        let mut connection = Connection::open_in_memory().expect("in-memory SQLite");
        configure_connection(&connection).expect("configure SQLite");
        apply_migrations(&mut connection).expect("run migrations");

        let result = connection.execute(
            "INSERT INTO tasks (id, name, task_type, status) VALUES ('one', 'Bad task', 'compress_upload', 'unknown')",
            [],
        );
        assert!(result.is_err());
    }

    #[test]
    fn recoverable_tasks_and_logs_round_trip() {
        let directory = tempfile::tempdir().expect("temporary database directory");
        let database = Database::open(directory.path().join("recovery.db")).expect("database");
        database
            .create_compress_upload_task(
                "recover-me",
                "Recover upload",
                "C:\\source",
                "root",
                42,
                r#"{"sourcePath":"C:\\source","driveFolderId":"root","archiveName":"sample.zip","makePublic":true}"#,
            )
            .expect("create task");
        {
            let connection = database.connection().expect("connection");
            connection
                .execute(
                    "UPDATE tasks SET status = 'running', stage = 'uploading',
                     archive_path = 'C:\\cache\\sample.zip', resumable_session_uri = 'https://upload.test/session'
                     WHERE id = 'recover-me'",
                    [],
                )
                .expect("prepare recovery state");
        }
        database
            .append_log("recover-me", "info", "upload.started", "Upload started")
            .expect("append log");

        let tasks = database
            .list_recoverable_tasks()
            .expect("recoverable tasks");
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].record.stage, "uploading");
        assert_eq!(
            tasks[0].archive_path.as_deref(),
            Some("C:\\cache\\sample.zip")
        );
        assert_eq!(
            tasks[0].resumable_session_uri.as_deref(),
            Some("https://upload.test/session")
        );
        assert!(tasks[0].options_json.contains("sample.zip"));

        let logs = database.list_task_logs("recover-me").expect("task logs");
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].event, "upload.started");
    }

    #[test]
    fn watcher_and_child_upload_state_round_trip() {
        let directory = tempfile::tempdir().expect("temporary database directory");
        let database = Database::open(directory.path().join("watcher.db")).expect("database");
        let extensions = vec!["jpg".to_owned(), "mp4".to_owned()];
        database
            .create_watcher(
                "watcher-one",
                "Render watcher",
                "C:\\renders",
                "drive-folder",
                3_000,
                &extensions,
                30,
            )
            .expect("create watcher");
        database
            .create_watch_upload_task(
                "watch-task",
                "watcher-one",
                "Auto-upload frame.jpg",
                "C:\\renders\\frame.jpg",
                "drive-folder",
                128,
                r#"{"watcherId":"watcher-one","uploadName":"frame.jpg","driveFolderId":"drive-folder","mimeType":"image/jpeg"}"#,
            )
            .expect("create child task");

        assert_eq!(
            database
                .count_active_watch_uploads("watcher-one")
                .expect("active uploads"),
            1
        );
        database
            .update_watcher_state(
                "watcher-one",
                true,
                "watching",
                1,
                1,
                0,
                Some("https://drive.google.com/folder"),
                None,
                true,
            )
            .expect("update watcher");
        let watchers = database.list_watchers().expect("list watchers");
        assert_eq!(watchers.len(), 1);
        assert_eq!(watchers[0].include_extensions, extensions);
        assert_eq!(watchers[0].files_detected, 1);
        assert_eq!(watchers[0].files_uploaded, 1);
        assert_eq!(
            watchers[0].drive_web_view_link.as_deref(),
            Some("https://drive.google.com/folder")
        );

        let recovered = database
            .list_recoverable_tasks()
            .expect("recover child upload");
        assert_eq!(recovered[0].watcher_id.as_deref(), Some("watcher-one"));
        assert_eq!(recovered[0].task_type, "watch_upload");
    }
}
