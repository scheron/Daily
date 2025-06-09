import {DateTime} from "luxon"

import type {ISODate} from "@/types/date"
import type {Day, DayItem, Task} from "@/types/tasks"

export function groupTasksByDay(tasks: Task[], days: DayItem[]): Day[] {
  const tasksByDay = new Map<string, Task[]>()

  for (const task of tasks) {
    const taskDate = task.scheduled.date
    const dayTasks = tasksByDay.get(taskDate) || []

    dayTasks.push(task)
    tasksByDay.set(taskDate, dayTasks)
  }

  return days.map((day) => {
    const tasks = tasksByDay.get(day.date) || []
    const sortedTasks = sortScheduledTasks(tasks, "desc")
    const countActive = sortedTasks.filter((task) => !task.done).length
    const countDone = sortedTasks.length - countActive

    return {
      id: day.id,
      date: day.date,
      subtitle: day.subtitle,
      countActive,
      countDone,
      tasks: sortedTasks,
    }
  })
}

function sortScheduledTasks<T extends {scheduled: {date: ISODate; time?: string}}>(tasks: T[], direction: "asc" | "desc" = "asc"): T[] {
  return [...tasks].sort((a, b) => {
    const aTime = a.scheduled.time ?? "00:00"
    const bTime = b.scheduled.time ?? "00:00"
    const aMillis = DateTime.fromISO(`${a.scheduled.date}T${aTime}`).toMillis()
    const bMillis = DateTime.fromISO(`${b.scheduled.date}T${bTime}`).toMillis()
    return direction === "asc" ? aMillis - bMillis : bMillis - aMillis
  })
}
