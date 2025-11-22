import type {TasksFilter} from "@/types/filters"
import type {Day, Task} from "@/types/tasks"

import {arrayRemoveDuplicates} from "./arrays"

export function updateDayStats(day: Day): Day {
  const countActive = day.tasks.filter((task) => task.status === "active").length
  const countDone = day.tasks.filter((task) => task.status === "done").length

  const usedTags = new Set(day.tasks.flatMap((t) => t.tags.map((tag) => tag.name)))
  const updatedTags = day.tags.filter((tag) => usedTags.has(tag.name))

  return {
    ...day,
    countActive,
    countDone,
    tags: arrayRemoveDuplicates(updatedTags, "name"),
  }
}

export function updateDays(days: Day[], updatedDay: Day): Day[] {
  const dayWithStats = updateDayStats(updatedDay)
  const updatedDays = [...days]

  const dayIndex = updatedDays.findIndex((day) => day.date === dayWithStats.date)

  if (dayIndex === -1) return updatedDays.concat(dayWithStats)

  updatedDays.splice(dayIndex, 1, dayWithStats)

  return updatedDays
}

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

export function filterTasksByStatus(tasks: Task[], filter: TasksFilter): Task[] {
  if (filter === "all") return tasks
  return tasks.filter((task) => task.status === filter)
}
