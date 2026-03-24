import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {BranchModel} from "@main/storage/models/BranchModel"
import {TagModel} from "@main/storage/models/TagModel"
import {TaskModel} from "@main/storage/models/TaskModel"
import {TasksService} from "@main/storage/services/TasksService"
import {createTestDatabase} from "../../../helpers/db"

vi.mock("@main/utils/logger", () => ({
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

vi.mock("@main/config", () => ({
  APP_CONFIG: {window: {main: {width: 800, height: 600}}},
  ENV: {isDev: false},
}))

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
    tasksService = new TasksService(taskModel)
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
      const [a, b, c] = createTasksInOrder(3)

      await tasksService.moveTaskByOrder({
        taskId: c.id,
        targetTaskId: a.id,
        position: "before",
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
      const branch = new (await import("@main/storage/models/BranchModel")).BranchModel(db)
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
      const branchModel = new (await import("@main/storage/models/BranchModel")).BranchModel(db)
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
})
