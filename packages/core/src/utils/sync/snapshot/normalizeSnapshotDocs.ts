import {APP_CONFIG, NO_PROJECT_ID, normalizeProjectEmoji} from "@daily/protocol"

import {extractFileIds} from "../../files/extractFileIds"
import {validateWorkflowSnapshotDocs} from "../../tasks/workflowValidation"

import type {SnapshotDocs, SnapshotFile, SnapshotTask} from "@daily/protocol"

/** Upgrades legacy document fields; snapshots before v18 retain history with expired monotonic checkpoints and no proposal comment binding. */
export function normalizeSnapshotDocs(docs: SnapshotDocs, version = 20): SnapshotDocs {
  const workflowRecords = Array.isArray(docs.workflowRecords)
    ? docs.workflowRecords.map((record) => (version < 18 ? {...record, checkpointMonotonic: null, proposalCommentId: null} : record))
    : docs.workflowRecords
  validateWorkflowSnapshotDocs({...docs, workflowRecords})
  const {settings: _deviceLocalSettings, ...rest} = docs as SnapshotDocs & {settings?: unknown}

  const normalized = {
    ...rest,
    tasks: docs.tasks.map((task) =>
      foldAttachmentsIntoContent(
        {
          ...task,
          status: task.status === "active" ? "in_progress" : task.status === "discarded" ? "cancelled" : task.status,
          milestone_id: task.milestone_id ?? null,
          priority: task.priority ?? "none",
          workflow_time_baseline: task.workflow_time_baseline ?? 0,
          workflow_generation: task.workflow_generation ?? "",
        },
        docs.files,
      ),
    ),
    tags: docs.tags.map((tag) => ({...tag, branch_id: tag.branch_id ?? NO_PROJECT_ID})),
    branches: docs.branches.map((branch) => ({...branch, description: branch.description ?? "", emoji: normalizeProjectEmoji(branch.emoji)})),
    workflowRecords: workflowRecords ?? [],
    workflowGuidanceRecords: docs.workflowGuidanceRecords ?? [],
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
  validateWorkflowSnapshotDocs(normalized)
  return normalized
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
