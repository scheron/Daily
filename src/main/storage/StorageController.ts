/*
New Storage Architecture:

Documents/
└── Daily/
    ├── YYYY-MM-DD/
    │   ├── <task_id>.md
    │   └── ...
    ├── .meta.json
    ├── .config.json
    └── assets/
*/

import path from "node:path"
import {app, dialog} from "electron"
import fs from "fs-extra"
import {nanoid} from "nanoid"

import type {ID, MetaFile, Settings, Tag, Task} from "../types.js"

import {notifyStorageChange} from "../services/storage-events.js"
import {AssetsService} from "./services/AssetsService.js"
import {ConfigService} from "./services/ConfigService.js"
import {MetaService} from "./services/MetaService.js"
import {extractFilenames} from "./utils/fileTypes.js"
import {fsPaths} from "./utils/fsPaths.js"

export class StorageController {
  rootDir: string
  private lastMetaVersion = ""
  private lastConfigVersion = ""

  private metaService!: MetaService
  private configService!: ConfigService
  private assetsService!: AssetsService

  constructor() {
    this.rootDir = fsPaths.defaultPath()
  }

  async init(): Promise<void> {
    this.rootDir = await this.resolveStorageRoot()

    this.metaService = new MetaService(this.rootDir)
    this.configService = new ConfigService(this.rootDir)
    this.assetsService = new AssetsService(this.rootDir)

    await fs.ensureDir(this.rootDir)

    await this.metaService.init()
    await this.configService.init()
    await this.assetsService.init()

    await this.syncStorage()
  }

  private async migrateToNewRoot(selectedPath: string, removeOldDir = false): Promise<boolean> {
    const originalRoot = this.rootDir

    try {
      const isDaily = path.basename(selectedPath) === "Daily"
      const newRoot = isDaily ? selectedPath : path.join(selectedPath, "Daily")
      if (newRoot === this.rootDir) return false

      console.log("📦 Starting migration to:", newRoot)

      this.rootDir = newRoot

      await this.metaService.migrate(newRoot, removeOldDir)
      await this.configService.migrate(newRoot, removeOldDir)
      await this.assetsService.migrate(newRoot, removeOldDir)

      await this.saveStorageRoot(newRoot)
      console.log("✅ Migration completed.")

      if (removeOldDir) {
        console.log("🧹 Removing old directory:", originalRoot)
        await fs.remove(originalRoot)
      }

      return true
    } catch (error) {
      // NOTE: Rollback to original state
      console.error("❌ Migration failed:", error)
      this.rootDir = originalRoot

      await this.metaService.migrate(originalRoot, false)
      await this.configService.migrate(originalRoot, false)
      await this.assetsService.migrate(originalRoot, false)

      return false
    }
  }

  private async migrateWithMergeExistingStorage(selectedPath: string): Promise<boolean> {
    const isDaily = path.basename(selectedPath) === "Daily"
    const newRoot = isDaily ? selectedPath : path.join(selectedPath, "Daily")
    const newMetaPath = path.join(newRoot, ".meta.json")

    try {
      const existingMeta: MetaFile = (await fs.readJson(newMetaPath).catch(() => ({
        version: nanoid(),
        tasks: {},
        tags: {},
      }))) as MetaFile

      console.log("🔄 Merging with existing storage:", newMetaPath, existingMeta)

      const currentTasks = await this.metaService.getTasks()
      const currentTags = await this.metaService.getTags()

      const mergedTags = {...existingMeta.tags}

      for (const tag of currentTags) {
        const existingTag = Object.values(mergedTags).find((t) => t.name === tag.name)
        if (!existingTag) {
          mergedTags[tag.name] = tag
        }
      }

      const mergedTasks = {...existingMeta.tasks}

      for (const task of currentTasks) {
        const id = task.id

        const originalPath = path.resolve(this.rootDir, fsPaths.taskFile(this.rootDir, `${task.scheduled.date}/${id}.md`))
        const dayFolder = path.join(newRoot, task.scheduled.date)
        await fs.ensureDir(dayFolder)

        const targetPath = path.join(dayFolder, `${id}.md`)
        const relPath = path.relative(newRoot, targetPath)

        if (originalPath !== targetPath) {
          await fs.copy(originalPath, targetPath)
        }

        const existingTask = mergedTasks[id]
        if (!existingTask || (task.updatedAt && existingTask.updatedAt && task.updatedAt > existingTask.updatedAt)) {
          mergedTasks[id] = {
            id: task.id,
            file: relPath,
            hash: "",
            createdAt: task.createdAt || new Date().toISOString(),
            updatedAt: task.updatedAt || new Date().toISOString(),
            scheduled: task.scheduled,
            tags: task.tags.map((t) => t.name),
          }
        }
      }

      const mergedMeta: MetaFile = {
        version: nanoid(),
        tasks: mergedTasks,
        tags: mergedTags,
      }

      await fs.writeJson(newMetaPath, mergedMeta, {spaces: 2})
      await this.saveStorageRoot(newRoot)

      this.rootDir = newRoot

      await this.metaService.migrate(newRoot, true)
      await this.configService.migrate(newRoot, true)
      await this.assetsService.migrate(newRoot, true)

      console.log("✅ Merge with existing storage completed.")
      return true
    } catch (e) {
      console.error("❌ Failed to merge storage:", e)
      return false
    }
  }

