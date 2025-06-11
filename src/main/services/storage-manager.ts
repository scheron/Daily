import path from "path"
import {app} from "electron"
import fs from "fs-extra"

import type {DayItem, ExportTaskData, StoreSchema, Task, Tag} from "../types.js"

export class StorageManager {
  private configDir: string
  private configPath: string
  private dataPath: string

  private tasksCache: Task[] = []
  private daysCache: DayItem[] = []
  private tagsCache: Tag[] = []

  constructor() {
    this.configDir = path.join(app.getPath("home"), ".config", "daily")
    this.configPath = path.join(this.configDir, "config.json")
    this.dataPath = path.join(this.configDir, "data.json")
  }

  async init(): Promise<void> {
    await fs.ensureDir(this.configDir)

    if (!(await fs.pathExists(this.configPath))) {
      const defaultConfig: StoreSchema["settings"] = {
        theme: "night",
        sidebarCollapsed: false,
      }
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

    } catch (err) {
      console.warn("⚠️ Failed to load data from disk, resetting:", err)

      this.tasksCache = []
      this.daysCache = []
      this.tagsCache = []

      await fs.writeJson(this.dataPath, {tasks: [], days: [], tags: []}, {spaces: 2})
    }
  }

  async getSettings(): Promise<StoreSchema["settings"]> {
    try {
      return await fs.readJson(this.configPath)
    } catch {
      const fallback: StoreSchema["settings"] = {
        theme: "night",
        sidebarCollapsed: false,
      }
      await fs.writeJson(this.configPath, fallback, {spaces: 2})
      return fallback
    }
  }

  async saveSettings(newSettings: Partial<StoreSchema["settings"]>): Promise<void> {
    const current = await this.getSettings()
    const merged = {...current, ...newSettings}
    await fs.writeJson(this.configPath, merged, {spaces: 2})
  }

  loadTasks(): Task[] {
    return [...this.tasksCache]
  }

  async saveTasks(tasks: Task[]): Promise<void> {
    this.tasksCache = [...tasks]
    await this.writeDataFile()
  }

  loadDays(): DayItem[] {
    return [...this.daysCache]
  }

  async saveDays(days: DayItem[]): Promise<void> {
    this.daysCache = [...days]
    await this.writeDataFile()
  }

  loadTags(): Tag[] {
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
