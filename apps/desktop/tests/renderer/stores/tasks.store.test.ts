// @ts-nocheck
import {DateTime} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {useTasksStore} from "../../../src/renderer/src/stores/tasks/tasks.store"
import {API} from "../../../src/renderer/src/api"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

const TODAY = DateTime.now().toISODate()

vi.mock("../../../src/renderer/src/utils/ui/vue", () => ({
  toRawDeep: (v) => v,
}))

vi.mock("../../../src/renderer/src/utils/perf", () => ({
  perfMark: vi.fn(),
  perfMeasure: vi.fn(),
}))

vi.mock("../../../src/renderer/src/api", () => ({
  API: {
    getDays: vi.fn().mockResolvedValue([]),
    getDay: vi.fn().mockResolvedValue(null),
    getBacklog: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue(null),
    updateTask: vi.fn().mockResolvedValue({success: false}),
    deleteTask: vi.fn().mockResolvedValue(true),
    getDeletedTasks: vi.fn().mockResolvedValue([]),
    moveTask: vi.fn().mockResolvedValue(true),
    moveTaskByOrder: vi.fn().mockResolvedValue(null),
    moveTaskToBranch: vi.fn().mockResolvedValue(true),
    toggleTaskMinimized: vi.fn().mockResolvedValue({success: false}),
  },
}))

function makeDay(date, tasks = []) {
  return {date, tasks, tags: tasks.flatMap((t) => t.tags || [])}
}

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    status: "active",
    content: "Test",
    minimized: false,
    orderIndex: 1024,
    scheduled: {date: TODAY, time: "", timezone: "UTC"},
    estimatedTime: 0,
    spentTime: 0,
    branchId: "main",
    tags: [],
    attachments: [],
    createdAt: "2026-03-24T00:00:00.000Z",
    updatedAt: "2026-03-24T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

