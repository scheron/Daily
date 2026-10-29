import {keyBetween} from "../../utils/subtasks/keyBetween"

import type {Subtask, SubtaskCounts, Task} from "@daily/protocol"
import type {SubtaskModel} from "../models/SubtaskModel"
import type {TaskModel} from "../models/TaskModel"

export class SubtasksService {
  constructor(
    private subtaskModel: SubtaskModel,
    private taskModel: TaskModel,
  ) {}

  /** One task's live subtasks in their order. Empty for a task that does not exist. */
  async getSubtasksOfTask(taskId: Task["id"]): Promise<Subtask[]> {
    return this.subtaskModel.getByTask(taskId)
  }

  /** Done and total per task; a task with no subtasks is left out. */
  async getSubtaskCounts(): Promise<SubtaskCounts> {
    return this.subtaskModel.countByTask()
  }

  async getSubtask(id: Subtask["id"]): Promise<Subtask | null> {
    const subtask = this.subtaskModel.getSubtask(id)

    return subtask && subtask.deletedAt === null ? subtask : null
  }

  /** Adds an unchecked subtask after the task's last one. Null for an unknown or deleted task, and for content that is only whitespace. */
  async createSubtask(taskId: Task["id"], content: string): Promise<Subtask | null> {
    const trimmed = content.trim()
    if (!trimmed) return null

    const task = this.taskModel.getTask(taskId)
    if (!task || task.deletedAt !== null) return null

    const last = this.subtaskModel.getByTask(taskId).at(-1)

    return this.subtaskModel.createSubtask({taskId, content: trimmed, orderKey: keyBetween(last?.orderKey ?? null, null)})
  }

  /** Rewrites a live subtask. Null for an unknown or deleted one, and for content that is only whitespace. */
  async updateSubtask(id: Subtask["id"], updates: {content?: string; done?: boolean}): Promise<Subtask | null> {
    const content = updates.content?.trim()
    if (content === "") return null

    return this.subtaskModel.updateSubtask(id, {...updates, content})
  }

  /** Soft-deletes a subtask. Null when it was already gone. */
  async deleteSubtask(id: Subtask["id"]): Promise<Subtask["id"] | null> {
    return this.subtaskModel.deleteSubtask(id)
  }

  /** Sends the subtasks of permanently deleted tasks the same way their tasks went: backdated, for the next sync merge to collect. */
  async permanentlyDeleteSubtasksOfTasks(taskIds: Task["id"][]): Promise<Subtask["id"][]> {
    return this.subtaskModel.permanentlyDeleteSubtasksOfTasks(taskIds)
  }
}
