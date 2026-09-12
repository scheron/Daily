// @ts-nocheck
import {beforeEach, describe, expect, it} from "vitest"

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

    const recorded = events.getByTask(created.id)
    expect(recorded).toHaveLength(1)
    expect(recorded[0].type).toBe("created")
    expect(recorded[0].taskId).toBe(created.id)
    expect(recorded[0].eventDate).toBe(TASK_DAY)
  })

  it("maps status changes to completed / discarded / reactivated on the task's day", async () => {
    const task = await service.createTask(makeTask())

    await service.updateTask(task.id, {status: "done"})
    expect(events.getByTask(task.id)[0].type).toBe("completed")

    await service.updateTask(task.id, {status: "discarded"})
    expect(events.getByTask(task.id)[0].type).toBe("discarded")

    await service.updateTask(task.id, {status: "active"})
    expect(events.getByTask(task.id)[0].type).toBe("reactivated")
  })

  it("records a meaningful edit but debounces a second edit within the window", async () => {
    const task = await service.createTask(makeTask({content: "A"}))

    await service.updateTask(task.id, {content: "B"})
    await service.updateTask(task.id, {content: "C"})

    const edits = events.getByTask(task.id).filter((e) => e.type === "edited")
    expect(edits).toHaveLength(1)
  })

  it("does not record a minimize-only update", async () => {
    const task = await service.createTask(makeTask())
    const before = events.getByTask(task.id).length

    await service.updateTask(task.id, {minimized: true})

    expect(events.getByTask(task.id).length).toBe(before)
  })

  it("records a reschedule as a moved pair across both days, no bare edit", async () => {
    const task = await service.createTask(makeTask())

    await service.updateTask(task.id, {scheduled: {date: NEXT_DAY, time: "10:00:00", timezone: "UTC"}})

    const moves = events.getByTask(task.id).filter((e) => e.type === "moved")
    const sourceMoves = moves.filter((e) => e.eventDate === TASK_DAY)
    const targetMoves = moves.filter((e) => e.eventDate === NEXT_DAY)

    expect(sourceMoves).toHaveLength(1)
    expect(targetMoves).toHaveLength(1)
    expect(sourceMoves[0].fromDate).toBe(TASK_DAY)
    expect(sourceMoves[0].toDate).toBe(NEXT_DAY)
    expect(targetMoves[0].fromDate).toBe(TASK_DAY)
    expect(targetMoves[0].toDate).toBe(NEXT_DAY)
    expect(events.getByTask(task.id).some((e) => e.type === "edited")).toBe(false)
  })

  it("records both the move pair and an edit when day and content change together", async () => {
    const task = await service.createTask(makeTask({content: "A"}))

    await service.updateTask(task.id, {content: "B", scheduled: {date: NEXT_DAY, time: "10:00:00", timezone: "UTC"}})

    const taskEvents = events.getByTask(task.id)
    const targetDay = taskEvents.filter((e) => e.eventDate === NEXT_DAY)
    expect(targetDay.filter((e) => e.type === "moved")).toHaveLength(1)
    expect(targetDay.filter((e) => e.type === "edited")).toHaveLength(1)
    expect(taskEvents.filter((e) => e.eventDate === TASK_DAY && e.type === "moved")).toHaveLength(1)
  })

  it("records deleted and restored on the task's day", async () => {
    const task = await service.createTask(makeTask())

    await service.deleteTask(task.id)
    expect(events.getByTask(task.id)[0].type).toBe("deleted")

    await service.restoreTask(task.id)
    expect(events.getByTask(task.id)[0].type).toBe("restored")
  })

  it("keeps every event of a task visible through a delete and a restore", async () => {
    const task = await service.createTask(makeTask())
    await service.updateTask(task.id, {status: "done"})

    const before = events.getByTask(task.id)
    expect(before.map((e) => e.type).sort()).toEqual(["completed", "created"])

    await service.deleteTask(task.id)
    const afterDelete = events.getByTask(task.id)
    expect(afterDelete.map((e) => e.type).sort()).toEqual(["completed", "created", "deleted"])

    await service.restoreTask(task.id)
    const afterRestore = events.getByTask(task.id)
    expect(afterRestore.map((e) => e.type).sort()).toEqual(["completed", "created", "deleted", "restored"])
  })

  it("records_TC-1_a_created_event_dated_today_for_a_task_made_in_the_backlog", async () => {
    const created = await service.createTask(makeTask({status: "backlog", scheduled: null, content: "no day yet"}))

    const history = events.getByTask(created.id)
    expect(history).toHaveLength(1)
    expect(history[0].type).toBe("created")
    expect(history[0].eventDate).toBe(getToday())
  })

  it("records_TC-2_edited_deleted_and_restored_events_dated_today_for_a_backlog_task", async () => {
    const created = await service.createTask(makeTask({status: "backlog", scheduled: null, content: "A"}))

    await service.updateTask(created.id, {content: "B"})
    await service.deleteTask(created.id)
    await service.restoreTask(created.id)

    const history = events.getByTask(created.id)
    expect(history.map((e) => e.type).sort()).toEqual(["created", "deleted", "edited", "restored"])
    expect(history.every((e) => e.eventDate === getToday())).toBe(true)
  })

  it("records_TC-3_no_event_when_an_active_task_moves_to_the_backlog_by_status_or_by_drag", async () => {
    const byStatus = await service.createTask(makeTask({content: "by status"}))
    const byDrag = await service.createTask(makeTask({content: "by drag"}))

    const beforeByStatus = events.getByTask(byStatus.id).length
    const beforeByDrag = events.getByTask(byDrag.id).length

    await service.updateTask(byStatus.id, {status: "backlog"})
    await service.moveTaskByOrder({taskId: byDrag.id, targetStatus: "backlog", activeDate: TASK_DAY})

    expect(events.getByTask(byStatus.id)).toHaveLength(beforeByStatus)
    expect(events.getByTask(byDrag.id)).toHaveLength(beforeByDrag)
  })

  it("records_TC-4_a_reactivated_event_dated_the_target_day_when_a_backlog_task_moves_to_active", async () => {
    const task = await service.createTask(makeTask({status: "backlog", scheduled: null, content: "waiting"}))

    await service.moveTaskByOrder({taskId: task.id, targetStatus: "active", activeDate: TASK_DAY})

    const reactivated = events.getByTask(task.id).filter((e) => e.type === "reactivated")
    expect(reactivated).toHaveLength(1)
    expect(reactivated[0].eventDate).toBe(TASK_DAY)
  })

  it("records_TC-5_the_same_events_as_before_this_plan_for_tasks_that_always_had_a_day", async () => {
    const rescheduled = await service.createTask(makeTask({content: "reschedule me"}))
    await service.updateTask(rescheduled.id, {scheduled: {date: NEXT_DAY, time: "10:00:00", timezone: "UTC"}})
    await service.updateTask(rescheduled.id, {status: "done"})

    const rescheduledHistory = events.getByTask(rescheduled.id)
    const created = rescheduledHistory.filter((e) => e.type === "created")
    expect(created).toHaveLength(1)
    expect(created[0].eventDate).toBe(TASK_DAY)
    const moves = rescheduledHistory.filter((e) => e.type === "moved")
    expect(moves).toHaveLength(2)
    expect(moves.every((e) => e.fromDate === TASK_DAY && e.toDate === NEXT_DAY)).toBe(true)
    const completed = rescheduledHistory.filter((e) => e.type === "completed")
    expect(completed).toHaveLength(1)
    expect(completed[0].eventDate).toBe(NEXT_DAY)

    const edited = await service.createTask(makeTask({content: "A"}))
    await service.updateTask(edited.id, {content: "B"})
    await service.updateTask(edited.id, {content: "C"})
    expect(events.getByTask(edited.id).filter((e) => e.type === "edited")).toHaveLength(1)

    const deletedTask = await service.createTask(makeTask({content: "delete me"}))
    await service.deleteTask(deletedTask.id)
    await service.restoreTask(deletedTask.id)
    const deletedHistory = events.getByTask(deletedTask.id)
    expect(deletedHistory.filter((e) => e.type === "deleted")[0].eventDate).toBe(TASK_DAY)
    expect(deletedHistory.filter((e) => e.type === "restored")[0].eventDate).toBe(TASK_DAY)
  })

  it("records_TC-4_one_reactivated_event_dated_the_given_day_when_updateTask_alone_hands_a_backlog_task_a_day", async () => {
    const task = await service.createTask(makeTask({status: "backlog", scheduled: null, content: "no day yet"}))

    await service.updateTask(task.id, {scheduled: {date: NEXT_DAY, time: "", timezone: "UTC"}})

    const reactivated = events.getByTask(task.id).filter((e) => e.type === "reactivated")
    expect(reactivated).toHaveLength(1)
    expect(reactivated[0].eventDate).toBe(NEXT_DAY)
  })
})
