import {DateTime} from "luxon"

import {CliError} from "./errors/cli/CliError"

import type {Branch, Tag, Task} from "@daily/protocol"

const PAD_STATUS = 10
const PAD_LABEL = 9

export type TaskDetailFile = {id: string; path: string | null}
export type TaskDetail = {task: Task; projectName: string; files: TaskDetailFile[]}

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

export function formatTaskDetails(details: TaskDetail[]): string {
  if (!details.length) return "(no tasks)"
  return details.map(formatTaskDetail).join("\n\n")
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

function formatTaskDetail(detail: TaskDetail): string {
  const {task} = detail
  const lines = [
    headerLine("id", task.id),
    headerLine("status", task.status),
    headerLine("scheduled", formatScheduled(task.scheduled)),
    headerLine("project", detail.projectName),
    headerLine("tags", formatTagNames(task.tags)),
    headerLine("estimate", formatDuration(task.estimatedTime)),
    headerLine("spent", formatDuration(task.spentTime)),
    headerLine("created", formatTimestamp(task.createdAt)),
    headerLine("updated", formatTimestamp(task.updatedAt)),
  ]
  if (task.deletedAt !== null) lines.push(headerLine("deleted", formatTimestamp(task.deletedAt)))
  lines.push(formatFilesBlock(detail.files))
  if (task.attachments.length > 0) lines.push(headerLine("attached", task.attachments.join(", ")))

  const header = lines.join("\n")
  return task.content ? `${header}\n\n${task.content}` : header
}

function headerLine(label: string, value: string): string {
  return `${label.padEnd(PAD_LABEL)}  ${value}`
}

function formatScheduled(scheduled: Task["scheduled"]): string {
  const time = scheduled.time ? scheduled.time.slice(0, 5) : "--:--"
  const tail = scheduled.timezone ? `  ${scheduled.timezone}` : ""
  return `${scheduled.date} ${time}${tail}`
}

function formatTagNames(tags: Tag[]): string {
  return tags.length ? tags.map((t) => t.name).join(", ") : "—"
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—"
  const minutes = Math.round(seconds / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatTimestamp(iso: string): string {
  const dt = DateTime.fromISO(iso)
  return dt.isValid ? dt.toFormat("yyyy-MM-dd HH:mm") : iso
}

function formatFilesBlock(files: TaskDetailFile[]): string {
  if (!files.length) return headerLine("files", "—")
  return files.map((f, i) => headerLine(i === 0 ? "files" : "", `${f.id}  ${f.path ?? "(file not found)"}`)).join("\n")
}
