/*
Storage Architecture (PouchDB):

~/Library/Application Support/Daily/
└── db/ (PouchDB)
    ├── tasks (TaskDoc)
    ├── tags (TagDoc)
    ├── settings (SettingsDoc)
    └── files (FileDoc with _attachments)
*/

import fs from "fs-extra"

import {logger} from "@/utils/logger"

import {fsPaths} from "@/config"
import {getDB} from "@/storage/database"
import {BranchModel} from "@/storage/models/BranchModel"
import {FileModel} from "@/storage/models/FileModel"
import {SettingsModel} from "@/storage/models/SettingsModel"
import {TagModel} from "@/storage/models/TagModel"
import {TaskModel} from "@/storage/models/TaskModel"
import {BranchesService} from "@/storage/services/BranchesService"
import {DaysService} from "@/storage/services/DaysService"
import {FilesService} from "@/storage/services/FilesService"
import {SearchService} from "@/storage/services/SearchService"
import {SettingsService} from "@/storage/services/SettingsService"
import {TagsService} from "@/storage/services/TagsService"
import {TasksService} from "@/storage/services/TasksService"
import {LocalStorageAdapter} from "@/storage/sync/adapters/LocalStorageAdapter"
import {RemoteStorageAdapter} from "@/storage/sync/adapters/RemoteStorageAdapter"
import {SyncEngine} from "@/storage/sync/SyncEngine"

import type {IStorageController} from "@/types/storage"
import type {ISODate} from "@shared/types/common"
import type {TaskSearchResult} from "@shared/types/search"
import type {Branch, Day, File, MoveTaskByOrderParams, Settings, SyncStatus, Tag, Task} from "@shared/types/storage"
import type {PartialDeep} from "type-fest"

export class StorageController implements IStorageController {
  rootDir: string = fsPaths.appDataRoot()

  private settingsService!: SettingsService
  private branchesService!: BranchesService
  private tasksService!: TasksService
  private tagsService!: TagsService
  private filesService!: FilesService
  private daysService!: DaysService
  private searchService!: SearchService
  private syncEngine!: SyncEngine

  private notifyStorageStatusChange?: (status: SyncStatus, prevStatus: SyncStatus) => void
  private notifyStorageDataChange?: () => void

  async init(): Promise<void> {
    await fs.ensureDir(this.rootDir)

    const db = await getDB(fsPaths.dbPath())

    const settingsModel = new SettingsModel(db)
    const branchModel = new BranchModel(db)
    const taskModel = new TaskModel(db)
    const tagModel = new TagModel(db)
    const fileModel = new FileModel(db)

    this.settingsService = new SettingsService(settingsModel)
    this.branchesService = new BranchesService(branchModel, this.settingsService)
    this.tasksService = new TasksService(taskModel, tagModel)
    this.tagsService = new TagsService(taskModel, tagModel)
    this.filesService = new FilesService(fileModel)
    this.daysService = new DaysService(taskModel, tagModel)
    this.searchService = new SearchService(taskModel, tagModel, branchModel)

    const remoteAdapter = new RemoteStorageAdapter(fsPaths.remoteSyncPath())
    const localAdapter = new LocalStorageAdapter(db)

    this.syncEngine = new SyncEngine(localAdapter, remoteAdapter, {
      onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => this.notifyStorageStatusChange?.(status, prevStatus),
      onDataChanged: () => {
        settingsModel.invalidateCache()
        tagModel.invalidateCache()
        branchModel.invalidateCache()
        this.notifyStorageDataChange?.()
      },
    })

    const settings = await this.loadSettings()

    if (settings.sync.enabled) {
      logger.info(logger.CONTEXT.STORAGE, "Auto-sync was enabled, restoring")
      this.syncEngine.enableAutoSync()
    }

    logger.info(logger.CONTEXT.STORAGE, "Initializing search index")
    await this.searchService.initializeIndex()
    logger.info(logger.CONTEXT.STORAGE, `Search index initialized with ${this.searchService.getIndexSize()} tasks`)
  }

  //#region STORAGE
  setupStorageBroadcasts(callbacks: {onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => void; onDataChange: () => void}): void {
    this.notifyStorageStatusChange = callbacks.onStatusChange
    this.notifyStorageDataChange = callbacks.onDataChange
  }

  async activateSync() {
    logger.info(logger.CONTEXT.STORAGE, "Activating sync")
    await this.settingsService.saveSettings({sync: {enabled: true}})
    this.syncEngine.enableAutoSync()
  }

  async deactivateSync() {
    logger.info(logger.CONTEXT.STORAGE, "Deactivating sync")
    await this.settingsService.saveSettings({sync: {enabled: false}})
    this.syncEngine.disableAutoSync()
  }

  async forceSync() {
    logger.info(logger.CONTEXT.STORAGE, "Force syncing")
    await this.syncEngine.sync("pull")
  }

  getSyncStatus(): SyncStatus {
    return this.syncEngine.syncStatus
  }
  //#endregion

  //#region SETTINGS
  async loadSettings(): Promise<Settings> {
    return this.settingsService.loadSettings()
  }

  async saveSettings(newSettings: Partial<Settings>): Promise<void> {
    await this.settingsService.saveSettings(newSettings)
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
    const deletedIds = await this.tasksService.permanentlyDeleteAllDeletedTasks({branchId})
    if (!deletedIds.length) return 0

    for (const id of deletedIds) {
      this.searchService.removeTaskFromIndex(id)
    }

    this.notifyStorageDataChange?.()
    return deletedIds.length
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
    const tasks = await this.getTaskList()
    return this.filesService.cleanupOrphanFiles(tasks)
  }
  //#endregion
}
