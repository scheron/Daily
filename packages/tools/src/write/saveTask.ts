import {randomUUID} from "node:crypto"

import {NO_PROJECT_ID, TASK_PRIORITIES, TASK_STATUSES} from "@daily/protocol"
import {isArray, isObject, isString} from "@daily/std"

import {readTaskDetail} from "../utils/tasks/readTaskDetail"
import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {readBoolean, readEnum, readInteger, readISODate, readISOTime, readString} from "../input"

import type {
  ISODate,
  ISOTime,
  Milestone,
  Tag,
  Task,
  TaskMovePosition,
  TaskPlanningChanges,
  TaskPriority,
  TaskScheduled,
  TaskStatus,
} from "@daily/protocol"
import type {Tool, ToolContext, ToolPropertySchema} from "../types"

type ParsedFields = {
  content?: string
  projectId?: string
  date?: ISODate | null
  time?: ISOTime
  status?: TaskStatus
  priority?: TaskPriority
  estimatedSeconds?: number
  deleted?: boolean
  milestoneId?: string | null
  tagIds?: string[]
  blockedBy?: string[]
  blocks?: string[]
  afterTaskId?: string
  beforeTaskId?: string
}

type SavedTask = {id: string; proposalId: string | null}

const TASK_ITEM_PROPERTIES: Record<string, ToolPropertySchema> = {
  id: {type: "string", description: "The task id, to update it. Omitted to create one."},
  content: {type: "string", description: "The task's text. Required when creating."},
  projectId: {
    type: "string",
    description: 'The project the task belongs to. Defaults to "main" when creating. A move drops the old project\'s milestone and tags.',
  },
  date: {
    type: ["string", "null"],
    description:
      "Scheduled day, YYYY-MM-DD, or null. Applied on creation; existing-task changes become pending review proposals. Scheduling Backlog makes it To Do; clearing To Do's day returns it to Backlog.",
  },
  time: {
    type: "string",
    description: "Time HH:mm or HH:mm:ss. Applied on creation; existing-task changes become pending review proposals. Clear a day with date:null.",
  },
  status: {
    type: "string",
    description:
      "The exact real task status. Completion/cancellation require effective structured allowCompletion permission. A status change that changes an existing schedule becomes one pending status and schedule proposal; schedule preserving transitions apply automatically.",
    enum: TASK_STATUSES,
  },
  priority: {
    type: "string",
    description: "Priority. Applied on creation; existing-task changes become pending review proposals. Defaults to none on creation.",
    enum: TASK_PRIORITIES,
  },
  milestoneId: {type: ["string", "null"], description: "The milestone this task belongs to, from its own project, or null to clear it."},
  tagIds: {type: "array", description: "Replaces the task's whole tag set.", items: {type: "string", description: "A tag id."}},
  estimatedSeconds: {
    type: "integer",
    description: "Nonnegative integer seconds. Applied on creation; existing-task changes become pending review proposals.",
    minimum: 0,
  },
  blockedBy: {
    type: "array",
    description: "Tasks that block this one. Replaces the whole set.",
    items: {type: "string", description: "A task id."},
  },
  blocks: {type: "array", description: "Tasks this one blocks. Replaces the whole set.", items: {type: "string", description: "A task id."}},
  deleted: {
    type: "boolean",
    description:
      "Set false to restore a soft-deleted task. Restore separately before requesting planning changes so review is accessible in Daily. To delete, use delete_task.",
  },
  addSpentSeconds: {
    type: "integer",
    description:
      "Compatibility field: direct time changes are refused. Use session_start/session_update for host-observed work; human time corrections remain available in Daily.",
  },
  afterTaskId: {type: "string", description: 'Places the task right after this one, within its day. Cannot be combined with "beforeTaskId".'},
  beforeTaskId: {type: "string", description: 'Places the task right before this one, within its day. Cannot be combined with "afterTaskId".'},
}

export const saveTaskTool: Tool = {
  name: "save_task",
  description:
    'Creates a task with the requested initial fields; defaults to To Do on the caller\'s day, or Backlog with date:null. Edits content, project, tags, milestone, relations and real status on an existing task. Existing day/time/priority/estimate edits and schedule changing statuses create one pending proposal for all fields in that request and return outcome=proposal_pending. The proposed task fields remain unchanged until trusted Daily acceptance. Inspect exact original/new values; never claim pending changes were applied. Send "tasks" for an atomic batch of up to 50. Use independent workflow sessions for observed time.',
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
      const savedTasks = await ctx.workStorage.batch(async () => {
        const collected: SavedTask[] = []
        for (const item of items) collected.push(await applyOneTask(ctx, item))
        return collected
      })

      const results = await Promise.all(savedTasks.map((saved) => readSavedTask(ctx, saved)))
      const proposals = results.flatMap((result) => result.proposals)
      return {tasks: results.map((result) => result.task), ...(proposals.length > 0 && {proposals, outcome: "proposal_pending"})}
    }

    const saved = await applyOneTask(ctx, input)
    const {task, proposals} = await readSavedTask(ctx, saved)
    return {task, ...(proposals.length > 0 && {proposals, outcome: "proposal_pending"})}
  },
}

