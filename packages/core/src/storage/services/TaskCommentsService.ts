import {resolveActorProvider} from "@daily/protocol"

import type {Branch, Task, TaskComment, TaskCommentCounts, TaskCommentSource} from "@daily/protocol"
import type {TaskCommentModel} from "../models/TaskCommentModel"
import type {TaskModel} from "../models/TaskModel"

export class TaskCommentsService {
  constructor(
    private commentModel: TaskCommentModel,
    private taskModel: TaskModel,
  ) {}

  /** One task's live comments, oldest first. Empty for a task that does not exist. */
  async getCommentsOfTask(taskId: Task["id"]): Promise<TaskComment[]> {
    return this.commentModel.getByTask(taskId)
  }

  /** How many live comments each task carries; a task with none is left out. */
  async getCommentCounts(): Promise<TaskCommentCounts> {
    return this.commentModel.countByTask()
  }

  /** Writes a comment on a live task. Null for an unknown or deleted task, and for content that is only whitespace. */
  async createComment(taskId: Task["id"], content: string, source: TaskCommentSource = {kind: "manual"}): Promise<TaskComment | null> {
    const trimmed = content.trim()
    if (!trimmed) return null

    const task = this.taskModel.getTask(taskId)
    if (!task || task.deletedAt !== null) return null

    return this.commentModel.createComment({
      taskId,
      branchId: task.branchId,
      content: trimmed,
      kind: source.kind,
      provider: resolveActorProvider(source),
    })
  }

  /** Rewrites a live comment. Null for an unknown or deleted comment, and for content that is only whitespace. */
  async updateComment(id: TaskComment["id"], content: string): Promise<TaskComment | null> {
    const trimmed = content.trim()
    if (!trimmed) return null

    return this.commentModel.updateComment(id, trimmed)
  }

  /** Soft-deletes a comment. Null when it was already gone. */
  async deleteComment(id: TaskComment["id"]): Promise<TaskComment["id"] | null> {
    return this.commentModel.deleteComment(id)
  }

  /** Keeps a moved task's comments in the task's project; returns the comments that moved with it. */
  async alignCommentsToTaskBranch(taskId: Task["id"], branchId: Branch["id"]): Promise<TaskComment[]> {
    return this.commentModel.moveCommentsToBranch(taskId, branchId)
  }

  /** Sends the comments of permanently deleted tasks the same way their tasks went: backdated, for the next sync merge to collect. */
  async permanentlyDeleteCommentsOfTasks(taskIds: Task["id"][]): Promise<TaskComment["id"][]> {
    return this.commentModel.permanentlyDeleteCommentsOfTasks(taskIds)
  }
}
