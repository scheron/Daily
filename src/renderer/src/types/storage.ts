import type {ISODate, ISOTime, Timezone} from "./date"
import type {Day, Tag, Task} from "./tasks"

export interface Storage {
  getDays(params?: {from?: ISODate; to?: ISODate}): Promise<Day[]>
  getDay(date: ISODate): Promise<Day | null>
  updateDay(date: ISODate, updates: {subtitle?: string}): Promise<Day | null>

  createTask(content: string, params: {date?: ISODate; time?: ISOTime; timezone?: Timezone; tags?: Tag[]}): Promise<Day>
  updateTask(id: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>): Promise<Day | null>
  deleteTask(id: Task["id"]): Promise<boolean>
  addTaskTags(taskId: Task["id"], ids: Tag["id"][]): Promise<Task | null>
  removeTaskTags(taskId: Task["id"], ids: Tag["id"][]): Promise<Task | null>

  getTags(): Promise<Tag[]>
  createTag(name: Tag["name"], color: Tag["color"]): Promise<Tag | null>
  deleteTag(id: Tag["id"]): Promise<boolean>
}
