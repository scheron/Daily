import {DateTime} from "luxon"

import type {Changeset} from "@daily/core"
import type {Branch, ISODate, Milestone, MoveTaskByOrderParams, Tag, Task, TaskEvent, TaskSearchResult, TaskStatus} from "@daily/protocol"
import type {CreateTaskParams, Storage} from "./types"

export class StorageAPI implements Storage {
  //#region ACTIVITY
  async getTaskHistory(taskId: Task["id"]): Promise<TaskEvent[]> {
    return window.BridgeIPC["activity:get-by-task"](taskId)
  }
  //#endregion

  //#region TASKS
  async getTask(id: Task["id"]): Promise<Task | null> {
    return window.BridgeIPC["tasks:get-one"](id)
  }

  async getAllTasks(): Promise<Task[]> {
    return window.BridgeIPC["tasks:get-all"]()
  }

  async createTask(content: string, params: CreateTaskParams): Promise<Changeset> {
    const isBacklog = params.status === "backlog"
    const now = DateTime.now()

    const newTask = {
      id: params.id,
      content,
      status: params.status ?? ("active" as TaskStatus),
      minimized: false,
      tags: params.tags ?? [],
      estimatedTime: params.estimatedTime ?? 0,
      spentTime: 0,
      orderIndex: params.orderIndex ?? 0,
      branchId: params.branchId,
      milestoneId: params.milestoneId ?? null,
      scheduled: isBacklog
        ? null
        : {
            date: params.date ? params.date : now.toISODate()!,
            time: params.time ? params.time : now.toFormat("HH:mm:ss"),
            timezone: params.timezone ?? now.zoneName,
          },
    }

    return await window.BridgeIPC["tasks:create"](newTask)
  }

  async updateTask(id: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>): Promise<Changeset> {
    return await window.BridgeIPC["tasks:update"](id, updates)
  }

  async toggleTaskMinimized(id: Task["id"], minimized: boolean): Promise<Changeset> {
    return await window.BridgeIPC["tasks:toggle-minimized"](id, minimized)
  }

  async moveTaskByOrder(params: MoveTaskByOrderParams): Promise<Changeset> {
    return await window.BridgeIPC["tasks:move-by-order"](params)
  }

  async deleteTask(id: Task["id"]): Promise<Changeset> {
    return await window.BridgeIPC["tasks:delete"](id)
  }

  async moveTask(taskId: Task["id"], targetDate: ISODate): Promise<Changeset> {
    return await window.BridgeIPC["tasks:update"](taskId, {scheduled: {date: targetDate}})
  }

  async moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<Changeset> {
    return await window.BridgeIPC["tasks:move-to-branch"](taskId, branchId)
  }

  async searchTasks(query: string): Promise<TaskSearchResult[]> {
    try {
      return await window.BridgeIPC["search:query"](query)
    } catch (error) {
      console.error("Failed to search tasks", error)
      return []
    }
  }

  async getDeletedTasks(params?: {limit?: number; branchId?: Branch["id"]}): Promise<Task[]> {
    try {
      return await window.BridgeIPC["tasks:get-deleted"](params)
    } catch (error) {
      console.error("Failed to get deleted tasks", error)
      return []
    }
  }

  async restoreTask(id: Task["id"]): Promise<Changeset> {
    return await window.BridgeIPC["tasks:restore"](id)
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

  async addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Changeset> {
    return await window.BridgeIPC["tasks:add-tags"](taskId, tagIds)
  }

  async removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Changeset> {
    return await window.BridgeIPC["tasks:remove-tags"](taskId, tagIds)
  }
  //#endregion

  //#region MILESTONES
  async getMilestoneList(branchId?: Branch["id"]): Promise<Milestone[]> {
    return await window.BridgeIPC["milestones:get-many"](branchId)
  }

  async getMilestone(id: Milestone["id"]): Promise<Milestone | null> {
    return await window.BridgeIPC["milestones:get-one"](id)
  }

  async createMilestone(milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "orderIndex">): Promise<Changeset> {
    return await window.BridgeIPC["milestones:create"](milestone)
  }

  async updateMilestone(
    id: Milestone["id"],
    updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>,
  ): Promise<Changeset> {
    return await window.BridgeIPC["milestones:update"](id, updates)
  }

  async deleteMilestone(id: Milestone["id"]): Promise<Changeset> {
    return await window.BridgeIPC["milestones:delete"](id)
  }
  //#endregion

  //#region BRANCHES
  async getBranchList(): Promise<Branch[]> {
    return await window.BridgeIPC["branches:get-many"]()
  }

  async createBranch(branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Branch | null> {
    return await window.BridgeIPC["branches:create"](branch)
  }

  async updateBranch(id: Branch["id"], updates: Partial<Pick<Branch, "name" | "description">>): Promise<Branch | null> {
    return await window.BridgeIPC["branches:update"](id, updates)
  }

  async deleteBranch(id: Branch["id"]): Promise<boolean> {
    return await window.BridgeIPC["branches:delete"](id)
  }

  async setActiveBranch(id: Branch["id"]): Promise<void> {
    await window.BridgeIPC["branches:set-active"](id)
  }
  //#endregion
}
