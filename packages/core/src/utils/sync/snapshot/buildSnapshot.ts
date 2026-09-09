import crypto from "node:crypto"

import type {Snapshot, SnapshotDocs, SnapshotMeta, SnapshotSettings} from "@daily/protocol"

export function buildSnapshot(docs: SnapshotDocs): Snapshot {
  return {
    version: 6,
    docs,
    meta: buildSnapshotMeta(docs),
  }
}

/**
 * Build SnapshotMeta from document collections.
 */
export function buildSnapshotMeta(docs: SnapshotDocs): SnapshotMeta {
  const tasksHash = computeCollectionHash(docs.tasks)
  const milestonesHash = computeCollectionHash(docs.milestones ?? [])
  const tagsHash = computeCollectionHash(docs.tags)
  const branchesHash = computeCollectionHash(docs.branches)
  const filesHash = computeCollectionHash(docs.files)
  const eventsHash = computeCollectionHash(docs.events)
  const settingsHash = computeSettingsHash(docs.settings)
  const combinedHash = computeCombinedHash(tasksHash, milestonesHash, tagsHash, branchesHash, filesHash, eventsHash, settingsHash)

  return {
    updatedAt: new Date().toISOString(),
    hash: combinedHash,
  }
}

function computeCombinedHash(
  tasksHash: string,
  milestonesHash: string,
  tagsHash: string,
  branchesHash: string,
  filesHash: string,
  eventsHash: string,
  settingsHash: string,
): string {
  const combined = [tasksHash, milestonesHash, tagsHash, branchesHash, filesHash, eventsHash, settingsHash].join("")
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
