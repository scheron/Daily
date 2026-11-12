import {randomUUID} from "node:crypto"
import {performance} from "node:perf_hooks"

import {MAX_OBSERVED_WORKFLOW_INTERVAL_SECONDS, planTaskUpdate, resolveActorProvider} from "@daily/protocol"
import {getTime, getTimezone, getToday} from "@daily/std"

import {canonicalWorkflowValue} from "../../utils/task-workflow/canonicalWorkflowValue"
import {confirmedWorkflowSeconds} from "../../utils/task-workflow/confirmedWorkflowSeconds"
import {validateWorkflowCommand} from "../../utils/task-workflow/validateWorkflowCommand"
import {validateWorkflowResolution} from "../../utils/task-workflow/validateWorkflowResolution"
import {workflowDigest} from "../../utils/task-workflow/workflowDigest"
import {TaskWorkflowError} from "../../errors/task-workflow/TaskWorkflowError"
import {TaskWorkflowErrorCode} from "../../errors/task-workflow/TaskWorkflowErrorCode"
import {MilestoneModel} from "../models/MilestoneModel"
import {TagModel} from "../models/TagModel"
import {TaskCommentModel} from "../models/TaskCommentModel"
import {TaskEventModel} from "../models/TaskEventModel"
import {TaskModel} from "../models/TaskModel"
import {WorkflowRecordModel} from "../models/WorkflowRecordModel"
import {TaskEventsService} from "./TaskEventsService"
import {WorkflowGuidanceService} from "./WorkflowGuidanceService"

import type {
  AgentSessionState,
  Task,
  TaskPlanningChanges,
  TaskWorkflowCommand,
  TaskWorkflowContext,
  TaskWorkflowProposal,
  TaskWorkflowReceipt,
  TaskWorkflowRecord,
  TaskWorkflowRecordedCommand,
  TaskWorkflowResolution,
  TaskWorkflowSession,
  TaskWorkflowState,
  WorkflowGuidanceUpdate,
} from "@daily/protocol"
import type {SqliteDriver} from "../../database/SqliteDriver"
import type {Changeset} from "../../types/storage"
import type {TaskWorkflowHost} from "../../types/taskWorkflow"

type ClockObservation = {wall: number; monotonic: number}

export class TaskWorkflowService {
  private _tasks: TaskModel
  private _records: WorkflowRecordModel
  private _guidance: WorkflowGuidanceService

  constructor(
    private _db: SqliteDriver,
    private _host: TaskWorkflowHost,
  ) {
    this._tasks = new TaskModel(_db)
    this._records = new WorkflowRecordModel(_db)
    this._guidance = new WorkflowGuidanceService(_db)
  }

  get(taskId: string): TaskWorkflowState {
    return this._get(taskId, this._observe())
  }

  getGuidance(projectId?: string) {
    return this._guidance.get(projectId)
  }

  updateGuidance(update: WorkflowGuidanceUpdate) {
    return this._guidance.update(update, this._observe().wall)
  }

  execute(command: TaskWorkflowCommand, context: TaskWorkflowContext, joinTransaction = false): {receipt: TaskWorkflowReceipt; changeset: Changeset} {
    if (
      typeof context?.actorId !== "string" ||
      !context.actorId.trim() ||
      !["mcp", "agent"].includes(context.source?.kind) ||
      (context.source.provider != null && typeof context.source.provider !== "string")
    )
      throw new TaskWorkflowError(TaskWorkflowErrorCode.Forbidden, "A host-owned agent identity is required.")
    validateWorkflowCommand(command)
    return this._transaction(command, context, joinTransaction)
  }

  resolve(request: TaskWorkflowResolution, joinTransaction = false): {receipt: TaskWorkflowReceipt; changeset: Changeset} {
    const command: TaskWorkflowRecordedCommand = {...request, kind: "resolve"}
    validateWorkflowResolution(command)
    return this._transaction(command, {actorId: "human", source: {kind: "manual"}}, joinTransaction)
  }

