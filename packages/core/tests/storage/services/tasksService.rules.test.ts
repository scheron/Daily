// @ts-nocheck
import {nanoid} from "nanoid"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {planTaskMoveByOrder, planTaskUpdate} from "@daily/protocol"

import {BranchModel} from "@core/storage/models/BranchModel"
import {TaskEventModel} from "@core/storage/models/TaskEventModel"
import {TaskModel} from "@core/storage/models/TaskModel"
import {TaskEventsService} from "@core/storage/services/TaskEventsService"
import {TasksService} from "@core/storage/services/TasksService"
import {createTestDatabase} from "../../helpers/db"

/**
 * The cross-check phase 1 promises: the pure rule and the real storage core, run over the same
 * starting state, must land on the same row — `updatedAt` excepted, since the renderer's clock and
 * main's are never equal.
 *
 * TC-9 and TC-10 are NOT-YET-RUNNABLE: `planTaskMoveByOrder`/`planTaskUpdate` are phase 1's
 * `mutationRules.ts`, which does not exist yet. Written now, against the frozen signature in the
 * plan's phase 1 "Frozen for later phases", so both start running the moment that file lands.
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

function makeTaskInput(overrides = {}) {
  return {
    id: nanoid(),
    status: "active",
    content: "Task",
    minimized: false,
    orderIndex: 1024,
    scheduled: {date: "2026-03-24", time: "", timezone: "UTC"},
    estimatedTime: 0,
    spentTime: 0,
    branchId: "main",
    milestoneId: null,
    tags: [],
    attachments: [],
    deletedAt: null,
    ...overrides,
  }
}

function applyPatch(task, patch) {
  return patch ? {...task, ...patch} : task
}

function withoutUpdatedAt(task) {
  const {updatedAt: _updatedAt, ...rest} = task
  return rest
}

function makeHarness() {
  const db = createTestDatabase()
  const taskModel = new TaskModel(db)
  const branchModel = new BranchModel(db)
  branchModel.ensureMainBranch()
  const tasksService = new TasksService(taskModel, new TaskEventsService(new TaskEventModel(db)))
  return {db, taskModel, tasksService}
}

describe("planTaskMoveByOrder — equals the real storage core", () => {
  let db, taskModel, tasksService

  beforeEach(() => {
    ;({db, taskModel, tasksService} = makeHarness())
  })

  afterEach(() => db.close())

  it("matches_TC-9_the_real_storage_core_field_by_field_when_a_move_forces_the_normalize_fallback", async () => {
    const seeded = [
      taskModel.createTask(makeTaskInput({content: "Task 0", orderIndex: 1})),
      taskModel.createTask(makeTaskInput({content: "Task 1", orderIndex: 2})),
      taskModel.createTask(makeTaskInput({content: "Task 2", orderIndex: 3})),
    ]

    const params = {taskId: seeded[2].id, targetTaskId: seeded[1].id, position: "before", activeDate: "2026-03-24"}
    const ctx = {tasks: seeded, milestones: [], today: "2026-03-24"}

    const patches = planTaskMoveByOrder(ctx, params)
    expect(patches.length).toBe(seeded.length)

    await tasksService.moveTaskByOrder(params)

    for (const before of seeded) {
      const patch = patches.find((p) => p.id === before.id)
      const predicted = withoutUpdatedAt(applyPatch(before, patch))
      const actual = withoutUpdatedAt(taskModel.getTask(before.id))
      expect(actual).toEqual(predicted)
    }
  })
})

describe("the D2 transition table — planTaskMoveByOrder/planTaskUpdate equal the real storage core", () => {
  let db, taskModel, tasksService

  beforeEach(() => {
    ;({db, taskModel, tasksService} = makeHarness())
  })

  afterEach(() => db.close())

  it("matches_TC-10_the_real_storage_core_for_any_column_to_backlog_column", async () => {
    const seeded = taskModel.createTask(makeTaskInput({status: "active", scheduled: {date: "2026-03-24", time: "09:00:00", timezone: "UTC"}}))
    const params = {taskId: seeded.id, targetStatus: "backlog", activeDate: "2026-03-24"}
    const ctx = {tasks: [seeded], milestones: [], today: "2026-03-24"}

    const patches = planTaskMoveByOrder(ctx, params)
    const predicted = withoutUpdatedAt(
      applyPatch(
        seeded,
        patches.find((p) => p.id === seeded.id),
      ),
    )

    await tasksService.moveTaskByOrder(params)
    const actual = withoutUpdatedAt(taskModel.getTask(seeded.id))

    expect(actual).toEqual(predicted)
  })

  it("matches_TC-10_the_real_storage_core_for_backlog_column_to_active_done_and_discarded", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-02T12:00:00.000Z"))

    try {
      for (const targetStatus of ["active", "done", "discarded"]) {
        const harness = makeHarness()

        const seeded = harness.taskModel.createTask(makeTaskInput({status: "backlog", scheduled: null}))
        const params = {taskId: seeded.id, targetStatus, activeDate: "2026-04-02"}
        const ctx = {tasks: [seeded], milestones: [], today: "2026-04-02"}

        const patches = planTaskMoveByOrder(ctx, params)
        const predicted = withoutUpdatedAt(
          applyPatch(
            seeded,
            patches.find((p) => p.id === seeded.id),
          ),
        )

        await harness.tasksService.moveTaskByOrder(params)
        const actual = withoutUpdatedAt(harness.taskModel.getTask(seeded.id))

        expect(actual, targetStatus).toEqual(predicted)
        harness.db.close()
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it("matches_TC-10_the_real_storage_core_for_any_column_to_a_day_in_the_calendar_with_status_preserved", async () => {
    const seeded = taskModel.createTask(makeTaskInput({status: "done", scheduled: {date: "2026-04-01", time: "09:00:00", timezone: "UTC"}}))
    const updates = {scheduled: {date: "2026-04-15", time: "09:00:00", timezone: "UTC"}}
    const ctx = {tasks: [seeded], milestones: [], today: "2026-04-01"}

    const patches = planTaskUpdate(ctx, seeded.id, updates)
    const predicted = withoutUpdatedAt(
      applyPatch(
        seeded,
        patches.find((p) => p.id === seeded.id),
      ),
    )

    await tasksService.updateTask(seeded.id, updates)
    const actual = withoutUpdatedAt(taskModel.getTask(seeded.id))

    expect(actual).toEqual(predicted)
  })

  it("matches_TC-10_the_real_storage_core_for_backlog_column_to_a_day_in_the_calendar_becoming_active", async () => {
    const seeded = taskModel.createTask(makeTaskInput({status: "backlog", scheduled: null}))
    const updates = {scheduled: {date: "2026-04-10", time: "10:00:00", timezone: "UTC"}}
    const ctx = {tasks: [seeded], milestones: [], today: "2026-04-10"}

    const patches = planTaskUpdate(ctx, seeded.id, updates)
    const predicted = withoutUpdatedAt(
      applyPatch(
        seeded,
        patches.find((p) => p.id === seeded.id),
      ),
    )

    await tasksService.updateTask(seeded.id, updates)
    const actual = withoutUpdatedAt(taskModel.getTask(seeded.id))

    expect(actual).toEqual(predicted)
  })
})
