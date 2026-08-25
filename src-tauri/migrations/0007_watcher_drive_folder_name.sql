ALTER TABLE watchers ADD COLUMN drive_folder_name TEXT;

UPDATE watchers
SET drive_folder_name = 'My Drive'
WHERE drive_folder_id = 'root';
