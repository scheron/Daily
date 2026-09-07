import {nanoid} from "nanoid"

import {deepMerge} from "@daily/std"

import {logger} from "../../utils/logger"
import {getDefaultSettings, getDefaultSyncSettings, getDefaultTypographySettings, migrateSettingsShape} from "./_rowMappers"

import type {Settings, SyncSettings, TypographySettings} from "@daily/protocol"
import type {SqliteDriver} from "../../database/SqliteDriver"

export class SettingsModel {
  constructor(private db: SqliteDriver) {}

  loadSettings(): Settings {
    const defaults = getDefaultSettings()
    const sync = this.loadSyncSettings()
    const typography = this.loadTypographySettings()
    const row = this.db.prepare(`SELECT id, version, data, created_at, updated_at FROM settings WHERE id = 'default'`).get() as any
    if (!row) return {...defaults, sync, typography}

    try {
      const parsed = migrateSettingsShape(JSON.parse(row.data))
      const {sync: _sync, typography: _typography, ...syncable} = parsed
      return {...deepMerge<Settings>(defaults, syncable), sync, typography}
    } catch {
      return {...defaults, sync, typography}
    }
  }

  saveSettings(partial: Partial<Settings>) {
    const current = this.loadSettings()
    const merged = deepMerge<Settings>(current, partial)
    merged.version = nanoid()
    const {sync, typography, ...syncable} = merged
    const now = new Date().toISOString()
    const existing = this.db.prepare(`SELECT created_at FROM settings WHERE id = 'default'`).get() as any
    const createdAt = existing?.created_at ?? now

    const save = this.db.transaction(() => {
      this.db
        .prepare(`INSERT OR REPLACE INTO settings (id, version, data, created_at, updated_at) VALUES ('default', ?, ?, ?, ?)`)
        .run(merged.version, JSON.stringify(syncable), createdAt, now)
      this.db.prepare(`INSERT OR REPLACE INTO device_settings (id, data, updated_at) VALUES ('sync', ?, ?)`).run(JSON.stringify(sync), now)
      this.db
        .prepare(`INSERT OR REPLACE INTO device_settings (id, data, updated_at) VALUES ('typography', ?, ?)`)
        .run(JSON.stringify(typography), now)
    })
    save()
    logger.storage("Updated", "SETTINGS", "default")
  }

  private loadSyncSettings(): SyncSettings {
    const row = this.db.prepare(`SELECT data FROM device_settings WHERE id = 'sync'`).get() as any
    if (!row) return getDefaultSyncSettings()
    try {
      return deepMerge<SyncSettings>(getDefaultSyncSettings(), JSON.parse(row.data))
    } catch {
      return getDefaultSyncSettings()
    }
  }

  private loadTypographySettings(): TypographySettings {
    const defaults = getDefaultTypographySettings()
    const row = this.db.prepare(`SELECT data FROM device_settings WHERE id = 'typography'`).get() as any
    if (!row) return defaults
    try {
      const typography = deepMerge<TypographySettings>(defaults, JSON.parse(row.data))
      return ["small", "normal", "large"].includes(typography.fontSize) ? typography : getDefaultTypographySettings()
    } catch {
      return getDefaultTypographySettings()
    }
  }
}
