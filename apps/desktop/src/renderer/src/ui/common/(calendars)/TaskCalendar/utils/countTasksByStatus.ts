import {boardColumnForStatus} from "@daily/protocol"

import type {BoardMode, Task, TaskStatus} from "@daily/protocol"

export function countTasksByStatus(tasks: Task[], boardMode: BoardMode): Record<TaskStatus, number> {
  const counts = {backlog: 0, todo: 0, ready_for_agent: 0, in_progress: 0, ready_to_merge: 0, done: 0, cancelled: 0}

  for (const task of tasks) counts[boardColumnForStatus(task.status, boardMode)] += 1

  return counts
}
