/*
Storage Architecture (SQLite):

~/Library/Application Support/Daily/
├── db/
│   └── daily.sqlite (SQLite database)
└── assets/ (binary file assets)
*/

import fs from "fs-extra"

import {SYNC_CONFIG} from "@daily/protocol"
import {deepMerge} from "@daily/std"

import {logger} from "../utils/logger"
import {assertSingleActiveProvider, buildSyncRemotes, resolveActiveProvider} from "../utils/sync/syncProvider"
import {EMPTY_CHANGESET} from "../types/storage"
import {createStorageCore} from "./createStorageCore"
import {initDatabase} from "./database/instance"
import {ProviderMigrationService} from "./sync/ProviderMigrationService"
import {ServerProviderService} from "./sync/server/ServerProviderService"
import {SyncEngine} from "./sync/SyncEngine"

import type {
  Branch,
  DeviceRole,
  File,
  ISODate,
  MigrationDirection,
  MigrationPreview,
  Milestone,
  MoveTaskByOrderParams,
  ProtocolMismatchView,
  Settings,
  SyncProvider,
  SyncRemote,
  SyncRemoteState,
  SyncStatus,
  Tag,
  Task,
  TaskEvent,
  TaskRelation,
  TaskRelationSets,
  TaskSearchResult,
} from "@daily/protocol"
import type {PartialDeep} from "type-fest"
import type {AppPaths} from "../config/paths"
import type {SqliteDriver} from "../database/SqliteDriver"
import type {Changeset, IStorageController} from "../types/storage"
import type {StorageCore} from "./createStorageCore"
import type {AgentTurn, SessionMeta} from "./models/AISessionModel"

export class StorageController implements IStorageController {
  rootDir: string

  private settingsService!: StorageCore["settingsService"]
  private branchesService!: StorageCore["branchesService"]
  private tasksService!: StorageCore["tasksService"]
  private taskRelationsService!: StorageCore["taskRelationsService"]
  private tagsService!: StorageCore["tagsService"]
  private milestonesService!: StorageCore["milestonesService"]
  private filesService!: StorageCore["filesService"]
  private searchService!: StorageCore["searchService"]
  private syncEngine!: SyncEngine
  private serverProvider!: ServerProviderService
  private providerMigration!: ProviderMigrationService
  private localAdapter!: StorageCore["localAdapter"]
  private aiSessionModel!: StorageCore["aiSessionModel"]

  private notifyStorageStatusChange?: (status: SyncStatus, prevStatus: SyncStatus) => void
  private notifyStorageDataChange?: (changeset: Changeset) => void
  private notifySettingsChange?: () => void
  private notifyApprovalRequested?: () => void
  private notifyRevoked?: () => void
  private notifyProtocolMismatchChanged?: (mismatch: ProtocolMismatchView | null) => void
  private notifyRoleChanged?: (role: DeviceRole) => void

  constructor(
    private db: SqliteDriver,
    private paths: AppPaths,
  ) {
    this.rootDir = paths.appDataRoot()
  }

