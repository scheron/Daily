// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {getToday} from "@daily/std"

import {TaskEventModel} from "../../src/storage/models/TaskEventModel"
import {TaskModel} from "../../src/storage/models/TaskModel"
import {TaskEventsService} from "../../src/storage/services/TaskEventsService"
import {TasksService} from "../../src/storage/services/TasksService"
import {createTestDatabase} from "../helpers/db"

const TASK_DAY = "2026-06-23"
const NEXT_DAY = "2026-06-24"

function makeTask(overrides = {}) {
  return {
    content: "Buy milk",
    status: "in_progress",
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
  let eventModel
  let taskEvents
  let tasks

  beforeEach(() => {
    db = createTestDatabase()
    const taskModel = new TaskModel(db)
    eventModel = new TaskEventModel(db)
    taskEvents = new TaskEventsService(eventModel)
    tasks = new TasksService(taskModel, taskEvents)
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  it("records assigning and clearing a Ready day as explicit moves with their actor", async () => {
    const task = await tasks.createTask(makeTask({status: "ready_for_agent", scheduled: null}))
    const source = {kind: "mcp", provider: "codex"}

    await tasks.updateTask(task.id, {scheduled: {date: TASK_DAY, time: "10:00:00", timezone: "UTC"}}, source)
    const assigned = await taskEvents.getHistoryByTask(task.id)
    expect(assigned.map((event) => event.type)).toEqual(["moved", "created"])
    expect(assigned[0]).toMatchObject({eventDate: TASK_DAY, fromDate: null, toDate: TASK_DAY, kind: "mcp", provider: "codex"})

    await tasks.updateTask(task.id, {scheduled: null}, source)
    const cleared = await taskEvents.getHistoryByTask(task.id)
    expect(cleared.map((event) => event.type)).toEqual(["moved", "moved", "created"])
    expect(cleared[0]).toMatchObject({fromDate: TASK_DAY, toDate: null, kind: "mcp", provider: "codex"})
    expect(await tasks.getTask(task.id)).toMatchObject({status: "ready_for_agent", scheduled: null})
  })

  it("returns the task's events newest first", async () => {
    const task = await tasks.createTask(makeTask())
    await tasks.updateTask(task.id, {status: "done"})

    expect((await taskEvents.getHistoryByTask(task.id)).map((event) => event.type)).toEqual(["status_changed", "created"])
  })

  it("collapses a move recorded on both days into one history row", async () => {
    const task = await tasks.createTask(makeTask())
    await tasks.updateTask(task.id, {scheduled: {date: NEXT_DAY, time: "10:00:00", timezone: "UTC"}})

    const moves = (await taskEvents.getHistoryByTask(task.id)).filter((event) => event.type === "moved")
    expect(moves).toMatchObject([{fromDate: TASK_DAY, toDate: NEXT_DAY}])
  })

  it("keeps repeated identical moves made within the same millisecond", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-23T10:00:00.000Z"))
    const task = await tasks.createTask(makeTask())

    for (const date of [NEXT_DAY, TASK_DAY, NEXT_DAY]) {
      await tasks.updateTask(task.id, {scheduled: {date, time: "10:00:00", timezone: "UTC"}})
    }

    const history = await taskEvents.getHistoryByTask(task.id)
    expect(history.filter((event) => event.type === "moved")).toHaveLength(3)
    expect(await taskEvents.getMoveCounts()).toMatchObject({[task.id]: 3})
    expect(history.map((event) => event.sequence)).toEqual([...history.map((event) => event.sequence)].sort((a, b) => b - a))
  })

  it("reads legacy status events without inventing transition values and collapses legacy move pairs", async () => {
    const task = await tasks.createTask(makeTask())
    const makeLegacyEvent = (overrides = {}) => ({
      taskId: task.id,
      branchId: "main",
      type: "moved",
      eventDate: TASK_DAY,
      fromDate: TASK_DAY,
      toDate: NEXT_DAY,
      createdAt: "2026-06-23T11:00:00.000Z",
      ...overrides,
    })
    for (const eventDate of [TASK_DAY, NEXT_DAY]) eventModel.record(makeLegacyEvent({eventDate}))
    eventModel.record(
      makeLegacyEvent({
        type: "completed",
        eventDate: NEXT_DAY,
        fromDate: null,
        toDate: null,
        createdAt: "2026-06-23T12:00:00.000Z",
      }),
    )

    const history = await taskEvents.getHistoryByTask(task.id)
    expect(history.filter((event) => event.type === "moved")).toHaveLength(1)
    const completed = history.find((event) => event.type === "completed")
    expect(completed.fromStatus ?? null).toBeNull()
    expect(completed.toStatus ?? null).toBeNull()
    expect(await taskEvents.getCompletionsBetween("2026-06-23T12:00:00.000Z", "2026-06-24T00:00:00.000Z")).toEqual([
      {taskId: task.id, at: "2026-06-23T12:00:00.000Z"},
    ])
  })

  it("scopes history to the requested task", async () => {
    const a = await tasks.createTask(makeTask({content: "A"}))
    const b = await tasks.createTask(makeTask({content: "B"}))

    const history = await taskEvents.getHistoryByTask(a.id)
    expect(history.every((event) => event.taskId === a.id)).toBe(true)
    expect(history.some((event) => event.taskId === b.id)).toBe(false)
  })

  it("records only the status when moving Backlog to To Do on the board", async () => {
    const task = await tasks.createTask(makeTask({status: "backlog", scheduled: null}))

    await tasks.moveTaskByOrder({taskId: task.id, targetStatus: "todo", activeDate: TASK_DAY})

    expect(await tasks.getTask(task.id)).toMatchObject({status: "todo", scheduled: {date: TASK_DAY}})
    expect(await taskEvents.getHistoryByTask(task.id)).toMatchObject([
      {type: "status_changed", fromStatus: "backlog", toStatus: "todo", eventDate: TASK_DAY},
      {type: "created", eventDate: getToday()},
    ])
  })

  it("records only the status when moving To Do to Backlog on the board", async () => {
    const task = await tasks.createTask(makeTask({status: "todo"}))

    await tasks.moveTaskByOrder({taskId: task.id, targetStatus: "backlog", activeDate: TASK_DAY})

    expect(await tasks.getTask(task.id)).toMatchObject({status: "backlog", scheduled: null})
    expect(await taskEvents.getHistoryByTask(task.id)).toMatchObject([
      {type: "status_changed", fromStatus: "todo", toStatus: "backlog"},
      {type: "created"},
    ])
  })

  it("records only the status for a status-only write that clears the schedule", async () => {
    const task = await tasks.createTask(makeTask({status: "todo"}))

    await tasks.updateTask(task.id, {status: "backlog"})

    expect(await tasks.getTask(task.id)).toMatchObject({status: "backlog", scheduled: null})
    expect(await taskEvents.getHistoryByTask(task.id)).toMatchObject([
      {type: "status_changed", fromStatus: "todo", toStatus: "backlog"},
      {type: "created"},
    ])
  })

  it("records the date when moving To Do to another day", async () => {
    const task = await tasks.createTask(makeTask({status: "todo"}))

    await tasks.updateTask(task.id, {scheduled: {date: NEXT_DAY}})

    expect(await taskEvents.getHistoryByTask(task.id)).toMatchObject([{type: "moved", fromDate: TASK_DAY, toDate: NEXT_DAY}, {type: "created"}])
  })

  it("records only the status when leaving Backlog with a time but no chosen date", async () => {
    const task = await tasks.createTask(makeTask({status: "backlog", scheduled: null}))

    await tasks.updateTask(task.id, {status: "todo", scheduled: {time: "14:00:00"}})

    expect(await tasks.getTask(task.id)).toMatchObject({status: "todo", scheduled: {date: getToday(), time: "14:00:00"}})
    expect(await taskEvents.getHistoryByTask(task.id)).toMatchObject([
      {type: "status_changed", fromStatus: "backlog", toStatus: "todo"},
      {type: "created"},
    ])
  })

  it("records both fields when moving out of Backlog with an explicitly chosen date", async () => {
    const task = await tasks.createTask(makeTask({status: "backlog", scheduled: null}))

    await tasks.updateTask(task.id, {status: "todo", scheduled: {date: NEXT_DAY}})

    expect(await taskEvents.getHistoryByTask(task.id)).toMatchObject([
      {type: "moved", fromDate: null, toDate: NEXT_DAY},
      {type: "status_changed", fromStatus: "backlog", toStatus: "todo"},
      {type: "created"},
    ])
  })
})
