import {afterEach, describe, expect, it} from "vitest"

import {saveTaskTool} from "../src/write/saveTask"
import {makeRealWorkspace} from "./helpers/realWorkspace"

import type {Task} from "@daily/protocol"

describe("save_task — a project move combined with a reorder", () => {
  let db: {close(): void} | undefined

  afterEach(() => {
    db?.close()
  })

  function taskInput(overrides: Partial<Task> = {}): Omit<Task, "id"> {
    return {
      content: "Task",
      branchId: "main",
      status: "in_progress",
      scheduled: {date: "2026-03-24", time: "09:00", timezone: "UTC"},
      orderIndex: 10,
      milestoneId: null,
      tags: [],
      minimized: false,
      estimatedTime: 0,
      spentTime: 0,
      createdAt: "2026-03-24T00:00:00.000Z",
      updatedAt: "2026-03-24T00:00:00.000Z",
      deletedAt: null,
      ...overrides,
    }
  }

  it("moves backlog work into a new project without assigning a day", async () => {
    const {db: realDb, workStorage, ctx} = makeRealWorkspace()
    db = realDb

    const branchB = (await workStorage.createBranch({name: "B"})).branches!.upserted![0]
    await workStorage.createTask(taskInput({content: "b1", branchId: branchB.id, status: "backlog", scheduled: null, orderIndex: -5000}))
    await workStorage.createTask(taskInput({content: "b2", branchId: branchB.id, status: "backlog", scheduled: null, orderIndex: -4000}))
    const movingId = (await workStorage.createTask(taskInput({content: "mv", branchId: "main", status: "backlog", scheduled: null}))).tasks!
      .upserted![0].id

    await saveTaskTool.run({id: movingId, projectId: branchB.id}, ctx)

    const backlogB = (await workStorage.getTaskList({branchId: branchB.id, includeBacklog: true}))
      .filter((task) => task.status === "backlog")
      .sort((a, b) => a.orderIndex - b.orderIndex)

    expect(backlogB).toContainEqual(expect.objectContaining({id: movingId, status: "backlog", scheduled: null}))
  })

  it("preserves a scheduled day while moving and ordering work in a new project", async () => {
    const {db: realDb, workStorage, ctx} = makeRealWorkspace()
    db = realDb

    const branchB = (await workStorage.createBranch({name: "B"})).branches!.upserted![0]
    const alreadyThereId = (
      await workStorage.createTask(
        taskInput({content: "already-there", branchId: branchB.id, scheduled: {date: "2026-03-25", time: "09:00", timezone: "UTC"}}),
      )
    ).tasks!.upserted![0].id
    const movingId = (
      await workStorage.createTask(
        taskInput({content: "mv", branchId: "main", scheduled: {date: "2026-03-25", time: "09:00", timezone: "UTC"}, orderIndex: -1}),
      )
    ).tasks!.upserted![0].id

    await saveTaskTool.run({id: movingId, projectId: branchB.id, beforeTaskId: alreadyThereId}, ctx)

    const dayB = await workStorage.getTaskList({branchId: branchB.id, from: "2026-03-25", to: "2026-03-25"})
    const ids = dayB.map((task) => task.id)
    const moved = await workStorage.getTask(movingId)

    expect(ids).toContain(movingId)
    expect(ids).toContain(alreadyThereId)
    expect(moved?.branchId).toBe(branchB.id)
    expect(moved?.orderIndex).toBe(-1014)
  })

  it("preserves the task status when moving projects and editing content", async () => {
    const {db: realDb, workStorage, ctx} = makeRealWorkspace()
    db = realDb

    const branchB = (await workStorage.createBranch({name: "B"})).branches!.upserted![0]
    const movingId = (await workStorage.createTask(taskInput({content: "mv", branchId: "main"}))).tasks!.upserted![0].id

    await saveTaskTool.run({id: movingId, projectId: branchB.id, content: "Updated"}, ctx)

    const after = await workStorage.getTask(movingId)
    expect(after?.branchId).toBe(branchB.id)
    expect(after?.status).toBe("in_progress")
    expect(after?.content).toBe("Updated")
  })
})
