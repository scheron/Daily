import {nanoid} from "nanoid"

import {MAIN_BRANCH_ID} from "@shared/constants/storage"
import {deepMerge} from "@shared/utils/common/deepMerge"
import {AsyncMutex} from "@/utils/AsyncMutex"
import {createCacheLoader} from "@/utils/createCacheLoader"
import {logger} from "@/utils/logger"
import {withRetryOnConflict} from "@/utils/withRetryOnConflict"

import {APP_CONFIG} from "@/config"
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
        glassUI: false,
      },
      sidebar: {
        collapsed: false,
      },
      sync: {
        enabled: false,
      },
      ai: null,
      branch: {
        activeId: MAIN_BRANCH_ID,
      },
      layout: {
        type: "list",
        columnsHideEmpty: false,
        columnsAutoCollapseEmpty: false,
        columnsCollapsed: {
          active: false,
          discarded: false,
          done: false,
        },
      },
      window: {
        main: {
          width: APP_CONFIG.window.main.width,
          height: APP_CONFIG.window.main.height,
          isMaximized: false,
          isFullScreen: false,
        },
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
        logger.storage("Updated", "SETTINGS", "default")
        logger.debug(logger.CONTEXT.SETTINGS, `Settings rev: ${res.rev}, attempt: ${attempt + 1}`)
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
