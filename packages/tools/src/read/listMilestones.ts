import {isMilestoneClosed, sortMilestones} from "@daily/protocol"

import {readBoolean, readString} from "../input"
import {milestoneProgress} from "../milestoneProgress"
import {milestoneView} from "../views"

import type {Tool} from "../types"

export const listMilestonesTool: Tool = {
  name: "list_milestones",
  description: "Lists every live milestone, open ones before closed ones, each with its progress. Optionally scoped to one project.",
  mode: "read",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {type: "string", description: "Only milestones in this project."},
      includeClosed: {type: "boolean", description: "Include closed milestones. Defaults to true."},
    },
    additionalProperties: false,
  },
  async run(input, ctx) {
    const projectId = readString(input, "projectId")
    const includeClosed = readBoolean(input, "includeClosed") ?? true

    const milestones = await ctx.workStorage.getMilestoneList(projectId)
    const tasks = await ctx.workStorage.getTaskList({includeBacklog: true})

    const withProgress = milestones.map((milestone) => ({...milestone, progress: milestoneProgress(milestone, tasks)}))
    const ordered = sortMilestones(withProgress)
    const visible = includeClosed ? ordered : ordered.filter((milestone) => !isMilestoneClosed(milestone.progress))

    return {milestones: visible.map((milestone) => milestoneView(milestone, milestone.progress))}
  },
}
