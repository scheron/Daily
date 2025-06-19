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
