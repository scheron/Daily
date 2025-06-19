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
import {app} from "electron"
import fs from "fs-extra"
import matter from "gray-matter"
import {nanoid} from "nanoid"

import type {ID, MetaFile, Settings, StorageManager, Tag, Task} from "../types"

import {deepMerge, getMimeType} from "../helpers.js"

export class FileStorageManager implements StorageManager {
  readonly rootDir: string
  readonly metaPath: string
  readonly configPath: string
  readonly assetsDir: string

  private meta: MetaFile = {version: 1, tasks: {}, tags: {}}
  private settings: Settings | null = null

  constructor() {
    this.rootDir = path.join(app.getPath("documents"), "Daily")
    this.metaPath = path.join(this.rootDir, ".meta.json")
    this.configPath = path.join(this.rootDir, ".config.json")
    this.assetsDir = path.join(this.rootDir, "assets")
  }

  async init(): Promise<void> {
    await fs.ensureDir(this.rootDir)
    await fs.ensureDir(this.assetsDir)

    // SETTINGS (config.json)
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
          paths: {root: this.rootDir},
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

  async deleteTask(id: ID): Promise<void> {
    const meta = this.meta.tasks[id]
    if (!meta) return

    const filePath = path.join(this.rootDir, meta.file)

    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath)
    }

    delete this.meta.tasks[id]

    await this.persistMeta()
  }

  /* =============================== */
  /* ============ TAGS ============ */
  /* =============================== */
  async loadTags(): Promise<Tag[]> {
    return Object.values(this.meta.tags)
  }

  async saveTags(tags: Tag[]): Promise<void> {
    this.meta.tags = tags.reduce(
      (acc, tag) => {
        acc[tag.id] = tag
        return acc
      },
      {} as MetaFile["tags"],
    )

    await this.persistMeta()
  }

  /* =============================== */
  /* ============ SETTINGS ============ */
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
}
