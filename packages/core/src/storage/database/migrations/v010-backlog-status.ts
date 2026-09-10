import type {Migration} from "../scripts/migrate"

/**
 * Rebuilds `tasks` so `status` accepts `backlog` and the three `scheduled_*`
 * columns accept NULL. SQLite can neither alter a CHECK constraint nor drop a
 * NOT NULL constraint, so the table is recreated.
 *
 * `foreign_keys` is ON, and `runMigrations` has already opened a transaction —
 * SQLite ignores `PRAGMA foreign_keys` inside one, so the pragma cannot be
 * toggled around this step. `DROP TABLE tasks` therefore performs an implicit
 * delete that cascades into `task_tags` and `task_attachments`, emptying both.
 * Both are copied into temp tables first and restored after the rename.
 */
export const v010: Migration = {
  version: 10,
  name: "backlog-status",
  up: (db) => {
    db.exec(`
      CREATE TEMP TABLE _v010_task_tags AS SELECT * FROM task_tags;
      CREATE TEMP TABLE _v010_task_attachments AS SELECT * FROM task_attachments;

      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK(status IN ('active', 'backlog', 'discarded', 'done')),
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
        deleted_at TEXT
      );

      INSERT INTO tasks_new (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
        SELECT id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at
        FROM tasks;

      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;

      INSERT INTO task_tags SELECT * FROM _v010_task_tags;
      INSERT INTO task_attachments SELECT * FROM _v010_task_attachments;

      DROP TABLE _v010_task_tags;
      DROP TABLE _v010_task_attachments;

      CREATE INDEX idx_tasks_branch_date ON tasks(branch_id, scheduled_date) WHERE deleted_at IS NULL;
      CREATE INDEX idx_tasks_date ON tasks(scheduled_date) WHERE deleted_at IS NULL;
      CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
      CREATE INDEX idx_tasks_deleted ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;
    `)
  },
  down: (db) => {
    db.exec(`
      CREATE TEMP TABLE _v010_task_tags AS SELECT * FROM task_tags;
      CREATE TEMP TABLE _v010_task_attachments AS SELECT * FROM task_attachments;

      CREATE TABLE tasks_old (
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

      -- A backlog task has no date to restore, and there is no honest way to
      -- invent one, so downgrading drops backlog tasks rather than guessing.
      INSERT INTO tasks_old (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
        SELECT id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at
        FROM tasks
        WHERE status != 'backlog' AND scheduled_date IS NOT NULL AND scheduled_time IS NOT NULL AND scheduled_timezone IS NOT NULL;

      DROP TABLE tasks;
      ALTER TABLE tasks_old RENAME TO tasks;

      INSERT INTO task_tags SELECT * FROM _v010_task_tags WHERE task_id IN (SELECT id FROM tasks);
      INSERT INTO task_attachments SELECT * FROM _v010_task_attachments WHERE task_id IN (SELECT id FROM tasks);

      DROP TABLE _v010_task_tags;
      DROP TABLE _v010_task_attachments;

      CREATE INDEX idx_tasks_branch_date ON tasks(branch_id, scheduled_date) WHERE deleted_at IS NULL;
      CREATE INDEX idx_tasks_date ON tasks(scheduled_date) WHERE deleted_at IS NULL;
      CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
      CREATE INDEX idx_tasks_deleted ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;
    `)
  },
}
