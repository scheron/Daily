import type {Migration} from "../scripts/migrate"

export const v003: Migration = {
  version: 3,
  name: "remove-delta-sync",
  up: `
    DROP TRIGGER IF EXISTS trg_tasks_insert;
    DROP TRIGGER IF EXISTS trg_tasks_update;
    DROP TRIGGER IF EXISTS trg_tasks_delete;
    DROP TRIGGER IF EXISTS trg_tags_insert;
    DROP TRIGGER IF EXISTS trg_tags_update;
    DROP TRIGGER IF EXISTS trg_tags_delete;
    DROP TRIGGER IF EXISTS trg_branches_insert;
    DROP TRIGGER IF EXISTS trg_branches_update;
    DROP TRIGGER IF EXISTS trg_branches_delete;
    DROP TRIGGER IF EXISTS trg_files_insert;
    DROP TRIGGER IF EXISTS trg_files_update;
    DROP TRIGGER IF EXISTS trg_files_delete;
    DROP TRIGGER IF EXISTS trg_task_tags_insert;
    DROP TRIGGER IF EXISTS trg_task_tags_delete;
    DROP TRIGGER IF EXISTS trg_task_attachments_insert;
    DROP TRIGGER IF EXISTS trg_task_attachments_delete;
    DROP TRIGGER IF EXISTS trg_settings_update;

    DROP TABLE IF EXISTS change_log;
    DROP TABLE IF EXISTS sync_audit;
    DROP TABLE IF EXISTS sync_meta;
  `,
  down: "",
}
