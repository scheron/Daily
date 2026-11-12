import {AGENT_SESSION_STATES, MAX_OBSERVED_WORKFLOW_INTERVAL_SECONDS} from "@daily/protocol"

import {WORKFLOW_DIGEST_REGEX} from "../../constants/regex"
import {canonicalWorkflowValue} from "./canonicalWorkflowValue"
import {invalidRecord} from "./invalidRecord"
import {isCheckpoint} from "./isCheckpoint"
import {isObject} from "./isObject"
import {isWholeNumber} from "./isWholeNumber"
import {validateWorkflowCommand} from "./validateWorkflowCommand"
import {validateWorkflowResolution} from "./validateWorkflowResolution"
import {workflowDigest} from "./workflowDigest"

import type {TaskWorkflowCommand, TaskWorkflowRecord} from "@daily/protocol"

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
      interval.to - interval.from > (record.schema === 2 || record.schema === 3 ? MAX_OBSERVED_WORKFLOW_INTERVAL_SECONDS * 1000 : 60000) ||
      interval.to > record.createdAt ||
      interval.from < record.createdAt - (record.schema === 2 || record.schema === 3 ? MAX_OBSERVED_WORKFLOW_INTERVAL_SECONDS * 1000 : 60000) ||
      (record.command.kind !== "heartbeat" && record.command.kind !== "pause" && record.schema !== 2 && record.schema !== 3)
    )
      invalidRecord("confirmed interval exceeds its version's observation bounds")
  }
  if (record.schema === 2 || record.schema === 3) {
    if (
      (record.sessionId !== null && (typeof record.sessionId !== "string" || !record.sessionId.trim())) ||
      (record.sessionState !== null && !AGENT_SESSION_STATES.includes(record.sessionState!)) ||
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
      const base: Omit<Extract<TaskWorkflowCommand, {kind: "propose"}>, "changes"> = {
        taskId: record.taskId,
        operationId: record.command.operationId,
        expectedRevision: record.command.expectedRevision,
        kind: "propose",
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

function isDigest(value: unknown): boolean {
  return typeof value === "string" && WORKFLOW_DIGEST_REGEX.test(value)
}
