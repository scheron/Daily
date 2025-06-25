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

  async migrate(newRoot: string, removeOldDir = false): Promise<void> {
    const config = await this.readConfigFile()
    const newConfigPath = fsPaths.configFile(newRoot)

    await fs.ensureDir(newRoot)

    await fs.writeJson(newConfigPath, config, {spaces: 2})

    this.configPath = newConfigPath
    if (removeOldDir) await fs.remove(this.configPath)
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
}
