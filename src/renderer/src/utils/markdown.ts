import {DateTime} from "luxon"

import type {Day} from "@/types/tasks"
import type {ExportDayData} from "@/types/settings"

function getDateRange(fromDate: string, toDate: string): string[] {
  const start = DateTime.fromISO(fromDate)
  const end = DateTime.fromISO(toDate)
  const dates: string[] = []

  let cursor = start

  while (cursor <= end) {
    dates.push(cursor.toISODate()!)
    cursor = cursor.plus({days: 1})
  }

  return dates
}

function sortDays(days: Day[]): Day[] {
  return [...days].sort((a, b) => {
    const dateA = DateTime.fromISO(a.date)
    const dateB = DateTime.fromISO(b.date)
    return dateA > dateB ? -1 : dateA < dateB ? 1 : 0
  })
}

export function prepareTasksForExport({fromDate, toDate, days}: {fromDate: string; toDate: string; days: Day[]}): ExportDayData[] {
  const allDates = getDateRange(fromDate, toDate).reverse()
  const sortedDays = sortDays(days)

  const dayMap = new Map<string, Day>()

  for (const d of sortedDays) {
    dayMap.set(d.date, d)
  }

  const exportData: ExportDayData[] = []

  for (const date of allDates) {
    const dayObj = dayMap.get(date)

    if (!dayObj || !dayObj.tasks.length) continue

    const usedFilenames = new Set<string>()

    const tasks = dayObj.tasks.map((task) => {
      const taskContent = task.content.trim()
      const status = task.status === "done" ? "Done" : task.status === "discarded" ? "Discarded" : "Active"

      let baseFilename = task.scheduled.time.replace(":", "-") 
      let filename = `${baseFilename}.md`

      let counter = 1
      while (usedFilenames.has(filename)) {
        filename = `${baseFilename}(${counter}).md`
        counter++
      }
      usedFilenames.add(filename)

      const content = `---
date: ${task.scheduled.date}
time: ${task.scheduled.time}
day_title: ${dayMap.get(date)?.subtitle || ""}
status: ${status}
---

${taskContent}`

      return {filename, content}
    })

    exportData.push({date, tasks})
  }

  return exportData
}
