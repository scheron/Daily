import type {Day} from "@/types/tasks"
import type {DateTime} from "luxon"
import type {CalendarDay} from "./types"

export function formatDaysToMonth(currentMonth: DateTime, days: Day[]): CalendarDay[] {
  const startOfMonth = currentMonth.startOf("month")
  const endOfMonth = currentMonth.endOf("month")
  const startOfWeek = startOfMonth.startOf("week")
  const endOfWeek = endOfMonth.endOf("week")

  const calendarDays: CalendarDay[] = []
  let current = startOfWeek

  while (current <= endOfWeek) {
    const isoDate = current.toISODate()!
    const dayData = days.find((day) => day.date === isoDate)

    const dayInfo = {
      countCompletedTasks: 0,
      countDiscardedTasks: 0,
      countActiveTasks: 0,
      countTotalTasks: 0,
    }

    if (dayData && dayData.tasks.length > 0) {
      dayInfo.countCompletedTasks = dayData.tasks.filter((task) => task.status === "done").length
      dayInfo.countDiscardedTasks = dayData.tasks.filter((task) => task.status === "discarded").length
      dayInfo.countTotalTasks = dayData.tasks.length
      dayInfo.countActiveTasks = dayData.tasks.length - dayInfo.countCompletedTasks - dayInfo.countDiscardedTasks
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
