import {confirmedWorkflowSeconds} from "./confirmedWorkflowSeconds"
import {validateWorkflowTimeMetadata} from "./validateWorkflowTimeMetadata"

import type {TaskWorkflowRecord} from "@daily/protocol"

export function workflowSpentTime(spentTime: number, baseline: number, records: TaskWorkflowRecord[], taskId: string): number {
  validateWorkflowTimeMetadata(spentTime, baseline)
  const seconds = spentTime + Math.max(0, confirmedWorkflowSeconds(records, taskId) - baseline)
  validateWorkflowTimeMetadata(seconds, baseline)
  return seconds
}
