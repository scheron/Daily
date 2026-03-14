import {DateTime} from "luxon"

import {groupTasksByDay} from "@/utils/tasks/groupTasksByDay"

import type {TaskModel} from "@/storage/models/TaskModel"
import type {ISODate} from "@shared/types/common"
import type {Branch, Day} from "@shared/types/storage"

export class DaysService {
  constructor(private taskModel: TaskModel) {}

  async getDays(params: {from?: ISODate; to?: ISODate; branchId?: Branch["id"]} = {}): Promise<Day[]> {
    const {from, to, branchId} = params
    const fromDate = from ?? DateTime.now().minus({years: 1}).toISODate()!
    const toDate = to ?? DateTime.now().plus({years: 1}).toISODate()!

    const tasks = this.taskModel.getTaskList({from: fromDate, to: toDate, branchId})
    const tags = tasks.flatMap((task) => task.tags)
    return groupTasksByDay({tasks, tags})
  }

  async getDay(date: ISODate, params?: {branchId?: Branch["id"]}): Promise<Day | null> {
    const days = await this.getDays({from: date, to: date, branchId: params?.branchId})
    return days[0] ?? null
  }
}
