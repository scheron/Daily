import {nanoid} from "nanoid"

import {MAIN_BRANCH_ID} from "@shared/constants/storage"
import {getPreviousTaskOrderIndex} from "@shared/utils/tasks/orderIndex"

import {formatTask} from "@/ai/utils/formatTask"
import {getTodayDate} from "@/ai/utils/getTodayDate"

import type {Tag, Task} from "@shared/types/storage"
import type {RegisteredTool} from "../../types"

export const createTask: RegisteredTool = {
  name: "create_task",
  description:
    "Create a new task. Use when user wants to add a new task, todo, reminder, or appointment. Parse natural language to extract date/time if mentioned. Example: 'add task buy milk' -> content='buy milk', date=today. 'remind me to call mom tomorrow at 3pm' -> content='call mom', date=tomorrow, time='15:00'. To add tags, first use list_tags to get available tag_ids.",
  parameters: {
    type: "object",
    properties: {
      content: {type: "string", description: "Task description/content. Keep it concise but descriptive."},
      date: {type: "string", description: "Scheduled date in YYYY-MM-DD format. Defaults to today if user doesn't specify."},
      time: {type: "string", description: "Scheduled time in HH:MM 24-hour format. Example: '14:30' for 2:30 PM. Optional."},
      tag_ids: {type: "array", description: "Array of tag IDs to assign. Get available IDs from list_tags first."},
      estimated_minutes: {
        type: "number",
        description: "Estimated time for the task in minutes. Example: 30 for half an hour, 120 for 2 hours. Optional.",
      },
      project_id: {type: "string", description: "Optional project ID. If omitted, task is created in active project."},
    },
    required: ["content"],
  },
  isWrite: true,
  isDestructive: false,
  async execute(params, ctx) {
    const content = params.content as string
    if (!content) {
      return {success: false, error: "Content is required"}
    }

    const now = new Date().toISOString()
    const date = (params.date as string) || getTodayDate()
    const time = (params.time as string) || ""
    const tagIds = (params.tag_ids as string[]) || []
    const estimatedMinutes = params.estimated_minutes as number | undefined
    const estimatedTime = estimatedMinutes ? Math.max(0, Math.round(estimatedMinutes)) * 60 : 0
    const requestedBranchId = params.project_id as string | undefined

    const settings = await ctx.storage.loadSettings()
    const activeBranchId = settings.branch?.activeId ?? MAIN_BRANCH_ID

    let targetBranchId = activeBranchId
    if (requestedBranchId) {
      const branch = await ctx.storage.getBranch(requestedBranchId)
      if (!branch) {
        return {success: false, error: `Project not found: ${requestedBranchId}`}
      }
      targetBranchId = branch.id
    }

    const dayTasks = await ctx.storage.getTaskList({from: date, to: date, branchId: targetBranchId})

    let tags: Tag[] = []
    if (tagIds.length > 0) {
      const allTags = await ctx.storage.getTagList()
      tags = allTags.filter((t) => tagIds.includes(t.id))
    }

    const task: Task = {
      id: nanoid(),
      content,
      status: "active",
      minimized: false,
      orderIndex: getPreviousTaskOrderIndex(dayTasks),
      scheduled: {
        date,
        time,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      tags,
      attachments: [],
      estimatedTime,
      spentTime: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      branchId: targetBranchId,
    }

    const created = await ctx.storage.createTask(task)

    if (!created) {
      return {success: false, error: "Failed to create task"}
    }

    return {
      success: true,
      data: `Task created: ${formatTask(created)}`,
      changedEntities: [{type: "task", id: created.id, action: "created"}],
    }
  },
}
