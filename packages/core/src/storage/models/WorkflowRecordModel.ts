import {isDeepStrictEqual} from "node:util"

import {validateWorkflowRecord} from "../../utils/tasks/workflowValidation"
import {TaskWorkflowError} from "../TaskWorkflowError"

import type {TaskWorkflowRecord} from "@daily/protocol"
import type {SqliteDriver} from "../../database/SqliteDriver"

export class WorkflowRecordModel {
  constructor(private _db: SqliteDriver) {}

  get(id: string): TaskWorkflowRecord | null {
    const row = this._db.prepare("SELECT data FROM workflow_records WHERE id = ?").get<{data: string}>(id)
    return row ? this._read(row.data) : null
  }

  getByTask(taskId: string): TaskWorkflowRecord[] {
    return this._db
      .prepare("SELECT data FROM workflow_records WHERE task_id = ? ORDER BY id")
      .all<{data: string}>(taskId)
      .map((row) => this._read(row.data))
  }

  getAll(): TaskWorkflowRecord[] {
    return this._db
      .prepare("SELECT data FROM workflow_records ORDER BY id")
      .all<{data: string}>()
      .map((row) => this._read(row.data))
  }

  append(record: TaskWorkflowRecord): void {
    validateWorkflowRecord(record)
    const existing = this.get(record.id)
    if (existing && !isDeepStrictEqual(existing, record))
      throw new TaskWorkflowError("conflict", "Conflicting immutable workflow records block sync. No record is discarded.")
    this._db
      .prepare("INSERT OR IGNORE INTO workflow_records (id, task_id, data) VALUES (?, ?, ?)")
      .run(record.id, record.taskId, JSON.stringify(record))
  }

  private _read(data: string): TaskWorkflowRecord {
    const record = JSON.parse(data)
    if (record && !Object.hasOwn(record, "checkpointMonotonic") && !Object.hasOwn(record, "proposalCommentId")) {
      record.checkpointMonotonic = null
      record.proposalCommentId = null
    }
    validateWorkflowRecord(record)
    return record
  }
}
