export type ToolCallDescription = {
  title: string
  summary: string
  details?: string[]
}

export function describeToolCall(toolName: string, rawParams: unknown): ToolCallDescription {
  const params = (rawParams && typeof rawParams === "object" ? rawParams : {}) as Record<string, unknown>
  const builder = BUILDERS[toolName]
  if (builder) return builder(params)

  return {
    title: `Confirm action: ${toolName}`,
    summary: `The assistant requested a destructive action (${toolName}) that needs your approval.`,
  }
}

type Builder = (params: Record<string, unknown>) => ToolCallDescription

const BUILDERS: Record<string, Builder> = {
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
}

function str(value: unknown): string {
  return typeof value === "string" && value ? value : "(unspecified)"
}
