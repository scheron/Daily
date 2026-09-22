import {AgentToolError} from "../../../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../../errors/agent/AgentToolErrorCode"
import {commentView} from "../../views"
import {readString, requireString} from "../input"

import type {TaskComment} from "@daily/protocol"
import type {AgentToolContext} from "../../AgentWorkspace"
import type {AgentTool} from "../types"

export const saveCommentTool: AgentTool = {
  name: "save_comment",
  description:
    "Writes a comment on a task when no id is given, or rewrites the one named. A comment written this way is marked as coming through MCP, under this agent's own name — neither can be set from here.",
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
    if (!content.trim()) throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, '"content" cannot be blank.')

    const comment = id === undefined ? await createComment(ctx, input, content) : await updateComment(ctx, id, content)

    return {comment: commentView(comment)}
  },
}

async function createComment(ctx: AgentToolContext, input: Record<string, unknown>, content: string): Promise<TaskComment> {
  const taskId = requireString(input, "taskId")

  const created = await ctx.core.taskCommentsService.createComment(taskId, content, {kind: "mcp", provider: ctx.agent.name})
  if (!created) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No task "${taskId}" that can take a comment.`)

  return created
}

async function updateComment(ctx: AgentToolContext, id: TaskComment["id"], content: string): Promise<TaskComment> {
  const updated = await ctx.core.taskCommentsService.updateComment(id, content)
  if (!updated) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No comment "${id}".`)

  return updated
}