  checkpointSessions(taskId: string, resume?: TaskWorkflowSession[]): TaskWorkflowSession[] {
    const current = this._get(taskId, this._observe())
    const sessions =
      resume ??
      current.activeSessions.filter((session) => session.runtimeId === this._host.runtimeId && session.connection === "connected" && !session.expired)
    for (const session of sessions) {
      const state = this._get(taskId, this._observe())
      const previous = [...state.records]
        .reverse()
        .find((record) => record.actorId === session.actorId && this._sessionId(record) === session.sessionId)!
      this._transaction(
        {
          taskId,
          operationId: `mutation-${randomUUID()}`,
          expectedRevision: state.revision,
          kind: "session_update",
          sessionId: session.sessionId,
          state: session.state,
        },
        {actorId: session.actorId, source: previous.source},
        true,
      )
    }
    return sessions
  }

  private _transaction(command: TaskWorkflowRecordedCommand, context: TaskWorkflowContext, joinTransaction: boolean) {
    const ownTransaction = !this._db.inTransaction
    if (!ownTransaction && !joinTransaction)
      throw new TaskWorkflowError(TaskWorkflowErrorCode.Conflict, "Workflow commands require their own transaction or a WorkStorage batch.")
    if (ownTransaction) this._db.exec("BEGIN IMMEDIATE")
    try {
      const result = this._execute(command, context, this._observe())
      if (ownTransaction) this._db.exec("COMMIT")
      return result
    } catch (error) {
      if (ownTransaction && this._db.inTransaction) this._db.exec("ROLLBACK")
      throw error
    }
  }

  private _get(taskId: string, observed: ClockObservation): TaskWorkflowState {
    const task = this._tasks.getTask(taskId)
    if (!task) throw new TaskWorkflowError(TaskWorkflowErrorCode.NotFound, "The task no longer exists.")
    const records = this._records.getByTask(taskId).sort(compareRecords)
    const guidance = this._guidance.get(task.branchId)
    const sessions = this._sessionRecords(records).map((record): TaskWorkflowSession => {
      const sessionId = this._sessionId(record)!
      const state = this._sessionState(record)!
      const first =
        records.find(
          (entry) =>
            entry.actorId === record.actorId &&
            this._sessionId(entry) === sessionId &&
            (entry.command.kind === "start" || entry.command.kind === "session_start"),
        ) ?? record
      const interrupted =
        (state === "working" || state === "waiting") &&
        (record.runtimeId !== this._host.runtimeId ||
          record.taskGeneration !== this._checkpointGeneration(taskId) ||
          record.checkpointMonotonic === null ||
          observed.wall < record.createdAt ||
          (record.checkpointMonotonic !== null && observed.monotonic < record.checkpointMonotonic))
      const uncertain = observed.wall - record.createdAt >= MAX_OBSERVED_WORKFLOW_INTERVAL_SECONDS * 1000
      const summary = [...records]
        .sort(compareRecords)
        .reverse()
        .find((entry) => entry.actorId === record.actorId && this._sessionId(entry) === sessionId && "summary" in entry.command)
      return {
        sessionId,
        actorId: record.actorId,
        runtimeId: record.runtimeId,
        state,
        summary: summary && "summary" in summary.command ? (summary.command.summary ?? null) : null,
        startedAt: first.createdAt,
        updatedAt: record.createdAt,
        connection: interrupted ? "interrupted" : uncertain && state === "working" ? "uncertain" : "connected",
        checkpointAt: record.createdAt,
        expiresAt: record.createdAt + MAX_OBSERVED_WORKFLOW_INTERVAL_SECONDS * 1000,
        expired: interrupted || (uncertain && state === "working"),
      }
    })
    const proposals = records.flatMap((record): TaskWorkflowProposal[] => {
      const changes = record.schema === 3 ? record.effectiveChanges : record.command.kind === "propose" ? record.command.changes : null
      if (!changes) return []
      const resolutions = records.filter((entry) => entry.command.kind === "resolve" && entry.command.proposalId === record.id).sort(compareRecords)
      const resolution = resolutions.at(-1)
      const originalValues = record.originalValues ?? {}
      const differingDecisions = new Set(resolutions.map((entry) => (entry.command.kind === "resolve" ? entry.command.decision : ""))).size > 1
      return [
        {
          id: record.id,
          commentId: record.proposalCommentId,
          actorId: record.actorId,
          changes,
          originalValues,
          reason:
            record.command.kind === "propose"
              ? record.command.reason
              : "This status transition changes the scheduled day. Review the exact status and schedule together.",
          status: resolution?.command.kind === "resolve" ? resolution.command.decision : "pending",
          resolutionRecordId: resolution?.id ?? null,
          conflict:
            differingDecisions || (!resolution && ((record.schema !== 2 && record.schema !== 3) || !this._originalValuesMatch(task, originalValues))),
        },
      ]
    })
    return {
      task,
      records,
      guidance,
      sessions,
      proposals,
      revision: workflowDigest({
        task,
        generation: this._taskGeneration(taskId),
        ids: records.map((record) => record.id).sort(),
        guidance: [guidance.workspace.revision, guidance.project?.revision ?? null],
      }),
      activeSessions: sessions.filter((session) => session.state === "working" || session.state === "waiting"),
      confirmedSeconds: confirmedWorkflowSeconds(records, taskId),
    }
  }

