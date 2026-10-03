import type {StorageController} from "@daily/core"
import type {MainWindowSettings} from "@daily/protocol"

export async function loadSavedMainWindowState(storage: StorageController): Promise<MainWindowSettings | undefined> {
  const settings = await storage.loadSettings()
  return settings.window.main
}
