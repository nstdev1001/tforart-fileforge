CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    task_type TEXT NOT NULL CHECK (task_type IN ('compress_upload', 'download_extract', 'watch_upload')),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'paused', 'failed', 'completed')),
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
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS watchers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    local_path TEXT NOT NULL UNIQUE,
    drive_folder_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    settling_delay_ms INTEGER NOT NULL DEFAULT 3000 CHECK (settling_delay_ms BETWEEN 1000 AND 10000),
    include_extensions TEXT NOT NULL DEFAULT '["jpg","jpeg","png","mp4","mov"]',
    exclude_patterns TEXT NOT NULL DEFAULT '["*.tmp","*.part"]',
    auto_stop_seconds INTEGER NOT NULL DEFAULT 30 CHECK (auto_stop_seconds > 0),
    last_activity_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    value_type TEXT NOT NULL DEFAULT 'string' CHECK (value_type IN ('string', 'integer', 'boolean', 'json')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT,
    level TEXT NOT NULL CHECK (level IN ('trace', 'debug', 'info', 'warn', 'error')),
    event TEXT NOT NULL,
    message TEXT NOT NULL,
    context_json TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_created_at ON tasks(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_watchers_enabled ON watchers(enabled);
CREATE INDEX IF NOT EXISTS idx_logs_task_created_at ON logs(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level_created_at ON logs(level, created_at DESC);

INSERT OR IGNORE INTO settings (key, value, value_type) VALUES
    ('theme', 'system', 'string'),
    ('concurrent_uploads', '3', 'integer'),
    ('temporary_directory', '', 'string');

