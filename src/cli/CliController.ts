import fs from "node:fs"
import {DateTime} from "luxon"

import {TAG_QUICK_COLORS} from "@shared/constants/tagColorPalette"
import {CliError} from "@shared/errors/cli/CliError"
import {CliErrorCode} from "@shared/errors/cli/CliErrorCode"

import type {StorageCore} from "@/storage/createStorageCore"
import type {AppPaths} from "@shared/config/paths"
import type {TaskSearchResult} from "@shared/types/search"
import type {Branch, Day, Tag, Task, TaskStatus} from "@shared/types/storage"

type CliScope = {project?: string; all?: boolean}

/** Thin CLI facade over a StorageCore. No renderer broadcasts, no incremental index maintenance. */
export class CliController {
  private searchIndexReady = false

  constructor(
    private core: StorageCore,
    private paths: AppPaths,
  ) {}

  async today(): Promise<Day | null> {
    const branchId = await this.core.branchesService.getActiveBranchId()
    const date = DateTime.now().toISODate()!
    return this.core.daysService.getDay(date, {branchId})
  }

  async getTaskExact(id: string): Promise<Task> {
    const task = await this.core.tasksService.getTask(id)
    if (!task) throw new CliError(CliErrorCode.TASK_NOT_FOUND, `Task not found: ${id}`)
    return task
  }

  async getTask(idOrPrefix: string, opts: CliScope): Promise<Task> {
    const id = await this.resolveTaskId(idOrPrefix, opts)
    return this.getTaskExact(id)
  }

  async listTasks(opts: CliScope & {date?: string}): Promise<Task[]> {
    const branchId = await this.resolveScopeBranchId(opts)
    const date = opts.date ?? DateTime.now().toISODate()!
    const range = {from: date, to: date}
    return this.core.tasksService.getTaskList({...range, branchId})
  }

  async listTags(): Promise<Tag[]> {
    return this.core.tagsService.getTagList()
  }

  async listProjects(): Promise<Branch[]> {
    return this.core.branchesService.getBranchList()
  }

  async searchTasks(query: string): Promise<TaskSearchResult[]> {
    await this.ensureSearchIndex()
    return this.core.searchService.searchTasks(query)
  }

  async resolveTagIds(inputs: string[]): Promise<string[]> {
    const existing = await this.core.tagsService.getTagList()
    const byId = new Map(existing.map((t) => [t.id, t]))
    const byName = new Map(existing.map((t) => [t.name, t]))

    const ids: string[] = []
    for (const input of inputs) {
      const found = byId.get(input) ?? byName.get(input)
      if (found) {
        ids.push(found.id)
        continue
      }
      const color = TAG_QUICK_COLORS[Math.floor(Math.random() * TAG_QUICK_COLORS.length)]
      const created = await this.core.tagsService.createTag({name: input, color, deletedAt: null})
      if (created) {
        ids.push(created.id)
        byName.set(created.name, created)
      }
    }
    return ids
  }

  async resolveTaskId(idOrPrefix: string, opts: CliScope): Promise<string> {
    const exact = await this.core.tasksService.getTask(idOrPrefix)
    if (exact && !exact.deletedAt) return exact.id

    const branchId = await this.resolveScopeBranchId(opts)
    return this.pickTask(await this.core.tasksService.getTaskList({branchId}), idOrPrefix).id
  }

