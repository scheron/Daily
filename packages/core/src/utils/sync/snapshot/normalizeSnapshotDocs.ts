import {APP_CONFIG, MAIN_BRANCH_ID} from "@daily/protocol"

import {extractFileIds} from "../../files/extractFileIds"

import type {SnapshotDocs, SnapshotFile, SnapshotTask} from "@daily/protocol"

/**
 * Fills what an older snapshot does not carry: the `milestones`, `relations` and `comments` collections, a
 * task's `milestone_id`, a tag's `branch_id`, a branch's `description`, and an event's `kind`/`provider`.
 * Drops what an older snapshot carries and this one no longer has — the `settings` document, local to
 * each device since v7, and a task's `attachments`, folded into its `content` as file links since v10.
 * Called on both sides of a merge so no reader downstream has to defend itself.
 */
export function normalizeSnapshotDocs(docs: SnapshotDocs): SnapshotDocs {
  const {settings: _deviceLocalSettings, ...rest} = docs as SnapshotDocs & {settings?: unknown}

  return {
    ...rest,
    tasks: docs.tasks.map((task) => foldAttachmentsIntoContent({...task, milestone_id: task.milestone_id ?? null}, docs.files)),
    tags: docs.tags.map((tag) => ({...tag, branch_id: tag.branch_id ?? MAIN_BRANCH_ID})),
    branches: docs.branches.map((branch) => ({...branch, description: branch.description ?? ""})),
    milestones: docs.milestones ?? [],
    relations: docs.relations ?? [],
    comments: docs.comments ?? [],
    events: (docs.events ?? []).map((event) => ({...event, kind: event.kind ?? "manual", provider: event.provider ?? null})),
  }
}

/**
 * A pre-v10 task carries its files as an `attachments` id list rather than links in `content`.
 * Each id not already mentioned in `content` is appended as `![name](daily://file/id)`, in the
 * order it appears; an id with no matching entry in `files` is dropped, since there is no name to
 * link it with. `attachments` itself never survives, mentioned or not.
 */
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
