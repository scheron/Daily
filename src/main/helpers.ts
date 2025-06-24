import path from "node:path"
import fs from "fs-extra"

import type {BrowserWindow} from "electron"
import type {StorageManager} from "./types"

function extractFilenames(content: string): string[] {
  // Match both formats:
  // ![alt](filename.ext) - clean format
  // ![alt](safe-file://filename.ext) - with protocol
  const patterns = [
    /!\[[^\]]*\]\(\s*safe-file:\/\/([^)\s]+)\s*\)/g, // with safe-file:// prefix
    /!\[[^\]]*\]\(\s*(?!(?:https?|data|temp|safe-file):)([^)\s]+)\s*\)/g, // without protocol
  ]

  const filenames = new Set<string>()
  for (const re of patterns) {
    for (const match of content.matchAll(re)) {
      filenames.add(match[1])
    }
  }

  return Array.from(filenames)
}

export async function cleanupOrphanAssets(storage: StorageManager) {
  try {
    const tasks = await storage.loadTasks()
    const referenced = new Set<string>()

    for (const task of tasks) {
      for (const fname of extractFilenames(task.content)) {
        referenced.add(fname)
      }
    }

    const allFiles = await fs.readdir(storage.assetsDir)

    for (const file of allFiles) {
      if (!referenced.has(file)) {
        const fullPath = path.join(storage.assetsDir, file)
        await fs.unlink(fullPath)
        console.log(`🗑 Orphan asset removed: ${file}`)
      }
    }
  } catch (err) {
    console.error("Failed to cleanup orphan assets:", err)
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function focusWindow(win: BrowserWindow) {
  if (win.isMinimized()) win.restore()
  win.focus()
}

export function getMimeType(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png":
      return "image/png"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "webp":
      return "image/webp"
    case "gif":
      return "image/gif"
    case "svg":
      return "image/svg+xml"
    default:
      return "application/octet-stream"
  }
}

export function stripHtml(html: string): string {
  if (!html) return ""
  return html
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

export function deepMerge<T>(target: T, source: Partial<T>, getId: (data: any) => any = (data: any) => data.id): T {
  try {
    if (!source) return target
    if (!target) return source as T

    if (Array.isArray(target) && Array.isArray(source)) {
      const hasIds = source.every((item) => isMergeableObject(item) && getId(item) !== undefined)

      if (hasIds) {
        const targetMap = new Map(target.filter(isMergeableObject).map((item) => [getId(item), item]))

        source.forEach((srcItem) => {
          const srcId = getId(srcItem)
          const targetItem = targetMap.get(srcId)

          if (targetItem) deepMerge(targetItem, srcItem, getId)
          else target.push(srcItem as any)
        })

        return target
      }

      return source as unknown as T
    }

    if (isMergeableObject(target) && isMergeableObject(source)) {
      for (const key in source) {
        const value = source[key]
        const targetValue = (target as any)[key]

        const canMerge =
          targetValue && (isMergeableObject(targetValue) || Array.isArray(targetValue)) && (isMergeableObject(value) || Array.isArray(value))

        if (canMerge) {
          ;(target as any)[key] = deepMerge(targetValue, value, getId)
        } else {
          ;(target as any)[key] = value
        }
      }
      return target
    }

    return source as unknown as T
  } catch (error) {
    console.error("Error in deepMerge:", error)
    return target
  }
}

function isMergeableObject(item: any): item is Record<string, any> {
  return item !== null && typeof item === "object" && !Array.isArray(item)
}

export function arrayRemoveDuplicates<T extends Record<K, string>, K extends keyof T>(array: T[], key: K): T[] {
  const seen = new Set<string>()

  return array.filter((item) => {
    const value = item[key]

    if (seen.has(value)) return false

    seen.add(value)

    return true
  })
}

export type Loader<T> = () => Promise<T>
/**
 * Creates a caching wrapper around an async loader function with TTL expiry
 * @param loader - Async function that loads the data to be cached
 * @param ttlMs - Time-to-live in milliseconds for cached values
 * @returns Object with get() method to retrieve cached/fresh data and clear() to reset cache
 * @template T - Type of the value being cached
 */
export function createCacheLoader<T>(loader: Loader<T>, ttlMs: number) {
  let cache: {value: T; expiry: number} | null = null
  let inFlight: Promise<T> | null = null

  return {
    async get(): Promise<T> {
      const now = Date.now()

      if (cache && now < cache.expiry) {
        console.log("🔄 Using cached data", cache.value)
        return cache.value
      }

      if (!inFlight) {
        console.log("🔄 Loading fresh data")
        inFlight = loader().then((value) => {
          cache = {value, expiry: now + ttlMs}
          inFlight = null
          return value
        })
      }
      return inFlight
    },
    clear() {
      cache = null
      inFlight = null
    },
  }
}
