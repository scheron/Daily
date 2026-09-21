import {sortTags} from "@daily/protocol"

import {tagView} from "../../views"
import {readString} from "../input"

import type {AgentTool} from "../types"

export const listTagsTool: AgentTool = {
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
    const tags = await ctx.core.tagsService.getTagList(projectId)

    return {tags: sortTags(tags).map(tagView)}
  },
}
