import type {Migration} from "../scripts/migrate"

const TASK_COLUMNS = `id, status, content, minimized, order_index,
  scheduled_date, scheduled_time, scheduled_timezone,
  estimated_time, spent_time, branch_id,
  created_at, updated_at, deleted_at`

/**
 * Makes `backlog` a real status: a task may now have no schedule, and a task with
 * no schedule carries `status = 'backlog'` instead of leaving `status` unrelated
 * to `scheduled`.
 *
 * Both halves need the table rebuilt — SQLite can neither drop `NOT NULL` nor widen
 * a `CHECK` through `ALTER` — so it is rebuilt once, with the three schedule columns
 * nullable, the widened status list, and the two checks that keep the schedule whole.
 * Foreign keys are on and `PRAGMA` has no effect inside the migration transaction, so
 * dropping the old table cascades into `task_tags` and `task_attachments`: both are
 * copied aside and restored after the rename.
 */
export const v010: Migration = {
  version: 10,
  name: "backlog-status",
  up: `
    CREATE TABLE tasks_v010 (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('backlog', 'active', 'discarded', 'done')),
      content TEXT NOT NULL DEFAULT '',
      minimized INTEGER NOT NULL DEFAULT 0,
      order_index REAL NOT NULL DEFAULT 0,
      scheduled_date TEXT,
      scheduled_time TEXT,
      scheduled_timezone TEXT,
      estimated_time INTEGER NOT NULL DEFAULT 0,
      spent_time INTEGER NOT NULL DEFAULT 0,
      branch_id TEXT NOT NULL DEFAULT 'main'
        REFERENCES branches(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      CHECK ((scheduled_date IS NULL) = (scheduled_time IS NULL)),
      CHECK ((scheduled_date IS NULL) = (scheduled_timezone IS NULL))
    );

    INSERT INTO tasks_v010 (${TASK_COLUMNS}) SELECT ${TASK_COLUMNS} FROM tasks;

    CREATE TEMP TABLE task_tags_v010 AS SELECT * FROM task_tags;
    CREATE TEMP TABLE task_attachments_v010 AS SELECT * FROM task_attachments;

    DROP TABLE tasks;
    ALTER TABLE tasks_v010 RENAME TO tasks;

    INSERT OR IGNORE INTO task_tags (task_id, tag_id) SELECT task_id, tag_id FROM task_tags_v010;
    INSERT OR IGNORE INTO task_attachments (task_id, file_id) SELECT task_id, file_id FROM task_attachments_v010;

    DROP TABLE task_tags_v010;
    DROP TABLE task_attachments_v010;

    CREATE INDEX idx_tasks_branch_date ON tasks(branch_id, scheduled_date) WHERE deleted_at IS NULL;
    CREATE INDEX idx_tasks_date ON tasks(scheduled_date) WHERE deleted_at IS NULL;
    CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
    CREATE INDEX idx_tasks_deleted ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;
    CREATE INDEX idx_tasks_backlog ON tasks(branch_id, order_index) WHERE status = 'backlog' AND deleted_at IS NULL;
  `,
  down: `
    CREATE TABLE tasks_v009 (
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

    INSERT INTO tasks_v009 (${TASK_COLUMNS}) SELECT ${TASK_COLUMNS} FROM tasks WHERE scheduled_date IS NOT NULL;

    CREATE TEMP TABLE task_tags_v009r AS SELECT * FROM task_tags;
    CREATE TEMP TABLE task_attachments_v009r AS SELECT * FROM task_attachments;

    DROP TABLE tasks;
    ALTER TABLE tasks_v009 RENAME TO tasks;

    INSERT OR IGNORE INTO task_tags (task_id, tag_id)
      SELECT task_id, tag_id FROM task_tags_v009r WHERE task_id IN (SELECT id FROM tasks);
    INSERT OR IGNORE INTO task_attachments (task_id, file_id)
      SELECT task_id, file_id FROM task_attachments_v009r WHERE task_id IN (SELECT id FROM tasks);

    DROP TABLE task_tags_v009r;
    DROP TABLE task_attachments_v009r;

    CREATE INDEX idx_tasks_branch_date ON tasks(branch_id, scheduled_date) WHERE deleted_at IS NULL;
    CREATE INDEX idx_tasks_date ON tasks(scheduled_date) WHERE deleted_at IS NULL;
    CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
    CREATE INDEX idx_tasks_deleted ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;
  `,
}
