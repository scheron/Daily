import {AGENT_SESSION_STATES, TASK_PRIORITIES, TASK_STATUSES, TASK_WORKFLOW_LEGACY_STAGES} from "@daily/protocol"

import {WORKFLOW_DATE_REGEX, WORKFLOW_TIME_REGEX} from "../../constants/regex"
import {TaskWorkflowError} from "../../errors/task-workflow/TaskWorkflowError"
import {TaskWorkflowErrorCode} from "../../errors/task-workflow/TaskWorkflowErrorCode"
import {isObject} from "./isObject"

import type {TaskWorkflowCommand} from "@daily/protocol"

export function validateWorkflowCommand(command: TaskWorkflowCommand): void {
  if (!command || [command.taskId, command.operationId, command.expectedRevision].some((value) => typeof value !== "string" || !value.trim()))
    throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "taskId, operationId and expectedRevision are required.")
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
    throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "Unknown workflow command or fields.")
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
      throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "A proposal needs planning changes and a nonempty reason.")
    const {estimatedTime, priority, scheduled, status, content, branchId, milestoneId, tags, orderIndex, deletedAt} = command.changes
    if (status !== undefined && !TASK_STATUSES.includes(status))
      throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "Unknown task status.")
    if (content !== undefined && typeof content !== "string")
      throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "Task content must be text.")
    if (branchId !== undefined && (typeof branchId !== "string" || !branchId.trim()))
      throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "A project ID is required.")
    if (milestoneId !== undefined && milestoneId !== null && (typeof milestoneId !== "string" || !milestoneId.trim()))
      throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "Invalid milestone ID.")
    if (
      tags !== undefined &&
      (!Array.isArray(tags) ||
        tags.some(
          (tag) => !isObject(tag) || typeof tag.id !== "string" || !tag.id.trim() || typeof tag.branchId !== "string" || typeof tag.name !== "string",
        ))
    )
      throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "Invalid task tags.")
    if (orderIndex !== undefined && !Number.isFinite(orderIndex))
      throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "Task order must be finite.")
    if (deletedAt !== undefined && deletedAt !== null)
      throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "A proposal may restore a task, not supply a deletion timestamp.")
    if (estimatedTime !== undefined && (!Number.isSafeInteger(estimatedTime) || estimatedTime < 0))
      throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "Estimated time must be nonnegative whole seconds.")
    if (priority !== undefined && !TASK_PRIORITIES.includes(priority))
      throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "Unknown priority.")
    if (scheduled !== undefined && scheduled !== null) {
      if (
        typeof scheduled !== "object" ||
        typeof scheduled.date !== "string" ||
        !WORKFLOW_DATE_REGEX.test(scheduled.date) ||
        !Number.isFinite(Date.parse(scheduled.date)) ||
        new Date(scheduled.date).toISOString().slice(0, 10) !== scheduled.date ||
        typeof scheduled.time !== "string" ||
        !WORKFLOW_TIME_REGEX.test(scheduled.time) ||
        typeof scheduled.timezone !== "string" ||
        Object.keys(scheduled).some((key) => !["date", "time", "timezone"].includes(key))
      )
        throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "A schedule needs a valid date, time and timezone.")
      try {
        new Intl.DateTimeFormat("en", {timeZone: scheduled.timezone})
      } catch {
        throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "Unknown schedule timezone.")
      }
    }
  }
  if ("sessionId" in command && (typeof command.sessionId !== "string" || !command.sessionId.trim()))
    throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "A nonempty sessionId is required.")
  if (command.kind === "transition") {
    if ("status" in command) {
      if (!(TASK_STATUSES as readonly unknown[]).includes(command.status) || "stage" in command)
        throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "Use exactly one actual task status.")
    } else if (!("stage" in command) || !TASK_WORKFLOW_LEGACY_STAGES.includes(command.stage))
      throw new TaskWorkflowError(
        TaskWorkflowErrorCode.InvalidRequest,
        "Use a real task status; legacy stages support planning, implementation or ready_to_merge only.",
      )
  }
  if (command.kind === "session_update" && !AGENT_SESSION_STATES.includes(command.state))
    throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "Unknown agent session state.")
  if ("summary" in command && (typeof command.summary !== "string" || command.summary.length > 4000))
    throw new TaskWorkflowError(TaskWorkflowErrorCode.InvalidRequest, "Session summaries must be text of at most 4000 characters.")
}
