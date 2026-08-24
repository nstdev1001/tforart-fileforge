use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
    time::Duration,
};

use rusqlite::{Connection, OptionalExtension};
use tauri::{AppHandle, Manager, Runtime};
use thiserror::Error;

const DATABASE_FILE: &str = "fileforge.db";
const LATEST_SCHEMA_VERSION: i64 = 1;

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
    let current_version: i64 =
        connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;

    if current_version < 1 {
        let transaction = connection.transaction()?;
        transaction.execute_batch(include_str!("../migrations/0001_initial.sql"))?;
        transaction.pragma_update(None, "user_version", 1)?;
        transaction.commit()?;
    }

    let final_version: i64 =
        connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
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

