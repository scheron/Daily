import {isDeepStrictEqual} from "node:util"

import {validateWorkflowGuidanceRecord} from "../../utils/task-workflow/validateWorkflowGuidanceRecord"
import {TaskWorkflowError} from "../../errors/task-workflow/TaskWorkflowError"
import {TaskWorkflowErrorCode} from "../../errors/task-workflow/TaskWorkflowErrorCode"

import type {WorkflowGuidanceRecord} from "@daily/protocol"
import type {SqliteDriver} from "../../database/SqliteDriver"

export class WorkflowGuidanceModel {
  constructor(private _db: SqliteDriver) {}

  getAll(): WorkflowGuidanceRecord[] {
    return this._db
      .prepare("SELECT data FROM workflow_guidance_records ORDER BY id")
      .all<{data: string}>()
      .map((row) => {
        const record = JSON.parse(row.data)
        validateWorkflowGuidanceRecord(record)
        return record
      })
  }

  append(record: WorkflowGuidanceRecord): void {
    validateWorkflowGuidanceRecord(record)
    const existing = this.getAll().find((item) => item.id === record.id)
    if (existing && !isDeepStrictEqual(existing, record))
      throw new TaskWorkflowError(TaskWorkflowErrorCode.Conflict, "Conflicting immutable guidance revisions block sync. No history is discarded.")
    this._db.prepare("INSERT OR IGNORE INTO workflow_guidance_records (id, data) VALUES (?, ?)").run(record.id, JSON.stringify(record))
  }
}
