import {MAIN_BRANCH_ID, statusForScheduling} from "@daily/protocol"
import {isArray, isString} from "@daily/std"

import {AgentToolError} from "../../../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../../errors/agent/AgentToolErrorCode"
import {taskFiles} from "../../attachments"
import {taskDetailView} from "../../views"
import {readEnum, readInteger, readISODate, readISOTime, readString} from "../input"

import type {ISODate, ISOTime, Milestone, Tag, Task, TaskScheduled, TaskStatus} from "@daily/protocol"
import type {AgentToolContext} from "../../AgentWorkspace"
import type {AttachmentView, TaskDetailView} from "../../views"
import type {AgentTool} from "../types"

const TASK_STATUSES = ["active", "backlog", "done", "discarded"] as const

type ParsedFields = {
  content?: string
  projectId?: string
  date?: ISODate | null
  time?: ISOTime
  status?: TaskStatus
  milestoneId?: string | null
  tagIds?: string[]
  estimatedSeconds?: number
  blockedBy?: string[]
  blocks?: string[]
}

export const saveTaskTool: AgentTool = {
  name: "save_task",
  description:
    "Creates a task when no id is given, or updates the one named. A day, time and status are worked out from what is given and the agent's Mac's own clock.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {
      id: {type: "string", description: "The task id, to update it. Omitted to create one."},
      content: {type: "string", description: "The task's text. Required when creating."},
      projectId: {type: "string", description: 'The project the task belongs to. Defaults to "main" when creating.'},
      date: {type: ["string", "null"], description: "The day the task is scheduled on, YYYY-MM-DD, or null to move it to the backlog."},
      time: {type: "string", description: 'The time of day, HH:mm or HH:mm:ss. Cannot be sent as null — clear a day with "date": null instead.'},
      status: {type: "string", description: "The task's status.", enum: TASK_STATUSES},
      milestoneId: {type: ["string", "null"], description: "The milestone this task belongs to, from its own project, or null to clear it."},
      tagIds: {type: "array", description: "Replaces the task's whole tag set.", items: {type: "string", description: "A tag id."}},
      estimatedSeconds: {type: "integer", description: "The estimated time, in seconds.", minimum: 0},
      blockedBy: {
        type: "array",
        description: "Tasks that block this one. Replaces the whole set.",
        items: {type: "string", description: "A task id."},
      },
      blocks: {type: "array", description: "Tasks this one blocks. Replaces the whole set.", items: {type: "string", description: "A task id."}},
    },
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = readString(input, "id")
    const fields = parseFields(input)

    const taskId = id === undefined ? await createTask(ctx, fields) : await updateTask(ctx, id, fields)

    return {task: await buildTaskDetail(ctx, taskId)}
  },
}

function parseFields(input: Record<string, unknown>): ParsedFields {
  const rawDate = input.date
  const date = rawDate === null ? null : readISODate(input, "date")

  if (input.time === null) {
    throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, '"time" cannot be null — clear a day with "date": null instead.')
  }
  const time = readISOTime(input, "time")

  const rawMilestoneId = input.milestoneId
  const milestoneId = rawMilestoneId === null ? null : readString(input, "milestoneId")

  return {
    content: readString(input, "content"),
    projectId: readString(input, "projectId"),
    date,
    time,
    status: readEnum(input, "status", TASK_STATUSES),
    milestoneId,
    tagIds: readIdArray(input, "tagIds"),
    estimatedSeconds: readInteger(input, "estimatedSeconds", {min: 0}),
    blockedBy: readIdArray(input, "blockedBy"),
    blocks: readIdArray(input, "blocks"),
  }
}

async function createTask(ctx: AgentToolContext, fields: ParsedFields): Promise<Task["id"]> {
  if (!fields.content) throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, '"content" is required.')

  const projectId = await resolveProjectId(ctx, fields.projectId ?? MAIN_BRANCH_ID)

  let status: TaskStatus
  let scheduled: TaskScheduled | null

  if (fields.date === undefined) {
    status = fields.status ?? "active"
    scheduled = ctx.clock.scheduledNow()
  } else if (fields.date === null) {
    status = fields.status ?? "backlog"
    scheduled = null
  } else {
    status = fields.status ?? "active"
    scheduled = {date: fields.date, time: fields.time ?? ctx.clock.time(), timezone: ctx.clock.timeZone}
  }

  const milestoneId = (await resolveMilestoneId(ctx, fields.milestoneId, projectId)) ?? null
  const tags = (await resolveTags(ctx, fields.tagIds, projectId)) ?? []

  const now = new Date().toISOString()
  const created = await ctx.core.tasksService.createTask({
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    branchId: projectId,
    scheduled,
    status,
    milestoneId,
    tags,
    content: fields.content,
    minimized: false,
    orderIndex: Date.now(),
    estimatedTime: fields.estimatedSeconds ?? 0,
    spentTime: 0,
    attachments: [],
  })
  if (!created) throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, "The task could not be created.")

  await applyRelations(ctx, created.id, fields.blockedBy, fields.blocks)

  return created.id
}

