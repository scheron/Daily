import {MAIN_BRANCH_ID} from "@daily/protocol"

import type {SnapshotDocs} from "@daily/protocol"

/**
 * Fills what an older snapshot does not carry: the `milestones` and `relations` collections, a
 * task's `milestone_id`, a tag's `branch_id` and a branch's `description`. Called on both sides
 * of a merge so no reader downstream has to defend itself.
 */
export function normalizeSnapshotDocs(docs: SnapshotDocs): SnapshotDocs {
  return {
    ...docs,
    tasks: docs.tasks.map((task) => ({...task, milestone_id: task.milestone_id ?? null})),
    tags: docs.tags.map((tag) => ({...tag, branch_id: tag.branch_id ?? MAIN_BRANCH_ID})),
    branches: docs.branches.map((branch) => ({...branch, description: branch.description ?? ""})),
    milestones: docs.milestones ?? [],
    relations: docs.relations ?? [],
  }
}