  async addTask(input: {content: string; date?: string; time?: string; tags?: string[]; project?: string; estimateMinutes?: number}): Promise<Task> {
    const branchId = await this.resolveScopeBranchId({project: input.project})
    const tagIds = await this.resolveTagIds(input.tags ?? [])
    const tags = (await this.core.tagsService.getTagList()).filter((t) => tagIds.includes(t.id))
    const now = DateTime.now()

    const task: Task = {
      id: "",
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      branchId: branchId ?? (await this.core.branchesService.getActiveBranchId()),
      scheduled: {
        date: input.date ?? now.toISODate()!,
        time: input.time ?? now.toFormat("HH:mm:ss"),
        timezone: now.zoneName ?? "UTC",
      },
      estimatedTime: (input.estimateMinutes ?? 0) * 60,
      spentTime: 0,
      content: input.content,
      minimized: false,
      orderIndex: 0,
      status: "active",
      tags,
      attachments: [],
    }

    const created = await this.core.tasksService.createTask(task)
    if (!created) throw new CliError(CliErrorCode.REFUSED, "Failed to create task")
    this.signalMutation()
    return created
  }

  async setStatus(idOrPrefix: string, status: TaskStatus, opts: CliScope): Promise<Task> {
    const id = await this.resolveTaskId(idOrPrefix, opts)
    const updated = await this.core.tasksService.updateTask(id, {status})
    if (!updated) throw new CliError(CliErrorCode.TASK_NOT_FOUND, `Task not found: ${idOrPrefix}`)
    this.signalMutation()
    return updated
  }

  async resolveScopeBranchId(opts: CliScope): Promise<string | undefined> {
    if (opts.all) return undefined
    if (!opts.project) return this.core.branchesService.getActiveBranchId()

    const byId = await this.core.branchesService.getBranch(opts.project)
    if (byId) return byId.id

    const branches = await this.core.branchesService.getBranchList()
    const byName = branches.find((b) => b.name === opts.project)
    if (byName) return byName.id

    throw new CliError(CliErrorCode.PROJECT_NOT_FOUND, `Project not found: ${opts.project}`)
  }

  async logTime(idOrPrefix: string, minutes: number, opts: CliScope): Promise<Task> {
    const current = await this.getResolved(idOrPrefix, opts)
    const updated = await this.core.tasksService.updateTask(current.id, {spentTime: current.spentTime + minutes * 60})
    return this.afterWrite(updated, idOrPrefix)
  }

  async moveTask(idOrPrefix: string, to: {date: string; time?: string}, opts: CliScope): Promise<Task> {
    const current = await this.getResolved(idOrPrefix, opts)
    const updated = await this.core.tasksService.updateTask(current.id, {
      scheduled: {date: to.date, time: to.time ?? current.scheduled.time, timezone: current.scheduled.timezone},
    })
    return this.afterWrite(updated, idOrPrefix)
  }

  async updateTaskFields(
    idOrPrefix: string,
    fields: {content?: string; date?: string; time?: string; estimateMinutes?: number},
    opts: CliScope,
  ): Promise<Task> {
    const current = await this.getResolved(idOrPrefix, opts)
    const patch: Record<string, unknown> = {}
    if (fields.content !== undefined) patch.content = fields.content
    if (fields.estimateMinutes !== undefined) patch.estimatedTime = fields.estimateMinutes * 60
    if (fields.date !== undefined || fields.time !== undefined) {
      patch.scheduled = {
        date: fields.date ?? current.scheduled.date,
        time: fields.time ?? current.scheduled.time,
        timezone: current.scheduled.timezone,
      }
    }
    const updated = await this.core.tasksService.updateTask(current.id, patch)
    return this.afterWrite(updated, idOrPrefix)
  }

  async deleteTask(idOrPrefix: string, opts: CliScope): Promise<Task> {
    const current = await this.getResolved(idOrPrefix, opts)
    const deleted = await this.core.tasksService.deleteTask(current.id)
    if (!deleted) throw new CliError(CliErrorCode.REFUSED, `Failed to delete task: ${idOrPrefix}`)
    this.signalMutation()

    const trashed = (await this.core.tasksService.getDeletedTasks()).find((t) => t.id === current.id)
    return trashed ?? current
  }