  async init(): Promise<void> {
    await fs.ensureDir(this.rootDir)
    await fs.ensureDir(this.paths.assetsDir())

    const core = createStorageCore(initDatabase(this.db), this.paths)

    this.settingsService = core.settingsService
    this.branchesService = core.branchesService
    this.tasksService = core.tasksService
    this.taskRelationsService = core.taskRelationsService
    this.tagsService = core.tagsService
    this.milestonesService = core.milestonesService
    this.filesService = core.filesService
    this.searchService = core.searchService
    this.localAdapter = core.localAdapter
    this.aiSessionModel = core.aiSessionModel

    const settings = await this.loadSettings()

    this.syncEngine = new SyncEngine(this.localAdapter, this.buildRemotes(settings), {
      assetsDir: () => this.paths.assetsDir(),
      onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => this.notifyStorageStatusChange?.(status, prevStatus),
      onDataChanged: (changeset: Changeset) => {
        this.notifyStorageDataChange?.(changeset)
      },
    })

    this.serverProvider = new ServerProviderService({
      loadSettings: () => this.loadSettings(),
      saveSettings: (partial) => this.saveSettings(partial),
      onBindingChanged: () => this.applyRemoteConfiguration(),
      runSyncCycle: () => this.forceSync(),
      onApprovalRequested: () => this.notifyApprovalRequested?.(),
      disableAutoSync: () => this.syncEngine.disableAutoSync(),
      enableAutoSync: () => this.syncEngine.enableAutoSync(),
      onRevoked: () => this.notifyRevoked?.(),
      onProtocolMismatchChanged: (mismatch) => this.notifyProtocolMismatchChanged?.(mismatch),
      onRoleChanged: (role) => this.notifyRoleChanged?.(role),
    })

    this.providerMigration = new ProviderMigrationService({
      loadSettings: () => this.loadSettings(),
      saveSettings: (partial) => this.saveSettings(partial),
      loadLocalDocs: () => this.localAdapter.loadAllDocs(),
      buildRemotes: (sync) => buildSyncRemotes(sync, {icloudSyncDir: this.paths.remoteSyncPath()}),
      setRemotes: (remotes) => this.syncEngine.setRemotes(remotes),
      getRemoteStates: () => this.syncEngine.getRemoteStates(),
      disableAutoSync: () => this.syncEngine.disableAutoSync(),
      syncOnce: (strategy) => this.syncEngine.syncOnce(strategy),
      applyRemoteConfiguration: () => this.applyRemoteConfiguration(),
      stopProbe: () => this.serverProvider.stopProbe(),
    })

    if (this.hasEnabledRemote(settings)) {
      logger.info(logger.CONTEXT.STORAGE, "A local sync remote is enabled, restoring auto-sync")
      this.syncEngine.enableAutoSync()
    }

    if (resolveActiveProvider(settings.sync) === "server") this.serverProvider.startProbe()

    logger.info(logger.CONTEXT.STORAGE, "Initializing search index")
    await this.searchService.initializeIndex()
    logger.info(logger.CONTEXT.STORAGE, `Search index initialized with ${this.searchService.getIndexSize()} tasks`)
  }

  //#region STORAGE
  setupStorageBroadcasts(callbacks: {
    onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => void
    onDataChange: (changeset: Changeset) => void
    onSettingsChange: () => void
    onApprovalRequested?: () => void
    onRevoked?: () => void
    onProtocolMismatchChanged?: (mismatch: ProtocolMismatchView | null) => void
    onRoleChanged?: (role: DeviceRole) => void
  }) {
    this.notifyStorageStatusChange = callbacks.onStatusChange
    this.notifyStorageDataChange = callbacks.onDataChange
    this.notifySettingsChange = callbacks.onSettingsChange
    this.notifyApprovalRequested = callbacks.onApprovalRequested
    this.notifyRevoked = callbacks.onRevoked
    this.notifyProtocolMismatchChanged = callbacks.onProtocolMismatchChanged
    this.notifyRoleChanged = callbacks.onRoleChanged
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

  /** The Daily Sync Server provider: probing an address, binding this device, peer approval and disconnecting. */
  getServerProvider(): ServerProviderService {
    return this.serverProvider
  }

  /** What a provider holds and how it differs from this Mac, read without activating it or writing to it. */
  async previewMigration(target: Exclude<SyncProvider, "off">): Promise<MigrationPreview> {
    return this.providerMigration.preview(target)
  }

  /** Moves this Mac to another provider, or leaves it on the one it is already syncing with. */
  async migrateProvider(target: SyncProvider, direction: MigrationDirection | null): Promise<void> {
    await this.providerMigration.migrate(target, direction)
  }
  //#endregion

  //#region SETTINGS
  async loadSettings(): Promise<Settings> {
    return this.settingsService.loadSettings()
  }

  async saveSettings(newSettings: Partial<Settings>): Promise<void> {
    if (newSettings.sync) {
      const current = await this.loadSettings()
      assertSingleActiveProvider(deepMerge(structuredClone(current.sync), newSettings.sync))
    }

    await this.settingsService.saveSettings(newSettings)
    if (newSettings.sync) await this.applyRemoteConfiguration()
    this.notifySettingsChange?.()
  }
  //#endregion

  //#region ACTIVITY
  async getTaskHistory(taskId: Task["id"]): Promise<TaskEvent[]> {
    return this.tasksService.getHistoryByTask(taskId)
  }
  //#endregion

  //#region TASKS
  /** Every live task of every project, backlog included. Resolves no project — unlike `getTaskList`, which always narrows to one. */
  async getAllTasks(): Promise<Task[]> {
    return this.tasksService.getTaskList({includeBacklog: true})
  }

  async getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    const branchId = await this.branchesService.resolveBranchId(params?.branchId)
    return this.tasksService.getTaskList({...params, branchId})
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    return this.tasksService.getTask(id)
  }

