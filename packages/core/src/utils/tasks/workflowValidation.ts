import {createHash} from "node:crypto"

import {TaskWorkflowError} from "../../storage/TaskWorkflowError"

import type {SnapshotDocs, TaskWorkflowCommand, TaskWorkflowRecord} from "@daily/protocol"

export function validateWorkflowCommand(command: TaskWorkflowCommand): void {
  if (!command || [command.taskId, command.operationId, command.expectedRevision].some((value) => typeof value !== "string" || !value.trim()))
    throw new TaskWorkflowError("invalid_request", "taskId, operationId and expectedRevision are required.")
  const fields: Record<TaskWorkflowCommand["kind"], string[]> = {
    transition: ["stage"],
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
      Object.keys(command.changes).some((key) => !["scheduled", "estimatedTime", "priority"].includes(key))
    )
      throw new TaskWorkflowError("invalid_request", "A proposal needs planning changes and a nonempty reason.")
    const {estimatedTime, priority, scheduled} = command.changes
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
  if (
    (command.kind === "start" || command.kind === "heartbeat" || command.kind === "pause") &&
    (typeof command.sessionId !== "string" || !command.sessionId.trim())
  )
    throw new TaskWorkflowError("invalid_request", "A nonempty sessionId is required.")
  if (command.kind === "transition" && !["planning", "implementation", "ready_to_merge"].includes(command.stage))
    throw new TaskWorkflowError("forbidden", "Agents can plan, implement and hand off for review; only the person resolves tasks.")
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
  ]
  if (Object.keys(record).length !== fields.length || Object.keys(record).some((key) => !fields.includes(key)))
    invalidRecord("record fields do not match this snapshot version")
  try {
    validateWorkflowCommand(record.command)
  } catch (error) {
    invalidRecord(error instanceof Error ? error.message : "command is invalid")
  }
  if ([record.id, record.taskId, record.actorId, record.runtimeId].some((value) => typeof value !== "string" || !value.trim()))
    invalidRecord("record identity is missing")
  if (
    !isObject(record.source) ||
    !["mcp", "agent"].includes(record.source.kind) ||
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
    (record.command.kind !== "propose" || typeof record.proposalCommentId !== "string" || !record.proposalCommentId.trim())
  )
    invalidRecord("proposal comment identity is invalid")
  if (record.command.kind === "propose" && record.checkpointMonotonic !== null && record.proposalCommentId === null)
    invalidRecord("proposal comment identity is missing")
  if (record.interval !== null) {
    const interval = record.interval
    if (
      !isObject(interval) ||
      Object.keys(interval).length !== 2 ||
      !isCheckpoint(interval.from) ||
      !isCheckpoint(interval.to) ||
      interval.to < interval.from ||
      interval.to - interval.from > 60000 ||
      interval.to > record.createdAt ||
      interval.from < record.createdAt - 60000 ||
      (record.command.kind !== "heartbeat" && record.command.kind !== "pause")
    )
      invalidRecord("confirmed interval must be ordered, finite and at most 60 seconds on a heartbeat or pause")
  }
  const receipt = record.receipt
  if (
    !isObject(receipt) ||
    Object.keys(receipt).length !== 6 ||
    receipt.operationId !== record.command.operationId ||
    receipt.taskId !== record.taskId ||
    receipt.recordId !== record.id ||
    receipt.kind !== record.command.kind ||
    !isDigest(receipt.revision) ||
    !isWholeNumber(receipt.confirmedSeconds) ||
    (record.interval !== null && receipt.confirmedSeconds < Math.floor((record.interval.to - record.interval.from) / 1000))
  )
    invalidRecord("receipt does not match its immutable record")
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

export function validateWorkflowSnapshotDocs(docs: SnapshotDocs, strict = false): void {
  if (docs.workflowRecords !== undefined && !Array.isArray(docs.workflowRecords)) invalidRecord("workflowRecords must be an array")
  const recordsByTask = new Map<string, TaskWorkflowRecord[]>()
  for (const record of docs.workflowRecords ?? []) {
    validateWorkflowRecord(record)
    const records = recordsByTask.get(record.taskId) ?? []
    records.push(record)
    recordsByTask.set(record.taskId, records)
  }
  for (const task of docs.tasks) {
    if (strict || task.spent_time !== undefined) {
      const baseline = task.workflow_time_baseline ?? 0
      validateWorkflowTimeMetadata(task.spent_time, baseline)
      const confirmed = confirmedWorkflowSeconds(recordsByTask.get(task.id) ?? [], task.id)
      validateWorkflowTimeMetadata(task.spent_time + Math.max(0, confirmed - baseline), baseline)
    }
    if (task.workflow_time_baseline !== undefined && !isWholeNumber(task.workflow_time_baseline)) invalidRecord("task baseline is invalid")
    if (strict && (task.workflow_time_baseline === undefined || typeof task.workflow_generation !== "string"))
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

function validateWorkflowInterval(interval: {from: number; to: number}): void {
  if (
    !isObject(interval) ||
    Object.keys(interval).length !== 2 ||
    !isCheckpoint(interval.from) ||
    !isCheckpoint(interval.to) ||
    interval.to < interval.from ||
    interval.to - interval.from > 60000
  )
    invalidRecord("confirmed interval must be ordered, finite and at most 60 seconds")
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
