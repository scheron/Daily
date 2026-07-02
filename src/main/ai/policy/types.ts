import type {CachedPage} from "@/ai/web/types"
import type {LRU} from "@shared/utils/common/LRU"

/**
 * A one-line description of a tool call for the confirmation card.
 * Used by the policy hook to describe a tool call to the user.
 * @example
 * {
 *   title: "Delete task",
 *   summary: "Delete the task with the given ID",
 *   details: ["Task ID: 123"]
 * }
 */
export type ToolCallDescription = {
  title: string
  summary: string
  details?: string[]
}
/**
 * Internal representation of a pending confirmation kept on AIController.
 * The `resolve` and `timeoutId` fields are NOT serializable — they stay
 * in main. The PendingToolConfirmation that flies to the renderer is
 * derived from these fields.
 */
export type PendingConfirmation = {
  id: string
  toolName: string
  params: unknown
  title: string
  summary: string
  details?: string[]
  createdAt: number
  resolve: (confirmed: boolean) => void
  timeoutId: NodeJS.Timeout
}

/**
 * What the policy hook needs from AIController. Kept narrow to avoid a
 * cyclical import and to make the hook unit-testable with a fake host.
 */
export type PolicyHookHost = {
  awaitConfirmation(toolName: string, params: unknown): Promise<boolean>
  /** Whether external-egress (non-destructive) tools may run without confirmation. */
  isEgressAutoApproved(): boolean
  /** The invoker's page cache, so the hook can let cache-hit reads skip confirmation. */
  getWebPageCache(): LRU<string, CachedPage>
}

/** Default time before an unanswered confirmation auto-resolves to false. */
export const DEFAULT_CONFIRMATION_TIMEOUT_MS = 30_000
