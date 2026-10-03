import {logger} from "@daily/core"

import type {StorageController} from "@daily/core"
import type {QuickTaskController} from "@main/quickTask/QuickTaskController"

/**
 * Starts or stops the Quick task process according to the saved Quick task switch.
 * A failed read leaves the process as it is.
 * @param getStorage - where the setting is read from
 * @returns `apply` to call when the main window shows and whenever settings change
 */
export function setupQuickTask(quickTask: Pick<QuickTaskController, "start" | "stop">, getStorage: () => StorageController | null) {
  return {apply}

  async function apply() {
    const isEnabled = await readIsEnabled()
    if (isEnabled === null) return

    if (isEnabled) quickTask.start()
    else quickTask.stop()
  }

  async function readIsEnabled() {
    try {
      return (await getStorage()?.loadSettings())?.quickTask.isEnabled ?? true
    } catch (error) {
      logger.error(logger.CONTEXT.APP, "Failed to read the Quick task setting", error)
      return null
    }
  }
}
