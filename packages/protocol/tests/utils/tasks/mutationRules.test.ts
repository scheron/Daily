// @ts-nocheck
import {describe, expect, it} from "vitest"

import {planTaskMoveByOrder, planTaskUpdate} from "../../../src/utils/tasks/mutationRules"
import {sortTasksByOrderIndex} from "../../../src/utils/tasks/orderIndex"

import type {Task} from "../../../src/types/storage"
import type {MutationContext, TaskPatch} from "../../../src/utils/tasks/mutationRules"

/**
 * TC-18 · US-2 · gate-b: N/A
 * given: the pure update rule alone, with no database
 * when: each D2 transition is applied
 * then: `scheduled` is null exactly when the status is `backlog`, in every case
 *
 * NOT-YET-RUNNABLE: `planTaskUpdate` and its types are phase 1's `mutationRules.ts`, which does not
 * exist yet. This file is written now, against the frozen signature in the plan's phase 1
 * "Frozen for later phases", so it starts running the moment that file lands.
 */

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    branchId: "main",
    scheduled: {date: "2026-09-10", time: "09:00:00", timezone: "UTC"},
    estimatedTime: 0,
    spentTime: 0,
    content: "Task",
    minimized: false,
    orderIndex: 1024,
    status: "active",
    tags: [],
    milestoneId: null,
    attachments: [],
    ...overrides,
  }
}

function ctxFor(tasks: Task[]): MutationContext {
  return {tasks, milestones: [], today: "2026-09-14"}
}

function applyPatch(task: Task, patch: TaskPatch | undefined): Task {
  return patch ? {...task, ...patch} : task
}

describe("planTaskUpdate — the D2 biconditional", () => {
  it("keeps_TC-18_scheduled_null_exactly_when_status_is_backlog_across_every_D2_transition", () => {
    const cases: Array<{task: Task; updates: Partial<Task>}> = [
      {task: makeTask({id: "a", status: "active"}), updates: {status: "backlog"}},
      {task: makeTask({id: "b", status: "done"}), updates: {status: "backlog"}},
      {task: makeTask({id: "c", status: "backlog", scheduled: null}), updates: {status: "active"}},
      {task: makeTask({id: "d", status: "backlog", scheduled: null}), updates: {status: "done"}},
      {task: makeTask({id: "e", status: "backlog", scheduled: null}), updates: {status: "discarded"}},
      {
        task: makeTask({id: "f", status: "active"}),
        updates: {scheduled: {date: "2026-09-20", time: "10:00:00", timezone: "UTC"}},
      },
      {
        task: makeTask({id: "g", status: "done"}),
        updates: {scheduled: {date: "2026-09-20", time: "10:00:00", timezone: "UTC"}},
      },
      {
        task: makeTask({id: "h", status: "backlog", scheduled: null}),
        updates: {scheduled: {date: "2026-09-20", time: "10:00:00", timezone: "UTC"}},
      },
    ]

    for (const {task, updates} of cases) {
      const patches = planTaskUpdate(ctxFor([task]), task.id, updates)
      const patch = patches.find((p) => p.id === task.id)
      const after = applyPatch(task, patch)

      if (after.status === "backlog") {
        expect(after.scheduled, `task ${task.id}`).toBeNull()
      } else {
        expect(after.scheduled, `task ${task.id}`).not.toBeNull()
      }
    }
  })
})

describe("planTaskMoveByOrder across projects", () => {
  const day = {date: "2026-09-10", time: "09:00:00", timezone: "UTC"}
  const ctxOf = (tasks: Task[]): MutationContext => ({tasks, milestones: [], today: "2026-09-10"})

  function mixedDay() {
    return [
      makeTask({id: "x1", branchId: "x", orderIndex: 1000, scheduled: day}),
      makeTask({id: "y1", branchId: "y", orderIndex: 1100, scheduled: day}),
      makeTask({id: "y2", branchId: "y", orderIndex: 1200, scheduled: day}),
      makeTask({id: "x2", branchId: "x", orderIndex: 1300, scheduled: day}),
    ]
  }

  it("places_the_task_between_its_displayed_neighbours_of_another_project", () => {
    const patches = planTaskMoveByOrder(ctxOf(mixedDay()), {
      taskId: "x2",
      targetTaskId: "y2",
      position: "before",
      activeDate: day.date,
      acrossProjects: true,
    })

    expect(patches).toHaveLength(1)
    expect(patches[0].id).toBe("x2")
    expect(patches[0].orderIndex).toBeGreaterThan(1100)
    expect(patches[0].orderIndex).toBeLessThan(1200)
  })

  it("keeps_the_task_inside_its_own_project_without_the_flag", () => {
    const patches = planTaskMoveByOrder(ctxOf(mixedDay()), {taskId: "x2", targetTaskId: "y2", position: "before", activeDate: day.date})

    expect(patches[0].orderIndex).toBeGreaterThan(1200)
  })

  it("places_a_backlog_task_between_the_neighbours_of_another_project", () => {
    const backlog = (id: string, branchId: string, orderIndex: number) => makeTask({id, branchId, orderIndex, status: "backlog", scheduled: null})
    const tasks = [backlog("x1", "x", 1000), backlog("y1", "y", 1100), backlog("y2", "y", 1200), backlog("x2", "x", 1300)]

    const [patch] = planTaskMoveByOrder(ctxOf(tasks), {
      taskId: "x2",
      targetTaskId: "y2",
      position: "before",
      activeDate: day.date,
      acrossProjects: true,
    })

    expect(patch.orderIndex).toBeGreaterThan(1100)
    expect(patch.orderIndex).toBeLessThan(1200)
  })
})

