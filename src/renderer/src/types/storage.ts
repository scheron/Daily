import type {ISODate, ISOTime, Timezone} from "./date"
import type {Day, Tag, Task} from "./tasks"

// prettier-ignore
export interface Storage {
  getDays(params?: {from?: ISODate; to?: ISODate}): Promise<Day[]>
  getDay(date: ISODate): Promise<Day | null>

  createTask(content: string, params: {date?: ISODate; time?: ISOTime; timezone?: Timezone; tags?: Tag[]; estimatedTime?: number}): Promise<Day | null>
  updateTask(id: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>): Promise<Day | null>
  deleteTask(id: Task["id"]): Promise<boolean>
  moveTask(taskId: Task["id"], targetDate: ISODate): Promise<boolean>
  addTaskTags(taskId: Task["id"], names: Tag["name"][]): Promise<Task | null>
  removeTaskTags(taskId: Task["id"], names: Tag["name"][]): Promise<Task | null>

  getTags(): Promise<Tag[]>
  createTag(name: Tag["name"], color: Tag["color"], emoji?: Tag["emoji"]): Promise<Tag | null>
  deleteTag(name: Tag["name"]): Promise<boolean>
}

export type StorageSyncEvent = {
  type: "tasks" | "tags" | "settings"
}

export type TaskEvent = {
  type: "saved" | "deleted"
}
