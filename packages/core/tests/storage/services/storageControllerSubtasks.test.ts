// @ts-nocheck
import {afterEach, describe, expect, it, vi} from "vitest"

import {EMPTY_CHANGESET} from "@core/types/storage"
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

describe("StorageController — subtasks", () => {
  let db

  afterEach(() => {
    db?.close()
  })

  async function seed(harness, count = 3) {
    const task = harness.taskModel.createTask(makeTaskInput({content: "Parent"}))
    const subtasks = []
    for (let i = 1; i <= count; i++) {
      subtasks.push((await harness.controller.createSubtask(task.id, `sub ${i}`)).subtasks.upserted[0])
    }
    return {task, subtasks}
  }

  const contents = async (controller, taskId) => (await controller.getSubtasksOfTask(taskId)).map((s) => s.content)

  it("writes_reads_checks_edits_and_soft-deletes_a_subtask_and_counts_done_over_total", async () => {
    const harness = makeHarness()
    db = harness.db
    const {controller} = harness
    const {task, subtasks} = await seed(harness, 2)

    expect(subtasks[0]).toMatchObject({taskId: task.id, content: "sub 1", done: false, deletedAt: null})
    expect(await contents(controller, task.id)).toEqual(["sub 1", "sub 2"])
    expect(await controller.getSubtaskCounts()).toEqual({[task.id]: {done: 0, total: 2}})

    const checked = await controller.updateSubtask(subtasks[0].id, {done: true})
    expect(checked.subtasks.upserted[0]).toMatchObject({id: subtasks[0].id, done: true, content: "sub 1"})

    const edited = await controller.updateSubtask(subtasks[0].id, {content: "  sub 1, revised  "})
    expect(edited.subtasks.upserted[0]).toMatchObject({content: "sub 1, revised", done: true})
    expect(await controller.getSubtaskCounts()).toEqual({[task.id]: {done: 1, total: 2}})

    const removed = await controller.deleteSubtask(subtasks[1].id)
    expect(removed.subtasks.removed).toEqual([subtasks[1].id])
    expect(await controller.getSubtaskCounts()).toEqual({[task.id]: {done: 1, total: 1}})
    expect(db.prepare("SELECT deleted_at FROM subtasks WHERE id = ?").get(subtasks[1].id).deleted_at).not.toBeNull()
  })

  it("refuses_whitespace_content_an_unknown_task_and_a_deleted_task", async () => {
    const harness = makeHarness()
    db = harness.db
    const {controller} = harness
    const {task, subtasks} = await seed(harness, 1)

    expect(await controller.createSubtask(task.id, "  \n ")).toEqual(EMPTY_CHANGESET)
    expect(await controller.createSubtask("nope", "x")).toEqual(EMPTY_CHANGESET)
    expect(await controller.updateSubtask(subtasks[0].id, {content: "   "})).toEqual(EMPTY_CHANGESET)

    await controller.deleteTask(task.id)
    expect(await controller.createSubtask(task.id, "late")).toEqual(EMPTY_CHANGESET)
  })

  it("never_touches_the_parent_task_row_or_its_history_whatever_is_written_to_a_subtask", async () => {
    const harness = makeHarness()
    db = harness.db
    const {controller, taskModel} = harness
    const task = taskModel.createTask(makeTaskInput())
    const rowBefore = db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id)
    const eventsBefore = db.prepare("SELECT COUNT(*) AS n FROM task_events").get().n

    const sub = (await controller.createSubtask(task.id, "a")).subtasks.upserted[0]
    await controller.createSubtask(task.id, "b")
    await controller.updateSubtask(sub.id, {done: true, content: "a2"})
    await controller.deleteSubtask(sub.id)

    expect(db.prepare("SELECT * FROM tasks WHERE id = ?").get(task.id)).toEqual(rowBefore)
    expect(db.prepare("SELECT COUNT(*) AS n FROM task_events").get().n).toBe(eventsBefore)
  })

  it("keeps_subtasks_through_a_soft_delete_and_restore_and_backdates_them_on_a_permanent_delete", async () => {
    const harness = makeHarness()
    db = harness.db
    const {controller} = harness
    const {task, subtasks} = await seed(harness, 2)
    await controller.updateSubtask(subtasks[0].id, {done: true})

    await controller.deleteTask(task.id)
    await controller.restoreTask(task.id)
    expect((await controller.getSubtasksOfTask(task.id)).map((s) => [s.content, s.done])).toEqual([
      ["sub 1", true],
      ["sub 2", false],
    ])

    await controller.deleteTask(task.id)
    await controller.permanentlyDeleteTask(task.id)
    const rows = db.prepare("SELECT deleted_at FROM subtasks").all()
    expect(rows.map((r) => r.deleted_at)).toEqual(["1970-01-01T00:00:00.000Z", "1970-01-01T00:00:00.000Z"])
  })

  it("makes_a_task_from_a_checked_subtask_of_a_closed_parent_copying_the_parents_placement_and_deleting_the_subtask", async () => {
    const harness = makeHarness()
    db = harness.db
    const {controller, taskModel, tagModel, milestoneModel} = harness
    const tag = tagModel.createTag({name: "t", color: "#fff", branchId: "main"})
    const milestone = milestoneModel.createMilestone({branchId: "main", name: "m", description: "", targetDate: null})
    const parent = taskModel.createTask(
      makeTaskInput({status: "done", content: "Parent", priority: "high", estimatedTime: 600, tags: [tag.id], milestoneId: milestone.id}),
    )
    const sub = (await controller.createSubtask(parent.id, "Обновить changelog")).subtasks.upserted[0]
    await controller.updateSubtask(sub.id, {done: true})
    const broadcasts = withBroadcasts(controller)

    const made = await controller.makeTaskFromSubtask(sub.id)

    expect(made).toMatchObject({
      content: "Обновить changelog",
      status: "done",
      scheduled: parent.scheduled,
      branchId: "main",
      milestoneId: milestone.id,
      priority: "none",
      estimatedTime: 0,
    })
    expect(made.tags.map((t) => t.id)).toEqual([tag.id])
    expect(made.id).not.toBe(parent.id)
    expect(await controller.getSubtasksOfTask(parent.id)).toEqual([])
    expect(broadcasts).toHaveLength(1)
    expect(broadcasts[0].tasks.upserted.map((t) => t.id)).toEqual([made.id])
    expect(broadcasts[0].subtasks.removed).toEqual([sub.id])
  })

  it("makes_the_task_and_removes_the_subtask_together_or_neither", async () => {
    const harness = makeHarness()
    db = harness.db
    const {controller, subtasksService} = harness
    const {task, subtasks} = await seed(harness, 1)
    const broadcasts = withBroadcasts(controller)
    const tasksBefore = db.prepare("SELECT COUNT(*) AS n FROM tasks").get().n
    vi.spyOn(subtasksService, "deleteSubtask").mockRejectedValueOnce(new Error("boom"))

    await expect(controller.makeTaskFromSubtask(subtasks[0].id)).rejects.toThrow("boom")

    expect(db.prepare("SELECT COUNT(*) AS n FROM tasks").get().n).toBe(tasksBefore)
    expect(await contents(controller, task.id)).toEqual(["sub 1"])
    expect(broadcasts).toEqual([])
  })

  it("returns_null_for_a_subtask_that_is_gone_or_whose_task_is_deleted", async () => {
    const harness = makeHarness()
    db = harness.db
    const {controller} = harness
    const {task, subtasks} = await seed(harness, 1)

    expect(await controller.makeTaskFromSubtask("nope")).toBeNull()
    await controller.deleteTask(task.id)
    expect(await controller.makeTaskFromSubtask(subtasks[0].id)).toBeNull()
  })
})
