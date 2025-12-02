import type {Task} from "@shared/types/storage"

export function countTasks(tasks: Task[]) {
  return tasks.reduce(
    (acc, task) => {
      if (task.status === "active") acc.active++
      else if (task.status === "done") acc.done++
      else if (task.status === "discarded") acc.discarded++

      return acc
    },
    {active: 0, done: 0, discarded: 0, total: tasks.length},
  )
}
