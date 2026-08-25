ALTER TABLE tasks ADD COLUMN watcher_id TEXT REFERENCES watchers(id) ON DELETE SET NULL;

ALTER TABLE watchers ADD COLUMN status TEXT NOT NULL DEFAULT 'stopped'
  CHECK (status IN ('watching', 'draining', 'stopped', 'failed'));
ALTER TABLE watchers ADD COLUMN drive_web_view_link TEXT;
ALTER TABLE watchers ADD COLUMN files_detected INTEGER NOT NULL DEFAULT 0 CHECK (files_detected >= 0);
ALTER TABLE watchers ADD COLUMN files_uploaded INTEGER NOT NULL DEFAULT 0 CHECK (files_uploaded >= 0);
ALTER TABLE watchers ADD COLUMN files_failed INTEGER NOT NULL DEFAULT 0 CHECK (files_failed >= 0);
ALTER TABLE watchers ADD COLUMN error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_watcher_status ON tasks(watcher_id, status);
CREATE INDEX IF NOT EXISTS idx_watchers_status ON watchers(status, updated_at DESC);
