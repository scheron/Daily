// @ts-nocheck
import {ref} from "vue"
import {toasts} from "vue-toasts-lite"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {useTaskRelationsStore} from "../../../src/renderer/src/stores/taskRelations.store"
import {useTasksStore} from "../../../src/renderer/src/stores/tasks/tasks.store"
import {API} from "../../../src/renderer/src/api"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("../../../src/renderer/src/utils/ui/toRawDeep", () => ({toRawDeep: (v) => v}))

vi.mock("vue-toasts-lite", () => ({
  toasts: {success: vi.fn(), error: vi.fn()},
}))

vi.mock("../../../src/renderer/src/api", () => ({
  API: {
    getAllTasks: vi.fn().mockResolvedValue([]),
    getAllTaskRelations: vi.fn().mockResolvedValue([]),
    setTaskRelations: vi.fn(),
  },
}))

function makeTask(overrides = {}) {
  return {
    id: "t1",
    status: "in_progress",
    content: "Task",
    minimized: false,
    orderIndex: 1024,
    scheduled: null,
    estimatedTime: 0,
    spentTime: 0,
    branchId: "P",
    milestoneId: null,
    tags: [],
    attachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

function makeRelation(id, blockerId, blockedId, overrides = {}) {
  return {
    id,
    blockerId,
    blockedId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

describe("useTaskRelationsStore", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it.each(["ready_for_agent", "ready_to_merge"])("keeps %s blocking on both relation sides until resolved", (status) => {
    const tasks = useTasksStore()
    tasks.tasks = [makeTask({id: "before", status}), makeTask({id: "middle", status}), makeTask({id: "after", status})]
    const relations = useTaskRelationsStore()
    relations.relations = [makeRelation("r1", "before", "middle"), makeRelation("r2", "middle", "after")]
    expect(relations.chipByTaskId.get("before")).toEqual({kind: "blocks", count: 1})
    expect(relations.chipByTaskId.get("middle")).toEqual({kind: "linked", count: 2})
    expect(relations.chipByTaskId.get("after")).toEqual({kind: "blocked-by", count: 1})
    tasks.tasks = tasks.tasks.map((task) => (task.id === "middle" ? {...task, status: "done"} : task))
    expect(relations.chipByTaskId.size).toBe(0)
  })

  it("lists both ready stages before more recent resolved relation candidates", () => {
    const tasks = useTasksStore()
    tasks.tasks = [
      makeTask({id: "target"}),
      makeTask({id: "merge", status: "ready_to_merge"}),
      makeTask({id: "ready", status: "ready_for_agent"}),
      makeTask({id: "done", status: "done", updatedAt: "2030-01-01"}),
    ]
    const relations = useTaskRelationsStore()
    expect(relations.linkCandidates({task: tasks.tasks[0], current: {blocks: [], blockedBy: []}, side: "blockedBy"}).map((task) => task.id)).toEqual([
      "merge",
      "ready",
      "done",
    ])
  })

  it("shows_TC-13_a_chip_only_for_an_unresolved_task_counting_only_its_unresolved_side_and_none_for_a_cross-project_or_deleted_link", () => {
    const tasksStore = useTasksStore()
    tasksStore.tasks = [
      makeTask({id: "A", status: "in_progress"}),
      makeTask({id: "B", status: "in_progress"}),
      makeTask({id: "C", status: "done"}),
      makeTask({id: "D", status: "in_progress"}),
      makeTask({id: "G", status: "backlog"}),
      makeTask({id: "H", status: "cancelled"}),
      makeTask({id: "J", branchId: "Q", status: "in_progress"}),
    ]

    const relationsStore = useTaskRelationsStore()
    relationsStore.relations = [
      makeRelation("r-ab", "A", "B"),
      makeRelation("r-cb", "C", "B"),
      makeRelation("r-bd", "B", "D"),
      makeRelation("r-hg", "H", "G"),
      makeRelation("r-ja", "J", "A"),
      makeRelation("r-ak", "A", "K"),
    ]

    expect(relationsStore.chipByTaskId.get("A")).toEqual({kind: "blocks", count: 1})
    expect(relationsStore.chipByTaskId.get("B")).toEqual({kind: "linked", count: 2})
    expect(relationsStore.chipByTaskId.get("D")).toEqual({kind: "blocked-by", count: 1})
    expect(relationsStore.chipByTaskId.get("C")).toBeUndefined()
    expect(relationsStore.chipByTaskId.get("H")).toBeUndefined()
    expect(relationsStore.chipByTaskId.get("G")).toBeUndefined()

    tasksStore.tasks = tasksStore.tasks.map((task) => (task.id === "B" ? {...task, status: "done"} : task))

    expect(relationsStore.chipByTaskId.get("B")).toBeUndefined()
    expect(relationsStore.chipByTaskId.get("D")).toBeUndefined()
    expect(relationsStore.chipByTaskId.get("A")).toBeUndefined()
  })

  it("offers_TC-14_unresolved_candidates_before_resolved_ones_by_recency_excluding_the_cycle_the_project_and_what_is_already_linked", () => {
    const tasksStore = useTasksStore()
    tasksStore.tasks = [
      makeTask({id: "T", branchId: "P", status: "in_progress"}),
      makeTask({id: "A", branchId: "P", status: "in_progress"}),
      makeTask({id: "F", branchId: "P", status: "in_progress"}),
      makeTask({id: "G", branchId: "P", status: "in_progress"}),
      makeTask({id: "B", branchId: "P", status: "done", updatedAt: "2026-09-10T00:00:00.000Z"}),
      makeTask({id: "C", branchId: "P", status: "done", updatedAt: "2026-09-05T00:00:00.000Z"}),
      makeTask({id: "X", branchId: "Q", status: "in_progress"}),
    ]

    const relationsStore = useTaskRelationsStore()
    relationsStore.relations = [makeRelation("r-tf", "T", "F"), makeRelation("r-fa", "F", "A")]

    const taskT = tasksStore.tasks.find((task) => task.id === "T")
    const forT = relationsStore.linkCandidates({task: taskT, current: {blockedBy: [], blocks: ["F"]}, side: "blockedBy"})
    expect(forT.map((task) => task.id)).toEqual(["G", "B", "C"])

    const forDraft = relationsStore.linkCandidates({
      task: {id: "__draft__", branchId: "P"},
      current: {blockedBy: ["A"], blocks: []},
      side: "blocks",
    })
    expect(forDraft.map((task) => task.id)).toEqual(["G", "B", "C"])
  })

  it("writes_TC-15_a_link_immediately_settles_on_mains_reply_and_rolls_back_with_a_toast_when_it_rejects", async () => {
    const tasksStore = useTasksStore()
    tasksStore.tasks = [makeTask({id: "A", branchId: "P"}), makeTask({id: "B", branchId: "P"})]

    const relationsStore = useTaskRelationsStore()

    let resolveApi
    API.setTaskRelations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveApi = resolve
        }),
    )

    const writePromise = relationsStore.setTaskRelations("B", {blockedBy: ["A"], blocks: []})
    await Promise.resolve()

    expect(relationsStore.relations.some((r) => r.blockerId === "A" && r.blockedId === "B" && !r.deletedAt)).toBe(true)

    const mainRow = {
      id: "A:B",
      blockerId: "A",
      blockedId: "B",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      deletedAt: null,
    }
    resolveApi({relations: {upserted: [mainRow]}})
    await writePromise

    expect(relationsStore.relations.find((r) => r.blockerId === "A" && r.blockedId === "B")).toEqual(mainRow)
    expect(API.setTaskRelations).toHaveBeenCalledWith("B", {blockedBy: ["A"], blocks: []})

    relationsStore.relations = []
    API.setTaskRelations.mockRejectedValueOnce(new Error("write failed"))
    const beforeReject = structuredClone(relationsStore.relations)

    const result = await relationsStore.setTaskRelations("B", {blockedBy: ["A"], blocks: []})

    expect(result).toBe(false)
    expect(relationsStore.relations).toEqual(beforeReject)
    expect(toasts.error).toHaveBeenCalled()
    expect(API.setTaskRelations).toHaveBeenLastCalledWith("B", {blockedBy: ["A"], blocks: []})
  })

  it("hands_the_api_a_plain_payload_that_survives_structuredClone_even_when_the_caller_passes_reactive_arrays", async () => {
    const tasksStore = useTasksStore()
    tasksStore.tasks = [makeTask({id: "A", branchId: "P"}), makeTask({id: "B", branchId: "P"})]

    const relationsStore = useTaskRelationsStore()
    API.setTaskRelations.mockResolvedValueOnce({})

    const draft = ref({blockedBy: ["A"], blocks: []})
    await relationsStore.setTaskRelations("B", {blockedBy: draft.value.blockedBy, blocks: draft.value.blocks})

    const payload = API.setTaskRelations.mock.calls[0][1]
    expect(() => structuredClone(payload)).not.toThrow()
    expect(payload).toEqual({blockedBy: ["A"], blocks: []})
  })
})
