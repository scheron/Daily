// @ts-nocheck
import {nanoid} from "nanoid"
import {afterEach, describe, expect, it, vi} from "vitest"

import {toTaskRelationId} from "@daily/protocol"

import {BranchModel} from "@core/storage/models/BranchModel"
import {MilestoneModel} from "@core/storage/models/MilestoneModel"
import {SettingsModel} from "@core/storage/models/SettingsModel"
import {TagModel} from "@core/storage/models/TagModel"
import {TaskEventModel} from "@core/storage/models/TaskEventModel"
import {TaskModel} from "@core/storage/models/TaskModel"
import {TaskRelationModel} from "@core/storage/models/TaskRelationModel"
import {BranchesService} from "@core/storage/services/BranchesService"
import {SearchService} from "@core/storage/services/SearchService"
import {SettingsService} from "@core/storage/services/SettingsService"
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
  appDataRoot: () => "/tmp/daily-relations",
  dbPath: () => "/tmp/daily-relations/db",
  assetsDir: () => "/tmp/daily-relations/assets",
  remoteSyncPath: () => "/tmp/daily-relations/remote",
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
  const taskRelationModel = new TaskRelationModel(db)
  const taskRelationsService = new TaskRelationsService(taskRelationModel, taskModel)
  const searchService = new SearchService(taskModel, branchModel)

  const controller = new StorageController(db, paths)
  controller.tasksService = tasksService
  controller.branchesService = branchesService
  controller.taskRelationsService = taskRelationsService
  controller.searchService = searchService

  return {db, taskModel, branchModel, controller}
}

