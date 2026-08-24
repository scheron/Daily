import type {RegisteredTool} from "../../types"

export const switchProject: RegisteredTool = {
  name: "switch_project",
  description: "Switch active project context.",
  parameters: {
    type: "object",
    properties: {
      project_id: {type: "string", description: "Project ID to activate. Get from list_projects."},
    },
    required: ["project_id"],
  },
  isWrite: true,
  isDestructive: false,
  async execute(params, ctx) {
    const projectId = params.project_id as string
    if (!projectId) {
      return {success: false, error: "project_id is required"}
    }

    const project = await ctx.storage.getBranch(projectId)
    if (!project) {
      return {success: false, error: `Project not found: ${projectId}`}
    }

    await ctx.storage.setActiveBranch(project.id)
    return {
      success: true,
      data: `Active project switched to: ${project.name} (${project.id})`,
      changedEntities: [{type: "project", id: project.id, action: "updated"}],
    }
  },
}
