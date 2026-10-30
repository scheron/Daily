import {APP_CONFIG, NO_PROJECT_ID} from "@daily/protocol"

import {extractFileIds} from "../../files/extractFileIds"

import type {SnapshotDocs, SnapshotFile, SnapshotTask} from "@daily/protocol"

/**
 * Fills what an older snapshot does not carry: the `milestones`, `relations`, `comments` and `subtasks` collections, a
 * task's `milestone_id` and `priority` (`none`), a tag's `branch_id`, a branch's `description`, and an event's actor, change metadata and stable ordering.
 * Drops what an older snapshot carries and this one no longer has — the `settings` document, local to
 * each device since v7, and a task's `attachments`, folded into its `content` as file links since v10.
 * Called on both sides of a merge so no reader downstream has to defend itself.
 */
export function normalizeSnapshotDocs(docs: SnapshotDocs): SnapshotDocs {
  const {settings: _deviceLocalSettings, ...rest} = docs as SnapshotDocs & {settings?: unknown}

  return {
    ...rest,
    tasks: docs.tasks.map((task) =>
      foldAttachmentsIntoContent(
        {
          ...task,
          status: task.status === "active" ? "in_progress" : task.status === "discarded" ? "cancelled" : task.status,
          milestone_id: task.milestone_id ?? null,
          priority: task.priority ?? "none",
        },
        docs.files,
      ),
    ),
    tags: docs.tags.map((tag) => ({...tag, branch_id: tag.branch_id ?? NO_PROJECT_ID})),
    branches: docs.branches.map((branch) => ({...branch, description: branch.description ?? ""})),
    milestones: docs.milestones ?? [],
    relations: docs.relations ?? [],
    comments: docs.comments ?? [],
    subtasks: docs.subtasks ?? [],
    events: (docs.events ?? []).map((event) => ({
      ...event,
      kind: event.kind ?? "manual",
      provider: event.provider ?? null,
      from_status: event.from_status ?? null,
      to_status: event.to_status ?? null,
      from_priority: event.from_priority ?? null,
      to_priority: event.to_priority ?? null,
      from_branch_id: event.from_branch_id ?? null,
      to_branch_id: event.to_branch_id ?? null,
      sequence: event.sequence ?? 0,
      move_id: event.move_id ?? null,
    })),
  }
}

function foldAttachmentsIntoContent(task: SnapshotTask, files: SnapshotFile[]): SnapshotTask {
  const {attachments, ...rest} = task as SnapshotTask & {attachments?: string[]}
  if (!attachments?.length) return rest as SnapshotTask

  const filesById = new Map(files.map((file) => [file.id, file]))
  const mentioned = new Set(extractFileIds(rest.content))

  const links = attachments
    .filter((id) => !mentioned.has(id))
    .map((id) => filesById.get(id))
    .filter((file): file is SnapshotFile => Boolean(file))
    .map((file) => `![${file.name}](${APP_CONFIG.filesProtocol}/${file.id})`)

  if (!links.length) return rest as SnapshotTask

  return {...rest, content: rest.content.length > 0 ? [rest.content, ...links].join("\n\n") : links.join("\n\n")}
}
