import crypto from "node:crypto"

import type {Snapshot, SnapshotDocs, SnapshotMeta} from "@daily/protocol"

export function buildSnapshot(docs: SnapshotDocs): Snapshot {
  return {
    version: 9,
    docs,
    meta: buildSnapshotMeta(docs),
  }
}

/**
 * Build SnapshotMeta from document collections.
 */
export function buildSnapshotMeta(docs: SnapshotDocs): SnapshotMeta {
  const collections: Array<{id: string}[]> = [
    docs.tasks,
    docs.tags,
    docs.branches,
    docs.files,
    docs.events,
    docs.milestones ?? [],
    docs.relations ?? [],
    docs.comments ?? [],
  ]
  const collectionHashes = collections.map(computeCollectionHash)

  return {
    updatedAt: new Date().toISOString(),
    hash: crypto.createHash("sha256").update(collectionHashes.join("")).digest("hex"),
  }
}

function computeCollectionHash<D extends {id: string}>(docs: D[]): string {
  const sorted = [...docs].toSorted((a, b) => a.id.localeCompare(b.id))
  const json = JSON.stringify(sorted)
  return crypto.createHash("sha256").update(json).digest("hex")
}
