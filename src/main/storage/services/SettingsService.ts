import type {Settings} from "../../types"
import type {SettingsModel} from "../models/SettingsModel"

import {createCacheLoader} from "../../utils/cache.js"

export class SettingsService {
  private CACHE_TTL = 5 * 60_000
  private settingsLoader: ReturnType<typeof createCacheLoader<Settings>>

  constructor(private settingsModel: SettingsModel) {
    this.settingsLoader = createCacheLoader(() => this.settingsModel.loadSettings(), this.CACHE_TTL)
  }

  async loadSettings(): Promise<Settings> {
    return this.settingsLoader.get()
  }

  async saveSettings(newSettings: Partial<Settings>): Promise<void> {
    await this.settingsModel.saveSettings(newSettings)
    this.settingsLoader.clear()
  }
}
