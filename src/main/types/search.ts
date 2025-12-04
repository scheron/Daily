import type {ISODate} from "@shared/types/common"
import type {SearchMatch} from "@shared/types/search"
import type {Task} from "@shared/types/storage"

export type SearchTask = {
  id: Task["id"]
  /** Original content for display */
  content: Task["content"]
  /** Normalized text for searching (lowercase, no markdown) */
  plainText: string
  updatedAt: Task["updatedAt"]
  date: ISODate
}

export type SearchResult = {
  task: SearchTask
  /** Relevance score from Fuse.js (lower is better) */
  score: number
  /** Match positions for highlighting */
  matches?: SearchMatch[]
}

export type SearchOptions = {
  /** Fuzziness level (0.0 = exact, 1.0 = match anything) */
  threshold?: number
  /** Maximum number of results */
  limit?: number
  /** Minimum characters to match */
  minMatchCharLength?: number
}