describe("StorageController — relations", () => {
  let db

  afterEach(() => {
    db?.close()
  })

  it("sets_TC-5_a_link_reads_it_back_unsets_it_relinks_it_and_writes_EMPTY_CHANGESET_for_a_self-link", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, controller} = harness

    const a = taskModel.createTask(makeTaskInput({content: "A"}))
    const b = taskModel.createTask(makeTaskInput({content: "B"}))
    taskModel.createTask(makeTaskInput({content: "C"}))

    const relationId = toTaskRelationId(a.id, b.id)

    const first = await controller.setTaskRelations(b.id, {blockedBy: [a.id], blocks: []})
    expect(first.relations?.upserted).toHaveLength(1)
    expect(first.relations?.upserted?.[0]).toMatchObject({id: relationId, blockerId: a.id, blockedId: b.id, deletedAt: null})
    expect((await controller.getAllTaskRelations()).map((r) => r.id)).toEqual([relationId])

    const second = await controller.setTaskRelations(b.id, {blockedBy: [], blocks: []})
    expect(second.relations?.removed).toEqual([relationId])
    expect(await controller.getAllTaskRelations()).toEqual([])

    const third = await controller.setTaskRelations(b.id, {blockedBy: [a.id], blocks: []})
    expect(third.relations?.upserted?.[0]).toMatchObject({id: relationId, blockerId: a.id, blockedId: b.id, deletedAt: null})
    expect((await controller.getAllTaskRelations()).map((r) => r.id)).toEqual([relationId])

    const fourth = await controller.setTaskRelations(b.id, {blockedBy: [b.id], blocks: []})
    expect(fourth).toEqual(EMPTY_CHANGESET)
    expect((await controller.getAllTaskRelations()).map((r) => r.id)).toEqual([relationId])
  })

  it("reads_TC-6_a_tasks_blockers_oldest-linked-first_and_what_it_blocks_leaving_out_a_cross-project_row", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, branchModel, controller} = harness

    const p = branchModel.createBranch({name: "P"})
    const q = branchModel.createBranch({name: "Q"})

    const a = taskModel.createTask(makeTaskInput({content: "A", status: "active", branchId: p.id}))
    const c = taskModel.createTask(makeTaskInput({content: "C", status: "done", branchId: p.id}))
    const b = taskModel.createTask(makeTaskInput({content: "B", branchId: p.id}))
    const d = taskModel.createTask(makeTaskInput({content: "D", branchId: p.id}))
    const f = taskModel.createTask(makeTaskInput({content: "F", branchId: q.id}))

    await controller.setTaskRelations(b.id, {blockedBy: [a.id], blocks: []})
    db.prepare("UPDATE task_relations SET created_at = ? WHERE blocker_id = ? AND blocked_id = ?").run("2026-01-01T00:00:00.000Z", a.id, b.id)

    await controller.setTaskRelations(b.id, {blockedBy: [a.id, c.id], blocks: []})
    db.prepare("UPDATE task_relations SET created_at = ? WHERE blocker_id = ? AND blocked_id = ?").run("2026-01-02T00:00:00.000Z", c.id, b.id)

    await controller.setTaskRelations(b.id, {blockedBy: [a.id, c.id], blocks: [d.id]})

    const now = new Date().toISOString()
    db.prepare("INSERT INTO task_relations (id, blocker_id, blocked_id, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)").run(
      toTaskRelationId(b.id, f.id),
      b.id,
      f.id,
      now,
      now,
    )

    const result = await controller.getTaskRelations(b.id)

    expect(result.blockedBy.map((t) => t.id)).toEqual([a.id, c.id])
    expect(result.blocks.map((t) => t.id)).toEqual([d.id])
    expect(result.blockedBy.some((t) => t.id === f.id)).toBe(false)
    expect(result.blocks.some((t) => t.id === f.id)).toBe(false)
  })

  it("removes_TC-7_a_chains_relations_as_each_link_in_it_is_deleted_moved_or_orphaned_by_a_project_delete", async () => {
    const harness = makeHarness()
    db = harness.db
    const {taskModel, branchModel, controller} = harness

    const p = branchModel.createBranch({name: "P"})
    const q = branchModel.createBranch({name: "Q"})

    const a = taskModel.createTask(makeTaskInput({content: "A", branchId: p.id}))
    const b = taskModel.createTask(makeTaskInput({content: "B", branchId: p.id}))
    const c = taskModel.createTask(makeTaskInput({content: "C", branchId: p.id}))
    const d = taskModel.createTask(makeTaskInput({content: "D", branchId: p.id}))
    const e = taskModel.createTask(makeTaskInput({content: "E", branchId: p.id}))

    await controller.setTaskRelations(b.id, {blockedBy: [a.id], blocks: []})
    await controller.setTaskRelations(c.id, {blockedBy: [b.id], blocks: []})
    await controller.setTaskRelations(d.id, {blockedBy: [c.id], blocks: []})
    await controller.setTaskRelations(e.id, {blockedBy: [d.id], blocks: []})

    const idAB = toTaskRelationId(a.id, b.id)
    const idBC = toTaskRelationId(b.id, c.id)
    const idCD = toTaskRelationId(c.id, d.id)
    const idDE = toTaskRelationId(d.id, e.id)

    const broadcasts = []
    controller.setupStorageBroadcasts({
      onStatusChange: () => {},
      onDataChange: (changeset) => broadcasts.push(changeset),
      onSettingsChange: () => {},
    })

    const deletedA = await controller.deleteTask(a.id)
    expect(deletedA.relations?.removed).toEqual([idAB])

    const restoredA = await controller.restoreTask(a.id)
    expect(restoredA.relations).toBeUndefined()
    expect((await controller.getAllTaskRelations()).some((r) => r.id === idAB)).toBe(false)

    const movedB = await controller.moveTaskToBranch(b.id, q.id)
    expect(movedB.relations?.removed).toEqual([idBC])

    const updatedC = await controller.updateTask(c.id, {branchId: q.id})
    expect(updatedC.relations?.removed).toEqual([idCD])

    const deletedP = await controller.deleteBranch(p.id)
    expect(deletedP).toBe(true)

    const lastBroadcast = broadcasts.at(-1)
    expect(lastBroadcast.relations?.removed).toEqual([idDE])

    for (const id of [idAB, idBC, idCD, idDE]) {
      const row = db.prepare("SELECT deleted_at FROM task_relations WHERE id = ?").get(id)
      expect(row.deleted_at, `relation ${id}`).not.toBeNull()
    }
  })
})
