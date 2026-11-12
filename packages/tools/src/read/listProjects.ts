import {TASK_DOMAIN} from "../constants/tasks/taskDomain"
import {TASK_CONTEXT_INSTRUCTIONS} from "../constants/workflow/instructions"
import {workflowGuidanceView} from "../utils/workflow/workflowGuidanceView"
import {projectView} from "../views"

import type {Tool} from "../types"

export const listProjectsTool: Tool = {
  name: "list_projects",
  description:
    "Lists every live project with effective workspace/project workflow guidance, completion permission and the real task domain, scheduling rules and time units.",
  mode: "read",
  inputSchema: {type: "object", properties: {}, additionalProperties: false},
  async run(_input, ctx) {
    const branches = await ctx.workStorage.getBranchList()

    const guidance = workflowGuidanceView(await ctx.workStorage.getWorkflowGuidance())
    const projects = await Promise.all(
      branches.map(async (branch) => {
        const {project, allowCompletion} = workflowGuidanceView(await ctx.workStorage.getWorkflowGuidance(branch.id))
        return {...projectView(branch), workflowGuidance: {project, allowCompletion}}
      }),
    )
    return {projects, guidance, domain: TASK_DOMAIN, instructions: TASK_CONTEXT_INSTRUCTIONS}
  },
}
