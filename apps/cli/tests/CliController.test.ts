// @ts-nocheck
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {createStorageCore} from "@daily/core"

import {CliController} from "../src/CliController"
import {createTestDatabase} from "./helpers/db"

vi.mock("@daily/core", async (importOriginal) => ({
  ...(await importOriginal()),
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {}},
}))

const fakePaths = {
  appDataRoot: () => "/tmp/daily-test",
  dbPath: () => "/tmp/daily-test/db.sqlite",
  assetsDir: () => "/tmp/daily-test/assets",
  remoteSyncPath: () => "/tmp/daily-test/remote",
  mutationSignalPath: () => "/tmp/daily-test/.cli-signal",
}

export function makeCli() {
  const db = createTestDatabase()
  const core = createStorageCore(db, fakePaths)
  return {db, cli: new CliController(core, fakePaths), core}
}

describe("CliController", () => {
  let db, cli
  beforeEach(() => ({db, cli} = makeCli()))
  afterEach(() => db.close())

  it("constructs over a storage core", () => {
    expect(cli).toBeInstanceOf(CliController)
  })
})
