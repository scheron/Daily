import {APP_CONFIG} from "@daily/protocol"

/**
 * Remove one file's markdown-image link from content, the same link format `extractFileIds` reads.
 * Example: removeFileLink("Shot ![shot](daily://file/abc123)", "abc123") → "Shot"
 * @param content Markdown content that may contain the file's link
 * @param fileId The id of the file whose link should be removed
 * @returns `content` with that link removed
 */
export function removeFileLink(content: string, fileId: string): string {
  const escapedProtocol = APP_CONFIG.filesProtocol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`!\\[[^\\]]*\\]\\(\\s*${escapedProtocol}\\/${fileId}\\s*\\)`, "g")

  return content.replace(pattern, "").trim()
}
