import {sniffImageExt} from "@daily/core/utils/files/sniffImageExt"
import {MAIN_BRANCH_ID, statusForScheduling} from "@daily/protocol"
import {isArray, isObject, isString} from "@daily/std"

import {indexExistingAsset} from "../../../assets/AssetStore"
import {AgentToolError} from "../../../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../../errors/agent/AgentToolErrorCode"
import {fileAssetName} from "../../attachments"
import {readBoolean, readEnum, readInteger, readISODate, readISOTime, readString, requireString} from "../input"
import {readTaskDetail} from "../readTaskDetail"

import type {ActorSource, ISODate, ISOTime, Milestone, Tag, Task, TaskMovePosition, TaskScheduled, TaskStatus} from "@daily/protocol"
import type {AgentToolContext} from "../../AgentWorkspace"
import type {AgentTool, AgentToolPropertySchema} from "../types"

const TASK_STATUSES = ["active", "backlog", "done", "discarded"] as const
const MAX_BATCH_SIZE = 50
const MAX_ATTACHMENTS_PER_CALL = 5
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

type AttachmentAdd = {name: string; bytes: Buffer}

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
  deleted?: boolean
  addSpentSeconds?: number
  afterTaskId?: string
  beforeTaskId?: string
  addAttachments?: AttachmentAdd[]
  removeAttachmentIds?: string[]
}

const TASK_ITEM_PROPERTIES: Record<string, AgentToolPropertySchema> = {
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
  deleted: {
    type: "boolean",
    description: 'Set to false to return a soft-deleted task from the trash. Cannot be set to true — delete a task with "delete_task".',
  },
  addSpentSeconds: {
    type: "integer",
    description: "Adds to the time already logged, in seconds. Negative subtracts. The result never goes below zero.",
  },
  afterTaskId: {type: "string", description: 'Places the task right after this one, within its day. Cannot be combined with "beforeTaskId".'},
  beforeTaskId: {type: "string", description: 'Places the task right before this one, within its day. Cannot be combined with "afterTaskId".'},
  addAttachments: {
    type: "array",
    description: "Attaches up to 5 images, base64-encoded, 5 MiB each once decoded. A file that is not a recognisable image refuses the whole call.",
    items: {
      type: "object",
      description: "One image to attach.",
      properties: {
        name: {type: "string", description: "A filename for the image."},
        dataBase64: {type: "string", description: "The image's bytes, base64-encoded."},
      },
      required: ["name", "dataBase64"],
      additionalProperties: false,
    },
  },
  removeAttachmentIds: {
    type: "array",
    description: "Detaches these files from the task. Their bytes are never deleted.",
    items: {type: "string", description: "A file id, from the task's attachments."},
  },
}

export const saveTaskTool: AgentTool = {
  name: "save_task",
  description:
    "Creates a task when no id is given, or updates the one named. A day, time and status are worked out from what is given and the agent's Mac's own clock. Send \"tasks\" instead for a batch of up to 50, applied atomically.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {
      ...TASK_ITEM_PROPERTIES,
      tasks: {
        type: "array",
        description: "Applies up to 50 task changes in one call — all succeed or none do. Cannot be combined with any top-level task field.",
        items: {
          type: "object",
          description: "One task change, in the same shape as a single call.",
          properties: TASK_ITEM_PROPERTIES,
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
  async run(input, ctx) {
    if (input.tasks !== undefined) {
      if (hasTopLevelTaskField(input)) {
        throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, '"tasks" cannot be combined with any top-level task field.')
      }

      const items = readTaskBatch(input.tasks)
      const ids: Task["id"][] = []
      for (const item of items) {
        ids.push(await applyOneTask(ctx, item))
      }

      return {tasks: await Promise.all(ids.map((id) => readTaskDetail(ctx, id)))}
    }

    const taskId = await applyOneTask(ctx, input)

    return {task: await readTaskDetail(ctx, taskId)}
  },
}

function hasTopLevelTaskField(input: Record<string, unknown>): boolean {
  return Object.keys(TASK_ITEM_PROPERTIES).some((field) => input[field] !== undefined)
}

function readTaskBatch(value: unknown): Record<string, unknown>[] {
  if (!isArray(value)) throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, '"tasks" must be an array.')
  if (value.length > MAX_BATCH_SIZE) {
    throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, `"tasks" cannot hold more than ${MAX_BATCH_SIZE} items.`)
  }

  return value.map((item, index) => {
    if (!isObject<Record<string, unknown>>(item)) throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, `"tasks[${index}]" must be an object.`)

    return item
  })
}

async function applyOneTask(ctx: AgentToolContext, input: Record<string, unknown>): Promise<Task["id"]> {
  const source: ActorSource = {kind: "mcp", provider: ctx.agent.name}
  const id = readString(input, "id")
  const fields = parseFields(input)

  if (fields.deleted === true) {
    throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, '"deleted" can only be set to false — delete a task with "delete_task".')
  }
  if (fields.deleted === false && id === undefined) {
    throw new AgentToolError(
      AgentToolErrorCode.INVALID_INPUT,
      '"deleted": false requires "id" — there is no deleted task to restore when creating one.',
    )
  }

  const taskId = id === undefined ? await createTask(ctx, fields, source) : await updateTask(ctx, id, fields, source)

  await applyReorder(ctx, taskId, fields.afterTaskId, fields.beforeTaskId, source)
  await applyAttachments(ctx, taskId, fields.addAttachments, fields.removeAttachmentIds)

  return taskId
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

  if (input.afterTaskId !== undefined && input.beforeTaskId !== undefined) {
    throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, '"afterTaskId" and "beforeTaskId" cannot both be given.')
  }

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
    deleted: readBoolean(input, "deleted"),
    addSpentSeconds: readInteger(input, "addSpentSeconds"),
    afterTaskId: readString(input, "afterTaskId"),
    beforeTaskId: readString(input, "beforeTaskId"),
    addAttachments: readAttachmentAdds(input),
    removeAttachmentIds: readIdArray(input, "removeAttachmentIds"),
  }
}

