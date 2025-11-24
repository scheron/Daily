import {removeDuplicates} from "@shared/utils/arrays/removeDuplicates"

import type {Day} from "@shared/types/storage"

export function updateDays(days: Day[], updatedDay: Day): Day[] {
  const dayWithStats = updateDayStats(updatedDay)
  const updatedDays = [...days]

  const dayIndex = updatedDays.findIndex((day) => day.date === dayWithStats.date)

  if (dayIndex === -1) return updatedDays.concat(dayWithStats)

  updatedDays.splice(dayIndex, 1, dayWithStats)

  return updatedDays
}

function updateDayStats(day: Day): Day {
  const countActive = day.tasks.filter((task) => task.status === "active").length
  const countDone = day.tasks.filter((task) => task.status === "done").length

  const usedTags = new Set(day.tasks.flatMap((t) => t.tags.map((tag) => tag.id)))
  const updatedTags = day.tags.filter((tag) => usedTags.has(tag.id))

  return {
    ...day,
    countActive,
    countDone,
    /** @deprecated Remove in future */
    tags: removeDuplicates(updatedTags, "id"),
  }
}
