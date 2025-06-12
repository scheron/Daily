import path from "path"
import {app} from "electron"
import fs from "fs-extra"

import type {DayItem, ExportTaskData, StoreSchema, Tag, Task} from "../types.js"

import {deepMerge} from "./deep-merge.js"

export class StorageManager {
  private configDir: string
  private configPath: string
  private dataPath: string

  private tasksCache: Task[] = []
  private daysCache: DayItem[] = []
  private tagsCache: Tag[] = []
  private settingsCache: Partial<StoreSchema["settings"]> | null = null

  constructor() {
    this.configDir = path.join(app.getPath("home"), ".config", "daily")
    this.configPath = path.join(this.configDir, "config.json")
    this.dataPath = path.join(this.configDir, "data.json")
  }

  async init(): Promise<void> {
    await fs.ensureDir(this.configDir)

    if (!(await fs.pathExists(this.configPath))) {
      const defaultConfig: Partial<StoreSchema["settings"]> = {}
      await fs.writeJson(this.configPath, defaultConfig, {spaces: 2})
    }

    if (!(await fs.pathExists(this.dataPath))) {
      const defaultData: Omit<StoreSchema, "settings"> = {
        tasks: [],
        days: [],
        tags: [],
      }
      await fs.writeJson(this.dataPath, defaultData, {spaces: 2})
    }

    try {
      const data = (await fs.readJson(this.dataPath)) as {tasks: Task[]; days: DayItem[]; tags: Tag[]}

      this.tasksCache = Array.isArray(data.tasks) ? [...data.tasks] : []
      this.daysCache = Array.isArray(data.days) ? [...data.days] : []
      this.tagsCache = Array.isArray(data.tags) ? [...data.tags] : []
      this.settingsCache = await fs.readJson(this.configPath)
    } catch (err) {
      console.warn("⚠️ Failed to load data from disk, resetting:", err)

      this.tasksCache = []
      this.daysCache = []
      this.tagsCache = []
      this.settingsCache = {}

      await fs.writeJson(this.dataPath, {tasks: [], days: [], tags: []}, {spaces: 2})
      await fs.writeJson(this.configPath, {}, {spaces: 2})
    }
  }

  async getSettings(): Promise<Partial<StoreSchema["settings"]>> {
    if (!this.settingsCache) {
      try {
        this.settingsCache = await fs.readJson(this.configPath)
      } catch (err) {
        console.error("Failed to load settings:", err)
        this.settingsCache = {}
        await fs.writeJson(this.configPath, this.settingsCache, {spaces: 2})
      }
    }

    return this.settingsCache as Partial<StoreSchema["settings"]>
  }

  async saveSettings(newSettings: Partial<StoreSchema["settings"]>): Promise<void> {
    const current = await this.getSettings()
    const merged = deepMerge(current, newSettings)
    this.settingsCache = merged
    await fs.writeJson(this.configPath, merged, {spaces: 2})
  }

  async loadTasks(): Promise<Task[]> {
    return [...this.tasksCache]
  }

  async saveTasks(tasks: Task[]): Promise<void> {
    this.tasksCache = [...tasks]
    await this.writeDataFile()
  }

  async loadDays(): Promise<DayItem[]> {
    return [...this.daysCache]
  }

  async saveDays(days: DayItem[]): Promise<void> {
    this.daysCache = [...days]
    await this.writeDataFile()
  }

  async loadTags(): Promise<Tag[]> {
    return [...this.tagsCache]
  }

  async saveTags(tags: Tag[]): Promise<void> {
    this.tagsCache = [...tags]
    await this.writeDataFile()
  }

  private async writeDataFile(): Promise<void> {
    await fs.writeJson(
      this.dataPath,
      {
        tasks: this.tasksCache,
        days: this.daysCache,
        tags: this.tagsCache,
      },
      {spaces: 2},
    )
  }

  async exportTasks(exportData: ExportTaskData[], selectedFolder: string): Promise<boolean> {
    const folderName = path.basename(selectedFolder)
    const exportFolder = folderName === "Daily" ? selectedFolder : path.join(selectedFolder, "Daily")

    try {
      await fs.ensureDir(exportFolder)

      for (const dayData of exportData) {
        const dayFolderPath = path.join(exportFolder, dayData.date)
        await fs.ensureDir(dayFolderPath)

        for (const task of dayData.tasks) {
          const taskFilePath = path.join(dayFolderPath, task.filename)
          await fs.writeFile(taskFilePath, task.content, "utf-8")
        }
      }

      return true
    } catch (err) {
      console.error("❌ Error exporting tasks:", err)
      return false
    }
  }

  async getStorageInfo(): Promise<{
    configDir: string
    configSize: number
    dataSize: number
    tasksCount: number
    daysCount: number
  }> {
    try {
      const configStat = await fs.stat(this.configPath)
      const dataStat = await fs.stat(this.dataPath)

      return {
        configDir: this.configDir,
        configSize: configStat.size,
        dataSize: dataStat.size,
        tasksCount: this.tasksCache.length,
        daysCount: this.daysCache.length,
      }
    } catch (err) {
      console.error("Failed to get storage info:", err)
      return {
        configDir: this.configDir,
        configSize: 0,
        dataSize: 0,
        tasksCount: 0,
        daysCount: 0,
      }
    }
  }
}
