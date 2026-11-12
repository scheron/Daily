import {requireString} from "../input"
import {TASK_CONTEXT_INSTRUCTIONS, TASK_DOMAIN} from "../taskWorkflowInstructions"
import {taskWorkflowView} from "../views"

import type {Tool} from "../types"

export const getTaskWorkflowTool: Tool = {
  name: "get_task_workflow",
  description:
    "Reads a selected task's real status, current revision, effective guidance and completion permission, proposal decisions, independent sessions/history and host-observed active seconds. Use this context before work and at meaningful boundaries.",
  mode: "read",
  inputSchema: {
    type: "object",
    properties: {taskId: {type: "string", description: "The selected task id."}},
    required: ["taskId"],
    additionalProperties: false,
  },
  async run(input, ctx) {
    const state = await ctx.workStorage.getTaskWorkflow(requireString(input, "taskId"))
    return {...taskWorkflowView(state), domain: TASK_DOMAIN, instructions: TASK_CONTEXT_INSTRUCTIONS}
  },
}
