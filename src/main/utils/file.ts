import {APP_CONFIG} from "../config.js"

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

/**
 * Extract file IDs from content
 * Example: ![alt](daily://file/abc123) → extract ["abc123"]
 * @param content Markdown content that may contain file references
 * @returns Array of file IDs (without protocol prefix)
 */
export function extractFileIds(content: string): string[] {
  const fileIds = new Set<string>()

  const escapedProtocol = APP_CONFIG.filesProtocol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`!\\[[^\\]]*\\]\\(\\s*${escapedProtocol}\\/([a-zA-Z0-9_-]+)\\s*\\)`, "g")
  
  for (const match of content.matchAll(regex)) {
    fileIds.add(match[1])
  }

  return Array.from(fileIds)
}