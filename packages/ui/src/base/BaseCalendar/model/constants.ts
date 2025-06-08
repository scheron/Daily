import {DateTime} from "luxon"

import type {CalendarPreset} from "./types"

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const
export const PRESETS: CalendarPreset[] = [
  {
    label: "Today",
    getValue: () => {
      const today = DateTime.now().toISODate()!
      return {start: today, end: today}
    },
  },
  {
    label: "Yesterday",
    getValue: () => {
      const yesterday = DateTime.now().minus({days: 1}).toISODate()!
      return {start: yesterday, end: yesterday}
    },
  },
  {
    label: "This week",
    getValue: () => {
      const startOfWeek = DateTime.now().startOf("week").toISODate()!
      const endOfWeek = DateTime.now().endOf("week").toISODate()!
      return {start: startOfWeek, end: endOfWeek}
    },
  },
  {
    label: "Last week",
    getValue: () => {
      const startOfWeek = DateTime.now().minus({weeks: 1}).startOf("week").toISODate()!
      const endOfWeek = DateTime.now().minus({weeks: 1}).endOf("week").toISODate()!
      return {start: startOfWeek, end: endOfWeek}
    },
  },
  {
    label: "This month",
    getValue: () => {
      const startOfMonth = DateTime.now().startOf("month").toISODate()!
      const endOfMonth = DateTime.now().endOf("month").toISODate()!
      return {start: startOfMonth, end: endOfMonth}
    },
  },
  {
    label: "Last month",
    getValue: () => {
      const startOfMonth = DateTime.now().minus({months: 1}).startOf("month").toISODate()!
      const endOfMonth = DateTime.now().minus({months: 1}).endOf("month").toISODate()!
      return {start: startOfMonth, end: endOfMonth}
    },
  },
]
