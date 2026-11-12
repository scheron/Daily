import {createHash} from "node:crypto"

import {TASK_STATUSES} from "@daily/protocol"

import {TaskWorkflowError} from "../../storage/TaskWorkflowError"

import type {SnapshotDocs, TaskWorkflowCommand, TaskWorkflowRecord, WorkflowGuidanceRecord, WorkflowGuidanceUpdate} from "@daily/protocol"

export function validateWorkflowCommand(command: TaskWorkflowCommand): void {
  if (!command || [command.taskId, command.operationId, command.expectedRevision].some((value) => typeof value !== "string" || !value.trim()))
    throw new TaskWorkflowError("invalid_request", "taskId, operationId and expectedRevision are required.")
  const fields: Record<TaskWorkflowCommand["kind"], string[]> = {
    transition: ["stage", "status"],
    session_start: ["sessionId", "summary"],
    session_update: ["sessionId", "state", "summary"],
    start: ["sessionId"],
    heartbeat: ["sessionId"],
    pause: ["sessionId"],
    propose: ["changes", "reason"],
  }
  const allowed = Object.hasOwn(fields, command.kind) ? fields[command.kind] : null
  if (!allowed || Object.keys(command).some((key) => !["taskId", "operationId", "expectedRevision", "kind", ...allowed].includes(key)))
    throw new TaskWorkflowError("invalid_request", "Unknown workflow command or fields.")
  if (command.kind === "propose") {
    if (
      typeof command.reason !== "string" ||
      !command.reason.trim() ||
      !command.changes ||
      typeof command.changes !== "object" ||
      Array.isArray(command.changes) ||
      !Object.keys(command.changes).length ||
      Object.values(command.changes).some((value) => value === undefined) ||
      Object.keys(command.changes).some(
        (key) =>
          !["scheduled", "status", "estimatedTime", "priority", "content", "branchId", "milestoneId", "tags", "orderIndex", "deletedAt"].includes(
            key,
          ),
      )
    )
      throw new TaskWorkflowError("invalid_request", "A proposal needs planning changes and a nonempty reason.")
    const {estimatedTime, priority, scheduled, status, content, branchId, milestoneId, tags, orderIndex, deletedAt} = command.changes
    if (status !== undefined && !TASK_STATUSES.includes(status)) throw new TaskWorkflowError("invalid_request", "Unknown task status.")
    if (content !== undefined && typeof content !== "string") throw new TaskWorkflowError("invalid_request", "Task content must be text.")
    if (branchId !== undefined && (typeof branchId !== "string" || !branchId.trim()))
      throw new TaskWorkflowError("invalid_request", "A project ID is required.")
    if (milestoneId !== undefined && milestoneId !== null && (typeof milestoneId !== "string" || !milestoneId.trim()))
      throw new TaskWorkflowError("invalid_request", "Invalid milestone ID.")
    if (
      tags !== undefined &&
      (!Array.isArray(tags) ||
        tags.some(
          (tag) => !isObject(tag) || typeof tag.id !== "string" || !tag.id.trim() || typeof tag.branchId !== "string" || typeof tag.name !== "string",
        ))
    )
      throw new TaskWorkflowError("invalid_request", "Invalid task tags.")
    if (orderIndex !== undefined && !Number.isFinite(orderIndex)) throw new TaskWorkflowError("invalid_request", "Task order must be finite.")
    if (deletedAt !== undefined && deletedAt !== null)
      throw new TaskWorkflowError("invalid_request", "A proposal may restore a task, not supply a deletion timestamp.")
    if (estimatedTime !== undefined && (!Number.isSafeInteger(estimatedTime) || estimatedTime < 0))
      throw new TaskWorkflowError("invalid_request", "Estimated time must be nonnegative whole seconds.")
    if (priority !== undefined && !["none", "urgent", "high", "medium", "low"].includes(priority))
      throw new TaskWorkflowError("invalid_request", "Unknown priority.")
    if (scheduled !== undefined && scheduled !== null) {
      if (
        typeof scheduled !== "object" ||
        typeof scheduled.date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(scheduled.date) ||
        !Number.isFinite(Date.parse(scheduled.date)) ||
        new Date(scheduled.date).toISOString().slice(0, 10) !== scheduled.date ||
        typeof scheduled.time !== "string" ||
        !/^(?:|(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)$/.test(scheduled.time) ||
        typeof scheduled.timezone !== "string" ||
        Object.keys(scheduled).some((key) => !["date", "time", "timezone"].includes(key))
      )
        throw new TaskWorkflowError("invalid_request", "A schedule needs a valid date, time and timezone.")
      try {
        new Intl.DateTimeFormat("en", {timeZone: scheduled.timezone})
      } catch {
        throw new TaskWorkflowError("invalid_request", "Unknown schedule timezone.")
      }
    }
  }
  if ("sessionId" in command && (typeof command.sessionId !== "string" || !command.sessionId.trim()))
    throw new TaskWorkflowError("invalid_request", "A nonempty sessionId is required.")
  if (command.kind === "transition") {
    if ("status" in command) {
      if (!(TASK_STATUSES as readonly unknown[]).includes(command.status) || "stage" in command)
        throw new TaskWorkflowError("invalid_request", "Use exactly one actual task status.")
    } else if (!("stage" in command) || !["planning", "implementation", "ready_to_merge"].includes(command.stage))
      throw new TaskWorkflowError("invalid_request", "Use a real task status; legacy stages support planning, implementation or ready_to_merge only.")
  }
  if (command.kind === "session_update" && !["working", "waiting", "finished", "error"].includes(command.state))
    throw new TaskWorkflowError("invalid_request", "Unknown agent session state.")
  if ("summary" in command && (typeof command.summary !== "string" || command.summary.length > 4000))
    throw new TaskWorkflowError("invalid_request", "Session summaries must be text of at most 4000 characters.")
}

export function validateWorkflowRecord(record: TaskWorkflowRecord): void {
  if (!isObject(record)) invalidRecord("record must be an object")
  const fields = [
    "id",
    "taskId",
    "actorId",
    "source",
    "runtimeId",
    "command",
    "canonicalRequest",
    "createdAt",
    "sequence",
    "taskGeneration",
    "interval",
    "receipt",
    "checkpointMonotonic",
    "proposalCommentId",
    ...(record.schema === 2 || record.schema === 3 ? ["schema", "originalValues", "sessionId", "sessionState"] : []),
    ...(record.schema === 3 ? ["effectiveChanges"] : []),
  ]
  if (Object.keys(record).length !== fields.length || Object.keys(record).some((key) => !fields.includes(key)))
    invalidRecord("record fields do not match this snapshot version")
  try {
    if (record.command.kind === "resolve") validateWorkflowResolution(record.command)
    else validateWorkflowCommand(record.command)
  } catch (error) {
    invalidRecord(error instanceof Error ? error.message : "command is invalid")
  }
  if ([record.id, record.taskId, record.actorId, record.runtimeId].some((value) => typeof value !== "string" || !value.trim()))
    invalidRecord("record identity is missing")
  if (
    !isObject(record.source) ||
    !((record.schema === 2 || record.schema === 3) && record.command.kind === "resolve" ? ["manual"] : ["mcp", "agent"]).includes(
      record.source.kind,
    ) ||
    Object.keys(record.source).some((key) => !["kind", "provider"].includes(key)) ||
    (record.source.provider !== null && typeof record.source.provider !== "string")
  )
    invalidRecord("record source is invalid")
  if (record.taskId !== record.command.taskId || record.id !== workflowDigest({actorId: record.actorId, operationId: record.command.operationId}))
    invalidRecord("record identity does not match its command")
  if (record.canonicalRequest !== canonicalWorkflowValue({command: record.command, actorId: record.actorId, source: record.source}))
    invalidRecord("canonical request does not match its command")
  if (!isDigest(record.taskGeneration) || !isWholeNumber(record.sequence) || !isWholeNumber(record.createdAt))
    invalidRecord("record generation, sequence or checkpoint is invalid")
  if (
    record.checkpointMonotonic !== null &&
    (!Number.isFinite(record.checkpointMonotonic) || record.checkpointMonotonic < 0 || record.checkpointMonotonic > Number.MAX_SAFE_INTEGER)
  )
    invalidRecord("monotonic checkpoint is invalid")
  if (
    record.proposalCommentId !== null &&
    ((record.command.kind !== "propose" && !(record.schema === 3 && record.command.kind === "transition" && record.effectiveChanges)) ||
      typeof record.proposalCommentId !== "string" ||
      !record.proposalCommentId.trim())
  )
    invalidRecord("proposal comment identity is invalid")
  if (
    (record.command.kind === "propose" || (record.schema === 3 && record.effectiveChanges)) &&
    record.checkpointMonotonic !== null &&
    record.proposalCommentId === null
  )
    invalidRecord("proposal comment identity is missing")
  if (record.interval !== null) {
    const interval = record.interval
    if (
      !isObject(interval) ||
      Object.keys(interval).length !== 2 ||
      !isCheckpoint(interval.from) ||
      !isCheckpoint(interval.to) ||
      interval.to < interval.from ||
      interval.to - interval.from > (record.schema === 2 || record.schema === 3 ? 1800000 : 60000) ||
      interval.to > record.createdAt ||
      interval.from < record.createdAt - (record.schema === 2 || record.schema === 3 ? 1800000 : 60000) ||
      (record.command.kind !== "heartbeat" && record.command.kind !== "pause" && record.schema !== 2 && record.schema !== 3)
    )
      invalidRecord("confirmed interval exceeds its version's observation bounds")
  }
  if (record.schema === 2 || record.schema === 3) {
    if (
      (record.sessionId !== null && (typeof record.sessionId !== "string" || !record.sessionId.trim())) ||
      (record.sessionState !== null && !["working", "waiting", "finished", "error"].includes(record.sessionState!)) ||
      (record.sessionId === null) !== (record.sessionState === null)
    )
      invalidRecord("session metadata is invalid")
    if (
      ("sessionId" in record.command && record.sessionId !== record.command.sessionId) ||
      (record.command.kind === "session_update" && record.sessionState !== record.command.state) ||
      (record.command.kind === "pause" && record.sessionState !== "waiting") ||
      (["start", "session_start", "heartbeat"].includes(record.command.kind) && record.sessionState !== "working") ||
      (record.interval !== null &&
        (record.sessionId === null || record.checkpointMonotonic === null || ["start", "session_start", "resolve"].includes(record.command.kind)))
    )
      invalidRecord("session metadata does not match its command or observed interval")
    const proposed = record.schema === 3 ? record.effectiveChanges : record.command.kind === "propose" ? record.command.changes : null
    if (record.schema === 3 && record.effectiveChanges !== null && !["transition", "propose"].includes(record.command.kind))
      invalidRecord("effective changes require a proposal or transition")
    if (record.schema === 3 && record.command.kind === "propose" && !proposed) invalidRecord("proposal effective changes are missing")
    if (proposed) {
      const base = {
        taskId: record.taskId,
        operationId: record.command.operationId,
        expectedRevision: record.command.expectedRevision,
        kind: "propose" as const,
        reason: "Retained proposal values",
      }
      validateWorkflowCommand({...base, changes: proposed})
      const original = record.originalValues!
      if (!isObject(original)) invalidRecord("proposal original values are missing")
      if (
        original.deletedAt !== undefined &&
        original.deletedAt !== null &&
        (typeof original.deletedAt !== "string" || !Number.isFinite(Date.parse(original.deletedAt)))
      )
        invalidRecord("original deletion timestamp is invalid")
      validateWorkflowCommand({...base, changes: {...original, ...(Object.hasOwn(original, "deletedAt") && {deletedAt: null})}})
      if (Object.keys(proposed).sort().join() !== Object.keys(original).sort().join())
        invalidRecord("proposal original fields do not match requested fields")
    } else if (record.originalValues !== null) invalidRecord("original values belong only to proposals")
  }
  const receipt = record.receipt
  if (
    !isObject(receipt) ||
    Object.keys(receipt).length !== (record.schema === 3 ? 8 : 6) ||
    receipt.operationId !== record.command.operationId ||
    receipt.taskId !== record.taskId ||
    receipt.recordId !== record.id ||
    receipt.kind !== record.command.kind ||
    !isDigest(receipt.revision) ||
    !isWholeNumber(receipt.confirmedSeconds) ||
    (record.interval !== null && receipt.confirmedSeconds < Math.floor((record.interval.to - record.interval.from) / 1000))
  )
    invalidRecord("receipt does not match its immutable record")
  if (
    record.schema === 3 &&
    (receipt.outcome !== (record.effectiveChanges ? "proposal_pending" : "applied") ||
      receipt.proposalId !== (record.effectiveChanges ? record.id : null))
  )
    invalidRecord("receipt proposal outcome does not match its immutable effect")
}

/** Confirmed task wall time in seconds; overlapping sessions contribute only their interval union. */
export function confirmedWorkflowSeconds(
  records: TaskWorkflowRecord[],
  taskId: string,
  pendingInterval: TaskWorkflowRecord["interval"] = null,
): number {
  for (const record of records) validateWorkflowRecord(record)
  const intervals = records.filter((record) => record.taskId === taskId && record.interval).map((record) => record.interval!)
  if (pendingInterval) {
    validateWorkflowInterval(pendingInterval)
    intervals.push(pendingInterval)
  }
  intervals.sort((a, b) => a.from - b.from || a.to - b.to)
  let milliseconds = 0
  let end = -Infinity
  for (const interval of intervals) {
    milliseconds += Math.max(0, interval.to - Math.max(interval.from, end))
    end = Math.max(end, interval.to)
  }
  const seconds = Math.floor(milliseconds / 1000)
  validateWorkflowTimeMetadata(seconds, 0)
  return seconds
}

/** Complete history checks run only after deltas are combined with retained records. */
export function validateWorkflowSnapshotDocs(docs: SnapshotDocs, options: {requireTaskMetadata?: boolean; completeHistory?: boolean} = {}): void {
  const {requireTaskMetadata = false, completeHistory = false} = options
  if (docs.workflowRecords !== undefined && !Array.isArray(docs.workflowRecords)) invalidRecord("workflowRecords must be an array")
  const recordsByTask = new Map<string, TaskWorkflowRecord[]>()
  for (const record of docs.workflowRecords ?? []) {
    validateWorkflowRecord(record)
    const records = recordsByTask.get(record.taskId) ?? []
    records.push(record)
    recordsByTask.set(record.taskId, records)
  }
  if (docs.workflowGuidanceRecords !== undefined && !Array.isArray(docs.workflowGuidanceRecords))
    invalidRecord("workflowGuidanceRecords must be an array")
  for (const record of docs.workflowGuidanceRecords ?? []) validateWorkflowGuidanceRecord(record)
  if (completeHistory) for (const records of recordsByTask.values()) validateCompleteWorkflowHistory(records)
  for (const task of docs.tasks) {
    const baseline = task.workflow_time_baseline ?? 0
    const confirmed = confirmedWorkflowSeconds(recordsByTask.get(task.id) ?? [], task.id)
    if (completeHistory && baseline > confirmed) invalidRecord("task correction baseline exceeds retained confirmed time")
    if (requireTaskMetadata || task.spent_time !== undefined) {
      validateWorkflowTimeMetadata(task.spent_time, baseline)
      validateWorkflowTimeMetadata(task.spent_time + Math.max(0, confirmed - baseline), baseline)
    }
    if (task.workflow_time_baseline !== undefined && !isWholeNumber(task.workflow_time_baseline)) invalidRecord("task baseline is invalid")
    if (requireTaskMetadata && (task.workflow_time_baseline === undefined || typeof task.workflow_generation !== "string"))
      invalidRecord("task workflow metadata is missing")
    if (task.workflow_generation !== undefined && typeof task.workflow_generation !== "string") invalidRecord("task generation is invalid")
  }
}

export function canonicalWorkflowValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalWorkflowValue).join(",")}]`
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalWorkflowValue(item)}`)
      .join(",")}}`
  return JSON.stringify(value)
}

export function workflowDigest(value: unknown): string {
  return createHash("sha256").update(canonicalWorkflowValue(value)).digest("hex")
}

export function validateWorkflowTimeMetadata(spentTime: number, baseline: number): void {
  if (!isWholeNumber(spentTime) || !isWholeNumber(baseline))
    throw new TaskWorkflowError(
      "invalid_request",
      "Invalid workflow task time metadata: spent time and baseline must be finite nonnegative whole seconds. Sync stops without discarding history.",
    )
}

export function validateWorkflowResolution(command: TaskWorkflowRecord["command"]): void {
  if (
    command.kind !== "resolve" ||
    !["accepted", "rejected"].includes(command.decision) ||
    [command.taskId, command.proposalId, command.operationId, command.expectedRevision].some((value) => typeof value !== "string" || !value.trim()) ||
    Object.keys(command).some((key) => !["kind", "taskId", "proposalId", "decision", "operationId", "expectedRevision"].includes(key))
  )
    throw new TaskWorkflowError("invalid_request", "A proposal decision needs its task, proposal, revision and operation IDs.")
}

export function validateWorkflowGuidanceUpdate(update: WorkflowGuidanceUpdate): void {
  const scope = update?.scope
  if (
    !isObject(update) ||
    !isObject(scope) ||
    (scope.kind !== "workspace" && scope.kind !== "project") ||
    (scope.kind === "project" && (typeof scope.projectId !== "string" || !scope.projectId.trim())) ||
    Object.keys(scope).some((key) => !(scope.kind === "project" ? ["kind", "projectId"] : ["kind"]).includes(key)) ||
    typeof update.content !== "string" ||
    update.content.length > 100000 ||
    (typeof update.allowCompletion !== "boolean" && !(scope.kind === "project" && update.allowCompletion === null)) ||
    [update.operationId, update.expectedRevision].some((value) => typeof value !== "string" || !value.trim()) ||
    Object.keys(update).some((key) => !["scope", "content", "allowCompletion", "operationId", "expectedRevision"].includes(key))
  )
    throw new TaskWorkflowError("invalid_request", "Guidance requires a valid scope, text, completion permission, operation and revision.")
}

export function validateWorkflowGuidanceRecord(record: WorkflowGuidanceRecord): void {
  if (!isObject(record)) invalidRecord("guidance revision must be an object")
  const {id, createdAt, sequence, ...update} = record
  validateWorkflowGuidanceUpdate(update)
  if (id !== workflowDigest({guidance: record.scope, operationId: record.operationId}) || !isWholeNumber(createdAt) || !isWholeNumber(sequence))
    invalidRecord("guidance revision identity or timestamp is invalid")
}

function validateCompleteWorkflowHistory(records: TaskWorkflowRecord[]): void {
  const confirmed = confirmedWorkflowSeconds(records, records[0].taskId)
  const recordsByRevision = new Map<string, TaskWorkflowRecord[]>()
  for (const record of records) {
    const entries = recordsByRevision.get(record.receipt.revision) ?? []
    entries.push(record)
    recordsByRevision.set(record.receipt.revision, entries)
  }
  for (const record of records) {
    if (record.receipt.confirmedSeconds > confirmed) invalidRecord("receipt claims time absent from retained history")
    if (record.command.kind === "resolve") {
      const proposalId = record.command.proposalId
      const proposal = records.find((entry) => entry.id === proposalId && entry.sequence < record.sequence)
      if (!proposal || (proposal.command.kind !== "propose" && !(proposal.schema === 3 && proposal.effectiveChanges)))
        invalidRecord("human decision has no retained proposal")
    }
    const sessionId = record.schema === undefined ? ("sessionId" in record.command ? record.command.sessionId : null) : record.sessionId
    if (sessionId === null) continue
    const predecessors = [...(recordsByRevision.get(record.command.expectedRevision) ?? [])]
    const visited = new Set<TaskWorkflowRecord>()
    while (predecessors.length) {
      const predecessor = predecessors.pop()!
      if (visited.has(predecessor)) continue
      visited.add(predecessor)
      if (
        predecessor.actorId === record.actorId &&
        predecessor.schema !== undefined &&
        predecessor.sessionId === sessionId &&
        (predecessor.sessionState === "finished" || predecessor.sessionState === "error")
      )
        invalidRecord("session continuation causally follows a retained terminal boundary")
      predecessors.push(...(recordsByRevision.get(predecessor.command.expectedRevision) ?? []))
    }
    if (record.schema === undefined) continue
    const sameSession = records.filter(
      (entry) =>
        entry.actorId === record.actorId &&
        (entry.schema === undefined ? "sessionId" in entry.command && entry.command.sessionId === sessionId : entry.sessionId === sessionId),
    )
    if (!sameSession.some((entry) => (entry.command.kind === "start" || entry.command.kind === "session_start") && entry.sequence <= record.sequence))
      invalidRecord("session boundary has no retained start")
    if (
      record.interval !== null &&
      !sameSession.some(
        (entry) =>
          entry.sequence < record.sequence &&
          entry.runtimeId === record.runtimeId &&
          entry.createdAt === record.interval!.from &&
          (entry.schema === undefined ? ["start", "heartbeat"].includes(entry.command.kind) : entry.sessionState === "working") &&
          entry.checkpointMonotonic !== null &&
          record.checkpointMonotonic !== null &&
          record.interval!.to <= entry.createdAt + (record.checkpointMonotonic - entry.checkpointMonotonic),
      )
    )
      invalidRecord("confirmed interval has no retained working checkpoint")
  }
}

function validateWorkflowInterval(interval: {from: number; to: number}): void {
  if (
    !isObject(interval) ||
    Object.keys(interval).length !== 2 ||
    !isCheckpoint(interval.from) ||
    !isCheckpoint(interval.to) ||
    interval.to < interval.from ||
    interval.to - interval.from > 1800000
  )
    invalidRecord("confirmed interval must be ordered, finite and at most 30 minutes")
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function isCheckpoint(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
}

function isWholeNumber(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isDigest(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

function invalidRecord(reason: string): never {
  throw new TaskWorkflowError(
    "invalid_request",
    `Invalid workflow record: ${reason}. Sync stops without discarding history; repair the source snapshot before retrying.`,
  )
}
