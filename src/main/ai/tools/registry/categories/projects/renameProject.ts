import {formatProject} from "../../helpers"

import type {RegisteredTool} from "../../types"

export const renameProject: RegisteredTool = {
  name: "rename_project",
  description: "Rename an existing project.",
  parameters: {
    type: "object",
    properties: {
      project_id: {type: "string", description: "Project ID to rename. Get from list_projects."},
      name: {type: "string", description: "New project name."},
    },
    required: ["project_id", "name"],
  },
  isWrite: true,
  isDestructive: false,
  async execute(params, ctx) {
    const projectId = params.project_id as string
    const name = (params.name as string | undefined)?.trim()

    if (!projectId) {
      return {success: false, error: "project_id is required"}
    }
    if (!name) {
      return {success: false, error: "name is required"}
    }

    const updated = await ctx.storage.updateBranch(projectId, {name})
    if (!updated) {
      return {success: false, error: `Failed to rename project: ${projectId}`}
    }

    return {
      success: true,
      data: `Project renamed: ${formatProject(updated)}`,
      changedEntities: [{type: "project", id: updated.id, action: "updated"}],
    }
  },
}
