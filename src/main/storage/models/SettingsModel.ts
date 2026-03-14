import {nanoid} from "nanoid"

import {deepMerge} from "@shared/utils/common/deepMerge"
import {logger} from "@/utils/logger"

import {getDefaultSettings} from "./_rowMappers"

import type {Settings} from "@shared/types/storage"
import type Database from "better-sqlite3"

export class SettingsModel {
  constructor(private db: Database.Database) {}

  invalidateCache(): void {
    // no-op for backward compatibility
  }

  loadSettings(): Settings {
    const row = this.db
      .prepare(
        `
      SELECT id, version, data, created_at, updated_at FROM settings WHERE id = 'default'
    `,
      )
      .get() as any

    if (!row) {
      logger.debug(logger.CONTEXT.SETTINGS, "No settings found, returning defaults")
      return getDefaultSettings()
    }

    const defaults = getDefaultSettings()
    try {
      const parsed = JSON.parse(row.data)
      return deepMerge<Settings>(defaults, parsed)
    } catch {
      return defaults
    }
  }

  saveSettings(partial: Partial<Settings>): void {
    const current = this.loadSettings()
    const merged = deepMerge<Settings>(current, partial)
    merged.version = nanoid()

    const now = new Date().toISOString()

    const existing = this.db.prepare(`SELECT created_at FROM settings WHERE id = 'default'`).get() as any
    const createdAt = existing?.created_at ?? now

    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO settings (id, version, data, created_at, updated_at)
      VALUES ('default', ?, ?, ?, ?)
    `,
      )
      .run(merged.version, JSON.stringify(merged), createdAt, now)

    logger.storage("Updated", "SETTINGS", "default")
  }
}
