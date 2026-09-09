import {mergeAppendOnly} from "./mergeAppendOnly"
import {mergeCollections} from "./mergeCollections"
import {mergeSettings} from "./mergeSettings"

import type {MergeResult, SnapshotDocs, SyncStrategy} from "@daily/protocol"

/**
 * Merge remote snapshot into local using pure LWW strategy.
 * Returns merged docs, typed upsert/remove, and change count.
 */
export function mergeRemoteIntoLocal(localDocs: SnapshotDocs, remoteDocs: SnapshotDocs, strategy: SyncStrategy, gcIntervalMs: number): MergeResult {
  const toRemove: MergeResult["toRemove"] = {}
  let changes = 0

  const {result: mergedTasks, toGc: gcTasks, adoptedOnTie: adoptedTasks} = mergeCollections(localDocs.tasks, remoteDocs.tasks, strategy, gcIntervalMs)
  const {
    result: mergedMilestones,
    toGc: gcMilestones,
    adoptedOnTie: adoptedMilestones,
  } = mergeCollections(localDocs.milestones ?? [], remoteDocs.milestones ?? [], strategy, gcIntervalMs)
  const {result: mergedTags, toGc: gcTags, adoptedOnTie: adoptedTags} = mergeCollections(localDocs.tags, remoteDocs.tags, strategy, gcIntervalMs)
  const {
    result: mergedBranches,
    toGc: gcBranches,
    adoptedOnTie: adoptedBranches,
  } = mergeCollections(localDocs.branches, remoteDocs.branches, strategy, gcIntervalMs)
  const {result: mergedFiles, toGc: gcFiles, adoptedOnTie: adoptedFiles} = mergeCollections(localDocs.files, remoteDocs.files, strategy, gcIntervalMs)

  const mergedSettings = mergeSettings(localDocs.settings, remoteDocs.settings, strategy)
  const {result: mergedEvents, added: addedEvents} = mergeAppendOnly(localDocs.events, remoteDocs.events)

  const survivingBranchIds = new Set(mergedBranches.map((b) => b.id))
  const branchReassignTouchesTasks = mergedTasks.some((t) => !survivingBranchIds.has(t.branch_id))
  const tasksAfterBranchGc = branchReassignTouchesTasks
    ? mergedTasks.map((t) => (survivingBranchIds.has(t.branch_id) ? t : {...t, branch_id: "main"}))
    : mergedTasks

  const survivingMilestoneIds = new Set(mergedMilestones.map((m) => m.id))
  const milestoneReassignTouchesTasks = tasksAfterBranchGc.some((t) => !!t.milestone_id && !survivingMilestoneIds.has(t.milestone_id))
  const tasksAfterMilestoneGc = milestoneReassignTouchesTasks
    ? tasksAfterBranchGc.map((t) => (!t.milestone_id || survivingMilestoneIds.has(t.milestone_id) ? t : {...t, milestone_id: null}))
    : tasksAfterBranchGc

  const resultDocs: SnapshotDocs = {
    tasks: tasksAfterMilestoneGc,
    milestones: mergedMilestones,
    tags: mergedTags,
    branches: mergedBranches,
    files: mergedFiles,
    events: mergedEvents,
    settings: mergedSettings,
  }

  const toUpsert: SnapshotDocs = {
    tasks: [],
    milestones: [],
    tags: [],
    branches: [],
    files: [],
    events: [],
    settings: null,
  }

  if (hasChanges(localDocs.tasks, tasksAfterMilestoneGc) || gcTasks.length || branchReassignTouchesTasks || milestoneReassignTouchesTasks) {
    toUpsert.tasks = tasksAfterMilestoneGc
    if (gcTasks.length) toRemove.tasks = gcTasks
    changes += tasksAfterMilestoneGc.length + gcTasks.length
  } else if (adoptedTasks.length) {
    toUpsert.tasks = adoptedTasks
    changes += adoptedTasks.length
  }

  if (hasChanges(localDocs.milestones ?? [], mergedMilestones) || gcMilestones.length) {
    toUpsert.milestones = mergedMilestones
    if (gcMilestones.length) toRemove.milestones = gcMilestones
    changes += mergedMilestones.length + gcMilestones.length
  } else if (adoptedMilestones.length) {
    toUpsert.milestones = adoptedMilestones
    changes += adoptedMilestones.length
  }

  if (hasChanges(localDocs.tags, mergedTags) || gcTags.length) {
    toUpsert.tags = mergedTags
    if (gcTags.length) toRemove.tags = gcTags
    changes += mergedTags.length + gcTags.length
  } else if (adoptedTags.length) {
    toUpsert.tags = adoptedTags
    changes += adoptedTags.length
  }

  if (hasChanges(localDocs.branches, mergedBranches) || gcBranches.length) {
    toUpsert.branches = mergedBranches
    if (gcBranches.length) toRemove.branches = gcBranches
    changes += mergedBranches.length + gcBranches.length
  } else if (adoptedBranches.length) {
    toUpsert.branches = adoptedBranches
    changes += adoptedBranches.length
  }

  if (hasChanges(localDocs.files, mergedFiles) || gcFiles.length) {
    toUpsert.files = mergedFiles
    if (gcFiles.length) toRemove.files = gcFiles
    changes += mergedFiles.length + gcFiles.length
  } else if (adoptedFiles.length) {
    toUpsert.files = adoptedFiles
    changes += adoptedFiles.length
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
