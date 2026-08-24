import type {Migration} from "../scripts/migrate"

export const v002: Migration = {
  version: 2,
  name: "delta-sync",
  up: `
    CREATE TABLE change_log (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id       TEXT    NOT NULL,
        entity       TEXT    NOT NULL CHECK (entity IN ('task', 'tag', 'branch', 'file', 'settings')),
        operation    TEXT    NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
        field_name   TEXT,
        old_value    TEXT,
        new_value    TEXT,
        changed_at   TEXT    NOT NULL,
        sequence     INTEGER NOT NULL,
        device_id    TEXT    NOT NULL,
        synced       INTEGER NOT NULL DEFAULT 0 CHECK (synced IN (0, 1))
    );

    CREATE INDEX idx_change_log_unsynced ON change_log (synced, sequence ASC) WHERE synced = 0;
    CREATE INDEX idx_change_log_device_sequence ON change_log (device_id, sequence ASC);
    CREATE INDEX idx_change_log_synced_sequence ON change_log (synced, sequence ASC) WHERE synced = 1;

    CREATE TABLE sync_audit (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at          TEXT    NOT NULL,
        completed_at        TEXT    NOT NULL,
        duration_ms         INTEGER NOT NULL,
        strategy            TEXT    NOT NULL CHECK (strategy IN ('pull', 'push')),
        outcome             TEXT    NOT NULL CHECK (outcome IN ('success', 'partial', 'error', 'no_changes')),
        deltas_pushed       INTEGER NOT NULL DEFAULT 0,
        deltas_pulled       INTEGER NOT NULL DEFAULT 0,
        conflicts_resolved  INTEGER NOT NULL DEFAULT 0,
        docs_upserted       INTEGER NOT NULL DEFAULT 0,
        docs_deleted        INTEGER NOT NULL DEFAULT 0,
        error_message       TEXT,
        device_id           TEXT    NOT NULL
    );

    CREATE INDEX idx_sync_audit_started_at ON sync_audit (started_at DESC);
    CREATE INDEX idx_sync_audit_device_started ON sync_audit (device_id, started_at ASC);

    CREATE TABLE sync_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TRIGGER trg_tasks_insert AFTER INSERT ON tasks
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        SELECT NEW.id, 'task', 'insert', col.field_name, NULL, col.new_value, NEW.updated_at,
               COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
               (SELECT value FROM sync_meta WHERE key = 'device_id'),
               0
        FROM (
            SELECT 'status' AS field_name, quote(NEW.status) AS new_value
            UNION ALL SELECT 'content', quote(NEW.content)
            UNION ALL SELECT 'minimized', CAST(NEW.minimized AS TEXT)
            UNION ALL SELECT 'order_index', CAST(NEW.order_index AS TEXT)
            UNION ALL SELECT 'scheduled_date', quote(NEW.scheduled_date)
            UNION ALL SELECT 'scheduled_time', quote(NEW.scheduled_time)
            UNION ALL SELECT 'scheduled_timezone', quote(NEW.scheduled_timezone)
            UNION ALL SELECT 'estimated_time', CAST(NEW.estimated_time AS TEXT)
            UNION ALL SELECT 'spent_time', CAST(NEW.spent_time AS TEXT)
            UNION ALL SELECT 'branch_id', quote(NEW.branch_id)
            UNION ALL SELECT 'deleted_at', quote(NEW.deleted_at)
        ) AS col;
    END;

    CREATE TRIGGER trg_tasks_update AFTER UPDATE ON tasks
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        SELECT NEW.id, 'task', 'update', changes.field_name, changes.old_value, changes.new_value, NEW.updated_at,
               COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
               (SELECT value FROM sync_meta WHERE key = 'device_id'),
               0
        FROM (
            SELECT 'status' AS field_name, quote(OLD.status) AS old_value, quote(NEW.status) AS new_value WHERE OLD.status IS NOT NEW.status
            UNION ALL SELECT 'content', quote(OLD.content), quote(NEW.content) WHERE OLD.content IS NOT NEW.content
            UNION ALL SELECT 'minimized', CAST(OLD.minimized AS TEXT), CAST(NEW.minimized AS TEXT) WHERE OLD.minimized IS NOT NEW.minimized
            UNION ALL SELECT 'order_index', CAST(OLD.order_index AS TEXT), CAST(NEW.order_index AS TEXT) WHERE OLD.order_index IS NOT NEW.order_index
            UNION ALL SELECT 'scheduled_date', quote(OLD.scheduled_date), quote(NEW.scheduled_date) WHERE OLD.scheduled_date IS NOT NEW.scheduled_date
            UNION ALL SELECT 'scheduled_time', quote(OLD.scheduled_time), quote(NEW.scheduled_time) WHERE OLD.scheduled_time IS NOT NEW.scheduled_time
            UNION ALL SELECT 'scheduled_timezone', quote(OLD.scheduled_timezone), quote(NEW.scheduled_timezone) WHERE OLD.scheduled_timezone IS NOT NEW.scheduled_timezone
            UNION ALL SELECT 'estimated_time', CAST(OLD.estimated_time AS TEXT), CAST(NEW.estimated_time AS TEXT) WHERE OLD.estimated_time IS NOT NEW.estimated_time
            UNION ALL SELECT 'spent_time', CAST(OLD.spent_time AS TEXT), CAST(NEW.spent_time AS TEXT) WHERE OLD.spent_time IS NOT NEW.spent_time
            UNION ALL SELECT 'branch_id', quote(OLD.branch_id), quote(NEW.branch_id) WHERE OLD.branch_id IS NOT NEW.branch_id
            UNION ALL SELECT 'deleted_at', quote(OLD.deleted_at), quote(NEW.deleted_at) WHERE OLD.deleted_at IS NOT NEW.deleted_at
        ) AS changes;
    END;

    CREATE TRIGGER trg_tasks_delete AFTER DELETE ON tasks
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        VALUES (
            OLD.id, 'task', 'delete', NULL, NULL, NULL,
            COALESCE(OLD.deleted_at, datetime('now')),
            COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
            (SELECT value FROM sync_meta WHERE key = 'device_id'),
            0
        );
    END;

    CREATE TRIGGER trg_tags_insert AFTER INSERT ON tags
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        SELECT NEW.id, 'tag', 'insert', col.field_name, NULL, col.new_value, NEW.updated_at,
               COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
               (SELECT value FROM sync_meta WHERE key = 'device_id'),
               0
        FROM (
            SELECT 'name' AS field_name, quote(NEW.name) AS new_value
            UNION ALL SELECT 'color', quote(NEW.color)
            UNION ALL SELECT 'deleted_at', quote(NEW.deleted_at)
        ) AS col;
    END;

    CREATE TRIGGER trg_tags_update AFTER UPDATE ON tags
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        SELECT NEW.id, 'tag', 'update', changes.field_name, changes.old_value, changes.new_value, NEW.updated_at,
               COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
               (SELECT value FROM sync_meta WHERE key = 'device_id'),
               0
        FROM (
            SELECT 'name' AS field_name, quote(OLD.name) AS old_value, quote(NEW.name) AS new_value WHERE OLD.name IS NOT NEW.name
            UNION ALL SELECT 'color', quote(OLD.color), quote(NEW.color) WHERE OLD.color IS NOT NEW.color
            UNION ALL SELECT 'deleted_at', quote(OLD.deleted_at), quote(NEW.deleted_at) WHERE OLD.deleted_at IS NOT NEW.deleted_at
        ) AS changes;
    END;

    CREATE TRIGGER trg_tags_delete AFTER DELETE ON tags
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        VALUES (
            OLD.id, 'tag', 'delete', NULL, NULL, NULL,
            COALESCE(OLD.deleted_at, datetime('now')),
            COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
            (SELECT value FROM sync_meta WHERE key = 'device_id'),
            0
        );
    END;

    CREATE TRIGGER trg_branches_insert AFTER INSERT ON branches
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        SELECT NEW.id, 'branch', 'insert', col.field_name, NULL, col.new_value, NEW.updated_at,
               COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
               (SELECT value FROM sync_meta WHERE key = 'device_id'),
               0
        FROM (
            SELECT 'name' AS field_name, quote(NEW.name) AS new_value
            UNION ALL SELECT 'deleted_at', quote(NEW.deleted_at)
        ) AS col;
    END;

    CREATE TRIGGER trg_branches_update AFTER UPDATE ON branches
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        SELECT NEW.id, 'branch', 'update', changes.field_name, changes.old_value, changes.new_value, NEW.updated_at,
               COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
               (SELECT value FROM sync_meta WHERE key = 'device_id'),
               0
        FROM (
            SELECT 'name' AS field_name, quote(OLD.name) AS old_value, quote(NEW.name) AS new_value WHERE OLD.name IS NOT NEW.name
            UNION ALL SELECT 'deleted_at', quote(OLD.deleted_at), quote(NEW.deleted_at) WHERE OLD.deleted_at IS NOT NEW.deleted_at
        ) AS changes;
    END;

    CREATE TRIGGER trg_branches_delete AFTER DELETE ON branches
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        VALUES (
            OLD.id, 'branch', 'delete', NULL, NULL, NULL,
            COALESCE(OLD.deleted_at, datetime('now')),
            COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
            (SELECT value FROM sync_meta WHERE key = 'device_id'),
            0
        );
    END;

    CREATE TRIGGER trg_files_insert AFTER INSERT ON files
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        SELECT NEW.id, 'file', 'insert', col.field_name, NULL, col.new_value, NEW.updated_at,
               COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
               (SELECT value FROM sync_meta WHERE key = 'device_id'),
               0
        FROM (
            SELECT 'name' AS field_name, quote(NEW.name) AS new_value
            UNION ALL SELECT 'mime_type', quote(NEW.mime_type)
            UNION ALL SELECT 'size', CAST(NEW.size AS TEXT)
            UNION ALL SELECT 'deleted_at', quote(NEW.deleted_at)
        ) AS col;
    END;

    CREATE TRIGGER trg_files_update AFTER UPDATE ON files
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        SELECT NEW.id, 'file', 'update', changes.field_name, changes.old_value, changes.new_value, NEW.updated_at,
               COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
               (SELECT value FROM sync_meta WHERE key = 'device_id'),
               0
        FROM (
            SELECT 'name' AS field_name, quote(OLD.name) AS old_value, quote(NEW.name) AS new_value WHERE OLD.name IS NOT NEW.name
            UNION ALL SELECT 'mime_type', quote(OLD.mime_type), quote(NEW.mime_type) WHERE OLD.mime_type IS NOT NEW.mime_type
            UNION ALL SELECT 'size', CAST(OLD.size AS TEXT), CAST(NEW.size AS TEXT) WHERE OLD.size IS NOT NEW.size
            UNION ALL SELECT 'deleted_at', quote(OLD.deleted_at), quote(NEW.deleted_at) WHERE OLD.deleted_at IS NOT NEW.deleted_at
        ) AS changes;
    END;

    CREATE TRIGGER trg_files_delete AFTER DELETE ON files
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        VALUES (
            OLD.id, 'file', 'delete', NULL, NULL, NULL,
            COALESCE(OLD.deleted_at, datetime('now')),
            COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
            (SELECT value FROM sync_meta WHERE key = 'device_id'),
            0
        );
    END;

    CREATE TRIGGER trg_task_tags_insert AFTER INSERT ON task_tags
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        VALUES (
            NEW.task_id, 'task', 'update', 'tags', NULL, quote(NEW.tag_id),
            datetime('now'),
            COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
            (SELECT value FROM sync_meta WHERE key = 'device_id'),
            0
        );
    END;

    CREATE TRIGGER trg_task_tags_delete AFTER DELETE ON task_tags
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        VALUES (
            OLD.task_id, 'task', 'update', 'tags', quote(OLD.tag_id), NULL,
            datetime('now'),
            COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
            (SELECT value FROM sync_meta WHERE key = 'device_id'),
            0
        );
    END;

    CREATE TRIGGER trg_task_attachments_insert AFTER INSERT ON task_attachments
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        VALUES (
            NEW.task_id, 'task', 'update', 'attachments', NULL, quote(NEW.file_id),
            datetime('now'),
            COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
            (SELECT value FROM sync_meta WHERE key = 'device_id'),
            0
        );
    END;

    CREATE TRIGGER trg_task_attachments_delete AFTER DELETE ON task_attachments
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        VALUES (
            OLD.task_id, 'task', 'update', 'attachments', quote(OLD.file_id), NULL,
            datetime('now'),
            COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
            (SELECT value FROM sync_meta WHERE key = 'device_id'),
            0
        );
    END;

    CREATE TRIGGER trg_settings_update AFTER UPDATE ON settings
    WHEN (SELECT value FROM sync_meta WHERE key = 'applying_remote') IS NULL
      OR (SELECT value FROM sync_meta WHERE key = 'applying_remote') = '0'
    BEGIN
        INSERT INTO change_log (doc_id, entity, operation, field_name, old_value, new_value, changed_at, sequence, device_id, synced)
        VALUES (
            NEW.id, 'settings', 'update', NULL, OLD.data, NEW.data,
            NEW.updated_at,
            COALESCE((SELECT MAX(sequence) FROM change_log WHERE device_id = (SELECT value FROM sync_meta WHERE key = 'device_id')), 0) + 1,
            (SELECT value FROM sync_meta WHERE key = 'device_id'),
            0
        );
    END;
  `,
  down: `
    DROP TRIGGER IF EXISTS trg_settings_update;
    DROP TRIGGER IF EXISTS trg_task_attachments_delete;
    DROP TRIGGER IF EXISTS trg_task_attachments_insert;
    DROP TRIGGER IF EXISTS trg_task_tags_delete;
    DROP TRIGGER IF EXISTS trg_task_tags_insert;
    DROP TRIGGER IF EXISTS trg_files_delete;
    DROP TRIGGER IF EXISTS trg_files_update;
    DROP TRIGGER IF EXISTS trg_files_insert;
    DROP TRIGGER IF EXISTS trg_branches_delete;
    DROP TRIGGER IF EXISTS trg_branches_update;
    DROP TRIGGER IF EXISTS trg_branches_insert;
    DROP TRIGGER IF EXISTS trg_tags_delete;
    DROP TRIGGER IF EXISTS trg_tags_update;
    DROP TRIGGER IF EXISTS trg_tags_insert;
    DROP TRIGGER IF EXISTS trg_tasks_delete;
    DROP TRIGGER IF EXISTS trg_tasks_update;
    DROP TRIGGER IF EXISTS trg_tasks_insert;

    DROP INDEX IF EXISTS idx_change_log_unsynced;
    DROP INDEX IF EXISTS idx_change_log_device_sequence;
    DROP INDEX IF EXISTS idx_change_log_synced_sequence;
    DROP INDEX IF EXISTS idx_sync_audit_started_at;
    DROP INDEX IF EXISTS idx_sync_audit_device_started;

    DROP TABLE IF EXISTS change_log;
    DROP TABLE IF EXISTS sync_audit;
    DROP TABLE IF EXISTS sync_meta;
  `,
}
