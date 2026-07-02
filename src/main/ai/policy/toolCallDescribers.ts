import {isString} from "@shared/utils/common/validators"
import {getHostname} from "@shared/utils/web/getHostname"

import type {ToolCallDescription} from "./types"

type ToolCallDescriber = (params: Record<string, unknown>) => ToolCallDescription

/**
 * Per-tool describers that turn a destructive tool call's params into a
 * human-readable confirmation card (title, summary, optional details).
 * Keyed by tool name; tools without an entry fall back to the generic
 * message in `describeToolCall`.
 */
export const TOOL_CALL_DESCRIBERS: Record<string, ToolCallDescriber> = {
  delete_task: (p) => ({
    title: "Move task to trash",
    summary: `Move task ${str(p.task_id)} to trash. It can be restored later from the trash view.`,
    details: [`Task ID: ${str(p.task_id)}`],
  }),
  delete_project: (p) => ({
    title: "Move project to trash",
    summary: `Move project ${str(p.project_id)} (and all of its tasks) to trash. Tasks remain restorable.`,
    details: [`Project ID: ${str(p.project_id)}`],
  }),
  delete_tag: (p) => ({
    title: "Delete tag",
    summary: `Delete tag ${str(p.tag_id)}. The tag is removed from all tasks that currently use it.`,
    details: [`Tag ID: ${str(p.tag_id)}`],
  }),
  remove_task_attachment: (p) => ({
    title: "Remove attachment",
    summary: `Remove attachment ${str(p.file_id)} from task ${str(p.task_id)}.`,
    details: [`Task ID: ${str(p.task_id)}`, `File ID: ${str(p.file_id)}`],
  }),
  permanently_delete_task: (p) => ({
    title: "Permanently delete task",
    summary: `Permanently delete task ${str(p.task_id)}. This cannot be undone.`,
    details: [`Task ID: ${str(p.task_id)}`],
  }),
  read_url: (p) => ({
    title: "Open a web page",
    summary: `Read ${getHostname(str(p.url))}`,
    details: [`URL: ${str(p.url)}`],
  }),
}

function str(value: unknown): string {
  return isString(value) && value ? value : "(unspecified)"
}
