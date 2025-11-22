import {DateTime} from "luxon"

import type {Day, ISODate, Tag, Task} from "../../../types.js"
import type {TagModel} from "../models/TagModel.js"
import type {TaskModel} from "../models/TaskModel.js"

import {groupTasksByDay} from "../../../utils/tasks.js"

export class DaysService {
  constructor(
    private taskModel: TaskModel,
    private tagModel: TagModel,
  ) {}

  async getDays(params: {from?: ISODate; to?: ISODate} = {}): Promise<Day[]> {
    const {from, to} = params
    const fromDate = from ?? DateTime.now().minus({years: 1}).toISODate()!
    const toDate = to ?? DateTime.now().plus({years: 1}).toISODate()!

    const [tasksInternal, allTags] = await Promise.all([this.taskModel.getTaskList({from: fromDate, to: toDate}), this.tagModel.getTagList()])

    const tagMap = new Map(allTags.map((t) => [t.name, t]))
    const tasks: Task[] = tasksInternal.map((task) => {
      const tags = task.tags.map((name) => tagMap.get(name)).filter(Boolean) as Tag[]
      return {...task, tags}
    })

    return groupTasksByDay({tasks, tags: allTags})
  }

  async getDay(date: ISODate): Promise<Day | null> {
    const days = await this.getDays({from: date, to: date})
    return days[0] ?? null
  }
}
