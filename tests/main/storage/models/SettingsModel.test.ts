import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {SettingsModel} from "@main/storage/models/SettingsModel"
import {createTestDatabase} from "../../../helpers/db"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {SETTINGS: "SETTINGS"}},
}))

vi.mock("@main/config", () => ({
  APP_CONFIG: {window: {main: {width: 800, height: 600}}},
  ENV: {isDev: false},
}))

describe("SettingsModel — mcp defaults", () => {
  let db, model

  beforeEach(() => {
    db = createTestDatabase()
    model = new SettingsModel(db)
  })

  afterEach(() => {
    db.close()
  })

  it("returns mcp defaults when no settings row exists", () => {
    const s = model.loadSettings()
    expect(s.mcp).toEqual({
      enabled: false,
      host: "127.0.0.1",
      port: 7878,
      token: "",
    })
  })

  it("preserves user mcp values across save/load", () => {
    model.saveSettings({mcp: {enabled: true, host: "0.0.0.0", port: 9090, token: "abc"}})
    const s = model.loadSettings()
    expect(s.mcp).toEqual({enabled: true, host: "0.0.0.0", port: 9090, token: "abc"})
  })

  it("partial mcp update merges with existing values", () => {
    model.saveSettings({mcp: {enabled: true, host: "127.0.0.1", port: 7878, token: "first"}})
    model.saveSettings({mcp: {token: "second"} as any})
    const s = model.loadSettings()
    expect(s.mcp.token).toBe("second")
    expect(s.mcp.enabled).toBe(true)
    expect(s.mcp.port).toBe(7878)
  })
})

describe("SettingsModel", () => {
  let db
  let settingsModel

  beforeEach(() => {
    db = createTestDatabase()
    settingsModel = new SettingsModel(db)
  })

  afterEach(() => {
    db.close()
  })

  it("returns defaults when no settings exist", () => {
    const settings = settingsModel.loadSettings()

    expect(settings.sync.enabled).toBe(false)
    expect(settings.branch.activeId).toBe("main")
    expect(settings.themes.current).toBe("github-light")
  })

  it("saves and loads settings preserving values", () => {
    settingsModel.saveSettings({sync: {enabled: true}})

    const settings = settingsModel.loadSettings()
    expect(settings.sync.enabled).toBe(true)
  })

  it("partial update does not overwrite unrelated settings", () => {
    settingsModel.saveSettings({sync: {enabled: true}})
    settingsModel.saveSettings({branch: {activeId: "feature-1"}})

    const settings = settingsModel.loadSettings()
    expect(settings.sync.enabled).toBe(true)
    expect(settings.branch.activeId).toBe("feature-1")
  })

  it("generates a new version on each save", () => {
    settingsModel.saveSettings({sync: {enabled: true}})
    const v1 = settingsModel.loadSettings().version

    settingsModel.saveSettings({sync: {enabled: false}})
    const v2 = settingsModel.loadSettings().version

    expect(v1).not.toBe(v2)
    expect(v1).toBeTruthy()
    expect(v2).toBeTruthy()
  })
})
