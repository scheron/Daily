import {TAG_QUICK_COLORS} from "@shared/constants/theme/colorPalette"

import {formatTag} from "@/ai/utils/formatTag"

import type {RegisteredTool} from "../../types"

export const createTag: RegisteredTool = {
  name: "create_tag",
  description:
    "Create a new tag for categorizing tasks. Use when user wants a new category/label. Example: 'create a tag for work tasks' or 'add a new personal tag'.",
  parameters: {
    type: "object",
    properties: {
      name: {type: "string", description: "Tag name. Keep it short (1-2 words). Example: 'Work', 'Personal', 'Urgent'."},
      color: {
        type: "string",
        description: "Hex color code. Example: '#FF5733' for orange-red. If not specified, a random color is assigned.",
      },
    },
    required: ["name"],
  },
  isWrite: true,
  isDestructive: false,
  async execute(params, ctx) {
    const name = params.name as string
    if (!name) {
      return {success: false, error: "name is required"}
    }

    const color = (params.color as string) || TAG_QUICK_COLORS[Math.floor(Math.random() * TAG_QUICK_COLORS.length)]

    const created = await ctx.storage.createTag({name, color, deletedAt: null})

    if (!created) {
      return {success: false, error: "Failed to create tag"}
    }

    return {
      success: true,
      data: `Tag created: ${formatTag(created)}`,
      changedEntities: [{type: "tag", id: created.id, action: "created"}],
    }
  },
}
