import {ToolError} from "../errors/ToolError"
import {ToolErrorCode} from "../errors/ToolErrorCode"
import {readISODate, readString} from "../input"
import {milestoneProgress} from "../milestoneProgress"
import {milestoneView} from "../views"

import type {ISODate, Milestone} from "@daily/protocol"
import type {Tool, ToolContext} from "../types"

export const saveMilestoneTool: Tool = {
  name: "save_milestone",
  description: "Creates a milestone when no id is given, or edits the one named. Its progress and closed state are always derived, never set.",
  mode: "write",
  inputSchema: {
    type: "object",
    properties: {
      id: {type: "string", description: "The milestone id, to edit it. Omitted to create one."},
      projectId: {type: "string", description: "The project the milestone belongs to. Required when creating."},
      name: {type: "string", description: "The milestone's name. Required when creating."},
      description: {type: "string", description: "Markdown notes about the milestone."},
      targetDate: {type: ["string", "null"], description: "The day the milestone is meant to finish by, YYYY-MM-DD, or null to clear it."},
    },
    additionalProperties: false,
  },
  async run(input, ctx) {
    const id = readString(input, "id")
    const projectId = readString(input, "projectId")
    const name = readString(input, "name")
    const description = readString(input, "description")
    const rawTargetDate = input.targetDate
    const targetDate = rawTargetDate === null ? null : readISODate(input, "targetDate")

    const milestone =
      id === undefined
        ? await createMilestone(ctx, projectId, name, description, targetDate)
        : await updateMilestone(ctx, id, name, description, targetDate)

    const tasks = await ctx.workStorage.getTaskList({includeBacklog: true})

    return {milestone: milestoneView(milestone, milestoneProgress(milestone, tasks))}
  },
}

async function createMilestone(
  ctx: ToolContext,
  projectId: string | undefined,
  name: string | undefined,
  description: string | undefined,
  targetDate: ISODate | null | undefined,
): Promise<Milestone> {
  if (!projectId) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"projectId" is required.')
  if (!name) throw new ToolError(ToolErrorCode.INVALID_INPUT, '"name" is required.')

  const changeset = await ctx.workStorage.createMilestone({
    branchId: projectId,
    name,
    description: description ?? "",
    targetDate: targetDate ?? null,
    deletedAt: null,
  })
  const milestone = changeset.milestones?.upserted?.[0]
  if (!milestone) throw new ToolError(ToolErrorCode.INVALID_INPUT, "The milestone could not be created.")

  return milestone
}

async function updateMilestone(
  ctx: ToolContext,
  id: Milestone["id"],
  name: string | undefined,
  description: string | undefined,
  targetDate: ISODate | null | undefined,
): Promise<Milestone> {
  const updates: Partial<Pick<Milestone, "name" | "description" | "targetDate">> = {}
  if (name !== undefined) updates.name = name
  if (description !== undefined) updates.description = description
  if (targetDate !== undefined) updates.targetDate = targetDate

  const changeset = await ctx.workStorage.updateMilestone(id, updates)
  const milestone = changeset.milestones?.upserted?.[0]
  if (!milestone) throw new ToolError(ToolErrorCode.NOT_FOUND, `No milestone "${id}".`)

  return milestone
}
