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
})
