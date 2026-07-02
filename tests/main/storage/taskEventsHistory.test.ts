// @ts-nocheck
import {beforeEach, describe, expect, it} from "vitest"

import {TaskEventModel} from "@main/storage/models/TaskEventModel"
import {TaskModel} from "@main/storage/models/TaskModel"
import {TaskEventsService} from "@main/storage/services/TaskEventsService"
import {TasksService} from "@main/storage/services/TasksService"
import {createTestDatabase} from "../../helpers/db"

const TASK_DAY = "2026-06-23"
const NEXT_DAY = "2026-06-24"

function makeTask(overrides = {}) {
  return {
    content: "Buy milk",
    status: "active",
    minimized: false,
    orderIndex: 1,
    estimatedTime: 0,
    spentTime: 0,
    branchId: "main",
    tags: [],
    attachments: [],
    scheduled: {date: TASK_DAY, time: "10:00:00", timezone: "UTC"},
    ...overrides,
  }
}

describe("task history (per task)", () => {
  let db
  let taskEvents
  let tasks

  beforeEach(() => {
    db = createTestDatabase()
    const taskModel = new TaskModel(db)
    taskEvents = new TaskEventsService(new TaskEventModel(db))
    tasks = new TasksService(taskModel, taskEvents)
  })

  it("returns the task's events newest-first", async () => {
    const task = await tasks.createTask(makeTask())
    await tasks.updateTask(task.id, {status: "done"})

    const history = await taskEvents.getHistoryByTask(task.id)
    expect(history.map((e) => e.type)).toEqual(["completed", "created"])
  })

  it("collapses a move recorded on both days into a single row", async () => {
    const task = await tasks.createTask(makeTask())
    await tasks.updateTask(task.id, {scheduled: {date: NEXT_DAY, time: "10:00:00", timezone: "UTC"}})

    const history = await taskEvents.getHistoryByTask(task.id)
    const moves = history.filter((e) => e.type === "moved")
    expect(moves).toHaveLength(1)
    expect(moves[0].fromDate).toBe(TASK_DAY)
    expect(moves[0].toDate).toBe(NEXT_DAY)
  })

  it("scopes to the requested task", async () => {
    const a = await tasks.createTask(makeTask({content: "A"}))
    const b = await tasks.createTask(makeTask({content: "B"}))

    const history = await taskEvents.getHistoryByTask(a.id)
    expect(history.every((e) => e.taskId === a.id)).toBe(true)
    expect(history.some((e) => e.taskId === b.id)).toBe(false)
  })
})
