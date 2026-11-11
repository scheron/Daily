import {TaskWorkflowError} from "@daily/core/storage/TaskWorkflowError"

import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {requireString} from "../input"
import {readTaskDetail} from "../readTaskDetail"

import type {Tool} from "../types"

export const getTaskTool: Tool = {
  name: "get_task",
  description:
    "Answers one task in full with its exact status regardless of Normal / Agents board mode: fields, tags, milestone, relations, history, attachments, comments and subtasks. Includes its observed workflow revision, pending proposals and confirmed active seconds. Read get_task_workflow for full workflow records and sessions; mutate stage, active work or pending planning suggestions with update_task_workflow.",
  mode: "read",
  inputSchema: {
    type: "object",
    properties: {id: {type: "string", description: "The task id."}},
    required: ["id"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = requireString(input, "id")
    try {
      const {task: observedTask, revision, proposals, confirmedSeconds} = await ctx.workStorage.getTaskWorkflow(id)
      const task = await readTaskDetail(ctx, id, observedTask)
      return {...task, workflow: {taskId: id, revision, proposals, confirmedSeconds}}
    } catch (error) {
      if (error instanceof TaskWorkflowError && error.code === "not_found") throw new ToolError(ToolErrorCode.NOT_FOUND, `No task "${id}".`)
      throw error
    }
  },
}
