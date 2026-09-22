import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {basename, dirname, join} from "node:path"
import fs from "fs-extra"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {createStorageCore} from "@core/storage/createStorageCore"
import {ICloudRemoteAdapter} from "@core/storage/sync/adapters/ICloudRemoteAdapter"
import {SyncEngine} from "@core/storage/sync/SyncEngine"
import {createTestDatabase} from "../../helpers/db"

import type {StorageCore} from "@core/storage/createStorageCore"
import type {Task} from "@daily/protocol"
import type Database from "better-sqlite3"

vi.mock("../../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    lifecycle: vi.fn(),
    storage: vi.fn(),
    CONTEXT: {SYNC_ENGINE: "SYNC_ENGINE", SYNC_PULL: "SYNC_PULL", SYNC_PUSH: "SYNC_PUSH", SYNC_REMOTE: "SYNC_REMOTE", DB: "DB", STORAGE: "STORAGE"},
  },
}))

/**
 * `ICloudRemoteAdapter` reads and writes through `../../../src/utils/fileCoordinator`, whose real
 * implementation assumes a genuine iCloud-managed path. Standing a plain temp directory in for
 * iCloud (the technique `integration.test.ts` and `providerMigration.test.ts` already use) needs
 * this same mock.
 */
vi.mock("../../../src/utils/fileCoordinator", () => ({
  coordinatedRead: vi.fn(async (path: string) => {
    try {
      return await fs.readFile(path)
    } catch {
      return null
    }
  }),
  coordinatedWrite: vi.fn(async (path: string, data: Buffer) => {
    await fs.writeFile(path, data)
  }),
  getICloudStubPath: vi.fn((path: string) => join(dirname(path), `.${basename(path)}.icloud`)),
  hasICloudStub: vi.fn(async (path: string) => fs.pathExists(join(dirname(path), `.${basename(path)}.icloud`))),
  isICloudStub: vi.fn(() => false),
  requestDownload: vi.fn(),
  requestDownloadAndWait: vi.fn(async (path: string) => {
    const stubPath = join(dirname(path), `.${basename(path)}.icloud`)
    const [fileExists, stubExists] = await Promise.all([fs.pathExists(path), fs.pathExists(stubPath)])
    return fileExists && !stubExists
  }),
}))

type Node = {db: Database.Database; core: StorageCore; engine: SyncEngine; root: string; onDataChanged: ReturnType<typeof vi.fn>}

