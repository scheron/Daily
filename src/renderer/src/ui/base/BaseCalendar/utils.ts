import type {Day} from "@shared/types/storage"
import type {DateTime} from "luxon"
import type {CalendarDay} from "./types"

export function formatDaysToMonth(currentMonth: DateTime, days: Day[]): CalendarDay[] {
  const startOfMonth = currentMonth.startOf("month")
  const endOfMonth = currentMonth.endOf("month")
  const startOfWeek = startOfMonth.startOf("week")
  const endOfWeek = endOfMonth.endOf("week")

  const calendarDays: CalendarDay[] = []
  const daysMap = new Map(days.map((day) => [day.date, day]))
  let current = startOfWeek

  while (current <= endOfWeek) {
    const isoDate = current.toISODate()!
    const dayData = daysMap.get(isoDate)

    const dayInfo = {
      countCompletedTasks: 0,
      countDiscardedTasks: 0,
      countActiveTasks: 0,
      countTotalTasks: 0,
    }

    if (dayData && dayData.tasks.length > 0) {
      dayInfo.countCompletedTasks = dayData.countDone
      dayInfo.countDiscardedTasks = dayData.tasks.length - dayData.countDone - dayData.countActive
      dayInfo.countTotalTasks = dayData.tasks.length
      dayInfo.countActiveTasks = dayData.countActive
    }

    calendarDays.push({
      date: current,
      isCurrentMonth: current.month === currentMonth.month,
      isoDate,
      dayInfo,
    })

    current = current.plus({days: 1})
  }

  return calendarDays
}
