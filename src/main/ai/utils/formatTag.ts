import type {Tag} from "@shared/types/storage"

/**
 * Render a tag as a single-line label for AI tool responses.
 * Emoji + name + color + id, designed for LLM consumption.
 */
export function formatTag(tag: Tag): string {
  return `🏷️ ${tag.name} (color: ${tag.color}, ID: ${tag.id})`
}
