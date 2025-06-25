import {createHash} from "node:crypto"
import path from "node:path"
import fs from "fs-extra"
import matter from "gray-matter"
import {nanoid} from "nanoid"

import type {ID, MetaFile, Tag, Task} from "../../types"

import {arrayRemoveDuplicates} from "../../helpers.js"
import {CACHE_TTL, createCacheLoader} from "../utils/cache.js"
import {fsPaths} from "../utils/fsPaths.js"

/*
 * Работаем с файлом .meta.json
 * Если в течении 2 минут файл не изменился, то возвращаем кэш
 * Если файл изменился, то обновляем кэш
 * Все обращения к задачам и тегам обращаемся к кешу
 */

export class MetaService {
  private metaPath: string
  private metaCache = createCacheLoader(() => this.readMetaFile(), CACHE_TTL)

  constructor(private readonly rootDir: string) {
    this.metaPath = fsPaths.metaFile(this.rootDir)
  }

  async init(): Promise<void> {
    const meta = await this.readMetaFile()

    for (const task of Object.values(meta.tasks)) {
      const dir = path.dirname(fsPaths.taskFile(this.rootDir, task.file))
      await fs.ensureDir(dir)
    }
  }

  async migrate(newRoot: string, removeOldDir = false): Promise<void> {
    const meta = await this.readMetaFile()
    const newMetaPath = fsPaths.metaFile(newRoot)

    await fs.ensureDir(newRoot)

    await fs.writeJson(newMetaPath, meta, {spaces: 2})

    this.metaPath = newMetaPath

    if (removeOldDir) await fs.remove(this.metaPath)
  }

  async revalidate(): Promise<void> {
    this.metaCache.clear()
  }

  async getMetaVersion(): Promise<string> {
    return await this.readMetaVersion()
  }

  async getTasks(): Promise<Task[]> {
    const meta = await this.getMeta()

    const result: Task[] = []
    const tasksToRemove: string[] = []

    for (const taskId in meta.tasks) {
      const taskMeta = meta.tasks[taskId]

      const fullPath = fsPaths.taskFile(this.rootDir, taskMeta.file)

      if (!(await fs.pathExists(fullPath))) {
        console.warn(`⚠️ Task file missing: ${fullPath}`)
        tasksToRemove.push(taskId)
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
          tasksToRemove.push(taskId)
          continue
        }

        const tags: Tag[] = (front.tags || []).map((name: string) => Object.values(meta.tags).find((t) => t.name === name)).filter(Boolean) as Tag[]

        const task: Task = {
          ...taskMeta,
          status: front.status?.toLowerCase() ?? "active",
          content,
          tags,
        }

        result.push(task)
      } catch (err) {
        console.error(`❌ Failed to parse task file ${fullPath}:`, err)
        tasksToRemove.push(taskId)
      }
    }

    if (tasksToRemove.length > 0) {
      console.log(`🧹 Removing ${tasksToRemove.length} orphaned task entries from .meta.json:`, tasksToRemove)

      for (const taskId of tasksToRemove) {
        delete meta.tasks[taskId]
      }

      await this.persistMeta(meta)
    }

    return result
  }

  async getTags(): Promise<Tag[]> {
    const meta = await this.getMeta()
    return Object.values(meta.tags)
  }

  async saveTasks(tasks: Task[]): Promise<void> {
    const meta = await this.getMeta()

    for (const task of tasks) {
      const dayFolder = fsPaths.dayFolder(this.rootDir, task.scheduled.date)

      await fs.ensureDir(dayFolder)

      const filename = `${task.id}.md`
      const filePath = fsPaths.taskFile(dayFolder, filename)

      const frontmatter = {
        id: task.id,
        date: task.scheduled.date,
        status: task.status,
        tags: task.tags.map((t) => t.name),
      }

      const content = matter.stringify(task.content.trim(), frontmatter)

      await fs.writeFile(filePath, content, "utf-8")

      const hash = createHash("sha256").update(content).digest("hex")

      meta.tasks[task.id] = {
        id: task.id,
        file: path.relative(this.rootDir, filePath),
        hash,
        createdAt: task?.createdAt ?? new Date().toISOString(),
        updatedAt: task?.updatedAt ?? new Date().toISOString(),
        scheduled: task.scheduled,
        tags: task.tags.map((t) => t.name),
      }
    }

    await this.persistMeta(meta)
  }

  async saveTags(tags: Tag[]): Promise<void> {
    const meta = await this.getMeta()

    meta.tags = arrayRemoveDuplicates(tags, "name").reduce(
      (acc, tag) => {
        acc[tag.name] = tag
        return acc
      },
      {} as MetaFile["tags"],
    )

    await this.persistMeta(meta)
  }

  async deleteTask(id: ID): Promise<boolean> {
    try {
      const meta = await this.getMeta()

      const taskMeta = meta.tasks[id]
      if (!taskMeta) return false

      const filePath = fsPaths.taskFile(this.rootDir, taskMeta.file)
      const dayFolder = path.dirname(filePath)

      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath)
      }

      const files = await fs.readdir(dayFolder)

      if (!files.length && dayFolder.startsWith(this.rootDir)) {
        await fs.remove(dayFolder)
      }

      delete meta.tasks[id]
      await this.persistMeta(meta)

      return true
    } catch (error) {
      console.error("❌ Failed to delete task:", error)
      return false
    }
  }

  async cleanupOrphanedEntries(): Promise<{removedTasks: number}> {
    console.log("🧹 Starting cleanup of orphaned task entries...")

    const meta = await this.getMeta()
    const tasks = await this.getTasks()

    const initialTaskCount = Object.keys(meta.tasks).length
    const removedTasks = initialTaskCount - tasks.length

    console.log(`✅ Cleanup completed: removed ${removedTasks} orphaned task entries`)

    return {removedTasks}
  }

  private async persistMeta(meta: MetaFile): Promise<void> {
    meta.version = nanoid()

    await fs.writeJson(this.metaPath, meta, {spaces: 2})

    this.metaCache.clear()

    for (const entry of Object.values(meta.tasks)) {
      const dir = path.dirname(fsPaths.taskFile(this.rootDir, entry.file))
      await fs.ensureDir(dir)
    }
  }

  private async getMeta(): Promise<MetaFile> {
    return this.metaCache.get()
  }

  // ===============================
  // ========= RAW DATA ===========
  // ===============================

  /**
   * Raw meant we don't use the cache here.
   * Reads the raw .meta.json from disk, creating it if missing or invalid.
   */
  // TODO REFACTOR
  private async readMetaFile(): Promise<MetaFile> {
    const initial: MetaFile = {
      version: nanoid(),
      tasks: {},
      tags: {},
    }

    if (!(await fs.pathExists(this.metaPath))) {
      await fs.writeJson(this.metaPath, initial, {spaces: 2})
      return initial
    }

    try {
      const raw = (await fs.readJson(this.metaPath)) as MetaFile

      if (!raw.tasks || !raw.tags) throw new Error("Invalid .meta.json")

      return raw
    } catch {
      console.warn("⚠️ Invalid .meta.json, recreating initial structure")

      await fs.writeJson(this.metaPath, initial, {spaces: 2})
      return initial
    }
  }

  /**
   * Returns the version string for change detection.
   * No cache is used here, as we want to read the version from disk every time.
   */
  private async readMetaVersion(): Promise<string> {
    return (await this.readMetaFile()).version
  }
}
