import type {Branch} from "@shared/types/storage"

/**
 * Render a branch as a single-line "project" label for AI tool responses.
 * Emoji + name + optional (active) marker + id, designed for LLM consumption.
 */
export function formatProject(branch: Branch, options?: {active?: boolean}): string {
  const activeLabel = options?.active ? " (active)" : ""
  return `📁 ${branch.name}${activeLabel} (ID: ${branch.id})`
}
