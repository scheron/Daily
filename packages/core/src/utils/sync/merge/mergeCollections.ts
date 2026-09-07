import {isNewer, toTs} from "@daily/std"

import type {SyncStrategy} from "@daily/protocol"

type SyncableDoc = {
  id: string
  updated_at: string
  deleted_at: string | null
}

type MergedDoc<D> = {doc: D | null; adoptedOnTie: boolean}

/**
 * Merge two collections using pure LWW (Last Write Wins) strategy.
 * Returns merged documents, IDs of documents to GC, and the documents the
 * strategy took from the remote on an `updated_at` tie while the two sides
 * held different content — the only changes a caller comparing `updated_at`
 * cannot see, since a tie has equal `updated_at` by definition.
 */
export function mergeCollections<D extends SyncableDoc>(
  localDocs: D[],
  remoteDocs: D[],
  strategy: SyncStrategy,
  gcIntervalMs: number,
): {result: D[]; toGc: string[]; adoptedOnTie: D[]} {
  const result: D[] = []
  const toGc: string[] = []
  const adoptedOnTie: D[] = []

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
    if (!merged.doc) continue

    result.push(merged.doc)
    if (merged.adoptedOnTie) adoptedOnTie.push(merged.doc)
  }

  return {result, toGc, adoptedOnTie}
}

function mergeDoc<D extends SyncableDoc>(local: D | null, remote: D | null, strategy: SyncStrategy): MergedDoc<D> {
  if (!local && !remote) return {doc: null, adoptedOnTie: false}
  if (local && !remote) return {doc: local, adoptedOnTie: false}
  if (!local && remote) return {doc: remote, adoptedOnTie: false}

  if (isNewer(local!.updated_at, remote!.updated_at)) return {doc: local, adoptedOnTie: false}
  if (isNewer(remote!.updated_at, local!.updated_at)) return {doc: remote, adoptedOnTie: false}

  if (strategy === "push") return {doc: local!, adoptedOnTie: false}

  return {doc: remote!, adoptedOnTie: !isSameContent(local!, remote!)}
}

function isSameContent(local: unknown, remote: unknown): boolean {
  if (local === remote) return true
  if (local === null || remote === null || typeof local !== "object" || typeof remote !== "object") return false

  if (Array.isArray(local) || Array.isArray(remote)) {
    if (!Array.isArray(local) || !Array.isArray(remote) || local.length !== remote.length) return false
    return local.every((item, index) => isSameContent(item, remote[index]))
  }

  const localKeys = Object.keys(local)
  if (localKeys.length !== Object.keys(remote).length) return false

  return localKeys.every((key) => isSameContent((local as Record<string, unknown>)[key], (remote as Record<string, unknown>)[key]))
}

function isExpired(doc: SyncableDoc, now: number, ttlMs: number): boolean {
  if (!doc?.deleted_at) return false
  const deletedAtMs = toTs(doc.deleted_at)
  return deletedAtMs + ttlMs <= now
}
