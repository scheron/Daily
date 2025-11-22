import type {PartialDeep} from "type-fest"
import type {ISODate, Tag, Task, TaskInternal} from "../../../types"
import type {TagModel} from "../models/TagModel"
import type {TaskModel} from "../models/TaskModel"

export class TasksService {
  constructor(
    private taskModel: TaskModel,
    private tagModel: TagModel,
  ) {}

  async getTaskList(params?: {from?: ISODate; to?: ISODate}): Promise<Task[]> {
    const [tasks, allTags] = await Promise.all([this.taskModel.getTaskList(params), this.tagModel.getTagList()])

    const tagMap = new Map(allTags.map((t) => [t.name, t]))

    return tasks.map((task) => {
      const tags = task.tags.map((name) => tagMap.get(name)).filter(Boolean) as Tag[]
      return {...task, tags}
    })
  }

  async getTask(id: Task["id"]): Promise<Task | null> {
    const [task, allTags] = await Promise.all([this.taskModel.getTask(id), this.tagModel.getTagList()])
    if (!task) return null

    const tagMap = new Map(allTags.map((t) => [t.name, t]))
    const tags = task.tags.map((name) => tagMap.get(name)).filter(Boolean) as Tag[]

    return {...task, tags}
  }

  async updateTask(id: Task["id"], updates: PartialDeep<Task>): Promise<Task | null> {
    const updatesTask: PartialDeep<TaskInternal> = {...updates} as any

    if (updates.tags !== undefined) {
      updatesTask.tags = updates.tags.map((t) => t.name)
    }

    const [task, allTags] = await Promise.all([this.taskModel.updateTask(id, updatesTask), this.tagModel.getTagList()])
    if (!task) return null

    const tagMap = new Map(allTags.map((t) => [t.name, t]))
    const tags = task.tags.map((name) => tagMap.get(name)).filter(Boolean) as Tag[]

    return {...task, tags}
  }

  async createTask(task: Task): Promise<Task | null> {
    const newTask = {...task, tags: task.tags ? task.tags.map((t) => t.name) : []}

    const [createdTask, allTags] = await Promise.all([this.taskModel.createTask(newTask), this.tagModel.getTagList()])
    if (!createdTask) return null

    const tagMap = new Map(allTags.map((t) => [t.name, t]))
    const tags = createdTask.tags.map((name) => tagMap.get(name)).filter(Boolean) as Tag[]

    return {...createdTask, tags}
  }

  async deleteTask(id: Task["id"]): Promise<boolean> {
    return this.taskModel.deleteTask(id)
  }

  async addTaskTags(taskId: Task["id"], tagNames: Tag["name"][]): Promise<Task | null> {
    const task = await this.taskModel.getTask(taskId)
    if (!task) return null

    const existing = new Set(task.tags)

    for (const name of tagNames) {
      existing.add(name)
    }

    const updatedTask = await this.taskModel.updateTask(taskId, {tags: Array.from(existing)})
    if (!updatedTask) return null

    return this.getTask(taskId)
  }

  async removeTaskTags(taskId: Task["id"], tagNames: Tag["name"][]): Promise<Task | null> {
    if (!tagNames.length) return await this.getTask(taskId)

    const task = await this.taskModel.getTask(taskId)
    if (!task) return null

    const newTags = task.tags.filter((name) => !tagNames.includes(name))

    if (newTags.length === task.tags.length) return this.getTask(taskId)

    const updatedTask = await this.taskModel.updateTask(taskId, {tags: newTags})
    if (!updatedTask) return null

    return this.getTask(taskId)
  }

  async addTaskAttachment(taskId: Task["id"], fileId: string): Promise<Task | null> {
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

  async removeTaskAttachment(taskId: Task["id"], fileId: string): Promise<Task | null> {
    const task = await this.taskModel.getTask(taskId)
    if (!task) return null

    const newAttachments = task.attachments.filter((id) => id !== fileId)

    if (newAttachments.length === task.attachments.length) return this.getTask(taskId)

    const updatedTask = await this.taskModel.updateTask(taskId, {attachments: newAttachments})
    if (!updatedTask) return null

    return this.getTask(taskId)
  }
}
