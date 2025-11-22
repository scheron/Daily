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

import type {PartialDeep} from "type-fest"
import type {Day, File, ISODate, IStorageController, Settings, Tag, Task} from "../../types.js"

import {fsPaths} from "../../config.js"
import {getDB} from "./database.js"
import {FileModel} from "./models/FileModel.js"
import {SettingsModel} from "./models/SettingsModel.js"
import {TagModel} from "./models/TagModel.js"
import {TaskModel} from "./models/TaskModel.js"
import {DaysService} from "./services/DaysService.js"
import {FilesService} from "./services/FilesService.js"
import {SettingsService} from "./services/SettingsService.js"
import {TagsService} from "./services/TagsService.js"
import {TasksService} from "./services/TasksService.js"

export class StorageController implements IStorageController {
  rootDir: string = fsPaths.appDataRoot()

  private settingsService!: SettingsService
  private tasksService!: TasksService
  private tagsService!: TagsService
  private filesService!: FilesService
  private daysService!: DaysService

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
  }

  async loadSettings(): Promise<Settings> {
    return this.settingsService.loadSettings()
  }

  async saveSettings(newSettings: Partial<Settings>): Promise<void> {
    await this.settingsService.saveSettings(newSettings)
  }

  async getDays(params: {from?: ISODate; to?: ISODate} = {}): Promise<Day[]> {
    return this.daysService.getDays(params)
  }

  async getDay(date: ISODate): Promise<Day | null> {
    return this.daysService.getDay(date)
  }

  async getTaskList(params?: {from?: ISODate; to?: ISODate}): Promise<Task[]> {
    return this.tasksService.getTaskList(params)
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    return this.tasksService.getTask(id)
  }

  async updateTask(id: Task["id"], updates: PartialDeep<Task>): Promise<Task | null> {
    return this.tasksService.updateTask(id, updates)
  }

  async createTask(task: Task): Promise<Task | null> {
    return this.tasksService.createTask(task)
  }

  async deleteTask(id: Task["id"]): Promise<boolean> {
    return this.tasksService.deleteTask(id)
  }

  async getTagList(): Promise<Tag[]> {
    return this.tagsService.getTagList()
  }

  async getTag(name: Tag["name"]): Promise<Tag | null> {
    return this.tagsService.getTag(name)
  }

  async updateTag(name: Tag["name"], tag: Tag): Promise<Tag | null> {
    return this.tagsService.updateTag(name, tag)
  }

  async createTag(tag: Tag): Promise<Tag | null> {
    return this.tagsService.createTag(tag)
  }

  async deleteTag(name: Tag["name"]): Promise<boolean> {
    return this.tagsService.deleteTag(name)
  }

  async addTaskTags(taskId: Task["id"], tagNames: Tag["name"][]): Promise<Task | null> {
    return this.tasksService.addTaskTags(taskId, tagNames)
  }

  async removeTaskTags(taskId: Task["id"], tagNames: Tag["name"][]): Promise<Task | null> {
    return this.tasksService.removeTaskTags(taskId, tagNames)
  }

  async addTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null> {
    return this.tasksService.addTaskAttachment(taskId, fileId)
  }

  async removeTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null> {
    return this.tasksService.removeTaskAttachment(taskId, fileId)
  }

  async saveFile(filename: string, data: Buffer): Promise<string> {
    return this.filesService.saveFile(filename, data)
  }

  getFilePath(id: File["id"]): string {
    return this.filesService.getFilePath(id)
  }

  async deleteFile(fileId: File["id"]): Promise<boolean> {
    return this.filesService.deleteFile(fileId)
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

  async syncStorage(): Promise<void> {
    try {
      // TODO: in future we will sync with CouchDB
    } catch (error) {
      console.error("❌ Storage sync failed:", error)
    }
  }
}
