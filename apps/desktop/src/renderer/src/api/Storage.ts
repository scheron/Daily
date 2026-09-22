import {DateTime} from "luxon"

import type {Changeset} from "@daily/core"
import type {
  Branch,
  ISODate,
  Milestone,
  MoveTaskByOrderParams,
  Tag,
  Task,
  TaskComment,
  TaskEvent,
  TaskRelation,
  TaskRelationSets,
  TaskSearchResult,
  TaskStatus,
} from "@daily/protocol"
import type {CreateTaskParams} from "./types"

export class StorageAPI {
  /** Newest first; the `moved` pair collapses to one row. */
  async getTaskHistory(taskId: Task["id"]): Promise<TaskEvent[]> {
    return window.BridgeIPC["activity:get-by-task"](taskId)
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    return window.BridgeIPC["tasks:get-one"](id)
  }

  /** Every project's tasks, backlog included. */
  async getAllTasks(): Promise<Task[]> {
    return window.BridgeIPC["tasks:get-all"]()
  }

  /**
   * Omitted fields fall back to defaults (today/now, status "active", minimized false, orderIndex 0);
   * a task created with status "backlog" gets no date.
   */
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

  /**
   * Reorders a task within its day, optionally moving it to another status group. Positions it before/after
   * an anchor task (or at the end) via a fractional order index, re-normalizing the group's indexes when no
   * gap is available.
   * @param params.targetTaskId - Anchor task to position against; null or omitted appends to the end
   * @param params.targetStatus - Destination status group; defaults to the task's current status
   * @param params.position - "before" or "after" the anchor; defaults to "before"
   */
  async moveTaskByOrder(params: MoveTaskByOrderParams): Promise<Changeset> {
    return await window.BridgeIPC["tasks:move-by-order"](params)
  }

  /** Soft-delete: the task moves to the deleted list and a "deleted" activity event is recorded. */
  async deleteTask(id: Task["id"]): Promise<Changeset> {
    return await window.BridgeIPC["tasks:delete"](id)
  }

  async moveTask(taskId: Task["id"], targetDate: ISODate): Promise<Changeset> {
    return await window.BridgeIPC["tasks:update"](taskId, {scheduled: {date: targetDate}})
  }

  async moveTaskToBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<Changeset> {
    return await window.BridgeIPC["tasks:move-to-branch"](taskId, branchId)
  }

  /** Every live relation of every project. */
  async getAllTaskRelations(): Promise<TaskRelation[]> {
    return window.BridgeIPC["relations:get-all"]()
  }

  /** Makes the task's links exactly `next`, dropping what cannot be linked. */
  async setTaskRelations(taskId: Task["id"], next: TaskRelationSets): Promise<Changeset> {
    return await window.BridgeIPC["relations:set"](taskId, next)
  }

  /** One task's live comments, oldest first. */
  async getTaskComments(taskId: Task["id"]): Promise<TaskComment[]> {
    return window.BridgeIPC["comments:get-by-task"](taskId)
  }

  /** Writes a comment on a live task. What the app writes has no origin — only MCP and the agent set one. */
  async createTaskComment(taskId: Task["id"], content: string): Promise<Changeset> {
    return await window.BridgeIPC["comments:create"](taskId, content)
  }

  async updateTaskComment(id: TaskComment["id"], content: string): Promise<Changeset> {
    return await window.BridgeIPC["comments:update"](id, content)
  }

  async deleteTaskComment(id: TaskComment["id"]): Promise<Changeset> {
    return await window.BridgeIPC["comments:delete"](id)
  }

  /** Fuzzy-matches tasks; results are sorted by relevance. */
  async searchTasks(query: string): Promise<TaskSearchResult[]> {
    try {
      return await window.BridgeIPC["search:query"](query)
    } catch (error) {
      console.error("Failed to search tasks", error)
      return []
    }
  }

  async getDeletedTasks(params: {branchId?: Branch["id"]}): Promise<Task[]> {
    try {
      return await window.BridgeIPC["tasks:get-deleted"](params)
    } catch (error) {
      console.error("Failed to get deleted tasks", error)
      return []
    }
  }

  /** Restores a soft-deleted task; a "restored" activity event is recorded. */
  async restoreTask(id: Task["id"]): Promise<Changeset> {
    return await window.BridgeIPC["tasks:restore"](id)
  }

  /** Irreversible; the row stays in the database, stamped as permanently deleted. */
  async permanentlyDeleteTask(id: Task["id"]): Promise<boolean> {
    try {
      return await window.BridgeIPC["tasks:delete-permanently"](id)
    } catch (error) {
      console.error("Failed to permanently delete task", error)
      return false
    }
  }

  /** Scoped to the active project; resolves to how many tasks were removed. Irreversible. */
  async permanentlyDeleteAllDeletedTasks(): Promise<number> {
    try {
      return await window.BridgeIPC["tasks:delete-all-permanently"]()
    } catch (error) {
      console.error("Failed to permanently delete all deleted tasks", error)
      return 0
    }
  }

  async getTagList(): Promise<Tag[]> {
    return await window.BridgeIPC["tags:get-many"]()
  }

  /** Resolves to null on failure. */
  async createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Tag | null> {
    return await window.BridgeIPC["tags:create"](tag)
  }

  async deleteTag(id: Tag["id"]): Promise<boolean> {
    try {
      return await window.BridgeIPC["tags:delete"](id)
    } catch (error) {
      console.error("Failed to delete tag", error)
      return false
    }
  }

  async getMilestoneList(): Promise<Milestone[]> {
    return await window.BridgeIPC["milestones:get-many"]()
  }

  async createMilestone(milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "orderIndex">): Promise<Changeset> {
    return await window.BridgeIPC["milestones:create"](milestone)
  }

  /** The milestone's project never changes. */
  async updateMilestone(
    id: Milestone["id"],
    updates: Partial<Pick<Milestone, "name" | "description" | "targetDate" | "orderIndex">>,
  ): Promise<Changeset> {
    return await window.BridgeIPC["milestones:update"](id, updates)
  }

  /** Soft-delete: every task it held keeps existing, cleared of it. */
  async deleteMilestone(id: Milestone["id"]): Promise<Changeset> {
    return await window.BridgeIPC["milestones:delete"](id)
  }

  async getBranchList(): Promise<Branch[]> {
    return await window.BridgeIPC["branches:get-many"]()
  }

  /** The name is trimmed; resolves to null when it is empty or a case-insensitive duplicate of an existing project. */
  async createBranch(branch: Omit<Branch, "id" | "createdAt" | "updatedAt" | "deletedAt">): Promise<Branch | null> {
    return await window.BridgeIPC["branches:create"](branch)
  }

  /**
   * The default "main" project can carry a description but cannot be renamed. The new name, when given,
   * is trimmed; resolves to null if it is empty or already taken.
   */
  async updateBranch(id: Branch["id"], updates: Partial<Pick<Branch, "name" | "description">>): Promise<Branch | null> {
    return await window.BridgeIPC["branches:update"](id, updates)
  }

  /** If it was the active project, the active project resets to "main". */
  async deleteBranch(id: Branch["id"]): Promise<boolean> {
    return await window.BridgeIPC["branches:delete"](id)
  }

  /** Persisted in settings; falls back to "main" if the project does not exist. */
  async setActiveBranch(id: Branch["id"]): Promise<void> {
    await window.BridgeIPC["branches:set-active"](id)
  }
}