  private _execute(
    command: TaskWorkflowRecordedCommand,
    context: TaskWorkflowContext,
    observed: ClockObservation,
  ): {receipt: TaskWorkflowReceipt; changeset: Changeset} {
    const source = {kind: context.source.kind, provider: resolveActorProvider(context.source)}
    const canonicalRequest = canonicalWorkflowValue({command, actorId: context.actorId, source})
    const id = workflowDigest({actorId: context.actorId, operationId: command.operationId})
    const previous = this._records.get(id)
    if (previous) {
      if (previous.canonicalRequest === canonicalRequest) return {receipt: previous.receipt, changeset: {}}
      throw new TaskWorkflowError(
        TaskWorkflowErrorCode.Conflict,
        "This operation ID already names a different request. Use a new operation ID.",
        this._tasks.getTask(command.taskId) ? this._get(command.taskId, observed) : null,
      )
    }
    let current = this._get(command.taskId, observed)
    if (command.expectedRevision !== current.revision)
      throw new TaskWorkflowError(TaskWorkflowErrorCode.StaleRevision, "Read the current workflow and retry with a new operation ID.", current)
    if (current.task.deletedAt !== null && command.kind !== "resolve" && !(command.kind === "propose" && command.changes.deletedAt === null))
      throw new TaskWorkflowError(TaskWorkflowErrorCode.NotFound, "The task was deleted.", current)

    let sessionId: string | null = "sessionId" in command ? command.sessionId : null
    let sessionState: AgentSessionState | null = null
    const owned = this._sessionRecords(current.records).filter((record) => record.actorId === context.actorId)
    let checkpoint =
      (sessionId
        ? owned.find((record) => this._sessionId(record) === sessionId)
        : owned.find((record) => this._sessionState(record) === "working")) ?? null
    if (command.kind === "start" || command.kind === "session_start") {
      if (current.records.some((record) => this._sessionId(record) === sessionId))
        throw new TaskWorkflowError(TaskWorkflowErrorCode.Conflict, "A session ID cannot be reused. Start with a new session ID.", current)
      sessionState = "working"
      checkpoint = null
    } else if (sessionId) {
      if (!checkpoint) throw new TaskWorkflowError(TaskWorkflowErrorCode.Forbidden, "Only the session's authenticated actor can update it.", current)
      if (["finished", "error"].includes(this._sessionState(checkpoint)!))
        throw new TaskWorkflowError(TaskWorkflowErrorCode.Conflict, "This session is terminal. Start a new session ID.", current)
      sessionState = command.kind === "session_update" ? command.state : command.kind === "pause" ? "waiting" : "working"
    } else if (checkpoint && command.kind !== "resolve") {
      sessionId = this._sessionId(checkpoint)
      sessionState = this._sessionState(checkpoint)
    }

    let interval: TaskWorkflowRecord["interval"] = null
    if (checkpoint && this._sessionState(checkpoint) === "working" && this._canCount(checkpoint, command.taskId, observed)) {
      const elapsed = Math.min(observed.wall - checkpoint.createdAt, observed.monotonic - checkpoint.checkpointMonotonic!)
      interval = {from: checkpoint.createdAt, to: checkpoint.createdAt + elapsed}
    }
    const changeset: Changeset = {}
    let originalValues: TaskPlanningChanges | null = null
    let effectiveChanges: TaskPlanningChanges | null = null
    let proposalCommentId: string | null = null
    if (command.kind === "transition") {
      const status =
        "status" in command
          ? command.status
          : command.stage === "planning"
            ? current.task.status
            : command.stage === "implementation"
              ? "in_progress"
              : "ready_to_merge"
      if ((status === "done" || status === "cancelled") && !current.guidance.allowCompletion)
        throw new TaskWorkflowError(
          TaskWorkflowErrorCode.Forbidden,
          "Completion requires human review under the current workspace and project policy.",
          current,
        )
      const effective = this._planEffective(current.task, {status})
      if (canonicalWorkflowValue(effective.scheduled ?? null) !== canonicalWorkflowValue(current.task.scheduled)) effectiveChanges = effective
      else {
        changeset.tasks = {upserted: this._applyObservedPlanning(current.task, effective, source)}
        current = this._get(command.taskId, observed)
      }
    }
    if (command.kind === "propose") {
      effectiveChanges = this._planEffective(current.task, command.changes)
      const status = effectiveChanges.status ?? current.task.status
      const requiresCompletionPermission =
        (status === "done" || status === "cancelled") &&
        (command.changes.status !== undefined || (effectiveChanges.branchId !== undefined && effectiveChanges.branchId !== current.task.branchId))
      if (requiresCompletionPermission && !this._guidance.get(effectiveChanges.branchId ?? current.task.branchId).allowCompletion)
        throw new TaskWorkflowError(TaskWorkflowErrorCode.Forbidden, "Completion requires human review under the effective project policy.", current)
    }
    if (effectiveChanges) {
      originalValues = Object.fromEntries(Object.keys(effectiveChanges).map((key) => [key, current.task[key as keyof TaskPlanningChanges]]))
      const reason =
        command.kind === "propose"
          ? command.reason
          : "This status transition changes the scheduled day. Review the exact status and schedule together."
      const comment = new TaskCommentModel(this._db).createComment({
        taskId: command.taskId,
        branchId: current.task.branchId,
        content: `Agent planning proposal\n\nCurrent: ${JSON.stringify(originalValues)}\n\nProposed: ${JSON.stringify(effectiveChanges)}\n\nReason: ${reason}`,
        kind: source.kind,
        provider: source.provider,
      })
      proposalCommentId = comment.id
      changeset.comments = {upserted: [comment]}
    }
    if (command.kind === "resolve") {
      const proposal = current.proposals.find((item) => item.id === command.proposalId)
      if (!proposal) throw new TaskWorkflowError(TaskWorkflowErrorCode.NotFound, "The proposal no longer exists.", current)
      if (proposal.status !== "pending")
        throw new TaskWorkflowError(TaskWorkflowErrorCode.Conflict, "This proposal already has a human decision.", current)
      if (command.decision === "accepted") {
        if (current.task.deletedAt !== null && proposal.changes.deletedAt !== null)
          throw new TaskWorkflowError(
            TaskWorkflowErrorCode.NotFound,
            "This task was deleted. Request an explicit restoration proposal before applying changes.",
            current,
          )
        if (proposal.conflict)
          throw new TaskWorkflowError(
            TaskWorkflowErrorCode.Conflict,
            "The proposal's original planning values changed. Ask for a fresh proposal or reject this one.",
            current,
          )
        const record = current.records.find((entry) => entry.id === proposal.id)!
        if (
          record.schema !== 3 &&
          canonicalWorkflowValue(this._planEffective(current.task, proposal.changes)) !== canonicalWorkflowValue(proposal.changes)
        )
          throw new TaskWorkflowError(
            TaskWorkflowErrorCode.Conflict,
            "This older proposal does not bind all scheduling effects. Request a fresh proposal before accepting.",
            current,
          )
        this._assertReferences(current.task, proposal.changes)
        changeset.tasks = {upserted: this._applyObservedPlanning(current.task, proposal.changes, source)}
        current = this._get(command.taskId, observed)
      }
    }
    const confirmedSeconds = confirmedWorkflowSeconds(current.records, command.taskId, interval)
    const task = this._tasks.getTask(command.taskId)!
    const time = this._db
      .prepare("SELECT spent_time, workflow_time_baseline FROM tasks WHERE id = ?")
      .get<{spent_time: number; workflow_time_baseline: number}>(command.taskId)!
    const projected = {...task, spentTime: time.spent_time + Math.max(0, confirmedSeconds - time.workflow_time_baseline)}
    const guidance = this._guidance.get(task.branchId)
    const receipt: TaskWorkflowReceipt = {
      operationId: command.operationId,
      taskId: command.taskId,
      kind: command.kind,
      recordId: id,
      confirmedSeconds,
      outcome: effectiveChanges ? "proposal_pending" : "applied",
      proposalId: effectiveChanges ? id : null,
      revision: workflowDigest({
        task: projected,
        generation: this._taskGeneration(command.taskId),
        ids: [...current.records.map((record) => record.id), id].sort(),
        guidance: [guidance.workspace.revision, guidance.project?.revision ?? null],
      }),
    }
    const record: TaskWorkflowRecord = {
      schema: 3,
      id,
      taskId: command.taskId,
      actorId: context.actorId,
      source,
      runtimeId: this._host.runtimeId,
      checkpointMonotonic: observed.monotonic,
      proposalCommentId,
      originalValues,
      effectiveChanges,
      sessionId,
      sessionState,
      command,
      canonicalRequest,
      createdAt: observed.wall,
      sequence: current.records.length,
      taskGeneration: this._checkpointGeneration(command.taskId),
      interval,
      receipt,
    }
    this._records.append(record)
    if (interval || changeset.tasks) changeset.tasks = {upserted: [this._tasks.getTask(command.taskId)!]}
    return {receipt, changeset}
  }

