import type {Task} from "./storage"

/**
 * Match information for highlighting
 * Indicates where in the text the match occurred
 */
export type SearchMatch = {
  indices: [number, number][] // Array of [start, end] positions in the original content
  value: string // The matched text
  key: string // The field that was matched (e.g., "plainText")
}

/**
 * Task search result with match information
 */
export type TaskSearchResult = {
  task: Task // Full task with enriched tags
  matches?: SearchMatch[] // Match positions in the original content
  score: number // Relevance score (lower is better)
}
