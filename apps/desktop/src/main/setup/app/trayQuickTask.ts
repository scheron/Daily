import {logger} from "@daily/core"

import {HOTKEY_REQUESTS} from "@main/quickCaptureHelper/helperProtocol"

import type {StorageController} from "@daily/core"
import type {QuickCaptureHelper} from "@main/quickCaptureHelper/QuickCaptureHelper"
import type {TrayController} from "./tray"

const ITEM_ID = "quickTask"
const LABEL = "Quick task"

/**
 * Adds the "Quick task" item above "Settings…". It opens the panel through the helper, shows the saved shortcut as its accelerator and is disabled while the helper is down.
 * @param helper - the helper process that owns the panel
 * @param getStorage - where the saved shortcut is read from
 * @returns `refreshAccelerator` to call when settings change, `setAvailable` for the helper's state
 */
export function setupTrayQuickTask(
  tray: Pick<TrayController, "addItem" | "updateItem">,
  helper: Pick<QuickCaptureHelper, "request">,
  getStorage: () => StorageController | null,
) {
  tray.addItem({id: ITEM_ID, label: LABEL, enabled: false, click: openPanel}, "settings")

  return {refreshAccelerator, setAvailable}

  async function refreshAccelerator() {
    try {
      const hotkey = (await getStorage()?.loadSettings())?.quickCapture.hotkey
      tray.updateItem(ITEM_ID, {accelerator: hotkey || undefined})
    } catch (error) {
      logger.error(logger.CONTEXT.APP, "Failed to read the Quick Capture shortcut for the tray", error)
    }
  }

  function setAvailable(isAvailable: boolean) {
    tray.updateItem(ITEM_ID, {enabled: isAvailable})
  }

  function openPanel() {
    helper.request(HOTKEY_REQUESTS.toggle).catch((error) => logger.error(logger.CONTEXT.APP, "Failed to open Quick Capture from the tray", error))
  }
}
