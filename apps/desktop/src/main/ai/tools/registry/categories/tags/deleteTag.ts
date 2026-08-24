import type {RegisteredTool} from "../../types"

export const deleteTag: RegisteredTool = {
  name: "delete_tag",
  description:
    "Delete a tag completely. Automatically removes this tag from all tasks that have it. Ask for confirmation as this affects all tasks with this tag.",
  parameters: {
    type: "object",
    properties: {
      tag_id: {type: "string", description: "Tag ID to delete. Get from list_tags."},
    },
    required: ["tag_id"],
  },
  isWrite: true,
  isDestructive: true,
  async execute(params, ctx) {
    const tagId = params.tag_id as string
    if (!tagId) {
      return {success: false, error: "tag_id is required"}
    }

    const deleted = await ctx.storage.deleteTag(tagId)

    if (!deleted) {
      return {success: false, error: `Tag not found: ${tagId}`}
    }

    return {
      success: true,
      data: `Tag deleted: ${tagId}`,
      changedEntities: [{type: "tag", id: tagId, action: "deleted"}],
    }
  },
}
