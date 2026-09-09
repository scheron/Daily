// @ts-nocheck
import {nextTick} from "vue"
import {DateTime} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {beforeAll, beforeEach, describe, expect, it, vi} from "vitest"

import {API} from "@/api"
import {useDragDropStore} from "@/stores/dragDrop.store"
import {useTasksStore} from "@/stores/tasks/tasks.store"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

const TODAY = DateTime.now().toISODate()
const TOMORROW = DateTime.now().plus({days: 1}).toISODate()

const importMilestonesStore = () => import(["@", "stores", "milestones.store"].join("/"))

vi.mock("@/utils/ui/vue", () => ({toRawDeep: (v) => v}))
vi.mock("@/utils/perf", () => ({perfMark: vi.fn(), perfMeasure: vi.fn()}))

vi.mock("@/api", () => ({
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
    status: "done",
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

describe("useTaskColumns", () => {
  beforeAll(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
  })

  beforeEach(() => {
    mockBridgeIPC()
    vi.clearAllMocks()
  })

  it("a card dropped on a calendar day keeps its status: a column it was dragged across does not claim it", async () => {
    const task = makeTask({id: "t1", status: "done"})
    API.getDays.mockResolvedValueOnce([makeDay(TODAY, [task])])

    const store = useTasksStore()
    await new Promise((r) => setTimeout(r, 0))
    await store.getTaskList()
    await nextTick()

    const {useTaskColumns} = await import("@/composables/tasks/useTaskColumns")
    const columns = useTaskColumns()
    expect(columns.localTasksByStatus.done).toHaveLength(1)

    const dragDropStore = useDragDropStore()
    dragDropStore.setDraggingTaskId("t1")
    await dragDropStore.dropOnDay("t1", TOMORROW)

    columns.localTasksByStatus.active.push(columns.localTasksByStatus.done.pop())
    await columns.onColumnChange("active", {added: {newIndex: 0}})

    expect(API.moveTaskByOrder).not.toHaveBeenCalled()
    expect(API.moveTask).toHaveBeenCalledWith("t1", TOMORROW)
    expect(columns.localTasksByStatus.active).toHaveLength(0)
  })

  it("a drag reads its task from the card it started on, so a card from any list is tracked", async () => {
    const {useTaskColumns} = await import("@/composables/tasks/useTaskColumns")
    const columns = useTaskColumns()
    const dragDropStore = useDragDropStore()

    dragDropStore.setDraggingTaskId("stale")
    await dragDropStore.dropOnDay("stale", TOMORROW)
    expect(dragDropStore.dayDropHandled).toBe(true)

    columns.onDragStart({item: {dataset: {taskId: "trashed-1"}}})

    expect(dragDropStore.draggingTaskId).toBe("trashed-1")
    expect(dragDropStore.dayDropHandled).toBe(false)
  })

  it("TC-18: a milestone's dayless backlog task lands in the active column, while a day's own backlog task still stays out of the board", async () => {
    const {useTaskColumns} = await import("@/composables/tasks/useTaskColumns")
    const columns = useTaskColumns()
    columns.onDragEnd()

    const milestoneBacklogTask = makeTask({id: "milestone-backlog-task", status: "backlog", scheduled: null})
    API.getMilestoneTasks.mockResolvedValueOnce([milestoneBacklogTask])

    const {useMilestonesStore} = await importMilestonesStore()
    const milestonesStore = useMilestonesStore()
    milestonesStore.selectMilestone("m1")
    milestonesStore.setMode("milestone")
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(columns.localTasksByStatus.active.some((t) => t.id === "milestone-backlog-task")).toBe(true)
    expect(columns.localTasksByStatus.backlog.some((t) => t.id === "milestone-backlog-task")).toBe(false)

    milestonesStore.setMode("day")
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    const dayBacklogTask = makeTask({id: "day-backlog-task", status: "backlog", scheduled: null})
    API.getBacklog.mockResolvedValueOnce([dayBacklogTask])

    const tasksStore = useTasksStore()
    await tasksStore.getBacklogList()
    await nextTick()

    expect(columns.localTasksByStatus.active.some((t) => t.id === "day-backlog-task")).toBe(false)
    expect(columns.localTasksByStatus.backlog.some((t) => t.id === "day-backlog-task")).toBe(true)
  })
})
