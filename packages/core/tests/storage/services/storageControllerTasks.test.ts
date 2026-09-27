// @ts-nocheck
import {afterEach, describe, expect, it, vi} from "vitest"

import {EMPTY_CHANGESET} from "@core/types/storage"
import {makeControllerHarness as makeHarness, makeTaskInput, withBroadcasts} from "../../helpers/storageControllerHarness"

/**
 * Characterises the changeset and broadcast of every `StorageController` task write, ahead of
 * phase 3 rerouting them through `WorkStorage` — a safety net so the reroute cannot silently
 * change what a caller receives back or is notified of.
 */

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

describe("StorageController — task write changesets and broadcasts", () => {
  let db

  afterEach(() => {
    db?.close()
  })

  it("createTask_returns_the_created_task_upserted_broadcasts_it_and_adds_it_to_the_search_index", async () => {
    const harness = makeHarness()
    db = harness.db
    const {controller} = harness
    await controller.searchService.initializeIndex()
    const broadcasts = withBroadcasts(controller)

    const sizeBefore = controller.searchService.getIndexSize()
    const changeset = await controller.createTask(makeTaskInput({content: "Freshly created"}))

    expect(changeset.tasks?.upserted).toHaveLength(1)
    expect(changeset.tasks.upserted[0]).toMatchObject({content: "Freshly created", branchId: "main"})
    expect(broadcasts).toEqual([changeset])
    expect(controller.searchService.getIndexSize()).toBe(sizeBefore + 1)
  })

  it("updateTask_returns_the_updated_task_upserted_and_broadcasts_it_without_touching_relations_or_comments", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness
    const task = taskModel.createTask(makeTaskInput({content: "Before"}))
    const broadcasts = withBroadcasts(controller)

    const changeset = await controller.updateTask(task.id, {content: "After"})

    expect(changeset).toEqual({tasks: {upserted: [expect.objectContaining({id: task.id, content: "After"})]}})
    expect(broadcasts).toEqual([changeset])
  })

  it("updateTask_returns_EMPTY_CHANGESET_and_does_not_broadcast_for_an_unknown_task", async () => {
    const harness = makeHarness()
    db = harness.db
    const {controller} = harness
    const broadcasts = withBroadcasts(controller)

    const changeset = await controller.updateTask("no-such-task", {content: "After"})

    expect(changeset).toEqual(EMPTY_CHANGESET)
    expect(broadcasts).toEqual([])
  })

  it("moveTaskByOrder_returns_every_row_the_reorder_touched_as_upserted_and_broadcasts_them", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness
    const a = taskModel.createTask(makeTaskInput({content: "A", orderIndex: 1024}))
    const b = taskModel.createTask(makeTaskInput({content: "B", orderIndex: 2048}))
    const c = taskModel.createTask(makeTaskInput({content: "C", orderIndex: 3072}))
    const broadcasts = withBroadcasts(controller)

    const changeset = await controller.moveTaskByOrder({taskId: a.id, targetTaskId: c.id, position: "before", activeDate: "2026-03-24"})

    expect(changeset.tasks?.upserted?.map((t) => t.id)).toContain(a.id)
    expect(broadcasts).toEqual([changeset])
    void b
  })

  it("deleteTask_returns_the_id_removed_broadcasts_it_and_drops_it_from_the_search_index", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness
    const task = taskModel.createTask(makeTaskInput({content: "Goes to the trash"}))
    await controller.searchService.addTaskToIndex(task)
    const broadcasts = withBroadcasts(controller)
    const sizeBefore = controller.searchService.getIndexSize()

    const changeset = await controller.deleteTask(task.id)

    expect(changeset).toEqual({tasks: {removed: [task.id]}})
    expect(broadcasts).toEqual([changeset])
    expect(controller.searchService.getIndexSize()).toBe(sizeBefore - 1)
  })

  it("restoreTask_returns_the_restored_task_upserted_and_broadcasts_it", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness
    const task = taskModel.createTask(makeTaskInput({content: "Back from the trash"}))
    taskModel.deleteTask(task.id)
    const broadcasts = withBroadcasts(controller)

    const changeset = await controller.restoreTask(task.id)

    expect(changeset).toEqual({tasks: {upserted: [expect.objectContaining({id: task.id, deletedAt: null})]}})
    expect(broadcasts).toEqual([changeset])
  })

  it("permanentlyDeleteTask_reports_success_broadcasts_EMPTY_CHANGESET_and_drops_it_from_the_search_index", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness
    const task = taskModel.createTask(makeTaskInput({content: "Gone for good"}))
    taskModel.deleteTask(task.id)
    await controller.searchService.addTaskToIndex(task)
    const broadcasts = withBroadcasts(controller)
    const sizeBefore = controller.searchService.getIndexSize()

    const deleted = await controller.permanentlyDeleteTask(task.id)

    expect(deleted).toBe(true)
    expect(broadcasts).toEqual([EMPTY_CHANGESET])
    expect(controller.searchService.getIndexSize()).toBe(sizeBefore - 1)
  })

  it("permanentlyDeleteAllDeletedTasks_returns_the_count_removed_and_broadcasts_EMPTY_CHANGESET", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness
    const first = taskModel.createTask(makeTaskInput({content: "One"}))
    const second = taskModel.createTask(makeTaskInput({content: "Two"}))
    taskModel.deleteTask(first.id)
    taskModel.deleteTask(second.id)
    const broadcasts = withBroadcasts(controller)

    const count = await controller.permanentlyDeleteAllDeletedTasks()

    expect(count).toBe(2)
    expect(broadcasts).toEqual([EMPTY_CHANGESET])
  })

  it("addTaskTags_returns_the_updated_task_upserted_and_broadcasts_it_once", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, tagModel, controller} = harness
    const task = taskModel.createTask(makeTaskInput({content: "Tagged"}))
    const tag = tagModel.createTag({branchId: "main", name: "urgent", color: "#ff0000"})
    const broadcasts = withBroadcasts(controller)

    const added = await controller.addTaskTags(task.id, [tag.id])

    expect(added.tasks?.upserted?.[0]).toMatchObject({id: task.id, tags: [expect.objectContaining({id: tag.id})]})
    expect(broadcasts).toEqual([added])
  })

  it("removeTaskTags_returns_the_updated_task_upserted_but_broadcasts_it_twice_today", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, tagModel, controller} = harness
    const task = taskModel.createTask(makeTaskInput({content: "Tagged"}))
    const tag = tagModel.createTag({branchId: "main", name: "urgent", color: "#ff0000"})
    await controller.addTaskTags(task.id, [tag.id])
    const broadcasts = withBroadcasts(controller)

    const removed = await controller.removeTaskTags(task.id, [tag.id])

    expect(removed.tasks?.upserted?.[0]).toMatchObject({id: task.id, tags: []})
    expect(broadcasts).toEqual([removed, removed])
  })
})