  /* =============================== */
  /* =========== STORAGE =========== */
  /* =============================== */
  async getStoragePath(pretty = false): Promise<string> {
    if (!pretty) return this.rootDir

    const home = app.getPath("home")

    const isUnixLike = process.platform !== "win32"

    if (isUnixLike && this.rootDir.startsWith(home)) {
      return this.rootDir.replace(home, "~")
    }

    return this.rootDir
  }

  async selectStoragePath(removeOld = false): Promise<boolean> {
    const result = await dialog.showOpenDialog({
      title: "Select New Storage Folder",
      properties: ["openDirectory", "createDirectory"],
    })

    if (result.canceled || !result.filePaths.length) return false

    const selectedPath = result.filePaths[0]
    const isDaily = path.basename(selectedPath) === "Daily"
    const targetPath = isDaily ? selectedPath : path.join(selectedPath, "Daily")

    try {
      const currentReal = await fs.realpath(this.rootDir)
      const selectedReal = await fs.realpath(targetPath)
      if (currentReal === selectedReal) return false
    } catch (e) {
      console.warn("⚠️ Failed to resolve real paths for comparison:", e)
    }

    const hasMeta = await fs.pathExists(path.join(targetPath, ".meta.json"))
    const hasTasks =
      (await fs.pathExists(targetPath)) && (await fs.readdir(targetPath)).some((f) => f.endsWith(".md") || /^\d{4}-\d{2}-\d{2}$/.test(f))

    if (hasMeta || hasTasks) {
      const response = await dialog.showMessageBox({
        type: "warning",
        buttons: ["Use Target Data", "Use Current Data", "Merge Both", "Cancel"],
        defaultId: 2,
        cancelId: 3,
        message: "The folder already contains Daily data. What do you want to do?",
        detail:
          "You can:\n- «Use Target Data»: replace current storage with target folder data\n- «Use Current Data»: replace target folder with current storage\n- «Merge Both»: combine data from both storages",
      })

      // Use Target Data (clear current and use target)
      if (response.response === 0) {
        return await this.migrateToNewRoot(selectedPath, removeOld)
      }

      // Use Current Data (clear target and use current)
      if (response.response === 1) {
        await fs.emptyDir(targetPath)
        return await this.migrateToNewRoot(selectedPath, removeOld)
      }

      // Merge Both
      if (response.response === 2) {
        return await this.migrateWithMergeExistingStorage(selectedPath)
      }

      return false
    }

    return await this.migrateToNewRoot(selectedPath, removeOld)
  }

  private async resolveStorageRoot(): Promise<string> {
    try {
      if (await fs.pathExists(fsPaths.internalSettingsPath())) {
        const settings = await fs.readJson(fsPaths.internalSettingsPath())

        const saved = settings?.paths?.root

        if (saved) {
          try {
            if (await fs.pathExists(saved)) return saved
          } catch (e) {
            console.warn("⚠️ Saved path exists but not accessible:", saved, e)
          }
        }
      }
    } catch (e) {
      console.warn("⚠️ Failed to read settings.json:", e)
    }

    return fsPaths.defaultPath()
  }

