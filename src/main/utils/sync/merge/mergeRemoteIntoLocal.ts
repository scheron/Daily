import {mergeCollections} from "./mergeCollections"
import {mergeSettings} from "./mergeSettings"

import type {MergeResult, SnapshotDocs, SyncStrategy} from "@/types/sync"

/**
 * Merge remote snapshot into local using pure LWW strategy.
 * Returns merged docs, typed upsert/remove, and change count.
 */
export function mergeRemoteIntoLocal(localDocs: SnapshotDocs, remoteDocs: SnapshotDocs, strategy: SyncStrategy, gcIntervalMs: number): MergeResult {
  const toRemove: MergeResult["toRemove"] = {}
  let changes = 0

  const {result: mergedTasks, toGc: gcTasks} = mergeCollections(localDocs.tasks, remoteDocs.tasks, strategy, gcIntervalMs)
  const {result: mergedTags, toGc: gcTags} = mergeCollections(localDocs.tags, remoteDocs.tags, strategy, gcIntervalMs)
  const {result: mergedBranches, toGc: gcBranches} = mergeCollections(localDocs.branches, remoteDocs.branches, strategy, gcIntervalMs)
  const {result: mergedFiles, toGc: gcFiles} = mergeCollections(localDocs.files, remoteDocs.files, strategy, gcIntervalMs)
  const mergedSettings = mergeSettings(localDocs.settings, remoteDocs.settings, strategy)

  const gcBranchSet = new Set(gcBranches)
  const tasksAfterBranchGc =
    gcBranches.length > 0 ? mergedTasks.map((t) => (gcBranchSet.has(t.branch_id) ? {...t, branch_id: "main"} : t)) : mergedTasks
  const branchGcTouchesTasks = gcBranches.length > 0 && mergedTasks.some((t) => gcBranchSet.has(t.branch_id))

  const resultDocs: SnapshotDocs = {
    tasks: tasksAfterBranchGc,
    tags: mergedTags,
    branches: mergedBranches,
    files: mergedFiles,
    settings: mergedSettings,
  }

  // Build toUpsert — only include collections that changed
  const toUpsert: SnapshotDocs = {
    tasks: [],
    tags: [],
    branches: [],
    files: [],
    settings: null,
  }

  if (hasChanges(localDocs.tasks, tasksAfterBranchGc) || gcTasks.length || branchGcTouchesTasks) {
    toUpsert.tasks = tasksAfterBranchGc
    if (gcTasks.length) toRemove.tasks = gcTasks
    changes += tasksAfterBranchGc.length + gcTasks.length
  }

  if (hasChanges(localDocs.tags, mergedTags) || gcTags.length) {
    toUpsert.tags = mergedTags
    if (gcTags.length) toRemove.tags = gcTags
    changes += mergedTags.length + gcTags.length
  }

  if (hasChanges(localDocs.branches, mergedBranches) || gcBranches.length) {
    toUpsert.branches = mergedBranches
    if (gcBranches.length) toRemove.branches = gcBranches
    changes += mergedBranches.length + gcBranches.length
  }

  if (hasChanges(localDocs.files, mergedFiles) || gcFiles.length) {
    toUpsert.files = mergedFiles
    if (gcFiles.length) toRemove.files = gcFiles
    changes += mergedFiles.length + gcFiles.length
  }

  if (mergedSettings && hasSettingsChanges(localDocs.settings, mergedSettings)) {
    toUpsert.settings = mergedSettings
    changes += 1
  }

  return {resultDocs, toUpsert, toRemove, changes}
}

function hasChanges<D extends {id: string; updated_at: string}>(oldDocs: D[], newDocs: D[]): boolean {
  if (oldDocs.length !== newDocs.length) return true

  const oldById = new Map(oldDocs.map((d) => [d.id, d]))

  for (const newDoc of newDocs) {
    const oldDoc = oldById.get(newDoc.id)
    if (!oldDoc || oldDoc.updated_at !== newDoc.updated_at) {
      return true
    }
  }

  return false
}

function hasSettingsChanges(local: SnapshotDocs["settings"], remote: SnapshotDocs["settings"]): boolean {
  return JSON.stringify(local) !== JSON.stringify(remote)
}
