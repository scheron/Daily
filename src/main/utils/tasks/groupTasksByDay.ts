import {removeDuplicates} from "@shared/utils/arrays/removeDuplicates"
import {sortTasksByOrderIndex} from "@shared/utils/tasks/orderIndex"

import type {ISODate} from "@shared/types/common"
import type {Day, Tag, Task} from "@shared/types/storage"

export function groupTasksByDay(params: {tasks: Task[]; tags: Tag[]}): Day[] {
  const {tasks, tags} = params

  const taskDates = new Set<ISODate>()
  const tasksByDay = new Map<string, Task[]>()
  const tagsByDay = new Map<string, Tag[]>()

  const tagsMap = new Map<Tag["name"], Tag>()

  for (const tag of tags) {
    tagsMap.set(tag.name, tag)
  }

  for (const task of tasks) {
    const taskDate = task.scheduled.date
    const dayTasks = tasksByDay.get(taskDate) || []

    dayTasks.push(task)
    tasksByDay.set(taskDate, dayTasks)
    taskDates.add(taskDate)

    const taskTags = task.tags.map(({name}) => tagsMap.get(name)).filter(Boolean) as Tag[]

    if (!tagsByDay.has(taskDate)) tagsByDay.set(taskDate, [])

    const newTags = tagsByDay.get(taskDate)!.concat(taskTags).filter(Boolean) as Tag[]
    tagsByDay.set(taskDate, newTags)
  }

  return Array.from(taskDates).map((date) => {
    const tasks = sortTasksByOrderIndex(tasksByDay.get(date) || [])
    const tags = tagsByDay.get(date) || []
    const countActive = tasks.filter((task) => task.status === "active").length
    const countDone = tasks.filter((task) => task.status === "done").length

    return {
      id: date.replaceAll("-", ""),
      date,
      countActive,
      countDone,
      tasks,
      tags: removeDuplicates(tags, "name"),
    }
  })
}
