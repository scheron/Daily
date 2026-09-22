// @ts-nocheck
import {toasts} from "vue-toasts-lite"
import {createPinia, setActivePinia} from "pinia"
import {beforeEach, describe, expect, it, vi} from "vitest"

import {useTaskCommentsStore} from "../../../src/renderer/src/stores/taskComments.store"
import {API} from "../../../src/renderer/src/api"
import {mockBridgeIPC} from "../../helpers/bridgeIPC"

vi.mock("vue-toasts-lite", () => ({
  toasts: {success: vi.fn(), error: vi.fn()},
}))

vi.mock("../../../src/renderer/src/api", () => ({
  API: {
    getTaskComments: vi.fn().mockResolvedValue([]),
    createTaskComment: vi.fn(),
    updateTaskComment: vi.fn(),
    deleteTaskComment: vi.fn(),
  },
}))

function makeComment(id, taskId, overrides = {}) {
  return {
    id,
    taskId,
    branchId: "main",
    content: id,
    origin: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  }
}

describe("useTaskCommentsStore", () => {
  beforeEach(() => {
    mockBridgeIPC()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    /* `clearAllMocks` keeps implementations, so each case starts from an empty thread and says what it needs. */
    API.getTaskComments.mockResolvedValue([])
  })

  it("reads_a_tasks_thread_once_and_tells_an_empty_thread_apart_from_one_never_read", async () => {
    const store = useTaskCommentsStore()
    API.getTaskComments.mockResolvedValue([makeComment("c1", "t1"), makeComment("c2", "t1")])

    expect(store.isLoaded("t1")).toBe(false)
    expect(store.commentsOf("t1")).toEqual([])

    await store.loadComments("t1")

    expect(store.isLoaded("t1")).toBe(true)
    expect(store.commentsOf("t1").map((c) => c.id)).toEqual(["c1", "c2"])

    await store.loadComments("t1")
    expect(API.getTaskComments).toHaveBeenCalledTimes(1)

    await store.loadComments("t1", {force: true})
    expect(API.getTaskComments).toHaveBeenCalledTimes(2)
  })

  it("keeps_each_tasks_thread_to_itself", async () => {
    const store = useTaskCommentsStore()

    API.getTaskComments.mockResolvedValueOnce([makeComment("a1", "t1")])
    await store.loadComments("t1")
    API.getTaskComments.mockResolvedValueOnce([makeComment("b1", "t2"), makeComment("b2", "t2")])
    await store.loadComments("t2")

    expect(store.commentsOf("t1").map((c) => c.id)).toEqual(["a1"])
    expect(store.commentsOf("t2").map((c) => c.id)).toEqual(["b1", "b2"])
  })

  it("orders_a_thread_oldest_first_and_keeps_the_written_order_for_comments_sharing_a_timestamp", async () => {
    const store = useTaskCommentsStore()
    const sameInstant = "2026-01-02T00:00:00.000Z"
    API.getTaskComments.mockResolvedValue([
      makeComment("second", "t1", {createdAt: sameInstant}),
      makeComment("third", "t1", {createdAt: sameInstant}),
      makeComment("first", "t1", {createdAt: "2026-01-01T00:00:00.000Z"}),
    ])

    await store.loadComments("t1")

    expect(store.commentsOf("t1").map((c) => c.id)).toEqual(["first", "second", "third"])
  })

  it("adds_edits_and_removes_a_comment_through_the_changeset_the_write_answers_with", async () => {
    const store = useTaskCommentsStore()
    await store.loadComments("t1")

    API.createTaskComment.mockResolvedValue({comments: {upserted: [makeComment("c1", "t1", {content: "hello"})]}})
    expect(await store.addComment("t1", "hello")).toBe(true)
    expect(store.commentsOf("t1").map((c) => c.content)).toEqual(["hello"])

    API.updateTaskComment.mockResolvedValue({
      comments: {upserted: [makeComment("c1", "t1", {content: "hello, revised", updatedAt: "2026-01-02T00:00:00.000Z"})]},
    })
    expect(await store.editComment("c1", "hello, revised")).toBe(true)
    expect(store.commentsOf("t1").map((c) => c.content)).toEqual(["hello, revised"])

    API.deleteTaskComment.mockResolvedValue({comments: {removed: ["c1"]}})
    expect(await store.removeComment("c1")).toBe(true)
    expect(store.commentsOf("t1")).toEqual([])
  })

  it("changes_nothing_when_storage_refuses_the_write_and_answers_an_empty_changeset", async () => {
    const store = useTaskCommentsStore()
    await store.loadComments("t1")

    API.createTaskComment.mockResolvedValue({})
    expect(await store.addComment("t1", "   ")).toBe(true)
    expect(store.commentsOf("t1")).toEqual([])
  })

  it("reads_a_tasks_thread_before_writing_the_first_comment_on_it", async () => {
    const store = useTaskCommentsStore()
    API.getTaskComments.mockResolvedValue([makeComment("existing", "t1")])
    API.createTaskComment.mockResolvedValue({comments: {upserted: [makeComment("fresh", "t1")]}})

    await store.addComment("t1", "fresh")

    expect(API.getTaskComments).toHaveBeenCalledWith("t1")
    expect(store.commentsOf("t1").map((c) => c.id)).toEqual(["existing", "fresh"])
  })

  it("reports_a_failed_write_without_changing_the_collection", async () => {
    const store = useTaskCommentsStore()
    vi.spyOn(console, "error").mockImplementation(() => {})
    API.getTaskComments.mockResolvedValue([makeComment("c1", "t1")])
    await store.loadComments("t1")

    API.updateTaskComment.mockRejectedValue(new Error("main is down"))

    expect(await store.editComment("c1", "never lands")).toBe(false)
    expect(store.commentsOf("t1").map((c) => c.content)).toEqual(["c1"])
    expect(toasts.error).toHaveBeenCalled()
  })

  it("folds_a_broadcast_into_a_thread_it_holds_and_drops_one_for_a_task_it_has_never_read", async () => {
    const store = useTaskCommentsStore()
    API.getTaskComments.mockResolvedValue([makeComment("c1", "t1")])
    await store.loadComments("t1")

    store.applyBroadcast({comments: {upserted: [makeComment("c2", "t1", {content: "from another window"})]}})
    expect(store.commentsOf("t1").map((c) => c.id)).toEqual(["c1", "c2"])

    store.applyBroadcast({comments: {upserted: [makeComment("x1", "never-opened")]}})
    expect(store.commentsOf("never-opened")).toEqual([])
    expect(store.isLoaded("never-opened")).toBe(false)

    store.applyBroadcast({comments: {removed: ["c1"]}})
    expect(store.commentsOf("t1").map((c) => c.id)).toEqual(["c2"])
  })

  it("takes_a_comment_out_of_the_thread_when_a_broadcast_upserts_it_already_tombstoned", async () => {
    const store = useTaskCommentsStore()
    API.getTaskComments.mockResolvedValue([makeComment("c1", "t1")])
    await store.loadComments("t1")

    store.applyBroadcast({comments: {upserted: [makeComment("c1", "t1", {deletedAt: "2026-02-01T00:00:00.000Z"})]}})

    expect(store.commentsOf("t1")).toEqual([])
  })

  it("keeps_the_thread_of_a_task_that_was_only_soft-deleted_so_a_restore_finds_it_again", async () => {
    const store = useTaskCommentsStore()
    API.getTaskComments.mockResolvedValue([makeComment("c1", "t1")])
    await store.loadComments("t1")

    store.applyBroadcast({tasks: {removed: ["t1"]}})

    expect(store.commentsOf("t1").map((c) => c.id)).toEqual(["c1"])
    expect(store.isLoaded("t1")).toBe(true)
  })
})
