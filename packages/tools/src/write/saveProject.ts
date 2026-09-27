import {MAIN_BRANCH_ID} from "@daily/protocol"

import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {readString} from "../input"
import {projectView} from "../views"

import type {Branch} from "@daily/protocol"
import type {Tool, ToolContext} from "../types"

export const saveProjectTool: Tool = {
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

async function createProject(ctx: ToolContext, name: string | undefined, description: string | undefined): Promise<Branch> {
  if (!name) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"name" is required.')

  const changeset = await ctx.workStorage.createBranch({name, description: description ?? ""})
  const project = changeset.branches?.upserted?.[0]
  if (!project) throw new ToolError(ToolErrorCode.INVALID_INPUT, `A project named "${name}" already exists.`)

  return project
}

async function updateProject(ctx: ToolContext, id: Branch["id"], name: string | undefined, description: string | undefined): Promise<Branch> {
  const changeset = await ctx.workStorage.updateBranch(id, {name, description})
  const project = changeset.branches?.upserted?.[0]
  if (!project) {
    const reason =
      id === MAIN_BRANCH_ID && name !== undefined
        ? '"main" cannot be renamed.'
        : `Could not update project "${id}" — check its id and whether the name is already taken.`
    throw new ToolError(ToolErrorCode.INVALID_INPUT, reason)
  }

  return project
}