  private _planEffective(task: Task, changes: TaskPlanningChanges): TaskPlanningChanges {
    const scheduledNow = this._host.scheduledNow?.() ?? {date: getToday(), time: getTime(), timezone: getTimezone()}
    const requested = {...changes}
    if (requested.scheduled === null && requested.status !== undefined && !["backlog", "ready_for_agent"].includes(requested.status))
      throw new TaskWorkflowError(
        TaskWorkflowErrorCode.InvalidRequest,
        "Clearing the schedule requires Backlog or Ready for Agent. Request compatible status and schedule values together.",
      )
    if (requested.scheduled === null && requested.status === undefined && !["backlog", "ready_for_agent"].includes(task.status))
      requested.status = "backlog"
    const branchId = requested.branchId ?? task.branchId
    if (!this._db.prepare("SELECT 1 FROM branches WHERE id = ? AND deleted_at IS NULL").get(branchId))
      throw new TaskWorkflowError(TaskWorkflowErrorCode.NotFound, "The proposed project no longer exists.")
    const patches = planTaskUpdate(
      {
        tasks: this._tasks.getTaskList({includeBacklog: true, includeDeleted: true}),
        milestones: new MilestoneModel(this._db).getMilestoneList({branchId}),
        today: scheduledNow.date,
      },
      task.id,
      requested,
    )
    const {id: _id, ...effective} = patches[0]
    if (patches.length !== 1)
      throw new TaskWorkflowError(
        TaskWorkflowErrorCode.InvalidRequest,
        "This change requires additional task effects. Review those changes separately.",
      )
    if (task.scheduled === null && effective.scheduled && requested.scheduled === undefined) effective.scheduled = scheduledNow
    const result = {...effective, ...(requested.deletedAt === null && {deletedAt: null})}
    if ("scheduled" in result) result.status ??= task.status
    this._assertReferences(task, result)
    return result
  }

