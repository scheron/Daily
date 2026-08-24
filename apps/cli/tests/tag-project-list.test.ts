// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {createStorageCore} from "@daily/core"

import {CliController} from "../src/CliController"
import {CliError} from "../src/errors/cli/CliError"
import {createTestDatabase} from "./helpers/db"

vi.mock("@daily/core", async (importOriginal) => ({
  ...(await importOriginal()),
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {}},
}))
const paths = {
  appDataRoot: () => "/tmp/d",
  dbPath: () => "/tmp/d/db",
  assetsDir: () => "/tmp/d/a",
  remoteSyncPath: () => "/tmp/d/r",
  mutationSignalPath: () => "/tmp/d/.s",
}

describe("listTags / listProjects", () => {
  let db, core, cli
  beforeEach(() => {
    db = createTestDatabase()
    core = createStorageCore(db, paths)
    cli = new CliController(core, paths)
  })
  afterEach(() => db.close())

  it("lists tags", async () => {
    await core.tagsService.createTag({name: "work", color: "#111"})
    expect((await cli.listTags()).map((t) => t.name)).toContain("work")
  })
  it("creates an explicitly named and colored tag", async () => {
    const created = await cli.createTag("  Asana Import  ", "#4ecdc4")
    expect(created).toMatchObject({name: "Asana Import", color: "#4ECDC4"})
    expect(cli.didMutate).toBe(true)
  })

  it("updates a tag without changing its id", async () => {
    const tag = await core.tagsService.createTag({name: "old", color: "#111111"})
    const updated = await cli.updateTag(tag.id, {name: "new", color: "#4ECDC4"})
    expect(updated).toMatchObject({id: tag.id, name: "new", color: "#4ECDC4"})
  })

  it("rejects duplicate names, blank names, and invalid colors", async () => {
    await core.tagsService.createTag({name: "existing", color: "#111111"})
    await expect(cli.createTag(" Existing ", "#4ECDC4")).rejects.toBeInstanceOf(CliError)
    await expect(cli.createTag("   ", "#4ECDC4")).rejects.toBeInstanceOf(CliError)
    await expect(cli.createTag("new", "blue")).rejects.toBeInstanceOf(CliError)
  })

  it("lists projects including main", async () => {
    await core.branchesService.createBranch({name: "Feature"})
    const names = (await cli.listProjects()).map((b) => b.name)
    expect(names).toEqual(expect.arrayContaining(["Main", "Feature"]))
  })

  it("manages projects and moves tasks without changing task fields", async () => {
    const project = await cli.createProject("Work")
    const renamed = await cli.renameProject(project.id, "Client Work")
    await cli.useProject(renamed.id)
    expect(await core.branchesService.getActiveBranchId()).toBe(renamed.id)

    const task = await cli.addTask({content: "Preserve me", tags: ["tag"], estimateMinutes: 30})
    const moved = await cli.moveTaskToProject(task.id, "main", {all: true})
    expect(moved).toMatchObject({id: task.id, branchId: "main", content: task.content, estimatedTime: task.estimatedTime, tags: task.tags})

    await cli.deleteProject(renamed.id)
    expect(await core.branchesService.getActiveBranchId()).toBe("main")
  })

  it("deletes a tag by name and drops it from the list", async () => {
    await core.tagsService.createTag({name: "throwaway", color: "#111"})
    const deleted = await cli.deleteTag("throwaway")
    expect(deleted.name).toBe("throwaway")
    expect((await cli.listTags()).map((t) => t.name)).not.toContain("throwaway")
  })

  it("deletes a tag by id", async () => {
    const tag = await core.tagsService.createTag({name: "byid", color: "#222"})
    await cli.deleteTag(tag.id)
    expect((await cli.listTags()).map((t) => t.id)).not.toContain(tag.id)
  })

  it("throws TAG_NOT_FOUND for an unknown tag", async () => {
    await expect(cli.deleteTag("nope")).rejects.toBeInstanceOf(CliError)
  })
})
