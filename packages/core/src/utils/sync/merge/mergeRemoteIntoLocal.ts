import {normalizeSnapshotDocs} from "../snapshot/normalizeSnapshotDocs"
import {mergeAppendOnly} from "./mergeAppendOnly"
import {mergeCollections} from "./mergeCollections"

import type {MergeResult, SnapshotDocs, SnapshotTaskComment, SnapshotTaskRelation, SyncStrategy} from "@daily/protocol"

/**
 * Merge remote snapshot into local using pure LWW strategy.
 * Returns merged docs, typed upsert/remove, and change count.
 */
export function mergeRemoteIntoLocal(localDocs: SnapshotDocs, remoteDocs: SnapshotDocs, strategy: SyncStrategy, gcIntervalMs: number): MergeResult {
  const local = normalizeSnapshotDocs(localDocs)
  const remote = normalizeSnapshotDocs(remoteDocs)

  const toRemove: MergeResult["toRemove"] = {}
  let changes = 0
  const now = new Date().toISOString()

  const {result: mergedTasks, toGc: gcTasks, adoptedOnTie: adoptedTasks} = mergeCollections(local.tasks, remote.tasks, strategy, gcIntervalMs)
  const {result: mergedTags, toGc: gcTags, adoptedOnTie: adoptedTags} = mergeCollections(local.tags, remote.tags, strategy, gcIntervalMs)
  const {
    result: mergedBranches,
    toGc: gcBranches,
    adoptedOnTie: adoptedBranches,
  } = mergeCollections(local.branches, remote.branches, strategy, gcIntervalMs)
  const {
    result: mergedMilestones,
    toGc: gcMilestones,
    adoptedOnTie: adoptedMilestones,
  } = mergeCollections(local.milestones, remote.milestones, strategy, gcIntervalMs)
  const {
    result: mergedRelations,
    toGc: gcRelations,
    adoptedOnTie: adoptedRelations,
  } = mergeCollections(local.relations, remote.relations, strategy, gcIntervalMs)
  const {
    result: mergedComments,
    toGc: gcComments,
    adoptedOnTie: adoptedComments,
  } = mergeCollections(local.comments, remote.comments, strategy, gcIntervalMs)
  const {result: mergedFiles, toGc: gcFiles, adoptedOnTie: adoptedFiles} = mergeCollections(local.files, remote.files, strategy, gcIntervalMs)

  const {result: mergedEvents, added: addedEvents} = mergeAppendOnly(local.events, remote.events)

  const survivingBranchIds = new Set(mergedBranches.map((b) => b.id))
  const onASurvivingBranch = <D extends {branch_id: string}>(doc: D): boolean => survivingBranchIds.has(doc.branch_id)

  const tagsAfterBranchGc = mergedTags.filter(onASurvivingBranch)
  const milestonesAfterBranchGc = mergedMilestones.filter(onASurvivingBranch)
  const branchGcDropsTags = tagsAfterBranchGc.length !== mergedTags.length
  const branchGcDropsMilestones = milestonesAfterBranchGc.length !== mergedMilestones.length

  const survivingMilestoneIds = new Set(milestonesAfterBranchGc.map((m) => m.id))
  const onADroppedMilestone = <D extends {milestone_id: string | null}>(doc: D): boolean =>
    doc.milestone_id !== null && !survivingMilestoneIds.has(doc.milestone_id)

  const branchReassignTouchesTasks = mergedTasks.some((t) => !survivingBranchIds.has(t.branch_id))
  const milestoneClearTouchesTasks = mergedTasks.some(onADroppedMilestone)
  const tasksAfterBranchGc =
    branchReassignTouchesTasks || milestoneClearTouchesTasks
      ? mergedTasks.map((t) => ({
          ...t,
          branch_id: survivingBranchIds.has(t.branch_id) ? t.branch_id : "main",
          milestone_id: onADroppedMilestone(t) ? null : t.milestone_id,
        }))
      : mergedTasks

  const tasksById = new Map(tasksAfterBranchGc.map((t) => [t.id, t]))
  const droppedRelationIds: string[] = []
  let tombstonedRelationsCount = 0
  const relationsAfterTaskGc = mergedRelations.reduce<SnapshotTaskRelation[]>((acc, relation) => {
    const blocker = tasksById.get(relation.blocker_id)
    const blocked = tasksById.get(relation.blocked_id)

    if (!blocker || !blocked) {
      droppedRelationIds.push(relation.id)
      return acc
    }

    const bothLive = blocker.deleted_at === null && blocked.deleted_at === null && blocker.branch_id === blocked.branch_id
    if (relation.deleted_at === null && !bothLive) {
      tombstonedRelationsCount++
      acc.push({...relation, deleted_at: now, updated_at: now})
      return acc
    }

    acc.push(relation)
    return acc
  }, [])

  /**
   * A comment follows its task rather than standing on its own: it leaves when the task row is gone
   * entirely, and it moves to whichever project the task ended up in. A soft-deleted task keeps its
   * comments, unlike a relation, because restoring the task has to restore its thread with it.
   * Re-pointing `branch_id` leaves `updated_at` alone — the field is derived from the task, and
   * bumping it would let a repair win an LWW race it has no business winning.
   */
  const droppedCommentIds: string[] = []
  let rebranchedCommentsCount = 0
  const commentsAfterTaskGc = mergedComments.reduce<SnapshotTaskComment[]>((acc, comment) => {
    const task = tasksById.get(comment.task_id)

    if (!task) {
      droppedCommentIds.push(comment.id)
      return acc
    }

    if (comment.branch_id !== task.branch_id) {
      rebranchedCommentsCount++
      acc.push({...comment, branch_id: task.branch_id})
      return acc
    }

    acc.push(comment)
    return acc
  }, [])

  const resultDocs: SnapshotDocs = {
    tasks: tasksAfterBranchGc,
    tags: tagsAfterBranchGc,
    branches: mergedBranches,
    milestones: milestonesAfterBranchGc,
    relations: relationsAfterTaskGc,
    comments: commentsAfterTaskGc,
    files: mergedFiles,
    events: mergedEvents,
  }

  const toUpsert: SnapshotDocs = {
    tasks: [],
    tags: [],
    branches: [],
    milestones: [],
    relations: [],
    comments: [],
    files: [],
    events: [],
  }

  if (hasChanges(local.tasks, tasksAfterBranchGc) || gcTasks.length || branchReassignTouchesTasks || milestoneClearTouchesTasks) {
    toUpsert.tasks = tasksAfterBranchGc
    if (gcTasks.length) toRemove.tasks = gcTasks
    changes += tasksAfterBranchGc.length + gcTasks.length
  } else if (adoptedTasks.length) {
    toUpsert.tasks = adoptedTasks
    changes += adoptedTasks.length
  }

  if (hasChanges(local.tags, tagsAfterBranchGc) || gcTags.length || branchGcDropsTags) {
    toUpsert.tags = tagsAfterBranchGc
    if (gcTags.length) toRemove.tags = gcTags
    changes += tagsAfterBranchGc.length + gcTags.length
  } else if (adoptedTags.length) {
    toUpsert.tags = adoptedTags
    changes += adoptedTags.length
  }

  if (hasChanges(local.branches, mergedBranches) || gcBranches.length) {
    toUpsert.branches = mergedBranches
    if (gcBranches.length) toRemove.branches = gcBranches
    changes += mergedBranches.length + gcBranches.length
  } else if (adoptedBranches.length) {
    toUpsert.branches = adoptedBranches
    changes += adoptedBranches.length
  }

  if (hasChanges(local.milestones, milestonesAfterBranchGc) || gcMilestones.length || branchGcDropsMilestones) {
    toUpsert.milestones = milestonesAfterBranchGc
    if (gcMilestones.length) toRemove.milestones = gcMilestones
    changes += milestonesAfterBranchGc.length + gcMilestones.length
  } else if (adoptedMilestones.length) {
    toUpsert.milestones = adoptedMilestones
    changes += adoptedMilestones.length
  }

  if (hasChanges(local.relations, relationsAfterTaskGc) || gcRelations.length || droppedRelationIds.length || tombstonedRelationsCount) {
    toUpsert.relations = relationsAfterTaskGc
    if (gcRelations.length || droppedRelationIds.length) toRemove.relations = [...gcRelations, ...droppedRelationIds]
    changes += relationsAfterTaskGc.length + gcRelations.length + droppedRelationIds.length
  } else if (adoptedRelations.length) {
    toUpsert.relations = adoptedRelations
    changes += adoptedRelations.length
  }

  if (hasChanges(local.comments, commentsAfterTaskGc) || gcComments.length || droppedCommentIds.length || rebranchedCommentsCount) {
    toUpsert.comments = commentsAfterTaskGc
    if (gcComments.length || droppedCommentIds.length) toRemove.comments = [...gcComments, ...droppedCommentIds]
    changes += commentsAfterTaskGc.length + gcComments.length + droppedCommentIds.length
  } else if (adoptedComments.length) {
    toUpsert.comments = adoptedComments
    changes += adoptedComments.length
  }

  if (hasChanges(local.files, mergedFiles) || gcFiles.length) {
    toUpsert.files = mergedFiles
    if (gcFiles.length) toRemove.files = gcFiles
    changes += mergedFiles.length + gcFiles.length
  } else if (adoptedFiles.length) {
    toUpsert.files = adoptedFiles
    changes += adoptedFiles.length
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
