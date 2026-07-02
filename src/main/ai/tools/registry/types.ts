import type {ToolResult} from "@/ai/tools/types"
import type {Tool} from "@/ai/types"
import type {CachedPage} from "@/ai/web/types"
import type {StorageController} from "@/storage/StorageController"
import type {LRU} from "@shared/utils/common/LRU"

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
  /** How much fetched page text may enter the model context (scaled to the model). */
  webRead?: {windowChars: number; maxServedChars: number}
  /** Page cache owned by the tool invoker, so read_url can serve windowed reads without re-fetching. */
  pageCache?: LRU<string, CachedPage>
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
  /**
   * The tool sends a request off the machine (network egress). Like
   * isDestructive, it suspends on user confirmation so the exact outbound
   * target is shown before anything leaves. Read-side tools that fetch
   * external URLs set this true.
   */
  isExternalEgress?: boolean
  /**
   * For an isExternalEgress tool: whether THIS specific call will actually leave
   * the machine. Returns false when it can be served locally (e.g. from cache),
   * letting the policy hook skip confirmation since no request goes out.
   * Absent ⇒ assume it always egresses. Receives the invoker's page cache so a
   * cache-hit can be detected without a module-global.
   */
  willEgress?(params: TParams, pageCache: LRU<string, CachedPage>): boolean
  /** Optional compact metadata for smaller models (medium/tiny prompt tiers). */
  compactDescription?: string
  compactParameters?: ToolParameters

  execute(params: TParams, ctx: ToolExecutionContext): Promise<ToolResult>
}
