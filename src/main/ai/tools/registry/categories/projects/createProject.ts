import {formatProject} from "../../helpers"

import type {RegisteredTool} from "../../types"

export const createProject: RegisteredTool = {
  name: "create_project",
  description: "Create a new project.",
  parameters: {
    type: "object",
    properties: {
      name: {type: "string", description: "Project name."},
    },
    required: ["name"],
  },
  isWrite: true,
  isDestructive: false,
  async execute(params, ctx) {
    const name = (params.name as string | undefined)?.trim()
    if (!name) {
      return {success: false, error: "name is required"}
    }

    const created = await ctx.storage.createBranch({name})
    if (!created) {
      return {success: false, error: `Failed to create project "${name}" (possible duplicate name)`}
    }

    return {
      success: true,
      data: `Project created: ${formatProject(created)}`,
      changedEntities: [{type: "project", id: created.id, action: "created"}],
    }
  },
}
