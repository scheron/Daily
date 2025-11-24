import {DateTime} from "luxon"

import type {ISODate} from "@shared/types/common"

export function sortScheduledTasks<T extends {scheduled: {date: ISODate; time?: string}}>(tasks: T[], direction: "asc" | "desc" = "asc"): T[] {
  return tasks.toSorted((a, b) => {
    const aTime = a.scheduled.time || "00:00:00"
    const bTime = b.scheduled.time || "00:00:00"

    const aDateTime = DateTime.fromISO(`${a.scheduled.date}T${aTime}`)
    const bDateTime = DateTime.fromISO(`${b.scheduled.date}T${bTime}`)

    if (!aDateTime.isValid || !bDateTime.isValid) {
      console.error("Invalid date/time format:", {a, b, aDateTime, bDateTime})
      return 0
    }

    const aMillis = aDateTime.toMillis()
    const bMillis = bDateTime.toMillis()

    return direction === "asc" ? aMillis - bMillis : bMillis - aMillis
  })
}
