import {logger} from "@daily/core"

import {HOTKEY_REQUESTS} from "@shared/constants/quickTask"

import type {StorageController} from "@daily/core"
import type {QuickTaskController} from "@main/quickTask/QuickTaskController"
import type {TrayController} from "./tray"

const ITEM_ID = "quickTask"
const LABEL = "Quick task"

/**
 * Adds the "Quick task" item above "Settings…". It opens the panel through the Quick task process, shows the saved shortcut as its accelerator and is disabled while that process is down.
 * @param quickTask - the process that owns the panel
 * @param getStorage - where the saved shortcut is read from
 * @returns `refreshAccelerator` to call when settings change, `setAvailable` for the process's state
 */
export function setupTrayQuickTask(
  tray: Pick<TrayController, "addItem" | "updateItem">,
  quickTask: Pick<QuickTaskController, "request">,
  getStorage: () => StorageController | null,
) {
  tray.addItem({id: ITEM_ID, label: LABEL, enabled: false, click: openPanel}, "settings")

  return {refreshAccelerator, setAvailable}

  async function refreshAccelerator() {
    try {
      const hotkey = (await getStorage()?.loadSettings())?.quickTask.hotkey
      tray.updateItem(ITEM_ID, {accelerator: hotkey || undefined})
    } catch (error) {
      logger.error(logger.CONTEXT.APP, "Failed to read the Quick task shortcut for the tray", error)
    }
  }

  function setAvailable(isAvailable: boolean) {
    tray.updateItem(ITEM_ID, {enabled: isAvailable})
  }

  function openPanel() {
    quickTask.request(HOTKEY_REQUESTS.toggle).catch((error) => logger.error(logger.CONTEXT.APP, "Failed to open Quick task from the tray", error))
  }
}
