// @ts-nocheck
import {beforeEach, describe, expect, it} from "vitest"

import {StatsModel} from "@main/storage/models/StatsModel"
import {TaskEventModel} from "@main/storage/models/TaskEventModel"
import {StatsService} from "@main/storage/services/StatsService"
import {createTestDatabase} from "../../helpers/db"

function insertTask(db, {id, status, date}) {
  db.prepare(
    `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
     VALUES (?, ?, '', 0, 0, ?, '10:00:00', 'UTC', 0, 0, 'main', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)`,
  ).run(id, status, date)
}

function insertTag(db, {id, name, color}) {
  db.prepare(
    `INSERT INTO tags (id, name, color, created_at, updated_at, deleted_at) VALUES (?, ?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)`,
  ).run(id, name, color)
}

function tagTask(db, taskId, tagId) {
  db.prepare(`INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)`).run(taskId, tagId)
}

describe("StatsService.getStats", () => {
  let db
  let events
  let service

  beforeEach(() => {
    db = createTestDatabase()
    events = new TaskEventModel(db)
    service = new StatsService(new StatsModel(db))
  })

  function complete(taskId, createdAt) {
    events.record({taskId, branchId: "main", type: "completed", eventDate: createdAt.slice(0, 10), fromDate: null, toDate: null, createdAt})
  }

  it("aggregates resolution, done tasks, weekday/hours and tags for a month", async () => {
    insertTask(db, {id: "t1", status: "done", date: "2026-06-15"})
    insertTask(db, {id: "t2", status: "done", date: "2026-06-16"})
    insertTask(db, {id: "t3", status: "active", date: "2026-06-17"})
    insertTask(db, {id: "t4", status: "discarded", date: "2026-06-18"})
    insertTag(db, {id: "tag-work", name: "work", color: "#3b82f6"})
    tagTask(db, "t1", "tag-work")
    complete("t1", "2026-06-15T10:00:00.000Z") // Monday, hour 10, tagged work
    complete("t2", "2026-06-16T18:30:00.000Z") // Tuesday, hour 18, untagged

    const s = await service.getStats("month", "2026-06-15", "main", "utc")

    expect(s.resolution).toEqual({active: 1, done: 2, discarded: 1, total: 4, resolvedPct: 75})
    expect(s.completedTotal).toBe(2) // == resolution.done
    expect(s.weekday[0]).toBe(1)
    expect(s.weekday[1]).toBe(1)
    expect(s.hours[10]).toBe(1)
    expect(s.hours[18]).toBe(1)
    expect(s.tags).toEqual([{id: "tag-work", name: "work", color: "#3b82f6", count: 1}])
    expect(s.untaggedCount).toBe(1)
    expect(s.topTag).toEqual({id: "tag-work", name: "work", color: "#3b82f6"})
    expect(s.peakWeekday).toBe(0)
    expect(s.peakHour).toBe(10)
  })

  it("completedTotal counts done tasks scheduled in the period, not raw completion events", async () => {
    insertTask(db, {id: "t5", status: "done", date: "2026-07-05"}) // a July task
    complete("t5", "2026-06-20T09:00:00.000Z") // completed early, on June 20

    const june = await service.getStats("month", "2026-06-15", "main", "utc")
    expect(june.completedTotal).toBe(0) // July task does not count toward June

    const july = await service.getStats("month", "2026-07-15", "main", "utc")
    expect(july.completedTotal).toBe(1)
    expect(july.weekday[5]).toBe(1) // bucketed by its completion time (Saturday June 20)
  })

  it("uses the latest completion when a task was completed several times", async () => {
    insertTask(db, {id: "t1", status: "done", date: "2026-06-15"})
    complete("t1", "2026-06-15T10:00:00.000Z") // Monday, hour 10
    complete("t1", "2026-06-17T14:00:00.000Z") // re-completed Wednesday, hour 14 (latest)

    const s = await service.getStats("month", "2026-06-15", "main", "utc")

    expect(s.completedTotal).toBe(1)
    expect(s.weekday[2]).toBe(1) // Wednesday only
    expect(s.weekday[0]).toBe(0)
    expect(s.hours[14]).toBe(1)
    expect(s.peakHour).toBe(14)
  })

  it("narrows to the active day's week in week mode", async () => {
    insertTask(db, {id: "x", status: "done", date: "2026-06-16"}) // inside the week of June 15–21
    insertTask(db, {id: "y", status: "done", date: "2026-06-08"}) // previous week
    complete("x", "2026-06-16T12:00:00.000Z")
    complete("y", "2026-06-08T12:00:00.000Z")

    expect((await service.getStats("week", "2026-06-16", "main", "utc")).completedTotal).toBe(1)
    expect((await service.getStats("month", "2026-06-16", "main", "utc")).completedTotal).toBe(2)
  })

  it("buckets the completion hour into the requested timezone", async () => {
    insertTask(db, {id: "z", status: "done", date: "2026-06-15"})
    complete("z", "2026-06-15T23:30:00.000Z")

    expect((await service.getStats("month", "2026-06-15", "main", "utc")).peakHour).toBe(23)
    expect((await service.getStats("month", "2026-06-15", "main", "America/New_York")).peakHour).toBe(19) // UTC-4 in June
  })

  it("returns zeroed resolution and null peaks for an empty period", async () => {
    const s = await service.getStats("month", "2026-06-15", "main", "utc")

    expect(s.resolution).toEqual({active: 0, done: 0, discarded: 0, total: 0, resolvedPct: 0})
    expect(s.completedTotal).toBe(0)
    expect(s.tags).toEqual([])
    expect(s.peakWeekday).toBeNull()
    expect(s.peakHour).toBeNull()
    expect(s.topTag).toBeNull()
  })
})
