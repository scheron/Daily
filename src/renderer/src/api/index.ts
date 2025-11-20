import {groupTasksByDay} from "@/utils/tasks"
import {DateTime} from "luxon"

import type {ISODate} from "@/types/date"
import type {Storage} from "@/types/storage"
import type {Day, Tag, Task, TaskStatus} from "@/types/tasks"

export class StorageAPI implements Storage {
  //#region DAYS
  async getDays(params: {from?: ISODate; to?: ISODate} = {}): Promise<Day[]> {
    const {from, to} = params
    const fromDate = from ? from : DateTime.now().minus({years: 1}).toISODate()!
    const toDate = to ? to : DateTime.now().plus({years: 1}).toISODate()!

    const {tasks: allTasks, tags} = await window.electronAPI.loadAllData()

    const tasks = allTasks.filter((t) => t.scheduled.date >= fromDate && t.scheduled.date <= toDate)

    return groupTasksByDay({tasks, tags})
  }

  async getDay(date: ISODate): Promise<Day | null> {
    const {tasks: allTasks, tags} = await window.electronAPI.loadAllData()

    const tasksForDay = allTasks.filter((t) => t.scheduled.date === date)

    const days = groupTasksByDay({tasks: tasksForDay, tags})

    return days?.[0] ?? null
  }
  //#endregion

  //#region TASKS
  async createTask(
    content: string,
    params: {date?: string; time?: string; timezone?: string; tags?: Tag[]; estimatedTime?: number},
  ): Promise<Day | null> {
    try {
      const now = DateTime.now()
      const scheduledDate = params.date ? params.date : now.toISODate()!
      const scheduledTime = params.time ? params.time : now.toFormat("HH:mm:ss")
      const scheduledTimezone = params.timezone ?? now.zoneName

      const newTask = {
        content,
        status: "active" as TaskStatus,
        tags: params.tags ?? [],
        estimatedTime: params.estimatedTime ?? 0,
        spentTime: 0,
        scheduled: {
          date: scheduledDate,
          time: scheduledTime,
          timezone: scheduledTimezone,
        },
      }

      await window.electronAPI.createTask(newTask)

      // TODO: Rethink this
      const day = await this.getDay(scheduledDate)
      if (!day) throw new Error("Failed to get day after task creation")

      return day
    } catch (error) {
      console.error(error)
      return null
    }
  }

  async updateTask(id: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>): Promise<Day | null> {
    try {
      const updatedTask = await window.electronAPI.updateTask(id, updates)
      if (!updatedTask) return null

      return this.getDay(updatedTask.scheduled.date)
    } catch (error) {
      console.error("Failed to update task", error)
      return null
    }
  }

  async deleteTask(id: Task["id"]): Promise<boolean> {
    try {
      return await window.electronAPI.deleteTask(id)
    } catch (error) {
      console.error("Failed to delete task", error)
      return false
    }
  }

  async moveTask(taskId: Task["id"], targetDate: ISODate): Promise<boolean> {
    try {
      await window.electronAPI.updateTask(taskId, {scheduled: {date: targetDate}})
      return true
    } catch (error) {
      console.error("Failed to move task", error)
      return false
    }
  }
  //#endregion

  //#region TAGS
  async getTagList(): Promise<Tag[]> {
    return await window.electronAPI.getTagList()
  }

  async createTag(tag: Tag): Promise<Tag | null> {
    return await window.electronAPI.createTag(tag)
  }

  async updateTag(name: Tag["name"], tag: Tag): Promise<Tag | null> {
    return await window.electronAPI.updateTag(name, tag)
  }

  async deleteTag(name: Tag["name"]): Promise<boolean> {
    try {
      return await window.electronAPI.deleteTag(name)
    } catch (error) {
      console.error("Failed to delete tag", error)
      return false
    }
  }

  async addTaskTags(taskId: Task["id"], tagNames: Tag["name"][]): Promise<Task | null> {
    return await window.electronAPI.addTaskTags(taskId, tagNames)
  }

  async removeTaskTags(taskId: Task["id"], tagNames: Tag["name"][]): Promise<Task | null> {
    return await window.electronAPI.removeTaskTags(taskId, tagNames)
  }
  //#endregion
}

export const API = new StorageAPI()
