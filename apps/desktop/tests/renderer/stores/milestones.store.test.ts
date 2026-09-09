// @ts-nocheck
import {DateTime} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {API} from "@/api"
import {useTasksStore} from "@/stores/tasks/tasks.store"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

const TODAY = DateTime.now().toISODate()
const FUTURE_DAY = DateTime.now().plus({days: 5}).toISODate()

const importMilestonesStore = () => import(["@", "stores", "milestones.store"].join("/"))
const importSettingsStore = () => import(["@", "stores", "settings.store"].join("/"))

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
    scheduleTask: vi.fn().mockResolvedValue(null),
    moveTaskToBacklog: vi.fn().mockResolvedValue(null),
    getMilestoneList: vi.fn().mockResolvedValue([]),
    getMilestoneTasks: vi.fn().mockResolvedValue([]),
    createMilestone: vi.fn().mockResolvedValue(null),
    updateMilestone: vi.fn().mockResolvedValue(null),
    deleteMilestone: vi.fn().mockResolvedValue(true),
    setTaskMilestone: vi.fn().mockResolvedValue(null),
  },
}))

function makeDay(date, tasks = []) {
  return {date, tasks, tags: []}
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

function makeMilestone(overrides = {}) {
  return {
    id: "m1",
    createdAt: "2026-03-24T00:00:00.000Z",
    updatedAt: "2026-03-24T00:00:00.000Z",
    deletedAt: null,
    branchId: "main",
    name: "Launch",
    date: null,
    description: null,
    progress: {done: 0, total: 0, percent: 0},
    ...overrides,
  }
}

describe("milestones.store", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function getTasksStore() {
    const store = useTasksStore()
    // Let settingsStore initialize so activeBranchId is set before isDaysLoaded
    // becomes true — mirrors the tasksStore test helper's own race guard.
    await new Promise((r) => setTimeout(r, 0))
    return store
  }

  it("TC-17: switching to milestone mode swaps the board's task source, and switching back restores it without losing the active day", async () => {
    const dayTask = makeTask({id: "day-task", content: "day task"})
    const milestoneTask = makeTask({id: "milestone-task", content: "milestone task"})

    API.getDays.mockResolvedValueOnce([makeDay(TODAY, []), makeDay(FUTURE_DAY, [dayTask])])
    API.getMilestoneTasks.mockResolvedValue([milestoneTask])

    const tasksStore = await getTasksStore()
    await tasksStore.getTaskList()
    tasksStore.setActiveDay(FUTURE_DAY)

    expect(tasksStore.activeDay).toBe(FUTURE_DAY)
    expect(tasksStore.dailyTasks.map((t) => t.id)).toEqual(["day-task"])

    const {useMilestonesStore} = await importMilestonesStore()
    const milestonesStore = useMilestonesStore()

    milestonesStore.selectMilestone("m1")
    milestonesStore.setMode("milestone")
    await new Promise((r) => setTimeout(r, 0))

    expect(tasksStore.dailyTasks.map((t) => t.id)).toEqual(["milestone-task"])
    expect(tasksStore.activeDay).toBe(FUTURE_DAY)

    milestonesStore.setMode("day")
    await new Promise((r) => setTimeout(r, 0))

    expect(tasksStore.dailyTasks.map((t) => t.id)).toEqual(["day-task"])
    expect(tasksStore.activeDay).toBe(FUTURE_DAY)
  })

  it("TC-19: switching the active branch keeps milestone mode, reloads the milestone list, and clears the selected milestone", async () => {
    API.getMilestoneList.mockResolvedValue([makeMilestone({id: "m1", branchId: "main"})])

    const {useMilestonesStore} = await importMilestonesStore()
    const {useSettingsStore} = await importSettingsStore()

    const milestonesStore = useMilestonesStore()
    const settingsStore = useSettingsStore()
    await new Promise((r) => setTimeout(r, 0))

    await milestonesStore.getMilestoneList()
    milestonesStore.setMode("milestone")
    milestonesStore.selectMilestone("m1")

    expect(milestonesStore.mode).toBe("milestone")
    expect(milestonesStore.selectedMilestoneId).toBe("m1")

    const callsBeforeSwitch = API.getMilestoneList.mock.calls.length

    settingsStore.updateSettings({branch: {activeId: "branch-2"}})
    await new Promise((r) => setTimeout(r, 0))

    expect(milestonesStore.mode).toBe("milestone")
    expect(milestonesStore.selectedMilestoneId).toBeNull()
    expect(API.getMilestoneList.mock.calls.length).toBeGreaterThan(callsBeforeSwitch)
  })

  it("findTaskById also finds a task that lives only in the milestone task list", async () => {
    const milestoneTask = makeTask({id: "milestone-task", content: "milestone task"})

    API.getDays.mockResolvedValueOnce([makeDay(TODAY, [])])
    API.getMilestoneTasks.mockResolvedValue([milestoneTask])

    const tasksStore = await getTasksStore()
    await tasksStore.getTaskList()

    expect(tasksStore.findTaskById("milestone-task")).toBeNull()

    const {useMilestonesStore} = await importMilestonesStore()
    const milestonesStore = useMilestonesStore()
    milestonesStore.selectMilestone("m1")
    milestonesStore.setMode("milestone")
    await new Promise((r) => setTimeout(r, 0))

    expect(tasksStore.findTaskById("milestone-task")?.id).toBe("milestone-task")
  })

  it("clearing a task's milestone refreshes the milestones list and, in milestone mode, the board's milestone tasks", async () => {
    const boardTask = makeTask({id: "board-task", milestoneId: "m1"})

    API.getDays.mockResolvedValueOnce([makeDay(TODAY, [boardTask])])
    API.getMilestoneTasks.mockResolvedValue([])
    API.getMilestoneList.mockResolvedValue([])

    const tasksStore = await getTasksStore()
    await tasksStore.getTaskList()

    const {useMilestonesStore} = await importMilestonesStore()
    const milestonesStore = useMilestonesStore()
    milestonesStore.setMode("milestone")
    await new Promise((r) => setTimeout(r, 0))

    API.getMilestoneList.mockClear()
    API.getMilestoneTasks.mockClear()
    API.updateTask.mockResolvedValueOnce({...boardTask, milestoneId: null})

    await tasksStore.updateTask("board-task", {milestoneId: null})

    expect(API.getMilestoneList).toHaveBeenCalledTimes(1)
    expect(API.getMilestoneTasks).toHaveBeenCalledTimes(1)
  })

  it("assigning a task's milestone while the board shows a day refreshes only the milestones list, not the board", async () => {
    const dayTask = makeTask({id: "day-task", milestoneId: null})

    API.getDays.mockResolvedValueOnce([makeDay(TODAY, [dayTask])])
    API.getMilestoneList.mockResolvedValue([])

    const tasksStore = await getTasksStore()
    await tasksStore.getTaskList()

    API.getMilestoneList.mockClear()
    API.getMilestoneTasks.mockClear()
    API.updateTask.mockResolvedValueOnce({...dayTask, milestoneId: "m1"})

    await tasksStore.updateTask("day-task", {milestoneId: "m1"})

    expect(API.getMilestoneList).toHaveBeenCalledTimes(1)
    expect(API.getMilestoneTasks).not.toHaveBeenCalled()
  })
})
