import {projectView} from "../views"

import type {Tool} from "../types"

export const listProjectsTool: Tool = {
  name: "list_projects",
  description: "Lists every live project.",
  mode: "read",
  inputSchema: {type: "object", properties: {}, additionalProperties: false},
  async run(_input, ctx) {
    const branches = await ctx.workStorage.getBranchList()

    return {projects: branches.map(projectView)}
  },
}
