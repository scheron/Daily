import type {Branch, Task} from "./storage"

/**
 * Match information for highlighting
 * Indicates where in the text the match occurred
 */
export type SearchMatch = {
  /** Array of [start, end] positions in the original content */
  indices: [number, number][]
  /** The matched text */
  value: string
  /** The field that was matched (e.g., "plainText") */
  key: string
}

/**
 * Task search result with match information
 */
export type TaskSearchResult = {
  /** Full task with enriched tags */
  task: Task
  /** Branch where this task is located */
  branch: Branch | null
  /** Match positions in the original content */
  matches?: SearchMatch[]
  /** Relevance score (lower is better) */
  score: number
}
