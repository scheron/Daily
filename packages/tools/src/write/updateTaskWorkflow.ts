import {isObject} from "@daily/std"

import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {readEnum, readInteger, readISODate, readISOTime, requireString} from "../input"
import {TASK_WORKFLOW_INSTRUCTIONS} from "../taskWorkflowInstructions"

import type {TaskPriority, TaskWorkflowCommand} from "@daily/protocol"
import type {Tool} from "../types"

export const updateTaskWorkflowTool: Tool = {
  name: "update_task_workflow",
  description: `Atomically records one guarded workflow operation and returns its durable receipt. kind selects transition, start, heartbeat, pause or propose; only send that kind's fields. Proposals cannot be approved or applied through tools. ${TASK_WORKFLOW_INSTRUCTIONS}`,
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {
      taskId: {type: "string", description: "The selected task id."},
      operationId: {type: "string", description: "A unique operation id; reuse only for an identical retry."},
      expectedRevision: {type: "string", description: "The revision most recently read from get_task_workflow."},
      kind: {type: "string", description: "The workflow action.", enum: ["transition", "start", "heartbeat", "pause", "propose"]},
      stage: {
        type: "string",
        description: "Required only for transition. Planning preserves stage; implementation requires an existing day.",
        enum: ["planning", "implementation", "ready_to_merge"],
      },
      sessionId: {type: "string", description: "Required for start, heartbeat and pause. A unique session id chosen when starting."},
      changes: {
        type: "object",
        description: "Required only for propose. Suggestions remain pending for the person to manually apply.",
        properties: {
          scheduled: {
            type: ["object", "null"],
            description: "Suggested scheduled day and time, or null to clear the day.",
            properties: {
              date: {type: "string", description: "YYYY-MM-DD."},
              time: {type: "string", description: "HH:mm or HH:mm:ss, or an empty string when no time is suggested."},
              timezone: {type: "string", description: "IANA time zone."},
            },
            required: ["date", "time", "timezone"],
            additionalProperties: false,
          },
          estimatedTime: {type: "integer", description: "Suggested estimate in seconds.", minimum: 0},
          priority: {type: "string", description: "Suggested priority.", enum: ["none", "urgent", "high", "medium", "low"]},
        },
        additionalProperties: false,
      },
      reason: {type: "string", description: "Required only for propose: why these planning changes are suggested."},
    },
    required: ["taskId", "operationId", "expectedRevision", "kind"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const command = parseCommand(input)
    return ctx.workStorage.executeTaskWorkflow(command, {actorId: ctx.workflowActorId, source: ctx.source})
  },
}

function parseCommand(input: Record<string, unknown>): TaskWorkflowCommand {
  const base = {
    taskId: requireString(input, "taskId"),
    operationId: requireString(input, "operationId"),
    expectedRevision: requireString(input, "expectedRevision"),
  }
  const kind = readEnum(input, "kind", ["transition", "start", "heartbeat", "pause", "propose"])
  const common = ["taskId", "operationId", "expectedRevision", "kind"]
  if (kind === "transition") {
    assertFields(input, [...common, "stage"])
    const stage = readEnum(input, "stage", ["planning", "implementation", "ready_to_merge"])
    if (!stage) invalid('"stage" is required for transition.')
    return {...base, kind, stage}
  }
  if (kind === "start" || kind === "heartbeat" || kind === "pause") {
    assertFields(input, [...common, "sessionId"])
    return {...base, kind, sessionId: requireString(input, "sessionId")}
  }
  if (kind === "propose") {
    assertFields(input, [...common, "changes", "reason"])
    if (!isObject<Record<string, unknown>>(input.changes)) invalid('"changes" must be an object.')
    const raw = input.changes
    assertFields(raw, ["scheduled", "estimatedTime", "priority"])
    if (Object.keys(raw).length === 0) invalid('"changes" must contain a planning suggestion.')
    const changes: Extract<TaskWorkflowCommand, {kind: "propose"}>["changes"] = {}
    if (Object.hasOwn(raw, "scheduled")) {
      if (raw.scheduled === null) changes.scheduled = null
      else {
        if (!isObject<Record<string, unknown>>(raw.scheduled)) invalid('"scheduled" must be an object or null.')
        assertFields(raw.scheduled, ["date", "time", "timezone"])
        const date = readISODate(raw.scheduled, "date")
        const time = raw.scheduled.time === "" ? "" : readISOTime(raw.scheduled, "time")
        const timezone = requireString(raw.scheduled, "timezone")
        if (!date || time === undefined) invalid('"scheduled" requires date, time and timezone.')
        try {
          new Intl.DateTimeFormat("en", {timeZone: timezone})
        } catch {
          invalid('"timezone" must be an IANA time zone.')
        }
        changes.scheduled = {date, time, timezone}
      }
    }
    if (Object.hasOwn(raw, "estimatedTime")) changes.estimatedTime = readInteger(raw, "estimatedTime", {min: 0})
    if (Object.hasOwn(raw, "priority")) {
      const priorities: TaskPriority[] = ["none", "urgent", "high", "medium", "low"]
      changes.priority = readEnum(raw, "priority", priorities)
    }
    return {...base, kind, changes, reason: requireString(input, "reason")}
  }
  return invalid('"kind" is required.')
}

function assertFields(input: Record<string, unknown>, allowed: string[]): void {
  const unexpected = Object.keys(input).find((field) => !allowed.includes(field))
  if (unexpected) invalid(`Unexpected field "${unexpected}". Identity, clock and approval are host-owned; use only the selected action's fields.`)
}

function invalid(message: string): never {
  throw new ToolError(ToolErrorCode.INVALID_INPUT, message)
}
