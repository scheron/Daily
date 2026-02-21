import {nanoid} from "nanoid"

import {TAG_QUICK_COLORS} from "@shared/constants/theme/colorPalette"
import {toDurationLabel} from "@shared/utils/date/formatters"
import {getNextTaskOrderIndex} from "@shared/utils/tasks/orderIndex"
import {logger} from "@/utils/logger"

import type {StorageController} from "@/storage/StorageController"
import type {Day, File, Tag, Task} from "@shared/types/storage"
import type {ToolName} from "./tools"
import type {ToolParams, ToolResult} from "./types"

export class ToolExecutor {
  constructor(private storage: StorageController) {}

  async execute(toolName: ToolName, params: ToolParams): Promise<ToolResult> {
    logger.info(logger.CONTEXT.AI, `Executing tool: ${toolName}`, params)

    try {
      switch (toolName) {
        // Tasks
        case "list_tasks":
          return await this.listTasks(params)
        case "get_task":
          return await this.getTask(params)
        case "create_task":
          return await this.createTask(params)
        case "update_task":
          return await this.updateTask(params)
        case "complete_task":
          return await this.completeTask(params)
        case "discard_task":
          return await this.discardTask(params)
        case "reactivate_task":
          return await this.reactivateTask(params)
        case "delete_task":
          return await this.deleteTask(params)
        case "get_deleted_tasks":
          return await this.getDeletedTasks(params)
        case "restore_task":
          return await this.restoreTask(params)
        case "permanently_delete_task":
          return await this.permanentlyDeleteTask(params)
        case "add_task_tags":
          return await this.addTaskTags(params)
        case "remove_task_tags":
          return await this.removeTaskTags(params)
        case "search_tasks":
          return await this.searchTasks(params)
        case "move_task":
          return await this.moveTask(params)
        // Time tracking
        case "log_time":
          return await this.logTime(params)
        // Day overview
        case "get_day_summary":
          return await this.getDaySummary(params)
        // Attachments
        case "get_task_attachments":
          return await this.getTaskAttachments(params)
        case "remove_task_attachment":
          return await this.removeTaskAttachment(params)
        // Tags
        case "list_tags":
          return await this.listTags()
        case "get_tag":
          return await this.getTag(params)
        case "create_tag":
          return await this.createTag(params)
        case "update_tag":
          return await this.updateTag(params)
        case "delete_tag":
          return await this.deleteTag(params)
        default:
          return {success: false, error: `Unknown tool: ${toolName}`}
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(logger.CONTEXT.AI, `Tool execution failed: ${toolName}`, error)
      return {success: false, error: message}
    }
  }

  private getTodayDate(): string {
    return new Date().toISOString().split("T")[0]
  }

  private formatDuration(seconds: number): string {
    return seconds > 0 ? toDurationLabel(seconds) : "none"
  }

  private formatTask(task: Task, compact = true): string {
    const statusEmoji = task.status === "done" ? "✅" : task.status === "discarded" ? "❌" : "⬜"
    const time = task.scheduled.time || "no time"
    const tags = task.tags.length > 0 ? ` [${task.tags.map((t) => t.name).join(", ")}]` : ""
    // In compact mode, only show first line of content to reduce token count
    const content = compact ? task.content.split("\n")[0].slice(0, 100) : task.content
    const est = task.estimatedTime > 0 ? ` (est: ${toDurationLabel(task.estimatedTime)})` : ""
    const spent = task.spentTime > 0 ? ` (spent: ${toDurationLabel(task.spentTime)})` : ""
    const attachments = task.attachments.length > 0 ? ` 📎${task.attachments.length}` : ""
    return `${statusEmoji} [${time}] ${content}${tags}${est}${spent}${attachments} (ID: ${task.id})`
  }

  private formatTag(tag: Tag): string {
    return `🏷️ ${tag.name} (color: ${tag.color}, ID: ${tag.id})`
  }

  // ========== TASKS ==========

  private async listTasks(params: ToolParams): Promise<ToolResult> {
    const date = (params.date as string) || this.getTodayDate()
    const includeDone = params.include_done !== false

    let tasks = await this.storage.getTaskList({from: date, to: date})

    if (!includeDone) {
      tasks = tasks.filter((t) => t.status !== "done")
    }

    tasks.sort((a, b) => a.scheduled.time.localeCompare(b.scheduled.time))

    if (tasks.length === 0) {
      return {success: true, data: `No tasks found for ${date}`}
    }

    const taskList = tasks.map((t, i) => `${i + 1}. ${this.formatTask(t)}`).join("\n")
    return {success: true, data: `Tasks for ${date} (${tasks.length} total):\n${taskList}`}
  }

  private async getTask(params: ToolParams): Promise<ToolResult> {
    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }

    const task = await this.storage.getTask(taskId)
    if (!task) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    const lines = [`Task details:\n${this.formatTask(task, false)}`, `Date: ${task.scheduled.date}`]

    if (task.estimatedTime > 0 || task.spentTime > 0) {
      const est = this.formatDuration(task.estimatedTime)
      const spent = this.formatDuration(task.spentTime)
      let timeLine = `Time — estimated: ${est}, spent: ${spent}`
      if (task.estimatedTime > 0 && task.spentTime > 0) {
        const pct = Math.round((task.spentTime / task.estimatedTime) * 100)
        timeLine += ` (${pct}%)`
      }
      lines.push(timeLine)
    }

    if (task.attachments.length > 0) {
      lines.push(`Attachments: ${task.attachments.length} file(s) — use get_task_attachments for details`)
    }

    lines.push(`Created: ${task.createdAt}`)

    return {success: true, data: lines.join("\n")}
  }

