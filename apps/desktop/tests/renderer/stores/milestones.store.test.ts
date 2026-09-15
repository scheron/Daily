// @ts-nocheck
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {useMilestonesStore} from "../../../src/renderer/src/stores/milestones.store"
import {useSettingsStore} from "../../../src/renderer/src/stores/settings.store"
import {useTasksStore} from "../../../src/renderer/src/stores/tasks/tasks.store"
import {API} from "../../../src/renderer/src/api"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("../../../src/renderer/src/utils/ui/toRawDeep", () => ({
  toRawDeep: (v) => v,
}))

vi.mock("../../../src/renderer/src/api", () => ({
  API: {
    getAllTasks: vi.fn().mockResolvedValue([]),
    getMilestoneList: vi.fn().mockResolvedValue([]),
    createMilestone: vi.fn(),
    updateMilestone: vi.fn(),
    deleteMilestone: vi.fn(),
    createTask: vi.fn().mockResolvedValue(null),
    updateTask: vi.fn().mockResolvedValue(null),
    deleteTask: vi.fn().mockResolvedValue(true),
    moveTask: vi.fn().mockResolvedValue(null),
    moveTaskByOrder: vi.fn().mockResolvedValue(null),
    moveTaskToBranch: vi.fn().mockResolvedValue(true),
  },
}))

function makeMilestone(overrides = {}) {
  return {
    id: "milestone-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    branchId: "main",
    name: "Launch",
    description: "",
    targetDate: null,
    orderIndex: 1024,
    ...overrides,
  }
}

function makeTask(overrides = {}) {
  return {
    id: "task-1",
    status: "active",
    content: "Test",
    minimized: false,
    orderIndex: 1024,
    scheduled: {date: "2026-09-14", time: "", timezone: "UTC"},
    estimatedTime: 0,
    spentTime: 0,
    branchId: "main",
    milestoneId: null,
    tags: [],
    attachments: [],
    createdAt: "2026-03-24T00:00:00.000Z",
    updatedAt: "2026-03-24T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

describe("milestonesStore — progress scoped alongside the collection's own selectors", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function settle() {
    await new Promise((r) => setTimeout(r, 0))
  }

  it("scopes_TC-25_days_backlogTasks_tasksByMilestoneId_and_milestone_progress_to_the_active_project", async () => {
    const day = "2026-09-14"
    const m1 = makeMilestone({id: "m1", branchId: "main"})
    const m2 = makeMilestone({id: "m2", branchId: "other"})
    API.getMilestoneList.mockResolvedValueOnce([m1, m2])

    const milestonesStore = useMilestonesStore()
    await milestonesStore.getMilestoneList()

    const tasks = [
      makeTask({id: "p1-day", branchId: "main", scheduled: {date: day, time: "", timezone: "UTC"}}),
      makeTask({id: "p1-backlog", branchId: "main", status: "backlog", scheduled: null}),
      makeTask({id: "p1-m1-a", branchId: "main", milestoneId: "m1", status: "active", scheduled: {date: day, time: "", timezone: "UTC"}}),
      makeTask({id: "p1-m1-b", branchId: "main", milestoneId: "m1", status: "done", scheduled: {date: day, time: "", timezone: "UTC"}}),
      makeTask({id: "p2-day", branchId: "other", scheduled: {date: day, time: "", timezone: "UTC"}}),
      makeTask({id: "p2-backlog", branchId: "other", status: "backlog", scheduled: null}),
      makeTask({id: "p2-m2-a", branchId: "other", milestoneId: "m2", status: "active", scheduled: {date: day, time: "", timezone: "UTC"}}),
    ]
    API.getAllTasks.mockResolvedValueOnce(tasks)

    const tasksStore = useTasksStore()
    const settingsStore = useSettingsStore()
    await settle()
    expect(settingsStore.settings?.branch?.activeId).toBe("main")

    await tasksStore.loadTasks()

    const dayTaskIds = tasksStore.days.flatMap((d) => d.tasks).map((t) => t.id)
    expect(dayTaskIds).toContain("p1-day")
    expect(dayTaskIds).not.toContain("p2-day")

    const backlogIds = tasksStore.backlogTasks.map((t) => t.id)
    expect(backlogIds).toContain("p1-backlog")
    expect(backlogIds).not.toContain("p2-backlog")

    const m1Tasks = tasksStore.tasksByMilestoneId.get("m1") ?? []
    expect(m1Tasks.map((t) => t.id).toSorted()).toEqual(["p1-m1-a", "p1-m1-b"])

    const view1 = milestonesStore.activeMilestones.find((m) => m.id === "m1")
    expect(view1?.progress).toEqual({total: 2, resolved: 1})
  })
})

describe("milestonesStore writes — one IPC call, no list reread", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it("createMilestone makes one call and reads no list", async () => {
    const created = makeMilestone({id: "m1", name: "Launch"})
    API.createMilestone.mockResolvedValueOnce({milestones: {upserted: [created]}})

    const milestonesStore = useMilestonesStore()
    const result = await milestonesStore.createMilestone("Launch", null, "main")

    expect(result?.id).toBe("m1")
    expect(API.createMilestone).toHaveBeenCalledTimes(1)
    expect(API.getMilestoneList).not.toHaveBeenCalled()
  })

  it("updateMilestone makes one call and reads no list", async () => {
    const updated = makeMilestone({id: "m1", name: "Renamed"})
    API.updateMilestone.mockResolvedValueOnce({milestones: {upserted: [updated]}})

    const milestonesStore = useMilestonesStore()
    const result = await milestonesStore.updateMilestone("m1", {name: "Renamed"})

    expect(result?.name).toBe("Renamed")
    expect(API.updateMilestone).toHaveBeenCalledTimes(1)
    expect(API.getMilestoneList).not.toHaveBeenCalled()
  })

  it("deleteMilestone makes one call and reads no list", async () => {
    API.deleteMilestone.mockResolvedValueOnce({milestones: {removed: ["m1"]}})

    const milestonesStore = useMilestonesStore()
    const result = await milestonesStore.deleteMilestone("m1")

    expect(result).toBe(true)
    expect(API.deleteMilestone).toHaveBeenCalledTimes(1)
    expect(API.getMilestoneList).not.toHaveBeenCalled()
  })
})
