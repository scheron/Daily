/*
Storage Architecture (PouchDB):

~/Library/Application Support/Daily/
└── db/ (PouchDB)
    ├── tasks (TaskDoc)
    ├── tags (TagDoc)
    ├── settings (SettingsDoc)
    └── files (FileDoc with _attachments)
*/

import {fsPaths} from "@/config"
import {getDB} from "@/storage/database"
import {FileModel} from "@/storage/models/FileModel"
import {SettingsModel} from "@/storage/models/SettingsModel"
import {TagModel} from "@/storage/models/TagModel"
import {TaskModel} from "@/storage/models/TaskModel"
import {DaysService} from "@/storage/services/DaysService"
import {FilesService} from "@/storage/services/FilesService"
import {SettingsService} from "@/storage/services/SettingsService"
import {TagsService} from "@/storage/services/TagsService"
import {TasksService} from "@/storage/services/TasksService"
import {LocalStorageAdapter} from "@/storage/sync/adapters/LocalStorageAdapter"
import {RemoteStorageAdapter} from "@/storage/sync/adapters/RemoteStorageAdapter"
import {SyncEngine} from "@/storage/sync/SyncEngine"
import {LogContext, logger} from "@/utils/logger"
import fs from "fs-extra"

import type {IStorageController} from "@/types/storage"
import type {ISODate} from "@shared/types/common"
import type {Day, File, Settings, SyncStatus, Tag, Task} from "@shared/types/storage"
import type {PartialDeep} from "type-fest"

export class StorageController implements IStorageController {
  rootDir: string = fsPaths.appDataRoot()

  private settingsService!: SettingsService
  private tasksService!: TasksService
  private tagsService!: TagsService
  private filesService!: FilesService
  private daysService!: DaysService
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
    return await this.tasksService.updateTask(id, updates)
  }

  async createTask(task: Task): Promise<Task | null> {
    return await this.tasksService.createTask(task)
  }

  async deleteTask(id: Task["id"]): Promise<boolean> {
    return await this.tasksService.deleteTask(id)
  }

  async addTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null> {
    return await this.tasksService.addTaskAttachment(taskId, fileId)
  }

  async removeTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null> {
    return await this.tasksService.removeTaskAttachment(taskId, fileId)
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
    return await this.tagsService.updateTag(id, updates)
  }

  async createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Promise<Tag | null> {
    return await this.tagsService.createTag(tag)
  }

  async deleteTag(id: Tag["id"]): Promise<boolean> {
    return await this.tagsService.deleteTag(id)
  }

  async addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    return await this.tasksService.addTaskTags(taskId, tagIds)
  }

  async removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    return await this.tasksService.removeTaskTags(taskId, tagIds)
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
