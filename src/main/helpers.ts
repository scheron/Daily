import path from "node:path"
import fs from "fs-extra"

import type {StorageManager} from "./services/storage-manager"
import type { BrowserWindow } from "electron"

function extractFilenames(content: string): string[] {
  // Match both formats:
  // ![alt](filename.ext) - clean format
  // ![alt](safe-file://filename.ext) - with protocol
  const patterns = [
    /!\[[^\]]*\]\(\s*safe-file:\/\/([^)\s]+)\s*\)/g,  // with safe-file:// prefix
    /!\[[^\]]*\]\(\s*(?!(?:https?|data|temp|safe-file):)([^)\s]+)\s*\)/g  // without protocol
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