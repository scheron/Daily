import {notUndefined} from "@shared/utils/common/validators"

import {formatTag} from "@/ai/utils/formatters"

import type {Tag} from "@shared/types/storage"
import type {RegisteredTool} from "../../types"

export const updateTag: RegisteredTool = {
  name: "update_tag",
  description: "Update an existing tag's name or color. Changes apply to all tasks that have this tag.",
  parameters: {
    type: "object",
    properties: {
      tag_id: {type: "string", description: "Tag ID to update. Get from list_tags."},
      name: {type: "string", description: "New tag name."},
      color: {type: "string", description: "New hex color code."},
    },
    required: ["tag_id"],
  },
  isWrite: true,
  isDestructive: false,
  async execute(params, ctx) {
    const tagId = params.tag_id as string
    if (!tagId) {
      return {success: false, error: "tag_id is required"}
    }

    const updates: Partial<Tag> = {}
    if (notUndefined(params.name)) updates.name = params.name as string
    if (notUndefined(params.color)) updates.color = params.color as string

    const updated = await ctx.storage.updateTag(tagId, updates)

    if (!updated) {
      return {success: false, error: `Tag not found: ${tagId}`}
    }

    return {
      success: true,
      data: `Tag updated: ${formatTag(updated)}`,
      changedEntities: [{type: "tag", id: updated.id, action: "updated"}],
    }
  },
}
