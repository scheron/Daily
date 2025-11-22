import type {Tag, TaskInternal} from "../../types.js"
import type {TagModel} from "../models/TagModel"
import type {TaskModel} from "../models/TaskModel"

export class TagsService {
  constructor(
    private taskModel: TaskModel,
    private tagModel: TagModel,
  ) {}

  async getTagList(): Promise<Tag[]> {
    return this.tagModel.getTagList()
  }

  async getTag(name: Tag["name"]): Promise<Tag | null> {
    return this.tagModel.getTag(name)
  }

  async updateTag(name: Tag["name"], tag: Tag): Promise<Tag | null> {
    return this.tagModel.updateTag(name, tag)
  }

  async createTag(tag: Tag): Promise<Tag | null> {
    return this.tagModel.createTag(tag)
  }

  async deleteTag(name: Tag["name"]): Promise<boolean> {
    const deleted = await this.tagModel.deleteTag(name)
    if (!deleted) return false

    const tasks = await this.taskModel.getTaskList()

    const ops: Promise<TaskInternal | null>[] = []

    for (const task of tasks) {
      const newTags = task.tags.filter((tagName) => tagName !== name)
      if (newTags.length === task.tags.length) continue

      ops.push(this.taskModel.updateTask(task.id, {tags: newTags}))
    }

    if (!ops.length) {
      console.log(`ℹ️ Tag "${name}" not found in any tasks`)
      return true
    }

    const results = await Promise.allSettled(ops)

    const failed = results.filter((r) => r.status === "rejected")
    const succeeded = results.filter((r) => r.status === "fulfilled")

    console.log(`🧹 Tag "${name}" removed from: ${succeeded.length} tasks`)
    if (failed.length > 0) console.warn(`⚠️ Failed to remove tag from ${failed.length} tasks`, failed)

    return true
  }
}
