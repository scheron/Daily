import {formatTag} from "@/ai/utils/formatters"

import type {RegisteredTool} from "../../types"

export const listTags: RegisteredTool = {
  name: "list_tags",
  description:
    "Get all available tags with their IDs, names, and colors. ALWAYS call this first before add_task_tags or create_task with tags to get valid tag_ids. Example: User asks 'what tags do I have?' or before assigning tags to a task.",
  parameters: {
    type: "object",
    properties: {},
  },
  isWrite: false,
  isDestructive: false,
  async execute(_params, ctx) {
    const tags = await ctx.storage.getTagList()

    if (tags.length === 0) {
      return {success: true, data: "No tags found"}
    }

    const tagList = tags.map((t, i) => `${i + 1}. ${formatTag(t)}`).join("\n")
    return {success: true, data: `Tags (${tags.length} total):\n${tagList}`}
  },
}
