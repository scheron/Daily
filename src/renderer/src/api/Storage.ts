import {DateTime} from "luxon"

import type {ISODate} from "@shared/types/common"
import type {TaskSearchResult} from "@shared/types/search"
import type {Day, MoveTaskByOrderParams, Tag, Task, TaskStatus} from "@shared/types/storage"
import type {Storage} from "./types"

export class StorageAPI implements Storage {
  //#region DAYS
  async getDays(params: {from?: ISODate; to?: ISODate} = {}): Promise<Day[]> {
    return window.BridgeIPC["days:get-many"](params)
  }

  async getDay(date: ISODate): Promise<Day | null> {
    return window.BridgeIPC["days:get-one"](date)
  }
  //#endregion

  //#region TASKS
  async createTask(
    content: string,
    params: {date?: string; time?: string; timezone?: string; tags?: Tag[]; estimatedTime?: number; orderIndex?: number},
  ): Promise<Day | null> {
    try {
      const now = DateTime.now()
      const scheduledDate = params.date ? params.date : now.toISODate()!
      const scheduledTime = params.time ? params.time : now.toFormat("HH:mm:ss")
      const scheduledTimezone = params.timezone ?? now.zoneName

      const newTask = {
        content,
        status: "active" as TaskStatus,
        minimized: false,
        tags: params.tags ?? [],
        estimatedTime: params.estimatedTime ?? 0,
        spentTime: 0,
        orderIndex: params.orderIndex ?? 0,
        scheduled: {
          date: scheduledDate,
          time: scheduledTime,
          timezone: scheduledTimezone,
        },
      }

      await window.BridgeIPC["tasks:create"](newTask)

      const day = await this.getDay(scheduledDate)

      return day
    } catch (error) {
      console.error(error)
      return null
    }
  }

  async updateTask(id: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>): Promise<Day | null> {
    try {
      const updatedTask = await window.BridgeIPC["tasks:update"](id, updates)
      if (!updatedTask) return null

      return this.getDay(updatedTask.scheduled.date)
    } catch (error) {
      console.error("Failed to update task", error)
      return null
    }
  }

  async toggleTaskMinimized(id: Task["id"], minimized: boolean): Promise<Day | null> {
    try {
      const updatedTask = await window.BridgeIPC["tasks:toggle-minimized"](id, minimized)
      if (!updatedTask) return null

      return this.getDay(updatedTask.scheduled.date)
    } catch (error) {
      console.error("Failed to toggle task minimized state", error)
      return null
    }
  }

  async moveTaskByOrder(params: MoveTaskByOrderParams): Promise<Day | null> {
    try {
      const updatedTask = await window.BridgeIPC["tasks:move-by-order"](params)
      if (!updatedTask) return null

      return this.getDay(updatedTask.scheduled.date)
    } catch (error) {
      console.error("Failed to move task by order", error)
      return null
    }
  }

  async deleteTask(id: Task["id"]): Promise<boolean> {
    try {
      return await window.BridgeIPC["tasks:delete"](id)
    } catch (error) {
      console.error("Failed to delete task", error)
      return false
    }
  }

  async moveTask(taskId: Task["id"], targetDate: ISODate): Promise<boolean> {
    try {
      await window.BridgeIPC["tasks:update"](taskId, {scheduled: {date: targetDate}})
      return true
    } catch (error) {
      console.error("Failed to move task", error)
      return false
    }
  }

  async searchTasks(query: string): Promise<TaskSearchResult[]> {
    try {
      return await window.BridgeIPC["search:query"](query)
    } catch (error) {
      console.error("Failed to search tasks", error)
      return []
    }
  }

  async getDeletedTasks(params?: {limit?: number}): Promise<Task[]> {
    try {
      return await window.BridgeIPC["tasks:get-deleted"](params)
    } catch (error) {
      console.error("Failed to get deleted tasks", error)
      return []
    }
  }

  async restoreTask(id: Task["id"]): Promise<Task | null> {
    try {
      return await window.BridgeIPC["tasks:restore"](id)
    } catch (error) {
      console.error("Failed to restore task", error)
      return null
    }
  }

  async permanentlyDeleteTask(id: Task["id"]): Promise<boolean> {
    try {
      return await window.BridgeIPC["tasks:delete-permanently"](id)
    } catch (error) {
      console.error("Failed to permanently delete task", error)
      return false
    }
  }

  async permanentlyDeleteAllDeletedTasks(): Promise<number> {
    try {
      return await window.BridgeIPC["tasks:delete-all-permanently"]()
    } catch (error) {
      console.error("Failed to permanently delete all deleted tasks", error)
      return 0
    }
  }
  //#endregion

  //#region TAGS
  async getTagList(): Promise<Tag[]> {
    return await window.BridgeIPC["tags:get-many"]()
  }

  async createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Tag | null> {
    return await window.BridgeIPC["tags:create"](tag)
  }

  async updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Tag | null> {
    return await window.BridgeIPC["tags:update"](id, updates)
  }

  async deleteTag(id: Tag["id"]): Promise<boolean> {
    try {
      return await window.BridgeIPC["tags:delete"](id)
    } catch (error) {
      console.error("Failed to delete tag", error)
      return false
    }
  }

  async addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    return await window.BridgeIPC["tasks:add-tags"](taskId, tagIds)
  }

  async removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    return await window.BridgeIPC["tasks:remove-tags"](taskId, tagIds)
  }
  //#endregion
}
