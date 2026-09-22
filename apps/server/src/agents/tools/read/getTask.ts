import {requireString} from "../input"
import {readTaskDetail} from "../readTaskDetail"

import type {AgentTool} from "../types"

export const getTaskTool: AgentTool = {
  name: "get_task",
  description:
    "Answers one task in full: its fields, tags, milestone, both relation sides, its history newest first, its attachments, and its comments oldest first with the id each one is edited or deleted by.",
  mode: "read",
  inputSchema: {
    type: "object",
    properties: {id: {type: "string", description: "The task id."}},
    required: ["id"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    return readTaskDetail(ctx, requireString(input, "id"))
  },
}
