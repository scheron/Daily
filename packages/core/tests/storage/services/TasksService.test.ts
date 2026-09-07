import {DateTime} from "luxon"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

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
      const tag = tagModel.createTag({name: "work", color: "#000"})
      const task = await tasksService.createTask(makeTask({tags: [tag]}))

      expect(task.tags).toHaveLength(1)
      expect(task.tags[0].id).toBe(tag.id)
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
      })

      const moved = await tasksService.getTask(c.id)
      expect(moved.orderIndex).toBeLessThan(a.orderIndex)
    })

    it("TC-14: reordering within the backlog leaves day tasks' order untouched", async () => {
      const dayTasks = createTasksInOrder(3)
      const dayOrdersBefore = dayTasks.map((t) => t.orderIndex)
      const a = taskModel.createTask(makeTask({content: "Back A", status: "backlog", scheduled: null, orderIndex: 1024}))
      taskModel.createTask(makeTask({content: "Back B", status: "backlog", scheduled: null, orderIndex: 2048}))
      const c = taskModel.createTask(makeTask({content: "Back C", status: "backlog", scheduled: null, orderIndex: 3072}))

      await tasksService.moveTaskByOrder({taskId: c.id, targetTaskId: a.id, position: "before"})

      const backlog = await tasksService.getBacklogList({branchId: "main"})
      expect(backlog.map((t) => t.content)).toEqual(["Back C", "Back A", "Back B"])

      const dayOrdersAfter = (await tasksService.getTaskList({from: "2026-03-24", to: "2026-03-24", branchId: "main"})).map((t) => t.orderIndex)
      expect(dayOrdersAfter).toEqual(dayOrdersBefore)
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
        mode: "column",
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

  describe("partial schedules", () => {
    it("completes a date-only schedule on a backlog task instead of writing half a schedule", async () => {
      const task = await tasksService.createTask(makeTask({status: "backlog", scheduled: null}))

      const after = await tasksService.updateTask(task.id, {scheduled: {date: "2026-09-10"}})

      expect(after.status).toBe("active")
      expect(after.scheduled.date).toBe("2026-09-10")
      expect(after.scheduled.time).toBeTruthy()
      expect(after.scheduled.timezone).toBeTruthy()
    })

    it("keeps the existing time and timezone when only the date changes", async () => {
      const task = taskModel.createTask(makeTask({status: "done", scheduled: {date: "2026-09-08", time: "10:00:00", timezone: "UTC"}}))

      const after = await tasksService.updateTask(task.id, {scheduled: {date: "2026-09-10"}})

      expect(after.status).toBe("done")
      expect(after.scheduled).toEqual({date: "2026-09-10", time: "10:00:00", timezone: "UTC"})
    })
  })

  describe("order on entering a list", () => {
    it("a task sent to the backlog by a status change lands on top of it", async () => {
      taskModel.createTask(makeTask({content: "b1", status: "backlog", scheduled: null, orderIndex: 1024}))
      taskModel.createTask(makeTask({content: "b2", status: "backlog", scheduled: null, orderIndex: 2048}))
      const day = taskModel.createTask(makeTask({content: "day", orderIndex: 5000}))

      await tasksService.updateTask(day.id, {status: "backlog"})

      expect(taskModel.getBacklogList({branchId: "main"}).map((t) => t.content)).toEqual(["day", "b1", "b2"])
    })

    it("moveTaskToBacklog lands the task on top of the backlog too", async () => {
      taskModel.createTask(makeTask({content: "b1", status: "backlog", scheduled: null, orderIndex: 1024}))
      const day = taskModel.createTask(makeTask({content: "day", orderIndex: 5000}))

      await tasksService.moveTaskToBacklog(day.id)

      expect(taskModel.getBacklogList({branchId: "main"}).map((t) => t.content)).toEqual(["day", "b1"])
    })

    it("a deleted task lands on top of the trash, so the newest deletion reads first", async () => {
      const t1 = taskModel.createTask(makeTask({content: "t1", orderIndex: 1024}))
      const t2 = taskModel.createTask(makeTask({content: "t2", orderIndex: 2048}))
      const t3 = taskModel.createTask(makeTask({content: "t3", orderIndex: 3072}))

      await tasksService.deleteTask(t3.id)
      await tasksService.deleteTask(t1.id)
      await tasksService.deleteTask(t2.id)

      expect((await tasksService.getDeletedTasks()).map((t) => t.content)).toEqual(["t2", "t1", "t3"])
    })

    it("a card dropped into the middle of the trash keeps the position it was dropped at", async () => {
      const t1 = taskModel.createTask(makeTask({content: "t1", orderIndex: 1024}))
      const t2 = taskModel.createTask(makeTask({content: "t2", orderIndex: 2048}))
      const t3 = taskModel.createTask(makeTask({content: "t3", orderIndex: 3072}))

      await tasksService.deleteTask(t1.id)
      await tasksService.deleteTask(t2.id)
      await tasksService.deleteTask(t3.id)

      await tasksService.moveTaskInTrash(t3.id, t1.id, "before")

      expect((await tasksService.getDeletedTasks()).map((t) => t.content)).toEqual(["t2", "t3", "t1"])
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

    it("lands a restored task on the active day, keeping its time and timezone", async () => {
      const task = taskModel.createTask(makeTask({scheduled: {date: "2026-09-09", time: "10:00:00", timezone: "UTC"}}))
      taskModel.deleteTask(task.id)

      const restored = await tasksService.restoreTask(task.id, "2026-09-05")

      expect(restored.deletedAt).toBeNull()
      expect(restored.scheduled).toEqual({date: "2026-09-05", time: "10:00:00", timezone: "UTC"})
    })

    it("leaves a restored backlog task in the backlog", async () => {
      const task = taskModel.createTask(makeTask({status: "backlog", scheduled: null}))
      taskModel.deleteTask(task.id)

      const restored = await tasksService.restoreTask(task.id, "2026-09-05")

      expect(restored.status).toBe("backlog")
      expect(restored.scheduled).toBeNull()
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
      const tag = tagModel.createTag({name: "urgent", color: "#f00"})
      const task = taskModel.createTask(makeTask())

      const updated = await tasksService.addTaskTags(task.id, [tag.id])

      expect(updated.tags.map((t) => t.id)).toContain(tag.id)
    })

    it("removes specific tags from a task", async () => {
      const tag = tagModel.createTag({name: "temp", color: "#00f"})
      const task = taskModel.createTask(makeTask({tags: [tag.id]}))

      const updated = await tasksService.removeTaskTags(task.id, [tag.id])

      expect(updated.tags).toHaveLength(0)
    })
  })

  describe("backlog", () => {
    it("TC-9: moveTaskToBacklog clears the schedule but keeps tags, attachments, estimate and spent time", async () => {
      const tag = tagModel.createTag({name: "work", color: "#000"})
      const task = taskModel.createTask(makeTask({tags: [tag.id], estimatedTime: 1800, spentTime: 600}))

      const moved = await tasksService.moveTaskToBacklog(task.id)

      expect(moved.scheduled).toBeNull()
      expect(moved.tags.map((t) => t.id)).toEqual([tag.id])
      expect(moved.estimatedTime).toBe(1800)
      expect(moved.spentTime).toBe(600)
    })

    it("TC-10: scheduleTask assigns a day, moving the task out of the backlog", async () => {
      const task = taskModel.createTask(makeTask({scheduled: null}))

      const scheduled = await tasksService.scheduleTask(task.id, {date: "2026-04-01", time: "09:00:00", timezone: "UTC"})

      expect(scheduled.scheduled).toEqual({date: "2026-04-01", time: "09:00:00", timezone: "UTC"})
      const backlog = await tasksService.getBacklogList({branchId: "main"})
      expect(backlog.map((t) => t.id)).not.toContain(task.id)
      const dayTasks = await tasksService.getTaskList({from: "2026-04-01", to: "2026-04-01", branchId: "main"})
      expect(dayTasks.map((t) => t.id)).toContain(task.id)
    })

    it("TC-15: closing a backlog task with a given day assigns that day and leaves the backlog", async () => {
      const task = taskModel.createTask(makeTask({scheduled: null}))

      const updated = await tasksService.updateTask(task.id, {status: "done"}, "2026-05-05")

      expect(updated.scheduled?.date).toBe("2026-05-05")
      const backlog = await tasksService.getBacklogList({branchId: "main"})
      expect(backlog.map((t) => t.id)).not.toContain(task.id)
    })

    it("TC-16: discarding a backlog task with no day given falls back to today", async () => {
      const today = DateTime.now().toISODate()
      const task = taskModel.createTask(makeTask({scheduled: null}))

      const updated = await tasksService.updateTask(task.id, {status: "discarded"})

      expect(updated.scheduled?.date).toBe(today)
    })

    it("TC-17: the backlog never keeps a task whose status left active, by any path", async () => {
      const viaUpdate = taskModel.createTask(makeTask({content: "via updateTask", scheduled: null}))
      const viaOrderMove = taskModel.createTask(makeTask({content: "via moveTaskByOrder", scheduled: null}))

      await tasksService.updateTask(viaUpdate.id, {status: "done"})
      await tasksService.moveTaskByOrder({taskId: viaOrderMove.id, targetStatus: "discarded", mode: "column"})

      const backlog = await tasksService.getBacklogList({branchId: "main"})
      expect(backlog.every((t) => t.status === "active")).toBe(true)
      expect(backlog.map((t) => t.id)).not.toContain(viaUpdate.id)
      expect(backlog.map((t) => t.id)).not.toContain(viaOrderMove.id)
    })

    it("TC-38: restoring a soft-deleted backlog task returns it to the backlog, not to a day", async () => {
      const task = taskModel.createTask(makeTask({status: "backlog", scheduled: null}))
      await tasksService.deleteTask(task.id)

      const restored = await tasksService.restoreTask(task.id)

      expect(restored.scheduled).toBeNull()
      const backlog = await tasksService.getBacklogList({branchId: "main"})
      expect(backlog.map((t) => t.id)).toContain(task.id)
    })
  })

  describe("backlog as a status", () => {
    it("TC-1: setting status to backlog nulls the schedule", async () => {
      const task = taskModel.createTask(makeTask({status: "active", scheduled: {date: "2026-03-24", time: "09:00:00", timezone: "UTC"}}))

      const updated = await tasksService.updateTask(task.id, {status: "backlog"})

      expect(updated.status).toBe("backlog")
      expect(updated.scheduled).toBeNull()
    })

    it("TC-2: setting status to active from backlog assigns the active day when given, otherwise today", async () => {
      const today = DateTime.now().toISODate()
      const withActiveDay = taskModel.createTask(makeTask({content: "With active day", status: "backlog", scheduled: null}))
      const withoutActiveDay = taskModel.createTask(makeTask({content: "Without active day", status: "backlog", scheduled: null}))

      const updatedWithDay = await tasksService.updateTask(withActiveDay.id, {status: "active"}, "2026-04-10")
      const updatedWithoutDay = await tasksService.updateTask(withoutActiveDay.id, {status: "active"})

      expect(updatedWithDay.status).toBe("active")
      expect(updatedWithDay.scheduled?.date).toBe("2026-04-10")
      expect(updatedWithoutDay.status).toBe("active")
      expect(updatedWithoutDay.scheduled?.date).toBe(today)
    })

    it("TC-3: setting status to done from backlog gives the task a schedule too", async () => {
      const task = taskModel.createTask(makeTask({status: "backlog", scheduled: null}))

      const updated = await tasksService.updateTask(task.id, {status: "done"}, "2026-05-05")

      expect(updated.status).toBe("done")
      expect(updated.scheduled).not.toBeNull()
    })

    it("TC-4: moveTaskToBacklog on a done task clears the completion status along with the day", async () => {
      const task = taskModel.createTask(makeTask({status: "done", scheduled: {date: "2026-03-24", time: "09:00:00", timezone: "UTC"}}))

      const moved = await tasksService.moveTaskToBacklog(task.id)

      expect(moved.status).toBe("backlog")
      expect(moved.scheduled).toBeNull()
    })

    it("TC-5: scheduleTask on a backlog task makes it active", async () => {
      const task = taskModel.createTask(makeTask({status: "backlog", scheduled: null}))

      const scheduled = await tasksService.scheduleTask(task.id, {date: "2026-04-01", time: "09:00:00", timezone: "UTC"})

      expect(scheduled.status).toBe("active")
      expect(scheduled.scheduled).toEqual({date: "2026-04-01", time: "09:00:00", timezone: "UTC"})
    })

    it("updateTask nulls the schedule when status and scheduled are both sent to backlog together", async () => {
      const task = taskModel.createTask(makeTask({status: "active", scheduled: {date: "2026-03-24", time: "09:00:00", timezone: "UTC"}}))

      const updated = await tasksService.updateTask(task.id, {
        status: "backlog",
        scheduled: {date: "2026-04-01", time: "09:00:00", timezone: "UTC"},
      })

      expect(updated.status).toBe("backlog")
      expect(updated.scheduled).toBeNull()
    })

    it("updateTask assigns a schedule when status leaves backlog and scheduled is explicitly null in the same call", async () => {
      const task = taskModel.createTask(makeTask({status: "backlog", scheduled: null}))

      const updated = await tasksService.updateTask(task.id, {status: "active", scheduled: null}, "2026-04-10")

      expect(updated.status).toBe("active")
      expect(updated.scheduled?.date).toBe("2026-04-10")
    })

    it("updateTask makes a backlog task active when only a schedule is sent, no status", async () => {
      const task = taskModel.createTask(makeTask({status: "backlog", scheduled: null}))

      const updated = await tasksService.updateTask(task.id, {scheduled: {date: "2026-04-10", time: "09:00:00", timezone: "UTC"}})

      expect(updated.status).toBe("active")
      expect(updated.scheduled).toEqual({date: "2026-04-10", time: "09:00:00", timezone: "UTC"})
    })

    it("TC-6: moveTaskByOrder crossing the backlog boundary applies the schedule invariant and honors the requested position", async () => {
      const dayA = taskModel.createTask(makeTask({content: "Day A", status: "active", orderIndex: 1024}))
      taskModel.createTask(makeTask({content: "Day B", status: "active", orderIndex: 2048}))
      const dayC = taskModel.createTask(makeTask({content: "Day C", status: "active", orderIndex: 3072}))
      const back1 = taskModel.createTask(makeTask({content: "Back 1", status: "backlog", scheduled: null, orderIndex: 1024}))
      const back2 = taskModel.createTask(makeTask({content: "Back 2", status: "backlog", scheduled: null, orderIndex: 2048}))
      const fromBacklog = taskModel.createTask(makeTask({content: "From backlog", status: "backlog", scheduled: null, orderIndex: 3072}))

      await tasksService.moveTaskByOrder({taskId: dayA.id, targetStatus: "backlog", targetTaskId: back2.id, position: "before"})
      await tasksService.moveTaskByOrder({taskId: fromBacklog.id, targetStatus: "active", targetTaskId: dayC.id, position: "before"})

      const movedToBacklog = await tasksService.getTask(dayA.id)
      expect(movedToBacklog.status).toBe("backlog")
      expect(movedToBacklog.scheduled).toBeNull()
      expect(movedToBacklog.orderIndex).toBeGreaterThan(back1.orderIndex)
      expect(movedToBacklog.orderIndex).toBeLessThan(back2.orderIndex)

      const movedToActive = await tasksService.getTask(fromBacklog.id)
      expect(movedToActive.status).toBe("active")
      expect(movedToActive.scheduled).not.toBeNull()
      expect(movedToActive.orderIndex).toBeLessThan(dayC.orderIndex)
    })
  })
})
