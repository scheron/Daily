import {confirmedWorkflowSeconds} from "./confirmedWorkflowSeconds"
import {invalidRecord} from "./invalidRecord"
import {isWholeNumber} from "./isWholeNumber"
import {validateWorkflowGuidanceRecord} from "./validateWorkflowGuidanceRecord"
import {validateWorkflowRecord} from "./validateWorkflowRecord"
import {validateWorkflowTimeMetadata} from "./validateWorkflowTimeMetadata"

import type {SnapshotDocs, TaskWorkflowRecord} from "@daily/protocol"

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
