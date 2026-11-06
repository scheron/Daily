import {NO_PROJECT_ID, normalizeProjectEmoji} from "@daily/protocol"

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
      emoji: {
        type: ["string", "null"],
        description: "One emoji for the project icon; null restores the standard icon. Omitted edits keep the current icon.",
      },
      description: {type: "string", description: "Markdown notes about the project."},
    },
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = readString(input, "id")
    const name = readString(input, "name")
    const description = readString(input, "description")
    const emojiInput = input.emoji === null ? null : readString(input, "emoji")
    const emoji = emojiInput === undefined ? undefined : normalizeProjectEmoji(emojiInput)
    if (emojiInput?.trim() && !emoji) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"emoji" must be one emoji.')

    const project = id === undefined ? await createProject(ctx, name, description, emoji) : await updateProject(ctx, id, name, description, emoji)

    return {project: projectView(project)}
  },
}

async function createProject(
  ctx: ToolContext,
  name: string | undefined,
  description: string | undefined,
  emoji: string | null | undefined,
): Promise<Branch> {
  if (!name) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"name" is required.')

  const changeset = await ctx.workStorage.createBranch({name, description: description ?? "", emoji})
  const project = changeset.branches?.upserted?.[0]
  if (!project) throw new ToolError(ToolErrorCode.INVALID_INPUT, `A project named "${name}" already exists.`)

  return project
}

async function updateProject(
  ctx: ToolContext,
  id: Branch["id"],
  name: string | undefined,
  description: string | undefined,
  emoji: string | null | undefined,
): Promise<Branch> {
  const changeset = await ctx.workStorage.updateBranch(id, {name, description, emoji})
  const project = changeset.branches?.upserted?.[0]
  if (!project) {
    const reason =
      id === NO_PROJECT_ID && name !== undefined
        ? '"main" cannot be renamed.'
        : `Could not update project "${id}" — check its id and whether the name is already taken.`
    throw new ToolError(ToolErrorCode.INVALID_INPUT, reason)
  }

  return project
}