  private async createTask(params: ToolParams): Promise<ToolResult> {
    const content = params.content as string
    if (!content) {
      return {success: false, error: "Content is required"}
    }

    const now = new Date().toISOString()
    const date = (params.date as string) || this.getTodayDate()
    const time = (params.time as string) || ""
    const tagIds = (params.tag_ids as string[]) || []
    const estimatedMinutes = params.estimated_minutes as number | undefined
    const estimatedTime = estimatedMinutes ? Math.max(0, Math.round(estimatedMinutes)) * 60 : 0
    const dayTasks = await this.storage.getTaskList({from: date, to: date})

    // Get tags if specified
    let tags: Tag[] = []
    if (tagIds.length > 0) {
      const allTags = await this.storage.getTagList()
      tags = allTags.filter((t) => tagIds.includes(t.id))
    }

    const task: Task = {
      id: nanoid(),
      content,
      status: "active",
      minimized: false,
      orderIndex: getNextTaskOrderIndex(dayTasks),
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
    }

    const created = await this.storage.createTask(task)

    if (!created) {
      return {success: false, error: "Failed to create task"}
    }

    return {success: true, data: `Task created: ${this.formatTask(created)}`}
  }

  private async updateTask(params: ToolParams): Promise<ToolResult> {
    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }

    const updates: Record<string, unknown> = {}

    if (params.content !== undefined) updates.content = params.content
    if (params.status !== undefined) updates.status = params.status

    if (params.date !== undefined || params.time !== undefined) {
      updates.scheduled = {}
      if (params.date !== undefined) (updates.scheduled as Record<string, string>).date = params.date as string
      if (params.time !== undefined) (updates.scheduled as Record<string, string>).time = params.time as string
    }

    if (params.estimated_minutes !== undefined) {
      updates.estimatedTime = Math.max(0, Math.round(params.estimated_minutes as number)) * 60
    }

