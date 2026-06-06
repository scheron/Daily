import type {RegisteredTool} from "../../types"

export const deleteProject: RegisteredTool = {
  name: "delete_project",
  description: "Delete a project (soft delete). Main project cannot be deleted. Ask for confirmation before using this.",
  parameters: {
    type: "object",
    properties: {
      project_id: {type: "string", description: "Project ID to delete. Get from list_projects."},
    },
    required: ["project_id"],
  },
  isWrite: true,
  isDestructive: true,
  async execute(params, ctx) {
    const projectId = params.project_id as string
    if (!projectId) {
      return {success: false, error: "project_id is required"}
    }

    const project = await ctx.storage.getBranch(projectId)
    if (!project) {
      return {success: false, error: `Project not found: ${projectId}`}
    }

    const deleted = await ctx.storage.deleteBranch(projectId)
    if (!deleted) {
      return {success: false, error: `Failed to delete project: ${projectId}`}
    }

    return {
      success: true,
      data: `Project deleted: ${project.name} (${project.id})`,
      changedEntities: [{type: "project", id: project.id, action: "deleted"}],
    }
  },
}