function hasTopLevelTaskField(input: Record<string, unknown>): boolean {
  return Object.keys(TASK_ITEM_PROPERTIES).some((field) => input[field] !== undefined)
}

function readTaskBatch(value: unknown): Record<string, unknown>[] {
  const MAX_BATCH_SIZE = 50
  if (!isArray(value)) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"tasks" must be an array.')
  if (value.length > MAX_BATCH_SIZE) {
    throw new ToolError(ToolErrorCode.INVALID_INPUT, `"tasks" cannot hold more than ${MAX_BATCH_SIZE} items.`)
  }

  return value.map((item, index) => {
    if (!isObject<Record<string, unknown>>(item)) throw new ToolError(ToolErrorCode.INVALID_INPUT, `"tasks[${index}]" must be an object.`)

    return item
  })
}

async function applyOneTask(ctx: ToolContext, input: Record<string, unknown>): Promise<SavedTask> {
  const approval = ["approved", "approval", "decision", "allowCompletion"].find((field) => Object.hasOwn(input, field))
  if (approval) throw new ToolError(ToolErrorCode.INVALID_INPUT, `"${approval}" cannot grant approval. Review proposals in Daily.`)
  const id = readString(input, "id")
  if (Object.hasOwn(input, "addSpentSeconds")) {
    throw new ToolError(
      ToolErrorCode.WORKFLOW_REQUIRED,
      "Direct logged time is unavailable to agents. Use update_task_workflow session_start/session_update for host-observed elapsed work; correct human time in Daily.",
    )
  }
  const fields = parseFields(input)
  if (fields.deleted === true) throw new ToolError(ToolErrorCode.INVALID_INPUT, "Use delete_task to delete a task.")
  if (fields.deleted === false && id === undefined) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"deleted":false requires an existing task id.')

  return ctx.workStorage.batch(async () => {
    const saved = id === undefined ? {id: await createTask(ctx, fields), proposalId: null} : await updateTask(ctx, id, fields)
    await applyReorder(ctx, saved.id, fields.afterTaskId, fields.beforeTaskId)
    return saved
  })
}

