import toolsCompactRaw from "./tools-compact.jsonl?raw"
import toolsRaw from "./tools.jsonl?raw"

import type {Tool} from "../types"

function parseToolsJsonl(content: string): Tool[] {
  return content
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Tool)
}

export const AI_TOOLS: Tool[] = parseToolsJsonl(toolsRaw)

export const AI_TOOLS_COMPACT: Tool[] = parseToolsJsonl(toolsCompactRaw)

export type ToolName =
  // Tasks
  | "list_tasks"
  | "get_task"
  | "create_task"
  | "update_task"
  | "complete_task"
  | "discard_task"
  | "reactivate_task"
  | "delete_task"
  | "get_deleted_tasks"
  | "restore_task"
  | "permanently_delete_task"
  | "add_task_tags"
  | "remove_task_tags"
  | "search_tasks"
  | "move_task"
  // Time tracking
  | "log_time"
  // Day overview
  | "get_day_summary"
  // Attachments
  | "get_task_attachments"
  | "remove_task_attachment"
  // Tags
  | "list_tags"
  | "get_tag"
  | "create_tag"
  | "update_tag"
  | "delete_tag"
