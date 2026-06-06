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
}

/** Default time before an unanswered confirmation auto-resolves to false. */
export const DEFAULT_CONFIRMATION_TIMEOUT_MS = 30_000
