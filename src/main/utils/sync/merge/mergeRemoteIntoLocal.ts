import {mergeAppendOnly} from "./mergeAppendOnly"
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
  const {result: mergedEvents, added: addedEvents} = mergeAppendOnly(localDocs.events, remoteDocs.events)

  const survivingBranchIds = new Set(mergedBranches.map((b) => b.id))
  const branchReassignTouchesTasks = mergedTasks.some((t) => !survivingBranchIds.has(t.branch_id))
  const tasksAfterBranchGc = branchReassignTouchesTasks
    ? mergedTasks.map((t) => (survivingBranchIds.has(t.branch_id) ? t : {...t, branch_id: "main"}))
    : mergedTasks

  const resultDocs: SnapshotDocs = {
    tasks: tasksAfterBranchGc,
    tags: mergedTags,
    branches: mergedBranches,
    files: mergedFiles,
    events: mergedEvents,
    settings: mergedSettings,
  }

  const toUpsert: SnapshotDocs = {
    tasks: [],
    tags: [],
    branches: [],
    files: [],
    events: [],
    settings: null,
  }

  if (hasChanges(localDocs.tasks, tasksAfterBranchGc) || gcTasks.length || branchReassignTouchesTasks) {
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

  if (addedEvents.length) {
    toUpsert.events = addedEvents
    changes += addedEvents.length
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
