import {mergeCollections} from "./mergeCollections"
import {mergeSettings} from "./mergeSettings"

import type {BaseDoc, SettingsDoc} from "@/types/database"
import type {SnapshotDocs, SyncDoc, SyncStrategy} from "@/types/sync"

/**
 * Merge remote snapshot into local using pure LWW strategy.
 * Returns merged docs, array of documents to upsert and number of changes.
 */
export async function mergeRemoteIntoLocal(
  localDocs: SnapshotDocs,
  remoteDocs: SnapshotDocs,
  strategy: SyncStrategy,
  gcIntervalMs: number,
): Promise<{resultDocs: SnapshotDocs; toUpsert: SyncDoc[]; toRemove: SyncDoc["_id"][]; changes: number}> {
  const toUpsert: SyncDoc[] = []
  const toRemove: SyncDoc["_id"][] = []
  let changes = 0

  const resultDocs: SnapshotDocs = {
    tasks: localDocs.tasks,
    tags: localDocs.tags,
    branches: localDocs.branches,
    files: localDocs.files,
    settings: localDocs.settings,
  }

  const {result: mergedTasks, toGc: gcTasks} = mergeCollections(localDocs.tasks, remoteDocs.tasks, strategy, gcIntervalMs)
  const {result: mergedTags, toGc: gcTags} = mergeCollections(localDocs.tags, remoteDocs.tags, strategy, gcIntervalMs)
  const {result: mergedBranches, toGc: gcBranches} = mergeCollections(localDocs.branches, remoteDocs.branches, strategy, gcIntervalMs)
  const {result: mergedFiles, toGc: gcFiles} = mergeCollections(localDocs.files, remoteDocs.files, strategy, gcIntervalMs)
  const mergedSettings = mergeSettings(localDocs.settings, remoteDocs.settings)

  if (mergedTasks.length !== localDocs.tasks.length || hasDocChanges(localDocs.tasks, mergedTasks) || gcTasks.length) {
    toUpsert.push(...mergedTasks)
    toRemove.push(...gcTasks)
    changes += mergedTasks.length + gcTasks.length
    resultDocs.tasks = mergedTasks
  }

  if (mergedTags.length !== localDocs.tags.length || hasDocChanges(localDocs.tags, mergedTags) || gcTags.length) {
    toUpsert.push(...mergedTags)
    toRemove.push(...gcTags)
    changes += mergedTags.length + gcTags.length
    resultDocs.tags = mergedTags
  }

  if (mergedBranches.length !== localDocs.branches.length || hasDocChanges(localDocs.branches, mergedBranches) || gcBranches.length) {
    toUpsert.push(...mergedBranches)
    toRemove.push(...gcBranches)
    changes += mergedBranches.length + gcBranches.length
    resultDocs.branches = mergedBranches
  }

  if (mergedFiles.length !== localDocs.files.length || hasDocChanges(localDocs.files, mergedFiles) || gcFiles.length) {
    toUpsert.push(...mergedFiles)
    toRemove.push(...gcFiles)
    changes += mergedFiles.length + gcFiles.length
    resultDocs.files = mergedFiles
  }

  if (mergedSettings && hasSettingsChanges(localDocs.settings, mergedSettings)) {
    toUpsert.push(mergedSettings)
    changes += 1
    resultDocs.settings = mergedSettings
  }

  return {resultDocs, toUpsert, toRemove, changes}
}

function hasDocChanges<D extends BaseDoc>(oldDocs: D[], newDocs: D[]): boolean {
  if (oldDocs.length !== newDocs.length) return true

  const oldById = new Map(oldDocs.map((d) => [d._id, d]))

  for (const newDoc of newDocs) {
    const oldDoc = oldById.get(newDoc._id)
    if (!oldDoc || oldDoc.updatedAt !== newDoc.updatedAt) {
      return true
    }
  }

  return false
}

function hasSettingsChanges(local: SettingsDoc | null, remote: SettingsDoc | null): boolean {
  return JSON.stringify(local) !== JSON.stringify(remote)
}
