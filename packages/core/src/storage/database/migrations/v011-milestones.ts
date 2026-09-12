import type {Migration} from "../scripts/migrate"

/**
 * Adds the `milestones` table, `tasks.milestone_id` and `branches.description`, and rebuilds
 * `tags` so a name is unique per project rather than globally. SQLite can neither add a column
 * to a `UNIQUE` constraint nor drop one, so `tags` is recreated.
 *
 * `foreign_keys` is ON, and `runMigrations` has already opened a transaction — SQLite ignores
 * `PRAGMA foreign_keys` inside one, so the pragma cannot be toggled around this step.
 * `DROP TABLE tags` therefore performs an implicit delete that cascades into `task_tags`,
 * emptying it. It is copied into a temp table first and restored after the rename.
 */
export const v011: Migration = {
  version: 11,
  name: "milestones",
  up: (db) => {
    db.exec(`
      CREATE TABLE milestones (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL DEFAULT 'main' REFERENCES branches(id),
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        target_date TEXT,
        order_index REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX idx_milestones_branch ON milestones(branch_id) WHERE deleted_at IS NULL;

      ALTER TABLE tasks ADD COLUMN milestone_id TEXT REFERENCES milestones(id);
      CREATE INDEX idx_tasks_milestone ON tasks(milestone_id) WHERE deleted_at IS NULL;

      ALTER TABLE branches ADD COLUMN description TEXT NOT NULL DEFAULT '';

      CREATE TEMP TABLE _v011_task_tags AS SELECT * FROM task_tags;

      CREATE TABLE tags_new (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL DEFAULT 'main' REFERENCES branches(id),
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        UNIQUE (branch_id, name)
      );

      INSERT INTO tags_new (id, branch_id, name, color, created_at, updated_at, deleted_at)
        SELECT id, 'main', name, color, created_at, updated_at, deleted_at FROM tags;

      DROP TABLE tags;
      ALTER TABLE tags_new RENAME TO tags;

      INSERT INTO task_tags SELECT * FROM _v011_task_tags;
      DROP TABLE _v011_task_tags;

      CREATE INDEX idx_tags_active ON tags(id) WHERE deleted_at IS NULL;
      CREATE INDEX idx_tags_branch ON tags(branch_id) WHERE deleted_at IS NULL;
    `)
  },
  down: (db) => {
    db.exec(`
      CREATE TEMP TABLE _v011_task_tags AS SELECT * FROM task_tags;

      CREATE TABLE tags_old (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      -- A global UNIQUE(name) cannot hold the same name twice, and there is no honest way to
      -- merge two projects' tags into one, so downgrading keeps the earliest tag per name and
      -- drops the rest.
      INSERT INTO tags_old (id, name, color, created_at, updated_at, deleted_at)
        SELECT id, name, color, created_at, updated_at, deleted_at FROM tags t
        WHERE t.id = (SELECT x.id FROM tags x WHERE x.name = t.name ORDER BY x.created_at ASC, x.id ASC LIMIT 1);

      DROP TABLE tags;
      ALTER TABLE tags_old RENAME TO tags;

      INSERT INTO task_tags SELECT * FROM _v011_task_tags WHERE tag_id IN (SELECT id FROM tags);
      DROP TABLE _v011_task_tags;

      CREATE INDEX idx_tags_active ON tags(id) WHERE deleted_at IS NULL;

      DROP INDEX idx_tasks_milestone;
      ALTER TABLE tasks DROP COLUMN milestone_id;

      ALTER TABLE branches DROP COLUMN description;

      DROP TABLE milestones;
    `)
  },
}
