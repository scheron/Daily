// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {CliError} from "@shared/errors/cli/CliError"

import {CliController} from "@cli/CliController"
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
  it("lists projects including main", async () => {
    await core.branchesService.createBranch({name: "Feature"})
    const names = (await cli.listProjects()).map((b) => b.name)
    expect(names).toEqual(expect.arrayContaining(["Main", "Feature"]))
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