  private async saveStorageRoot(newPath: string): Promise<void> {
    try {
      const settings = {
        paths: {root: newPath},
      }

      await fs.ensureDir(path.dirname(fsPaths.internalSettingsPath()))
      await fs.writeJson(fsPaths.internalSettingsPath(), settings, {spaces: 2})
    } catch (e) {
      console.error("❌ Failed to write settings.json:", e)
    } finally {
      this.metaService.revalidate()
      this.configService.revalidate()

      notifyStorageChange("tasks")
      notifyStorageChange("tags")
      notifyStorageChange("settings")
    }
  }

  /* =============================== */
  /* ============ TASKS =========== */
  /* =============================== */
  async loadTasks(): Promise<Task[]> {
    return this.metaService.getTasks()
  }

  async saveTasks(tasks: Task[]): Promise<void> {
    await this.metaService.saveTasks(tasks)
  }

  async deleteTask(id: ID): Promise<boolean> {
    return this.metaService.deleteTask(id)
  }

  /* =============================== */
  /* ============ TAGS =========== */
  /* =============================== */

  async loadTags(): Promise<Tag[]> {
    return this.metaService.getTags()
  }

  async saveTags(tags: Tag[]): Promise<void> {
    await this.metaService.saveTags(tags)
  }

  /* =============================== */
  /* ============ SETTINGS =========== */
  /* =============================== */
  async loadSettings(): Promise<Settings> {
    return this.configService.getSettings()
  }

  async saveSettings(newSettings: Partial<Settings>): Promise<void> {
    await this.configService.saveSettings(newSettings)
  }

  /* =============================== */
  /* ============ ASSETS =========== */
  /* =============================== */
  async saveAsset(filename: string, data: Buffer): Promise<string> {
    return this.assetsService.saveAsset(filename, data)
  }

  async deleteAsset(filename: string): Promise<void> {
    return this.assetsService.deleteAsset(filename)
  }

  async getAssetPath(filename: string): Promise<string> {
    return this.assetsService.getAssetPath(filename)
  }

  async getAssetResponse(fileUrl: string): Promise<Response> {
    return this.assetsService.getAssetResponse(fileUrl)
  }

  /* =============================== */
  /* ============ SYNC =========== */
  /* =============================== */
  async cleanupOrphanedEntries(): Promise<{removedTasks: number}> {
    return this.metaService.cleanupOrphanedEntries()
  }

  async cleanupOrphanAssets(): Promise<void> {
    try {
      const tasks = await this.loadTasks()
      const referenced = new Set<string>()

      for (const task of tasks) {
        for (const fname of extractFilenames(task.content)) {
          referenced.add(fname)
        }
      }

      const allFiles = await fs.readdir(this.assetsService.assetsDir)

      for (const file of allFiles) {
        if (!referenced.has(file)) {
          const fullPath = path.join(this.assetsService.assetsDir, file)
          await fs.unlink(fullPath)
          console.log(`🗑 Orphan asset removed: ${file}`)
        }
      }
    } catch (err) {
      console.error("Failed to cleanup orphan assets:", err)
    }
  }

  async syncStorage(): Promise<void> {
    try {
      const metaVersion = await this.metaService.getMetaVersion()
      const configVersion = await this.configService.getConfigVersion()
      console.log("🔄 Starting storage sync...", {
        metaVersion,
        configVersion,
        lastMetaVersion: this.lastMetaVersion,
        lastConfigVersion: this.lastConfigVersion,
      })

      if (metaVersion !== this.lastMetaVersion || configVersion !== this.lastConfigVersion) {
        console.log("📝 Meta or config changed, reloading data...")

        this.metaService.revalidate()
        this.configService.revalidate()

        await this.loadTasks()
        await this.loadTags()

        this.lastMetaVersion = metaVersion
        this.lastConfigVersion = configVersion

        notifyStorageChange("tasks")
        notifyStorageChange("tags")

        console.log("✅ Storage sync completed - data reloaded")
      } else {
        console.log("✅ Storage sync completed - no changes detected")
      }
    } catch (error) {
      console.error("❌ Storage sync failed:", error)
      throw error
    }
  }
}
