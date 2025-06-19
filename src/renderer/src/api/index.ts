import {arrayRemoveDuplicates} from "@/utils/arrays"
import {groupTasksByDay, sortScheduledTasks} from "@/utils/tasks"
import {DateTime} from "luxon"
import {nanoid} from "nanoid"

import type {ISODate} from "@/types/date"
import type {Storage} from "@/types/storage"
import type {Day, Tag, Task} from "@/types/tasks"

function defineApi(): Storage {
  /**
   * Get days from the database
   * @param params - The parameters for the query
   * @param params.from - The start date formatted as YYYY-MM-DD
   * @param params.to - The end date formatted as YYYY-MM-DD
   * @returns The tasks that match the query
   */
  async function getDays(params: {from?: ISODate; to?: ISODate} = {}): Promise<Day[]> {
    const {from, to} = params
    const fromDate = from ? from : DateTime.now().minus({years: 1}).toISODate()!
    const toDate = to ? to : DateTime.now().plus({years: 1}).toISODate()!

    const {tasks: allTasks, tags} = await window.electronAPI.loadAllData()

    const tasks = allTasks.filter((t) => t.scheduled.date >= fromDate && t.scheduled.date <= toDate)

    return groupTasksByDay({tasks, tags})
  }

  /**
   * Get a day from the database
   * @param date - The date formatted as YYYY-MM-DD of the day to get
   * @returns The day that matches the query
   */
  async function getDay(date: ISODate): Promise<Day | null> {
    const {tasks: allTasks, tags} = await window.electronAPI.loadAllData()

    debugger
    const tasksForDay = allTasks.filter((t) => t.scheduled.date === date)
    console.log({tasksForDay})

    const days = groupTasksByDay({tasks: tasksForDay, tags})

    console.log({days})
    return days?.[0] ?? null
  }

  /**
   * Create a task in the database
   * @param content - The content of the task
   * @param params - The parameters for the task
   * @param params.date - The date formatted as YYYY-MM-DD of the day to create the task
   * @param params.time - The time formatted as HH:MM:SS of the task
   * @param params.timezone - The timezone of the task
   * @param params.tags - The tags of the task
   * @returns The day that matches the query
   */
  async function createTask(content: string, params: {date?: string; time?: string; timezone?: string; tags?: Tag[]}): Promise<Day | null> {
    try {
      const now = DateTime.now()
      const scheduledDate = params.date ? params.date : now.toISODate()!
      const scheduledTime = params.time ? params.time : now.toFormat("HH:mm:ss")
      const scheduledTimezone = params.timezone ?? now.zoneName

      const newTask: Task = {
        id: nanoid(),
        content,
        status: "active",
        tags: params.tags ?? [],
        createdAt: now.toISO()!,
        updatedAt: now.toISO()!,
        scheduled: {
          date: scheduledDate,
          time: scheduledTime,
          timezone: scheduledTimezone,
        },
      }

      await window.electronAPI.saveTasks([newTask])

      const day = await getDay(scheduledDate)
      if (!day) throw new Error("Failed to get day after task creation")

      return day
    } catch (error) {
      console.error(error)
      return null
    }
  }

  /**
   * Update a task in the database
   * @param id - The id of the task to update
   * @param updates - The updates to apply to the task
   * @returns The day that matches the query
   */
  async function updateTask(id: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>): Promise<Day | null> {
    // const {tasks: allTasks} = await window.electronAPI.loadAllData()
    // const idx = allTasks.findIndex((t) => t.id === id)
    // if (idx < 0) return null

    // const task = allTasks[idx]

    // const updatedTask: Task = {
    //   ...task,
    //   ...updates,
    //   updatedAt: DateTime.now().toISO()!,
    // }

    // allTasks[idx] = updatedTask
    // await window.electronAPI.saveTasks(allTasks)

    // const oldDate = task.scheduled.date
    // const newDate = updatedTask.scheduled.date

    // if (newDate !== oldDate) {
    //   const remaining = allTasks.filter(({scheduled}) => scheduled.date === oldDate)

    //   if (!remaining.length) {
    //     const filtered = allDays.filter(({date}) => date !== oldDate)
    //     await window.electronAPI.saveDays(filtered)
    //   }

    //   const dayId = newDate.replace(/-/g, "")

    //   if (!allDays.find(({id}) => id === dayId)) {
    //     const newDay: DayItem = {
    //       id: dayId,
    //       date: newDate,
    //     }

    //     await window.electronAPI.saveDays(allDays.concat(newDay))
    //   }
    // return null
    // }

    // return getDay(updatedTask.scheduled.date)
    return null
  }

  /**
   * Delete a task in the database
   * @param id - The id of the task to delete
   * @returns The day that matches the query
   */
  async function deleteTask(id: Task["id"]): Promise<boolean> {
    // const {tasks: allTasks, days: allDays} = await window.electronAPI.loadAllData()
    // const idx = allTasks.findIndex((t) => t.id === id)
    // if (idx < 0) return false

    // const taskToDelete = allTasks[idx]
    // const oldDate = taskToDelete.scheduled.date

    // allTasks.splice(idx, 1)

    // await window.electronAPI.saveTasks(allTasks)

    // const remaining = allTasks.filter((t) => t.scheduled.date === oldDate)

    // if (!remaining.length) {
    //   const filtered = allDays.filter(({date}) => date !== oldDate)
    //   await window.electronAPI.saveDays(filtered)
    // }

    return true
  }

  async function addTaskTags(taskId: Task["id"], ids: Tag["id"][]): Promise<Task | null> {
    // const {tasks: allTasks, tags: allTags} = await window.electronAPI.loadAllData()

    // const task = allTasks.find((t) => t.id === taskId)
    // if (!task) return null

    // const newTags = ids.map((id) => allTags.find((tag) => tag.id === id)).filter(Boolean) as Tag[]
    // const tags = arrayRemoveDuplicates(task.tags.concat(newTags), "id")

    // const updatedTask = {...task, tags}
    // await window.electronAPI.saveTasks(allTasks.map((t) => (t.id === taskId ? updatedTask : t)))
    // return updatedTask
    return null
  }

  async function removeTaskTags(taskId: Task["id"], ids: Tag["id"][]): Promise<Task | null> {
    // const {tasks: allTasks} = await window.electronAPI.loadAllData()

    // const task = allTasks.find((t) => t.id === taskId)
    // if (!task) return null

    // const newTags = task.tags.filter(({id}) => !ids.includes(id)) as Tag[]
    // const tags = arrayRemoveDuplicates(newTags, "id")

    // const newTasks = allTasks.map((t) => (t.id === taskId ? {...t, tags} : t))
    // await window.electronAPI.saveTasks(newTasks)

    // return task
    return null
  }

  async function getTags(): Promise<Tag[]> {
    const {tags: allTags} = await window.electronAPI.loadAllData()
    console.log({allTags})
    return allTags
  }

  async function createTag(name: Tag["name"], color: Tag["color"]): Promise<Tag | null> {
    const allTags = await window.electronAPI.loadTags()

    const newTag: Tag = {
      id: nanoid(),
      name,
      color,
    }
    if (allTags.find((t) => t.name === name)) return null

    const newTags = arrayRemoveDuplicates(allTags.concat(newTag), "id")
    await window.electronAPI.saveTags(newTags)

    return newTag
  }

  async function deleteTag(id: Tag["id"]): Promise<boolean> {
    // const {tasks: allTasks, tags: allTags} = await window.electronAPI.loadAllData()

    // const newTasks = allTasks.map((t) => ({
    //   ...t,
    //   tags: t.tags.filter((tag) => tag.id !== id),
    // }))

    // const newTags = allTags.filter((tag) => tag.id !== id)

    // await window.electronAPI.saveTasks(newTasks)
    // await window.electronAPI.saveTags(newTags)

    return true
  }

  return {
    getDays,
    getDay,

    createTask,
    updateTask,
    deleteTask,

    addTaskTags,
    removeTaskTags,

    getTags,
    createTag,
    deleteTag,
  }
}

export const API = defineApi()