describe("planTaskMoveByOrder when no integer gap fits", () => {
  const day = {date: "2026-09-10", time: "09:00:00", timezone: "UTC"}
  const ctxOf = (tasks: Task[]): MutationContext => ({tasks, milestones: [], today: "2026-09-10"})

  function orderAfter(tasks: Task[], params: Parameters<typeof planTaskMoveByOrder>[1]) {
    const patches = planTaskMoveByOrder(ctxOf(tasks), params)
    const patched = tasks.map((task) =>
      applyPatch(
        task,
        patches.find((patch) => patch.id === task.id),
      ),
    )
    return sortTasksByOrderIndex(patched).map((task) => task.id)
  }

  it("lands_between_two_neighbours_of_equal_orderIndex_from_another_project_across_projects", () => {
    const tasks = [
      makeTask({id: "x1", branchId: "x", orderIndex: 1024, scheduled: day, createdAt: "2026-01-01T00:00:01.000Z"}),
      makeTask({id: "y1", branchId: "y", orderIndex: 1024, scheduled: day, createdAt: "2026-01-01T00:00:02.000Z"}),
      makeTask({id: "x2", branchId: "x", orderIndex: 3000, scheduled: day, createdAt: "2026-01-01T00:00:03.000Z"}),
    ]

    const order = orderAfter(tasks, {taskId: "x2", targetTaskId: "y1", position: "before", activeDate: day.date, acrossProjects: true})

    expect(order).toEqual(["x1", "x2", "y1"])
  })

  it("lands_between_two_adjacent_integer_neighbours_in_a_single_project", () => {
    const tasks = [
      makeTask({id: "a", orderIndex: 10, scheduled: day}),
      makeTask({id: "b", orderIndex: 11, scheduled: day}),
      makeTask({id: "c", orderIndex: 500, scheduled: day}),
    ]

    const order = orderAfter(tasks, {taskId: "c", targetTaskId: "b", position: "before", activeDate: day.date})

    expect(order).toEqual(["a", "c", "b"])
  })

  describe("when the moved task changes status", () => {
    const backlogTask = (overrides: Partial<Task>) => makeTask({status: "backlog", scheduled: null, ...overrides})
    const dayTwin = (id: string, branchId: string, createdAt: string) =>
      makeTask({id, branchId, orderIndex: 1024, scheduled: day, createdAt: `2026-01-01T00:00:0${createdAt}.000Z`})

    it("gives_a_backlog_task_dropped_between_equal_neighbours_across_projects_its_status_scheduled_and_order", () => {
      const tasks = [dayTwin("x1", "x", "1"), dayTwin("y1", "y", "2"), backlogTask({id: "x2", branchId: "x", orderIndex: 5000})]

      const patches = planTaskMoveByOrder(ctxOf(tasks), {
        taskId: "x2",
        targetTaskId: "y1",
        position: "before",
        targetStatus: "active",
        activeDate: day.date,
        acrossProjects: true,
      })

      const moved = patches.find((patch) => patch.id === "x2")
      expect(moved).toMatchObject({status: "active", scheduled: {date: day.date}})
      expect(
        orderAfter(tasks, {taskId: "x2", targetTaskId: "y1", position: "before", targetStatus: "active", activeDate: day.date, acrossProjects: true}),
      ).toEqual(["x1", "x2", "y1"])
    })

    it("gives_a_backlog_task_dropped_between_adjacent_neighbours_in_one_project_its_status_scheduled_and_order", () => {
      const tasks = [
        makeTask({id: "a", orderIndex: 10, scheduled: day}),
        makeTask({id: "b", orderIndex: 11, scheduled: day}),
        backlogTask({id: "c", orderIndex: 500}),
      ]
      const params = {taskId: "c", targetTaskId: "b", position: "before", targetStatus: "active", activeDate: day.date}

      const moved = planTaskMoveByOrder(ctxOf(tasks), params).find((patch) => patch.id === "c")

      expect(moved).toMatchObject({status: "active", scheduled: {date: day.date}})
      expect(orderAfter(tasks, params)).toEqual(["a", "c", "b"])
    })

    it("gives_a_day_task_moved_into_a_backlog_with_no_gap_its_status_cleared_scheduling_and_order", () => {
      const tasks = [
        backlogTask({id: "a", orderIndex: 10}),
        backlogTask({id: "b", orderIndex: 11}),
        makeTask({id: "c", orderIndex: 500, scheduled: day}),
      ]
      const params = {taskId: "c", targetTaskId: "b", position: "before", targetStatus: "backlog", activeDate: day.date}

      const moved = planTaskMoveByOrder(ctxOf(tasks), params).find((patch) => patch.id === "c")

      expect(moved).toMatchObject({status: "backlog", scheduled: null})
      expect(orderAfter(tasks, params)).toEqual(["a", "c", "b"])
    })
  })
})
