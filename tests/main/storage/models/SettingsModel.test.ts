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
    expect(settings.sync.iCloud.enabled).toBe(false)
    expect(settings.sync.ssh).toBeNull()
    expect(settings.branch.activeId).toBe("main")
  })

  it("persists remote configuration locally, not in the syncable settings row", () => {
    settingsModel.saveSettings({sync: {iCloud: {enabled: true}, ssh: {enabled: true, host: "work", dir: "/remote/daily"}}})
    const settings = settingsModel.loadSettings()
    expect(settings.sync).toEqual({iCloud: {enabled: true}, ssh: {enabled: true, host: "work", dir: "/remote/daily"}})
    expect(JSON.parse(db.prepare("SELECT data FROM settings WHERE id = 'default'").get().data).sync).toBeUndefined()
    expect(JSON.parse(db.prepare("SELECT data FROM device_settings WHERE id = 'sync'").get().data)).toEqual(settings.sync)
  })

  it("partial updates preserve local sync configuration", () => {
    settingsModel.saveSettings({sync: {iCloud: {enabled: true}, ssh: null}})
    settingsModel.saveSettings({branch: {activeId: "feature-1"}})
    const settings = settingsModel.loadSettings()
    expect(settings.sync.iCloud.enabled).toBe(true)
    expect(settings.branch.activeId).toBe("feature-1")
  })
})
