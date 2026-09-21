import {TAG_QUICK_COLORS} from "@daily/protocol"

import {AgentToolError} from "../../../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../../errors/agent/AgentToolErrorCode"
import {tagView} from "../../views"
import {readString} from "../input"

import type {Tag} from "@daily/protocol"
import type {AgentToolContext} from "../../AgentWorkspace"
import type {AgentTool} from "../types"

export const saveTagTool: AgentTool = {
  name: "save_tag",
  description: "Creates a tag when no id is given, or edits the one named.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {
      id: {type: "string", description: "The tag id, to edit it. Omitted to create one."},
      projectId: {type: "string", description: "The project the tag belongs to. Required when creating."},
      name: {type: "string", description: "The tag's name. Required when creating."},
      color: {type: "string", description: "A hex colour. Defaults to the app's own palette when creating."},
    },
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = readString(input, "id")
    const projectId = readString(input, "projectId")
    const name = readString(input, "name")
    const color = readString(input, "color")

    const tag = id === undefined ? await createTag(ctx, projectId, name, color) : await updateTag(ctx, id, name, color)

    return {tag: tagView(tag)}
  },
}

async function createTag(ctx: AgentToolContext, projectId: string | undefined, name: string | undefined, color: string | undefined): Promise<Tag> {
  if (!projectId) throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, '"projectId" is required.')
  if (!name) throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, '"name" is required.')

  const existing = await ctx.core.tagsService.getTagList(projectId)
  const resolvedColor = color ?? TAG_QUICK_COLORS[existing.length % TAG_QUICK_COLORS.length]

  const tag = await ctx.core.tagsService.createTag({branchId: projectId, name, color: resolvedColor, deletedAt: null})
  if (!tag) throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, "The tag could not be created.")

  return tag
}

async function updateTag(ctx: AgentToolContext, id: Tag["id"], name: string | undefined, color: string | undefined): Promise<Tag> {
  const updates: Partial<Pick<Tag, "name" | "color">> = {}
  if (name !== undefined) updates.name = name
  if (color !== undefined) updates.color = color

  const tag = await ctx.core.tagsService.updateTag(id, updates)
  if (!tag) throw new AgentToolError(AgentToolErrorCode.NOT_FOUND, `No tag "${id}".`)

  return tag
}
