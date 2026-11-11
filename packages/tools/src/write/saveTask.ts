import {NO_PROJECT_ID, TASK_STATUSES} from "@daily/protocol"
import {isArray, isObject, isString} from "@daily/std"

import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {readString} from "../input"
import {readTaskDetail} from "../readTaskDetail"

import type {Milestone, Tag, Task, TaskMovePosition, TaskPriority} from "@daily/protocol"
import type {Tool, ToolContext, ToolPropertySchema} from "../types"

const TASK_PRIORITIES: TaskPriority[] = ["none", "urgent", "high", "medium", "low"]
const MAX_BATCH_SIZE = 50

type ParsedFields = {
  content?: string
  projectId?: string
  milestoneId?: string | null
  tagIds?: string[]
  blockedBy?: string[]
  blocks?: string[]
  afterTaskId?: string
  beforeTaskId?: string
}

const TASK_ITEM_PROPERTIES: Record<string, ToolPropertySchema> = {
  id: {type: "string", description: "The task id, to update it. Omitted to create one."},
  content: {type: "string", description: "The task's text. Required when creating."},
  projectId: {
    type: "string",
    description: 'The project the task belongs to. Defaults to "main" when creating. A move drops the old project\'s milestone and tags.',
  },
  date: {
    type: ["string", "null"],
    description: "Protected: use update_task_workflow kind=propose with changes.scheduled; the person manually applies the suggestion in Daily.",
  },
  time: {type: "string", description: "Protected: propose a scheduled day/time through update_task_workflow."},
  status: {
    type: "string",
    description: "Protected: use update_task_workflow kind=transition. Completion, cancellation and reopening require the person in Daily.",
    enum: TASK_STATUSES,
  },
  priority: {
    type: "string",
    description: "Protected: propose changes.priority through update_task_workflow. New tasks start with no priority.",
    enum: TASK_PRIORITIES,
  },
  milestoneId: {type: ["string", "null"], description: "The milestone this task belongs to, from its own project, or null to clear it."},
  tagIds: {type: "array", description: "Replaces the task's whole tag set.", items: {type: "string", description: "A tag id."}},
  estimatedSeconds: {type: "integer", description: "Protected: propose changes.estimatedTime in seconds through update_task_workflow.", minimum: 0},
  blockedBy: {
    type: "array",
    description: "Tasks that block this one. Replaces the whole set.",
    items: {type: "string", description: "A task id."},
  },
  blocks: {type: "array", description: "Tasks this one blocks. Replaces the whole set.", items: {type: "string", description: "A task id."}},
  deleted: {
    type: "boolean",
    description: "Protected: restoring deleted tasks requires the person in Daily. Delete with delete_task.",
  },
  addSpentSeconds: {
    type: "integer",
    description: "Protected: use workflow start/heartbeat/pause for confirmed active work. Human time edits require Daily.",
  },
  afterTaskId: {type: "string", description: 'Places the task right after this one, within its day. Cannot be combined with "beforeTaskId".'},
  beforeTaskId: {type: "string", description: 'Places the task right before this one, within its day. Cannot be combined with "afterTaskId".'},
}

export const saveTaskTool: Tool = {
  name: "save_task",
  description:
    'Creates an unscheduled Backlog task when no id is given, or edits content, project, tags, milestone and relations on the task named. Use get_task_workflow and update_task_workflow for status and active time; propose schedule, estimate and priority changes there for the person to apply in Daily. Direct protected edits and restoring deleted tasks are refused. Send "tasks" for an atomic batch of up to 50.',
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
        throw new ToolError(ToolErrorCode.INVALID_INPUT, '"tasks" cannot be combined with any top-level task field.')
      }

      const items = readTaskBatch(input.tasks)
      const ids = await ctx.workStorage.batch(async () => {
        const collected: Task["id"][] = []
        for (const item of items) collected.push(await applyOneTask(ctx, item))
        return collected
      })

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
  if (!isArray(value)) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"tasks" must be an array.')
  if (value.length > MAX_BATCH_SIZE) {
    throw new ToolError(ToolErrorCode.INVALID_INPUT, `"tasks" cannot hold more than ${MAX_BATCH_SIZE} items.`)
  }

  return value.map((item, index) => {
    if (!isObject<Record<string, unknown>>(item)) throw new ToolError(ToolErrorCode.INVALID_INPUT, `"tasks[${index}]" must be an object.`)

    return item
  })
}

