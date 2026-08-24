ALTER TABLE tasks ADD COLUMN options_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tasks_recovery
ON tasks(status, task_type, updated_at);
