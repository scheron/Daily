import crypto from "node:crypto"

import type {SnapshotDocs, SnapshotSettings} from "@/types/sync"

/**
 * Compute a deterministic hash of all document collections.
 */
export function computeDocsHash(docs: SnapshotDocs): string {
  const tasksHash = computeCollectionHash(docs.tasks)
  const tagsHash = computeCollectionHash(docs.tags)
  const branchesHash = computeCollectionHash(docs.branches)
  const filesHash = computeCollectionHash(docs.files)
  const settingsHash = computeSettingsHash(docs.settings)

  const combined = tasksHash + tagsHash + branchesHash + filesHash + settingsHash
  return crypto.createHash("sha256").update(combined).digest("hex")
}

function computeCollectionHash<D extends {id: string}>(docs: D[]): string {
  const sorted = [...docs].toSorted((a, b) => a.id.localeCompare(b.id))
  const json = JSON.stringify(sorted)
  return crypto.createHash("sha256").update(json).digest("hex")
}

function computeSettingsHash(settings: SnapshotSettings | null): string {
  const json = JSON.stringify(settings)
  return crypto.createHash("sha256").update(json).digest("hex")
}