async function applyOneTask(ctx: ToolContext, input: Record<string, unknown>): Promise<Task["id"]> {
  const protectedFields = ["status", "date", "time", "priority", "estimatedSeconds", "addSpentSeconds", "deleted"]
  const protectedField = protectedFields.find((field) => Object.hasOwn(input, field))
  if (protectedField) {
    throw new ToolError(
      ToolErrorCode.WORKFLOW_REQUIRED,
      `"${protectedField}" cannot be changed with save_task. Read get_task_workflow, then use update_task_workflow for stage, active time or a pending planning proposal. The person must complete, cancel, restore or manually apply planning changes in Daily. Create a task first before proposing planning changes.`,
    )
  }
  const id = readString(input, "id")
  const fields = parseFields(input)

  return ctx.workStorage.batch(async () => {
    const taskId = id === undefined ? await createTask(ctx, fields) : await updateTask(ctx, id, fields)
    await applyReorder(ctx, taskId, fields.afterTaskId, fields.beforeTaskId)
    return taskId
  })
}

function parseFields(input: Record<string, unknown>): ParsedFields {
  const rawMilestoneId = input.milestoneId
  const milestoneId = rawMilestoneId === null ? null : readString(input, "milestoneId")

  if (input.afterTaskId !== undefined && input.beforeTaskId !== undefined) {
    throw new ToolError(ToolErrorCode.INVALID_INPUT, '"afterTaskId" and "beforeTaskId" cannot both be given.')
  }

  return {
    content: readString(input, "content"),
    projectId: readString(input, "projectId"),
    milestoneId,
    tagIds: readIdArray(input, "tagIds"),
    blockedBy: readIdArray(input, "blockedBy"),
    blocks: readIdArray(input, "blocks"),
    afterTaskId: readString(input, "afterTaskId"),
    beforeTaskId: readString(input, "beforeTaskId"),
  }
}

async function createTask(ctx: ToolContext, fields: ParsedFields): Promise<Task["id"]> {
  if (!fields.content) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"content" is required.')

  const projectId = await resolveProjectId(ctx, fields.projectId ?? NO_PROJECT_ID)

  const milestoneId = (await resolveMilestoneId(ctx, fields.milestoneId, projectId)) ?? null
  const tags = (await resolveTags(ctx, fields.tagIds, projectId)) ?? []

  const now = new Date().toISOString()
  const changeset = await ctx.workStorage.createTask(
    {
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      branchId: projectId,
      scheduled: null,
      status: "backlog",
      priority: "none",
      milestoneId,
      tags,
      content: fields.content,
      minimized: false,
      orderIndex: Date.now(),
      estimatedTime: 0,
      spentTime: 0,
    },
    ctx.source,
  )
  const created = changeset.tasks?.upserted?.[0]
  if (!created) throw new ToolError(ToolErrorCode.INVALID_INPUT, "The task could not be created.")

  await applyRelations(ctx, created.id, fields.blockedBy, fields.blocks)

  return created.id
}

async function updateTask(ctx: ToolContext, id: Task["id"], fields: ParsedFields): Promise<Task["id"]> {
  const before = await ctx.workStorage.getTask(id)
  if (!before) throw new ToolError(ToolErrorCode.NOT_FOUND, `No task "${id}".`)

  const projectId = fields.projectId === undefined ? before.branchId : await resolveProjectId(ctx, fields.projectId)

  const updates: Partial<Task> = {}
  if (fields.content !== undefined) updates.content = fields.content

  const milestoneId = await resolveMilestoneId(ctx, fields.milestoneId, projectId)
  if (milestoneId !== undefined) updates.milestoneId = milestoneId

  const tags = await resolveTags(ctx, fields.tagIds, projectId)
  if (tags !== undefined) updates.tags = tags

  if (projectId !== before.branchId) updates.branchId = projectId

  const updated = await ctx.workStorage.updateTask(id, updates, ctx.source)
  const after = updated.tasks?.upserted?.find((task) => task.id === id)
  if (!after) throw new ToolError(ToolErrorCode.NOT_FOUND, `No task "${id}".`)

  await applyRelations(ctx, id, fields.blockedBy, fields.blocks)

  return id
}

