import type {Tag} from "../../types/storage"

/**
 * Normalizes a raw tag name for storage and comparison: trims the edges and
 * collapses internal whitespace runs into a single space. Spaces are preserved,
 * so multi-word tag names are allowed.
 *
 * @example
 * normalizeTagName("  in   progress ") // "in progress"
 */
export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ")
}

/**
 * Whether a tag name is acceptable: non-empty once normalized.
 *
 * @example
 * isValidTagName("in progress") // true
 * isValidTagName("   ")         // false
 */
export function isValidTagName(name: string): boolean {
  return normalizeTagName(name).length > 0
}

/**
 * Finds an existing tag whose name matches the given name, case-insensitively
 * and after normalization. Used to prevent duplicates and to decide whether an
 * inline "create" affordance should appear.
 *
 * @example
 * findTagByName(tags, " Design ") // the "Design" tag, if present
 */
export function findTagByName(tags: Tag[], name: string): Tag | null {
  const normalized = normalizeTagName(name).toLowerCase()
  return tags.find((tag) => normalizeTagName(tag.name).toLowerCase() === normalized) ?? null
}
