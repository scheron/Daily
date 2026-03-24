// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {API} from "@renderer/api"
import {useTasksStore} from "@renderer/stores/tasks.store"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("@renderer/utils/ui/vue", () => ({
  toRawDeep: (v) => v,
}))

vi.mock("@renderer/utils/perf", () => ({
  perfMark: vi.fn(),
  perfMeasure: vi.fn(),
}))

vi.mock("@renderer/api", () => ({
  API: {
    getDays: vi.fn().mockResolvedValue([]),
    getDay: vi.fn().mockResolvedValue(null),
    createTask: vi.fn().mockResolvedValue(null),
    updateTask: vi.fn().mockResolvedValue(null),
    deleteTask: vi.fn().mockResolvedValue(true),
    getDeletedTasks: vi.fn().mockResolvedValue([]),
    moveTask: vi.fn().mockResolvedValue(true),
    moveTaskByOrder: vi.fn().mockResolvedValue(null),
    moveTaskToBranch: vi.fn().mockResolvedValue(true),
    toggleTaskMinimized: vi.fn().mockResolvedValue(null),
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
    scheduled: {date: "2026-03-24", time: "", timezone: "UTC"},
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
    API.getDays.mockResolvedValueOnce([makeDay("2026-03-24")])

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
    API.getDays.mockResolvedValueOnce([makeDay("2026-03-24", tasks)])

    const store = await getStore()
    await store.getTaskList()

    expect(store.dailyTasksByStatus.active).toHaveLength(2)
    expect(store.dailyTasksByStatus.done).toHaveLength(1)
    expect(store.dailyTasksByStatus.discarded).toHaveLength(1)
  })

  it("deleteTask removes task from state and revalidates deletedTasks", async () => {
    const task = makeTask({id: "to-delete"})
    API.getDays.mockResolvedValueOnce([makeDay("2026-03-24", [task])])

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
})
