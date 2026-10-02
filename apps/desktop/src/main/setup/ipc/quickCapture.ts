import {ipcMain} from "electron"

import {HOTKEY_REQUESTS} from "@main/quickCaptureHelper/helperProtocol"

import type {StorageController} from "@daily/core"
import type {QuickCaptureHelper} from "@main/quickCaptureHelper/QuickCaptureHelper"
import type {HotkeyRebindResult, QuickCaptureHotkeyState} from "@shared/types/quickCapture"

const ACTIVE_HOTKEY_WAIT_MS = 30_000

/** Settings' view of the shortcut: both questions go to the helper process, which owns it. A rebind that the helper accepts is saved once, here. */
export function setupQuickCaptureIPC(
  helper: Pick<QuickCaptureHelper, "request" | "whenReady" | "isRunning">,
  getStorage: () => StorageController | null,
) {
  ipcMain.handle("quick-capture:active-hotkey", async (): Promise<QuickCaptureHotkeyState> => {
    try {
      await helper.whenReady(ACTIVE_HOTKEY_WAIT_MS)
    } catch {
      return {running: helper.isRunning(), active: null}
    }

    try {
      return {running: true, active: (await helper.request(HOTKEY_REQUESTS.active)) as string | null}
    } catch {
      return {running: false, active: null}
    }
  })

  ipcMain.handle("quick-capture:rebind-hotkey", async (_event, accelerator: unknown): Promise<HotkeyRebindResult> => {
    let result: HotkeyRebindResult
    try {
      result = (await helper.request(HOTKEY_REQUESTS.rebind, [typeof accelerator === "string" ? accelerator : ""])) as HotkeyRebindResult
    } catch {
      return {ok: false, reason: "helper-down", active: null}
    }

    if (result.ok && typeof accelerator === "string") await getStorage()?.saveSettings({quickCapture: {hotkey: accelerator}})
    return result
  })
}
