import {nanoid} from "nanoid"

import type {Task} from "@shared/types/storage"
import type {McpRoute} from "./types"

/**
 * Normalize task ID - strip "task:" prefix if present
 * API returns IDs without prefix, but accepts both formats for convenience
 */
function normalizeTaskId(id: string): string {
  return id.startsWith("task:") ? id.slice(5) : id
}

export const mcpRoutes: McpRoute[] = [
  // ─────────────────────────────────────────────────────────────────
  // Tasks
  // ─────────────────────────────────────────────────────────────────

  {
    method: "GET",
    pattern: /^\/api\/tasks$/,
    paramNames: [],
    handler: async ({storage, params}) => {
      const date = params.get("date") || undefined
      const includeDone = params.get("include_done") !== "false"

      let tasks = await storage.getTaskList(date ? {from: date, to: date} : undefined)

      if (!includeDone) {
        tasks = tasks.filter((t) => t.status !== "done")
      }

      return {status: 200, data: tasks}
    },
  },

  {
    method: "POST",
    pattern: /^\/api\/tasks$/,
    paramNames: [],
    handler: async ({storage, body}) => {
      const input = body as {content: string; date?: string; time?: string; tagIds?: string[]}

      if (!input.content) {
        return {status: 400, data: {error: "Content is required"}}
      }

      const now = new Date().toISOString()
      const today = now.split("T")[0]

      const task: Task = {
        id: nanoid(),
        content: input.content,
        status: "active",
        scheduled: {
          date: input.date || today,
          time: input.time || "",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        tags: [],
        attachments: [],
        estimatedTime: 0,
        spentTime: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      const created = await storage.createTask(task)

      if (created && input.tagIds?.length) {
        await storage.addTaskTags(created.id, input.tagIds)
      }

      const result = created ? await storage.getTask(created.id) : null

      return {status: 201, data: result}
    },
  },

  {
    method: "GET",
    pattern: /^\/api\/tasks\/([^/]+)$/,
    paramNames: ["id"],
    handler: async ({storage, pathParams}) => {
      const id = normalizeTaskId(pathParams.id)
      const task = await storage.getTask(id)

      if (!task) {
        return {status: 404, data: {error: "Task not found"}}
      }

      return {status: 200, data: task}
    },
  },

  {
    method: "PATCH",
    pattern: /^\/api\/tasks\/([^/]+)$/,
    paramNames: ["id"],
    handler: async ({storage, pathParams, body}) => {
      const id = normalizeTaskId(pathParams.id)
      const updates = body as Partial<Task>
      const task = await storage.updateTask(id, updates)

      if (!task) {
        return {status: 404, data: {error: "Task not found"}}
      }

      return {status: 200, data: task}
    },
  },

  {
    method: "POST",
    pattern: /^\/api\/tasks\/([^/]+)\/complete$/,
    paramNames: ["id"],
    handler: async ({storage, pathParams}) => {
      const id = normalizeTaskId(pathParams.id)
      const task = await storage.updateTask(id, {status: "done"})

      if (!task) {
        return {status: 404, data: {error: "Task not found"}}
      }

      return {status: 200, data: task}
    },
  },

  {
    method: "DELETE",
    pattern: /^\/api\/tasks\/([^/]+)$/,
    paramNames: ["id"],
    handler: async ({storage, pathParams}) => {
      const id = normalizeTaskId(pathParams.id)
      const deleted = await storage.deleteTask(id)

      if (!deleted) {
        return {status: 404, data: {error: "Task not found"}}
      }

      return {status: 200, data: {success: true}}
    },
  },

  // ─────────────────────────────────────────────────────────────────
  // Tags
  // ─────────────────────────────────────────────────────────────────

  {
    method: "GET",
    pattern: /^\/api\/tags$/,
    paramNames: [],
    handler: async ({storage}) => {
      const tags = await storage.getTagList()
      return {status: 200, data: tags}
    },
  },

  // ─────────────────────────────────────────────────────────────────
  // Health
  // ─────────────────────────────────────────────────────────────────

  {
    method: "GET",
    pattern: /^\/api\/health$/,
    paramNames: [],
    handler: async () => {
      return {status: 200, data: {status: "ok", timestamp: new Date().toISOString()}}
    },
  },
]
