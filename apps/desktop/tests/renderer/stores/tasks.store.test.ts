// @ts-nocheck
import {toasts} from "vue-toasts-lite"
import {DateTime} from "luxon"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {groupTasksByDay} from "@daily/protocol"

import {useBranchesStore} from "../../../src/renderer/src/stores/branches.store"
import {useFilterStore} from "../../../src/renderer/src/stores/filter.store"
import {useMilestonesStore} from "../../../src/renderer/src/stores/milestones.store"
import {useSettingsStore} from "../../../src/renderer/src/stores/settings.store"
import {useTagsStore} from "../../../src/renderer/src/stores/tags.store"
import {useTasksStore} from "../../../src/renderer/src/stores/tasks/tasks.store"
import {API} from "../../../src/renderer/src/api"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

const TODAY = DateTime.now().toISODate()

vi.mock("../../../src/renderer/src/utils/ui/toRawDeep", () => ({
  toRawDeep: (v) => v,
}))

vi.mock("vue-toasts-lite", () => ({
  toasts: {success: vi.fn(), error: vi.fn()},
}))

vi.mock("../../../src/renderer/src/api", () => ({
  API: {
    getAllTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue({}),
    updateTask: vi.fn().mockResolvedValue({}),
    deleteTask: vi.fn().mockResolvedValue({}),
    getDeletedTasks: vi.fn().mockResolvedValue([]),
    moveTask: vi.fn().mockResolvedValue({}),
    moveTaskByOrder: vi.fn().mockResolvedValue({}),
    moveTaskToBranch: vi.fn().mockResolvedValue({}),
  },
}))

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
    await new Promise((r) => setTimeout(r, 0))
    return store
  }

  it("loads tasks and sets isLoaded", async () => {
    API.getAllTasks.mockResolvedValue([makeTask({id: "t1"})])

    const store = await getStore()
    await store.loadTasks()

    expect(store.isLoaded).toBe(true)
    expect(store.days).toHaveLength(1)
  })

  it("dailyTasksByStatus groups tasks correctly", async () => {
    const tasks = [
      makeTask({id: "1", status: "active", orderIndex: 1}),
      makeTask({id: "2", status: "done", orderIndex: 2}),
      makeTask({id: "3", status: "active", orderIndex: 3}),
      makeTask({id: "4", status: "discarded", orderIndex: 4}),
    ]
    API.getAllTasks.mockResolvedValue(tasks)

    const store = await getStore()
    await store.loadTasks()

    expect(store.dailyTasksByStatus.active).toHaveLength(2)
    expect(store.dailyTasksByStatus.done).toHaveLength(1)
    expect(store.dailyTasksByStatus.discarded).toHaveLength(1)
  })

  it("deleteTask removes the task from state without rereading the collection", async () => {
    const task = makeTask({id: "to-delete"})
    API.getAllTasks.mockResolvedValue([task])

    const store = await getStore()
    await store.loadTasks()

    expect(store.dailyTasks).toHaveLength(1)

    API.deleteTask.mockResolvedValueOnce({tasks: {removed: ["to-delete"]}})

    await store.deleteTask("to-delete")

    expect(store.dailyTasks).toHaveLength(0)
  })

  it("setActiveDay changes activeDay", async () => {
    const store = await getStore()

    store.setActiveDay("2026-04-01")

    expect(store.activeDay).toBe("2026-04-01")
  })

  it("createTask honors date, branchId, and status overrides", async () => {
    API.getAllTasks.mockResolvedValue([])
    const store = await getStore()
    await store.loadTasks()
    store.activeDay = TODAY

    const createdTask = makeTask({id: "task-99", scheduled: {date: "2099-01-01", time: "", timezone: "UTC"}, branchId: "other", status: "done"})
    API.createTask.mockResolvedValueOnce({tasks: {upserted: [createdTask]}})

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

  it("moves a task out of the backlog and back without ever holding it in both lists", async () => {
    const backlogTask = makeTask({id: "b1", status: "backlog", scheduled: null})
    API.getAllTasks.mockResolvedValue([backlogTask])

    const store = await getStore()
    await store.loadTasks()

    expect(store.backlogTasks.map((t) => t.id)).toContain("b1")
    expect(store.dailyTasks.map((t) => t.id)).not.toContain("b1")

    const activeTask = makeTask({id: "b1", status: "active", scheduled: {date: TODAY, time: "09:00:00", timezone: "UTC"}})
    API.moveTaskByOrder.mockResolvedValueOnce({tasks: {upserted: [activeTask]}})

    await store.moveTaskByOrder({taskId: "b1", targetStatus: "active", targetTaskId: null, position: "before", activeDate: TODAY})

    expect(store.backlogTasks.map((t) => t.id)).not.toContain("b1")
    expect(store.dailyTasks.map((t) => t.id)).toContain("b1")

    API.moveTaskByOrder.mockResolvedValueOnce({tasks: {upserted: [backlogTask]}})

    await store.moveTaskByOrder({taskId: "b1", targetStatus: "backlog", targetTaskId: null, position: "before", activeDate: TODAY})

    expect(store.dailyTasks.map((t) => t.id)).not.toContain("b1")
    expect(store.backlogTasks.map((t) => t.id)).toContain("b1")
  })

  it("duplicates a backlog task as dateless, never inventing a day", async () => {
    const original = makeTask({id: "orig", status: "backlog", scheduled: null, content: "no day yet"})
    API.getAllTasks.mockResolvedValue([original])

    const store = await getStore()
    await store.loadTasks()

    await store.duplicateTask("orig")

    expect(API.createTask).toHaveBeenCalledWith("no day yet", expect.objectContaining({status: "backlog", date: undefined}))
  })

  it("updateTask cleans the day a task left when a status change sends it to the backlog", async () => {
    const task = makeTask({id: "t1", status: "active"})
    API.getAllTasks.mockResolvedValue([task])

    const store = await getStore()
    await store.loadTasks()

    expect(store.dailyTasks.map((t) => t.id)).toContain("t1")

    const backlogged = makeTask({id: "t1", status: "backlog", scheduled: null})
    API.updateTask.mockResolvedValueOnce({tasks: {upserted: [backlogged]}})

    await store.updateTask("t1", {status: "backlog"})

    expect(store.dailyTasks.map((t) => t.id)).not.toContain("t1")
  })

  it("moves a task to a different day and out of the day it left, on any calendar day", async () => {
    const OTHER = DateTime.fromISO(TODAY).plus({days: 1}).toISODate()
    const task = makeTask({id: "t1", status: "active", scheduled: {date: TODAY, time: "", timezone: "UTC"}})
    API.getAllTasks.mockResolvedValue([task])

    const store = await getStore()
    await store.loadTasks()

    expect(store.dailyTasks.map((t) => t.id)).toContain("t1")

    const movedTask = makeTask({id: "t1", status: "done", scheduled: {date: OTHER, time: "", timezone: "UTC"}})
    API.updateTask.mockResolvedValueOnce({tasks: {upserted: [movedTask]}})

    await store.updateTask("t1", {status: "done", scheduled: movedTask.scheduled})

    expect(store.dailyTasks.map((t) => t.id)).not.toContain("t1")
    expect(store.days.find((d) => d.date === OTHER)?.tasks.map((t) => t.id)).toContain("t1")
  })

  it("updateTask updates the backlog and reports success when a task already in the backlog is edited", async () => {
    const backlogTask = makeTask({id: "b1", status: "backlog", scheduled: null, estimatedTime: 0})
    API.getAllTasks.mockResolvedValue([backlogTask])

    const store = await getStore()
    await store.loadTasks()

    expect(store.backlogTasks.map((t) => t.id)).toContain("b1")

    const updated = makeTask({id: "b1", status: "backlog", scheduled: null, estimatedTime: 3600})
    API.updateTask.mockResolvedValueOnce({tasks: {upserted: [updated]}})

    const isUpdated = await store.updateTask("b1", {estimatedTime: 3600})

    expect(isUpdated).toBe(true)
    expect(store.backlogTasks.find((t) => t.id === "b1")?.estimatedTime).toBe(3600)
  })

  it("moves a dateless backlog task onto the day it is dropped on and out of the backlog", async () => {
    const backlogTask = makeTask({id: "b1", status: "backlog", scheduled: null})
    API.getAllTasks.mockResolvedValue([backlogTask])

    const store = await getStore()
    await store.loadTasks()
    expect(store.backlogTasks.map((t) => t.id)).toContain("b1")

    const targetDate = "2026-09-20"
    const activeTask = makeTask({id: "b1", status: "active", scheduled: {date: targetDate, time: "09:00:00", timezone: "UTC"}})
    API.moveTask.mockResolvedValueOnce({tasks: {upserted: [activeTask]}})

    const moved = await store.moveTask("b1", targetDate)

    expect(moved).toBe(true)
    expect(API.moveTask).toHaveBeenCalledWith("b1", targetDate)
    expect(store.backlogTasks.map((t) => t.id)).not.toContain("b1")
    expect(store.days.find((d) => d.date === targetDate)?.tasks.map((t) => t.id)).toContain("b1")
  })

  it("updateTask shows the edit on the board before the write resolves", async () => {
    API.getAllTasks.mockResolvedValue([makeTask({id: "t1", content: "Before"})])

    const store = await getStore()
    await store.loadTasks()

    API.updateTask.mockImplementationOnce(() => new Promise(() => {}))

    store.updateTask("t1", {content: "After"})

    expect(store.dailyTasks.find((t) => t.id === "t1")?.content).toBe("After")
  })

  it("moveTaskByOrder puts a card where it was dropped before the write resolves", async () => {
    API.getAllTasks.mockResolvedValue([
      makeTask({id: "a", orderIndex: 1024}),
      makeTask({id: "b", orderIndex: 2048}),
      makeTask({id: "c", orderIndex: 3072}),
    ])

    const store = await getStore()
    await store.loadTasks()

    API.moveTaskByOrder.mockImplementationOnce(() => new Promise(() => {}))

    store.moveTaskByOrder({taskId: "c", targetTaskId: "a", targetStatus: "active", position: "before", activeDate: TODAY})

    expect(store.dailyTasksByStatus.active.map((t) => t.id)).toEqual(["c", "a", "b"])
  })

  it("updateTask reports failure and leaves the task as it was when the write rejects", async () => {
    API.getAllTasks.mockResolvedValue([makeTask({id: "t1", content: "Before", estimatedTime: 0})])

    const store = await getStore()
    await store.loadTasks()
    const before = store.tasks.find((t) => t.id === "t1")

    API.updateTask.mockRejectedValueOnce(new Error("write failed"))

    await expect(store.updateTask("t1", {content: "After", estimatedTime: 3600})).resolves.toBe(false)
    expect(store.tasks.find((t) => t.id === "t1")).toBe(before)
  })

  it("holds a milestone's tasks and reflects them after a write", async () => {
    const milestoneTask = makeTask({id: "m1", milestoneId: "milestone-1", scheduled: null, status: "backlog"})
    API.getAllTasks.mockResolvedValue([milestoneTask])

    const store = await getStore()
    await store.loadTasks()

    expect(store.tasksByMilestoneId.get("milestone-1")?.map((t) => t.id)).toEqual(["m1"])

    const renamedMilestoneTask = makeTask({id: "m1", milestoneId: "milestone-1", scheduled: null, status: "backlog", content: "Renamed"})
    API.updateTask.mockResolvedValueOnce({tasks: {upserted: [renamedMilestoneTask]}})

    await store.updateTask("m1", {content: "Renamed"})

    expect(store.tasksByMilestoneId.get("milestone-1")?.find((t) => t.id === "m1")?.content).toBe("Renamed")
  })
})

