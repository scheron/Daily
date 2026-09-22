// @ts-nocheck
import {nanoid} from "nanoid"
import {afterEach, describe, expect, it, vi} from "vitest"

import {BranchModel} from "@core/storage/models/BranchModel"
import {MilestoneModel} from "@core/storage/models/MilestoneModel"
import {SettingsModel} from "@core/storage/models/SettingsModel"
import {TagModel} from "@core/storage/models/TagModel"
import {TaskCommentModel} from "@core/storage/models/TaskCommentModel"
import {TaskEventModel} from "@core/storage/models/TaskEventModel"
import {TaskModel} from "@core/storage/models/TaskModel"
import {TaskRelationModel} from "@core/storage/models/TaskRelationModel"
import {BranchesService} from "@core/storage/services/BranchesService"
import {SearchService} from "@core/storage/services/SearchService"
import {SettingsService} from "@core/storage/services/SettingsService"
import {TaskCommentsService} from "@core/storage/services/TaskCommentsService"
import {TaskEventsService} from "@core/storage/services/TaskEventsService"
import {TaskRelationsService} from "@core/storage/services/TaskRelationsService"
import {TasksService} from "@core/storage/services/TasksService"
import {StorageController} from "@core/storage/StorageController"
import {EMPTY_CHANGESET} from "@core/types/storage"
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

const paths = {
  appDataRoot: () => "/tmp/daily-comments",
  dbPath: () => "/tmp/daily-comments/db",
  assetsDir: () => "/tmp/daily-comments/assets",
  remoteSyncPath: () => "/tmp/daily-comments/remote",
}

function makeHarness() {
  const db = createTestDatabase()
  const taskModel = new TaskModel(db)
  const branchModel = new BranchModel(db)
  branchModel.ensureMainBranch()
  const tagModel = new TagModel(db)
  const milestoneModel = new MilestoneModel(db)
  const settingsService = new SettingsService(new SettingsModel(db))
  const tasksService = new TasksService(taskModel, new TaskEventsService(new TaskEventModel(db)))
  const branchesService = new BranchesService(branchModel, settingsService, taskModel, tagModel, milestoneModel, db)
  const taskCommentModel = new TaskCommentModel(db)

  const controller = new StorageController(db, paths)
  controller.tasksService = tasksService
  controller.branchesService = branchesService
  controller.taskCommentsService = new TaskCommentsService(taskCommentModel, taskModel)
  controller.taskRelationsService = new TaskRelationsService(new TaskRelationModel(db), taskModel)
  controller.searchService = new SearchService(taskModel, branchModel)

  return {db, taskModel, branchModel, taskCommentModel, controller}
}

