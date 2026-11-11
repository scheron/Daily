import {confirmedWorkflowSeconds, validateWorkflowTimeMetadata} from "./workflowValidation"

import type {TaskWorkflowRecord} from "@daily/protocol"

export {confirmedWorkflowSeconds} from "./workflowValidation"

export function workflowSpentTime(spentTime: number, baseline: number, records: TaskWorkflowRecord[], taskId: string): number {
  validateWorkflowTimeMetadata(spentTime, baseline)
  const seconds = spentTime + Math.max(0, confirmedWorkflowSeconds(records, taskId) - baseline)
  validateWorkflowTimeMetadata(seconds, baseline)
  return seconds
}
