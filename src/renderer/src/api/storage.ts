import {DateTime} from "luxon"
import {nanoid} from "nanoid"

import type {ISODate} from "@/types/date"
import type {Day, DayItem, Task} from "@/types/tasks"
import type {Storage} from "./types"

import {groupTasksByDay} from "@/utils/tasks"

export class LocalStorage implements Storage {
  /**
   * Get days from the database
   * @param params - The parameters for the query
   * @param params.from - The start date formatted as YYYY-MM-DD
   * @param params.to - The end date formatted as YYYY-MM-DD
   * @returns The tasks that match the query
   */
  async getDays(params: {from?: ISODate; to?: ISODate} = {}): Promise<Day[]> {
    const {from, to} = params
    const fromDate = from ? from : DateTime.now().minus({years: 1}).toISODate()!
    const toDate = to ? to : DateTime.now().plus({years: 1}).toISODate()!

    const {tasks: allTasks, days: allDays} = await window.electronAPI.loadAllData()

    const filteredTasks = allTasks.filter((t) => t.scheduled.date >= fromDate && t.scheduled.date <= toDate)
    const filteredDays = allDays.filter((d) => d.date >= fromDate && d.date <= toDate)

    return groupTasksByDay(filteredTasks, filteredDays)
  }

  /**
   * Get a day from the database
   * @param date - The date formatted as YYYY-MM-DD of the day to get
   * @returns The day that matches the query
   */
  async getDay(date: ISODate): Promise<Day | null> {
    const {tasks: allTasks, days: allDays} = await window.electronAPI.loadAllData()
    
    const dayId = date.replaceAll("-", "")
    const dayItem = allDays.find((d) => d.id === dayId)
    if (!dayItem) return null

    const tasksForDay = allTasks.filter((t) => t.scheduled.date === date)
    const arr = groupTasksByDay(tasksForDay, [dayItem])
    return arr.length ? arr[0] : null
  }

  /**
   * Create a task in the database
   * @param content - The content of the task
   * @param params - The parameters for the task
   * @param params.date - The date formatted as YYYY-MM-DD of the day to create the task
   * @param params.time - The time formatted as HH:MM:SS of the task
   * @param params.timezone - The timezone of the task
   * @returns The day that matches the query
   */
  async createTask(content: string, params: {date?: string; time?: string; timezone?: string}): Promise<Day> {
    const now = DateTime.now()
    const scheduledDate = params.date ? params.date : now.toISODate()!
    const scheduledTime = params.time ? params.time : now.toFormat("HH:mm")
    const scheduledTimezone = params.timezone ?? now.zoneName

    const newTask: Task = {
      id: nanoid(),
      content,
      done: false,
      createdAt: now.toISO()!,
      updatedAt: now.toISO()!,
      scheduled: {
        date: scheduledDate,
        time: scheduledTime,
        timezone: scheduledTimezone,
      },
    }

    const allTasks = await window.electronAPI.loadTasks()
    const newTasks = allTasks.concat(newTask)

    await window.electronAPI.saveTasks(newTasks)

    const dayDate = scheduledDate
    const dayId = dayDate.replaceAll("-", "")

    const allDays = await window.electronAPI.loadDays()
    const dayItem = allDays.find(({id}) => id === dayId)

    if (!dayItem) {
      const newDay: DayItem = {id: dayId, date: scheduledDate, subtitle: ""}
      const newDays = allDays.concat(newDay)

      await window.electronAPI.saveDays(newDays)
    }

    const day = await this.getDay(scheduledDate)
    if (!day) throw new Error("Failed to create day after task creation")

    return day
  }

  /**
   * Update a task in the database
   * @param id - The id of the task to update
   * @param updates - The updates to apply to the task
   * @returns The day that matches the query
   */
  async updateTask(id: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt">>): Promise<Day | null> {
    const allTasks = await window.electronAPI.loadTasks()
    const idx = allTasks.findIndex((t) => t.id === id)
    if (idx < 0) return null

    const task = allTasks[idx]
    const updatedTask: Task = {
      ...task,
      ...updates,
      updatedAt: DateTime.now().toISO()!,
    }

    allTasks[idx] = updatedTask
    await window.electronAPI.saveTasks(allTasks)

    const oldDate = task.scheduled.date
    const newDate = updatedTask.scheduled.date

    if (newDate !== oldDate) {
      const remaining = allTasks.filter(({scheduled}) => scheduled.date === oldDate)

      if (!remaining.length) {
        const existingDays = await window.electronAPI.loadDays()
        const filtered = existingDays.filter(({date}) => date !== oldDate)
        await window.electronAPI.saveDays(filtered)
      }
      const dayId = newDate.replace(/-/g, "")
      const existingDays = await window.electronAPI.loadDays()

      if (!existingDays.find(({id}) => id === dayId)) {
        const newDay: DayItem = {
          id: dayId,
          date: newDate,
          subtitle: "",
        }

        await window.electronAPI.saveDays(existingDays.concat(newDay))
      }
    }

    return this.getDay(updatedTask.scheduled.date)
  }

  /**
   * Delete a task in the database
   * @param id - The id of the task to delete
   * @returns The day that matches the query
   */
  async deleteTask(id: Task["id"]): Promise<boolean> {
    const allTasks = await window.electronAPI.loadTasks()
    const idx = allTasks.findIndex((t) => t.id === id)
    if (idx < 0) return false

    const oldDate = allTasks[idx].scheduled.date
    allTasks.splice(idx, 1)
    await window.electronAPI.saveTasks(allTasks)

    const remaining = allTasks.filter((t) => t.scheduled.date === oldDate)
    if (!remaining.length) {
      const existingDays = await window.electronAPI.loadDays()
      const filtered = existingDays.filter(({date}) => date !== oldDate)
      await window.electronAPI.saveDays(filtered)
    }

    return true
  }

  /**
   * Update a day in the database
   * @param date - The date formatted as YYYY-MM-DD of the day to update
   * @param updates - The updates to apply to the day
   * @returns The day that matches the query
   */
  async updateDay(date: string, updates: {subtitle?: string}): Promise<Day | null> {
    const allDays = await window.electronAPI.loadDays()
    const dayId = date.replace(/-/g, "")
    const idx = allDays.findIndex((d) => d.id === dayId)

    if (idx < 0) {
      const newDay: DayItem = {id: dayId, date, subtitle: updates.subtitle ?? ""}
      const newDays = allDays.concat(newDay)
      await window.electronAPI.saveDays(newDays)
      return this.getDay(date)
    }

    allDays[idx].subtitle = updates.subtitle ?? allDays[idx].subtitle
    await window.electronAPI.saveDays(allDays)
    return this.getDay(date)
  }
}
