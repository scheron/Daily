// @ts-nocheck
import {toasts} from "vue-toasts-lite"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {useSubtasksStore} from "../../../src/renderer/src/stores/subtasks.store"
import {API} from "../../../src/renderer/src/api"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("vue-toasts-lite", () => ({
  toasts: {success: vi.fn(), error: vi.fn()},
}))

vi.mock("../../../src/renderer/src/api", () => ({
  API: {
    getSubtasksOfTask: vi.fn().mockResolvedValue([]),
    getSubtaskCounts: vi.fn().mockResolvedValue({}),
    createSubtask: vi.fn(),
    updateSubtask: vi.fn(),
    deleteSubtask: vi.fn(),
    makeTaskFromSubtask: vi.fn(),
  },
}))

function makeSubtask(id, taskId, overrides = {}) {
  return {
    id,
    taskId,
    content: id,
    done: false,
    orderKey: id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

async function flushCounts() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe("useSubtasksStore", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    API.getSubtasksOfTask.mockResolvedValue([])
    API.getSubtaskCounts.mockResolvedValue({})
  })

  it("reads_a_tasks_subtasks_once", async () => {
    const store = useSubtasksStore()
    API.getSubtasksOfTask.mockResolvedValue([makeSubtask("a", "t1")])

    expect(store.subtasksOf("t1")).toEqual([])

    await store.loadSubtasks("t1")
    await store.loadSubtasks("t1")

    expect(store.subtasksOf("t1").map((s) => s.id)).toEqual(["a"])
    expect(API.getSubtasksOfTask).toHaveBeenCalledTimes(1)
  })

  it("lists_subtasks_by_their_order_key_whatever_order_they_arrived_in", async () => {
    const store = useSubtasksStore()
    API.getSubtasksOfTask.mockResolvedValue([makeSubtask("c", "t1"), makeSubtask("a", "t1")])
    await store.loadSubtasks("t1")

    store.applyBroadcast({subtasks: {upserted: [makeSubtask("moved", "t1", {orderKey: "b"})]}})

    expect(store.subtasksOf("t1").map((s) => s.id)).toEqual(["a", "moved", "c"])
  })

  it("applies_the_changeset_each_write_answers_with_and_changes_nothing_for_an_empty_one", async () => {
    const store = useSubtasksStore()
    await store.loadSubtasks("t1")

    API.createSubtask.mockResolvedValue({subtasks: {upserted: [makeSubtask("s1", "t1")]}})
    expect((await store.addSubtask("t1", "s1"))?.id).toBe("s1")

    API.updateSubtask.mockResolvedValue({subtasks: {upserted: [makeSubtask("s1", "t1", {done: true})]}})
    await store.updateSubtask("s1", {done: true})
    expect(store.subtasksOf("t1")[0].done).toBe(true)

    API.deleteSubtask.mockResolvedValue({subtasks: {removed: ["s1"]}})
    await store.removeSubtask("s1")
    expect(store.subtasksOf("t1")).toEqual([])

    API.createSubtask.mockResolvedValue({})
    expect(await store.addSubtask("t1", "   ")).toBe(null)
    expect(store.subtasksOf("t1")).toEqual([])
  })

  it("reports_a_failed_write_without_changing_the_list", async () => {
    const store = useSubtasksStore()
    vi.spyOn(console, "error").mockImplementation(() => {})
    API.getSubtasksOfTask.mockResolvedValue([makeSubtask("s1", "t1")])
    await store.loadSubtasks("t1")

    API.updateSubtask.mockRejectedValue(new Error("main is down"))

    expect(await store.updateSubtask("s1", {done: true})).toBe(false)
    expect(store.subtasksOf("t1").map((s) => s.id)).toEqual(["s1"])
    expect(toasts.error).toHaveBeenCalled()
  })

  it("folds_a_broadcast_into_a_task_it_holds_and_drops_rows_of_one_never_read", async () => {
    const store = useSubtasksStore()
    API.getSubtasksOfTask.mockResolvedValue([makeSubtask("s1", "t1")])
    await store.loadSubtasks("t1")

    store.applyBroadcast({subtasks: {upserted: [makeSubtask("s2", "t1"), makeSubtask("x", "never-opened")]}})
    expect(store.subtasksOf("t1").map((s) => s.id)).toEqual(["s1", "s2"])
    expect(store.subtasksOf("never-opened")).toEqual([])

    store.applyBroadcast({subtasks: {removed: ["s1"]}})
    expect(store.subtasksOf("t1").map((s) => s.id)).toEqual(["s2"])
  })

  it("keeps_the_subtasks_of_a_task_that_was_only_soft_deleted_so_a_restore_finds_them", async () => {
    const store = useSubtasksStore()
    API.getSubtasksOfTask.mockResolvedValue([makeSubtask("s1", "t1")])
    await store.loadSubtasks("t1")

    store.applyBroadcast({tasks: {removed: ["t1"]}})

    expect(store.subtasksOf("t1").map((s) => s.id)).toEqual(["s1"])
  })

  it("reports_done_over_total_per_task_and_null_for_a_task_with_none", async () => {
    const store = useSubtasksStore()
    API.getSubtaskCounts.mockResolvedValue({t1: {done: 1, total: 2}})

    await store.loadSubtaskCounts()

    expect(store.countOf("t1")).toEqual({done: 1, total: 2})
    expect(store.countOf("t2")).toBeNull()
    expect(API.getSubtasksOfTask).not.toHaveBeenCalled()
  })

  it("recounts_when_a_broadcast_names_a_subtask_even_one_of_a_task_never_read_and_otherwise_leaves_the_counts_alone", async () => {
    const store = useSubtasksStore()
    API.getSubtaskCounts.mockResolvedValue({t1: {done: 0, total: 1}})
    await store.loadSubtaskCounts()

    store.applyBroadcast({subtasks: {upserted: [makeSubtask("s1", "t1")]}})
    await flushCounts()
    expect(API.getSubtaskCounts).toHaveBeenCalledTimes(2)
    expect(store.countOf("t1")).toEqual({done: 0, total: 1})

    store.applyBroadcast({subtasks: {removed: ["s1"]}})
    await flushCounts()
    expect(API.getSubtaskCounts).toHaveBeenCalledTimes(3)

    store.applyBroadcast({tasks: {upserted: []}})
    await flushCounts()
    expect(API.getSubtaskCounts).toHaveBeenCalledTimes(3)
  })

  it("never_asks_for_counts_in_a_window_that_did_not_load_them", async () => {
    const store = useSubtasksStore()

    store.applyBroadcast({subtasks: {upserted: [makeSubtask("s1", "t1")]}})
    await flushCounts()

    expect(API.getSubtaskCounts).not.toHaveBeenCalled()
  })

  it("breaks_a_tie_between_equal_order_keys_by_id_the_way_storage_does", async () => {
    const store = useSubtasksStore()
    API.getSubtasksOfTask.mockResolvedValue([makeSubtask("b", "t1", {orderKey: "k"})])
    await store.loadSubtasks("t1")

    store.applyBroadcast({subtasks: {upserted: [makeSubtask("a", "t1", {orderKey: "k"})]}})

    expect(store.subtasksOf("t1").map((s) => s.id)).toEqual(["a", "b"])
  })

  it("makes_a_task_in_one_call_and_leaves_the_list_to_the_broadcast", async () => {
    const store = useSubtasksStore()
    API.getSubtasksOfTask.mockResolvedValue([makeSubtask("s1", "t1")])
    await store.loadSubtasks("t1")
    API.makeTaskFromSubtask.mockResolvedValue({id: "new-task"})

    expect(await store.makeTask("s1")).toEqual({id: "new-task"})
    expect(API.makeTaskFromSubtask).toHaveBeenCalledWith("s1")
    expect(store.subtasksOf("t1")).toHaveLength(1)

    store.applyBroadcast({subtasks: {removed: ["s1"]}})
    expect(store.subtasksOf("t1")).toEqual([])
  })
})
