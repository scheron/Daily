// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {BranchModel} from "@main/storage/models/BranchModel"
import {TagModel} from "@main/storage/models/TagModel"
import {TaskModel} from "@main/storage/models/TaskModel"
import {createTestDatabase} from "../../../helpers/db"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {TASKS: "TASKS"}},
}))

vi.mock("@main/config", () => ({
  APP_CONFIG: {window: {main: {width: 800, height: 600}}},
  ENV: {isDev: false},
}))

function makeTaskInput(overrides = {}) {
  return {
    status: "active",
    content: "Test task",
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

describe("TaskModel", () => {
  let db
  let taskModel
  let tagModel
  let branchModel

  beforeEach(() => {
    db = createTestDatabase()
    taskModel = new TaskModel(db)
    tagModel = new TagModel(db)
    branchModel = new BranchModel(db)
    branchModel.ensureMainBranch()
  })

  afterEach(() => {
    db.close()
  })

  it("creates a task and reads it back with all fields", () => {
    const task = taskModel.createTask(makeTaskInput({content: "Hello world"}))

    expect(task).not.toBeNull()
    expect(task.content).toBe("Hello world")
    expect(task.status).toBe("active")
    expect(task.id).toBeTruthy()
    expect(task.createdAt).toBeTruthy()
    expect(task.updatedAt).toBeTruthy()
    expect(task.tags).toEqual([])
    expect(task.attachments).toEqual([])
  })

  it("creates a task with tags and reads them back", () => {
    const tag = tagModel.createTag({name: "urgent", color: "#ff0000"})
    const task = taskModel.createTask(makeTaskInput({tags: [tag.id]}))

    expect(task.tags).toHaveLength(1)
    expect(task.tags[0].name).toBe("urgent")
  })

  it("filters tasks by date range", () => {
    taskModel.createTask(makeTaskInput({scheduled: {date: "2026-03-20", time: "", timezone: "UTC"}}))
    taskModel.createTask(makeTaskInput({scheduled: {date: "2026-03-24", time: "", timezone: "UTC"}}))
    taskModel.createTask(makeTaskInput({scheduled: {date: "2026-03-28", time: "", timezone: "UTC"}}))

    const tasks = taskModel.getTaskList({from: "2026-03-22", to: "2026-03-26"})

    expect(tasks).toHaveLength(1)
    expect(tasks[0].scheduled.date).toBe("2026-03-24")
  })

  it("filters tasks by branchId", () => {
    const branch = branchModel.createBranch({name: "Feature"})
    taskModel.createTask(makeTaskInput({branchId: "main"}))
    taskModel.createTask(makeTaskInput({branchId: branch.id}))

    const mainTasks = taskModel.getTaskList({branchId: "main"})
    const branchTasks = taskModel.getTaskList({branchId: branch.id})

    expect(mainTasks).toHaveLength(1)
    expect(branchTasks).toHaveLength(1)
  })

  it("updates a task and reflects changes", () => {
    const task = taskModel.createTask(makeTaskInput())
    const updated = taskModel.updateTask(task.id, {content: "Updated", status: "done"})

    expect(updated.content).toBe("Updated")
    expect(updated.status).toBe("done")
  })

  it("updates task tags by replacing them entirely", () => {
    const tag1 = tagModel.createTag({name: "a", color: "#000"})
    const tag2 = tagModel.createTag({name: "b", color: "#111"})
    const task = taskModel.createTask(makeTaskInput({tags: [tag1.id]}))

    const updated = taskModel.updateTask(task.id, {tags: [tag2.id]})

    expect(updated.tags).toHaveLength(1)
    expect(updated.tags[0].name).toBe("b")
  })

  it("soft deletes a task — excluded from normal list, included in deleted list", () => {
    const task = taskModel.createTask(makeTaskInput())

    taskModel.deleteTask(task.id)

    expect(taskModel.getTaskList()).toHaveLength(0)
    expect(taskModel.getDeletedTasks()).toHaveLength(1)
  })

  it("restores a soft-deleted task", () => {
    const task = taskModel.createTask(makeTaskInput())
    taskModel.deleteTask(task.id)

    taskModel.restoreTask(task.id)

    expect(taskModel.getTaskList()).toHaveLength(1)
    expect(taskModel.getDeletedTasks()).toHaveLength(0)
  })

  it("permanently deletes a task — excluded from both lists", () => {
    const task = taskModel.createTask(makeTaskInput())
    taskModel.deleteTask(task.id)

    taskModel.permanentlyDeleteTask(task.id)

    expect(taskModel.getTaskList({includeDeleted: true})).toHaveLength(1)
    expect(taskModel.getDeletedTasks()).toHaveLength(0)
  })

  it("deleting a tag removes it from all tasks", () => {
    const tag = tagModel.createTag({name: "temp", color: "#000"})
    const task = taskModel.createTask(makeTaskInput({tags: [tag.id]}))

    tagModel.deleteTag(tag.id)

    const reloaded = taskModel.getTask(task.id)
    expect(reloaded.tags).toHaveLength(0)
  })
  it("addTaskTags appends tags without removing existing ones", () => {
    const tag1 = tagModel.createTag({name: "a", color: "#000"})
    const tag2 = tagModel.createTag({name: "b", color: "#111"})
    const task = taskModel.createTask(makeTaskInput({tags: [tag1.id]}))

    const updated = taskModel.addTaskTags(task.id, [tag2.id])

    expect(updated.tags).toHaveLength(2)
    expect(updated.tags.map((t) => t.name).sort()).toEqual(["a", "b"])
  })

  it("removeTaskTags removes specific tags leaving others intact", () => {
    const tag1 = tagModel.createTag({name: "keep", color: "#000"})
    const tag2 = tagModel.createTag({name: "remove", color: "#111"})
    const task = taskModel.createTask(makeTaskInput({tags: [tag1.id, tag2.id]}))

    const updated = taskModel.removeTaskTags(task.id, [tag2.id])

    expect(updated.tags).toHaveLength(1)
    expect(updated.tags[0].name).toBe("keep")
  })

  it("addTaskAttachment and removeTaskAttachment work correctly", () => {
    const task = taskModel.createTask(makeTaskInput())
    const fileId = "file-001"

    db.prepare("INSERT INTO files (id, name, mime_type, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      fileId,
      "test.png",
      "image/png",
      1024,
      new Date().toISOString(),
      new Date().toISOString(),
    )

    const withAttachment = taskModel.addTaskAttachment(task.id, fileId)
    expect(withAttachment.attachments).toContain(fileId)

    const withoutAttachment = taskModel.removeTaskAttachment(task.id, fileId)
    expect(withoutAttachment.attachments).not.toContain(fileId)
  })

  it("permanentlyDeleteAllDeletedTasks removes all soft-deleted tasks", () => {
    const task1 = taskModel.createTask(makeTaskInput({content: "T1"}))
    const task2 = taskModel.createTask(makeTaskInput({content: "T2"}))
    taskModel.deleteTask(task1.id)
    taskModel.deleteTask(task2.id)

    const count = taskModel.permanentlyDeleteAllDeletedTasks()

    expect(count).toBe(2)
    expect(taskModel.getDeletedTasks()).toHaveLength(0)
  })

  it("permanentlyDeleteAllDeletedTasks scoped to branch only touches that branch", () => {
    const branch = branchModel.createBranch({name: "Other"})
    const taskMain = taskModel.createTask(makeTaskInput({branchId: "main"}))
    const taskBranch = taskModel.createTask(makeTaskInput({branchId: branch.id}))
    taskModel.deleteTask(taskMain.id)
    taskModel.deleteTask(taskBranch.id)

    taskModel.permanentlyDeleteAllDeletedTasks("main")

    expect(taskModel.getDeletedTasks({branchId: "main"})).toHaveLength(0)
    expect(taskModel.getDeletedTasks({branchId: branch.id})).toHaveLength(1)
  })

  it("getTaskList respects limit parameter", () => {
    taskModel.createTask(makeTaskInput({content: "T1", orderIndex: 1}))
    taskModel.createTask(makeTaskInput({content: "T2", orderIndex: 2}))
    taskModel.createTask(makeTaskInput({content: "T3", orderIndex: 3}))

    const tasks = taskModel.getTaskList({limit: 2})

    expect(tasks).toHaveLength(2)
  })

  it("getDeletedTasks respects limit parameter", () => {
    const t1 = taskModel.createTask(makeTaskInput({content: "T1"}))
    const t2 = taskModel.createTask(makeTaskInput({content: "T2"}))
    const t3 = taskModel.createTask(makeTaskInput({content: "T3"}))
    taskModel.deleteTask(t1.id)
    taskModel.deleteTask(t2.id)
    taskModel.deleteTask(t3.id)

    const deleted = taskModel.getDeletedTasks({limit: 2})

    expect(deleted).toHaveLength(2)
  })
})
