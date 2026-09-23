import {buildFileLinkPattern} from "./buildFileLinkPattern"

/**
 * Extract file IDs from content
 * Example: ![alt](daily://file/abc123) → extract ["abc123"]
 * @param content Markdown content that may contain file references
 * @returns Array of file IDs (without protocol prefix)
 */
export function extractFileIds(content: string): string[] {
  const fileIds = new Set<string>()
  const regex = buildFileLinkPattern()

  for (const match of content.matchAll(regex)) {
    fileIds.add(match[1])
  }

  return Array.from(fileIds)
}
