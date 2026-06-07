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
