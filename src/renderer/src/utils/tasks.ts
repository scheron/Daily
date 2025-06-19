import { DateTime } from "luxon"

import type { ISODate } from "@/types/date"
import type { Day, Tag, Task } from "@/types/tasks"

import { arrayRemoveDuplicates } from "./arrays"

type GroupTasksByDayParams = {
  tasks: Task[]
  tags: Tag[]
}



export function groupTasksByDay(params: GroupTasksByDayParams): Day[] {
  const {tasks,  tags} = params

  const taskDates = new Set<ISODate>()
  const tasksByDay = new Map<string, Task[]>()
  const tagsByDay = new Map<string, Tag[]>()

  const tagsMap = new Map<Tag["id"], Tag>()

  for (const tag of tags) {
    tagsMap.set(tag.id, tag)
  }

  for (const task of tasks) {
    const taskDate = task.scheduled.date
    const dayTasks = tasksByDay.get(taskDate) || []

    dayTasks.push(task)
    tasksByDay.set(taskDate, dayTasks)
    taskDates.add(taskDate)

    const taskTags = task.tags.map(({id}) => tagsMap.get(id)).filter(Boolean) as Tag[]

    if (!tagsByDay.has(taskDate)) tagsByDay.set(taskDate, [])

    const newTags = tagsByDay.get(taskDate)!.concat(taskTags).filter(Boolean) as Tag[]
    tagsByDay.set(taskDate, newTags)
  }

  return Array.from(taskDates).map((date) => {
    const tasks = tasksByDay.get(date) || []
    const tags = tagsByDay.get(date) || []
    const sortedTasks = sortScheduledTasks(tasks, "desc")
    const countActive = sortedTasks.filter((task) => task.status === "active").length
    const countDone = sortedTasks.filter((task) => task.status === "done").length


    return {
      id: date.replaceAll("-", ""),
      date,
      countActive,
      countDone,
      tasks: sortedTasks,
      tags: arrayRemoveDuplicates(tags, "id"),
    }
  })
}

export function sortScheduledTasks<T extends {scheduled: {date: ISODate; time?: string}}>(tasks: T[], direction: "asc" | "desc" = "asc"): T[] {
  return tasks.toSorted((a, b) => {
    const aTime = a.scheduled.time || "00:00:00"
    const bTime = b.scheduled.time || "00:00:00"

    const aDateTime = DateTime.fromISO(`${a.scheduled.date}T${aTime}`)
    const bDateTime = DateTime.fromISO(`${b.scheduled.date}T${bTime}`)

    if (!aDateTime.isValid || !bDateTime.isValid) {
      console.error("Invalid date/time format:", {a, b, aDateTime, bDateTime})
      return 0
    }

    const aMillis = aDateTime.toMillis()
    const bMillis = bDateTime.toMillis()

    return direction === "asc" ? aMillis - bMillis : bMillis - aMillis
  })
}

export function updateDayStats(day: Day): Day {
  const countActive = day.tasks.filter((task) => task.status === "active").length
  const countDone = day.tasks.filter((task) => task.status === "done").length

  const usedTags = new Set(day.tasks.flatMap((t) => t.tags.map((tag) => tag.id)))
  const updatedTags = day.tags.filter((tag) => usedTags.has(tag.id))

  return {
    ...day,
    countActive,
    countDone,
    tags: arrayRemoveDuplicates(updatedTags, "id"),
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
