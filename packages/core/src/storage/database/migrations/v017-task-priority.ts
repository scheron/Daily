import type {Migration} from "../scripts/migrate"

/**
 * Gives a task a priority: one of `none`, `urgent`, `high`, `medium`, `low`. `none` is a level in
 * its own right, so the column is never empty and every task that existed before reads as `none`.
 */
export const v017: Migration = {
  version: 17,
  name: "task-priority",
  up: `
    ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'none';
  `,
  down: `
    ALTER TABLE tasks DROP COLUMN priority;
  `,
}
