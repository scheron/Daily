import {formatTag} from "../../helpers"

import type {RegisteredTool} from "../../types"

export const getTag: RegisteredTool = {
  name: "get_tag",
  description: "Get detailed information about a single tag by its ID.",
  parameters: {
    type: "object",
    properties: {
      tag_id: {type: "string", description: "Tag ID to look up."},
    },
    required: ["tag_id"],
  },
  isWrite: false,
  isDestructive: false,
  async execute(params, ctx) {
    const tagId = params.tag_id as string
    if (!tagId) {
      return {success: false, error: "tag_id is required"}
    }

    const tag = await ctx.storage.getTag(tagId)
    if (!tag) {
      return {success: false, error: `Tag not found: ${tagId}`}
    }

    return {success: true, data: `Tag details: ${formatTag(tag)}\nCreated: ${tag.createdAt}`}
  },
}
