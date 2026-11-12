import {invalidRecord} from "./invalidRecord"
import {isObject} from "./isObject"
import {isWholeNumber} from "./isWholeNumber"
import {validateWorkflowGuidanceUpdate} from "./validateWorkflowGuidanceUpdate"
import {workflowDigest} from "./workflowDigest"

import type {WorkflowGuidanceRecord} from "@daily/protocol"

export function validateWorkflowGuidanceRecord(record: WorkflowGuidanceRecord): void {
  if (!isObject(record)) invalidRecord("guidance revision must be an object")
  const {id, createdAt, sequence, ...update} = record
  validateWorkflowGuidanceUpdate(update)
  if (id !== workflowDigest({guidance: record.scope, operationId: record.operationId}) || !isWholeNumber(createdAt) || !isWholeNumber(sequence))
    invalidRecord("guidance revision identity or timestamp is invalid")
}