  async updateTask(id: Task["id"], updates: PartialDeep<Task>): Promise<Changeset> {
    const updatedTasks = await this.tasksService.updateTask(id, updates)
    if (!updatedTasks.length) return EMPTY_CHANGESET

    for (const task of updatedTasks) await this.searchService.updateTaskInIndex(task)
    const removedRelations = await this.taskRelationsService.removeInvalidRelations(updatedTasks.map((task) => task.id))

    const changeset: Changeset = {tasks: {upserted: updatedTasks}}
    if (removedRelations.length) changeset.relations = {removed: removedRelations}
    this.notifyLocalChange(changeset)
    return changeset
  }

  async toggleTaskMinimized(id: Task["id"], minimized: boolean): Promise<Changeset> {
    return this.updateTask(id, {minimized})
  }

  async moveTaskByOrder(params: MoveTaskByOrderParams): Promise<Changeset> {
    const updatedTasks = await this.tasksService.moveTaskByOrder(params)
    if (!updatedTasks.length) return EMPTY_CHANGESET

    for (const task of updatedTasks) await this.searchService.updateTaskInIndex(task)
    const changeset: Changeset = {tasks: {upserted: updatedTasks}}
    this.notifyLocalChange(changeset)
    return changeset
  }

  async moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<Changeset> {
    const branch = await this.branchesService.getBranch(branchId)
    if (!branch) return EMPTY_CHANGESET

    const isMoved = await this.tasksService.moveTaskToBranch(taskId, branch.id)
    if (!isMoved) return EMPTY_CHANGESET

    const updatedTask = await this.tasksService.getTask(taskId)
    if (!updatedTask) return EMPTY_CHANGESET

    await this.searchService.updateTaskInIndex(updatedTask)
    const removedRelations = await this.taskRelationsService.removeInvalidRelations([taskId])

    const changeset: Changeset = {tasks: {upserted: [updatedTask]}}
    if (removedRelations.length) changeset.relations = {removed: removedRelations}
    this.notifyLocalChange(changeset)
    return changeset
  }

  async createTask(task: Task): Promise<Changeset> {
    const branchId = await this.branchesService.resolveBranchId(task?.branchId)
    const createdTask = await this.tasksService.createTask({...task, branchId})
    if (!createdTask) return EMPTY_CHANGESET

    await this.searchService.addTaskToIndex(createdTask)
    const changeset: Changeset = {tasks: {upserted: [createdTask]}}
    this.notifyLocalChange(changeset)
    return changeset
  }

  async deleteTask(id: Task["id"]): Promise<Changeset> {
    const deleted = await this.tasksService.deleteTask(id)
    if (!deleted) return EMPTY_CHANGESET

    this.searchService.removeTaskFromIndex(id)
    const removedRelations = await this.taskRelationsService.removeInvalidRelations([id])

    const changeset: Changeset = {tasks: {removed: [id]}}
    if (removedRelations.length) changeset.relations = {removed: removedRelations}
    this.notifyLocalChange(changeset)
    return changeset
  }

  async addTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Changeset> {
    const addedTask = await this.tasksService.addTaskAttachment(taskId, fileId)
    if (!addedTask) return EMPTY_CHANGESET

    const changeset: Changeset = {tasks: {upserted: [addedTask]}}
    this.notifyLocalChange(changeset)
    return changeset
  }

  async removeTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Changeset> {
    const removedTask = await this.tasksService.removeTaskAttachment(taskId, fileId)
    if (!removedTask) return EMPTY_CHANGESET

    const changeset: Changeset = {tasks: {upserted: [removedTask]}}
    this.notifyLocalChange(changeset)
    return changeset
  }

