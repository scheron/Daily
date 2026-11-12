import {TaskWorkflowError} from "@daily/core/storage/TaskWorkflowError"

import {TASK_DOMAIN} from "../constants/tasks/taskDomain"
import {TASK_CONTEXT_INSTRUCTIONS} from "../constants/workflow/instructions"
import {readTaskDetail} from "../utils/tasks/readTaskDetail"
import {workflowGuidanceView} from "../utils/workflow/workflowGuidanceView"
import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {requireString} from "../input"

import type {Tool} from "../types"

export const getTaskTool: Tool = {
  name: "get_task",
  description:
    "Answers one task in full with exact real status, fields, relations, history, attachments, comments and subtasks. Its workflow includes the observed revision, effective scoped guidance, completion permission, proposal decisions and sessions. Reconcile status and session proactively at meaningful work boundaries using update_task_workflow.",
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
      const {task: observedTask, revision, proposals, confirmedSeconds, guidance, sessions} = await ctx.workStorage.getTaskWorkflow(id)
      const task = await readTaskDetail(ctx, id, observedTask)
      return {
        ...task,
        workflow: {
          taskId: id,
          revision,
          proposals,
          confirmedSeconds,
          guidance: workflowGuidanceView(guidance),
          sessions,
          domain: TASK_DOMAIN,
          instructions: TASK_CONTEXT_INSTRUCTIONS,
        },
      }
    } catch (error) {
      if (error instanceof TaskWorkflowError && error.code === "not_found") throw new ToolError(ToolErrorCode.NOT_FOUND, `No task "${id}".`)
      throw error
    }
  },
}
