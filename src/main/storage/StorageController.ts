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

import {LogContext, logger} from "@/utils/logger"

import {fsPaths} from "@/config"
import {getDB} from "@/storage/database"
import {FileModel} from "@/storage/models/FileModel"
import {SettingsModel} from "@/storage/models/SettingsModel"
import {TagModel} from "@/storage/models/TagModel"
import {TaskModel} from "@/storage/models/TaskModel"
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
import type {Day, File, Settings, SyncStatus, Tag, Task} from "@shared/types/storage"
import type {PartialDeep} from "type-fest"

export class StorageController implements IStorageController {
  rootDir: string = fsPaths.appDataRoot()

  private settingsService!: SettingsService
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
    const taskModel = new TaskModel(db)
    const tagModel = new TagModel(db)
    const fileModel = new FileModel(db)

    this.tasksService = new TasksService(taskModel, tagModel)
    this.tagsService = new TagsService(taskModel, tagModel)
    this.settingsService = new SettingsService(settingsModel)
    this.filesService = new FilesService(fileModel)
    this.daysService = new DaysService(taskModel, tagModel)
    this.searchService = new SearchService(taskModel, tagModel)

    const remoteAdapter = new RemoteStorageAdapter(fsPaths.remoteSyncPath())
    const localAdapter = new LocalStorageAdapter(db)

    this.syncEngine = new SyncEngine(localAdapter, remoteAdapter, {
      onStatusChange: (status: SyncStatus, prevStatus: SyncStatus) => this.notifyStorageStatusChange?.(status, prevStatus),
      onDataChanged: () => {
        settingsModel.invalidateCache()
        tagModel.invalidateCache()
        this.notifyStorageDataChange?.()
      },
    })

    const settings = await this.loadSettings()

    if (settings.sync.enabled) {
      logger.info(LogContext.STORAGE, "Auto-sync was enabled, restoring")
      this.syncEngine.enableAutoSync()
    }

    // Initialize search index
    logger.info(LogContext.STORAGE, "Initializing search index")
    await this.searchService.initializeIndex()
    logger.info(LogContext.STORAGE, `Search index initialized with ${this.searchService.getIndexSize()} tasks`)
  }

  //#region STORAGE
  setupStorageBroadcasts(callbacks: {onStatusChange: (status: SyncStatus) => void; onDataChange: () => void}): void {
    this.notifyStorageStatusChange = callbacks.onStatusChange
    this.notifyStorageDataChange = callbacks.onDataChange
  }

  async activateSync() {
    logger.info(LogContext.STORAGE, "Activating sync")
    await this.settingsService.saveSettings({sync: {enabled: true}})
    this.syncEngine.enableAutoSync()
  }

  async deactivateSync() {
    logger.info(LogContext.STORAGE, "Deactivating sync")
    await this.settingsService.saveSettings({sync: {enabled: false}})
    this.syncEngine.disableAutoSync()
  }

  async forceSync() {
    logger.info(LogContext.STORAGE, "Force syncing")
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
  async getDays(params: {from?: ISODate; to?: ISODate} = {}): Promise<Day[]> {
    return this.daysService.getDays(params)
  }

  async getDay(date: ISODate): Promise<Day | null> {
    return this.daysService.getDay(date)
  }
  //#endregion

  //#region TASKS
  async getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number}): Promise<Task[]> {
    return this.tasksService.getTaskList(params)
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    return this.tasksService.getTask(id)
  }

  async updateTask(id: Task["id"], updates: PartialDeep<Task>): Promise<Task | null> {
    const updatedTask = await this.tasksService.updateTask(id, updates)
    if (updatedTask) {
      await this.searchService.updateTaskInIndex(updatedTask)
    }
    return updatedTask
  }

  async createTask(task: Task): Promise<Task | null> {
    const createdTask = await this.tasksService.createTask(task)
    if (createdTask) {
      await this.searchService.addTaskToIndex(createdTask)
    }
    this.notifyStorageDataChange?.()
    return createdTask
  }

  async deleteTask(id: Task["id"]): Promise<boolean> {
    const deleted = await this.tasksService.deleteTask(id)
    if (deleted) {
      this.searchService.removeTaskFromIndex(id)
    }

    this.notifyStorageDataChange?.()
    return deleted
  }

  async addTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null> {
    const addedTask = await this.tasksService.addTaskAttachment(taskId, fileId)
    this.notifyStorageDataChange?.()
    return addedTask
  }

  async removeTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null> {
    const removedTask = await this.tasksService.removeTaskAttachment(taskId, fileId)
    this.notifyStorageDataChange?.()
    return removedTask
  }

  async getDeletedTasks(params?: {limit?: number}): Promise<Task[]> {
    return this.tasksService.getDeletedTasks(params)
  }

  async restoreTask(id: Task["id"]): Promise<Task | null> {
    const restoredTask = await this.tasksService.restoreTask(id)
    if (restoredTask) {
      await this.searchService.updateTaskInIndex(restoredTask)
    }
    this.notifyStorageDataChange?.()
    return restoredTask
  }

  async permanentlyDeleteTask(id: Task["id"]): Promise<boolean> {
    const deleted = await this.tasksService.permanentlyDeleteTask(id)
    if (deleted) {
      this.searchService.removeTaskFromIndex(id)
    }
    this.notifyStorageDataChange?.()
    return deleted
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
    this.notifyStorageDataChange?.()
    return updatedTag
  }

  async createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Promise<Tag | null> {
    const createdTag = await this.tagsService.createTag(tag)
    this.notifyStorageDataChange?.()
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
    }
    this.notifyStorageDataChange?.()
    return updatedTask
  }

  async removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    const updatedTask = await this.tasksService.removeTaskTags(taskId, tagIds)
    if (updatedTask) {
      await this.searchService.updateTaskInIndex(updatedTask)
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
