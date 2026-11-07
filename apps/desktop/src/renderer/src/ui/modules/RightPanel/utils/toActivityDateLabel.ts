import {diffDays, toDateLabel} from "@daily/std"

export function toActivityDateLabel(date: string, today: string, options: {year?: boolean} = {}) {
  switch (diffDays(date, today)) {
    case -1:
      return "Yesterday"
    case 0:
      return "Today"
    case 1:
      return "Tomorrow"
    default:
      return toDateLabel(date, {short: true, ...options})
  }
}
