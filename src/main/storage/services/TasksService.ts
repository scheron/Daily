import type {TagModel} from "@/storage/models/TagModel"
import type {TaskModel} from "@/storage/models/TaskModel"
import type {TaskInternal} from "@/types/storage"
import type {ISODate} from "@shared/types/common"
import type {File, Tag, Task} from "@shared/types/storage"
import type {PartialDeep} from "type-fest"

export class TasksService {
  constructor(
    private taskModel: TaskModel,
    private tagModel: TagModel,
  ) {}

  async getTaskList(params?: {from?: ISODate; to?: ISODate; limit?: number}): Promise<Task[]> {
    const [tasks, allTags] = await Promise.all([this.taskModel.getTaskList(params), this.tagModel.getTagList()])

    const tagMap = new Map(allTags.map((t) => [t.id, t]))

    return tasks.map((task) => {
      const tags = task.tags.map((id) => tagMap.get(id)).filter(Boolean) as Tag[]
      return {...task, tags}
    })
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    const [task, allTags] = await Promise.all([this.taskModel.getTask(id), this.tagModel.getTagList()])
    if (!task) return null

    const tagMap = new Map(allTags.map((t) => [t.id, t]))
    const tags = task.tags.map((id) => tagMap.get(id)).filter(Boolean) as Tag[]

    return {...task, tags}
  }

  async updateTask(id: Task["id"], updates: PartialDeep<Task>): Promise<Task | null> {
    const updatesTask: PartialDeep<TaskInternal> = {...updates} as any

    if (updates.tags !== undefined) {
      updatesTask.tags = updates.tags.map((t) => t.id)
    }

    const [task, allTags] = await Promise.all([this.taskModel.updateTask(id, updatesTask), this.tagModel.getTagList()])
    if (!task) return null

    const tagMap = new Map(allTags.map((t) => [t.id, t]))
    const tags = task.tags.map((id) => tagMap.get(id)).filter(Boolean) as Tag[]

    return {...task, tags}
  }

  async createTask(task: Task): Promise<Task | null> {
    const newTask = {
      ...task,
      tags: task.tags ? task.tags.map((t) => t.id) : [],
    }

    const [createdTask, allTags] = await Promise.all([this.taskModel.createTask(newTask), this.tagModel.getTagList()])
    if (!createdTask) return null

    const tagMap = new Map(allTags.map((t) => [t.id, t]))
    const tags = createdTask.tags.map((id) => tagMap.get(id)).filter(Boolean) as Tag[]

    return {...createdTask, tags}
  }

  async deleteTask(id: Task["id"]): Promise<boolean> {
    return this.taskModel.deleteTask(id)
  }

  async addTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    const task = await this.taskModel.getTask(taskId)
    if (!task) return null

    const existing = new Set(task.tags)

    for (const id of tagIds) {
      existing.add(id)
    }

    const updatedTask = await this.taskModel.updateTask(taskId, {tags: Array.from(existing)})
    if (!updatedTask) return null

    return this.getTask(taskId)
  }

  async removeTaskTags(taskId: Task["id"], tagIds: Tag["id"][]): Promise<Task | null> {
    if (!tagIds.length) return await this.getTask(taskId)

    const task = await this.taskModel.getTask(taskId)
    if (!task) return null

    const newTags = task.tags.filter((id) => !tagIds.includes(id))

    if (newTags.length === task.tags.length) return this.getTask(taskId)

    const updatedTask = await this.taskModel.updateTask(taskId, {tags: newTags})
    if (!updatedTask) return null

    return this.getTask(taskId)
  }

  async addTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null> {
    const task = await this.taskModel.getTask(taskId)
    if (!task) return null

    const existing = new Set(task.attachments)

    if (!existing.has(fileId)) {
      existing.add(fileId)
      const updatedTask = await this.taskModel.updateTask(taskId, {attachments: Array.from(existing)})
      if (!updatedTask) return null
    }

    return this.getTask(taskId)
  }

  async removeTaskAttachment(taskId: Task["id"], fileId: File["id"]): Promise<Task | null> {
    const task = await this.taskModel.getTask(taskId)
    if (!task) return null

    const newAttachments = task.attachments.filter((id) => id !== fileId)

    if (newAttachments.length === task.attachments.length) return this.getTask(taskId)

    const updatedTask = await this.taskModel.updateTask(taskId, {attachments: newAttachments})
    if (!updatedTask) return null

    return this.getTask(taskId)
  }
}
