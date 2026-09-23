import {APP_CONFIG} from "@daily/protocol"

import {extractFileIds} from "../../../utils/files/extractFileIds"

import type {SqliteDriver} from "../../../database/SqliteDriver"
import type {Migration} from "../scripts/migrate"

/**
 * Folds `task_attachments` into the one anchor a file keeps after this migration: a
 * `![name](daily://file/id)` link in the task's own `content`. A row whose file id is already
 * mentioned in its task's content is dropped as a duplicate, not written twice; a row whose file
 * has no matching `files` entry is skipped, since there is no name to link it with. `content` is
 * read once per task and folded in JS — `extractFileIds` is a function, not SQL — then the table
 * and its index go. There is no honest `down`: rows folded into text cannot be told apart from
 * text a person typed by hand.
 */
export const v016: Migration = {
  version: 16,
  name: "attachments-into-content",
  up: (db: SqliteDriver) => {
    const rows = db
      .prepare(
        `SELECT ta.task_id AS taskId, ta.file_id AS fileId, f.name AS name
         FROM task_attachments ta JOIN files f ON f.id = ta.file_id
         ORDER BY ta.rowid`,
      )
      .all<{taskId: string; fileId: string; name: string}>()

    const contentByTask = new Map<string, string>()
    const dirtyTaskIds: string[] = []

    for (const {taskId, fileId, name} of rows) {
      let content = contentByTask.get(taskId)
      if (content === undefined) {
        const task = db.prepare(`SELECT content FROM tasks WHERE id = ?`).get<{content: string}>(taskId)
        if (!task) continue
        content = task.content
      }

      if (extractFileIds(content).includes(fileId)) {
        contentByTask.set(taskId, content)
        continue
      }

      const link = `![${name}](${APP_CONFIG.filesProtocol}/${fileId})`
      const nextContent = content.length > 0 ? `${content}\n\n${link}` : link
      contentByTask.set(taskId, nextContent)
      dirtyTaskIds.push(taskId)
    }

    const updateContent = db.prepare(`UPDATE tasks SET content = ? WHERE id = ?`)
    for (const taskId of dirtyTaskIds) {
      updateContent.run(contentByTask.get(taskId) as string, taskId)
    }

    db.exec(`DROP INDEX IF EXISTS idx_task_attachments_file;`)
    db.exec(`DROP TABLE task_attachments;`)
  },
  down: "",
}
