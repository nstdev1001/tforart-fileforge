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
const LATEST_SCHEMA_VERSION: i64 = 2;

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
    ) -> Result<(), DatabaseError> {
        let connection = self.lock()?;
        connection.execute(
            "INSERT INTO tasks (
               id, name, task_type, status, stage, source_path, destination_path, bytes_total
             ) VALUES (?1, ?2, 'compress_upload', 'queued', 'queued', ?3, ?4, ?5)",
            params![id, name, source_path, drive_folder_id, bytes_total],
        )?;
        Ok(())
    }

    pub fn create_download_extract_task(
        &self,
        id: &str,
        name: &str,
        source_link: &str,
        destination_path: &str,
        drive_file_id: &str,
        bytes_total: u64,
    ) -> Result<(), DatabaseError> {
        let connection = self.lock()?;
        connection.execute(
            "INSERT INTO tasks (
               id, name, task_type, status, stage, source_path, destination_path,
               drive_file_id, bytes_total
             ) VALUES (?1, ?2, 'download_extract', 'queued', 'queued', ?3, ?4, ?5, ?6)",
            params![
                id,
                name,
                source_link,
                destination_path,
                drive_file_id,
                bytes_total
            ],
        )?;
        Ok(())
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

    let final_version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if final_version != LATEST_SCHEMA_VERSION {
        return Err(rusqlite::Error::InvalidQuery);
    }

    Ok(())
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
}
