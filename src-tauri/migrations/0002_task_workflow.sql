ALTER TABLE tasks ADD COLUMN stage TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE tasks ADD COLUMN archive_path TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_type_status ON tasks(task_type, status);

