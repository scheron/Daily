import type {ISODate, ISOTime, Timezone} from "./date"
import type {Day, Tag, Task} from "./tasks"

export interface Storage {
  getDays(params?: {from?: ISODate; to?: ISODate}): Promise<Day[]>
  getDay(date: ISODate): Promise<Day | null>

  createTask(content: string, params: {date?: ISODate; time?: ISOTime; timezone?: Timezone; tags?: Tag[]}): Promise<Day | null>
  updateTask(id: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>): Promise<Day | null>
  deleteTask(id: Task["id"]): Promise<boolean>
  addTaskTags(taskId: Task["id"], names: Tag["name"][]): Promise<Task | null>
  removeTaskTags(taskId: Task["id"], names: Tag["name"][]): Promise<Task | null>

  getTags(): Promise<Tag[]>
  createTag(name: Tag["name"], color: Tag["color"], emoji?: Tag["emoji"]): Promise<Tag | null>
  deleteTag(name: Tag["name"]): Promise<boolean>
}

export type StorageSyncEvent = {
  type: "tasks" | "tags" | "settings"
}