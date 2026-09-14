// @ts-nocheck
import {describe, expect, it} from "vitest"

import {planTaskUpdate} from "../../../src/utils/tasks/mutationRules"

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
