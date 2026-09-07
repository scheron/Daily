import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {SettingsModel} from "@core/storage/models/SettingsModel"
import {LocalStorageAdapter} from "@core/storage/sync/adapters/LocalStorageAdapter"
import {buildSnapshot} from "@core/utils/sync/snapshot/buildSnapshot"
import {createTestDatabase} from "../../helpers/db"

import type {ServerSyncBinding} from "@daily/protocol"

vi.mock("../../../src/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {SETTINGS: "SETTINGS"}},
}))

vi.mock("../../../src/config/env", () => ({ENV: {isDev: false}}))
vi.mock("@daily/protocol", async (importOriginal) => ({...(await importOriginal()), WINDOWS_CONFIG: {main: {width: 800, height: 600}}}))

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
    expect(settings.sync).toEqual({iCloud: {enabled: false}, server: {enabled: false, binding: null}})
    expect(settings.typography.fontSize).toBe("normal")
    expect(settings.branch.activeId).toBe("main")
  })

  it("persists remote configuration locally, not in the syncable settings row", () => {
    settingsModel.saveSettings({sync: {iCloud: {enabled: true}}})
    const settings = settingsModel.loadSettings()
    expect(settings.sync).toEqual({iCloud: {enabled: true}, server: {enabled: false, binding: null}})
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

  it("carries_TC-2_a_server_binding_through_settings_with_no_migration_and_no_snapshot_leak", async () => {
    const predatingRow = new Date().toISOString()
    db.prepare(`INSERT INTO device_settings (id, data, updated_at) VALUES ('sync', ?, ?)`).run(
      JSON.stringify({iCloud: {enabled: true}}),
      predatingRow,
    )

    const first = settingsModel.loadSettings()
    expect(first.sync.server).toEqual({enabled: false, binding: null})
    expect(first.sync.iCloud.enabled).toBe(true)

    const binding: ServerSyncBinding = {
      baseUrl: "https://server.example:8443",
      serverId: "srv-1",
      serverName: "Home Server",
      deviceId: "dev-1",
      deviceName: "MacBook Air",
      token: "super-secret-token",
      fingerprint: "AA:BB:CC:DD:EE:FF",
      insecure: false,
      boundAt: "2026-08-10T00:00:00.000Z",
    }
    settingsModel.saveSettings({sync: {...first.sync, server: {enabled: true, binding}}})

    const second = settingsModel.loadSettings()
    expect(second.sync.server).toEqual({enabled: true, binding})

    expect(JSON.parse(db.prepare("SELECT data FROM settings WHERE id = 'default'").get().data).sync).toBeUndefined()
    expect(JSON.parse(db.prepare("SELECT data FROM device_settings WHERE id = 'sync'").get().data).server).toEqual({enabled: true, binding})

    const docs = await new LocalStorageAdapter(db).loadAllDocs()
    const snapshot = buildSnapshot(docs)
    expect(snapshot.docs.settings).not.toBeNull()
    expect(snapshot.docs.settings).not.toHaveProperty("sync")
    expect(snapshot.docs.settings).not.toHaveProperty("server")
    expect(JSON.stringify(snapshot)).not.toContain("super-secret-token")

    settingsModel.saveSettings({sync: {...second.sync, server: {enabled: false, binding: null}}})
    const cleared = settingsModel.loadSettings()
    expect(cleared.sync.server).toEqual({enabled: false, binding: null})
  })
})
