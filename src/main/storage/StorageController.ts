/*
Storage Architecture (SQLite):

~/Library/Application Support/Daily/
├── db/
│   └── daily.sqlite (SQLite database)
└── assets/ (binary file assets)
*/

import fs from "fs-extra"

import {SYNC_CONFIG} from "@shared/config/sync"
import {logger} from "@/utils/logger"

import {electronPaths} from "@/runtime/electronPaths"
import {createStorageCore} from "@/storage/createStorageCore"
import {initDatabase} from "@/storage/database/instance"
import {ICloudRemoteAdapter} from "@/storage/sync/adapters/ICloudRemoteAdapter"
import {SshRemoteAdapter} from "@/storage/sync/adapters/SshRemoteAdapter"
import {SyncEngine} from "@/storage/sync/SyncEngine"

import type {AgentTurn} from "@/ai/turns/types"
import type {StorageCore} from "@/storage/createStorageCore"
import type {SessionMeta} from "@/storage/models/AISessionModel"
import type {IStorageController} from "@/types/storage"
import type {SyncRemote} from "@/types/sync"
import type {ISODate} from "@shared/types/common"
import type {TaskSearchResult} from "@shared/types/search"
import type {StatsAggregate, StatsPeriod} from "@shared/types/stats"
import type {Branch, Day, File, MoveTaskByOrderParams, Settings, SyncRemoteState, SyncStatus, Tag, Task, TaskEvent} from "@shared/types/storage"
import type {PartialDeep} from "type-fest"

export class StorageController implements IStorageController {
  rootDir: string = electronPaths.appDataRoot()

  private settingsService!: StorageCore["settingsService"]
  private branchesService!: StorageCore["branchesService"]
  private tasksService!: StorageCore["tasksService"]
  private tagsService!: StorageCore["tagsService"]
  private filesService!: StorageCore["filesService"]
  private daysService!: StorageCore["daysService"]
  private statsService!: StorageCore["statsService"]
  private searchService!: StorageCore["searchService"]
  private syncEngine!: SyncEngine
  private localAdapter!: StorageCore["localAdapter"]
  private aiSessionModel!: StorageCore["aiSessionModel"]

  private notifyStorageStatusChange?: (status: SyncStatus, prevStatus: SyncStatus) => void
  private notifyStorageDataChange?: () => void
  private notifySettingsChange?: () => void

  async init(): Promise<void> {
    await fs.ensureDir(this.rootDir)
    await fs.ensureDir(electronPaths.assetsDir())

    const db = initDatabase(electronPaths.dbPath())
    const core = createStorageCore(db, electronPaths)

    this.settingsService = core.settingsService
    this.branchesService = core.branchesService
    this.tasksService = core.tasksService
    this.tagsService = core.tagsService
    this.filesService = core.filesService
    this.daysService = core.daysService
    this.statsService = core.statsService
    this.searchService = core.searchService
    this.localAdapter = core.localAdapter
    this.aiSessionModel = core.aiSessionModel

    const settings = await this.loadSettings()

    this.syncEngine = new SyncEngine(this.localAdapter, this.buildRemotes(settings), {
      assetsDir: () => electronPaths.assetsDir(),
      onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => this.notifyStorageStatusChange?.(status, prevStatus),
      onDataChanged: () => {
        this.notifyStorageDataChange?.()
      },
    })

    if (settings.sync.enabled) {
      logger.info(logger.CONTEXT.STORAGE, "Auto-sync was enabled, restoring")
      this.syncEngine.enableAutoSync()
    }

    logger.info(logger.CONTEXT.STORAGE, "Initializing search index")
    await this.searchService.initializeIndex()
    logger.info(logger.CONTEXT.STORAGE, `Search index initialized with ${this.searchService.getIndexSize()} tasks`)
  }

  //#region STORAGE
  setupStorageBroadcasts(callbacks: {
    onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => void
    onDataChange: () => void
    onSettingsChange: () => void
  }) {
    this.notifyStorageStatusChange = callbacks.onStatusChange
    this.notifyStorageDataChange = callbacks.onDataChange
    this.notifySettingsChange = callbacks.onSettingsChange
  }

