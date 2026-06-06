import type {ToolResult} from "@/ai/tools/types"
import type {Tool} from "@/ai/types"
import type {StorageController} from "@/storage/StorageController"

export type ToolParameters = Tool["function"]["parameters"]

/**
 * Who invoked the tool. Determines downstream confirmation policy in Phase 3.
 *
 * - "in-app": the built-in Daily AI assistant. Phase 3's policy hook will
 *   suspend on isDestructive tools until the user explicitly confirms
 *   in Daily UI (modal card + Promise-based wait, see roadmap Phase 3).
 *
 * - "mcp": an external MCP client (Claude Desktop, Telegram bot, etc).
 *   The client is responsible for getting user confirmation on its OWN
 *   surface before sending the call. Daily passes the request through
 *   without suspending — the user has already agreed somewhere outside.
 *
 * Phase 2 just plumbs this field through; the policy hook that reads it
 * lands in Phase 3.
 */
export type ToolCaller = "in-app" | "mcp"

export type ToolExecutionContext = {
  storage: StorageController
  now: () => Date
  caller: ToolCaller
}

export type RegisteredTool<TParams = Record<string, unknown>> = {
  name: string
  description: string
  parameters: ToolParameters
  /**
   * The tool modifies state (writes to SQLite, mutates settings).
   * Read-only tools have isWrite = false.
   */
  isWrite: boolean
  /**
   * The tool is destructive in a way that warrants explicit user
   * confirmation. Soft-delete tools (delete_task, delete_tag, delete_project)
   * still set this true even though recoverable — the user should know
   * before the action.
   *
   * Confirmation happens on the caller's surface: Daily UI for "in-app",
   * client's UI for "mcp" (see ToolCaller).
   */
  isDestructive: boolean
  /** Optional compact metadata for smaller models (medium/tiny prompt tiers). */
  compactDescription?: string
  compactParameters?: ToolParameters

  execute(params: TParams, ctx: ToolExecutionContext): Promise<ToolResult>
}