  async restoreTask(idOrPrefix: string, opts: CliScope): Promise<Task> {
    const trashed = await this.getResolvedDeleted(idOrPrefix, opts)
    const restored = await this.core.tasksService.restoreTask(trashed.id)
    if (!restored) throw new CliError(CliErrorCode.TASK_NOT_FOUND, `Task not found in trash: ${idOrPrefix}`)
    this.signalMutation()
    return restored
  }

  async purgeTask(idOrPrefix: string, opts: CliScope): Promise<Task> {
    const task = await this.getResolvedAny(idOrPrefix, opts)
    const purged = await this.core.tasksService.permanentlyDeleteTask(task.id)
    if (!purged) throw new CliError(CliErrorCode.REFUSED, `Failed to permanently delete task: ${idOrPrefix}`)
    this.signalMutation()
    return task
  }

  async listDeletedTasks(opts: CliScope): Promise<Task[]> {
    const branchId = await this.resolveScopeBranchId(opts)
    return this.core.tasksService.getDeletedTasks({branchId})
  }

  async purgeDeletedTasks(opts: CliScope): Promise<number> {
    const branchId = await this.resolveScopeBranchId(opts)
    const count = await this.core.tasksService.permanentlyDeleteAllDeletedTasks({branchId})
    if (count > 0) this.signalMutation()
    return count
  }

  private async getResolved(idOrPrefix: string, opts: CliScope): Promise<Task> {
    const id = await this.resolveTaskId(idOrPrefix, opts)
    const task = await this.core.tasksService.getTask(id)
    if (!task) throw new CliError(CliErrorCode.TASK_NOT_FOUND, `Task not found: ${idOrPrefix}`)
    return task
  }

  private async getResolvedDeleted(idOrPrefix: string, opts: CliScope): Promise<Task> {
    const trash = await this.core.tasksService.getDeletedTasks()
    const exact = trash.find((t) => t.id === idOrPrefix)
    if (exact) return exact

    const branchId = await this.resolveScopeBranchId(opts)
    return this.pickTask(branchId ? await this.core.tasksService.getDeletedTasks({branchId}) : trash, idOrPrefix)
  }

  private async getResolvedAny(idOrPrefix: string, opts: CliScope): Promise<Task> {
    const exactLive = await this.core.tasksService.getTask(idOrPrefix)
    if (exactLive) return exactLive

    const exactTrashed = (await this.core.tasksService.getDeletedTasks()).find((t) => t.id === idOrPrefix)
    if (exactTrashed) return exactTrashed

    const branchId = await this.resolveScopeBranchId(opts)
    const live = await this.core.tasksService.getTaskList({branchId})
    const trashed = await this.core.tasksService.getDeletedTasks({branchId})
    return this.pickTask([...live, ...trashed], idOrPrefix)
  }

  private pickTask(tasks: Task[], idOrPrefix: string): Task {
    const exact = tasks.find((t) => t.id === idOrPrefix)
    if (exact) return exact

    const candidates = tasks.filter((t) => t.id.startsWith(idOrPrefix))
    if (candidates.length === 1) return candidates[0]
    if (candidates.length === 0) throw new CliError(CliErrorCode.TASK_NOT_FOUND, `Task not found: ${idOrPrefix}`)
    throw new CliError(CliErrorCode.AMBIGUOUS_ID, `Ambiguous id "${idOrPrefix}" matches: ${candidates.map((t) => t.id).join(", ")}`)
  }

  private afterWrite(updated: Task | null, idOrPrefix: string): Task {
    if (!updated) throw new CliError(CliErrorCode.TASK_NOT_FOUND, `Task not found: ${idOrPrefix}`)
    this.signalMutation()
    return updated
  }

  private async ensureSearchIndex(): Promise<void> {
    if (this.searchIndexReady) return
    await this.core.searchService.initializeIndex()
    this.searchIndexReady = true
  }

  private signalMutation(): void {
    try {
      fs.writeFileSync(this.paths.mutationSignalPath(), String(Date.now()))
    } catch {
      // best-effort signal; a closed app has no watcher
    }
  }
}
