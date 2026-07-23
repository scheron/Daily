import {effectScope} from "vue"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {useActivityModel} from "@/ui/modules/LeftPanel/{fragments}/ActivityWidget/model/useActivityModel"

import {API} from "@/api"

import type {TaskEvent} from "@shared/types/storage"

const mocks = vi.hoisted(() => ({
  storageStore: {} as any,
  taskEditorStore: {} as any,
  tasksStore: {} as any,
}))

vi.mock("@/api", () => ({
  API: {
    getActivityByDay: vi.fn(),
    getDeletedTasks: vi.fn(),
    restoreTask: vi.fn(),
  },
}))

vi.mock("@/stores/storage.store", () => ({
  useStorageStore: () => mocks.storageStore,
}))

vi.mock("@/stores/task-editor", () => ({
  useTaskEditorStore: () => mocks.taskEditorStore,
}))

vi.mock("@/stores/tasks", () => ({
  useTasksStore: () => mocks.tasksStore,
}))

const DAY = "2026-07-23"

function makeEvent(overrides: Partial<TaskEvent>): TaskEvent {
  return {
    id: "event-1",
    taskId: "task-1",
    branchId: "main",
    type: "edited",
    eventDate: DAY,
    fromDate: null,
    toDate: null,
    createdAt: "2026-07-23T09:00:00.000Z",
    ...overrides,
  }
}

describe("useActivityModel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tasksStore = {
      activeDay: DAY,
      days: [{date: DAY, tasks: []}],
      revalidate: vi.fn(),
      setActiveDay: vi.fn(),
    }
    mocks.taskEditorStore = {open: vi.fn()}
    mocks.storageStore = {
      onStorageDataChanged: vi.fn(() => ({off: vi.fn()})),
    }
    vi.mocked(API.getDeletedTasks).mockResolvedValue([])
  })

  it("keeps every event returned for the active day, including repeated edits of one task", async () => {
    const activity = [
      makeEvent({id: "edit-later", createdAt: "2026-07-23T09:20:00.000Z"}),
      makeEvent({id: "edit-earlier", createdAt: "2026-07-23T09:00:00.000Z"}),
      makeEvent({id: "created", type: "created", createdAt: "2026-07-23T08:00:00.000Z"}),
    ]
    vi.mocked(API.getActivityByDay).mockResolvedValue(activity)

    const scope = effectScope()
    const model = scope.run(() => useActivityModel())!

    await vi.waitFor(() => expect(model.events.value).toEqual(activity))

    expect(API.getActivityByDay).toHaveBeenCalledWith(DAY)
    expect(model.events.value.map((event) => event.id)).toEqual(["edit-later", "edit-earlier", "created"])
    scope.stop()
  })
})
