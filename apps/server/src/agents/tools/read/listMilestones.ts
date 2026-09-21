import {isMilestoneClosed, sortMilestones} from "@daily/protocol"

import {milestoneView} from "../../views"
import {readBoolean, readString} from "../input"

import type {Milestone, MilestoneProgress, Task} from "@daily/protocol"
import type {AgentTool} from "../types"

export const listMilestonesTool: AgentTool = {
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

    const milestones = await ctx.core.milestonesService.getMilestoneList(projectId)
    const tasks = await ctx.core.tasksService.getTaskList({includeBacklog: true})

    const withProgress = milestones.map((milestone) => ({...milestone, progress: progressFor(milestone, tasks)}))
    const ordered = sortMilestones(withProgress)
    const visible = includeClosed ? ordered : ordered.filter((milestone) => !isMilestoneClosed(milestone.progress))

    return {milestones: visible.map((milestone) => milestoneView(milestone, milestone.progress))}
  },
}

function progressFor(milestone: Milestone, tasks: Task[]): MilestoneProgress {
  const inMilestone = tasks.filter((task) => task.milestoneId === milestone.id)
  const resolved = inMilestone.filter((task) => task.status === "done" || task.status === "discarded")

  return {total: inMilestone.length, resolved: resolved.length}
}