function parseFields(input: Record<string, unknown>): ParsedFields {
  const date = input.date === null ? null : readISODate(input, "date")
  const time = readISOTime(input, "time")
  const rawMilestoneId = input.milestoneId
  const milestoneId = rawMilestoneId === null ? null : readString(input, "milestoneId")

  if (input.afterTaskId !== undefined && input.beforeTaskId !== undefined) {
    throw new ToolError(ToolErrorCode.INVALID_INPUT, '"afterTaskId" and "beforeTaskId" cannot both be given.')
  }

  return {
    content: readString(input, "content"),
    projectId: readString(input, "projectId"),
    date,
    time,
    status: readEnum(input, "status", TASK_STATUSES),
    priority: readEnum(input, "priority", TASK_PRIORITIES),
    estimatedSeconds: readInteger(input, "estimatedSeconds", {min: 0}),
    deleted: readBoolean(input, "deleted"),
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

  let status: TaskStatus
  let scheduled: TaskScheduled | null
  if (fields.date === undefined) {
    status = fields.status ?? "todo"
    scheduled =
      status === "ready_for_agent" && fields.time === undefined
        ? null
        : {...ctx.clock.scheduledNow(), ...(fields.time !== undefined && {time: fields.time})}
  } else if (fields.date === null) {
    status = fields.status ?? "backlog"
    scheduled = null
  } else {
    status = fields.status ?? "todo"
    scheduled = {date: fields.date, time: fields.time ?? ctx.clock.time(), timezone: ctx.clock.timeZone}
  }

  const milestoneId = (await resolveMilestoneId(ctx, fields.milestoneId, projectId)) ?? null
  const tags = (await resolveTags(ctx, fields.tagIds, projectId)) ?? []

  const now = new Date().toISOString()
  const changeset = await ctx.workStorage.createTask(
    {
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      branchId: projectId,
      scheduled,
      status,
      priority: fields.priority ?? "none",
      milestoneId,
      tags,
      content: fields.content,
      minimized: false,
      orderIndex: Date.now(),
      estimatedTime: fields.estimatedSeconds ?? 0,
      spentTime: 0,
    },
    ctx.source,
  )
  const created = changeset.tasks?.upserted?.[0]
  if (!created) throw new ToolError(ToolErrorCode.INVALID_INPUT, "The task could not be created.")

  await applyRelations(ctx, created.id, fields.blockedBy, fields.blocks)

  return created.id
}

async function updateTask(ctx: ToolContext, id: Task["id"], fields: ParsedFields): Promise<SavedTask> {
  const before = await ctx.workStorage.getTask(id)
  if (!before) throw new ToolError(ToolErrorCode.NOT_FOUND, `No task "${id}".`)
  const projectId = fields.projectId === undefined ? before.branchId : await resolveProjectId(ctx, fields.projectId)
  const updates: TaskPlanningChanges = {}
  if (fields.content !== undefined) updates.content = fields.content
  const milestoneId = await resolveMilestoneId(ctx, fields.milestoneId, projectId)
  if (milestoneId !== undefined) updates.milestoneId = milestoneId
  const tags = await resolveTags(ctx, fields.tagIds, projectId)
  if (tags !== undefined) updates.tags = tags
  if (projectId !== before.branchId) updates.branchId = projectId
  if (fields.deleted === false && before.deletedAt !== null) updates.deletedAt = null

  const changes: TaskPlanningChanges = {...updates}
  if (fields.status !== undefined) changes.status = fields.status
  if (fields.date === null) changes.scheduled = null
  else if (fields.date !== undefined || fields.time !== undefined)
    changes.scheduled = {
      date: fields.date ?? before.scheduled?.date ?? ctx.clock.today(),
      time: fields.time ?? before.scheduled?.time ?? ctx.clock.time(),
      timezone: ctx.clock.timeZone,
    }
  if (fields.priority !== undefined) changes.priority = fields.priority
  if (fields.estimatedSeconds !== undefined) changes.estimatedTime = fields.estimatedSeconds
  const dependentSchedule =
    fields.status !== undefined &&
    (fields.status === "backlog" ? before.scheduled !== null : fields.status !== "ready_for_agent" && before.scheduled === null)
  const review = dependentSchedule || ["scheduled", "priority", "estimatedTime"].some((key) => Object.hasOwn(changes, key))
  const actor = {actorId: ctx.workflowActorId, source: ctx.source}
  if (review) {
    if (before.deletedAt !== null && updates.deletedAt === null)
      throw new ToolError(ToolErrorCode.INVALID_INPUT, "Restore the task first, then request planning changes; no changes applied.")
    if (fields.blockedBy !== undefined || fields.blocks !== undefined || fields.afterTaskId !== undefined || fields.beforeTaskId !== undefined)
      throw new ToolError(
        ToolErrorCode.INVALID_INPUT,
        "A pending planning change cannot include relations or relative reordering. Submit those edits separately after review; no changes were applied.",
      )
    const workflow = await ctx.workStorage.getTaskWorkflow(id)
    const receipt = await ctx.workStorage.executeTaskWorkflow(
      {
        taskId: id,
        operationId: randomUUID(),
        expectedRevision: workflow.revision,
        kind: "propose",
        changes,
        reason:
          "Combined task changes requested through save_task. Review every original and proposed value together; the proposed task fields remain unchanged until accepted in Daily.",
      },
      actor,
    )
    return {id, proposalId: receipt.proposalId ?? receipt.recordId}
  }

  if (updates.deletedAt === null) {
    await ctx.workStorage.restoreTask(id, ctx.source)
    delete updates.deletedAt
  }
  if (Object.keys(updates).length) await ctx.workStorage.updateTask(id, updates, ctx.source)
  await applyRelations(ctx, id, fields.blockedBy, fields.blocks)
  if (fields.status !== undefined) {
    const workflow = await ctx.workStorage.getTaskWorkflow(id)
    const receipt = await ctx.workStorage.executeTaskWorkflow(
      {taskId: id, operationId: randomUUID(), expectedRevision: workflow.revision, kind: "transition", status: fields.status},
      actor,
    )
    return {id, proposalId: receipt.proposalId ?? null}
  }
  return {id, proposalId: null}
}

async function readSavedTask(ctx: ToolContext, saved: SavedTask) {
  const task = await readTaskDetail(ctx, saved.id)
  const proposals =
    saved.proposalId === null
      ? []
      : (await ctx.workStorage.getTaskWorkflow(saved.id)).proposals
          .filter((proposal) => proposal.id === saved.proposalId)
          .map((proposal) => ({taskId: saved.id, ...proposal}))
  return {task, proposals}
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
