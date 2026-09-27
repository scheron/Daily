import {TAG_QUICK_COLORS} from "@daily/protocol"

import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {readString} from "../input"
import {tagView} from "../views"

import type {Tag} from "@daily/protocol"
import type {Tool, ToolContext} from "../types"

export const saveTagTool: Tool = {
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

async function createTag(ctx: ToolContext, projectId: string | undefined, name: string | undefined, color: string | undefined): Promise<Tag> {
  if (!projectId) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"projectId" is required.')
  if (!name) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"name" is required.')

  const existing = await ctx.workStorage.getTagList(projectId)
  const resolvedColor = color ?? TAG_QUICK_COLORS[existing.length % TAG_QUICK_COLORS.length]

  const changeset = await ctx.workStorage.createTag({branchId: projectId, name, color: resolvedColor, deletedAt: null})
  const tag = changeset.tags?.upserted?.[0]
  if (!tag) throw new ToolError(ToolErrorCode.INVALID_INPUT, "The tag could not be created.")

  return tag
}

async function updateTag(ctx: ToolContext, id: Tag["id"], name: string | undefined, color: string | undefined): Promise<Tag> {
  const updates: Partial<Pick<Tag, "name" | "color">> = {}
  if (name !== undefined) updates.name = name
  if (color !== undefined) updates.color = color

  const changeset = await ctx.workStorage.updateTag(id, updates)
  const tag = changeset.tags?.upserted?.[0]
  if (!tag) throw new ToolError(ToolErrorCode.NOT_FOUND, `No tag "${id}".`)

  return tag
}
