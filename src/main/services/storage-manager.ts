import path from "path"
import {app} from "electron"
import fs from "fs-extra"
import {nanoid} from "nanoid"


import type {DayItem, ExportTaskData, StoreSchema, Tag, Task} from "../types.js"

import {deepMerge} from "../helpers.js"

export class StorageManager {
  configDir: string
  configPath: string
  dataPath: string
  assetsDir: string

  private tasksCache: Task[] = []
  private daysCache: DayItem[] = []
  private tagsCache: Tag[] = []
  private settingsCache: Partial<StoreSchema["settings"]> | null = null

  constructor() {
    this.configDir = path.join(app.getPath("home"), ".config", "daily")
    this.configPath = path.join(this.configDir, "config.json")
    this.dataPath = path.join(this.configDir, "data.json")
    this.assetsDir = path.join(this.configDir, "assets")
  }

  async init(): Promise<void> {
    await fs.ensureDir(this.configDir)
    await fs.ensureDir(this.assetsDir)

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

  async saveAsset(filename: string, data: Buffer): Promise<string> {
    await fs.ensureDir(this.assetsDir)

    const ext = path.extname(filename)
    const uniqueFilename = `${nanoid()}${ext}`
    const filePath = path.join(this.assetsDir, uniqueFilename)

    console.log("Saving asset to:", filePath, "filename:", filename)

    await fs.writeFile(filePath, data)
    return uniqueFilename
  }

  async getAssetPath(filename: string): Promise<string> {
    await fs.ensureDir(this.assetsDir)
    return path.join(this.assetsDir, filename)
  }

  async deleteAsset(filename: string): Promise<void> {
    await fs.ensureDir(this.assetsDir)
    console.log("Deleting asset:", filename)
    const filePath = path.join(this.assetsDir, filename)
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath)
    }
  }

  async getStorageInfo(): Promise<{
    configDir: string
    configSize: number
    dataSize: number
    assetsSize: number
    tasksCount: number
    daysCount: number
  }> {
    try {
      const configStat = await fs.stat(this.configPath)
      const dataStat = await fs.stat(this.dataPath)

      let assetsSize = 0
      await fs.ensureDir(this.assetsDir)
      const files = await fs.readdir(this.assetsDir)
      for (const file of files) {
        const stat = await fs.stat(path.join(this.assetsDir, file))
        assetsSize += stat.size
      }

      return {
        configDir: this.configDir,
        configSize: configStat.size,
        dataSize: dataStat.size,
        assetsSize,
        tasksCount: this.tasksCache.length,
        daysCount: this.daysCache.length,
      }
    } catch (err) {
      console.error("Failed to get storage info:", err)
      return {
        configDir: this.configDir,
        configSize: 0,
        dataSize: 0,
        assetsSize: 0,
        tasksCount: 0,
        daysCount: 0,
      }
    }
  }
}
