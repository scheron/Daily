import {MCP_CONFIG} from "@/config"

import type {Tag, Task} from "@shared/types/storage"

export async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${MCP_CONFIG.apiUrl}${path}`, {
    method,
    headers: {"Content-Type": "application/json"},
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`)
  }

  return response.json()
}

export async function checkDailyRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${MCP_CONFIG.apiUrl}/api/health`)
    return response.ok
  } catch {
    return false
  }
}

export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0]
}

export function formatTask(task: Task, index?: number): string {
  const statusEmoji = task.status === "done" ? "✅" : task.status === "discarded" ? "❌" : "⬜"
  const time = task.scheduled.time || "no time"
  const tags = task.tags.length > 0 ? ` [${task.tags.map((t) => t.name).join(", ")}]` : ""
  const prefix = index !== undefined ? `${index + 1}. ` : ""

  return `${prefix}${statusEmoji} [${time}] ${task.content}${tags}`
}

export function formatTag(tag: Tag, index: number): string {
  return `${index + 1}. 🏷️ ${tag.name} (${tag.id})`
}
