// @ts-nocheck
import {afterEach, describe, expect, it, vi} from "vitest"

import {makeControllerHarness as makeHarness, makeTaskInput} from "../../helpers/storageControllerHarness"

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

describe("StorageController — search", () => {
  let db

  afterEach(() => {
    db?.close()
  })

  it("finds_a_backlog_task_by_a_unique_word_in_its_text", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness

    taskModel.createTask(makeTaskInput({content: "Reticulate the splines", status: "backlog", scheduled: null}))
    await controller.searchService.initializeIndex()

    const results = await controller.searchTasks("splines")

    expect(results.map((r) => r.task.content)).toContain("Reticulate the splines")
  })
})
