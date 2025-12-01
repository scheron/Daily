import {toTs} from "@shared/utils/date/formatters"
import {isNewer} from "@shared/utils/date/validators"

import type {BaseDoc} from "@/types/database"
import type {SyncStrategy} from "@/types/sync"

/**
 * Merge two collections using pure LWW (Last Write Wins) strategy.
 * Returns merged documents and IDs of documents to GC.
 */
export function mergeCollections<D extends BaseDoc>(
  localDocs: D[],
  remoteDocs: D[],
  strategy: SyncStrategy,
  gcIntervalMs: number,
): {result: D[]; toGc: D["_id"][]} {
  const result: D[] = []
  const toGc: D["_id"][] = []

  const now = Date.now()

  const localById = new Map(localDocs.map((d) => [d._id, d]))
  const remoteById = new Map(remoteDocs.map((d) => [d._id, d]))

  const allIds = new Set([...localById.keys(), ...remoteById.keys()])

  for (const id of allIds) {
    const local = localById.get(id) ?? null
    const remote = remoteById.get(id) ?? null

    const isLocalExpired = local ? isExpired(local, now, gcIntervalMs) : false
    const isRemoteExpired = remote ? isExpired(remote, now, gcIntervalMs) : false

    // 1. Local does not exist and remote expired - skip to merge, it will be not included in the result
    if (!local && isRemoteExpired) continue

    // 2. If local expired - GC local in any case
    if (isLocalExpired) {
      toGc.push(id)
      continue
    }

    // 3. Local exists and remote expired - remote GC wins - remove
    if (local && isRemoteExpired) {
      toGc.push(id)
      continue
    }

    // 4. Regular merge
    const merged = mergeDoc(local, remote, strategy)
    if (merged) result.push(merged)
  }

  return {result, toGc}
}

/**
 * Pure LWW merge function for a single document.
 * @param local - Local document (or null if doesn't exist locally)
 * @param remote - Remote document (or null if doesn't exist remotely)
 * @param strategy - Which one wins when updatedAt is equal ('push' - local wins, 'pull' - remote wins)
 * @returns Merged document, or null if both are absent
 */
function mergeDoc<D extends BaseDoc>(local: D | null, remote: D | null, strategy: SyncStrategy): D | null {
  // Both absent
  if (!local && !remote) return null

  // Only one exists
  if (local && !remote) return local
  if (!local && remote) return remote

  // Both exist - compare updatedAt
  if (isNewer(local!.updatedAt, remote!.updatedAt)) return local
  if (isNewer(remote!.updatedAt, local!.updatedAt)) return remote

  return strategy === "push" ? local! : remote!
}

function isExpired(doc: BaseDoc, now: number, ttlMs: number): boolean {
  if (!doc?.deletedAt) return false
  const deletedAtMs = toTs(doc.deletedAt)
  return deletedAtMs + ttlMs <= now
}