async function applyReorder(ctx: ToolContext, id: Task["id"], afterTaskId: string | undefined, beforeTaskId: string | undefined): Promise<void> {
  if (afterTaskId === undefined && beforeTaskId === undefined) return

  const targetTaskId = (afterTaskId ?? beforeTaskId) as string
  const position: TaskMovePosition = afterTaskId !== undefined ? "after" : "before"

  const current = await ctx.workStorage.getTask(id)
  if (!current) throw new ToolError(ToolErrorCode.NOT_FOUND, `No task "${id}".`)

  const target = await ctx.workStorage.getTask(targetTaskId)
  if (!target || target.branchId !== current.branchId) {
    throw new ToolError(ToolErrorCode.NOT_FOUND, `No task "${targetTaskId}" in this project.`)
  }

  const activeDate = current.scheduled?.date ?? ctx.clock.today()

  await ctx.workStorage.moveTaskByOrder({taskId: id, targetTaskId, position, targetStatus: current.status, activeDate}, ctx.source)
}

async function resolveProjectId(ctx: ToolContext, projectId: string): Promise<string> {
  const project = await ctx.workStorage.getBranch(projectId)
  if (!project) throw new ToolError(ToolErrorCode.NOT_FOUND, `No project "${projectId}".`)

  return project.id
}

async function resolveMilestoneId(ctx: ToolContext, milestoneId: string | null | undefined, projectId: string): Promise<string | null | undefined> {
  if (milestoneId === undefined || milestoneId === null) return milestoneId

  const milestone: Milestone | null = await ctx.workStorage.getMilestone(milestoneId)
  if (!milestone) throw new ToolError(ToolErrorCode.NOT_FOUND, `No milestone "${milestoneId}".`)
  if (milestone.branchId !== projectId) {
    throw new ToolError(ToolErrorCode.NOT_FOUND, `"milestoneId" refers to a milestone in another project.`)
  }

  return milestoneId
}

async function resolveTags(ctx: ToolContext, tagIds: string[] | undefined, projectId: string): Promise<Tag[] | undefined> {
  if (tagIds === undefined) return undefined

  const tags: Tag[] = []
  for (const tagId of tagIds) {
    const tag = await ctx.workStorage.getTag(tagId)
    if (!tag) throw new ToolError(ToolErrorCode.NOT_FOUND, `No tag "${tagId}".`)
    if (tag.branchId !== projectId) throw new ToolError(ToolErrorCode.NOT_FOUND, `"tagIds" includes a tag from another project.`)
    tags.push(tag)
  }

  return tags
}

async function applyRelations(ctx: ToolContext, taskId: Task["id"], blockedBy: string[] | undefined, blocks: string[] | undefined): Promise<void> {
  if (blockedBy === undefined && blocks === undefined) return
  if ((blockedBy ?? []).includes(taskId) || (blocks ?? []).includes(taskId)) {
    throw new ToolError(ToolErrorCode.INVALID_INPUT, "A task cannot block or be blocked by itself.")
  }

  const current = await ctx.workStorage.getRelationsOfTask(taskId)
  const nextBlockedBy = blockedBy ?? current.blockedBy.map((task) => task.id)
  const nextBlocks = blocks ?? current.blocks.map((task) => task.id)

  await ctx.workStorage.setTaskRelations(taskId, {blockedBy: nextBlockedBy, blocks: nextBlocks})
}

function readIdArray(input: Record<string, unknown>, field: string): string[] | undefined {
  const value = input[field]
  if (value === undefined) return undefined
  if (!isArray(value) || !value.every(isString)) {
    throw new ToolError(ToolErrorCode.INVALID_INPUT, `"${field}" must be an array of ids.`)
  }

  return value
}