  async activateSync() {
    logger.info(logger.CONTEXT.STORAGE, "Activating sync")
    const settings = await this.loadSettings()
    await this.saveSettings({sync: {...settings.sync, enabled: true}})
    this.syncEngine.enableAutoSync()
  }

  async deactivateSync() {
    logger.info(logger.CONTEXT.STORAGE, "Deactivating sync")
    const settings = await this.loadSettings()
    await this.saveSettings({sync: {...settings.sync, enabled: false}})
    this.syncEngine.disableAutoSync()
  }

  async forceSync() {
    logger.info(logger.CONTEXT.STORAGE, "Force syncing")
    await this.syncEngine.sync("pull")
  }

  getSyncStatus(): SyncStatus {
    return this.syncEngine.syncStatus
  }

  getSyncRemoteStates(): SyncRemoteState[] {
    return this.syncEngine.getRemoteStates()
  }

  /** Reacts to a mutation made by an external process (e.g. the CLI): rebuilds the search index and refreshes the renderer. */
  async handleExternalDataChange(): Promise<void> {
    await this.searchService.rebuildIndex()
    this.notifyStorageDataChange?.()
  }
  //#endregion

  //#region SETTINGS
  async loadSettings(): Promise<Settings> {
    return this.settingsService.loadSettings()
  }

  async saveSettings(newSettings: Partial<Settings>): Promise<void> {
    await this.settingsService.saveSettings(newSettings)
    if (newSettings.sync) {
      const settings = await this.loadSettings()
      this.syncEngine.setRemotes(this.buildRemotes(settings))
    }
    this.notifySettingsChange?.()
  }
  //#endregion

  //#region DAYS
  async getDays(params: {from?: ISODate; to?: ISODate; branchId?: Branch["id"]} = {}): Promise<Day[]> {
    const branchId = await this.branchesService.resolveBranchId(params.branchId)
    return this.daysService.getDays({...params, branchId})
  }

  async getDay(date: ISODate): Promise<Day | null> {
    const branchId = await this.branchesService.getActiveBranchId()
    return this.daysService.getDay(date, {branchId})
  }
  //#endregion

  //#region ACTIVITY
  async getActivityByDay(date: ISODate, branchId?: Branch["id"]): Promise<TaskEvent[]> {
    const resolvedBranchId = await this.branchesService.resolveBranchId(branchId)
    return this.tasksService.getActivityByDay(date, resolvedBranchId)
  }

  async getTaskHistory(taskId: Task["id"]): Promise<TaskEvent[]> {
    return this.tasksService.getHistoryByTask(taskId)
  }
  //#endregion

  //#region STATS
  async getStats(period: StatsPeriod, anchor: ISODate, branchId?: Branch["id"]): Promise<StatsAggregate> {
    const resolvedBranchId = await this.branchesService.resolveBranchId(branchId)
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return this.statsService.getStats(period, anchor, resolvedBranchId, timezone)
  }
  //#endregion

