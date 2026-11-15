// @ts-nocheck
import {afterEach, describe, expect, it, vi} from "vitest"

import {makeControllerHarness as makeHarness, makeTaskInput, withBroadcasts} from "../../helpers/storageControllerHarness"

vi.mock("../../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    storage: vi.fn(),
    lifecycle: vi.fn(),
    CONTEXT: {TASKS: "TASKS", TAGS: "TAGS", BRANCHES: "BRANCHES"},
  },
}))

vi.mock("../../../src/config/env", () => ({ENV: {isDev: false}}))

vi.mock("@daily/protocol", async (importOriginal) => ({...(await importOriginal()), WINDOWS_CONFIG: {main: {width: 800, height: 600}}}))

describe("WorkStorage.batch", () => {
  let db

  afterEach(() => {
    db?.close()
  })

  it("fires_afterWrite_once_with_every_written_tasks_merged_changeset_and_indexes_them_all", async () => {
    const harness = makeHarness()
    db = harness.db
    const {controller} = harness
    await controller.searchService.initializeIndex()
    const broadcasts = withBroadcasts(controller)
    const workStorage = controller.workStorage

    const created = await workStorage.batch(async () => {
      const a = await workStorage.createTask(makeTaskInput({content: "A"}))
      const b = await workStorage.createTask(makeTaskInput({content: "B"}))
      const c = await workStorage.createTask(makeTaskInput({content: "C"}))
      return [a, b, c].map((changeset) => changeset.tasks.upserted[0].id)
    })

    expect(broadcasts).toHaveLength(1)
    expect(broadcasts[0].tasks.upserted.map((task) => task.content).sort()).toEqual(["A", "B", "C"])

    for (const id of created) {
      expect(await controller.getTask(id)).not.toBeNull()
    }
    expect((await controller.searchTasks("A")).some((r) => r.task.id === created[0])).toBe(true)
    expect((await controller.searchTasks("C")).some((r) => r.task.id === created[2])).toBe(true)
  })

  it("rolls_back_every_write_when_a_later_one_throws_leaving_no_row_no_index_entry_and_no_afterWrite_call", async () => {
    const harness = makeHarness()
    db = harness.db
    const {controller} = harness
    await controller.searchService.initializeIndex()
    const broadcasts = withBroadcasts(controller)
    const workStorage = controller.workStorage

    let firstId = ""
    const sizeBefore = controller.searchService.getIndexSize()

    await expect(
      workStorage.batch(async () => {
        const first = await workStorage.createTask(makeTaskInput({content: "Survives only if committed"}))
        firstId = first.tasks.upserted[0].id

        throw new Error("second write refuses")
      }),
    ).rejects.toThrow("second write refuses")

    expect(broadcasts).toEqual([])
    expect(await controller.getTask(firstId)).toBeNull()
    expect(controller.searchService.getIndexSize()).toBe(sizeBefore)
  })

  it("clears the batch on a failed COMMIT, rolls back the doomed write for real, and leaves a later batch free to open its own transaction", async () => {
    const harness = makeHarness()
    db = harness.db
    const {controller} = harness
    await controller.searchService.initializeIndex()
    const broadcasts = withBroadcasts(controller)
    const workStorage = controller.workStorage

    const realExec = db.exec.bind(db)
    let shouldFailNextCommit = true
    vi.spyOn(db, "exec").mockImplementation((sql) => {
      if (shouldFailNextCommit && sql === "COMMIT") {
        shouldFailNextCommit = false
        throw new Error("SQLITE_FULL: database or disk is full")
      }
      return realExec(sql)
    })

    let doomedId = ""
    await expect(
      workStorage.batch(async () => {
        const doomed = await workStorage.createTask(makeTaskInput({content: "Doomed"}))
        doomedId = doomed.tasks.upserted[0].id
      }),
    ).rejects.toThrow("SQLITE_FULL")

    expect(await controller.getTask(doomedId)).toBeNull()

    await workStorage.createTask(makeTaskInput({content: "Recovered"}))

    let thirdId = ""
    await expect(
      workStorage.batch(async () => {
        const third = await workStorage.createTask(makeTaskInput({content: "Third"}))
        thirdId = third.tasks.upserted[0].id
      }),
    ).resolves.not.toThrow()

    expect(broadcasts).toHaveLength(2)
    expect(broadcasts[0].tasks.upserted[0].content).toBe("Recovered")
    expect(broadcasts[1].tasks.upserted[0].content).toBe("Third")
    expect(await controller.getTask(thirdId)).not.toBeNull()
  })

  it("surfaces fn's own error even when the rollback that follows it also throws", async () => {
    const harness = makeHarness()
    db = harness.db
    const {controller} = harness
    await controller.searchService.initializeIndex()
    const workStorage = controller.workStorage

    const realExec = db.exec.bind(db)
    vi.spyOn(db, "exec").mockImplementation((sql) => {
      if (sql === "ROLLBACK") throw new Error("SQLITE_ERROR: cannot rollback - no transaction is active")
      return realExec(sql)
    })

    await expect(
      workStorage.batch(async () => {
        throw new Error("fn refuses")
      }),
    ).rejects.toThrow("fn refuses")
  })

  it("joins_an_already-open_batch_instead_of_starting_a_nested_transaction", async () => {
    const harness = makeHarness()
    db = harness.db
    const {controller} = harness
    await controller.searchService.initializeIndex()
    const broadcasts = withBroadcasts(controller)
    const workStorage = controller.workStorage

    await workStorage.batch(async () => {
      await workStorage.batch(async () => {
        await workStorage.createTask(makeTaskInput({content: "Nested"}))
      })
    })

    expect(broadcasts).toHaveLength(1)
    expect(broadcasts[0].tasks.upserted).toHaveLength(1)
  })

  it("commits a waiting sync merge independently when an open local batch rolls back", async () => {
    const {controller, localAdapter, db: testDb} = makeHarness()
    db = testDb
    const workStorage = controller.workStorage
    const task = makeTaskInput({content: "Original"})
    await workStorage.createTask(task)
    const before = await localAdapter.loadAllDocs()
    const remote = {...before, tasks: before.tasks.map((row) => ({...row, content: "Remote edit", updated_at: "2090-01-01T00:00:00.000Z"}))}

    const batchOpened = Promise.withResolvers<void>()
    const abortBatch = Promise.withResolvers<void>()
    const rolledBack = expect(
      workStorage.batch(async () => {
        await workStorage.updateTask(task.id, {content: "Discarded edit"})
        await workStorage.createTask(makeTaskInput({id: "discarded", content: "Discarded task"}))
        batchOpened.resolve()
        await abortBatch.promise
        throw new Error("Local action cancelled")
      }),
    ).rejects.toThrow("Local action cancelled")
    await batchOpened.promise

    const notified = vi.fn((result) => ({inTransaction: db.inTransaction, result}))
    const pendingMerge = localAdapter.mergeAndApply(remote, "pull", notified)
    abortBatch.resolve()
    await rolledBack
    const result = await pendingMerge

    expect(notified.mock.results).toEqual([{type: "return", value: {inTransaction: false, result}}])
    expect(result.resultDocs.tasks.map(({id, content}) => ({id, content}))).toEqual([{id: task.id, content: "Remote edit"}])
    expect(await workStorage.getTask("discarded")).toBeNull()
    expect((await workStorage.getTask(task.id))?.content).toBe("Remote edit")
  })

  it("drops a cancelled sync merge that is waiting for an open local batch", async () => {
    const {controller, localAdapter, db: testDb} = makeHarness()
    db = testDb
    const workStorage = controller.workStorage
    const task = makeTaskInput({content: "Original"})
    await workStorage.createTask(task)
    const before = await localAdapter.loadAllDocs()
    const remote = {...before, tasks: before.tasks.map((row) => ({...row, content: "Cancelled remote", updated_at: "2090-01-01T00:00:00.000Z"}))}
    const batchOpened = Promise.withResolvers<void>()
    const finishBatch = Promise.withResolvers<void>()
    const batch = workStorage.batch(async () => {
      await workStorage.updateTask(task.id, {content: "Local edit"})
      batchOpened.resolve()
      await finishBatch.promise
    })
    await batchOpened.promise

    const abort = new AbortController()
    const notified = vi.fn()
    const cancelled = expect(localAdapter.mergeAndApply(remote, "pull", notified, abort.signal)).rejects.toHaveProperty("name", "AbortError")
    abort.abort()
    finishBatch.resolve()
    await batch
    await cancelled

    expect(notified).not.toHaveBeenCalled()
    expect((await workStorage.getTask(task.id))?.content).toBe("Local edit")
  })
})
