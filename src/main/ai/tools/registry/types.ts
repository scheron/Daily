import type {ToolResult} from "@/ai/tools/types"
import type {Tool} from "@/ai/types"
import type {StorageController} from "@/storage/StorageController"

export type ToolParameters = Tool["function"]["parameters"]

/**
 * Who invoked the tool. The built-in Daily AI assistant suspends on
 * isDestructive tools until the user explicitly confirms in Daily UI
 * (modal card + Promise-based wait).
 */
export type ToolCaller = "in-app"

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
   */
  isDestructive: boolean
  /** Optional compact metadata for smaller models (medium/tiny prompt tiers). */
  compactDescription?: string
  compactParameters?: ToolParameters

  execute(params: TParams, ctx: ToolExecutionContext): Promise<ToolResult>
}
