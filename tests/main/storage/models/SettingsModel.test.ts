import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {SettingsModel} from "@main/storage/models/SettingsModel"
import {createTestDatabase} from "../../../helpers/db"

vi.mock("@main/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {SETTINGS: "SETTINGS"}},
}))
vi.mock("@shared/config/windows", () => ({WINDOWS_CONFIG: {main: {width: 800, height: 600}}}))
vi.mock("@shared/config/env", () => ({ENV: {isDev: false}}))

describe("SettingsModel", () => {
  let db: any
  let settingsModel: SettingsModel

  beforeEach(() => {
    db = createTestDatabase()
    settingsModel = new SettingsModel(db)
  })
  afterEach(() => db.close())

  it("returns local sync defaults when no settings exist", () => {
    const settings = settingsModel.loadSettings()
    expect(settings.sync).toEqual({iCloud: {enabled: false}})
    expect(settings.typography.fontSize).toBe("normal")
    expect(settings.branch.activeId).toBe("main")
  })

  it("persists remote configuration locally, not in the syncable settings row", () => {
    settingsModel.saveSettings({sync: {iCloud: {enabled: true}}})
    const settings = settingsModel.loadSettings()
    expect(settings.sync).toEqual({iCloud: {enabled: true}})
    expect(JSON.parse(db.prepare("SELECT data FROM settings WHERE id = 'default'").get().data).sync).toBeUndefined()
    expect(JSON.parse(db.prepare("SELECT data FROM device_settings WHERE id = 'sync'").get().data)).toEqual(settings.sync)
  })

  it("persists typography locally, not in the syncable settings row", () => {
    settingsModel.saveSettings({typography: {fontSize: "large"}})
    const settings = settingsModel.loadSettings()

    expect(settings.typography).toEqual({fontSize: "large"})
    expect(JSON.parse(db.prepare("SELECT data FROM settings WHERE id = 'default'").get().data).typography).toBeUndefined()
    expect(JSON.parse(db.prepare("SELECT data FROM device_settings WHERE id = 'typography'").get().data)).toEqual(settings.typography)
  })

  it("falls back to normal for an invalid local typography value", () => {
    db.prepare(`INSERT INTO device_settings (id, data, updated_at) VALUES ('typography', ?, ?)`).run(
      JSON.stringify({fontSize: "huge"}),
      new Date().toISOString(),
    )

    expect(settingsModel.loadSettings().typography.fontSize).toBe("normal")
  })

  it("partial updates preserve local sync configuration", () => {
    settingsModel.saveSettings({sync: {iCloud: {enabled: true}}})
    settingsModel.saveSettings({branch: {activeId: "feature-1"}})
    const settings = settingsModel.loadSettings()
    expect(settings.sync.iCloud.enabled).toBe(true)
    expect(settings.branch.activeId).toBe("feature-1")
  })
})
