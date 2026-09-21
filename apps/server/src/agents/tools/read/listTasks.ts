import {isNumber, isObject} from "@daily/std"

import {AgentToolError} from "../../../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../../errors/agent/AgentToolErrorCode"
import {taskFiles} from "../../attachments"
import {taskView} from "../../views"
import {readEnum, readInteger, readISODate, readString} from "../input"

import type {Task, TaskStatus} from "@daily/protocol"
import type {AgentToolContext} from "../../AgentWorkspace"
import type {TaskView} from "../../views"
import type {AgentTool} from "../types"

const TASK_STATUSES = ["active", "backlog", "done", "discarded"] as const
const DEFAULT_LIMIT = 50

type ListTasksFilters = {
  projectId?: string
  status?: TaskStatus
  date?: string
  from?: string
  to?: string
  milestoneId?: string
  tagId?: string
}

export const listTasksTool: AgentTool = {
  name: "list_tasks",
  description:
    "Lists tasks across every project, filterable by project, status, one day, a date range, milestone, tag or a search phrase. Dated tasks come first, ordered by day; backlog tasks follow.",
  mode: "read",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {type: "string", description: "Only tasks in this project."},
      status: {type: "string", description: "Only tasks in this status.", enum: TASK_STATUSES},
      date: {type: "string", description: "Only tasks scheduled on this day, YYYY-MM-DD."},
      from: {type: "string", description: "Only tasks scheduled on or after this day, YYYY-MM-DD."},
      to: {type: "string", description: "Only tasks scheduled on or before this day, YYYY-MM-DD."},
      milestoneId: {type: "string", description: "Only tasks in this milestone."},
      tagId: {type: "string", description: "Only tasks carrying this tag."},
      search: {type: "string", description: "A phrase to search task content by, most relevant first."},
      limit: {type: "integer", description: "Page size, 1-200. Defaults to 50.", minimum: 1, maximum: 200},
      cursor: {type: "string", description: "The nextCursor answered by a previous page."},
    },
    additionalProperties: false,
  },
  async run(input, ctx) {
    const filters: ListTasksFilters = {
      projectId: readString(input, "projectId"),
      status: readEnum(input, "status", TASK_STATUSES),
      date: readISODate(input, "date"),
      from: readISODate(input, "from"),
      to: readISODate(input, "to"),
      milestoneId: readString(input, "milestoneId"),
      tagId: readString(input, "tagId"),
    }
    const search = readString(input, "search")
    const limit = readInteger(input, "limit", {min: 1, max: 200}) ?? DEFAULT_LIMIT
    const cursor = readString(input, "cursor")
    const offset = cursor === undefined ? 0 : decodeCursor(cursor)

    const branches = await ctx.core.branchesService.getBranchList()
    const projectNames = new Map(branches.map((branch) => [branch.id, branch.name]))

    const live = await ctx.core.tasksService.getTaskList({includeBacklog: true})
    const ordered = search === undefined ? [...live].sort(compareTasks) : await searchOrder(ctx, live, search)

    const filtered = ordered.filter((task) => matchesFilters(task, filters))
    const total = filtered.length
    const page = filtered.slice(offset, offset + limit)
    const nextOffset = offset + limit
    const nextCursor = nextOffset < total ? encodeCursor(nextOffset) : null

    const tasks: TaskView[] = []
    for (const task of page) {
      const imageCount = (await taskFiles(ctx, task)).length
      tasks.push(taskView(task, projectNames.get(task.branchId) ?? "", imageCount))
    }

    return {tasks, total, nextCursor}
  },
}

async function searchOrder(ctx: AgentToolContext, live: Task[], search: string): Promise<Task[]> {
  await ctx.core.searchService.initializeIndex()
  const results = await ctx.core.searchService.searchTasks(search)

  const byId = new Map(live.map((task) => [task.id, task]))
  const ordered: Task[] = []
  for (const result of results) {
    const task = byId.get(result.task.id)
    if (task) ordered.push(task)
  }

  return ordered
}

function matchesFilters(task: Task, filters: ListTasksFilters): boolean {
  if (filters.projectId !== undefined && task.branchId !== filters.projectId) return false
  if (filters.status !== undefined && task.status !== filters.status) return false
  if (filters.date !== undefined && task.scheduled?.date !== filters.date) return false
  if (filters.from !== undefined && (!task.scheduled || task.scheduled.date < filters.from)) return false
  if (filters.to !== undefined && (!task.scheduled || task.scheduled.date > filters.to)) return false
  if (filters.milestoneId !== undefined && task.milestoneId !== filters.milestoneId) return false
  if (filters.tagId !== undefined && !task.tags.some((tag) => tag.id === filters.tagId)) return false

  return true
}

/** Dated tasks first, by day then manual order; backlog tasks after, by manual order. Ties break on id. */
function compareTasks(a: Task, b: Task): number {
  const aDated = a.scheduled !== null
  const bDated = b.scheduled !== null
  if (aDated !== bDated) return aDated ? -1 : 1

  if (aDated && bDated) {
    const dateDiff = a.scheduled!.date.localeCompare(b.scheduled!.date)
    if (dateDiff !== 0) return dateDiff
  }

  const orderDiff = a.orderIndex - b.orderIndex
  if (orderDiff !== 0) return orderDiff

  return a.id.localeCompare(b.id)
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({o: offset})).toString("base64url")
}

function decodeCursor(raw: string): number {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))
    if (!isObject<{o: unknown}>(parsed) || !isNumber(parsed.o) || parsed.o < 0) throw new Error("malformed cursor")

    return parsed.o
  } catch {
    throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, `"cursor" is not a valid page cursor`)
  }
}
