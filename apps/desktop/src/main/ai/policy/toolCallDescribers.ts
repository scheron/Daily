import {isString} from "@daily/std"

import {getHostname} from "@shared/utils/web/getHostname"

import type {StorageController} from "@daily/core"
import type {ToolCallDescription} from "./types"

type ToolCallDescriber = (params: Record<string, unknown>, storage: StorageController) => Promise<ToolCallDescription>

/**
 * Per-tool describers that turn a destructive tool call's params into a
 * human-readable confirmation card (title, summary, optional details).
 * Keyed by tool name; tools without an entry fall back to the generic
 * message in `describeToolCall`.
 */
export const TOOL_CALL_DESCRIBERS: Record<string, ToolCallDescriber> = {
  delete_task: async (p, storage) => {
    const id = str(p.id)
    const label = await safeLabel(async () => {
      const task = await storage.getTask(id)
      if (!task) return null
      const line = firstLineOf(task.content)
      return line || null
    }, id)
    return {
      title: "Move task to trash",
      summary: `Move "${label}" to trash. It can be restored later from Settings → Recently Deleted.`,
      details: [`Task ID: ${id}`],
    }
  },
  delete_project: async (p, storage) => {
    const id = str(p.id)
    const label = await safeLabel(async () => (await storage.getBranch(id))?.name ?? null, id)
    return {
      title: "Move project to trash",
      summary: `Move project "${label}" (and all of its tasks) to trash. Tasks remain restorable.`,
      details: [`Project ID: ${id}`],
    }
  },
  delete_milestone: async (p, storage) => {
    const id = str(p.id)
    const label = await safeLabel(async () => (await storage.getMilestone(id))?.name ?? null, id)
    return {
      title: "Delete milestone",
      summary: `Delete milestone "${label}". It is cleared from the tasks that carried it.`,
      details: [`Milestone ID: ${id}`],
    }
  },
  delete_tag: async (p, storage) => {
    const id = str(p.id)
    const label = await safeLabel(async () => (await storage.getTag(id))?.name ?? null, id)
    return {
      title: "Delete tag",
      summary: `Delete tag "${label}". The tag is removed from all tasks that currently use it.`,
      details: [`Tag ID: ${id}`],
    }
  },
  delete_comment: async (p) => ({
    title: "Delete comment",
    summary: `Delete comment ${str(p.id)}. It is removed from the task it was written on.`,
    details: [`Comment ID: ${str(p.id)}`],
  }),
  delete_attachment: async (p, storage) => {
    const id = str(p.id)
    const label = await safeLabel(async () => (await storage.getFiles([id]))[0]?.name ?? null, id)
    return {
      title: "Delete attachment",
      summary: `Delete "${label}". Its bytes stay until garbage collection, but it stops being usable.`,
      details: [`File ID: ${id}`],
    }
  },
  read_url: async (p) => ({
    title: "Open a web page",
    summary: `Read ${getHostname(str(p.url))}`,
    details: [`URL: ${str(p.url)}`],
  }),
}

function firstLineOf(content: string): string {
  const trimmed = (content.split("\n")[0] ?? "").trim()
  if (/^#+$/.test(trimmed)) return ""

  const firstLine = trimmed.replace(/^#+\s+/, "")
  return firstLine.length > 100 ? `${firstLine.slice(0, 100)}…` : firstLine
}

async function safeLabel(lookup: () => Promise<string | null>, fallbackId: string): Promise<string> {
  try {
    return (await lookup()) ?? fallbackId
  } catch {
    return fallbackId
  }
}

function str(value: unknown): string {
  return isString(value) && value ? value : "(unspecified)"
}
