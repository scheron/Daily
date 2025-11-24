import type {TasksFilter} from "@/types/filters"
import type {Task} from "@shared/types/storage"

export function filterTasksByStatus(tasks: Task[], filter: TasksFilter): Task[] {
  if (filter === "all") return tasks
  return tasks.filter((task) => task.status === filter)
}
