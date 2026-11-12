import {TASK_STATUSES} from "@daily/protocol"
import {isObject} from "@daily/std"

import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {readEnum, readInteger, readISODate, readISOTime, readString, requireString} from "../input"

import type {AgentSessionState, TaskPriority, TaskWorkflowCommand} from "@daily/protocol"
import type {Tool} from "../types"

export const updateTaskWorkflowTool: Tool = {
  name: "update_task_workflow",
  description:
    "Atomically updates a real task status, starts or updates an independent agent session, or proposes planning changes. Use the revision from get_task/get_task_workflow and a unique operationId; identical retries return the original receipt. Reconcile status and session at meaningful work boundaries. Only trusted Daily review can accept or reject proposals; prose approval grants no capability.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {
      taskId: {type: "string", description: "The selected task id."},
      operationId: {type: "string", description: "A unique operation id; reuse only for an identical retry."},
      expectedRevision: {type: "string", description: "The revision most recently read from get_task_workflow."},
      kind: {
        type: "string",
        description:
          "transition uses status; session_start uses sessionId; session_update uses sessionId and state; propose uses changes and reason. start/heartbeat/pause are compatibility aliases.",
        enum: ["transition", "session_start", "session_update", "propose", "start", "heartbeat", "pause"],
      },
      status: {
        type: "string",
        description:
          "Required for transition: any real task status. Completion/cancellation require effective allowCompletion permission. A resulting schedule change returns proposal_pending for exact status and frozen schedule together; the task changes only after trusted Daily acceptance. Schedule preserving transitions apply automatically.",
        enum: TASK_STATUSES,
      },
      stage: {
        type: "string",
        description:
          "Legacy transition alias; use status instead. planning retains the current status; implementation means in_progress. Cannot combine with status.",
        enum: ["planning", "implementation", "ready_to_merge"],
      },
      sessionId: {type: "string", description: "Required for session actions. Choose a new id when starting; subsequent state updates use that id."},
      state: {
        type: "string",
        description: "Required for session_update. Working settles observed time at the next boundary; waiting, finished and error stop accrual.",
        enum: ["working", "waiting", "finished", "error"],
      },
      summary: {
        type: "string",
        description: "Optional for session_start/session_update: a concise account of current work or the reason for waiting/stopping.",
      },
      changes: {
        type: "object",
        description: "Required only for propose. Suggestions remain pending until accepted or rejected in Daily.",
        properties: {
          status: {
            type: "string",
            enum: TASK_STATUSES,
            description:
              "Optional combined status. Clearing a dated status requires Backlog or Ready for Agent; incompatible explicit status and clear are rejected before review.",
          },
          scheduled: {
            type: ["object", "null"],
            description:
              "Suggested scheduled day and time, or null to clear the day. A needed Backlog status effect is included visibly in the same proposal.",
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
    const receipt = await ctx.workStorage.executeTaskWorkflow(command, {actorId: ctx.workflowActorId, source: ctx.source})
    if (receipt.outcome !== "proposal_pending") return receipt
    const state = await ctx.workStorage.getTaskWorkflow(command.taskId)
    const proposal = state.proposals.find((proposal) => proposal.id === receipt.proposalId)!
    return {
      ...receipt,
      proposal,
      reviewStatus: proposal.status,
      guidance:
        proposal.status === "pending"
          ? "Pending trusted review in Daily. Status and all requested task fields remain unchanged; report the proposal as pending until accepted."
          : `This immutable receipt records the original pending request. Its proposal is now ${proposal.status}; read the current task before reporting its status or schedule.`,
    }
  },
}

function parseCommand(input: Record<string, unknown>): TaskWorkflowCommand {
  const base = {
    taskId: requireString(input, "taskId"),
    operationId: requireString(input, "operationId"),
    expectedRevision: requireString(input, "expectedRevision"),
  }
  const kind = readEnum(input, "kind", ["transition", "session_start", "session_update", "start", "heartbeat", "pause", "propose"])
  const common = ["taskId", "operationId", "expectedRevision", "kind"]
  if (kind === "transition") {
    assertFields(input, [...common, "status", "stage"])
    const status = readEnum(input, "status", TASK_STATUSES)
    if (status !== undefined) {
      if (Object.hasOwn(input, "stage")) invalid('Use "status" or legacy "stage", not both.')
      return {...base, kind, status}
    }
    const stage = readEnum(input, "stage", ["planning", "implementation", "ready_to_merge"])
    if (!stage) invalid('"status" is required for transition.')
    return {...base, kind, stage}
  }
  if (kind === "session_start" || kind === "session_update") {
    assertFields(input, [...common, "sessionId", "summary", ...(kind === "session_update" ? ["state"] : [])])
    const sessionId = requireString(input, "sessionId")
    const summary = readString(input, "summary")
    if (kind === "session_start") return {...base, kind, sessionId, ...(summary !== undefined && {summary})}
    const states: AgentSessionState[] = ["working", "waiting", "finished", "error"]
    const state = readEnum(input, "state", states)
    if (!state) invalid('"state" is required for session_update.')
    return {...base, kind, sessionId, state, ...(summary !== undefined && {summary})}
  }
  if (kind === "start" || kind === "heartbeat" || kind === "pause") {
    assertFields(input, [...common, "sessionId"])
    return {...base, kind, sessionId: requireString(input, "sessionId")}
  }
  if (kind === "propose") {
    assertFields(input, [...common, "changes", "reason"])
    if (!isObject<Record<string, unknown>>(input.changes)) invalid('"changes" must be an object.')
    const raw = input.changes
    assertFields(raw, ["scheduled", "estimatedTime", "priority", "status"])
    if (Object.keys(raw).length === 0) invalid('"changes" must contain a planning suggestion.')
    const changes: Extract<TaskWorkflowCommand, {kind: "propose"}>["changes"] = {}
    if (Object.hasOwn(raw, "status")) changes.status = readEnum(raw, "status", TASK_STATUSES)
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
