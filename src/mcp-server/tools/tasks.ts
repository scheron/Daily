import {z} from "zod"

import {apiRequest, checkDailyRunning, formatTask, getTodayDate} from "@/api"
import {dailyNotRunningError, errorResult, textResult} from "@/utils"

import type {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import type {Task} from "@shared/types/storage"

export function registerTaskTools(server: McpServer): void {
  server.tool(
    "list_tasks",
    "Get tasks from Daily app. By default returns today's tasks.",
    {
      date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today."),
      include_done: z.boolean().optional().describe("Include completed tasks. Defaults to true."),
    },
    async ({date, include_done = true}) => {
      try {
        if (!(await checkDailyRunning())) {
          return dailyNotRunningError()
        }

        const targetDate = date || getTodayDate()
        const params = new URLSearchParams({date: targetDate})

        if (!include_done) {
          params.set("include_done", "false")
        }

        const tasks = await apiRequest<Task[]>("GET", `/api/tasks?${params}`)

        tasks.sort((a, b) => a.scheduled.time.localeCompare(b.scheduled.time))

        if (tasks.length === 0) {
          return textResult(`No tasks found for ${targetDate}`)
        }

        const taskList = tasks.map((t, i) => `${formatTask(t, i)}\n   ID: ${t.id}`).join("\n\n")

        return textResult(`Tasks for ${targetDate} (${tasks.length} total):\n\n${taskList}`)
      } catch (error) {
        return errorResult(`Error: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  )

  server.tool(
    "create_task",
    "Create a new task in Daily app.",
    {
      content: z.string().describe("Task content/description"),
      date: z.string().optional().describe("Scheduled date in YYYY-MM-DD format. Defaults to today."),
      time: z.string().optional().describe("Scheduled time in HH:MM format (24h). Optional."),
    },
    async ({content, date, time}) => {
      try {
        if (!(await checkDailyRunning())) {
          return dailyNotRunningError()
        }

        const task = await apiRequest<Task>("POST", "/api/tasks", {
          content,
          date: date || getTodayDate(),
          time: time || "",
        })

        return textResult(`✅ Task created:\n${formatTask(task)}`)
      } catch (error) {
        return errorResult(`Error creating task: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  )

  server.tool(
    "complete_task",
    "Mark a task as completed.",
    {
      task_id: z.string().describe("Task ID to complete"),
    },
    async ({task_id}) => {
      try {
        if (!(await checkDailyRunning())) {
          return dailyNotRunningError()
        }

        const task = await apiRequest<Task>("POST", `/api/tasks/${encodeURIComponent(task_id)}/complete`)

        return textResult(`✅ Task completed:\n${formatTask(task)}`)
      } catch (error) {
        return errorResult(`Error completing task: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  )

  server.tool(
    "update_task",
    "Update an existing task's content, date, time, or status.",
    {
      task_id: z.string().describe("Task ID to update"),
      content: z.string().optional().describe("New task content"),
      date: z.string().optional().describe("New scheduled date (YYYY-MM-DD)"),
      time: z.string().optional().describe("New scheduled time (HH:MM)"),
      status: z.enum(["active", "done", "discarded"]).optional().describe("New status"),
    },
    async ({task_id, content, date, time, status}) => {
      try {
        if (!(await checkDailyRunning())) {
          return dailyNotRunningError()
        }

        const updates: Record<string, unknown> = {}

        if (content !== undefined) updates.content = content
        if (status !== undefined) updates.status = status

        if (date !== undefined || time !== undefined) {
          updates.scheduled = {}
          if (date !== undefined) (updates.scheduled as Record<string, string>).date = date
          if (time !== undefined) (updates.scheduled as Record<string, string>).time = time
        }

        const task = await apiRequest<Task>("PATCH", `/api/tasks/${encodeURIComponent(task_id)}`, updates)

        return textResult(`✅ Task updated:\n${formatTask(task)}`)
      } catch (error) {
        return errorResult(`Error updating task: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  )

  server.tool(
    "delete_task",
    "Delete a task (soft delete - can be restored in Daily app).",
    {
      task_id: z.string().describe("Task ID to delete"),
    },
    async ({task_id}) => {
      try {
        if (!(await checkDailyRunning())) {
          return dailyNotRunningError()
        }

        await apiRequest<{success: boolean}>("DELETE", `/api/tasks/${encodeURIComponent(task_id)}`)

        return textResult(`🗑️ Task deleted: ${task_id}`)
      } catch (error) {
        return errorResult(`Error deleting task: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  )
}
