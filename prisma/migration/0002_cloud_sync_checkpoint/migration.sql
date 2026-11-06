ALTER TABLE project_draft_state
ADD COLUMN remote_create_pending INTEGER NOT NULL DEFAULT 0
CHECK (remote_create_pending IN (0, 1));
