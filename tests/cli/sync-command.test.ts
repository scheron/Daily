import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import fs from "fs-extra"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {inspectSync} from "@cli/commands/sync.doctor"
import {loadCliConfig, saveCliConfig} from "@cli/config"
import {buildProgram} from "@cli/index"

vi.mock("@main/utils/logger", () => ({
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

async function runDaily(argv: string[]): Promise<void> {
  await buildProgram().parseAsync(["node", "daily", ...argv])
}

describe("daily sync commands", () => {
  let home: string
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "daily-sync-cmd-home-"))
    vi.stubEnv("HOME", home)
    vi.stubEnv("XDG_CONFIG_HOME", "")
    vi.stubEnv("XDG_DATA_HOME", "")
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
    vi.unstubAllEnvs()
    rmSync(home, {recursive: true, force: true})
  })

  it("sync enable writes the config with the default dir", async () => {
    await runDaily(["sync", "enable"])
    expect(loadCliConfig()).toEqual({sync: {dir: join(home, ".local", "share", "daily", "sync")}})
  })

  it("sync enable --dir writes the given dir", async () => {
    await runDaily(["sync", "enable", "--dir", join(home, "custom-sync")])
    expect(loadCliConfig()).toEqual({sync: {dir: join(home, "custom-sync")}})
  })

  it("sync disable removes the sync section", async () => {
    saveCliConfig({sync: {dir: join(home, "s")}})
    await runDaily(["sync", "disable"])
    expect(loadCliConfig()).toEqual({})
  })

  it("daily sync performs a one-shot sync in node mode", async () => {
    const syncDir = join(home, "sync")
    saveCliConfig({sync: {dir: syncDir}})
    await runDaily(["--no-sync", "tasks", "add", "seeded task"])

    await runDaily(["sync"])

    expect(await fs.pathExists(join(syncDir, "snapshot.json"))).toBe(true)
  })

  it("daily sync in direct mode exits with SYNC_NOT_CONFIGURED", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit called")
    }) as never)
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(runDaily(["sync"])).rejects.toThrow("exit called")
    expect(errSpy.mock.calls.flat().join("\n")).toContain("daily sync enable")
    expect(exitSpy).toHaveBeenCalledWith(2)

    exitSpy.mockRestore()
    errSpy.mockRestore()
  })

  it("sync status reports mode and snapshot info as JSON", async () => {
    const syncDir = join(home, "sync")
    saveCliConfig({sync: {dir: syncDir}})
    await runDaily(["--no-sync", "tasks", "add", "task for status"])
    await runDaily(["sync"])

    await runDaily(["sync", "status", "--json"])

    const jsonLine = logSpy.mock.calls.flat().find((line) => typeof line === "string" && line.startsWith("{"))
    const parsed = JSON.parse(jsonLine as string)
    expect(parsed.ok).toBe(true)
    expect(parsed.data.mode).toBe("node")
    expect(parsed.data.dir).toBe(syncDir)
    expect(parsed.data.snapshot).not.toBeNull()
  })

  it("sync doctor explains direct mode without a node snapshot", async () => {
    await runDaily(["sync", "doctor", "--json"])

    const parsed = readJsonOutput(logSpy)
    expect(parsed.data).toMatchObject({healthy: true, mode: "direct", snapshot: null})
  })

  it("sync doctor reports a valid node snapshot without changing it", async () => {
    const syncDir = join(home, "sync")
    const snapshotPath = join(syncDir, "snapshot.json")
    const snapshot = {
      version: 3,
      meta: {hash: "snapshot-hash", updatedAt: "2026-07-19T00:00:00.000Z"},
      docs: {branches: [], events: [], files: [], settings: null, tags: [], tasks: []},
    }
    saveCliConfig({sync: {dir: syncDir}})
    await fs.outputJson(snapshotPath, snapshot)
    const before = await fs.readFile(snapshotPath, "utf-8")

    await runDaily(["sync", "doctor", "--json"])

    expect(readJsonOutput(logSpy).data).toMatchObject({
      healthy: true,
      mode: "node",
      folder: {path: syncDir, status: "accessible"},
      snapshot: {counts: {branches: 0, files: 0, tags: 0, tasks: 0}, hash: "snapshot-hash", status: "valid", version: 3},
    })
    expect(await fs.readFile(snapshotPath, "utf-8")).toBe(before)
  })

  it("sync doctor reports invalid and newer snapshots", async () => {
    const syncDir = join(home, "sync")
    const snapshotPath = join(syncDir, "snapshot.json")
    saveCliConfig({sync: {dir: syncDir}})

    await fs.outputFile(snapshotPath, "not json")
    await expect(inspectSync()).resolves.toMatchObject({
      healthy: false,
      snapshot: {path: snapshotPath, status: "invalid-json"},
    })

    await fs.outputJson(snapshotPath, {version: 4})
    await expect(inspectSync()).resolves.toMatchObject({
      healthy: false,
      snapshot: {path: snapshotPath, status: "unsupported-version", version: 4},
    })
  })

  it("sync doctor reports a missing node folder and exits non-zero", async () => {
    const syncDir = join(home, "missing-sync")
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exit called")
    }) as never)
    saveCliConfig({sync: {dir: syncDir}})

    await expect(runDaily(["sync", "doctor", "--json"])).rejects.toThrow("exit called")

    expect(readJsonOutput(logSpy).data).toMatchObject({
      healthy: false,
      mode: "node",
      folder: {path: syncDir, status: "missing"},
      snapshot: null,
    })
    expect(await fs.pathExists(syncDir)).toBe(false)
    expect(exitSpy).toHaveBeenCalledWith(5)
    exitSpy.mockRestore()
  })
})

function readJsonOutput(logSpy: ReturnType<typeof vi.spyOn>): {data: unknown} {
  const jsonLine = logSpy.mock.calls.flat().find((line) => typeof line === "string" && line.startsWith("{"))
  return JSON.parse(jsonLine as string) as {data: unknown}
}
