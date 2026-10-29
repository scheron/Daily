import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {readBoolean, readString, requireString} from "../input"
import {subtaskView} from "../views"

import type {Subtask} from "@daily/protocol"
import type {Tool, ToolContext} from "../types"

export const saveSubtaskTool: Tool = {
  name: "save_subtask",
  description:
    "Adds a subtask to a task when no id is given, or changes the one named: its text, or whether it is checked off. A new subtask goes last and starts unchecked. Subtasks cannot be reordered from here.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {
      id: {type: "string", description: "The subtask id, to change it. Omitted to add a new one."},
      taskId: {type: "string", description: "The task the subtask belongs to. Required when adding a new one; ignored when changing."},
      content: {type: "string", description: "The subtask's text, as Markdown. Required when adding; optional when changing."},
      done: {type: "boolean", description: "True to check the subtask off, false to uncheck it."},
    },
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = readString(input, "id")
    const content = readString(input, "content")
    const done = readBoolean(input, "done")
    if (content !== undefined && !content.trim()) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"content" cannot be blank.')

    const subtask =
      id === undefined
        ? await ctx.workStorage.batch(() => createSubtask(ctx, requireString(input, "taskId"), requireContent(content), done))
        : await updateSubtask(ctx, id, content, done)

    return {subtask: subtaskView(subtask)}
  },
}

function requireContent(content: string | undefined): string {
  if (content === undefined) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"content" is required to add a subtask.')
  return content
}

async function createSubtask(ctx: ToolContext, taskId: string, content: string, done: boolean | undefined): Promise<Subtask> {
  const changeset = await ctx.workStorage.createSubtask(taskId, content)
  const created = changeset.subtasks?.upserted?.[0]
  if (!created) throw new ToolError(ToolErrorCode.NOT_FOUND, `No task "${taskId}" that can take a subtask.`)
  if (!done) return created

  return updateSubtask(ctx, created.id, undefined, done)
}

async function updateSubtask(ctx: ToolContext, id: Subtask["id"], content: string | undefined, done: boolean | undefined): Promise<Subtask> {
  const changeset = await ctx.workStorage.updateSubtask(id, {content, done})
  const updated = changeset.subtasks?.upserted?.[0]
  if (!updated) throw new ToolError(ToolErrorCode.NOT_FOUND, `No subtask "${id}".`)

  return updated
}
