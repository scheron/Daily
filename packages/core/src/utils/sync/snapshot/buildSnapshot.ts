import crypto from "node:crypto"

import {validateWorkflowSnapshotDocs} from "../../tasks/workflowValidation"

import type {Snapshot, SnapshotDocs, SnapshotMeta} from "@daily/protocol"

export function buildSnapshot(docs: SnapshotDocs): Snapshot {
  const normalized = {
    ...docs,
    tasks: docs.tasks.map((task) => ({
      ...task,
      workflow_time_baseline: task.workflow_time_baseline ?? 0,
      workflow_generation: task.workflow_generation ?? "",
    })),
    workflowRecords: docs.workflowRecords ?? [],
    workflowGuidanceRecords: docs.workflowGuidanceRecords ?? [],
  }
  return {
    version: 20,
    docs: normalized,
    meta: buildSnapshotMeta(normalized),
  }
}

export function buildSnapshotMeta(docs: SnapshotDocs): SnapshotMeta {
  validateWorkflowSnapshotDocs(docs, {completeHistory: true})
  const collections: Array<{id: string}[]> = [
    docs.tasks,
    docs.tags,
    docs.branches,
    docs.files,
    docs.events,
    docs.workflowRecords ?? [],
    docs.workflowGuidanceRecords ?? [],
    docs.milestones ?? [],
    docs.relations ?? [],
    docs.comments ?? [],
    docs.subtasks ?? [],
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
