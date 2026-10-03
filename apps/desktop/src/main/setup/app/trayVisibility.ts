import {logger} from "@daily/core"

import type {StorageController} from "@daily/core"
import type {TrayController} from "@main/modules/tray/TrayController"

/**
 * Shows or hides the tray icon according to the saved "Show icon in menu bar" setting.
 * A failed read leaves the icon as it is.
 * @param getStorage - where the setting is read from
 * @returns `apply` to call at startup and whenever settings change
 */
export function setupTrayVisibility(tray: Pick<TrayController, "create" | "destroy" | "isVisible">, getStorage: () => StorageController | null) {
  return {apply}

  async function apply() {
    if (await readIsVisible()) tray.create()
    else tray.destroy()
  }

  async function readIsVisible() {
    try {
      return (await getStorage()?.loadSettings())?.menuBar.isVisible ?? true
    } catch (error) {
      logger.error(logger.CONTEXT.APP, "Failed to read the menu bar setting", error)
      return tray.isVisible
    }
  }
}