describe("tasksStore", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function getStore() {
    const store = useTasksStore()
    // Let settingsStore initialize so activeBranchId is set before isDaysLoaded
    // becomes true — prevents the branch watch from triggering a second reload.
    await new Promise((r) => setTimeout(r, 0))
    return store
  }

  it("loads days and sets isDaysLoaded", async () => {
    API.getDays.mockResolvedValueOnce([makeDay(TODAY)])

    const store = await getStore()
    await store.getTaskList()

    expect(store.isDaysLoaded).toBe(true)
    expect(store.days).toHaveLength(1)
  })

  it("dailyTasksByStatus groups tasks correctly", async () => {
    const tasks = [
      makeTask({id: "1", status: "active", orderIndex: 1}),
      makeTask({id: "2", status: "done", orderIndex: 2}),
      makeTask({id: "3", status: "active", orderIndex: 3}),
      makeTask({id: "4", status: "discarded", orderIndex: 4}),
    ]
    API.getDays.mockResolvedValueOnce([makeDay(TODAY, tasks)])

    const store = await getStore()
    await store.getTaskList()

    expect(store.dailyTasksByStatus.active).toHaveLength(2)
    expect(store.dailyTasksByStatus.done).toHaveLength(1)
    expect(store.dailyTasksByStatus.discarded).toHaveLength(1)
  })

  it("deleteTask removes task from state and revalidates deletedTasks", async () => {
    const task = makeTask({id: "to-delete"})
    API.getDays.mockResolvedValueOnce([makeDay(TODAY, [task])])

    const store = await getStore()
    await store.getTaskList()

    expect(store.dailyTasks).toHaveLength(1)

    await store.deleteTask("to-delete")

    expect(store.dailyTasks).toHaveLength(0)
  })

  it("setActiveDay changes activeDay", async () => {
    const store = await getStore()

    store.setActiveDay("2026-04-01")

    expect(store.activeDay).toBe("2026-04-01")
  })

  it("exposes loadedRange after the initial load", async () => {
    const store = await getStore()
    await store.getTaskList()

    expect(store.loadedRange).not.toBeNull()
    expect(store.loadedRange.from < store.loadedRange.to).toBe(true)
  })

  it("extendRange('future') pushes loadedRange.to forward", async () => {
    const store = await getStore()
    await store.getTaskList()
    const before = store.loadedRange.to

    await store.extendRange("future")

    expect(store.loadedRange.to > before).toBe(true)
  })

  it("extendRange('past') pulls loadedRange.from backward", async () => {
    const store = await getStore()
    await store.getTaskList()
    const before = store.loadedRange.from

    await store.extendRange("past")

    expect(store.loadedRange.from < before).toBe(true)
  })

  it("createTask honors date, branchId, and status overrides", async () => {
    const store = useTasksStore()
    store.activeDay = TODAY
    store.days = [makeDay(TODAY), makeDay("2099-01-01")]

    const createdTask = makeTask({id: "task-99", scheduled: {date: "2099-01-01", time: "", timezone: "UTC"}, branchId: "other", status: "done"})
    ;(API.createTask as any).mockResolvedValueOnce({date: "2099-01-01", tasks: [createdTask], tags: []})

    await store.createTask({
      content: "Future task",
      tags: [],
      estimatedTime: 0,
      date: "2099-01-01",
      branchId: "other",
      status: "done",
    })

    expect(API.createTask).toHaveBeenCalledWith("Future task", expect.objectContaining({date: "2099-01-01", branchId: "other", status: "done"}))
  })

  it("moves_TC-14_a_task_out_of_the_backlog_and_back_without_ever_holding_it_in_both_lists", async () => {
    const backlogTask = makeTask({id: "b1", status: "backlog", scheduled: null})
    API.getBacklog.mockResolvedValueOnce([backlogTask])
    API.getDays.mockResolvedValueOnce([makeDay(TODAY)])

    const store = await getStore()
    await store.getTaskList()
    await store.refreshBacklog()

    expect(store.backlogTasks.map((t) => t.id)).toContain("b1")
    expect(store.dailyTasks.map((t) => t.id)).not.toContain("b1")

    const activeTask = makeTask({id: "b1", status: "active", scheduled: {date: TODAY, time: "09:00:00", timezone: "UTC"}})
    API.moveTaskByOrder.mockResolvedValueOnce(makeDay(TODAY, [activeTask]))
    API.getBacklog.mockResolvedValueOnce([])

    await store.moveTaskByOrder({taskId: "b1", targetStatus: "active", targetTaskId: null, position: "before", activeDate: TODAY})

    expect(store.backlogTasks.map((t) => t.id)).not.toContain("b1")
    expect(store.dailyTasks.map((t) => t.id)).toContain("b1")

    API.moveTaskByOrder.mockResolvedValueOnce(makeDay(TODAY, []))
    API.getBacklog.mockResolvedValueOnce([backlogTask])

    await store.moveTaskByOrder({taskId: "b1", targetStatus: "backlog", targetTaskId: null, position: "before", activeDate: TODAY})

    expect(store.dailyTasks.map((t) => t.id)).not.toContain("b1")
    expect(store.backlogTasks.map((t) => t.id)).toContain("b1")
  })

  it("duplicates_TC-22_a_backlog_task_as_dateless_and_backlog_never_inventing_a_day", async () => {
    const original = makeTask({id: "orig", status: "backlog", scheduled: null, content: "no day yet"})
    API.getBacklog.mockResolvedValueOnce([original])

    const store = await getStore()
    await store.refreshBacklog()

    await store.duplicateTask("orig")

    expect(API.createTask).toHaveBeenCalledWith("no day yet", expect.objectContaining({status: "backlog", date: undefined}))
  })

  it("updateTask cleans the day a task left when a status change sends it to the backlog", async () => {
    const task = makeTask({id: "t1", status: "active"})
    API.getDays.mockResolvedValueOnce([makeDay(TODAY, [task])])

    const store = await getStore()
    await store.getTaskList()

    expect(store.dailyTasks.map((t) => t.id)).toContain("t1")

    API.updateTask.mockResolvedValueOnce({success: true, day: null})
    API.getDay.mockResolvedValueOnce(makeDay(TODAY, []))

    await store.updateTask("t1", {status: "backlog"})

    expect(store.dailyTasks.map((t) => t.id)).not.toContain("t1")
  })

  it("updateTask cleans the day a task left when a combined update also moves it to a different day", async () => {
    const OTHER = "2026-09-12"
    const task = makeTask({id: "t1", status: "active", scheduled: {date: TODAY, time: "", timezone: "UTC"}})
    API.getDays.mockResolvedValueOnce([makeDay(TODAY, [task])])

    const store = await getStore()
    await store.getTaskList()

    expect(store.dailyTasks.map((t) => t.id)).toContain("t1")

    const movedTask = makeTask({id: "t1", status: "done", scheduled: {date: OTHER, time: "", timezone: "UTC"}})
    API.updateTask.mockResolvedValueOnce({success: true, day: makeDay(OTHER, [movedTask])})
    API.getDay.mockResolvedValueOnce(makeDay(TODAY, []))

    await store.updateTask("t1", {status: "done", scheduled: movedTask.scheduled})

    expect(store.dailyTasks.map((t) => t.id)).not.toContain("t1")
    expect(store.days.find((d) => d.date === OTHER)?.tasks.map((t) => t.id)).toContain("t1")
  })

  it("updateTask refreshes the backlog and reports success when a task already in the backlog is edited", async () => {
    const backlogTask = makeTask({id: "b1", status: "backlog", scheduled: null, estimatedTime: 0})
    API.getBacklog.mockResolvedValueOnce([backlogTask])

    const store = await getStore()
    await store.refreshBacklog()

    expect(store.backlogTasks.map((t) => t.id)).toContain("b1")

    API.updateTask.mockResolvedValueOnce({success: true, day: null})
    API.getBacklog.mockResolvedValueOnce([makeTask({id: "b1", status: "backlog", scheduled: null, estimatedTime: 3600})])

    const isUpdated = await store.updateTask("b1", {estimatedTime: 3600})

    expect(isUpdated).toBe(true)
    expect(store.backlogTasks.find((t) => t.id === "b1")?.estimatedTime).toBe(3600)
  })

  it("toggleTaskMinimized refreshes the backlog and reports success when a task already in the backlog is toggled", async () => {
    const backlogTask = makeTask({id: "b1", status: "backlog", scheduled: null, minimized: false})
    API.getBacklog.mockResolvedValueOnce([backlogTask])

    const store = await getStore()
    await store.refreshBacklog()

    API.toggleTaskMinimized.mockResolvedValueOnce({success: true, day: null})
    API.getBacklog.mockResolvedValueOnce([makeTask({id: "b1", status: "backlog", scheduled: null, minimized: true})])

    const isToggled = await store.toggleTaskMinimized("b1", true)

    expect(isToggled).toBe(true)
    expect(store.backlogTasks.find((t) => t.id === "b1")?.minimized).toBe(true)
  })

  it("updateTask reports failure without touching state when the write genuinely fails", async () => {
    const task = makeTask({id: "t1", status: "active"})
    API.getDays.mockResolvedValueOnce([makeDay(TODAY, [task])])

    const store = await getStore()
    await store.getTaskList()

    API.updateTask.mockResolvedValueOnce({success: false})

    const isUpdated = await store.updateTask("t1", {content: "renamed"})

    expect(isUpdated).toBe(false)
    expect(store.dailyTasks.find((t) => t.id === "t1")?.content).toBe("Test")
  })
})
