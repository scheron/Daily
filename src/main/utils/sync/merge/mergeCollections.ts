import {toTs} from "@shared/utils/date/formatters"
import {isNewer} from "@shared/utils/date/validators"

import type {SyncStrategy} from "@/types/sync"

type SyncableDoc = {
  id: string
  updated_at: string
  deleted_at: string | null
}

/**
 * Merge two collections using pure LWW (Last Write Wins) strategy.
 * Returns merged documents and IDs of documents to GC.
 */
export function mergeCollections<D extends SyncableDoc>(
  localDocs: D[],
  remoteDocs: D[],
  strategy: SyncStrategy,
  gcIntervalMs: number,
): {result: D[]; toGc: string[]} {
  const result: D[] = []
  const toGc: string[] = []

  const now = Date.now()

  const localById = new Map(localDocs.map((d) => [d.id, d]))
  const remoteById = new Map(remoteDocs.map((d) => [d.id, d]))

  const allIds = new Set([...localById.keys(), ...remoteById.keys()])

  for (const id of allIds) {
    const local = localById.get(id) ?? null
    const remote = remoteById.get(id) ?? null

    const isLocalExpired = local ? isExpired(local, now, gcIntervalMs) : false
    const isRemoteExpired = remote ? isExpired(remote, now, gcIntervalMs) : false

    if (!local && isRemoteExpired) continue

    if (isLocalExpired) {
      toGc.push(id)
      continue
    }

    if (local && isRemoteExpired) {
      toGc.push(id)
      continue
    }

    const merged = mergeDoc(local, remote, strategy)
    if (merged) result.push(merged)
  }

  return {result, toGc}
}

function mergeDoc<D extends SyncableDoc>(local: D | null, remote: D | null, strategy: SyncStrategy): D | null {
  if (!local && !remote) return null
  if (local && !remote) return local
  if (!local && remote) return remote

  if (isNewer(local!.updated_at, remote!.updated_at)) return local
  if (isNewer(remote!.updated_at, local!.updated_at)) return remote

  return strategy === "push" ? local! : remote!
}

function isExpired(doc: SyncableDoc, now: number, ttlMs: number): boolean {
  if (!doc?.deleted_at) return false
  const deletedAtMs = toTs(doc.deleted_at)
  return deletedAtMs + ttlMs <= now
}
