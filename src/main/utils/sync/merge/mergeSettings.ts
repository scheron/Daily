import {isNewerOrEqual} from "@shared/utils/date/validators"

import type {SnapshotSettings, SyncStrategy} from "@/types/sync"

/**
 * Merge settings (simple LWW, no soft-delete).
 * Strategy affects tie-break: "pull" → remote wins, "push" → local wins.
 */
export function mergeSettings(local: SnapshotSettings | null, remote: SnapshotSettings | null, strategy: SyncStrategy): SnapshotSettings | null {
  if (!local && !remote) return null
  if (!local) return remote
  if (!remote) return local

  // LWW by updated_at, with strategy-based tie-break
  if (isNewerOrEqual(local.updated_at, remote.updated_at)) {
    // Local is newer or equal
    // On tie: push → local wins, pull → remote wins
    if (local.updated_at === remote.updated_at) {
      return strategy === "push" ? local : remote
    }
    return local
  }

  return remote
}