  private _assertReferences(task: Task, changes: TaskPlanningChanges): void {
    const branchId = changes.branchId ?? task.branchId
    if (!this._db.prepare("SELECT 1 FROM branches WHERE id = ? AND deleted_at IS NULL").get(branchId))
      throw new TaskWorkflowError(TaskWorkflowErrorCode.Conflict, "The proposed project no longer exists. Request a fresh proposal.")
    if (
      changes.milestoneId &&
      !this._db.prepare("SELECT 1 FROM milestones WHERE id = ? AND branch_id = ? AND deleted_at IS NULL").get(changes.milestoneId, branchId)
    )
      throw new TaskWorkflowError(
        TaskWorkflowErrorCode.Conflict,
        "The proposed milestone no longer belongs to this project. Request a fresh proposal.",
      )
    for (const tag of changes.tags ?? []) {
      const current = new TagModel(this._db).getTag(tag.id)
      if (!current || current.branchId !== branchId || canonicalWorkflowValue(current) !== canonicalWorkflowValue(tag))
        throw new TaskWorkflowError(
          TaskWorkflowErrorCode.Conflict,
          "A proposed tag changed or no longer belongs to this project. Request a fresh proposal.",
        )
    }
  }

  private _applyPlanning(task: Task, changes: TaskPlanningChanges, source: TaskWorkflowContext["source"]): Task[] {
    const {tags, ...patch} = changes
    const updated = this._tasks.updateTask(task.id, {...patch, ...(tags ? {tags: tags.map((tag) => tag.id)} : {})})
    if (updated) {
      new TaskEventsService(new TaskEventModel(this._db)).recordUpdate(task, updated, source, {dateExplicit: "scheduled" in changes})
      if (task.deletedAt !== null && updated.deletedAt === null)
        new TaskEventsService(new TaskEventModel(this._db)).record(updated, "restored", source)
    }
    return updated ? [updated] : []
  }

