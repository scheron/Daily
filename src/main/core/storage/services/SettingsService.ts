import type {Settings} from "../../../types"
import type {SettingsModel} from "../models/SettingsModel"

export class SettingsService {
  constructor(private settingsModel: SettingsModel) {}

  async loadSettings(): Promise<Settings> {
    return this.settingsModel.loadSettings()
  }

  async saveSettings(newSettings: Partial<Settings>): Promise<void> {
    await this.settingsModel.saveSettings(newSettings)
  }
}
