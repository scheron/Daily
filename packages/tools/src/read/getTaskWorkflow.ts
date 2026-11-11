import {requireString} from "../input"
import {TASK_WORKFLOW_INSTRUCTIONS} from "../taskWorkflowInstructions"

import type {Tool} from "../types"

export const getTaskWorkflowTool: Tool = {
  name: "get_task_workflow",
  description: `Reads the selected task's current revision, durable workflow records, pending planning proposals, sessions and confirmed active seconds. ${TASK_WORKFLOW_INSTRUCTIONS}`,
  mode: "read",
  inputSchema: {
    type: "object",
    properties: {taskId: {type: "string", description: "The selected task id."}},
    required: ["taskId"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    return ctx.workStorage.getTaskWorkflow(requireString(input, "taskId"))
  },
}
