import {MAIN_BRANCH_ID} from "@daily/protocol"

import type {SnapshotDocs} from "@daily/protocol"

/**
 * Fills what an older snapshot does not carry: the `milestones`, `relations` and `comments` collections, a
 * task's `milestone_id`, a tag's `branch_id`, a branch's `description`, and an event's `kind`/`provider`.
 * Drops what an older snapshot carries and this one no longer has — the `settings` document, local to
 * each device since v7. Called on both sides of a merge so no reader downstream has to defend itself.
 */
export function normalizeSnapshotDocs(docs: SnapshotDocs): SnapshotDocs {
  const {settings: _deviceLocalSettings, ...rest} = docs as SnapshotDocs & {settings?: unknown}

  return {
    ...rest,
    tasks: docs.tasks.map((task) => ({...task, milestone_id: task.milestone_id ?? null})),
    tags: docs.tags.map((tag) => ({...tag, branch_id: tag.branch_id ?? MAIN_BRANCH_ID})),
    branches: docs.branches.map((branch) => ({...branch, description: branch.description ?? ""})),
    milestones: docs.milestones ?? [],
    relations: docs.relations ?? [],
    comments: docs.comments ?? [],
    events: (docs.events ?? []).map((event) => ({...event, kind: event.kind ?? "manual", provider: event.provider ?? null})),
  }
}
