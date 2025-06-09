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
    const sortedTasks = sortScheduledTasks(tasks, "asc")
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

function sortScheduledTasks<T extends {scheduled: {date: ISODate; time?: string; order?: number}}>(
  tasks: T[],
  direction: "asc" | "desc" = "asc",
): T[] {
  return [...tasks].sort((a, b) => {
    const orderA = a.scheduled.order
    const orderB = b.scheduled.order

    if (orderA != null && orderB != null) {
      return direction === "asc" ? orderA - orderB : orderB - orderA
    }

    const timeA = a.scheduled.time ?? "00:00"
    const timeB = b.scheduled.time ?? "00:00"

    const millisA = DateTime.fromISO(`${a.scheduled.date}T${timeA}`).toMillis()
    const millisB = DateTime.fromISO(`${b.scheduled.date}T${timeB}`).toMillis()

    return direction === "asc" ? millisA - millisB : millisB - millisA
  })
}