  private _applyObservedPlanning(task: Task, changes: TaskPlanningChanges, source: TaskWorkflowContext["source"]): Task[] {
    const sessions = this.checkpointSessions(task.id)
    const updated = this._applyPlanning(this._tasks.getTask(task.id)!, changes, source)
    if (sessions.length) this.checkpointSessions(task.id, sessions)
    return updated.map((item) => this._tasks.getTask(item.id)!)
  }

  private _originalValuesMatch(task: Task, originalValues: TaskPlanningChanges): boolean {
    return Object.entries(originalValues).every(
      ([key, value]) => canonicalWorkflowValue(task[key as keyof TaskPlanningChanges]) === canonicalWorkflowValue(value),
    )
  }

  private _canCount(record: TaskWorkflowRecord, taskId: string, observed: ClockObservation): boolean {
    const wallElapsed = observed.wall - record.createdAt
    const monotonicElapsed = record.checkpointMonotonic === null ? NaN : observed.monotonic - record.checkpointMonotonic
    return (
      record.runtimeId === this._host.runtimeId &&
      wallElapsed >= 0 &&
      wallElapsed <= MAX_OBSERVED_WORKFLOW_INTERVAL_SECONDS * 1000 &&
      monotonicElapsed >= 0 &&
      monotonicElapsed <= MAX_OBSERVED_WORKFLOW_INTERVAL_SECONDS * 1000 &&
      record.taskGeneration === this._checkpointGeneration(taskId)
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
      throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "The host clock observation is invalid.")
    return observed
  }

  private _sessionRecords(records: TaskWorkflowRecord[]): TaskWorkflowRecord[] {
    const latest = new Map<string, TaskWorkflowRecord>()
    for (const record of [...records].sort(compareRecords)) {
      const id = this._sessionId(record)
      if (id) latest.set(`${record.actorId}:${id}`, record)
    }
    return [...latest.values()]
  }

  private _sessionId(record: TaskWorkflowRecord): string | null {
    return record.schema === 2 || record.schema === 3 ? (record.sessionId ?? null) : "sessionId" in record.command ? record.command.sessionId : null
  }

  private _sessionState(record: TaskWorkflowRecord): AgentSessionState | null {
    return record.schema === 2 || record.schema === 3
      ? (record.sessionState ?? null)
      : record.command.kind === "pause"
        ? "waiting"
        : "sessionId" in record.command
          ? "working"
          : null
  }

  private _checkpointGeneration(taskId: string): string {
    return workflowDigest({
      row: this._db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId),
      tags: this._tasks.getTask(taskId)?.tags.toSorted((a, b) => a.id.localeCompare(b.id)) ?? [],
    })
  }

  private _taskGeneration(taskId: string): string {
    return (
      this._db.prepare("SELECT workflow_generation FROM tasks WHERE id = ?").get<{workflow_generation: string}>(taskId)?.workflow_generation ?? ""
    )
  }
}

function compareRecords(a: TaskWorkflowRecord, b: TaskWorkflowRecord): number {
  return a.sequence - b.sequence || a.createdAt - b.createdAt || a.id.localeCompare(b.id)
}
