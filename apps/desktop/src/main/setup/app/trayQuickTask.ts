import {logger} from "@daily/core"

import {HOTKEY_REQUESTS} from "@shared/constants/quickTask"

import type {StorageController} from "@daily/core"
import type {QuickTaskController} from "@main/modules/quickTask/QuickTaskController"
import type {TrayController} from "./tray"

const ITEM_ID = "quickTask"
const LABEL = "Quick task"

/**
 * Adds the "Quick task" item above "Settings…". It opens the panel through the Quick task process, shows the saved shortcut as its accelerator,
 * is disabled while that process is down and hidden while Quick task is turned off.
 * @param quickTask - the process that owns the panel
 * @param getStorage - where the saved shortcut is read from
 * @returns `refresh` to call when settings change, `setAvailable` for the process's state
 */
export function setupTrayQuickTask(
  tray: Pick<TrayController, "addItem" | "updateItem">,
  quickTask: Pick<QuickTaskController, "request">,
  getStorage: () => StorageController | null,
) {
  tray.addItem({id: ITEM_ID, label: LABEL, enabled: false, click: openPanel}, "settings")

  return {refresh, setAvailable}

  async function refresh() {
    try {
      const settings = (await getStorage()?.loadSettings())?.quickTask
      tray.updateItem(ITEM_ID, {accelerator: settings?.hotkey || undefined, visible: settings?.isEnabled ?? true})
    } catch (error) {
      logger.error(logger.CONTEXT.APP, "Failed to read the Quick task settings for the tray", error)
    }
  }

  function setAvailable(isAvailable: boolean) {
    tray.updateItem(ITEM_ID, {enabled: isAvailable})
  }

  function openPanel() {
    quickTask.request(HOTKEY_REQUESTS.toggle).catch((error) => logger.error(logger.CONTEXT.APP, "Failed to open Quick task from the tray", error))
  }
}
