// @ts-nocheck
import {DateTime} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {API} from "@/api"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {useTasksStore} from "@/stores/tasks/tasks.store"
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
    createTask: vi.fn().mockResolvedValue(null),
    updateTask: vi.fn().mockResolvedValue(null),
    deleteTask: vi.fn().mockResolvedValue(true),
    getDeletedTasks: vi.fn().mockResolvedValue([]),
    restoreTask: vi.fn().mockResolvedValue(null),
    permanentlyDeleteTask: vi.fn().mockResolvedValue(true),
    permanentlyDeleteAllDeletedTasks: vi.fn().mockResolvedValue(0),
    moveTask: vi.fn().mockResolvedValue(true),
    moveTaskByOrder: vi.fn().mockResolvedValue(null),
    moveTaskToBranch: vi.fn().mockResolvedValue(true),
    toggleTaskMinimized: vi.fn().mockResolvedValue(null),
    getBacklog: vi.fn().mockResolvedValue([]),
    scheduleTask: vi.fn().mockResolvedValue(null),
    moveTaskToBacklog: vi.fn().mockResolvedValue(null),
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

  it("the backlog carries a move scope, so a backlog card can be moved up and down", async () => {
    API.getBacklog.mockResolvedValueOnce([makeTask({id: "b1", scheduled: null}), makeTask({id: "b2", scheduled: null})])

    const store = await getStore()
    await store.getBacklogList()

    expect([...store.dailyTaskIndexMapByStatus.backlog.entries()]).toEqual([
      ["b1", 0],
      ["b2", 1],
    ])
  })

  describe("trash", () => {
    it("a task deleted from a column reaches the trash without a reload", async () => {
      const task = makeTask({id: "to-delete"})
      API.getDays.mockResolvedValueOnce([makeDay(TODAY, [task])])

      const store = await getStore()
      await store.getTaskList()
      await store.getTrashList()

      API.getDeletedTasks.mockResolvedValueOnce([{...task, deletedAt: "2026-09-08T00:00:00.000Z"}])
      await store.deleteTask("to-delete")

      expect(store.trashTasks.map((t) => t.id)).toEqual(["to-delete"])
    })

    it("restoring a task lands it on the active day, not on the day it was deleted from", async () => {
      const store = await getStore()
      store.setActiveDay("2026-09-05")
      API.restoreTask.mockResolvedValueOnce(makeTask({id: "d1", scheduled: {date: "2026-09-05", time: "", timezone: "UTC"}}))

      await store.restoreTask("d1")

      expect(API.restoreTask).toHaveBeenCalledWith("d1", "2026-09-05")
    })

    it("a trashed card dropped on a calendar day comes back on that day", async () => {
      const tomorrow = DateTime.now().plus({days: 1}).toISODate()
      const store = await getStore()
      const dragDropStore = useDragDropStore()
      API.restoreTask.mockResolvedValueOnce(makeTask({id: "d1", scheduled: {date: tomorrow, time: "", timezone: "UTC"}}))

      await dragDropStore.dropOnDay("d1", tomorrow)

      expect(API.restoreTask).toHaveBeenCalledWith("d1", tomorrow)
      expect(store.trashTasks).toHaveLength(0)
    })

    it("keeps the trash untouched while it has never been opened", async () => {
      const task = makeTask({id: "to-delete"})
      API.getDays.mockResolvedValueOnce([makeDay(TODAY, [task])])

      const store = await getStore()
      await store.getTaskList()

      await store.deleteTask("to-delete")

      expect(API.getDeletedTasks).not.toHaveBeenCalled()
    })
  })

  describe("backlog", () => {
    it("TC-25: dropOnDay schedules a backlog task onto a date via scheduleTask instead of the plain move", async () => {
      const {useDragDropStore} = await import("@/stores/dragDrop.store")
      const backlogTask = makeTask({id: "b1", scheduled: null})
      API.getBacklog.mockResolvedValueOnce([backlogTask])
      API.scheduleTask.mockResolvedValueOnce({...backlogTask, scheduled: {date: "2026-05-05", time: "09:00:00", timezone: "UTC"}})

      const store = await getStore()
      await store.getBacklogList()
      expect(store.backlogTasks.map((t) => t.id)).toContain("b1")

      const dragDropStore = useDragDropStore()
      await dragDropStore.dropOnDay("b1", "2026-05-05")

      expect(API.moveTask).not.toHaveBeenCalled()
      expect(API.scheduleTask).toHaveBeenCalledTimes(1)
      const [taskId, schedule] = API.scheduleTask.mock.calls[0]
      expect(taskId).toBe("b1")
      expect(schedule.date).toBe("2026-05-05")
      expect(typeof schedule.time).toBe("string")
      expect(typeof schedule.timezone).toBe("string")
    })

    it("TC-35: duplicating a backlog task creates the duplicate without a schedule too", async () => {
      const store = await getStore()
      store.backlogTasks = [makeTask({id: "b1", scheduled: null, content: "Renew passport"})]

      await store.duplicateTask("b1")

      expect(API.createTask).toHaveBeenCalledWith("Renew passport", expect.objectContaining({date: null}))
    })

    it("TC-36: switching the active branch reloads the backlog for the new branch", async () => {
      const {useSettingsStore} = await import("@/stores/settings.store")
      API.getBacklog.mockResolvedValueOnce([makeTask({id: "proj-a-1"})])

      const store = await getStore()
      await store.getTaskList()
      await store.getBacklogList()
      expect(store.backlogTasks.map((t) => t.id)).toEqual(["proj-a-1"])

      API.getBacklog.mockResolvedValueOnce([makeTask({id: "proj-b-1"})])
      const settingsStore = useSettingsStore()
      settingsStore.updateSettings({branch: {activeId: "proj-b"}})
      await new Promise((r) => setTimeout(r, 0))

      expect(store.backlogTasks.map((t) => t.id)).toEqual(["proj-b-1"])
    })
  })
})