describe("StorageController — comments", () => {
  let db

  afterEach(() => {
    db?.close()
  })

  it("writes_a_comment_reads_it_back_with_no_origin_edits_it_and_soft-deletes_it", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness

    const task = taskModel.createTask(makeTaskInput({content: "Has a thread"}))

    const created = await controller.createTaskComment(task.id, "first note")
    const comment = created.comments?.upserted?.[0]
    expect(comment).toMatchObject({taskId: task.id, branchId: "main", content: "first note", origin: null, deletedAt: null})

    expect((await controller.getTaskComments(task.id)).map((c) => c.content)).toEqual(["first note"])

    const edited = await controller.updateTaskComment(comment.id, "first note, revised")
    expect(edited.comments?.upserted?.[0]).toMatchObject({id: comment.id, content: "first note, revised"})
    expect(edited.comments.upserted[0].updatedAt >= comment.updatedAt).toBe(true)

    const removed = await controller.deleteTaskComment(comment.id)
    expect(removed.comments?.removed).toEqual([comment.id])
    expect(await controller.getTaskComments(task.id)).toEqual([])

    const row = db.prepare("SELECT deleted_at FROM task_comments WHERE id = ?").get(comment.id)
    expect(row.deleted_at).not.toBeNull()
  })

  it("keeps_a_tasks_comments_in_the_order_they_were_written", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness

    const task = taskModel.createTask(makeTaskInput())

    await controller.createTaskComment(task.id, "one")
    await controller.createTaskComment(task.id, "two")
    await controller.createTaskComment(task.id, "three")

    expect((await controller.getTaskComments(task.id)).map((c) => c.content)).toEqual(["one", "two", "three"])
  })

  it("refuses_whitespace-only_content_on_write_and_on_edit_and_trims_what_it_keeps", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness

    const task = taskModel.createTask(makeTaskInput())

    expect(await controller.createTaskComment(task.id, "   \n  ")).toEqual(EMPTY_CHANGESET)
    expect(await controller.getTaskComments(task.id)).toEqual([])

    const created = await controller.createTaskComment(task.id, "  padded  ")
    const comment = created.comments.upserted[0]
    expect(comment.content).toBe("padded")

    expect(await controller.updateTaskComment(comment.id, "  ")).toEqual(EMPTY_CHANGESET)
    expect((await controller.getTaskComments(task.id)).map((c) => c.content)).toEqual(["padded"])
  })

  it("refuses_a_comment_on_an_unknown_task_and_on_one_already_in_the_trash", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness

    expect(await controller.createTaskComment("no-such-task", "hello")).toEqual(EMPTY_CHANGESET)

    const task = taskModel.createTask(makeTaskInput())
    taskModel.deleteTask(task.id)

    expect(await controller.createTaskComment(task.id, "hello")).toEqual(EMPTY_CHANGESET)
  })

  it("refuses_a_second_delete_and_an_edit_of_a_comment_already_deleted", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness

    const task = taskModel.createTask(makeTaskInput())
    const comment = (await controller.createTaskComment(task.id, "short-lived")).comments.upserted[0]

    await controller.deleteTaskComment(comment.id)

    expect(await controller.deleteTaskComment(comment.id)).toEqual(EMPTY_CHANGESET)
    expect(await controller.updateTaskComment(comment.id, "back from the dead")).toEqual(EMPTY_CHANGESET)
  })

  it("records_the_origin_its_caller_names_so_an_mcp_or_agent_comment_is_told_apart_from_a_typed_one", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness

    const task = taskModel.createTask(makeTaskInput())

    const typed = (await controller.createTaskComment(task.id, "typed in the app")).comments.upserted[0]
    const fromMcp = (await controller.createTaskComment(task.id, "through MCP", "mcp")).comments.upserted[0]
    const fromAgent = (await controller.createTaskComment(task.id, "by the agent", "agent")).comments.upserted[0]

    expect(typed.origin).toBeNull()
    expect(fromMcp.origin).toBe("mcp")
    expect(fromAgent.origin).toBe("agent")

    const reread = await controller.getTaskComments(task.id)
    expect(reread.map((c) => c.origin)).toEqual([null, "mcp", "agent"])
  })

  it("reads_an_origin_this_build_does_not_know_as_a_comment_typed_in_the_app", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness

    const task = taskModel.createTask(makeTaskInput())
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO task_comments (id, task_id, branch_id, content, origin, created_at, updated_at, deleted_at)
       VALUES ('from-the-future', ?, 'main', 'written by something newer', 'telepathy', ?, ?, NULL)`,
    ).run(task.id, now, now)

    const [comment] = await controller.getTaskComments(task.id)
    expect(comment.origin).toBeNull()
    expect(comment.content).toBe("written by something newer")
  })

  it("moves_a_tasks_comments_into_the_project_the_task_moved_to_and_names_them_in_the_changeset", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, branchModel, controller} = harness

    const project = branchModel.createBranch({name: "Other"})
    const task = taskModel.createTask(makeTaskInput())
    const comment = (await controller.createTaskComment(task.id, "travels with the task")).comments.upserted[0]
    expect(comment.branchId).toBe("main")

    const moved = await controller.moveTaskToBranch(task.id, project.id)

    expect(moved.comments?.upserted?.map((c) => c.id)).toEqual([comment.id])
    expect(moved.comments.upserted[0].branchId).toBe(project.id)
    expect((await controller.getTaskComments(task.id))[0].branchId).toBe(project.id)
  })

  it("backdates_the_comments_of_a_permanently_deleted_task_so_the_next_merge_collects_them", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness

    const task = taskModel.createTask(makeTaskInput())
    const comment = (await controller.createTaskComment(task.id, "goes with the task")).comments.upserted[0]

    await controller.deleteTask(task.id)
    await controller.permanentlyDeleteTask(task.id)

    const row = db.prepare("SELECT deleted_at FROM task_comments WHERE id = ?").get(comment.id)
    expect(row.deleted_at).toBe("1970-01-01T00:00:00.000Z")
  })
})
