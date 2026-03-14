import type {Migration} from "../scripts/migrate"

export const v001: Migration = {
  version: 1,
  name: "initial-schema",
  up: `
    CREATE TABLE branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active', 'done', 'discarded')),
      content TEXT NOT NULL DEFAULT '',
      minimized INTEGER NOT NULL DEFAULT 0,
      order_index REAL NOT NULL DEFAULT 0,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      scheduled_timezone TEXT NOT NULL,
      estimated_time INTEGER NOT NULL DEFAULT 0,
      spent_time INTEGER NOT NULL DEFAULT 0,
      branch_id TEXT NOT NULL DEFAULT 'main'
        REFERENCES branches(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE task_tags (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, tag_id)
    );

    CREATE TABLE files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE task_attachments (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, file_id)
    );

    CREATE TABLE settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      version TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX idx_tasks_branch_date ON tasks(branch_id, scheduled_date) WHERE deleted_at IS NULL;
    CREATE INDEX idx_tasks_date ON tasks(scheduled_date) WHERE deleted_at IS NULL;
    CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
    CREATE INDEX idx_tasks_deleted ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;
    CREATE INDEX idx_task_tags_tag ON task_tags(tag_id);
    CREATE INDEX idx_task_attachments_file ON task_attachments(file_id);
    CREATE INDEX idx_tags_active ON tags(id) WHERE deleted_at IS NULL;

    INSERT OR IGNORE INTO branches (id, name, created_at, updated_at)
      VALUES ('main', 'Main', datetime('now'), datetime('now'));
  `,
  down: `
    DROP INDEX IF EXISTS idx_tags_active;
    DROP INDEX IF EXISTS idx_task_attachments_file;
    DROP INDEX IF EXISTS idx_task_tags_tag;
    DROP INDEX IF EXISTS idx_tasks_deleted;
    DROP INDEX IF EXISTS idx_tasks_status;
    DROP INDEX IF EXISTS idx_tasks_date;
    DROP INDEX IF EXISTS idx_tasks_branch_date;
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS task_attachments;
    DROP TABLE IF EXISTS files;
    DROP TABLE IF EXISTS task_tags;
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS tags;
    DROP TABLE IF EXISTS branches;
  `,
}
