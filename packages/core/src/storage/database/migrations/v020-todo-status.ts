import type {Migration} from "../scripts/migrate"

/** Rebuilds the status constraint while preserving the task_tags rows cascaded by DROP TABLE. */
export const v020: Migration = {
  version: 20,
  name: "todo-status",
  up: (db) => rebuildTasks(db, true),
  down: (db) => rebuildTasks(db, false),
}

function rebuildTasks(db: Parameters<Exclude<Migration["up"], string>>[0], upgrade: boolean) {
  const statuses = upgrade
    ? "'backlog', 'todo', 'ready_for_agent', 'in_progress', 'ready_to_merge', 'done', 'cancelled'"
    : "'backlog', 'ready_for_agent', 'in_progress', 'ready_to_merge', 'done', 'cancelled'"
  const status = upgrade ? "status" : "CASE status WHEN 'todo' THEN 'in_progress' ELSE status END"

  db.exec(`
    CREATE TEMP TABLE _v020_task_tags AS SELECT * FROM task_tags;
    CREATE TABLE tasks_new (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT '${upgrade ? "todo" : "in_progress"}' CHECK(status IN (${statuses})),
      content TEXT NOT NULL DEFAULT '',
      minimized INTEGER NOT NULL DEFAULT 0,
      order_index REAL NOT NULL DEFAULT 0,
      scheduled_date TEXT,
      scheduled_time TEXT,
      scheduled_timezone TEXT,
      estimated_time INTEGER NOT NULL DEFAULT 0,
      spent_time INTEGER NOT NULL DEFAULT 0,
      branch_id TEXT NOT NULL DEFAULT 'main' REFERENCES branches(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      milestone_id TEXT REFERENCES milestones(id),
      priority TEXT NOT NULL DEFAULT 'none'
    );
    INSERT INTO tasks_new SELECT id, ${status}, content, minimized, order_index, scheduled_date,
      scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at,
      updated_at, deleted_at, milestone_id, priority FROM tasks;
    DROP TABLE tasks;
    ALTER TABLE tasks_new RENAME TO tasks;
    INSERT INTO task_tags SELECT * FROM _v020_task_tags;
    DROP TABLE _v020_task_tags;
    CREATE INDEX idx_tasks_branch_date ON tasks(branch_id, scheduled_date) WHERE deleted_at IS NULL;
    CREATE INDEX idx_tasks_date ON tasks(scheduled_date) WHERE deleted_at IS NULL;
    CREATE INDEX idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL;
    CREATE INDEX idx_tasks_deleted ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;
    CREATE INDEX idx_tasks_milestone ON tasks(milestone_id) WHERE deleted_at IS NULL;
  `)
}
