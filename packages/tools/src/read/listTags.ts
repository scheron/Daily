import {sortTags} from "@daily/protocol"

import {readString} from "../input"
import {tagView} from "../views"

import type {Tool} from "../types"

export const listTagsTool: Tool = {
  name: "list_tags",
  description: "Lists every live tag. Optionally scoped to one project.",
  mode: "read",
  inputSchema: {
    type: "object",
    properties: {projectId: {type: "string", description: "Only tags in this project."}},
    additionalProperties: false,
  },
  async run(input, ctx) {
    const projectId = readString(input, "projectId")
    const tags = await ctx.workStorage.getTagList(projectId)

    return {tags: sortTags(tags).map(tagView)}
  },
}
