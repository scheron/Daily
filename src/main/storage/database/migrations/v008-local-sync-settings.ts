import type {Migration} from "../scripts/migrate"

export const v008: Migration = {
  version: 8,
  name: "local-sync-settings",
  up: (db) => {
    db.exec(`CREATE TABLE IF NOT EXISTS device_settings (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL);`)
    const row = db.prepare(`SELECT data, updated_at FROM settings WHERE id = 'default'`).get() as {data: string; updated_at: string} | undefined
    if (!row) return
    try {
      const parsed = JSON.parse(row.data)
      const legacy = parsed.sync ?? {}
      const localSync = {iCloud: {enabled: Boolean(legacy.enabled)}, ssh: legacy.ssh ?? null}
      delete parsed.sync
      db.prepare(`UPDATE settings SET data = ? WHERE id = 'default'`).run(JSON.stringify(parsed))
      db.prepare(`INSERT OR IGNORE INTO device_settings (id, data, updated_at) VALUES ('sync', ?, ?)`).run(JSON.stringify(localSync), row.updated_at)
    } catch {
      // Keep unreadable legacy settings untouched; SettingsModel falls back to defaults.
    }
  },
  down: `DROP TABLE IF EXISTS device_settings;`,
}
