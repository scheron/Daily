import {nanoid} from "nanoid"

import {deepMerge} from "@shared/utils/common/deepMerge"
import {logger} from "@/utils/logger"

import {getDefaultLocalSyncSettings, getDefaultSettings, migrateSettingsShape} from "./_rowMappers"

import type {LocalSyncSettings, Settings} from "@shared/types/storage"
import type Database from "better-sqlite3"

export class SettingsModel {
  constructor(private db: Database.Database) {}

  loadSettings(): Settings {
    const defaults = getDefaultSettings()
    const localSync = this.loadLocalSyncSettings()
    const row = this.db.prepare(`SELECT id, version, data, created_at, updated_at FROM settings WHERE id = 'default'`).get() as any
    if (!row) return {...defaults, sync: localSync}

    try {
      const parsed = migrateSettingsShape(JSON.parse(row.data))
      const {sync: _legacySync, ...syncable} = parsed
      return {...deepMerge<Settings>(defaults, syncable), sync: localSync}
    } catch {
      return {...defaults, sync: localSync}
    }
  }

  saveSettings(partial: Partial<Settings>) {
    const current = this.loadSettings()
    const merged = deepMerge<Settings>(current, partial)
    merged.version = nanoid()
    const {sync, ...syncable} = merged
    const now = new Date().toISOString()
    const existing = this.db.prepare(`SELECT created_at FROM settings WHERE id = 'default'`).get() as any
    const createdAt = existing?.created_at ?? now

    const save = this.db.transaction(() => {
      this.db
        .prepare(`INSERT OR REPLACE INTO settings (id, version, data, created_at, updated_at) VALUES ('default', ?, ?, ?, ?)`)
        .run(merged.version, JSON.stringify(syncable), createdAt, now)
      this.db.prepare(`INSERT OR REPLACE INTO device_settings (id, data, updated_at) VALUES ('sync', ?, ?)`).run(JSON.stringify(sync), now)
    })
    save()
    logger.storage("Updated", "SETTINGS", "default")
  }

  private loadLocalSyncSettings(): LocalSyncSettings {
    const row = this.db.prepare(`SELECT data FROM device_settings WHERE id = 'sync'`).get() as any
    if (!row) return getDefaultLocalSyncSettings()
    try {
      return deepMerge<LocalSyncSettings>(getDefaultLocalSyncSettings(), JSON.parse(row.data))
    } catch {
      return getDefaultLocalSyncSettings()
    }
  }
}
