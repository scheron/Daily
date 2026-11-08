import {APP_CONFIG} from "@daily/protocol"

/**
 * Returns the distinct file IDs from markdown image links, in first appearance order.
 * @example extractFileIds("![alt](daily://file/abc123)") // ["abc123"]
 */
export function extractFileIds(content: string): string[] {
  const fileIds = new Set<string>()
  const protocol = APP_CONFIG.filesProtocol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`!\\[[^\\]]*\\]\\(\\s*${protocol}\\/([a-zA-Z0-9_-]+)\\s*\\)`, "g")

  for (const match of content.matchAll(regex)) {
    fileIds.add(match[1])
  }

  return Array.from(fileIds)
}
