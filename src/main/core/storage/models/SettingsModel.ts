import {nanoid} from "nanoid"

import type {Settings} from "../../../types.js"
import type {SettingsDoc} from "../types.js"

import {AsyncMutex} from "../../../utils/AsyncMutex.js"
import {deepMerge} from "../../../utils/deepMerge.js"
import {withRetryOnConflict} from "../../../utils/withRetryOnConflict.js"
import {docToSettings, docIdMap, settingsToDoc} from "./_mappers.js"

export class SettingsModel {
  private readonly mutex = new AsyncMutex()

  constructor(private db: PouchDB.Database) {}

  private getDefaultSettings(): Settings {
    return {
      version: nanoid(),
      themes: {
        current: "github-light",
        preferredLight: "github-light",
        preferredDark: "github-dark",
        useSystem: true,
      },
      sidebar: {
        collapsed: false,
      },
    }
  }

  private async getOrCreateSettingsDoc(): Promise<SettingsDoc> {
    try {
      const doc = await this.db.get<SettingsDoc>(docIdMap.settings.toDoc())
      return doc
    } catch (error: any) {
      if (error?.status !== 404) throw error

      const defaultSettings = this.getDefaultSettings()

      const now = new Date().toISOString()
      const doc = settingsToDoc(defaultSettings, now, now)

      const res = await this.db.put(doc)

      return {
        ...doc,
        _rev: res.rev,
      }
    }
  }

  async loadSettings(): Promise<Settings> {
    const doc = await this.getOrCreateSettingsDoc()

    const settings = docToSettings(doc)

    console.log("[SETTINGS] Loaded settings:", settings)
    return settings
  }

  /**
   * Performs a read-modify-write cycle taking _rev into account (prevents conflicts).
   * Uses AsyncMutex to prevent multiple concurrent writes.
   * Uses withRetryOnConflict to retry on conflicts.
   * @param partial - The partial settings to save.
   * @returns The result of the save operation.
   */
  async saveSettings(partial: Partial<Settings>): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await withRetryOnConflict("[SETTINGS]", async (attempt) => {
        const currentDoc = await this.getOrCreateSettingsDoc()
        const currentSettings = docToSettings(currentDoc)

        const merged: Settings = this.mergeSettings(currentSettings, partial)

        const now = new Date().toISOString()
        const baseDoc = settingsToDoc(merged, currentDoc.createdAt ?? now, now)

        const updatedDoc: SettingsDoc = {
          ...currentDoc,
          ...baseDoc,
          _rev: currentDoc._rev,
        }

        const res = await this.db.put(updatedDoc)
        console.log(`💾 Updated settings in PouchDB (rev=${res.rev}, attempt=${attempt + 1})`)

        return res
      })
    })
  }

  private mergeSettings(current: Settings, partial: Partial<Settings>): Settings {
    const merged = deepMerge<Settings>(current, partial)
    merged.version = nanoid()
    return merged
  }
}