async function createTask(ctx: AgentToolContext, fields: ParsedFields, source: ActorSource): Promise<Task["id"]> {
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
  const created = await ctx.core.tasksService.createTask(
    {
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
    },
    source,
  )
  if (!created) throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, "The task could not be created.")

  await applyRelations(ctx, created.id, fields.blockedBy, fields.blocks)

  return created.id
}

async function updateTask(ctx: AgentToolContext, id: Task["id"], fields: ParsedFields, source: ActorSource): Promise<Task["id"]> {
  let before = await ctx.core.tasksService.getTask(id)
  if (!before) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No task "${id}".`)

  if (fields.deleted === false) {
    const restored = await ctx.core.tasksService.restoreTask(id, source)
    if (restored) before = restored
  }

  const projectId = fields.projectId === undefined ? before.branchId : await resolveProjectId(ctx, fields.projectId)

  const updates: Partial<Task> = {}
  if (fields.content !== undefined) updates.content = fields.content
  if (fields.estimatedSeconds !== undefined) updates.estimatedTime = fields.estimatedSeconds
  if (fields.addSpentSeconds !== undefined) updates.spentTime = Math.max(0, before.spentTime + fields.addSpentSeconds)

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

  const updated = await ctx.core.tasksService.updateTask(id, updates, source)
  const after = updated.find((task) => task.id === id)
  if (!after) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No task "${id}".`)

  await applyRelations(ctx, id, fields.blockedBy, fields.blocks)

  return id
}

async function applyReorder(
  ctx: AgentToolContext,
  id: Task["id"],
  afterTaskId: string | undefined,
  beforeTaskId: string | undefined,
  source: ActorSource,
): Promise<void> {
  if (afterTaskId === undefined && beforeTaskId === undefined) return

  const targetTaskId = (afterTaskId ?? beforeTaskId) as string
  const position: TaskMovePosition = afterTaskId !== undefined ? "after" : "before"

  const current = await ctx.core.tasksService.getTask(id)
  if (!current) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No task "${id}".`)

  const target = await ctx.core.tasksService.getTask(targetTaskId)
  if (!target || target.branchId !== current.branchId) {
    throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No task "${targetTaskId}" in this project.`)
  }

  const activeDate = current.scheduled?.date ?? ctx.clock.today()

  await ctx.core.tasksService.moveTaskByOrder({taskId: id, targetTaskId, position, targetStatus: current.status, activeDate}, source)
}

async function applyAttachments(
  ctx: AgentToolContext,
  taskId: Task["id"],
  adds: AttachmentAdd[] | undefined,
  removeIds: string[] | undefined,
): Promise<void> {
  if (adds !== undefined) {
    for (const add of adds) {
      const {file, ext} = await ctx.core.filesService.prepareFile(add.name, add.bytes)

      ctx.afterCommit(async () => {
        await ctx.core.filesService.writeFileAsset(file.id, ext, add.bytes)
        indexExistingAsset(ctx.store, fileAssetName(file), ctx.agent.deviceId)
      })

      await ctx.core.tasksService.addTaskAttachment(taskId, file.id)
    }
  }

  if (removeIds !== undefined) {
    for (const fileId of removeIds) {
      await ctx.core.tasksService.removeTaskAttachment(taskId, fileId)
    }
  }
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

function readIdArray(input: Record<string, unknown>, field: string): string[] | undefined {
  const value = input[field]
  if (value === undefined) return undefined
  if (!isArray(value) || !value.every(isString)) {
    throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, `"${field}" must be an array of ids.`)
  }

  return value
}

function readAttachmentAdds(input: Record<string, unknown>): AttachmentAdd[] | undefined {
  const value = input.addAttachments
  if (value === undefined) return undefined
  if (!isArray(value)) throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, '"addAttachments" must be an array.')
  if (value.length > MAX_ATTACHMENTS_PER_CALL) {
    throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, `"addAttachments" cannot hold more than ${MAX_ATTACHMENTS_PER_CALL} files.`)
  }

  return value.map(parseAttachmentAdd)
}

function parseAttachmentAdd(item: unknown): AttachmentAdd {
  if (!isObject<Record<string, unknown>>(item)) {
    throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, '"addAttachments" items must be objects.')
  }

  const name = requireString(item, "name")
  const dataBase64 = requireString(item, "dataBase64")
  const bytes = Buffer.from(dataBase64, "base64")

  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, `"${name}" is ${bytes.length} bytes, over the ${MAX_ATTACHMENT_BYTES}-byte cap.`)
  }
  if (!sniffImageExt(bytes)) {
    throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, `"${name}" is not a recognisable image.`)
  }

  return {name, bytes}
}