  //#region TASKS
  async getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    const branchId = await this.branchesService.resolveBranchId(params?.branchId)
    return this.tasksService.getTaskList({...params, branchId})
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    return this.tasksService.getTask(id)
  }

  async updateTask(id: Task["id"], updates: PartialDeep<Task>): Promise<Task | null> {
    const updatedTask = await this.tasksService.updateTask(id, updates)
    if (updatedTask) {
      await this.searchService.updateTaskInIndex(updatedTask)
      this.notifyStorageDataChange?.()
    }
    return updatedTask
  }

  async toggleTaskMinimized(id: Task["id"], minimized: boolean): Promise<Task | null> {
    return this.updateTask(id, {minimized})
  }

  async moveTaskByOrder(params: MoveTaskByOrderParams): Promise<Task | null> {
    const updatedTask = await this.tasksService.moveTaskByOrder(params)
    if (updatedTask) {
      await this.searchService.updateTaskInIndex(updatedTask)
      this.notifyStorageDataChange?.()
    }
    return updatedTask
  }

  async moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<boolean> {
    try {
      const branch = await this.branchesService.getBranch(branchId)
      if (!branch) return false

      const isMoved = await this.tasksService.moveTaskToBranch(taskId, branch.id)
      if (!isMoved) return false

      const updatedTask = await this.tasksService.getTask(taskId)
      if (updatedTask) {
        await this.searchService.updateTaskInIndex(updatedTask)
      }

      this.notifyStorageDataChange?.()
      return true
    } catch (error) {
      logger.error(logger.CONTEXT.TASKS, `Failed to move task ${taskId} to branch ${branchId}`, error)
      return false
    }
  }

  async createTask(task: Task): Promise<Task | null> {
    const branchId = await this.branchesService.resolveBranchId(task?.branchId)
    const createdTask = await this.tasksService.createTask({...task, branchId})
    if (createdTask) {
      await this.searchService.addTaskToIndex(createdTask)
      this.notifyStorageDataChange?.()
    }
    return createdTask
  }

  async deleteTask(id: Task["id"]): Promise<boolean> {
    const deleted = await this.tasksService.deleteTask(id)
    if (deleted) {
      this.searchService.removeTaskFromIndex(id)
      this.notifyStorageDataChange?.()
    }

    return deleted
  }

  async addTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null> {
    const addedTask = await this.tasksService.addTaskAttachment(taskId, fileId)
    if (addedTask) {
      this.notifyStorageDataChange?.()
    }
    return addedTask
  }

  async removeTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null> {
    const removedTask = await this.tasksService.removeTaskAttachment(taskId, fileId)
    if (removedTask) {
      this.notifyStorageDataChange?.()
    }
    return removedTask
  }

  async getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    const branchId = await this.branchesService.resolveBranchId(params?.branchId)
    return this.tasksService.getDeletedTasks({...params, branchId})
  }

  async restoreTask(id: Task["id"]): Promise<Task | null> {
    const restoredTask = await this.tasksService.restoreTask(id)
    if (restoredTask) {
      await this.searchService.updateTaskInIndex(restoredTask)
      this.notifyStorageDataChange?.()
    }
    return restoredTask
  }

  async permanentlyDeleteTask(id: Task["id"]): Promise<boolean> {
    const deleted = await this.tasksService.permanentlyDeleteTask(id)
    if (deleted) {
      this.searchService.removeTaskFromIndex(id)
      this.notifyStorageDataChange?.()
    }
    return deleted
  }

  async permanentlyDeleteAllDeletedTasks(): Promise<number> {
    const branchId = await this.branchesService.getActiveBranchId()
    const deletedTasks = await this.tasksService.getDeletedTasks({branchId})
    if (!deletedTasks.length) return 0

    const count = await this.tasksService.permanentlyDeleteAllDeletedTasks({branchId})

    for (const task of deletedTasks) {
      this.searchService.removeTaskFromIndex(task.id)
    }

    this.notifyStorageDataChange?.()
    return count
  }
  //#endregion

  //#region BRANCHES
  async getBranchList(): Promise<Branch[]> {
    return this.branchesService.getBranchList()
  }

  async getBranch(id: Branch["id"]): Promise<Branch | null> {
    return this.branchesService.getBranch(id)
  }

  async createBranch(branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Branch | null> {
    const createdBranch = await this.branchesService.createBranch(branch)
    if (createdBranch) {
      this.notifyStorageDataChange?.()
    }
    return createdBranch
  }

  async updateBranch(id: Branch["id"], updates: Pick<Branch, "name">): Promise<Branch | null> {
    const updatedBranch = await this.branchesService.updateBranch(id, updates)
    if (updatedBranch) {
      this.notifyStorageDataChange?.()
    }
    return updatedBranch
  }

  async deleteBranch(id: Branch["id"]): Promise<boolean> {
    const deleted = await this.branchesService.deleteBranch(id)
    if (deleted) {
      this.notifyStorageDataChange?.()
    }
    return deleted
  }

  async setActiveBranch(id: Branch["id"]): Promise<void> {
    await this.branchesService.setActiveBranch(id)
    this.notifyStorageDataChange?.()
  }
  //#endregion

  //#region TAGS
  async getTagList(): Promise<Tag[]> {
    return this.tagsService.getTagList()
  }

  async getTag(id: Tag["id"]): Promise<Tag | null> {
    return this.tagsService.getTag(id)
  }

  async updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Tag | null> {
    const updatedTag = await this.tagsService.updateTag(id, updates)
    if (updatedTag) {
      this.notifyStorageDataChange?.()
    }
    return updatedTag
  }

  async createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Promise<Tag | null> {
    const createdTag = await this.tagsService.createTag(tag)
    if (createdTag) {
      this.notifyStorageDataChange?.()
    }
    return createdTag
  }

  async deleteTag(id: Tag["id"]): Promise<boolean> {
    const deleted = await this.tagsService.deleteTag(id)
    if (deleted) {
      this.notifyStorageDataChange?.()
    }
    return deleted
  }

  async addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    const updatedTask = await this.tasksService.addTaskTags(taskId, tagIds)
    if (updatedTask) {
      await this.searchService.updateTaskInIndex(updatedTask)
      this.notifyStorageDataChange?.()
    }
    return updatedTask
  }

  async removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    const updatedTask = await this.tasksService.removeTaskTags(taskId, tagIds)
    if (updatedTask) {
      await this.searchService.updateTaskInIndex(updatedTask)
      this.notifyStorageDataChange?.()
    }
    this.notifyStorageDataChange?.()
    return updatedTask
  }
  //#endregion

  //#region SEARCH
  async searchTasks(query: string): Promise<TaskSearchResult[]> {
    return await this.searchService.searchTasks(query)
  }
  //#endregion

  //#region FILES
  async saveFile(filename: string, data: Buffer): Promise<File["id"]> {
    return await this.filesService.saveFile(filename, data)
  }

  getFilePath(id: File["id"]): string {
    return this.filesService.getFilePath(id)
  }

  async deleteFile(fileId: File["id"]): Promise<boolean> {
    return await this.filesService.deleteFile(fileId)
  }

  async getFiles(fileIds: File["id"][]): Promise<File[]> {
    return this.filesService.getFiles(fileIds)
  }

  async createFileResponse(id: File["id"]): Promise<Response> {
    return this.filesService.createFileResponse(id)
  }

  async cleanupOrphanFiles(): Promise<void> {
    return this.filesService.cleanupOrphanFiles()
  }

  /**
   * Hard-delete soft-deleted records past the GC TTL, independent of sync.
   * The sync engine only purges during merges, so without iCloud the trash would
   * grow forever; this runs the same TTL-based purge once on startup.
   */
  async collectGarbage(): Promise<void> {
    const purged = await this.localAdapter.purgeExpiredDeleted(SYNC_CONFIG.garbageCollectionInterval)
    const total = purged.tasks + purged.tags + purged.branches + purged.files
    if (total > 0) logger.info(logger.CONTEXT.STORAGE, `Garbage collected ${total} expired soft-deleted records`, purged)
  }
  //#endregion

  //#region AI SESSIONS
  /**
   * Append a finished turn to the active session, creating the session lazily
   * on the first call after a fresh app start (or after `archiveActiveAiSession`).
   */
  async appendAiTurn(turn: AgentTurn, meta: SessionMeta = {}): Promise<void> {
    let session = this.aiSessionModel.getActiveSession()
    if (!session) session = this.aiSessionModel.createSession(meta)
    this.aiSessionModel.appendTurn(session.id, turn)
  }

  async archiveActiveAiSession(): Promise<boolean> {
    const active = this.aiSessionModel.getActiveSession()
    if (!active) return false
    return this.aiSessionModel.archiveSession(active.id)
  }

  /** Returns the last N turns of the active session, oldest first; empty when no session. */
  async getActiveAiSessionTurns(limit = 20): Promise<AgentTurn[]> {
    const active = this.aiSessionModel.getActiveSession()
    if (!active) return []
    return this.aiSessionModel.getSessionTurns(active.id, limit)
  }
  //#endregion

  private buildRemotes(settings: Settings): SyncRemote[] {
    const remotes: SyncRemote[] = [{id: "icloud", label: "iCloud", adapter: new ICloudRemoteAdapter(electronPaths.remoteSyncPath())}]

    const ssh = settings.sync.ssh
    if (ssh?.enabled && ssh.host && ssh.dir) {
      remotes.push({id: "ssh", label: `SSH (${ssh.host})`, adapter: new SshRemoteAdapter({host: ssh.host, dir: ssh.dir})})
    }

    return remotes
  }
}
