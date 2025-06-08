import type {ISODate, ISOTime, Timezone} from "./date"
import type {Day, Task} from "./tasks"

export interface Storage {
  getDays(params?: {from?: ISODate; to?: ISODate} ): Promise<Day[]>
  getDay(date: ISODate): Promise<Day | null>
  updateDay(date: ISODate, updates: {subtitle?: string}): Promise<Day | null>
  createTask(content: string, params: {date?: ISODate; time?: ISOTime; timezone?: Timezone}): Promise<Day>
  updateTask(id: Task["id"], updates: Partial<Omit<Task, "id" | "createdAt">>): Promise<Day | null>
  deleteTask(id: Task["id"]): Promise<boolean>
}

