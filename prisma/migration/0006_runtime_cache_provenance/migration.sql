ALTER TABLE project_draft_state
ADD COLUMN source_revision INTEGER NOT NULL DEFAULT 0 CHECK (source_revision >= 0);

ALTER TABLE project_draft_state
ADD COLUMN runtime_ir_source_revision INTEGER CHECK (runtime_ir_source_revision >= 0);

ALTER TABLE project_draft_state
ADD COLUMN validation_source_revision INTEGER CHECK (validation_source_revision >= 0);

ALTER TABLE project_draft_state
ADD COLUMN runtime_ir_workflow_path TEXT;

UPDATE project_draft_state
SET input_schema_json = '{"additionalProperties":false,"properties":{},"required":[],"type":"object"}'
WHERE input_schema_json = '{}';
