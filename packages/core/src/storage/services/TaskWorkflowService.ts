import {performance} from "node:perf_hooks"

import {resolveActorProvider} from "@daily/protocol"

import {confirmedWorkflowSeconds} from "../../utils/tasks/workflowTime"
import {canonicalWorkflowValue, validateWorkflowCommand, workflowDigest} from "../../utils/tasks/workflowValidation"
import {TaskCommentModel} from "../models/TaskCommentModel"
import {TaskEventModel} from "../models/TaskEventModel"
import {TaskModel} from "../models/TaskModel"
import {WorkflowRecordModel} from "../models/WorkflowRecordModel"
import {TaskWorkflowError} from "../TaskWorkflowError"
import {TaskEventsService} from "./TaskEventsService"

import type {
  TaskWorkflowCommand,
  TaskWorkflowContext,
  TaskWorkflowProposal,
  TaskWorkflowReceipt,
  TaskWorkflowRecord,
  TaskWorkflowState,
} from "@daily/protocol"
import type {SqliteDriver} from "../../database/SqliteDriver"
import type {Changeset} from "../../types/storage"

export type TaskWorkflowHost = {runtimeId: string; now?: () => number; monotonicNow?: () => number}

type ClockObservation = {wall: number; monotonic: number}

export class TaskWorkflowService {
  private _tasks: TaskModel
  private _records: WorkflowRecordModel

  constructor(
    private _db: SqliteDriver,
    private _host: TaskWorkflowHost,
  ) {
    this._tasks = new TaskModel(_db)
    this._records = new WorkflowRecordModel(_db)
  }

  get(taskId: string): TaskWorkflowState {
    return this._get(taskId, this._observe())
  }

  execute(command: TaskWorkflowCommand, context: TaskWorkflowContext): {receipt: TaskWorkflowReceipt; changeset: Changeset} {
    if (this._db.inTransaction) throw new TaskWorkflowError("conflict", "Workflow commands require their own synchronous transaction.")
    this._db.exec("BEGIN IMMEDIATE")
    try {
      const result = this._execute(command, context, this._observe())
      this._db.exec("COMMIT")
      return result
    } catch (error) {
      if (this._db.inTransaction) this._db.exec("ROLLBACK")
      throw error
    }
  }

  private _get(taskId: string, observed: ClockObservation): TaskWorkflowState {
    const task = this._tasks.getTask(taskId)
    if (!task) throw new TaskWorkflowError("not_found", "The task no longer exists.")
    const records = this._records.getByTask(taskId)
    const sessions = this._sessions(records)
    return {
      task,
      records,
      revision: workflowDigest({task, generation: this._taskGeneration(taskId), ids: records.map((record) => record.id).sort()}),
      activeSessions: sessions.map((record) => ({
        sessionId: "sessionId" in record.command ? record.command.sessionId : "",
        actorId: record.actorId,
        runtimeId: record.runtimeId,
        checkpointAt: record.createdAt,
        expiresAt: record.createdAt + 60000,
        expired: !this._isCheckpointLive(record, taskId, records, observed),
      })),
      proposals: records.flatMap((record): TaskWorkflowProposal[] =>
        record.command.kind === "propose"
          ? [
              {
                id: record.id,
                commentId: record.proposalCommentId,
                actorId: record.actorId,
                changes: record.command.changes,
                reason: record.command.reason,
                status: "pending",
              },
            ]
          : [],
      ),
      confirmedSeconds: confirmedWorkflowSeconds(records, taskId),
    }
  }

