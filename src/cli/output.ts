import {CliError} from "@shared/errors/cli/CliError"

import type {Branch, Tag, Task} from "@shared/types/storage"

const PAD_STATUS = 10

export function formatTaskList(tasks: Task[]): string {
  if (!tasks.length) return "(no tasks)"
  return tasks
    .map((t) => {
      const time = t.scheduled.time ? t.scheduled.time.slice(0, 5) : "--:--"
      const status = t.status.padEnd(PAD_STATUS)
      const content = t.content.split("\n")[0].slice(0, 60).padEnd(60)
      return `${time}  ${status} ${content} ${t.id}`
    })
    .join("\n")
}

export function formatTags(tags: Tag[]): string {
  return tags.length ? tags.map((t) => `${t.color}  ${t.name}  ${t.id}`).join("\n") : "(no tags)"
}

export function formatProjects(branches: Branch[]): string {
  return branches.length ? branches.map((b) => `${b.name}  ${b.id}`).join("\n") : "(no projects)"
}

export function renderJsonOk(data: unknown): string {
  return JSON.stringify({ok: true, data})
}

export function renderJsonError(code: string, message: string): string {
  return JSON.stringify({ok: false, error: {code, message}})
}

export function exitCodeFor(err: unknown): number {
  return err instanceof CliError ? err.exitCode : 1
}
