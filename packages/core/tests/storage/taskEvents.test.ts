// @ts-nocheck
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {getToday} from "@daily/std"

import {createStorageCore} from "../../src/storage/createStorageCore"
import {BranchModel} from "../../src/storage/models/BranchModel"
import {MilestoneModel} from "../../src/storage/models/MilestoneModel"
import {TagModel} from "../../src/storage/models/TagModel"
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

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  it("stamps a created event on the task's day, not calendar-today", async () => {
    const created = await service.createTask(makeTask({content: "## Buy milk\nmore"}))

    expect(events.getByTask(created.id)).toMatchObject([{type: "created", taskId: created.id, eventDate: TASK_DAY}])
  })

  it("dates a backlog task's created event on the process's local date when no storage clock is supplied", async () => {
    const root = mkdtempSync(join(tmpdir(), "daily-taskevents-clock-"))
    const clockDb = createTestDatabase()

    try {
      const core = createStorageCore(clockDb, {
        appDataRoot: () => root,
        dbPath: () => join(root, "db.sqlite"),
        assetsDir: () => join(root, "assets"),
        remoteSyncPath: () => root,
      })
      const created = await core.tasksService.createTask(makeTask({status: "backlog", scheduled: null}))

      expect(await core.tasksService.getHistoryByTask(created.id)).toMatchObject([{type: "created", eventDate: getToday()}])
    } finally {
      clockDb.close()
      rmSync(root, {recursive: true, force: true})
    }
  })

  it.each(["update", "drag"])("records the exact old and new values for every status through %s", async (path) => {
    const task = await service.createTask(makeTask({status: "backlog", scheduled: null}))
    const statuses = ["backlog", "ready_for_agent", "todo", "in_progress", "ready_to_merge", "done", "cancelled", "backlog"]

    for (const status of statuses.slice(1)) {
      if (path === "drag") {
        await service.moveTaskByOrder({taskId: task.id, targetStatus: status, activeDate: TASK_DAY})
      } else {
        await service.updateTask(task.id, {status})
      }
    }

    const changes = (await service.getHistoryByTask(task.id)).filter((event) => event.type === "status_changed").reverse()
    expect(changes.map((event) => [event.fromStatus, event.toStatus])).toEqual(statuses.slice(1).map((status, index) => [statuses[index], status]))
    expect(events.getByTask(task.id).some((event) => ["edited", "completed", "discarded", "reactivated"].includes(event.type))).toBe(false)
  })

  it("debounces text autosaves until the five-minute boundary", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-23T10:00:00.000Z"))
    const task = await service.createTask(makeTask({content: "A"}))

    await service.updateTask(task.id, {content: "B"})
    vi.advanceTimersByTime(5 * 60 * 1000 - 1)
    await service.updateTask(task.id, {content: "C"})
    expect(events.getByTask(task.id).filter((event) => event.type === "edited")).toHaveLength(1)

    vi.advanceTimersByTime(1)
    await service.updateTask(task.id, {content: "D"})
    expect(events.getByTask(task.id).filter((event) => event.type === "edited")).toHaveLength(2)
  })

  it("starts a new text edit burst after an intervening status change", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-23T10:00:00.000Z"))
    const task = await service.createTask(makeTask({content: "A"}))

    await service.updateTask(task.id, {content: "B"})
    await service.updateTask(task.id, {status: "ready_to_merge"})
    await service.updateTask(task.id, {content: "C"})

    expect((await service.getHistoryByTask(task.id)).map((event) => event.type)).toEqual(["edited", "status_changed", "edited", "created"])
  })

  it("keeps consecutive text edits from different actors as separate authored events", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-23T10:00:00.000Z"))
    const task = await service.createTask(makeTask({content: "A"}))

    await service.updateTask(task.id, {content: "B"})
    await service.updateTask(task.id, {content: "C"}, {kind: "mcp", provider: "Codex"})

    const edited = (await service.getHistoryByTask(task.id)).filter((event) => event.type === "edited")
    expect(edited).toMatchObject([
      {kind: "mcp", provider: "Codex"},
      {kind: "manual", provider: null},
    ])
  })

  it("treats separate MCP callers with the same saved name as one text edit source", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-23T10:00:00.000Z"))
    const task = await service.createTask(makeTask({content: "A"}))

    await service.updateTask(task.id, {content: "B"}, {kind: "mcp", provider: "Codex"})
    vi.advanceTimersByTime(1000)
    await service.updateTask(task.id, {content: "C"}, {kind: "mcp", provider: "Codex"})

    const edited = (await service.getHistoryByTask(task.id)).filter((event) => event.type === "edited")
    expect(edited).toMatchObject([{kind: "mcp", provider: "Codex", createdAt: "2026-06-23T10:00:00.000Z"}])
  })

  it.each([
    {interruption: "another MCP client", source: {kind: "mcp", provider: "Claude"}, kind: "mcp", provider: "Claude"},
    {interruption: "a manual edit", source: undefined, kind: "manual", provider: null},
  ])("starts a new text edit when the same MCP source returns after $interruption", async ({source, kind, provider}) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-23T10:00:00.000Z"))
    const task = await service.createTask(makeTask({content: "A"}))

    await service.updateTask(task.id, {content: "B"}, {kind: "mcp", provider: "Codex"})
    vi.advanceTimersByTime(1000)
    await service.updateTask(task.id, {content: "C"}, source)
    vi.advanceTimersByTime(1000)
    await service.updateTask(task.id, {content: "D"}, {kind: "mcp", provider: "Codex"})

    const edited = (await service.getHistoryByTask(task.id)).filter((event) => event.type === "edited").reverse()
    expect(edited).toMatchObject([
      {kind: "mcp", provider: "Codex", createdAt: "2026-06-23T10:00:00.000Z"},
      {kind, provider, createdAt: "2026-06-23T10:00:01.000Z"},
      {kind: "mcp", provider: "Codex", createdAt: "2026-06-23T10:00:02.000Z"},
    ])
    expect(new Set(edited.map((event) => event.id)).size).toBe(3)
  })

  it("records a priority transition independently of edited and without debouncing rapid changes", async () => {
    const task = await service.createTask(makeTask())

    await service.updateTask(task.id, {priority: "high"})
    await service.updateTask(task.id, {priority: "low"})

    const history = (await service.getHistoryByTask(task.id)).reverse()
    expect(history.map((event) => event.type)).toEqual(["created", "priority_changed", "priority_changed"])
    expect(history.slice(1)).toMatchObject([
      {fromPriority: "none", toPriority: "high"},
      {fromPriority: "high", toPriority: "low"},
    ])
  })

  it("records no activity for unchanged values, minimization, or order normalization", async () => {
    const task = await service.createTask(makeTask())

    await service.updateTask(task.id, {
      content: task.content,
      status: task.status,
      priority: task.priority,
      branchId: task.branchId,
      scheduled: task.scheduled,
      tags: task.tags,
      milestoneId: task.milestoneId,
      estimatedTime: task.estimatedTime,
      spentTime: task.spentTime,
      minimized: true,
      orderIndex: 200,
    })
    await service.moveTaskByOrder({taskId: task.id, targetStatus: task.status, activeDate: TASK_DAY})

    expect((await service.getHistoryByTask(task.id)).map((event) => event.type)).toEqual(["created"])
  })

  it("records a reschedule on both affected days without an edited event", async () => {
    const task = await service.createTask(makeTask())

    await service.updateTask(task.id, {scheduled: {date: NEXT_DAY, time: "10:00:00", timezone: "UTC"}})

    const moves = events.getByTask(task.id).filter((event) => event.type === "moved")
    expect(moves.map((event) => event.eventDate).sort()).toEqual([TASK_DAY, NEXT_DAY])
    expect(moves).toMatchObject([
      {fromDate: TASK_DAY, toDate: NEXT_DAY},
      {fromDate: TASK_DAY, toDate: NEXT_DAY},
    ])
    expect(new Set(moves.map((event) => event.moveId)).size).toBe(1)
    expect(moves[0].moveId).toEqual(expect.any(String))
    expect(events.getByTask(task.id).some((event) => event.type === "edited")).toBe(false)
  })

  it("records all categories from one save and preserves their actor", async () => {
    const project = new BranchModel(db).createBranch({name: "Release"})
    const task = await service.createTask(makeTask({content: "A"}))
    const source = {kind: "mcp", provider: "Codex"}

    await service.updateTask(
      task.id,
      {
        content: "B",
        status: "ready_to_merge",
        scheduled: {date: NEXT_DAY, time: "10:00:00", timezone: "UTC"},
        priority: "urgent",
        branchId: project.id,
      },
      source,
    )

    const history = (await service.getHistoryByTask(task.id)).filter((event) => event.type !== "created")
    expect(history.map((event) => event.type).sort()).toEqual(["edited", "moved", "priority_changed", "project_changed", "status_changed"])
    expect(history.every((event) => event.kind === "mcp" && event.provider === "Codex")).toBe(true)
    expect(history.find((event) => event.type === "status_changed")).toMatchObject({fromStatus: "in_progress", toStatus: "ready_to_merge"})
    expect(history.find((event) => event.type === "project_changed")).toMatchObject({fromBranchId: "main", toBranchId: project.id})
  })

  it("keeps a text change beside each rapid category change even inside the autosave window", async () => {
    const task = await service.createTask(makeTask({content: "A"}))
    await service.updateTask(task.id, {content: "B"})
    await service.updateTask(task.id, {content: "C", status: "ready_for_agent"})
    await service.updateTask(task.id, {content: "D", priority: "high"})
    await service.updateTask(task.id, {content: "E", scheduled: {date: NEXT_DAY, time: "10:00:00", timezone: "UTC"}})

    const history = await service.getHistoryByTask(task.id)
    expect(history.filter((event) => event.type === "edited")).toHaveLength(4)
    expect(history.filter((event) => event.type === "status_changed")).toHaveLength(1)
    expect(history.filter((event) => event.type === "priority_changed")).toHaveLength(1)
    expect(history.filter((event) => event.type === "moved")).toHaveLength(1)
  })

  it("does not mistake project-induced tag and milestone cleanup for a user edit", async () => {
    const project = new BranchModel(db).createBranch({name: "Release"})
    const tag = new TagModel(db).createTag({branchId: "main", name: "Before", color: "#A855F7", deletedAt: null})
    const milestone = new MilestoneModel(db).createMilestone({branchId: "main", name: "Before", description: "", targetDate: null, deletedAt: null})
    const task = await service.createTask(makeTask({tags: [tag], milestoneId: milestone.id}))

    await service.updateTask(task.id, {branchId: project.id})

    expect(await service.getTask(task.id)).toMatchObject({branchId: project.id, tags: [], milestoneId: null})
    expect((await service.getHistoryByTask(task.id)).map((event) => event.type)).toEqual(["project_changed", "created"])
  })

  it("preserves a real user field edit alongside a project transfer", async () => {
    const project = new BranchModel(db).createBranch({name: "Release"})
    const tag = new TagModel(db).createTag({branchId: project.id, name: "After", color: "#A855F7", deletedAt: null})
    const milestone = new MilestoneModel(db).createMilestone({
      branchId: project.id,
      name: "After",
      description: "",
      targetDate: null,
      deletedAt: null,
    })
    const task = await service.createTask(makeTask())

    await service.updateTask(task.id, {branchId: project.id, tags: [tag], milestoneId: milestone.id})

    expect(await service.getTask(task.id)).toMatchObject({branchId: project.id, tags: [{id: tag.id}], milestoneId: milestone.id})
    expect((await service.getHistoryByTask(task.id)).map((event) => event.type).sort()).toEqual(["created", "edited", "project_changed"])
  })

  it("records direct tag and project operations without duplicating their no-ops", async () => {
    const project = new BranchModel(db).createBranch({name: "Release"})
    const tag = new TagModel(db).createTag({branchId: "main", name: "Review", color: "#A855F7", deletedAt: null})
    const task = await service.createTask(makeTask())
    const source = {kind: "mcp", provider: "Codex"}

    await service.addTaskTags(task.id, [tag.id])
    await service.addTaskTags(task.id, [tag.id])
    await service.removeTaskTags(task.id, [tag.id])
    await service.removeTaskTags(task.id, [tag.id])
    await service.moveTaskToBranch(task.id, project.id, source)
    await service.moveTaskToBranch(task.id, project.id, source)

    const history = await service.getHistoryByTask(task.id)
    expect(history.map((event) => event.type).sort()).toEqual(["created", "edited", "edited", "project_changed"])
    expect(history.find((event) => event.type === "project_changed")).toMatchObject({
      fromBranchId: "main",
      toBranchId: project.id,
      kind: "mcp",
      provider: "Codex",
    })
  })

  it("records discrete user field edits independently of text autosave debounce", async () => {
    const tag = new TagModel(db).createTag({branchId: "main", name: "Review", color: "#A855F7", deletedAt: null})
    const milestone = new MilestoneModel(db).createMilestone({branchId: "main", name: "Release", description: "", targetDate: null, deletedAt: null})
    const task = await service.createTask(makeTask())
    const patches = [
      {estimatedTime: 60},
      {spentTime: 30},
      {scheduled: {date: TASK_DAY, time: "11:00:00", timezone: "UTC"}},
      {scheduled: {date: TASK_DAY, time: "11:00:00", timezone: "Australia/Brisbane"}},
      {milestoneId: milestone.id},
      {tags: [tag]},
    ]

    for (const patch of patches) await service.updateTask(task.id, patch)

    const history = await service.getHistoryByTask(task.id)
    expect(history.filter((event) => event.type === "edited")).toHaveLength(patches.length)
    expect(history.filter((event) => !["edited", "created"].includes(event.type))).toEqual([])
  })

  it("records manual edits without a provider when no source is supplied", async () => {
    const task = await service.createTask(makeTask({content: "A"}))

    await service.updateTask(task.id, {content: "B"})

    expect(events.getByTask(task.id).find((event) => event.type === "edited")).toMatchObject({kind: "manual", provider: null})
  })

  it("retains creation, transitions, deletion, and restoration in one task's history", async () => {
    const task = await service.createTask(makeTask())
    await service.updateTask(task.id, {status: "done"})
    await service.deleteTask(task.id)
    await service.restoreTask(task.id)

    const history = await service.getHistoryByTask(task.id)
    expect(history.map((event) => event.type)).toEqual(["restored", "deleted", "status_changed", "created"])
    expect(history.every((event) => event.eventDate === TASK_DAY)).toBe(true)
  })

  it("dates undated task edits and lifecycle events on today", async () => {
    const created = await service.createTask(makeTask({status: "backlog", scheduled: null, content: "A"}))

    await service.updateTask(created.id, {content: "B"})
    await service.deleteTask(created.id)
    await service.restoreTask(created.id)

    const history = await service.getHistoryByTask(created.id)
    expect(history.map((event) => event.type).sort()).toEqual(["created", "deleted", "edited", "restored"])
    expect(history.every((event) => event.eventDate === getToday())).toBe(true)
  })

  it("records a status transition and date assignment when scheduling Backlog", async () => {
    const task = await service.createTask(makeTask({status: "backlog", scheduled: null}))

    await service.updateTask(task.id, {scheduled: {date: NEXT_DAY, time: "", timezone: "UTC"}})

    const history = await service.getHistoryByTask(task.id)
    expect(history.map((event) => event.type).sort()).toEqual(["created", "moved", "status_changed"])
    expect(history.find((event) => event.type === "status_changed")).toMatchObject({eventDate: NEXT_DAY, fromStatus: "backlog", toStatus: "todo"})
    expect(history.find((event) => event.type === "moved")).toMatchObject({fromDate: null, toDate: NEXT_DAY})
  })

  it("records clearing To Do's day as a move and a transition to Backlog", async () => {
    const task = await service.createTask(makeTask({status: "todo"}))

    await service.updateTask(task.id, {scheduled: null})

    const history = await service.getHistoryByTask(task.id)
    expect(history.map((event) => event.type).sort()).toEqual(["created", "moved", "status_changed"])
    expect(history.find((event) => event.type === "status_changed")).toMatchObject({fromStatus: "todo", toStatus: "backlog"})
    expect(history.find((event) => event.type === "moved")).toMatchObject({fromDate: TASK_DAY, toDate: null})
  })

  it("counts six reschedules once each and filters completions over a half-open interval", async () => {
    const wanderer = await service.createTask(makeTask({content: "Wanderer"}))
    const days = ["2026-06-24", "2026-06-25", "2026-06-26", "2026-06-27", "2026-06-28", "2026-06-29"]
    for (const day of days) await service.updateTask(wanderer.id, {scheduled: {date: day, time: "10:00:00", timezone: "UTC"}})
    expect(events.countMovesByTask()[wanderer.id]).toBe(6)

    const from = "2026-07-01T00:00:00.000Z"
    const to = "2026-07-02T00:00:00.000Z"
    const atFrom = await service.createTask(makeTask({content: "AtFrom"}))
    await service.updateTask(atFrom.id, {status: "done"})
    db.prepare(`UPDATE task_events SET created_at = ? WHERE task_id = ? AND type = 'status_changed'`).run(from, atFrom.id)
    const atTo = await service.createTask(makeTask({content: "AtTo"}))
    await service.updateTask(atTo.id, {status: "done"})
    db.prepare(`UPDATE task_events SET created_at = ? WHERE task_id = ? AND type = 'status_changed'`).run(to, atTo.id)

    expect(events.listCompletionsBetween(from, to).map((completion) => completion.taskId)).toEqual([atFrom.id])
  })
})