  private _execute(
    command: TaskWorkflowCommand,
    context: TaskWorkflowContext,
    observed: ClockObservation,
  ): {receipt: TaskWorkflowReceipt; changeset: Changeset} {
    this._validate(command, context)
    const source = {kind: context.source.kind, provider: resolveActorProvider(context.source)}
    const canonicalRequest = canonicalWorkflowValue({command, actorId: context.actorId, source})
    const id = workflowDigest({actorId: context.actorId, operationId: command.operationId})
    const previous = this._records.get(id)
    if (previous) {
      if (previous.canonicalRequest === canonicalRequest) return {receipt: previous.receipt, changeset: {}}
      throw new TaskWorkflowError(
        "conflict",
        "This operation ID already names a different request. Use a new operation ID.",
        this._tasks.getTask(command.taskId) ? this._get(command.taskId, observed) : null,
      )
    }
    const current = this._get(command.taskId, observed)
    if (command.expectedRevision !== current.revision)
      throw new TaskWorkflowError("stale_revision", "Read the current workflow and retry with a new operation ID.", current)
    if (current.task.deletedAt !== null || current.task.status === "done" || current.task.status === "cancelled") {
      throw new TaskWorkflowError("forbidden", "Only the person can reopen resolved or deleted work.", current)
    }
    const changeset: Changeset = {}
    if (command.kind === "transition" && command.stage !== "planning") {
      if (!current.task.scheduled?.date)
        throw new TaskWorkflowError("forbidden", "Ask the person to schedule this task before starting implementation.", current)
      const status = command.stage === "implementation" ? "in_progress" : "ready_to_merge"
      const updated = this._tasks.updateTask(command.taskId, {status})!
      new TaskEventsService(new TaskEventModel(this._db)).recordUpdate(current.task, updated, source, {dateExplicit: false})
      changeset.tasks = {upserted: [updated]}
    }
    let proposalCommentId: string | null = null
    if (command.kind === "propose") {
      const comment = new TaskCommentModel(this._db).createComment({
        taskId: command.taskId,
        branchId: current.task.branchId,
        content: `Pending agent proposal: ${JSON.stringify(command.changes)}\n\nReason: ${command.reason}`,
        kind: source.kind,
        provider: source.provider,
      })
      proposalCommentId = comment.id
      changeset.comments = {upserted: [comment]}
    }
    const now = observed.wall
    if (
      command.kind === "start" &&
      current.records.some((record) => "sessionId" in record.command && record.command.sessionId === command.sessionId)
    ) {
      throw new TaskWorkflowError("conflict", "A session ID cannot be reused. Start with a new session ID.", current)
    }
    let interval: TaskWorkflowRecord["interval"] = null
    if (command.kind === "heartbeat" || command.kind === "pause") {
      const checkpoint = this._sessions(current.records).find(
        (record) => record.actorId === context.actorId && "sessionId" in record.command && record.command.sessionId === command.sessionId,
      )
      if (!checkpoint) throw new TaskWorkflowError("session_expired", "Start a new active-work session before confirming time.", current)
      if (!this._isCheckpointLive(checkpoint, command.taskId, current.records, observed)) {
        if (command.kind === "heartbeat")
          throw new TaskWorkflowError(
            "session_expired",
            "This session expired or the task changed. Start a new session with a new session ID.",
            current,
          )
      } else {
        const elapsed = Math.min(now - checkpoint.createdAt, observed.monotonic - checkpoint.checkpointMonotonic!)
        interval = {from: checkpoint.createdAt, to: checkpoint.createdAt + elapsed}
      }
    }
    const confirmedSeconds = confirmedWorkflowSeconds(current.records, command.taskId, interval)
    const time = this._db
      .prepare("SELECT spent_time, workflow_time_baseline FROM tasks WHERE id = ?")
      .get<{spent_time: number; workflow_time_baseline: number}>(command.taskId)!
    const task = {
      ...this._tasks.getTask(command.taskId)!,
      spentTime: Math.max(0, time.spent_time + Math.max(0, confirmedSeconds - time.workflow_time_baseline)),
    }
    const receipt: TaskWorkflowReceipt = {
      operationId: command.operationId,
      taskId: command.taskId,
      revision: workflowDigest({
        task,
        generation: this._taskGeneration(command.taskId),
        ids: [...current.records.map((record) => record.id), id].sort(),
      }),
      kind: command.kind,
      recordId: id,
      confirmedSeconds,
    }
    const record: TaskWorkflowRecord = {
      id,
      taskId: command.taskId,
      actorId: context.actorId,
      source,
      runtimeId: this._host.runtimeId,
      checkpointMonotonic: observed.monotonic,
      proposalCommentId,
      command,
      canonicalRequest,
      createdAt: now,
      sequence: current.records.length,
      taskGeneration: this._checkpointGeneration(command.taskId, current.records),
      interval,
      receipt,
    }
    this._records.append(record)
    if (interval) changeset.tasks = {upserted: [this._tasks.getTask(command.taskId)!]}
    return {receipt: record.receipt, changeset}
  }

  private _isCheckpointLive(record: TaskWorkflowRecord, taskId: string, records: TaskWorkflowRecord[], observed: ClockObservation): boolean {
    const task = this._tasks.getTask(taskId)
    const wallElapsed = observed.wall - record.createdAt
    const monotonicElapsed = record.checkpointMonotonic === null ? NaN : observed.monotonic - record.checkpointMonotonic
    return (
      !!task &&
      task.deletedAt === null &&
      task.status !== "done" &&
      task.status !== "cancelled" &&
      record.runtimeId === this._host.runtimeId &&
      wallElapsed >= 0 &&
      wallElapsed <= 60000 &&
      monotonicElapsed >= 0 &&
      monotonicElapsed <= 60000 &&
      // Independent host samples may straddle one wall-clock millisecond; any larger drift forfeits the tail.
      Math.abs(wallElapsed - monotonicElapsed) <= 1 &&
      record.taskGeneration === this._checkpointGeneration(taskId, records)
    )
  }

  private _observe(): ClockObservation {
    const observed = {wall: this._host.now?.() ?? Date.now(), monotonic: this._host.monotonicNow?.() ?? performance.now()}
    if (
      !Number.isSafeInteger(observed.wall) ||
      observed.wall < 0 ||
      !Number.isFinite(observed.monotonic) ||
      observed.monotonic < 0 ||
      observed.monotonic > Number.MAX_SAFE_INTEGER
    )
      throw new TaskWorkflowError("invalid_request", "The host clock observation is invalid.")
    return observed
  }

  private _sessions(records: TaskWorkflowRecord[]): TaskWorkflowRecord[] {
    const latest = new Map<string, TaskWorkflowRecord>()
    for (const record of [...records].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id))) {
      if ("sessionId" in record.command) latest.set(`${record.actorId}:${record.command.sessionId}`, record)
    }
    return [...latest.values()].filter((record) => record.command.kind !== "pause")
  }

  private _checkpointGeneration(taskId: string, records: TaskWorkflowRecord[]): string {
    return workflowDigest({
      row: this._db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId),
      tags: this._tasks.getTask(taskId)?.tags.toSorted((a, b) => a.id.localeCompare(b.id)) ?? [],
      transitions: records
        .filter((record) => record.command.kind === "transition")
        .map((record) => record.id)
        .sort(),
    })
  }

  private _taskGeneration(taskId: string): string {
    return (
      this._db.prepare("SELECT workflow_generation FROM tasks WHERE id = ?").get<{workflow_generation: string}>(taskId)?.workflow_generation ?? ""
    )
  }

  private _validate(command: TaskWorkflowCommand, context: TaskWorkflowContext): void {
    if (
      typeof context?.actorId !== "string" ||
      !context.actorId.trim() ||
      !["mcp", "agent"].includes(context.source?.kind) ||
      (context.source.provider != null && typeof context.source.provider !== "string")
    )
      throw new TaskWorkflowError("forbidden", "A host-owned agent identity is required.")
    validateWorkflowCommand(command)
  }
}