describe("two-node convergence through a shared sync directory", () => {
  let syncDir: string
  let nodeA: Node
  let nodeB: Node

  function makeNode(name: string): Node {
    const root = mkdtempSync(join(tmpdir(), `daily-node-${name}-`))
    const paths = {
      appDataRoot: () => root,
      dbPath: () => join(root, "db.sqlite"),
      assetsDir: () => join(root, "assets"),
      remoteSyncPath: () => syncDir,
    }
    const db = createTestDatabase()
    const core = createStorageCore(db, paths)
    const onDataChanged = vi.fn()
    const engine = new SyncEngine(core.localAdapter, [{id: "icloud", label: "iCloud", adapter: new ICloudRemoteAdapter(syncDir)}], {
      assetsDir: paths.assetsDir,
      onStatusChange: vi.fn(),
      onDataChanged,
    })
    return {db, core, engine, root, onDataChanged}
  }

  function setRelationUpdatedAt(node: Node, aId: string, bId: string, updatedAt: string): void {
    node.db
      .prepare(`UPDATE task_relations SET updated_at = ? WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`)
      .run(updatedAt, aId, bId, bId, aId)
  }

  async function addTask(node: Node, content: string, id = ""): Promise<Task> {
    const created = await node.core.tasksService.createTask({
      id,
      createdAt: "",
      updatedAt: "",
      deletedAt: null,
      branchId: await node.core.branchesService.getActiveBranchId(),
      scheduled: {date: "2026-07-18", time: "10:00:00", timezone: "UTC"},
      estimatedTime: 0,
      spentTime: 0,
      content,
      minimized: false,
      orderIndex: 0,
      status: "active",
      tags: [],
      attachments: [],
    })
    if (!created) throw new Error("createTask failed")
    return created
  }

  function setCommentUpdatedAt(node: Node, commentId: string, updatedAt: string): void {
    node.db.prepare("UPDATE task_comments SET updated_at = ? WHERE id = ?").run(updatedAt, commentId)
  }

  function setUpdatedAt(node: Node, taskId: string, updatedAt: string): void {
    node.db.prepare("UPDATE tasks SET updated_at = ? WHERE id = ?").run(updatedAt, taskId)
  }

  beforeEach(() => {
    syncDir = mkdtempSync(join(tmpdir(), "daily-sync-dir-"))
    nodeA = makeNode("a")
    nodeB = makeNode("b")
  })

  afterEach(() => {
    nodeA.db.close()
    nodeB.db.close()
    for (const dir of [syncDir, nodeA.root, nodeB.root]) rmSync(dir, {recursive: true, force: true})
  })

  it("a task created on node A appears on node B", async () => {
    const task = await addTask(nodeA, "from A")

    await nodeA.engine.syncOnce("push")
    await nodeB.engine.syncOnce("pull")

    const listB = await nodeB.core.tasksService.getTaskList({})
    expect(listB.map((t) => t.id)).toContain(task.id)
  })

  it("concurrent edits of one task: later updated_at wins on both nodes", async () => {
    const task = await addTask(nodeA, "original")
    await nodeA.engine.syncOnce("push")
    await nodeB.engine.syncOnce("pull")

    await nodeA.core.tasksService.updateTask(task.id, {content: "edit from A"})
    setUpdatedAt(nodeA, task.id, "2027-01-01T10:00:00.000Z")
    await nodeB.core.tasksService.updateTask(task.id, {content: "edit from B"})
    setUpdatedAt(nodeB, task.id, "2027-01-01T11:00:00.000Z")

    await nodeA.engine.syncOnce("push")
    await nodeB.engine.syncOnce("pull")
    await nodeA.engine.syncOnce("pull")

    const taskOnA = await nodeA.core.tasksService.getTask(task.id)
    const taskOnB = await nodeB.core.tasksService.getTask(task.id)
    expect(taskOnA?.content).toBe("edit from B")
    expect(taskOnB?.content).toBe("edit from B")
  })

  it("loads_TC-12_a_v4_snapshot_from_the_previous_release_with_task_schedules_intact", async () => {
    const previousReleaseSnapshot = {
      version: 4,
      docs: {
        tasks: [
          {
            id: "legacy-task",
            status: "active",
            content: "from the old release",
            minimized: false,
            order_index: 1024,
            scheduled_date: "2026-02-14",
            scheduled_time: "09:30:00",
            scheduled_timezone: "UTC",
            estimated_time: 0,
            spent_time: 0,
            branch_id: "main",
            tags: [],
            attachments: [],
            created_at: "2026-02-10T00:00:00.000Z",
            updated_at: "2026-02-10T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        tags: [],
        branches: [],
        files: [],
        events: [],
        settings: null,
      },
      meta: {updatedAt: "2026-02-10T00:00:00.000Z", hash: "legacy-hash"},
    }

    await fs.writeFile(join(syncDir, "snapshot.json"), JSON.stringify(previousReleaseSnapshot))

    await nodeB.engine.syncOnce("pull")

    const loaded = await nodeB.core.tasksService.getTask("legacy-task")
    expect(loaded).not.toBeNull()
    expect(loaded?.scheduled).toEqual({date: "2026-02-14", time: "09:30:00", timezone: "UTC"})
  })

  it("carries_TC-13_a_backlog_task_across_a_full_sync_round_trip_still_dateless_and_still_backlog", async () => {
    const now = new Date().toISOString()
    const taskId = "backlog-task"
    nodeA.db
      .prepare(
        `INSERT INTO tasks (id, status, content, minimized, order_index, scheduled_date, scheduled_time, scheduled_timezone, estimated_time, spent_time, branch_id, created_at, updated_at, deleted_at)
         VALUES (?, 'backlog', 'no day yet', 0, 1024, NULL, NULL, NULL, 0, 0, 'main', ?, ?, NULL)`,
      )
      .run(taskId, now, now)

    await nodeA.engine.syncOnce("push")
    await nodeB.engine.syncOnce("pull")

    const onB = await nodeB.core.tasksService.getTask(taskId)
    expect(onB).not.toBeNull()
    expect(onB?.status).toBe("backlog")
    expect(onB?.scheduled).toBeNull()
  })

  it("converges_TC-18_a_milestone_created_on_node_A_onto_node_B", async () => {
    const branchIdA = await nodeA.core.branchesService.getActiveBranchId()
    const milestone = await nodeA.core.milestonesService.createMilestone({
      branchId: branchIdA,
      name: "Launch",
      description: "",
      targetDate: null,
    })

    await nodeA.engine.syncOnce("push")
    await nodeB.engine.syncOnce("pull")

    const onB = await nodeB.core.milestonesService.getMilestoneList()
    expect(onB.some((m) => m.id === milestone.id)).toBe(true)
  })

  it("a soft delete on node A propagates to node B", async () => {
    const task = await addTask(nodeA, "to delete")
    await nodeA.engine.syncOnce("push")
    await nodeB.engine.syncOnce("pull")

    await nodeA.core.tasksService.deleteTask(task.id)
    await nodeA.engine.syncOnce("push")
    await nodeB.engine.syncOnce("pull")

    const listB = await nodeB.core.tasksService.getTaskList({})
    expect(listB.map((t) => t.id)).not.toContain(task.id)
    const deletedB = await nodeB.core.tasksService.getDeletedTasks()
    expect(deletedB.map((t) => t.id)).toContain(task.id)
  })

  it("carries_a_comment_written_on_node_A_onto_node_B_and_the_edit_that_follows_on_B_back_onto_A", async () => {
    const task = await addTask(nodeA, "needs a note", "task-commented")
    await nodeA.engine.syncOnce("push")
    await nodeB.engine.syncOnce("pull")

    const created = await nodeA.core.taskCommentsService.createComment(task.id, "written on A")
    if (!created) throw new Error("createComment failed")

    await nodeA.engine.syncOnce("push")
    await nodeB.engine.syncOnce("pull")

    const onBAfterFirstPull = await nodeB.core.taskCommentsService.getCommentsOfTask(task.id)
    expect(onBAfterFirstPull.map((c) => c.content)).toEqual(["written on A"])
    expect(onBAfterFirstPull[0]).toMatchObject({kind: "manual", provider: null})

    await nodeB.core.taskCommentsService.updateComment(created.id, "edited on B")
    await nodeB.engine.syncOnce("push")
    await nodeA.engine.syncOnce("pull")

    const finalA = await nodeA.core.taskCommentsService.getCommentsOfTask(task.id)
    const finalB = await nodeB.core.taskCommentsService.getCommentsOfTask(task.id)

    expect(finalA).toHaveLength(1)
    expect(finalB).toHaveLength(1)
    expect(finalA[0].content).toBe("edited on B")
    expect(finalB[0].content).toBe("edited on B")
    expect(finalA[0].id).toBe(created.id)
  })

  it("settles_concurrent_edits_of_one_comment_on_the_later_updated_at_on_both_nodes", async () => {
    const task = await addTask(nodeA, "contested", "task-contested")
    const created = await nodeA.core.taskCommentsService.createComment(task.id, "original")
    if (!created) throw new Error("createComment failed")

    await nodeA.engine.syncOnce("push")
    await nodeB.engine.syncOnce("pull")

    await nodeA.core.taskCommentsService.updateComment(created.id, "edit from A")
    setCommentUpdatedAt(nodeA, created.id, "2027-01-01T10:00:00.000Z")
    await nodeB.core.taskCommentsService.updateComment(created.id, "edit from B")
    setCommentUpdatedAt(nodeB, created.id, "2027-01-01T11:00:00.000Z")

    await nodeA.engine.syncOnce("push")
    await nodeB.engine.syncOnce("pull")
    await nodeA.engine.syncOnce("pull")

    const finalA = await nodeA.core.taskCommentsService.getCommentsOfTask(task.id)
    const finalB = await nodeB.core.taskCommentsService.getCommentsOfTask(task.id)
    expect(finalA[0].content).toBe("edit from B")
    expect(finalB[0].content).toBe("edit from B")
  })

  it("propagates_a_comments_soft_delete_and_announces_it_in_the_pulled_changeset", async () => {
    const task = await addTask(nodeA, "to be uncommented", "task-uncommented")
    const created = await nodeA.core.taskCommentsService.createComment(task.id, "delete me")
    if (!created) throw new Error("createComment failed")

    await nodeA.engine.syncOnce("push")
    await nodeB.engine.syncOnce("pull")
    expect(await nodeB.core.taskCommentsService.getCommentsOfTask(task.id)).toHaveLength(1)

    await nodeA.core.taskCommentsService.deleteComment(created.id)
    await nodeA.engine.syncOnce("push")

    nodeB.onDataChanged.mockClear()
    await nodeB.engine.syncOnce("pull")

    expect(await nodeB.core.taskCommentsService.getCommentsOfTask(task.id)).toEqual([])

    const pulledChangeset = nodeB.onDataChanged.mock.calls.at(-1)?.[0]
    expect(pulledChangeset?.comments?.upserted?.some((c: {id: string}) => c.id === created.id)).toBe(true)
  })

  it("loads_a_version-7_snapshot_from_the_previous_release_with_no_comments_key_as_an_empty_thread", async () => {
    const previousReleaseSnapshot = {
      version: 7,
      docs: {
        tasks: [
          {
            id: "task-from-v7",
            status: "active",
            content: "from the release before comments",
            minimized: false,
            order_index: 1024,
            scheduled_date: "2026-02-14",
            scheduled_time: "09:30:00",
            scheduled_timezone: "UTC",
            estimated_time: 0,
            spent_time: 0,
            branch_id: "main",
            milestone_id: null,
            tags: [],
            attachments: [],
            created_at: "2026-02-10T00:00:00.000Z",
            updated_at: "2026-02-10T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        tags: [],
        branches: [],
        milestones: [],
        relations: [],
        files: [],
        events: [],
      },
      meta: {updatedAt: "2026-02-10T00:00:00.000Z", hash: "v7-hash"},
    }

    await fs.writeFile(join(syncDir, "snapshot.json"), JSON.stringify(previousReleaseSnapshot))

    await expect(nodeB.engine.syncOnce("pull")).resolves.not.toThrow()

    expect(await nodeB.core.tasksService.getTask("task-from-v7")).not.toBeNull()
    expect(await nodeB.core.taskCommentsService.getCommentsOfTask("task-from-v7")).toEqual([])
  })

  it("keeps_a_local_comment_alive_when_the_remote_is_a_version-7_snapshot_that_cannot_carry_one", async () => {
    const task = await addTask(nodeA, "commented locally", "task-local-comment")
    const created = await nodeA.core.taskCommentsService.createComment(task.id, "only on this Mac")
    if (!created) throw new Error("createComment failed")

    const remoteWithoutComments = {
      version: 7,
      docs: {tasks: [], tags: [], branches: [], milestones: [], relations: [], files: [], events: []},
      meta: {updatedAt: "2026-02-10T00:00:00.000Z", hash: "v7-empty"},
    }
    await fs.writeFile(join(syncDir, "snapshot.json"), JSON.stringify(remoteWithoutComments))

    await nodeA.engine.syncOnce("pull")

    const stillThere = await nodeA.core.taskCommentsService.getCommentsOfTask(task.id)
    expect(stillThere.map((c) => c.content)).toEqual(["only on this Mac"])
  })

  it("converges_TC-11_two_nodes_on_one_live_relation_for_a_pair_settling_on_whichever_direction_synced_last", async () => {
    const taskX = await addTask(nodeA, "blocker X", "task-x")
    const taskY = await addTask(nodeA, "blocked Y", "task-y")
    await nodeA.engine.syncOnce("push")
    await nodeB.engine.syncOnce("pull")

    await nodeA.core.taskRelationsService.setTaskRelations(taskY.id, {blockedBy: [taskX.id], blocks: []})
    await nodeA.engine.syncOnce("push")

    nodeB.onDataChanged.mockClear()
    await nodeB.engine.syncOnce("pull")

    const relationsOnBAfterFirstPull = (await nodeB.core.taskRelationsService.getRelationList()).filter((r) => !r.deletedAt)
    expect(relationsOnBAfterFirstPull.some((r) => r.blockerId === taskX.id && r.blockedId === taskY.id)).toBe(true)

    expect(nodeB.onDataChanged).toHaveBeenCalled()
    const pulledChangeset = nodeB.onDataChanged.mock.calls.at(-1)?.[0]
    expect(pulledChangeset?.relations?.upserted?.some((r) => r.blockerId === taskX.id && r.blockedId === taskY.id)).toBe(true)

    await nodeA.core.taskRelationsService.setTaskRelations(taskY.id, {blockedBy: [taskX.id], blocks: []})
    setRelationUpdatedAt(nodeA, taskX.id, taskY.id, "2027-01-01T10:00:00.000Z")

    await nodeB.core.taskRelationsService.setTaskRelations(taskX.id, {blockedBy: [taskY.id], blocks: []})
    setRelationUpdatedAt(nodeB, taskX.id, taskY.id, "2027-01-01T11:00:00.000Z")

    await nodeA.engine.syncOnce("push")
    await nodeB.engine.syncOnce("pull")
    await nodeA.engine.syncOnce("pull")

    const finalA = (await nodeA.core.taskRelationsService.getRelationList()).filter((r) => !r.deletedAt)
    const finalB = (await nodeB.core.taskRelationsService.getRelationList()).filter((r) => !r.deletedAt)

    expect(finalA).toHaveLength(1)
    expect(finalB).toHaveLength(1)
    expect(finalA[0]).toMatchObject({blockerId: taskY.id, blockedId: taskX.id})
    expect(finalB[0]).toMatchObject({blockerId: taskY.id, blockedId: taskX.id})
  })
})
