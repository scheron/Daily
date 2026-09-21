import {MAIN_BRANCH_ID} from "@daily/protocol"

import {AgentToolError} from "../../../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../../errors/agent/AgentToolErrorCode"
import {projectView} from "../../views"
import {readString} from "../input"

import type {Branch} from "@daily/protocol"
import type {AgentToolContext} from "../../AgentWorkspace"
import type {AgentTool} from "../types"

export const saveProjectTool: AgentTool = {
  name: "save_project",
  description: "Creates a project when no id is given, or renames/edits the one named.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {
      id: {type: "string", description: "The project id, to edit it. Omitted to create one."},
      name: {type: "string", description: "The project's name. Required when creating."},
      description: {type: "string", description: "Markdown notes about the project."},
    },
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = readString(input, "id")
    const name = readString(input, "name")
    const description = readString(input, "description")

    const project = id === undefined ? await createProject(ctx, name, description) : await updateProject(ctx, id, name, description)

    return {project: projectView(project)}
  },
}

async function createProject(ctx: AgentToolContext, name: string | undefined, description: string | undefined): Promise<Branch> {
  if (!name) throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, '"name" is required.')

  const project = await ctx.core.branchesService.createBranch({name, description: description ?? ""})
  if (!project) throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, `A project named "${name}" already exists.`)

  return project
}

async function updateProject(ctx: AgentToolContext, id: Branch["id"], name: string | undefined, description: string | undefined): Promise<Branch> {
  const project = await ctx.core.branchesService.updateBranch(id, {name, description})
  if (!project) {
    const reason =
      id === MAIN_BRANCH_ID && name !== undefined
        ? '"main" cannot be renamed.'
        : `Could not update project "${id}" — check its id and whether the name is already taken.`
    throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, reason)
  }

  return project
}
