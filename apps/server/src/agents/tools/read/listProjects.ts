import {projectView} from "../../views"

import type {AgentTool} from "../types"

export const listProjectsTool: AgentTool = {
  name: "list_projects",
  description: "Lists every live project.",
  mode: "read",
  inputSchema: {type: "object", properties: {}, additionalProperties: false},
  async run(_input, ctx) {
    const branches = await ctx.core.branchesService.getBranchList()

    return {projects: branches.map(projectView)}
  },
}
