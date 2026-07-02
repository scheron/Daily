import {DateTime} from "luxon"

import type {StatsModel} from "@/storage/models/StatsModel"
import type {ISODate} from "@shared/types/common"
import type {StatsAggregate, StatsPeriod, StatTag} from "@shared/types/stats"
import type {Branch} from "@shared/types/storage"

/**
 * Assembles the stats-widget aggregate for a week or month, scoped by scheduled
 * date. The ring shows `(done + discarded) / total`; the completion stats (count,
 * tags, weekday/hours) cover the period's currently-`done` tasks, bucketed by each
 * task's latest `completed` time in the user's `timezone`.
 */
export class StatsService {
  constructor(private statsModel: StatsModel) {}

  async getStats(period: StatsPeriod, anchor: ISODate, branchId: Branch["id"], timezone: string): Promise<StatsAggregate> {
    const anchorDt = DateTime.fromISO(anchor, {zone: timezone})
    const start = period === "month" ? anchorDt.startOf("month") : anchorDt.startOf("week")
    const end = period === "month" ? anchorDt.endOf("month") : anchorDt.endOf("week")
    const fromDate = start.toISODate()!
    const toDate = end.toISODate()!

    const counts = this.statsModel.getStatusCounts(fromDate, toDate, branchId)
    const total = counts.active + counts.done + counts.discarded
    const resolvedPct = total === 0 ? 0 : Math.round(((counts.done + counts.discarded) / total) * 100)

    const doneTasks = this.statsModel.getDoneTaskCompletions(fromDate, toDate, branchId)
    const completedTotal = doneTasks.length

    const weekday = new Array(7).fill(0)
    const hours = new Array(24).fill(0)
    const taskIds: string[] = []
    for (const task of doneTasks) {
      taskIds.push(task.taskId)
      if (!task.createdAt) continue
      const dt = DateTime.fromISO(task.createdAt, {zone: timezone})
      if (!dt.isValid) continue

      weekday[dt.weekday - 1] += 1
      hours[dt.hour] += 1
    }
    const anyTimed = weekday.some((value) => value > 0)

    const {tags, untaggedCount} = this.buildTags(new Map(taskIds.map((id) => [id, 1])))

    return {
      resolution: {active: counts.active, done: counts.done, discarded: counts.discarded, total, resolvedPct},
      completedTotal,
      tags,
      untaggedCount,
      weekday,
      hours,
      peakWeekday: anyTimed ? argmax(weekday) : null,
      peakHour: anyTimed ? argmax(hours) : null,
      topTag: tags.length > 0 ? {id: tags[0].id, name: tags[0].name, color: tags[0].color} : null,
    }
  }

  private buildTags(perTask: Map<string, number>): {tags: StatTag[]; untaggedCount: number} {
    const tagRows = this.statsModel.getTaskTags([...perTask.keys()])
    const tagsByTask = new Map<string, {id: string; name: string; color: string}[]>()
    for (const row of tagRows) {
      const list = tagsByTask.get(row.taskId) ?? []
      list.push({id: row.id, name: row.name, color: row.color})
      tagsByTask.set(row.taskId, list)
    }

    const byTag = new Map<string, StatTag>()
    let untaggedCount = 0
    for (const [taskId, count] of perTask) {
      const taskTags = tagsByTask.get(taskId)
      if (!taskTags || taskTags.length === 0) {
        untaggedCount += count
        continue
      }
      for (const tag of taskTags) {
        const existing = byTag.get(tag.id)
        if (existing) existing.count += count
        else byTag.set(tag.id, {...tag, count})
      }
    }

    const tags = [...byTag.values()].sort((a, b) => b.count - a.count)
    return {tags, untaggedCount}
  }
}

function argmax(arr: number[]): number {
  let best = 0
  for (let i = 1; i < arr.length; i++) if (arr[i] > arr[best]) best = i
  return best
}
