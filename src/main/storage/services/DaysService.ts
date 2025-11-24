import {groupTasksByDay} from "@/utils/tasks/groupTasksByDay"
import {DateTime} from "luxon"

import type {TagModel} from "@/storage/models/TagModel"
import type {TaskModel} from "@/storage/models/TaskModel"
import type {ISODate} from "@shared/types/common"
import type {Day, Tag, Task} from "@shared/types/storage"

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

    const tagMap = new Map(allTags.map((t) => [t.id, t]))

    const tasks: Task[] = tasksInternal.map((task) => {
      const tags = task.tags.map((id) => tagMap.get(id)).filter(Boolean) as Tag[]
      return {...task, tags}
    })

    return groupTasksByDay({tasks, tags: allTags})
  }

  async getDay(date: ISODate): Promise<Day | null> {
    const days = await this.getDays({from: date, to: date})
    return days[0] ?? null
  }
}
