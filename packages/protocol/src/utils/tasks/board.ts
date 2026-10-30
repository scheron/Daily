import {sortTasksByOrderIndex} from "./orderIndex"

import type {ISODate} from "../../types/common"
import type {BoardMode, Task, TaskStatus} from "../../types/storage"

export const TASK_STATUSES: readonly TaskStatus[] = ["backlog", "todo", "ready_for_agent", "in_progress", "ready_to_merge", "done", "cancelled"]

/** The display column of a true status; grouping never writes a task. */
export function boardColumnForStatus(status: TaskStatus, mode: BoardMode): TaskStatus {
  if (mode === "normal" && status === "ready_for_agent") return "backlog"
  if (mode === "normal" && status === "ready_to_merge") return "in_progress"
  return status
}

/** Backlog and undated readiness are available on every day; dated tasks stay on their day. */
export function isTaskOnDayBoard(task: Pick<Task, "status" | "scheduled">, date: ISODate): boolean {
  return task.status === "backlog" || (task.status === "ready_for_agent" && !task.scheduled) || task.scheduled?.date === date
}

/** Groups true statuses for display and orders by stored indices without mutating tasks. */
export function groupTasksForBoard(tasks: Task[], mode: BoardMode): Record<TaskStatus, Task[]> {
  const grouped: Record<TaskStatus, Task[]> = {
    backlog: [],
    todo: [],
    ready_for_agent: [],
    in_progress: [],
    ready_to_merge: [],
    done: [],
    cancelled: [],
  }
  for (const task of sortTasksByOrderIndex(tasks)) grouped[boardColumnForStatus(task.status, mode)].push(task)
  return grouped
}

export function isResolvedTaskStatus(status: TaskStatus): boolean {
  return status === "done" || status === "cancelled"
}
