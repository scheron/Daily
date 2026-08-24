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

describe("resolveScopeBranchId", () => {
  let db, core, cli
  beforeEach(() => {
    db = createTestDatabase()
    core = createStorageCore(db, paths)
    cli = new CliController(core, paths)
  })
  afterEach(() => db.close())

  it("defaults to the active branch (main)", async () => {
    expect(await cli.resolveScopeBranchId({})).toBe("main")
  })
  it("returns undefined for --all", async () => {
    expect(await cli.resolveScopeBranchId({all: true})).toBeUndefined()
  })
  it("resolves a project by name", async () => {
    const b = await core.branchesService.createBranch({name: "Feature"})
    expect(await cli.resolveScopeBranchId({project: "Feature"})).toBe(b.id)
    expect(await cli.resolveScopeBranchId({project: b.id})).toBe(b.id)
  })
  it("throws PROJECT_NOT_FOUND for an unknown project", async () => {
    await expect(cli.resolveScopeBranchId({project: "nope"})).rejects.toBeInstanceOf(CliError)
  })
})
