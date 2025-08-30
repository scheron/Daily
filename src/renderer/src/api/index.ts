import {arrayRemoveDuplicates} from "@/utils/arrays"
import {groupTasksByDay} from "@/utils/tasks"
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

    const tasksForDay = allTasks.filter((t) => t.scheduled.date === date)

    const days = groupTasksByDay({tasks: tasksForDay, tags})

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
   * @param params.estimatedTime - The estimated time of the task
   * @returns The day that matches the query
   */
  async function createTask(content: string, params: {date?: string; time?: string; timezone?: string; tags?: Tag[]; estimatedTime?: number}): Promise<Day | null> {
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
        estimatedTime: params.estimatedTime ?? 10,
        spentTime: 0,
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
    try {
      const allTasks = await window.electronAPI.loadTasks()
      const task = allTasks.find((t) => t.id === id)
      if (!task) return null

      const updatedTask: Task = {
        ...task,
        ...updates,
        updatedAt: DateTime.now().toISO()!,
      }

      await window.electronAPI.saveTasks([updatedTask])

      return getDay(updatedTask.scheduled.date)
    } catch (error) {
      console.error("Failed to update task", error)
      return null
    }
  }

  /**
   * Delete a task in the database
   * @param id - The id of the task to delete
   * @returns The day that matches the query
   */
  async function deleteTask(id: Task["id"]): Promise<boolean> {
    try {
      const allTasks = await window.electronAPI.loadTasks()
      const task = allTasks.find((t) => t.id === id)
      if (!task) return false

      await window.electronAPI.deleteTask(id)

      return true
    } catch (error) {
      console.error("Failed to delete task", error)
      return false
    }
  }

  async function addTaskTags(taskId: Task["id"], tagNames: Tag["name"][]): Promise<Task | null> {
    const allTasks = await window.electronAPI.loadTasks()
    const allTags = await window.electronAPI.loadTags()

    const task = allTasks.find((t) => t.id === taskId)
    if (!task) return null

    const newTags = tagNames.map((name) => allTags.find((tag) => tag.name === name)).filter(Boolean) as Tag[]
    const tags = arrayRemoveDuplicates(task.tags.concat(newTags), "name")

    const updatedTask = {...task, tags}

    await window.electronAPI.saveTasks([updatedTask])

    return updatedTask
  }

  async function removeTaskTags(taskId: Task["id"], tagNames: Tag["name"][]): Promise<Task | null> {
    const allTasks = await window.electronAPI.loadTasks()

    const task = allTasks.find((t) => t.id === taskId)
    if (!task) return null

    const newTags = task.tags.filter(({name}) => !tagNames.includes(name)) as Tag[]
    const tags = arrayRemoveDuplicates(newTags, "name")

    const updatedTask = {...task, tags}

    await window.electronAPI.saveTasks([updatedTask])

    return updatedTask
  }

  async function getTags(): Promise<Tag[]> {
    const {tags: allTags} = await window.electronAPI.loadAllData()
    return allTags
  }

  async function createTag(name: Tag["name"], color: Tag["color"], emoji: Tag["emoji"]): Promise<Tag | null> {
    const allTags = await window.electronAPI.loadTags()

    const newTag: Tag = {
      name,
      color,
      emoji: emoji || "",
    }
    if (allTags.find((t) => t.name === name)) return null

    const newTags = arrayRemoveDuplicates(allTags.concat(newTag), "name")
    await window.electronAPI.saveTags(newTags)

    return newTag
  }

  async function deleteTag(name: Tag["name"]): Promise<boolean> {
    const {tasks: allTasks, tags: allTags} = await window.electronAPI.loadAllData()

    const newTasks = allTasks.map((t) => ({
      ...t,
      tags: t.tags.filter((tag) => tag.name !== name),
    }))

    const newTags = allTags.filter((tag) => tag.name !== name)

    await window.electronAPI.saveTasks(newTasks)
    await window.electronAPI.saveTags(newTags)

    return true
  }

  /**
   * Move a task to a different day and delete it from the source day
   * @param taskId - The id of the task to move
   * @param targetDate - The target date to move the task to
   * @returns The updated day information for both source and target days
   */
  async function moveTask(taskId: Task["id"], targetDate: ISODate): Promise<boolean> {
    try {
      const allTasks = await window.electronAPI.loadTasks()
      const task = allTasks.find((t) => t.id === taskId)
      if (!task) return false

      const movedTask: Task = {
        ...task,
        scheduled: {
          ...task.scheduled,
          date: targetDate,
        },
        updatedAt: DateTime.now().toISO()!,
      }

      await deleteTask(taskId)
      await window.electronAPI.saveTasks([movedTask])

      return true
    } catch (error) {
      console.error("Failed to move task", error)
      return false
    }
  }

  return {
    getDays,
    getDay,

    createTask,
    updateTask,
    deleteTask,
    moveTask,

    addTaskTags,
    removeTaskTags,

    getTags,
    createTag,
    deleteTag,
  }
}

export const API = defineApi()
