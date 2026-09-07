export type ChangedEntityType = "task" | "tag" | "project" | "file"
export type ChangedEntityAction = "created" | "updated" | "deleted" | "restored" | "moved"

export type ChangedEntity = {
  type: ChangedEntityType
  id: string
  action: ChangedEntityAction
}

export type ToolResult = {
  success: boolean
  /** Model- and UI-friendly one-line description of the outcome. Falls back to data/error if absent. */
  summary?: string
  /** Optional structured payload — read tools may carry typed data here. */
  data?: unknown
  /** Entities the tool actually touched. Used by Phase 7 events and Phase 8 compaction. */
  changedEntities?: ChangedEntity[]
  error?: string
}

export type ToolParams = Record<string, unknown>
