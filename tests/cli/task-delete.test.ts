// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {CliError} from "@shared/errors/cli/CliError"
import {CliErrorCode} from "@shared/errors/cli/CliErrorCode"

import {CliController} from "@cli/CliController"
import {assertDeleteTarget} from "@cli/validate"
import {createStorageCore} from "@main/storage/createStorageCore"
import {createTestDatabase} from "../helpers/db"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {}},
}))
const paths = {
  appDataRoot: () => "/tmp/d",
  dbPath: () => "/tmp/d/db",
  assetsDir: () => "/tmp/d/a",
  remoteSyncPath: () => "/tmp/d/r",
  mutationSignalPath: () => "/tmp/d/.s",
}

describe("task removal lifecycle", () => {
  let db, core, cli
  beforeEach(() => {
    db = createTestDatabase()
    core = createStorageCore(db, paths)
    cli = new CliController(core, paths)
  })
  afterEach(() => db.close())

  describe("deleteTask", () => {
    it("moves a task to trash", async () => {
      const t = await cli.addTask({content: "Trash me"})

      const deleted = await cli.deleteTask(t.id, {})

      expect(deleted.id).toBe(t.id)
      expect(deleted.deletedAt).toBeTruthy()
      expect((await cli.listTasks({})).map((x) => x.id)).not.toContain(t.id)
      expect((await cli.listDeletedTasks({})).map((x) => x.id)).toContain(t.id)
    })

    it("resolves a unique prefix among live tasks", async () => {
      const t = await cli.addTask({content: "By prefix"})

      const deleted = await cli.deleteTask(t.id.slice(0, 4), {})

      expect(deleted.id).toBe(t.id)
    })

    it("does not find an already trashed task", async () => {
      const t = await cli.addTask({content: "Twice"})
      await cli.deleteTask(t.id, {})

      await expect(cli.deleteTask(t.id, {})).rejects.toMatchObject({code: CliErrorCode.TASK_NOT_FOUND})
    })
  })

  describe("restoreTask", () => {
    it("returns a trashed task to the live list", async () => {
      const t = await cli.addTask({content: "Bring me back"})
      await cli.deleteTask(t.id, {})

      const restored = await cli.restoreTask(t.id, {})

      expect(restored.id).toBe(t.id)
      expect(restored.deletedAt).toBeNull()
      expect((await cli.listTasks({})).map((x) => x.id)).toContain(t.id)
      expect((await cli.listDeletedTasks({})).map((x) => x.id)).not.toContain(t.id)
    })

    it("resolves a prefix among trashed tasks", async () => {
      const t = await cli.addTask({content: "Prefix restore"})
      await cli.deleteTask(t.id, {})

      const restored = await cli.restoreTask(t.id.slice(0, 4), {})

      expect(restored.id).toBe(t.id)
    })

    it("does not restore a task that is not in trash", async () => {
      const t = await cli.addTask({content: "Alive"})

      await expect(cli.restoreTask(t.id, {})).rejects.toMatchObject({code: CliErrorCode.TASK_NOT_FOUND})
    })
  })

  describe("purgeTask", () => {
    it("permanently deletes a live task", async () => {
      const t = await cli.addTask({content: "Gone forever"})

      const purged = await cli.purgeTask(t.id, {})

      expect(purged.id).toBe(t.id)
      expect((await cli.listTasks({})).map((x) => x.id)).not.toContain(t.id)
      expect((await cli.listDeletedTasks({})).map((x) => x.id)).not.toContain(t.id)
    })

    it("permanently deletes a trashed task", async () => {
      const t = await cli.addTask({content: "Trashed then purged"})
      await cli.deleteTask(t.id, {})

      const purged = await cli.purgeTask(t.id, {})

      expect(purged.id).toBe(t.id)
      expect((await cli.listDeletedTasks({})).map((x) => x.id)).not.toContain(t.id)
    })

    it("fails on an ambiguous prefix", async () => {
      await cli.addTask({content: "One"})
      await cli.addTask({content: "Two"})

      await expect(cli.purgeTask("", {})).rejects.toMatchObject({code: CliErrorCode.AMBIGUOUS_ID})
    })
  })

  describe("purgeDeletedTasks", () => {
    it("empties the trash and returns the count, keeping live tasks", async () => {
      const live = await cli.addTask({content: "Stays"})
      const a = await cli.addTask({content: "Trash A"})
      const b = await cli.addTask({content: "Trash B"})
      await cli.deleteTask(a.id, {})
      await cli.deleteTask(b.id, {})

      const count = await cli.purgeDeletedTasks({})

      expect(count).toBe(2)
      expect(await cli.listDeletedTasks({})).toEqual([])
      expect((await cli.listTasks({})).map((x) => x.id)).toContain(live.id)
    })

    it("scopes to the active project by default and spans all projects with --all", async () => {
      await core.branchesService.createBranch({name: "Feature"})
      const t = await cli.addTask({content: "Other project", project: "Feature"})
      await cli.deleteTask(t.id, {project: "Feature"})

      expect(await cli.purgeDeletedTasks({})).toBe(0)
      expect(await cli.purgeDeletedTasks({all: true})).toBe(1)
      expect(await cli.listDeletedTasks({all: true})).toEqual([])
    })
  })
})

describe("assertDeleteTarget", () => {
  it("throws INVALID_ARGUMENT when neither taskId nor --force is given", () => {
    expect(() => assertDeleteTarget(undefined, undefined)).toThrow(CliError)
    try {
      assertDeleteTarget(undefined, false)
      expect.unreachable()
    } catch (err) {
      expect(err.code).toBe(CliErrorCode.INVALID_ARGUMENT)
    }
  })

  it("passes with a taskId", () => {
    expect(() => assertDeleteTarget("abc123", undefined)).not.toThrow()
  })

  it("passes without a taskId when --force empties the trash", () => {
    expect(() => assertDeleteTarget(undefined, true)).not.toThrow()
  })
})
