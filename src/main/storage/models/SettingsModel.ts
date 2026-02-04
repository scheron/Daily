import {nanoid} from "nanoid"

import {deepMerge} from "@shared/utils/common/deepMerge"
import {AsyncMutex} from "@/utils/AsyncMutex"
import {createCacheLoader} from "@/utils/createCacheLoader"
import {LogContext, logger} from "@/utils/logger"
import {withRetryOnConflict} from "@/utils/withRetryOnConflict"

import {docIdMap, docToSettings, settingsToDoc} from "./_mappers"

import type {SettingsDoc} from "@/types/database"
import type {Settings} from "@shared/types/storage"

export class SettingsModel {
  private readonly mutex = new AsyncMutex()
  private CACHE_TTL = 5 * 60_000
  private settingsLoader: ReturnType<typeof createCacheLoader<Settings>>

  constructor(private db: PouchDB.Database) {
    this.settingsLoader = createCacheLoader(() => this.loadSettingsFromDB(), this.CACHE_TTL)
  }

  invalidateCache() {
    this.settingsLoader.clear()
  }

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
      sync: {
        enabled: false,
      },
      ai: {
        enabled: false,
        provider: "openai",
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
    return this.settingsLoader.get()
  }

  private async loadSettingsFromDB(): Promise<Settings> {
    const doc = await this.getOrCreateSettingsDoc()

    return docToSettings(doc)
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
        logger.storage("Updated", "settings", "default")
        logger.debug(LogContext.SETTINGS, `Settings rev: ${res.rev}, attempt: ${attempt + 1}`)
        this.settingsLoader.clear()

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
