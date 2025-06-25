import fs from "fs-extra"
import {nanoid} from "nanoid"

import type {Settings} from "../../types"

import {CACHE_TTL, createCacheLoader} from "../utils/cache.js"
import {deepMerge} from "../utils/deepMerge.js"
import {fsPaths} from "../utils/fsPaths.js"

export class ConfigService {
  private configPath: string
  private configCache = createCacheLoader(async () => this.readConfigFile(), CACHE_TTL)

  constructor(private readonly rootDir: string) {
    this.configPath = fsPaths.configFile(this.rootDir)
  }

  async init(): Promise<void> {
    await this.readConfigFile()
  }

  async revalidate(): Promise<void> {
    this.configCache.clear()
  }

  async getSettings(): Promise<Settings> {
    return this.configCache.get()
  }

  async saveSettings(newSettings: Partial<Settings>): Promise<void> {
    const current = await this.getSettings()

    await this.persistConfig(deepMerge(current, newSettings))
  }

  async getConfigVersion(): Promise<string> {
    return await this.readConfigVersion()
  }

  private async persistConfig(config: Settings): Promise<void> {
    config.version = nanoid()

    await fs.writeJson(this.configPath, config, {spaces: 2})

    this.configCache.clear()
  }

  private async readConfigFile(): Promise<Settings> {
    const defaultConfig: Settings = {
      version: nanoid(),
      themes: {
        current: "github-light",
        preferred_light: "github-light",
        preferred_dark: "github-dark",
        use_system: true,
      },
      sidebar: {collapsed: false},
    }

    if (!(await fs.pathExists(this.configPath))) {
      await fs.writeJson(this.configPath, defaultConfig, {spaces: 2})
      return defaultConfig
    }

    try {
      return await fs.readJson(this.configPath)
    } catch {
      console.warn("⚠️ Invalid .config.json, recreating default structure")
      await fs.writeJson(this.configPath, defaultConfig, {spaces: 2})
      return defaultConfig
    }
  }

  private async readConfigVersion(): Promise<string> {
    return (await this.readConfigFile()).version
  }

  /* =============================== */
  /* ========== MIGRATION ========== */
  /* =============================== */

  /**
   * Copies the configuration from the current storage to the new one
   */
  async migrateToNewLocation(newRootDir: string): Promise<void> {
    const newConfigPath = fsPaths.configFile(newRootDir)

    if (await fs.pathExists(this.configPath)) {
      await fs.copy(this.configPath, newConfigPath, {overwrite: true})
      console.log(`✅ Config migrated from ${this.configPath} to ${newConfigPath}`)
    }

    this.configPath = newConfigPath
    this.configCache.clear()
  }

  /**
   * Loads the configuration from the target storage (without copying)
   */
  async loadFromLocation(newRootDir: string): Promise<void> {
    this.configPath = fsPaths.configFile(newRootDir)
    this.configCache.clear()
    console.log(`✅ Config loaded from ${this.configPath}`)
  }
}
