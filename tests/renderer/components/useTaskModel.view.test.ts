// @vitest-environment happy-dom
// @ts-nocheck
import {effectScope} from "vue"
import {DateTime} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {API} from "@renderer/api"
import {useTasksStore} from "@renderer/stores/tasks.store"
import {useTaskModel} from "@renderer/ui/modules/TaskCard/model/useTaskModel"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

const TODAY = DateTime.now().toISODate()

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

describe("useTaskModel view-dependent move scope", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // Day layout: a1, a2 are "active"; d1 ("done") follows a2 in the flat list.
  async function seedStore() {
    const tasks = [
      makeTask({id: "a1", status: "active", orderIndex: 1}),
      makeTask({id: "a2", status: "active", orderIndex: 2}),
      makeTask({id: "d1", status: "done", orderIndex: 3}),
    ]
    API.getDays.mockResolvedValueOnce([makeDay(TODAY, tasks)])

    const store = useTasksStore()
    await new Promise((r) => setTimeout(r, 0))
    await store.getTaskList()
    return store
  }

  function getModel(store, taskId, view) {
    const task = store.dailyTasks.find((t) => t.id === taskId)
    const scope = effectScope()
    return scope.run(() => useTaskModel({task, view}))
  }

  it("rows view scopes moves to the task's status", async () => {
    const store = await seedStore()
    const model = getModel(store, "a2", "rows")

    // a2 is last among "active" — d1 below it belongs to another status
    expect(model.canMoveUp.value).toBe(true)
    expect(model.canMoveDown.value).toBe(false)

    await model.moveUp()
    expect(API.moveTaskByOrder).toHaveBeenCalledWith(
      expect.objectContaining({mode: "column", targetStatus: "active", targetTaskId: "a1", position: "before"}),
    )
  })

  it("columns view keeps the per-status scope", async () => {
    const store = await seedStore()
    const model = getModel(store, "a2", "columns")

    expect(model.canMoveDown.value).toBe(false)
  })

  it("list view keeps the flat-list scope", async () => {
    const store = await seedStore()
    const model = getModel(store, "a2", "list")

    expect(model.canMoveDown.value).toBe(true)

    await model.moveDown()
    expect(API.moveTaskByOrder).toHaveBeenCalledWith(
      expect.objectContaining({mode: "list", targetStatus: undefined, targetTaskId: "d1", position: "after"}),
    )
  })
})
