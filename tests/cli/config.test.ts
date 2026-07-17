import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import fs from "fs-extra"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {cliConfigPath, defaultSyncDir, loadCliConfig, resolveCliRuntime, saveCliConfig} from "@cli/config"

describe("cli config", () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "daily-cli-home-"))
    vi.stubEnv("HOME", home)
    vi.stubEnv("XDG_CONFIG_HOME", "")
    vi.stubEnv("XDG_DATA_HOME", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(home, {recursive: true, force: true})
  })

  it("resolves the config path under ~/.config by default and under XDG_CONFIG_HOME when set", () => {
    expect(cliConfigPath()).toBe(join(home, ".config", "daily", "config.json"))
    vi.stubEnv("XDG_CONFIG_HOME", join(home, "xdg-config"))
    expect(cliConfigPath()).toBe(join(home, "xdg-config", "daily", "config.json"))
  })

  it("returns an empty config when the file is missing or corrupt", () => {
    expect(loadCliConfig()).toEqual({})
    fs.ensureDirSync(join(home, ".config", "daily"))
    fs.writeFileSync(cliConfigPath(), "{broken", "utf-8")
    expect(loadCliConfig()).toEqual({})
  })

  it("round-trips a config", () => {
    saveCliConfig({sync: {dir: "/srv/daily-sync"}})
    expect(loadCliConfig()).toEqual({sync: {dir: "/srv/daily-sync"}})
  })

  it("resolves direct mode without a sync section", () => {
    const runtime = resolveCliRuntime()
    expect(runtime.mode).toBe("direct")
    expect(runtime.syncDir).toBeNull()
    expect(runtime.paths.dbPath()).toBe(join(home, "Library", "Application Support", "Daily", "db", "daily.sqlite"))
  })

  it("resolves node mode when sync.dir is set: XDG data layout + the configured sync dir", () => {
    saveCliConfig({sync: {dir: "/srv/daily-sync"}})
    const runtime = resolveCliRuntime()
    expect(runtime.mode).toBe("node")
    expect(runtime.syncDir).toBe("/srv/daily-sync")
    expect(runtime.paths.dbPath()).toBe(join(home, ".local", "share", "daily", "db", "daily.sqlite"))
    expect(runtime.paths.assetsDir()).toBe(join(home, ".local", "share", "daily", "assets"))
  })

  it("defaultSyncDir lives next to the node data dir", () => {
    expect(defaultSyncDir()).toBe(join(home, ".local", "share", "daily", "sync"))
  })
})
