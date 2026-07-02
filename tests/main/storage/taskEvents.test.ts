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

describe("task activity recording", () => {
  let db
  let events
  let service

  beforeEach(() => {
    db = createTestDatabase()
    const taskModel = new TaskModel(db)
    events = new TaskEventModel(db)
    service = new TasksService(taskModel, new TaskEventsService(events))
  })

  it("stamps a created event on the task's day, not calendar-today", async () => {
    const created = await service.createTask(makeTask({content: "## Buy milk\nmore"}))

    const recorded = events.getByDay(TASK_DAY, "main")
    expect(recorded).toHaveLength(1)
    expect(recorded[0].type).toBe("created")
    expect(recorded[0].taskId).toBe(created.id)
    expect(recorded[0].eventDate).toBe(TASK_DAY)
  })

  it("maps status changes to completed / discarded / reactivated on the task's day", async () => {
    const task = await service.createTask(makeTask())

    await service.updateTask(task.id, {status: "done"})
    expect(events.getByDay(TASK_DAY, "main")[0].type).toBe("completed")

    await service.updateTask(task.id, {status: "discarded"})
    expect(events.getByDay(TASK_DAY, "main")[0].type).toBe("discarded")

    await service.updateTask(task.id, {status: "active"})
    expect(events.getByDay(TASK_DAY, "main")[0].type).toBe("reactivated")
  })

  it("records a meaningful edit but debounces a second edit within the window", async () => {
    const task = await service.createTask(makeTask({content: "A"}))

    await service.updateTask(task.id, {content: "B"})
    await service.updateTask(task.id, {content: "C"})

    const edits = events.getByDay(TASK_DAY, "main").filter((e) => e.taskId === task.id && e.type === "edited")
    expect(edits).toHaveLength(1)
  })

  it("does not record a minimize-only update", async () => {
    const task = await service.createTask(makeTask())
    const before = events.getByDay(TASK_DAY, "main").length

    await service.updateTask(task.id, {minimized: true})

    expect(events.getByDay(TASK_DAY, "main").length).toBe(before)
  })

  it("records a reschedule as a moved pair across both days, no bare edit", async () => {
    const task = await service.createTask(makeTask())

    await service.updateTask(task.id, {scheduled: {date: NEXT_DAY, time: "10:00:00", timezone: "UTC"}})

    const sourceMoves = events.getByDay(TASK_DAY, "main").filter((e) => e.type === "moved")
    const targetMoves = events.getByDay(NEXT_DAY, "main").filter((e) => e.type === "moved")

    expect(sourceMoves).toHaveLength(1)
    expect(targetMoves).toHaveLength(1)
    expect(sourceMoves[0].fromDate).toBe(TASK_DAY)
    expect(sourceMoves[0].toDate).toBe(NEXT_DAY)
    expect(targetMoves[0].fromDate).toBe(TASK_DAY)
    expect(targetMoves[0].toDate).toBe(NEXT_DAY)
    expect(events.getByDay(NEXT_DAY, "main").some((e) => e.type === "edited")).toBe(false)
  })

  it("records both the move pair and an edit when day and content change together", async () => {
    const task = await service.createTask(makeTask({content: "A"}))

    await service.updateTask(task.id, {content: "B", scheduled: {date: NEXT_DAY, time: "10:00:00", timezone: "UTC"}})

    const targetDay = events.getByDay(NEXT_DAY, "main")
    expect(targetDay.filter((e) => e.type === "moved")).toHaveLength(1)
    expect(targetDay.filter((e) => e.type === "edited")).toHaveLength(1)
    expect(events.getByDay(TASK_DAY, "main").filter((e) => e.type === "moved")).toHaveLength(1)
  })

  it("records deleted and restored on the task's day", async () => {
    const task = await service.createTask(makeTask())

    await service.deleteTask(task.id)
    expect(events.getByDay(TASK_DAY, "main")[0].type).toBe("deleted")

    await service.restoreTask(task.id)
    expect(events.getByDay(TASK_DAY, "main")[0].type).toBe("restored")
  })

  it("hides a deleted task's openable history, leaving only the deletion marker, and restores it on restore", async () => {
    const task = await service.createTask(makeTask())
    await service.updateTask(task.id, {status: "done"})

    const before = events.getByDay(TASK_DAY, "main").filter((e) => e.taskId === task.id)
    expect(before.map((e) => e.type).sort()).toEqual(["completed", "created"])

    await service.deleteTask(task.id)
    const afterDelete = events.getByDay(TASK_DAY, "main").filter((e) => e.taskId === task.id)
    expect(afterDelete.map((e) => e.type)).toEqual(["deleted"])

    await service.restoreTask(task.id)
    const afterRestore = events.getByDay(TASK_DAY, "main").filter((e) => e.taskId === task.id)
    expect(afterRestore.map((e) => e.type).sort()).toEqual(["completed", "created", "deleted", "restored"])
  })

  it("scopes getByDay to the branch", async () => {
    const now = new Date().toISOString()
    db.prepare("INSERT INTO branches (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run("work", "Work", now, now)

    await service.createTask(makeTask({content: "main task"}))
    const workTask = await service.createTask(makeTask({branchId: "work", content: "work task"}))

    const mainEvents = events.getByDay(TASK_DAY, "main")
    const workEvents = events.getByDay(TASK_DAY, "work")
    expect(mainEvents.every((e) => e.branchId === "main")).toBe(true)
    expect(workEvents.every((e) => e.branchId === "work")).toBe(true)
    expect(workEvents.map((e) => e.taskId)).toEqual([workTask.id])
  })
})
