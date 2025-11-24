import type {SettingsModel} from "@/storage/models/SettingsModel"
import type {Settings} from "@shared/types/storage"

export class SettingsService {
  constructor(private settingsModel: SettingsModel) {}

  async loadSettings(): Promise<Settings> {
    return this.settingsModel.loadSettings()
  }

  async saveSettings(newSettings: Partial<Settings>): Promise<void> {
    await this.settingsModel.saveSettings(newSettings)
  }
}
