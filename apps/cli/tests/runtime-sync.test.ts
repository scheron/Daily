import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import fs from "fs-extra"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {saveCliConfig} from "../src/config"
import {withCliStorage} from "../src/runtime"

vi.mock("@daily/core", async (importOriginal) => ({
  ...(await importOriginal()),
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    storage: vi.fn(),
    lifecycle: vi.fn(),
    CONTEXT: {SYNC_ENGINE: "SYNC_ENGINE", SYNC_PULL: "SYNC_PULL", SYNC_PUSH: "SYNC_PUSH", SYNC_REMOTE: "SYNC_REMOTE", DB: "DB", STORAGE: "STORAGE"},
  },
}))

describe("sync around CLI commands (node mode)", () => {
  let home: string
  let syncDir: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "daily-runtime-home-"))
    syncDir = join(home, "sync")
    vi.stubEnv("HOME", home)
    vi.stubEnv("XDG_CONFIG_HOME", "")
    vi.stubEnv("XDG_DATA_HOME", "")
    saveCliConfig({sync: {dir: syncDir}})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(home, {recursive: true, force: true})
  })

  it("pushes the snapshot after a mutating command", async () => {
    await withCliStorage({}, async (cli) => {
      await cli.addTask({content: "from node"})
    })

    const snapshotPath = join(syncDir, "snapshot.json")
    expect(await fs.pathExists(snapshotPath)).toBe(true)
    const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf-8"))
    expect(snapshot.docs.tasks.map((t: {content: string}) => t.content)).toContain("from node")
  })

  it("pushes a task-tag mutation to the snapshot", async () => {
    let taskId = ""
    await withCliStorage({}, async (cli) => {
      const task = await cli.addTask({content: "tagged", tags: ["work"]})
      taskId = task.id
      await cli.removeTaskTag(task.id, "work", {})
    })

    const snapshot = JSON.parse(await fs.readFile(join(syncDir, "snapshot.json"), "utf-8"))
    expect(snapshot.docs.tasks.find((task: {id: string}) => task.id === taskId).tags).toEqual([])
  })

  it("does not push after a read-only command", async () => {
    await withCliStorage({}, async (cli) => {
      await cli.listTasks({})
    })
    const snapshotPath = join(syncDir, "snapshot.json")
    const bootstrapped = await fs.readFile(snapshotPath, "utf-8")

    await withCliStorage({}, async (cli) => {
      await cli.listTasks({})
    })

    expect(await fs.readFile(snapshotPath, "utf-8")).toBe(bootstrapped)
  })

  it("pulls before the command: a snapshot written by another node is visible", async () => {
    await withCliStorage({}, async (cli) => {
      await cli.addTask({content: "seeded"})
    })
    rmSync(join(home, ".local", "share", "daily"), {recursive: true, force: true})

    const seen = await withCliStorage({}, async (cli) => (await cli.listTasks({})).map((t) => t.content))
    expect(seen).toContain("seeded")
  })

  it("--no-sync (opts.sync === false) skips both directions", async () => {
    await withCliStorage({sync: false}, async (cli) => {
      await cli.addTask({content: "offline"})
    })

    expect(await fs.pathExists(join(syncDir, "snapshot.json"))).toBe(false)
  })

  it("a sync failure warns but does not fail the command", async () => {
    fs.ensureDirSync(syncDir)
    fs.writeFileSync(join(syncDir, "snapshot.json"), JSON.stringify({version: 99, docs: {}, meta: {updatedAt: "x", hash: "y"}}), "utf-8")
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      withCliStorage({}, async (cli) => {
        await cli.listTasks({})
      }),
    ).resolves.not.toThrow()

    expect(errSpy.mock.calls.flat().join("\n")).toContain("sync failed")
    errSpy.mockRestore()
  })
})
