import {MAX_OBSERVED_WORKFLOW_INTERVAL_SECONDS} from "@daily/protocol"

import {invalidRecord} from "./invalidRecord"
import {isCheckpoint} from "./isCheckpoint"
import {isObject} from "./isObject"
import {validateWorkflowRecord} from "./validateWorkflowRecord"
import {validateWorkflowTimeMetadata} from "./validateWorkflowTimeMetadata"

import type {TaskWorkflowRecord} from "@daily/protocol"

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

function validateWorkflowInterval(interval: {from: number; to: number}): void {
  if (
    !isObject(interval) ||
    Object.keys(interval).length !== 2 ||
    !isCheckpoint(interval.from) ||
    !isCheckpoint(interval.to) ||
    interval.to < interval.from ||
    interval.to - interval.from > MAX_OBSERVED_WORKFLOW_INTERVAL_SECONDS * 1000
  )
    invalidRecord("confirmed interval must be ordered, finite and at most 30 minutes")
}