describe("the collection lives in memory — phase 4/5 surface", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function settle() {
    await new Promise((r) => setTimeout(r, 0))
  }

  function totalApiCalls() {
    return Object.values(API).reduce((n, fn) => n + (fn.mock?.calls.length ?? 0), 0)
  }

  it("switches_TC-1_the_frame_and_milestone_selection_without_any_API_call", async () => {
    API.getAllTasks.mockResolvedValueOnce([makeTask({id: "t1"})])
    const filterStore = useFilterStore()
    const store = useTasksStore()
    await settle()
    await store.loadTasks()
    vi.clearAllMocks()

    filterStore.setFrame("milestone")
    filterStore.setActiveMilestone("m1")
    filterStore.setFrame("day")
    filterStore.setActiveMilestone("m1")
    await settle()

    expect(totalApiCalls()).toBe(0)
  })

  it("toggles_TC-3_a_tag_and_switches_project_without_any_API_call", async () => {
    API.getAllTasks.mockResolvedValueOnce([makeTask({id: "t1"})])
    const filterStore = useFilterStore()
    const settingsStore = useSettingsStore()
    const store = useTasksStore()
    await settle()
    await store.loadTasks()
    vi.clearAllMocks()

    filterStore.setActiveTags("tag-1")
    settingsStore.updateSettings({branch: {activeId: "other"}})
    await settle()

    expect(totalApiCalls()).toBe(0)
  })

  it("edits_TC-5_a_tasks_content_with_exactly_one_write_and_no_read", async () => {
    const task = makeTask({id: "t1", content: "Before"})
    API.getAllTasks.mockResolvedValueOnce([task])
    const store = useTasksStore()
    await settle()
    await store.loadTasks()
    vi.clearAllMocks()
    API.updateTask.mockResolvedValueOnce({tasks: {upserted: [{...task, content: "After"}]}})

    await store.updateTask("t1", {content: "After"})

    expect(totalApiCalls()).toBe(1)
    expect(API.updateTask).toHaveBeenCalledTimes(1)
  })

  it("keeps_TC-6_the_API_call_count_at_exactly_one_the_write_regardless_of_world_size", async () => {
    async function editFirstTaskAndCountCalls(taskCount: number, milestoneCount: number, branchCount: number, tagCount: number) {
      setActivePinia(createPinia())
      mockBridgeIPC()
      vi.clearAllMocks()

      const tasks = Array.from({length: taskCount}, (_, i) => makeTask({id: `t${i}`, content: `Task ${i}`}))
      API.getAllTasks.mockResolvedValueOnce(tasks)

      const milestonesStore = useMilestonesStore()
      milestonesStore.milestones = Array.from({length: milestoneCount}, (_, i) => ({id: `m${i}`, branchId: "main"}))
      const branchesStore = useBranchesStore()
      branchesStore.branches = Array.from({length: branchCount}, (_, i) => ({id: i === 0 ? "main" : `b${i}`, name: `B${i}`}))
      const tagsStore = useTagsStore()
      tagsStore.tags = Array.from({length: tagCount}, (_, i) => ({id: `tag${i}`, name: `Tag${i}`, color: "#000", branchId: "main"}))

      const store = useTasksStore()
      await settle()
      await store.loadTasks()
      vi.clearAllMocks()

      API.updateTask.mockResolvedValueOnce({tasks: {upserted: [{...tasks[0], content: "Edited"}]}})
      await store.updateTask("t0", {content: "Edited"})

      return totalApiCalls()
    }

    const small = await editFirstTaskAndCountCalls(10, 2, 1, 3)
    const large = await editFirstTaskAndCountCalls(1000, 50, 5, 30)

    expect(small).toBe(1)
    expect(large).toBe(1)
    expect(small).toBe(large)
  })

  it("creates_TC-11_a_task_that_never_swaps_the_id_it_first_appears_with", async () => {
    API.getAllTasks.mockResolvedValueOnce([])
    const store = useTasksStore()
    await settle()
    await store.loadTasks()

    let resolveWrite: (value: unknown) => void
    API.createTask.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve
        }),
    )

    const createPromise = store.createTask({content: "New task", tags: [], estimatedTime: 0})
    await Promise.resolve()
    await Promise.resolve()

    const optimistic = store.tasks.find((t) => t.content === "New task")
    expect(optimistic).toBeTruthy()
    const shownId = optimistic.id

    resolveWrite!({tasks: {upserted: [{...optimistic, id: shownId}]}})
    await createPromise

    const matching = store.tasks.filter((t) => t.content === "New task")
    expect(matching).toHaveLength(1)
    expect(matching[0].id).toBe(shownId)
  })

  it("computes_TC-17_days_as_groupTasksByDay_over_the_dated_tasks_excluding_the_backlog", async () => {
    const dated1 = makeTask({id: "d1", scheduled: {date: "2026-09-10", time: "", timezone: "UTC"}})
    const dated2 = makeTask({id: "d2", scheduled: {date: "2026-09-12", time: "", timezone: "UTC"}})
    const backlog = makeTask({id: "b1", status: "backlog", scheduled: null})
    API.getAllTasks.mockResolvedValueOnce([dated1, dated2, backlog])

    const store = useTasksStore()
    await settle()
    await store.loadTasks()

    const expected = groupTasksByDay({tasks: [dated1, dated2], tags: []})

    expect(store.days).toEqual(expected)
    expect(store.days.flatMap((d) => d.tasks).some((t) => t.id === "b1")).toBe(false)
  })

  it("calls_TC-20_the_full_collection_read_exactly_once_across_startup_and_several_interactions", async () => {
    const tasks = [makeTask({id: "t1"}), makeTask({id: "t2"}), makeTask({id: "t3"})]
    API.getAllTasks.mockResolvedValueOnce(tasks)
    const filterStore = useFilterStore()
    const store = useTasksStore()
    await settle()

    await store.loadTasks()

    filterStore.setFrame("milestone")
    filterStore.setActiveTags("tag-1")

    API.updateTask.mockResolvedValue({tasks: {upserted: [{...tasks[0], content: "e1"}]}})
    await store.updateTask("t1", {content: "e1"})
    await store.updateTask("t2", {content: "e2"})
    await store.updateTask("t3", {content: "e3"})

    expect(API.getAllTasks).toHaveBeenCalledTimes(1)
  })

  it("rolls_TC-21_back_every_patched_row_and_raises_a_toast_when_the_write_rejects", async () => {
    const task = makeTask({id: "t1", content: "Before"})
    API.getAllTasks.mockResolvedValueOnce([task])
    const store = useTasksStore()
    await settle()
    await store.loadTasks()

    API.updateTask.mockRejectedValueOnce(new Error("write failed"))

    await store.updateTask("t1", {content: "After"})

    expect(store.tasks.find((t) => t.id === "t1")?.content).toBe("Before")
    expect(toasts.error).toHaveBeenCalled()
  })
})
