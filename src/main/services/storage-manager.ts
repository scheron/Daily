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

import {createHash} from "node:crypto"
import path from "node:path"
import {app, dialog} from "electron"
import fs from "fs-extra"
import matter from "gray-matter"
import {nanoid} from "nanoid"

import type {ID, MetaFile, Settings, StorageManager, Tag, Task} from "../types"

import {arrayRemoveDuplicates, deepMerge, getMimeType} from "../helpers.js"
import {notifyStorageChange} from "./storage-events.js"

export class FileStorageManager implements StorageManager {
  rootDir: string
  metaPath: string
  configPath: string
  assetsDir: string

  private meta: MetaFile = {version: 1, tasks: {}, tags: {}}
  private settings: Settings | null = null
  private readonly appSettingsPath = path.join(app.getPath("userData"), "settings.json")

  constructor() {
    this.rootDir = this.resolveStorageRoot()
    this.metaPath = path.join(this.rootDir, ".meta.json")
    this.configPath = path.join(this.rootDir, ".config.json")
    this.assetsDir = path.join(this.rootDir, "assets")
  }

  async init(): Promise<void> {
    await fs.ensureDir(this.rootDir)
    await fs.ensureDir(this.assetsDir)

    // SETTINGS (.config.json)
    if (!(await fs.pathExists(this.configPath))) {
      await fs.writeJson(
        this.configPath,
        {
          themes: {
            current: "github-light",
            preferred_light: "github-light",
            preferred_dark: "github-dark",
            use_system: true,
          },
          sidebar: {collapsed: false},
        },
        {spaces: 2},
      )
    }

    // STORAGE (meta.json)
    if (await fs.pathExists(this.metaPath)) {
      try {
        const raw = await fs.readJson(this.metaPath)
        if (raw.version === 1 && raw.tasks && raw.tags) {
          this.meta = raw as MetaFile
        } else {
          console.warn("Invalid meta.json structure. Reinitializing.")
        }
      } catch (err) {
        console.warn("⚠️ Failed to read .meta.json, recreating:", err)
      }
    }

    for (const task of Object.values(this.meta.tasks)) {
      const dir = path.dirname(path.join(this.rootDir, task.file))
      await fs.ensureDir(dir)
    }

    await this.syncFileSystemWithMeta()
  }

  /* =============================== */
  /* ============ TASKS ============ */
  /* =============================== */
  async loadTasks(): Promise<Task[]> {
    const result: Task[] = []

    for (const taskId in this.meta.tasks) {
      const meta = this.meta.tasks[taskId]
      const fullPath = path.join(this.rootDir, meta.file)

      if (!(await fs.pathExists(fullPath))) {
        console.warn(`⚠️ Task file missing: ${fullPath}`)
        continue
      }

      try {
        const raw = await fs.readFile(fullPath, "utf-8")
        const parsed = matter(raw)

        const front = parsed.data ?? {}
        const content = parsed.content?.trim() || ""
        const validStatuses = ["active", "done", "discarded"]

        if (!validStatuses.includes(front.status?.toLowerCase())) {
          console.warn(`⚠️ Invalid or missing status in task ${taskId}, skipping.`)
          continue
        }

        const tags: Tag[] = (front.tags || [])
          .map((name: string) => Object.values(this.meta.tags).find((t) => t.name === name))
          .filter(Boolean) as Tag[]

        const task: Task = {
          ...meta,
          status: front.status?.toLowerCase() ?? "active",
          content,
          tags,
        }

        result.push(task)
      } catch (err) {
        console.error(`❌ Failed to parse task file ${fullPath}:`, err)
      }
    }

    return result
  }

  async saveTasks(tasks: Task[]): Promise<void> {
    for (const task of tasks) {
      await this.saveTask(task)
    }

    await this.persistMeta()
  }

  async saveTask(task: Task): Promise<void> {
    const dayFolder = path.join(this.rootDir, task.scheduled.date)
    await fs.ensureDir(dayFolder)

    const filename = `${task.id}.md`
    const filePath = path.join(dayFolder, filename)

    const frontmatter = {
      id: task.id,
      date: task.scheduled.date,
      status: task.status,
      tags: task.tags.map((t) => t.name),
    }

    const content = matter.stringify(task.content.trim(), frontmatter)

    await fs.writeFile(filePath, content, "utf-8")

    const hash = createHash("sha256").update(content).digest("hex")

    this.meta.tasks[task.id] = {
      id: task.id,
      file: path.relative(this.rootDir, filePath),
      hash,
      createdAt: task?.createdAt ?? new Date().toISOString(),
      updatedAt: task?.updatedAt ?? new Date().toISOString(),
      scheduled: task.scheduled,
      tagIds: task.tags.map((t) => t.id),
    }
  }

