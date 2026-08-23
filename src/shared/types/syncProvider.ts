/**
 * The one three-position choice of where this device syncs, and what changing that position
 * involves: a preview of what each side holds, and the direction that decides the ties.
 */

/** Where this device syncs. Exactly one position at a time, never two writable providers. */
export type SyncProvider = "off" | "icloud" | "server"

/** Which side wins where the same record was edited or deleted in both places with the same `updatedAt`. */
export type MigrationDirection = "keep-local" | "keep-target"

/** Live records of one side, as a person recognises them: their tasks, their tags, their branches. */
export type ProviderCounts = {tasks: number; tags: number; branches: number}

/** What both sides hold and how they differ, read before a migration asks anything and writing nothing. */
export type MigrationPreview = {
  target: Exclude<SyncProvider, "off">
  targetName: string
  targetHasSnapshot: boolean
  local: ProviderCounts
  remote: ProviderCounts
  onlyOnLocal: ProviderCounts
  onlyOnRemote: ProviderCounts
  /**
   * Records carrying the same `updated_at` on both sides with differing content — including a
   * deletion on one side against an edit on the other — the ones the direction decides.
   */
  conflicts: ProviderCounts
}
