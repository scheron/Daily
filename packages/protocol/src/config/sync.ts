export const SYNC_CONFIG = {
  garbageCollectionInterval: 7 * 24 * 60 * 60 * 1000,
  conditionalWriteMaxAttempts: 5,
} as const

export const SYNC_REMOTE_ID = {
  icloud: "icloud",
  server: "daily-server",
} as const

export type SyncRemoteId = (typeof SYNC_REMOTE_ID)[keyof typeof SYNC_REMOTE_ID]

export type SyncPacing = {
  remoteSyncInterval: number
  pushDebounceMs: number
}

/**
 * How soon each provider may move bytes after a local change, and how often it
 * sweeps regardless. iCloud waits longer because every write there costs file
 * coordination; the server waits less because reads already arrive on their own
 * through its held revision probe, so a push is all that latency depends on.
 */
export const SYNC_PACING: Record<SyncRemoteId, SyncPacing> = {
  [SYNC_REMOTE_ID.icloud]: {remoteSyncInterval: 2 * 60 * 1000, pushDebounceMs: 2_000},
  [SYNC_REMOTE_ID.server]: {remoteSyncInterval: 2 * 60 * 1000, pushDebounceMs: 500},
}

/** Used while no provider is active, so the scheduler always has a cadence. */
export const DEFAULT_SYNC_PACING: SyncPacing = SYNC_PACING[SYNC_REMOTE_ID.icloud]

/**
 * The pacing a remote runs at, by its `SyncRemote.id`. Falls back to the slowest
 * pacing for an id this build does not know, so an unknown provider can never
 * write more often than iCloud would.
 *
 * @param remoteId - The active remote's id, or undefined while none is active.
 */
export function syncPacingFor(remoteId: string | undefined): SyncPacing {
  if (remoteId === SYNC_REMOTE_ID.icloud) return SYNC_PACING[SYNC_REMOTE_ID.icloud]
  if (remoteId === SYNC_REMOTE_ID.server) return SYNC_PACING[SYNC_REMOTE_ID.server]

  return DEFAULT_SYNC_PACING
}