  async deleteTask(id: ID): Promise<boolean> {
    try {
      const meta = this.meta.tasks[id]
      if (!meta) return false

      const filePath = path.join(this.rootDir, meta.file)
      const dayFolder = path.dirname(filePath)

      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath)
      }

      const files = await fs.readdir(dayFolder)
      if (!files.length && dayFolder.startsWith(this.rootDir)) {
        await fs.remove(dayFolder)
      }

      delete this.meta.tasks[id]
      await this.persistMeta()
      return true
    } catch (error) {
      console.error("❌ Failed to delete task:", error)
      return false
    }
  }

  /* =============================== */
  /* ============ TAGS ============ */
  /* =============================== */
  async loadTags(): Promise<Tag[]> {
    return Object.values(this.meta.tags)
  }

  async saveTags(tags: Tag[]): Promise<void> {
    this.meta.tags = arrayRemoveDuplicates(tags, "name").reduce(
      (acc, tag) => {
        acc[tag.id] = tag
        return acc
      },
      {} as MetaFile["tags"],
    )

    await this.persistMeta()
  }

  /* =============================== */
  /* =========== SETTINGS ========== */
  /* =============================== */
  async loadSettings(): Promise<Settings> {
    if (!this.settings) {
      this.settings = (await fs.readJson(this.configPath)) as Settings
    }
    return this.settings
  }

  async saveSettings(newSettings: Partial<Settings>): Promise<void> {
    const current = await this.loadSettings()
    const merged = deepMerge(current, newSettings)

    this.settings = merged
    await fs.writeJson(this.configPath, merged, {spaces: 2})
  }

  /* =============================== */
  /* ============ ASSETS =========== */
  /* =============================== */
  async saveAsset(filename: string, data: Buffer): Promise<string> {
    await fs.ensureDir(this.assetsDir)

    const ext = path.extname(filename)
    const uniqueFilename = `${nanoid()}${ext}`
    const filePath = path.join(this.assetsDir, uniqueFilename)

    await fs.writeFile(filePath, data)

    return uniqueFilename
  }

  async deleteAsset(filename: string): Promise<void> {
    const filePath = path.join(this.assetsDir, filename)
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath)
    }
  }

  async getAssetPath(filename: string): Promise<string> {
    return path.join(this.assetsDir, filename)
  }

  async getAssetResponse(fileUrl: string): Promise<Response> {
    const filePath = path.join(this.assetsDir, decodeURIComponent(fileUrl))

    try {
      const data = await fs.readFile(filePath)
      const extension = path.extname(filePath).slice(1)
      const mime = getMimeType(extension)

      return new Response(data as any, {headers: {"Content-Type": mime}})
    } catch (e) {
      console.error("❌ Failed to load asset:", filePath, e)
      return new Response("Not Found", {status: 404})
    }
  }

  private async persistMeta(): Promise<void> {
    await fs.writeJson(this.metaPath, this.meta, {spaces: 2})
  }

  /* =============================== */
  /* ============ SYNC =========== */
  /* =============================== */
  async syncFileSystemWithMeta(): Promise<void> {
    const existingIds = Object.keys(this.meta.tasks)
    const toRemove: string[] = []

    for (const id of existingIds) {
      const relPath = this.meta.tasks[id].file
      const fullPath = path.join(this.rootDir, relPath)

      if (!(await fs.pathExists(fullPath))) {
        console.warn(`⚠️ Missing task file for ID ${id}: ${relPath}`)
        toRemove.push(id)
      }
    }

    if (toRemove.length > 0) {
      for (const id of toRemove) {
        delete this.meta.tasks[id]
      }

      await this.persistMeta()
      console.log(`🧹 Removed ${toRemove.length} orphaned tasks from meta`)
      notifyStorageChange("tasks")
      notifyStorageChange("tags")
    }
  }

  /* =============================== */
  /* ============ PATHS =========== */
  /* =============================== */
  /**
   * Migrates the entire Daily storage to a new directory.
   * Copies all files, updates paths, and optionally removes the old directory.
   * @param newPath - Absolute path to the new root directory.
   * @param deleteOld - If true, the old directory will be deleted after migration.
   * @returns true if migration succeeded, false otherwise.
   */
  private async migrateToNewRoot(selectedPath: string, removeOldDir = false): Promise<boolean> {
    const originalRoot = this.rootDir

    try {
      const isDaily = path.basename(selectedPath) === "Daily"
      const newRoot = isDaily ? selectedPath : path.join(selectedPath, "Daily")

      if (newRoot === this.rootDir) return false

      console.log("📦 Starting migration to:", newRoot)

      const newMetaPath = path.join(newRoot, ".meta.json")
      const newConfigPath = path.join(newRoot, ".config.json")
      const newAssetsDir = path.join(newRoot, "assets")

      await fs.ensureDir(newRoot)

      for (const file of await fs.readdir(this.rootDir)) {
        const from = path.join(this.rootDir, file)
        const to = path.join(newRoot, file)
        await fs.copy(from, to)
      }

      for (const task of Object.values(this.meta.tasks)) {
        const absoluteOld = path.resolve(originalRoot, task.file)
        const newRel = path.relative(newRoot, absoluteOld)
        task.file = newRel
      }

      this.rootDir = newRoot
      this.metaPath = newMetaPath
      this.configPath = newConfigPath
      this.assetsDir = newAssetsDir

      await this.persistMeta()
      await this.saveStorageRoot(newRoot)

      if (removeOldDir) {
        console.log("🧹 Removing old directory:", originalRoot)
        await fs.remove(originalRoot)
      }

      console.log("✅ Migration completed.")
      return true
    } catch (error) {
      // NOTE: Rollback to original state
      console.error("❌ Migration failed:", error)
      this.rootDir = originalRoot
      this.metaPath = path.join(originalRoot, ".meta.json")
      this.configPath = path.join(originalRoot, ".config.json")
      this.assetsDir = path.join(originalRoot, "assets")
      return false
    }
  }

  async mergeWithExistingStorage(selectedPath: string): Promise<boolean> {
    const isDaily = path.basename(selectedPath) === "Daily"
    const newRoot = isDaily ? selectedPath : path.join(selectedPath, "Daily")
    const newMetaPath = path.join(newRoot, ".meta.json")

    try {
      const existingMeta: MetaFile = (await fs.readJson(newMetaPath).catch(() => ({
        version: 1,
        tasks: {},
        tags: {},
      }))) as MetaFile

      for (const task of Object.values(this.meta.tasks)) {
        const id = task.id

        const originalPath = path.resolve(this.rootDir, task.file)
        const dayFolder = path.join(newRoot, task.scheduled.date)
        await fs.ensureDir(dayFolder)

        const newFilename = `${id}.md`
        const targetPath = path.join(dayFolder, newFilename)
        await fs.copy(originalPath, targetPath)

        const relPath = path.relative(newRoot, targetPath)

        existingMeta.tasks[id] = {...task, file: relPath}
      }

      await fs.writeJson(newMetaPath, existingMeta, {spaces: 2})
      await this.saveStorageRoot(newRoot)

      this.rootDir = newRoot
      this.metaPath = newMetaPath
      this.configPath = path.join(newRoot, ".config.json")
      this.assetsDir = path.join(newRoot, "assets")
      this.meta = existingMeta

      console.log("✅ Merge with existing storage completed.")
      return true
    } catch (e) {
      console.error("❌ Failed to merge storage:", e)
      return false
    }
  }

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

    if (targetPath === this.rootDir) return false

    const hasMeta = await fs.pathExists(path.join(targetPath, ".meta.json"))
    const hasTasks =
      (await fs.pathExists(targetPath)) && (await fs.readdir(targetPath)).some((f) => f.endsWith(".md") || /^\d{4}-\d{2}-\d{2}$/.test(f))

    if (hasMeta || hasTasks) {
      const response = await dialog.showMessageBox({
        type: "warning",
        buttons: ["Replace", "Merge", "Cancel"],
        defaultId: 1,
        cancelId: 2,
        message: "The folder already contains Daily data. What do you want to do?",
        detail: "You can:\n- «Replace»: clear the folder and write your tasks\n- «Merge»: load existing and add your own",
      })

      // Replace
      if (response.response === 0) {
        await fs.emptyDir(targetPath)
        return await this.migrateToNewRoot(selectedPath, true)
      }

      // Merge
      if (response.response === 1) {
        return await this.mergeWithExistingStorage(selectedPath)
      }

      return false
    }

    return await this.migrateToNewRoot(selectedPath, removeOld)
  }

  /**
   * Resolves the actual Daily root
   * - If found, returns it.
   * - Otherwise, returns the default Documents/Daily
   */
  private resolveStorageRoot(): string {
    const defaultPath = path.join(app.getPath("documents"), "Daily")

    try {
      if (fs.existsSync(this.appSettingsPath)) {
        const settings = fs.readJsonSync(this.appSettingsPath)
        const saved = settings?.paths?.root
        if (saved && fs.existsSync(saved)) return saved
      }
    } catch (e) {
      console.warn("⚠️ Failed to read settings.json:", e)
    }

    return defaultPath
  }

  private async saveStorageRoot(newPath: string): Promise<void> {
    try {
      const settings = {paths: {root: newPath}}
      await fs.ensureDir(path.dirname(this.appSettingsPath))
      await fs.writeJson(this.appSettingsPath, settings, {spaces: 2})
    } catch (e) {
      console.error("❌ Failed to write settings.json:", e)
    }
  }
}
