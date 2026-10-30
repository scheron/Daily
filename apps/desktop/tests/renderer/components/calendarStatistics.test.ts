// @ts-nocheck
import {DateTime} from "luxon"
import {expect, it} from "vitest"

import {groupTasksByDay} from "@daily/protocol"

import {calcMonthStatistics} from "../../../src/renderer/src/ui/common/calendar/TaskCalendar/utils/calcMonthStatistics"
import {formatDaysToMonth} from "../../../src/renderer/src/ui/common/calendar/TaskCalendar/utils/formatDaysToMonth"
import {makeTask} from "../../helpers/taskFixtures"

it("counts each true status in the calendar without counting ready tasks as Cancelled", () => {
  const tasks = ["todo", "ready_for_agent", "ready_to_merge", "in_progress", "done", "cancelled"].map((status, i) =>
    makeTask({id: String(i), status, orderIndex: i}),
  )
  const days = groupTasksByDay({tasks, tags: []})
  expect(calcMonthStatistics(days).get("2030-01")).toEqual({
    backlog: 0,
    todo: 1,
    ready_for_agent: 1,
    in_progress: 1,
    ready_to_merge: 1,
    done: 1,
    cancelled: 1,
  })
})

it("marks a day with only a ready stage as outstanding", () => {
  const days = groupTasksByDay({tasks: [makeTask({status: "ready_to_merge"})], tags: []})
  const day = formatDaysToMonth(DateTime.fromISO("2030-01-01"), days).find((day) => day.isoDate === "2030-01-02")
  expect(day.dayInfo.countActiveTasks).toBe(1)
})

it("exposes both ready stages as outstanding through the public day statistics", () => {
  const days = groupTasksByDay({
    tasks: [makeTask({id: "r1", status: "ready_for_agent", orderIndex: 1}), makeTask({id: "r2", status: "ready_to_merge", orderIndex: 2})],
    tags: [],
  })
  expect(days[0].countActive).toBe(2)
})