async function updateTask(ctx: AgentToolContext, id: Task["id"], fields: ParsedFields): Promise<Task["id"]> {
  const before = await ctx.core.tasksService.getTask(id)
  if (!before) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No task "${id}".`)

  const projectId = fields.projectId === undefined ? before.branchId : await resolveProjectId(ctx, fields.projectId)

  const updates: Partial<Task> = {}
  if (fields.content !== undefined) updates.content = fields.content
  if (fields.estimatedSeconds !== undefined) updates.estimatedTime = fields.estimatedSeconds

  const milestoneId = await resolveMilestoneId(ctx, fields.milestoneId, projectId)
  if (milestoneId !== undefined) updates.milestoneId = milestoneId

  const tags = await resolveTags(ctx, fields.tagIds, projectId)
  if (tags !== undefined) updates.tags = tags

  applyScheduling(ctx, before, fields, updates)

  if (projectId !== before.branchId) {
    const moved = await ctx.core.tasksService.moveTaskToBranch(id, projectId)
    if (!moved) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No task "${id}".`)

    await ctx.core.taskRelationsService.removeInvalidRelations([id])
  }

  const updated = await ctx.core.tasksService.updateTask(id, updates)
  const after = updated.find((task) => task.id === id)
  if (!after) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No task "${id}".`)

  await applyRelations(ctx, id, fields.blockedBy, fields.blocks)

  return id
}

function applyScheduling(ctx: AgentToolContext, before: Task, fields: ParsedFields, updates: Partial<Task>): void {
  if (fields.date === null) {
    updates.status = fields.status ?? statusForScheduling(before.status, null)
    updates.scheduled = null
    return
  }

  if (fields.date !== undefined) {
    if (fields.status !== undefined) updates.status = fields.status
    updates.scheduled = {date: fields.date, time: fields.time ?? before.scheduled?.time ?? ctx.clock.time(), timezone: ctx.clock.timeZone}
    return
  }

  if (fields.time !== undefined) {
    if (fields.status !== undefined) updates.status = fields.status
    updates.scheduled = {date: before.scheduled?.date ?? ctx.clock.today(), time: fields.time, timezone: ctx.clock.timeZone}
    return
  }

  if (fields.status !== undefined && fields.status !== "backlog" && before.scheduled === null) {
    updates.status = fields.status
    updates.scheduled = ctx.clock.scheduledNow()
    return
  }

  if (fields.status !== undefined) updates.status = fields.status
}

async function resolveProjectId(ctx: AgentToolContext, projectId: string): Promise<string> {
  const project = await ctx.core.branchesService.getBranch(projectId)
  if (!project) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No project "${projectId}".`)

  return project.id
}

async function resolveMilestoneId(
  ctx: AgentToolContext,
  milestoneId: string | null | undefined,
  projectId: string,
): Promise<string | null | undefined> {
  if (milestoneId === undefined || milestoneId === null) return milestoneId

  const milestone: Milestone | null = await ctx.core.milestonesService.getMilestone(milestoneId)
  if (!milestone) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No milestone "${milestoneId}".`)
  if (milestone.branchId !== projectId) {
    throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `"milestoneId" refers to a milestone in another project.`)
  }

  return milestoneId
}

async function resolveTags(ctx: AgentToolContext, tagIds: string[] | undefined, projectId: string): Promise<Tag[] | undefined> {
  if (tagIds === undefined) return undefined

  const tags: Tag[] = []
  for (const tagId of tagIds) {
    const tag = await ctx.core.tagsService.getTag(tagId)
    if (!tag) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No tag "${tagId}".`)
    if (tag.branchId !== projectId) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `"tagIds" includes a tag from another project.`)
    tags.push(tag)
  }

  return tags
}

async function applyRelations(
  ctx: AgentToolContext,
  taskId: Task["id"],
  blockedBy: string[] | undefined,
  blocks: string[] | undefined,
): Promise<void> {
  if (blockedBy === undefined && blocks === undefined) return
  if ((blockedBy ?? []).includes(taskId) || (blocks ?? []).includes(taskId)) {
    throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, "A task cannot block or be blocked by itself.")
  }

  const current = await ctx.core.taskRelationsService.getRelationsOfTask(taskId)
  const nextBlockedBy = blockedBy ?? current.blockedBy.map((task) => task.id)
  const nextBlocks = blocks ?? current.blocks.map((task) => task.id)

  await ctx.core.taskRelationsService.setTaskRelations(taskId, {blockedBy: nextBlockedBy, blocks: nextBlocks})
}

async function buildTaskDetail(ctx: AgentToolContext, id: Task["id"]): Promise<TaskDetailView> {
  const task = await ctx.core.tasksService.getTask(id)
  if (!task) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No task "${id}".`)

  const branch = await ctx.core.branchesService.getBranch(task.branchId)
  const relations = await ctx.core.taskRelationsService.getRelationsOfTask(task.id)
  const history = await ctx.core.tasksService.getHistoryByTask(task.id)
  const files = await taskFiles(ctx, task)
  const attachments: AttachmentView[] = files.map((ref) => ({
    id: ref.file.id,
    name: ref.file.name,
    mimeType: ref.file.mimeType,
    size: ref.file.size,
    onServer: ref.onServer,
  }))

  return taskDetailView(task, branch?.name ?? "", {blockedBy: relations.blockedBy, blocks: relations.blocks, history, attachments})
}

function readIdArray(input: Record<string, unknown>, field: string): string[] | undefined {
  const value = input[field]
  if (value === undefined) return undefined
  if (!isArray(value) || !value.every(isString)) {
    throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, `"${field}" must be an array of ids.`)
  }

  return value
}
