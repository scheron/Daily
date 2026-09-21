import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {nanoid} from "nanoid"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {groupTasksByDay} from "@daily/protocol"

import {createStorageCore} from "@core/storage/createStorageCore"
import {BranchModel} from "@core/storage/models/BranchModel"
import {TagModel} from "@core/storage/models/TagModel"
import {TaskEventModel} from "@core/storage/models/TaskEventModel"
import {TaskModel} from "@core/storage/models/TaskModel"
import {TaskEventsService} from "@core/storage/services/TaskEventsService"
import {TasksService} from "@core/storage/services/TasksService"
import {createTestDatabase} from "../../helpers/db"

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

function makeTask(overrides = {}) {
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
    tags: [],
    attachments: [],
    deletedAt: null,
    ...overrides,
  }
}

describe("TasksService", () => {
  let db, taskModel, tagModel, tasksService

  beforeEach(() => {
    db = createTestDatabase()
    taskModel = new TaskModel(db)
    tagModel = new TagModel(db)
    const branchModel = new BranchModel(db)
    branchModel.ensureMainBranch()
    tasksService = new TasksService(taskModel, new TaskEventsService(new TaskEventModel(db)))
  })

  afterEach(() => {
    db.close()
  })

  describe("createTask", () => {
    it("transforms Tag objects to tag IDs before saving", async () => {
      const tag = tagModel.createTag({name: "work", color: "#000", branchId: "main"})
      const task = await tasksService.createTask(makeTask({tags: [tag]}))

      expect(task.tags).toHaveLength(1)
      expect(task.tags[0].id).toBe(tag.id)
    })

    it("TC-7: dates a backlog task's created event by the storage core's own clock, not the process date", async () => {
      const root = mkdtempSync(join(tmpdir(), "daily-tasksservice-clock-"))
      const clockDb = createTestDatabase()

      try {
        const clock = {today: () => "2099-01-01"}
        const core = createStorageCore(
          clockDb,
          {appDataRoot: () => root, dbPath: () => join(root, "db.sqlite"), assetsDir: () => join(root, "assets"), remoteSyncPath: () => root},
          clock,
        )

        const created = await core.tasksService.createTask(makeTask({status: "backlog", scheduled: null}))
        const history = await core.tasksService.getHistoryByTask(created.id)

        expect(history).toHaveLength(1)
        expect(history[0].type).toBe("created")
        expect(history[0].eventDate).toBe("2099-01-01")
      } finally {
        clockDb.close()
        rmSync(root, {recursive: true, force: true})
      }
    })
  })

  describe("moveTaskByOrder", () => {
    function createTasksInOrder(count, overrides = {}) {
      const tasks = []
      for (let i = 0; i < count; i++) {
        tasks.push(
          taskModel.createTask(
            makeTask({
              content: `Task ${i}`,
              orderIndex: (i + 1) * 1024,
              ...overrides,
            }),
          ),
        )
      }
      return tasks
    }

    it("moves task to middle of list — gets correct orderIndex", async () => {
      const [a, b, c] = createTasksInOrder(3)

      await tasksService.moveTaskByOrder({
        taskId: a.id,
        targetTaskId: c.id,
        position: "before",
        activeDate: "2026-03-24",
      })

      const moved = await tasksService.getTask(a.id)
      expect(moved.orderIndex).toBeGreaterThan(b.orderIndex)
      expect(moved.orderIndex).toBeLessThan(c.orderIndex)
    })

    it("moves task to the end of list", async () => {
      const [a, , c] = createTasksInOrder(3)

      await tasksService.moveTaskByOrder({
        taskId: a.id,
        targetTaskId: c.id,
        position: "after",
        activeDate: "2026-03-24",
      })

      const moved = await tasksService.getTask(a.id)
      expect(moved.orderIndex).toBeGreaterThan(c.orderIndex)
    })

    it("moves task to the beginning of list", async () => {
      const [a, , c] = createTasksInOrder(3)

      await tasksService.moveTaskByOrder({
        taskId: c.id,
        targetTaskId: a.id,
        position: "before",
        activeDate: "2026-03-24",
      })

      const moved = await tasksService.getTask(c.id)
      expect(moved.orderIndex).toBeLessThan(a.orderIndex)
    })

    it("normalizes all orderIndexes when no room to insert", async () => {
      // Create tasks with consecutive orderIndexes (no room between)
      const tasks = []
      for (let i = 0; i < 3; i++) {
        tasks.push(
          taskModel.createTask(
            makeTask({
              content: `Task ${i}`,
              orderIndex: i + 1, // 1, 2, 3 — no room between
            }),
          ),
        )
      }

      // Move last to between first and second — should trigger normalization
      await tasksService.moveTaskByOrder({
        taskId: tasks[2].id,
        targetTaskId: tasks[1].id,
        position: "before",
        activeDate: "2026-03-24",
      })

      const all = await tasksService.getTaskList({
        from: "2026-03-24",
        to: "2026-03-24",
        branchId: "main",
      })

      // After normalization, tasks should have spaced-out orderIndexes
      const orders = all.map((t) => t.orderIndex)
      for (let i = 1; i < orders.length; i++) {
        expect(orders[i]).toBeGreaterThan(orders[i - 1])
      }
    })

    it("changes task status when moving in column mode", async () => {
      const task = taskModel.createTask(makeTask({status: "active"}))

      await tasksService.moveTaskByOrder({
        taskId: task.id,
        targetStatus: "done",
        activeDate: "2026-03-24",
      })

      const moved = await tasksService.getTask(task.id)
      expect(moved.status).toBe("done")
    })
  })

  describe("deleteTask", () => {
    it("soft-deletes a task — excluded from normal list", async () => {
      const task = taskModel.createTask(makeTask())

      const result = await tasksService.deleteTask(task.id)

      expect(result).toBe(true)
      const list = await tasksService.getTaskList({from: "2026-03-24", to: "2026-03-24"})
      expect(list.find((t) => t.id === task.id)).toBeUndefined()
    })
  })

  describe("getDeletedTasks", () => {
    it("returns deleted tasks", async () => {
      const task = taskModel.createTask(makeTask())
      taskModel.deleteTask(task.id)

      const deleted = await tasksService.getDeletedTasks()

      expect(deleted.some((t) => t.id === task.id)).toBe(true)
    })

    it("returns deleted tasks filtered by branchId", async () => {
      const branch = new (await import("@core/storage/models/BranchModel")).BranchModel(db)
      const b = branch.createBranch({name: "Work"})
      const task = taskModel.createTask(makeTask({branchId: b.id}))
      taskModel.deleteTask(task.id)

      const deletedMain = await tasksService.getDeletedTasks({branchId: "main"})
      const deletedBranch = await tasksService.getDeletedTasks({branchId: b.id})

      expect(deletedMain.find((t) => t.id === task.id)).toBeUndefined()
      expect(deletedBranch.find((t) => t.id === task.id)).toBeDefined()
    })
  })

  describe("restoreTask", () => {
    it("restores a soft-deleted task back to active list", async () => {
      const task = taskModel.createTask(makeTask())
      taskModel.deleteTask(task.id)

      const restored = await tasksService.restoreTask(task.id)

      expect(restored).not.toBeNull()
      expect(restored.deletedAt).toBeNull()
    })
  })

  describe("permanentlyDeleteTask", () => {
    it("permanently deletes a soft-deleted task", async () => {
      const task = taskModel.createTask(makeTask())
      taskModel.deleteTask(task.id)

      const result = await tasksService.permanentlyDeleteTask(task.id)

      expect(result).toBe(true)
      const deleted = await tasksService.getDeletedTasks()
      expect(deleted.find((t) => t.id === task.id)).toBeUndefined()
    })
  })

  describe("permanentlyDeleteAllDeletedTasks", () => {
    it("permanently deletes all soft-deleted tasks in a branch", async () => {
      const t1 = taskModel.createTask(makeTask({content: "D1"}))
      const t2 = taskModel.createTask(makeTask({content: "D2"}))
      taskModel.deleteTask(t1.id)
      taskModel.deleteTask(t2.id)

      const count = await tasksService.permanentlyDeleteAllDeletedTasks({branchId: "main"})

      expect(count).toBe(2)
    })
  })

  describe("moveTaskToBranch", () => {
    it("moves task to another branch", async () => {
      const branchModel = new (await import("@core/storage/models/BranchModel")).BranchModel(db)
      const branch = branchModel.createBranch({name: "Feature"})
      const task = taskModel.createTask(makeTask({branchId: "main"}))

      const result = await tasksService.moveTaskToBranch(task.id, branch.id)

      expect(result).toBe(true)
      const moved = await tasksService.getTask(task.id)
      expect(moved.branchId).toBe(branch.id)
    })

    it("returns false when task does not exist", async () => {
      const result = await tasksService.moveTaskToBranch("nonexistent", "main")
      expect(result).toBe(false)
    })

    it("returns true without updating when task is already in target branch", async () => {
      const task = taskModel.createTask(makeTask({branchId: "main"}))

      const result = await tasksService.moveTaskToBranch(task.id, "main")

      expect(result).toBe(true)
    })
  })

  describe("addTaskTags / removeTaskTags", () => {
    it("adds tags to a task", async () => {
      const tag = tagModel.createTag({name: "urgent", color: "#f00", branchId: "main"})
      const task = taskModel.createTask(makeTask())

      const updated = await tasksService.addTaskTags(task.id, [tag.id])

      expect(updated.tags.map((t) => t.id)).toContain(tag.id)
    })

    it("removes specific tags from a task", async () => {
      const tag = tagModel.createTag({name: "temp", color: "#00f", branchId: "main"})
      const task = taskModel.createTask(makeTask({tags: [tag.id]}))

      const updated = await tasksService.removeTaskTags(task.id, [tag.id])

      expect(updated.tags).toHaveLength(0)
    })
  })

  describe("backlog invariant", () => {
    it("excludes_TC-5_a_backlog_task_from_every_assembled_day_and_its_countActive", async () => {
      taskModel.createTask(makeTask({content: "Dated", status: "active", scheduled: {date: "2026-03-24", time: "", timezone: "UTC"}}))
      taskModel.createTask(makeTask({content: "Backlog", status: "backlog", scheduled: null}))

      const tasks = taskModel.getTaskList({from: "2000-01-01", to: "2100-01-01", branchId: "main"})
      const days = groupTasksByDay({tasks, tags: tasks.flatMap((task) => task.tags)})

      const allTasks = days.flatMap((d) => d.tasks)
      expect(allTasks.some((t) => t.content === "Backlog")).toBe(false)

      const totalCountActive = days.reduce((sum, d) => sum + d.countActive, 0)
      expect(totalCountActive).toBe(1)
    })

    it("clears_TC-6_the_schedule_and_flips_the_status_together_when_a_task_moves_to_backlog", async () => {
      const task = taskModel.createTask(makeTask({status: "active", scheduled: {date: "2026-03-24", time: "09:00:00", timezone: "UTC"}}))

      await tasksService.moveTaskByOrder({taskId: task.id, targetStatus: "backlog", activeDate: "2026-03-24"})

      const moved = await tasksService.getTask(task.id)
      expect(moved.status).toBe("backlog")
      expect(moved.scheduled).toBeNull()
    })

    it("schedules_TC-7_a_backlog_task_onto_the_shown_day_with_a_time_and_timezone_when_it_becomes_active", async () => {
      const task = taskModel.createTask(makeTask({status: "backlog", scheduled: null}))

      await tasksService.moveTaskByOrder({taskId: task.id, targetStatus: "active", activeDate: "2026-04-02"})

      const moved = await tasksService.getTask(task.id)
      expect(moved.status).toBe("active")
      expect(moved.scheduled?.date).toBe("2026-04-02")
      expect(moved.scheduled?.time).toBeTruthy()
      expect(moved.scheduled?.timezone).toBeTruthy()
    })

    it("gives_TC-8_a_backlog_task_the_shown_day_whether_it_resolves_to_done_or_discarded", async () => {
      const toDone = taskModel.createTask(makeTask({status: "backlog", scheduled: null, content: "to done"}))
      const toDiscarded = taskModel.createTask(makeTask({status: "backlog", scheduled: null, content: "to discarded"}))

      await tasksService.moveTaskByOrder({taskId: toDone.id, targetStatus: "done", activeDate: "2026-04-02"})
      await tasksService.moveTaskByOrder({taskId: toDiscarded.id, targetStatus: "discarded", activeDate: "2026-04-02"})

      const movedDone = await tasksService.getTask(toDone.id)
      const movedDiscarded = await tasksService.getTask(toDiscarded.id)

      expect(movedDone.status).toBe("done")
      expect(movedDone.scheduled?.date).toBe("2026-04-02")
      expect(movedDiscarded.status).toBe("discarded")
      expect(movedDiscarded.scheduled?.date).toBe("2026-04-02")
    })

    it("keeps_TC-9_the_invariant_through_create_update_and_move_no_matter_what_the_caller_sent", async () => {
      function expectInvariant(task) {
        if (task.status === "backlog") expect(task.scheduled).toBeNull()
        else expect(task.scheduled).not.toBeNull()
      }

      const createdBacklogWithDate = await tasksService.createTask(
        makeTask({status: "backlog", scheduled: {date: "2026-05-01", time: "09:00:00", timezone: "UTC"}}),
      )
      expect(createdBacklogWithDate.status).toBe("backlog")
      expectInvariant(createdBacklogWithDate)

      const createdActiveWithoutDate = await tasksService.createTask(makeTask({status: "active", scheduled: null}))
      expect(createdActiveWithoutDate.status).toBe("active")
      expectInvariant(createdActiveWithoutDate)

      const seeded = taskModel.createTask(makeTask({status: "active"}))
      const updatedToBacklogWithDate = (
        await tasksService.updateTask(seeded.id, {
          status: "backlog",
          scheduled: {date: "2026-05-02", time: "", timezone: "UTC"},
        })
      ).find((t) => t.id === seeded.id)
      expect(updatedToBacklogWithDate.status).toBe("backlog")
      expectInvariant(updatedToBacklogWithDate)

      const seededBacklog = taskModel.createTask(makeTask({status: "backlog", scheduled: null}))
      const updatedToActiveWithoutDate = (await tasksService.updateTask(seededBacklog.id, {status: "active", scheduled: null})).find(
        (t) => t.id === seededBacklog.id,
      )
      expect(updatedToActiveWithoutDate.status).toBe("active")
      expectInvariant(updatedToActiveWithoutDate)

      const seededForMove = taskModel.createTask(makeTask({status: "active"}))
      const movedToBacklog = (await tasksService.moveTaskByOrder({taskId: seededForMove.id, targetStatus: "backlog", activeDate: "2026-03-24"})).find(
        (t) => t.id === seededForMove.id,
      )
      expect(movedToBacklog.status).toBe("backlog")
      expectInvariant(movedToBacklog)
    })

    it("orders_TC-21_a_task_landing_in_the_backlog_by_status_change_or_creation_first", async () => {
      const existingBacklog = taskModel.createTask(makeTask({status: "backlog", scheduled: null, orderIndex: 1024}))

      const dated = taskModel.createTask(makeTask({status: "active"}))
      const movedByStatusChange = (await tasksService.updateTask(dated.id, {status: "backlog", scheduled: null})).find((t) => t.id === dated.id)
      expect(movedByStatusChange.orderIndex).toBeLessThan(existingBacklog.orderIndex)

      const created = await tasksService.createTask(makeTask({status: "backlog", scheduled: null}))
      expect(created.orderIndex).toBeLessThan(movedByStatusChange.orderIndex)
    })
  })

  describe("a backlog task given a day through updateTask", () => {
    it("gives_TC-3_a_dateless_task_a_real_time_and_timezone_and_flips_it_active_when_only_a_date_is_sent", async () => {
      const task = taskModel.createTask(makeTask({status: "backlog", scheduled: null}))

      const updated = (await tasksService.updateTask(task.id, {scheduled: {date: "2026-04-10"}})).find((t) => t.id === task.id)

      expect(updated.status).toBe("active")
      expect(updated.scheduled?.date).toBe("2026-04-10")
      expect(updated.scheduled?.time).toBeTruthy()
      expect(updated.scheduled?.timezone).toBeTruthy()
    })

    it("moves_TC-5_a_dated_tasks_day_without_touching_its_status", async () => {
      const doneTask = taskModel.createTask(makeTask({status: "done", scheduled: {date: "2026-04-01", time: "09:00:00", timezone: "UTC"}}))
      const discardedTask = taskModel.createTask(makeTask({status: "discarded", scheduled: {date: "2026-04-01", time: "09:00:00", timezone: "UTC"}}))

      const movedDone = (await tasksService.updateTask(doneTask.id, {scheduled: {date: "2026-04-15"}})).find((t) => t.id === doneTask.id)
      const movedDiscarded = (await tasksService.updateTask(discardedTask.id, {scheduled: {date: "2026-04-15"}})).find(
        (t) => t.id === discardedTask.id,
      )

      expect(movedDone.status).toBe("done")
      expect(movedDone.scheduled?.date).toBe("2026-04-15")
      expect(movedDiscarded.status).toBe("discarded")
      expect(movedDiscarded.scheduled?.date).toBe("2026-04-15")
    })
  })

  describe("a task's milestone", () => {
    function insertMilestoneRow(id: string, branchId: string, name: string) {
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO milestones (id, branch_id, name, description, target_date, order_index, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, '', NULL, 0, ?, ?, NULL)`,
      ).run(id, branchId, name, now, now)
    }

    it("sets_TC-28_a_tasks_milestoneId_through_updateTask", async () => {
      const task = taskModel.createTask(makeTask())
      insertMilestoneRow("m1", "main", "Launch")

      const updated = (await tasksService.updateTask(task.id, {milestoneId: "m1"})).find((t) => t.id === task.id)

      expect(updated.milestoneId).toBe("m1")
    })

    it("clears_TC-31_a_tasks_milestone_when_it_moves_to_another_project_leaving_everything_else_unchanged", async () => {
      const branchModel = new (await import("@core/storage/models/BranchModel")).BranchModel(db)
      const branchB = branchModel.createBranch({name: "Other"})
      insertMilestoneRow("m1", "main", "Launch")

      const task = taskModel.createTask(
        makeTask({branchId: "main", content: "keep me", status: "active", scheduled: {date: "2026-05-01", time: "09:00:00", timezone: "UTC"}}),
      )
      await tasksService.updateTask(task.id, {milestoneId: "m1"})

      const moved = await tasksService.moveTaskToBranch(task.id, branchB.id)
      expect(moved).toBe(true)

      const after = await tasksService.getTask(task.id)
      expect(after.milestoneId).toBeNull()
      expect(after.branchId).toBe(branchB.id)
      expect(after.status).toBe("active")
      expect(after.scheduled?.date).toBe("2026-05-01")
      expect(after.content).toBe("keep me")
    })

    it("refuses a milestoneId that belongs to a different project", async () => {
      const branchModel = new (await import("@core/storage/models/BranchModel")).BranchModel(db)
      const branchB = branchModel.createBranch({name: "Other"})
      insertMilestoneRow("m1", "main", "Launch")

      const task = taskModel.createTask(makeTask({branchId: branchB.id}))

      const updated = (await tasksService.updateTask(task.id, {milestoneId: "m1"})).find((t) => t.id === task.id)

      expect(updated.milestoneId).toBeNull()
    })

    it("clears a task's milestone when updateTask changes its project without naming a milestone", async () => {
      const branchModel = new (await import("@core/storage/models/BranchModel")).BranchModel(db)
      const branchB = branchModel.createBranch({name: "Other"})
      insertMilestoneRow("m1", "main", "Launch")

      const task = taskModel.createTask(makeTask({branchId: "main"}))
      await tasksService.updateTask(task.id, {milestoneId: "m1"})

      const updated = (await tasksService.updateTask(task.id, {branchId: branchB.id})).find((t) => t.id === task.id)

      expect(updated.milestoneId).toBeNull()
    })

    it("leaves_TC-24_a_tasks_status_and_schedule_untouched_when_only_its_milestone_is_updated", async () => {
      insertMilestoneRow("m1", "main", "Launch")
      const task = taskModel.createTask(makeTask({status: "active", scheduled: {date: "2026-05-01", time: "09:00:00", timezone: "UTC"}}))

      const updated = (await tasksService.updateTask(task.id, {milestoneId: "m1"})).find((t) => t.id === task.id)

      expect(updated.milestoneId).toBe("m1")
      expect(updated.status).toBe("active")
      expect(updated.scheduled?.date).toBe("2026-05-01")
      expect(updated.scheduled?.time).toBe("09:00:00")
    })
  })
})
