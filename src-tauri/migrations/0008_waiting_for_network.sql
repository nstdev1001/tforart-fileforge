-- SQLite cannot add a value to an existing CHECK constraint. The migration
-- runner disables foreign-key enforcement around this transaction and validates
-- all retained references before committing, so the tasks table can be rebuilt
-- while preserving logs that reference it.
CREATE TABLE tasks_v8 (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    task_type TEXT NOT NULL CHECK (task_type IN ('compress_upload', 'download_extract', 'watch_upload')),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
        'queued', 'running', 'paused', 'waiting_for_network', 'failed', 'completed'
    )),
    source_path TEXT,
    destination_path TEXT,
    drive_file_id TEXT,
    drive_web_view_link TEXT,
    progress REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    bytes_processed INTEGER NOT NULL DEFAULT 0 CHECK (bytes_processed >= 0),
    bytes_total INTEGER NOT NULL DEFAULT 0 CHECK (bytes_total >= 0),
    speed_bytes_per_second REAL,
    eta_seconds INTEGER,
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    error_message TEXT,
    resumable_session_uri TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    started_at TEXT,
    completed_at TEXT,
    stage TEXT NOT NULL DEFAULT 'queued',
    archive_path TEXT,
    options_json TEXT NOT NULL DEFAULT '{}',
    watcher_id TEXT REFERENCES watchers(id) ON DELETE SET NULL
);

INSERT INTO tasks_v8 (
    id, name, task_type, status, source_path, destination_path,
    drive_file_id, drive_web_view_link, progress, bytes_processed,
    bytes_total, speed_bytes_per_second, eta_seconds, retry_count,
    error_message, resumable_session_uri, created_at, updated_at,
    started_at, completed_at, stage, archive_path, options_json, watcher_id
)
SELECT
    id, name, task_type, status, source_path, destination_path,
    drive_file_id, drive_web_view_link, progress, bytes_processed,
    bytes_total, speed_bytes_per_second, eta_seconds, retry_count,
    error_message, resumable_session_uri, created_at, updated_at,
    started_at, completed_at, stage, archive_path, options_json, watcher_id
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_v8 RENAME TO tasks;

CREATE INDEX idx_tasks_status_created_at ON tasks(status, created_at DESC);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at DESC);
CREATE INDEX idx_tasks_type_status ON tasks(task_type, status);
CREATE INDEX idx_tasks_recovery ON tasks(status, task_type, updated_at);
CREATE INDEX idx_tasks_watcher_status ON tasks(watcher_id, status);
