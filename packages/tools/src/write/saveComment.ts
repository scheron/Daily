import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {readString, requireString} from "../input"
import {commentView} from "../views"

import type {TaskComment} from "@daily/protocol"
import type {Tool, ToolContext} from "../types"

export const saveCommentTool: Tool = {
  name: "save_comment",
  description:
    "Writes a comment on a task when no id is given, or rewrites the one named. A comment written this way is marked as coming from this caller, not as if typed in the app — that mark cannot be set from here.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {
      id: {type: "string", description: "The comment id, to rewrite it. Omitted to write a new one."},
      taskId: {type: "string", description: "The task the comment belongs to. Required when writing a new one; ignored when rewriting."},
      content: {type: "string", description: "The comment's text, as Markdown. Required."},
    },
    required: ["content"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = readString(input, "id")
    const content = requireString(input, "content")
    if (!content.trim()) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"content" cannot be blank.')

    const comment = id === undefined ? await createComment(ctx, input, content) : await updateComment(ctx, id, content)

    return {comment: commentView(comment)}
  },
}

async function createComment(ctx: ToolContext, input: Record<string, unknown>, content: string): Promise<TaskComment> {
  const taskId = requireString(input, "taskId")

  const changeset = await ctx.workStorage.createComment(taskId, content, ctx.source)
  const created = changeset.comments?.upserted?.[0]
  if (!created) throw new ToolError(ToolErrorCode.NOT_FOUND, `No task "${taskId}" that can take a comment.`)

  return created
}

async function updateComment(ctx: ToolContext, id: TaskComment["id"], content: string): Promise<TaskComment> {
  const changeset = await ctx.workStorage.updateComment(id, content)
  const updated = changeset.comments?.upserted?.[0]
  if (!updated) throw new ToolError(ToolErrorCode.NOT_FOUND, `No comment "${id}".`)

  return updated
}