    const updated = await this.storage.updateTask(taskId, updates)

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {success: true, data: `Task updated: ${this.formatTask(updated)}`}
  }

  private async completeTask(params: ToolParams): Promise<ToolResult> {
    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }

    const updated = await this.storage.updateTask(taskId, {status: "done"})

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {success: true, data: `Task completed: ${this.formatTask(updated)}`}
  }

  private async discardTask(params: ToolParams): Promise<ToolResult> {
    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }

    const updated = await this.storage.updateTask(taskId, {status: "discarded"})

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {success: true, data: `Task discarded: ${this.formatTask(updated)}`}
  }

  private async reactivateTask(params: ToolParams): Promise<ToolResult> {
    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }

    const updated = await this.storage.updateTask(taskId, {status: "active"})

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {success: true, data: `Task reactivated: ${this.formatTask(updated)}`}
  }

  private async deleteTask(params: ToolParams): Promise<ToolResult> {
    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }

    const deleted = await this.storage.deleteTask(taskId)

    if (!deleted) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {success: true, data: `Task moved to trash: ${taskId}`}
  }

  private async getDeletedTasks(params: ToolParams): Promise<ToolResult> {
    const limit = (params.limit as number) || 20

    const tasks = await this.storage.getDeletedTasks({limit})

    if (tasks.length === 0) {
      return {success: true, data: "No deleted tasks found"}
    }

    const taskList = tasks.map((t, i) => `${i + 1}. ${this.formatTask(t)} (deleted: ${t.deletedAt})`).join("\n")
    return {success: true, data: `Deleted tasks (${tasks.length}):\n${taskList}`}
  }

  private async restoreTask(params: ToolParams): Promise<ToolResult> {
    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }

    const restored = await this.storage.restoreTask(taskId)

    if (!restored) {
      return {success: false, error: `Task not found in trash: ${taskId}`}
    }

    return {success: true, data: `Task restored: ${this.formatTask(restored)}`}
  }

  private async permanentlyDeleteTask(params: ToolParams): Promise<ToolResult> {
    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }

    const deleted = await this.storage.permanentlyDeleteTask(taskId)

    if (!deleted) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {success: true, data: `Task permanently deleted: ${taskId}`}
  }

  private async addTaskTags(params: ToolParams): Promise<ToolResult> {
    const taskId = params.task_id as string
    const tagIds = params.tag_ids as string[]

    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }
    if (!tagIds || tagIds.length === 0) {
      return {success: false, error: "tag_ids is required"}
    }

    const updated = await this.storage.addTaskTags(taskId, tagIds)

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {success: true, data: `Tags added to task: ${this.formatTask(updated)}`}
  }

  private async removeTaskTags(params: ToolParams): Promise<ToolResult> {
    const taskId = params.task_id as string
    const tagIds = params.tag_ids as string[]

    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }
    if (!tagIds || tagIds.length === 0) {
      return {success: false, error: "tag_ids is required"}
    }

    const updated = await this.storage.removeTaskTags(taskId, tagIds)

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {success: true, data: `Tags removed from task: ${this.formatTask(updated)}`}
  }

  private async searchTasks(params: ToolParams): Promise<ToolResult> {
    const query = params.query as string
    if (!query) {
      return {success: false, error: "query is required"}
    }

    const results = await this.storage.searchTasks(query)

    if (results.length === 0) {
      return {success: true, data: `No tasks found matching "${query}"`}
    }

    const taskList = results.map((r, i) => `${i + 1}. ${this.formatTask(r.task)} (score: ${r.score.toFixed(2)})`).join("\n")
    return {success: true, data: `Search results for "${query}" (${results.length} found):\n${taskList}`}
  }

  private async moveTask(params: ToolParams): Promise<ToolResult> {
    const taskId = params.task_id as string
    const date = params.date as string

    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }
    if (!date) {
      return {success: false, error: "date is required"}
    }

    const updated = await this.storage.updateTask(taskId, {scheduled: {date}})

    if (!updated) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    return {success: true, data: `Task moved to ${date}: ${this.formatTask(updated)}`}
  }

  // ========== TIME TRACKING ==========

  private async logTime(params: ToolParams): Promise<ToolResult> {
    const taskId = params.task_id as string
    const minutes = params.minutes as number
    const operation = (params.operation as string) || "add"

    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }
    if (minutes === undefined || minutes === null) {
      return {success: false, error: "minutes is required"}
    }
    if (minutes < 0) {
      return {success: false, error: "minutes must be a positive number. Use operation='subtract' to remove time."}
    }

    const task = await this.storage.getTask(taskId)
    if (!task) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    const deltaSeconds = Math.round(minutes) * 60
    let newSpentTime: number

    switch (operation) {
      case "add":
        newSpentTime = task.spentTime + deltaSeconds
        break
      case "subtract":
        newSpentTime = Math.max(0, task.spentTime - deltaSeconds)
        break
      case "set":
        newSpentTime = deltaSeconds
        break
      default:
        return {success: false, error: `Invalid operation: ${operation}. Use 'add', 'subtract', or 'set'.`}
    }

    const updated = await this.storage.updateTask(taskId, {spentTime: newSpentTime})
    if (!updated) {
      return {success: false, error: `Failed to update task: ${taskId}`}
    }

    const label = this.formatDuration(newSpentTime)
    return {success: true, data: `Time logged (${operation}): ${this.formatTask(updated)}\nTotal spent: ${label}`}
  }

  // ========== DAY OVERVIEW ==========

  private async getDaySummary(params: ToolParams): Promise<ToolResult> {
    const date = (params.date as string) || this.getTodayDate()

    const day: Day | null = await this.storage.getDay(date)

    if (!day || day.tasks.length === 0) {
      return {success: true, data: `No tasks scheduled for ${date}.`}
    }

    const total = day.tasks.length
    const active = day.countActive
    const done = day.countDone
    const discarded = total - active - done
    const completionPct = total > 0 ? Math.round((done / total) * 100) : 0

    let totalEstimated = 0
    let totalSpent = 0
    for (const task of day.tasks) {
      totalEstimated += task.estimatedTime
      totalSpent += task.spentTime
    }

    const lines = [
      `📊 Day summary for ${date}:`,
      `Tasks: ${total} total — ${done} done, ${active} active${discarded > 0 ? `, ${discarded} discarded` : ""}`,
      `Completion: ${completionPct}%`,
    ]

    if (totalEstimated > 0 || totalSpent > 0) {
      lines.push(`Time — estimated: ${this.formatDuration(totalEstimated)}, spent: ${this.formatDuration(totalSpent)}`)
      if (totalEstimated > 0 && totalSpent > 0) {
        const timePct = Math.round((totalSpent / totalEstimated) * 100)
        lines.push(`Time usage: ${timePct}% of estimated`)
      }
    }

    if (day.tags.length > 0) {
      lines.push(`Tags: ${day.tags.map((t) => t.name).join(", ")}`)
    }

    return {success: true, data: lines.join("\n")}
  }

  // ========== ATTACHMENTS ==========

  private async getTaskAttachments(params: ToolParams): Promise<ToolResult> {
    const taskId = params.task_id as string
    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }

    const task = await this.storage.getTask(taskId)
    if (!task) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    if (task.attachments.length === 0) {
      return {success: true, data: `No attachments on task "${task.content.split("\n")[0].slice(0, 50)}".`}
    }

    const files: File[] = await this.storage.getFiles(task.attachments)

    if (files.length === 0) {
      return {success: true, data: `Task references ${task.attachments.length} file(s) but none could be loaded.`}
    }

    const fileList = files
      .map((f, i) => {
        const sizeKb = Math.round(f.size / 1024)
        const sizeLabel = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`
        return `${i + 1}. ${f.name} (${f.mimeType}, ${sizeLabel}) — ID: ${f.id}`
      })
      .join("\n")

    return {success: true, data: `Attachments for task (${files.length}):\n${fileList}`}
  }

  private async removeTaskAttachment(params: ToolParams): Promise<ToolResult> {
    const taskId = params.task_id as string
    const fileId = params.file_id as string

    if (!taskId) {
      return {success: false, error: "task_id is required"}
    }
    if (!fileId) {
      return {success: false, error: "file_id is required"}
    }

    const task = await this.storage.getTask(taskId)
    if (!task) {
      return {success: false, error: `Task not found: ${taskId}`}
    }

    if (!task.attachments.includes(fileId)) {
      return {success: false, error: `File ${fileId} is not attached to task ${taskId}`}
    }

    await this.storage.removeTaskAttachment(taskId, fileId)

    return {success: true, data: `Attachment removed from task: ${fileId}`}
  }

  // ========== TAGS ==========

  private async listTags(): Promise<ToolResult> {
    const tags = await this.storage.getTagList()

    if (tags.length === 0) {
      return {success: true, data: "No tags found"}
    }

    const tagList = tags.map((t, i) => `${i + 1}. ${this.formatTag(t)}`).join("\n")
    return {success: true, data: `Tags (${tags.length} total):\n${tagList}`}
  }

  private async getTag(params: ToolParams): Promise<ToolResult> {
    const tagId = params.tag_id as string
    if (!tagId) {
      return {success: false, error: "tag_id is required"}
    }

    const tag = await this.storage.getTag(tagId)
    if (!tag) {
      return {success: false, error: `Tag not found: ${tagId}`}
    }

    return {success: true, data: `Tag details: ${this.formatTag(tag)}\nCreated: ${tag.createdAt}`}
  }

  private async createTag(params: ToolParams): Promise<ToolResult> {
    const name = params.name as string
    if (!name) {
      return {success: false, error: "name is required"}
    }

    const color = (params.color as string) || TAG_QUICK_COLORS[Math.floor(Math.random() * TAG_QUICK_COLORS.length)]

    const created = await this.storage.createTag({name, color, deletedAt: null})

    if (!created) {
      return {success: false, error: "Failed to create tag"}
    }

    return {success: true, data: `Tag created: ${this.formatTag(created)}`}
  }

  private async updateTag(params: ToolParams): Promise<ToolResult> {
    const tagId = params.tag_id as string
    if (!tagId) {
      return {success: false, error: "tag_id is required"}
    }

    const updates: Partial<Tag> = {}
    if (params.name !== undefined) updates.name = params.name as string
    if (params.color !== undefined) updates.color = params.color as string

    const updated = await this.storage.updateTag(tagId, updates)

    if (!updated) {
      return {success: false, error: `Tag not found: ${tagId}`}
    }

    return {success: true, data: `Tag updated: ${this.formatTag(updated)}`}
  }

  private async deleteTag(params: ToolParams): Promise<ToolResult> {
    const tagId = params.tag_id as string
    if (!tagId) {
      return {success: false, error: "tag_id is required"}
    }

    const deleted = await this.storage.deleteTag(tagId)

    if (!deleted) {
      return {success: false, error: `Tag not found: ${tagId}`}
    }

    return {success: true, data: `Tag deleted: ${tagId}`}
  }
}
