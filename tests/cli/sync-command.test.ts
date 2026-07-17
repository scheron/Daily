import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import fs from "fs-extra"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

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
})
