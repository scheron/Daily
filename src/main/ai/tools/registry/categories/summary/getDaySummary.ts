import {formatDuration, getTodayDate} from "../../helpers"

import type {Day} from "@shared/types/storage"
import type {RegisteredTool} from "../../types"

export const getDaySummary: RegisteredTool = {
  name: "get_day_summary",
  description:
    "Get a summary overview of a day: task counts, completion progress, time estimates and spent, tags used. Use when user asks 'how's my day?', 'what's my progress?', 'day overview', 'how am I doing today?'.",
  parameters: {
    type: "object",
    properties: {
      date: {type: "string", description: "Date in YYYY-MM-DD format. Defaults to today."},
      project_id: {type: "string", description: "Optional project ID to summarize a specific project."},
    },
  },
  isWrite: false,
  isDestructive: false,
  async execute(params, ctx) {
    const date = (params.date as string) || getTodayDate()
    const projectId = params.project_id as string | undefined
    let branchId: string | undefined

    if (projectId) {
      const branch = await ctx.storage.getBranch(projectId)
      if (!branch) {
        return {success: false, error: `Project not found: ${projectId}`}
      }
      branchId = branch.id
    }

    const days = await ctx.storage.getDays({from: date, to: date, branchId})
    const day: Day | null = days[0] ?? null

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
      lines.push(`Time — estimated: ${formatDuration(totalEstimated)}, spent: ${formatDuration(totalSpent)}`)
      if (totalEstimated > 0 && totalSpent > 0) {
        const timePct = Math.round((totalSpent / totalEstimated) * 100)
        lines.push(`Time usage: ${timePct}% of estimated`)
      }
    }

    if (day.tags.length > 0) {
      lines.push(`Tags: ${day.tags.map((t) => t.name).join(", ")}`)
    }

    return {success: true, data: lines.join("\n")}
  },
}
