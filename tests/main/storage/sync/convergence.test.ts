import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {createStorageCore} from "@main/storage/createStorageCore"
import {FolderRemoteAdapter} from "@main/storage/sync/adapters/FolderRemoteAdapter"
import {SyncEngine} from "@main/storage/sync/SyncEngine"
import {createTestDatabase} from "../../../helpers/db"

import type {StorageCore} from "@main/storage/createStorageCore"
import type {Task} from "@shared/types/storage"
import type Database from "better-sqlite3"

vi.mock("@main/utils/logger", () => ({
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

type Node = {db: Database.Database; core: StorageCore; engine: SyncEngine; root: string}

describe("two-node convergence through a shared folder", () => {
  let syncDir: string
  let nodeA: Node
  let nodeB: Node

  function makeNode(name: string): Node {
    const root = mkdtempSync(join(tmpdir(), `daily-node-${name}-`))
    const paths = {
      appDataRoot: () => root,
      dbPath: () => join(root, "db.sqlite"),
      assetsDir: () => join(root, "assets"),
      remoteSyncPath: () => join(root, "unused-icloud"),
      mutationSignalPath: () => join(root, ".signal"),
    }
    const db = createTestDatabase()
    const core = createStorageCore(db, paths)
    const engine = new SyncEngine(core.localAdapter, [{id: "folder", label: "folder", adapter: new FolderRemoteAdapter(syncDir)}], {
      assetsDir: paths.assetsDir,
      onStatusChange: vi.fn(),
      onDataChanged: vi.fn(),
    })
    return {db, core, engine, root}
  }

  async function addTask(node: Node, content: string): Promise<Task> {
    const created = await node.core.tasksService.createTask({
      id: "",
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
})
