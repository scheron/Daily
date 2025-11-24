import {LogContext, logger} from "@/utils/logger"

import type {TagModel} from "@/storage/models/TagModel"
import type {TaskModel} from "@/storage/models/TaskModel"
import type {Tag} from "@shared/types/storage"
import type {TaskInternal} from "@/types/storage"

export class TagsService {
  constructor(
    private taskModel: TaskModel,
    private tagModel: TagModel,
  ) {}

  async getTagList(): Promise<Tag[]> {
    return await this.tagModel.getTagList()
  }

  async getTag(id: Tag["id"]): Promise<Tag | null> {
    return await this.tagModel.getTag(id)
  }

  async updateTag(id: Tag["id"], updates: Partial<Tag>): Promise<Tag | null> {
    return this.tagModel.updateTag(id, updates)
  }

  async createTag(tag: Omit<Tag, "id" | "createdAt" | "updatedAt">): Promise<Tag | null> {
    return this.tagModel.createTag(tag)
  }

  async deleteTag(id: Tag["id"]): Promise<boolean> {
    const deleted = await this.tagModel.deleteTag(id)
    if (!deleted) return false

    const tasks = await this.taskModel.getTaskList()

    const ops: Promise<TaskInternal | null>[] = []

    for (const task of tasks) {
      const newTags = task.tags.filter((tagId) => tagId !== id)
      if (newTags.length === task.tags.length) continue

      ops.push(this.taskModel.updateTask(task.id, {tags: newTags}))
    }

    if (!ops.length) {
      logger.debug(LogContext.TAGS, `Tag "${id}" not found in any tasks`)
      return true
    }

    const results = await Promise.allSettled(ops)

    const failed = results.filter((r) => r.status === "rejected")
    const succeeded = results.filter((r) => r.status === "fulfilled")

    logger.info(LogContext.TAGS, `Tag "${id}" removed from ${succeeded.length} tasks`)
    if (failed.length > 0) logger.warn(LogContext.TAGS, `Failed to remove tag from ${failed.length} tasks`)

    return true
  }
}