  async getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    const branchId = await this.branchesService.resolveBranchId(params?.branchId)
    return this.tasksService.getDeletedTasks({...params, branchId})
  }

  async restoreTask(id: Task["id"]): Promise<Changeset> {
    const restoredTask = await this.tasksService.restoreTask(id)
    if (!restoredTask) return EMPTY_CHANGESET

    await this.searchService.updateTaskInIndex(restoredTask)
    const changeset: Changeset = {tasks: {upserted: [restoredTask]}}
    this.notifyLocalChange(changeset)
    return changeset
  }

  /** Deleted tasks are already excluded from the live collection, so a permanent delete has nothing to name. */
  async permanentlyDeleteTask(id: Task["id"]): Promise<boolean> {
    const deleted = await this.tasksService.permanentlyDeleteTask(id)
    if (deleted) {
      this.searchService.removeTaskFromIndex(id)
      this.notifyLocalChange(EMPTY_CHANGESET)
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

    this.notifyLocalChange(EMPTY_CHANGESET)
    return count
  }
  //#endregion

  //#region RELATIONS
  /** Every live relation of every project. */
  async getAllTaskRelations(): Promise<TaskRelation[]> {
    return this.taskRelationsService.getRelationList()
  }

  /** The live tasks this task waits on and the live tasks waiting on it, within its project, resolved ones included, oldest link first. */
  async getTaskRelations(taskId: Task["id"]): Promise<{blockedBy: Task[]; blocks: Task[]}> {
    return this.taskRelationsService.getRelationsOfTask(taskId)
  }

  /** Makes the task's links exactly `next`, dropping what cannot be linked; `EMPTY_CHANGESET` when nothing changed. */
  async setTaskRelations(taskId: Task["id"], next: TaskRelationSets): Promise<Changeset> {
    const {upserted, removed} = await this.taskRelationsService.setTaskRelations(taskId, next)
    if (!upserted.length && !removed.length) return EMPTY_CHANGESET

    const changeset: Changeset = {}
    if (upserted.length) changeset.relations = {...changeset.relations, upserted}
    if (removed.length) changeset.relations = {...changeset.relations, removed}
    this.notifyLocalChange(changeset)
    return changeset
  }
  //#endregion

  //#region BRANCHES
  async getBranchList(): Promise<Branch[]> {
    return this.branchesService.getBranchList()
  }

  async getBranch(id: Branch["id"]): Promise<Branch | null> {
    return this.branchesService.getBranch(id)
  }

  async createBranch(branch: Pick<Branch, "name"> & Partial<Pick<Branch, "description">>): Promise<Branch | null> {
    const createdBranch = await this.branchesService.createBranch(branch)
    if (createdBranch) {
      this.notifyLocalChange({branches: {upserted: [createdBranch]}})
    }
    return createdBranch
  }

  async updateBranch(id: Branch["id"], updates: Partial<Pick<Branch, "description" | "name">>): Promise<Branch | null> {
    const updatedBranch = await this.branchesService.updateBranch(id, updates)
    if (updatedBranch) {
      this.notifyLocalChange({branches: {upserted: [updatedBranch]}})
    }
    return updatedBranch
  }

  async deleteBranch(id: Branch["id"]): Promise<boolean> {
    const result = await this.branchesService.deleteBranch(id)
    if (!result) return false

    for (const taskId of result.deletedTaskIds) {
      this.searchService.removeTaskFromIndex(taskId)
    }
    const removedRelations = await this.taskRelationsService.removeInvalidRelations(result.deletedTaskIds)

    const changeset: Changeset = {branches: {removed: [id]}}
    if (result.deletedTaskIds.length) changeset.tasks = {removed: result.deletedTaskIds}
    if (result.deletedMilestoneIds.length) changeset.milestones = {removed: result.deletedMilestoneIds}
    if (result.deletedTagIds.length) changeset.tags = {removed: result.deletedTagIds}
    if (removedRelations.length) changeset.relations = {removed: removedRelations}
    this.notifyLocalChange(changeset)
    return true
  }

  async setActiveBranch(id: Branch["id"]): Promise<void> {
    await this.branchesService.setActiveBranch(id)
    this.notifyLocalChange(EMPTY_CHANGESET)
  }
  //#endregion

  //#region TAGS
  async getTagList(branchId?: Branch["id"]): Promise<Tag[]> {
    return this.tagsService.getTagList(branchId)
  }

  async getTag(id: Tag["id"]): Promise<Tag | null> {
    return this.tagsService.getTag(id)
  }

  async updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Tag | null> {
    const updatedTag = await this.tagsService.updateTag(id, updates)
    if (updatedTag) {
      this.notifyLocalChange({tags: {upserted: [updatedTag]}})
    }
    return updatedTag
  }

  async createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Promise<Tag | null> {
    const createdTag = await this.tagsService.createTag(tag)
    if (createdTag) {
      this.notifyLocalChange({tags: {upserted: [createdTag]}})
    }
    return createdTag
  }

  async deleteTag(id: Tag["id"]): Promise<boolean> {
    const deleted = await this.tagsService.deleteTag(id)
    if (deleted) {
      this.notifyLocalChange({tags: {removed: [id]}})
    }
    return deleted
  }

  async addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Changeset> {
    const updatedTask = await this.tasksService.addTaskTags(taskId, tagIds)
    if (!updatedTask) return EMPTY_CHANGESET

    await this.searchService.updateTaskInIndex(updatedTask)
    const changeset: Changeset = {tasks: {upserted: [updatedTask]}}
    this.notifyLocalChange(changeset)
    return changeset
  }

  async removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Changeset> {
    const updatedTask = await this.tasksService.removeTaskTags(taskId, tagIds)
    const changeset: Changeset = updatedTask ? {tasks: {upserted: [updatedTask]}} : EMPTY_CHANGESET
    if (updatedTask) {
      await this.searchService.updateTaskInIndex(updatedTask)
      this.notifyLocalChange(changeset)
    }
    this.notifyLocalChange(changeset)
    return changeset
  }
  //#endregion

  //#region MILESTONES
  async getMilestoneList(branchId?: Branch["id"]): Promise<Milestone[]> {
    return this.milestonesService.getMilestoneList(branchId)
  }

  async getMilestone(id: Milestone["id"]): Promise<Milestone | null> {
    return this.milestonesService.getMilestone(id)
  }

  async createMilestone(milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "orderIndex">): Promise<Changeset> {
    const createdMilestone = await this.milestonesService.createMilestone(milestone)
    if (!createdMilestone) return EMPTY_CHANGESET

    const changeset: Changeset = {milestones: {upserted: [createdMilestone]}}
    this.notifyLocalChange(changeset)
    return changeset
  }

  async updateMilestone(
    id: Milestone["id"],
    updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>,
  ): Promise<Changeset> {
    const updatedMilestone = await this.milestonesService.updateMilestone(id, updates)
    if (!updatedMilestone) return EMPTY_CHANGESET

    const changeset: Changeset = {milestones: {upserted: [updatedMilestone]}}
    this.notifyLocalChange(changeset)
    return changeset
  }

  /** Also nulls `milestoneId` on the tasks it held; those ids are not surfaced here since `MilestonesService.deleteMilestone` only reports success. */
  async deleteMilestone(id: Milestone["id"]): Promise<Changeset> {
    const deleted = await this.milestonesService.deleteMilestone(id)
    if (!deleted) return EMPTY_CHANGESET

    const changeset: Changeset = {milestones: {removed: [id]}}
    this.notifyLocalChange(changeset)
    return changeset
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

  private notifyLocalChange(changeset: Changeset): void {
    this.notifyStorageDataChange?.(changeset)
    this.syncEngine?.requestPush()
  }

  private async applyRemoteConfiguration(): Promise<void> {
    const settings = await this.loadSettings()
    this.syncEngine.setRemotes(this.buildRemotes(settings))
    if (this.hasEnabledRemote(settings)) this.syncEngine.enableAutoSync()
    else this.syncEngine.disableAutoSync()

    if (resolveActiveProvider(settings.sync) === "server") this.serverProvider.startProbe()
    else this.serverProvider.stopProbe()
  }

  private buildRemotes(settings: Settings): SyncRemote[] {
    return buildSyncRemotes(settings.sync, {icloudSyncDir: this.paths.remoteSyncPath()})
  }

  private hasEnabledRemote(settings: Settings): boolean {
    return resolveActiveProvider(settings.sync) !== "off"
  }
}
