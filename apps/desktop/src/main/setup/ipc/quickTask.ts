import {ipcMain} from "electron"

import {HOTKEY_REQUESTS} from "@main/quickTask/protocol"

import type {StorageController} from "@daily/core"
import type {QuickTaskProcess} from "@main/quickTask/QuickTaskProcess"
import type {HotkeyRebindResult, QuickTaskHotkeyState} from "@shared/types/quickTask"

const ACTIVE_HOTKEY_WAIT_MS = 30_000

/** Settings' view of the shortcut: both questions go to the Quick task process, which owns it. A rebind that the process accepts is saved once, here. */
export function setupQuickTaskIPC(
  quickTask: Pick<QuickTaskProcess, "request" | "whenReady" | "isRunning">,
  getStorage: () => StorageController | null,
) {
  ipcMain.handle("quick-task:active-hotkey", async (): Promise<QuickTaskHotkeyState> => {
    try {
      await quickTask.whenReady(ACTIVE_HOTKEY_WAIT_MS)
    } catch {
      return {running: quickTask.isRunning(), active: null}
    }

    try {
      return {running: true, active: (await quickTask.request(HOTKEY_REQUESTS.active)) as string | null}
    } catch {
      return {running: false, active: null}
    }
  })

  ipcMain.handle("quick-task:rebind-hotkey", async (_event, accelerator: unknown): Promise<HotkeyRebindResult> => {
    let result: HotkeyRebindResult
    try {
      result = (await quickTask.request(HOTKEY_REQUESTS.rebind, [typeof accelerator === "string" ? accelerator : ""])) as HotkeyRebindResult
    } catch {
      return {ok: false, reason: "not-running", active: null}
    }

    if (result.ok && typeof accelerator === "string") await getStorage()?.saveSettings({quickTask: {hotkey: accelerator}})
    return result
  })
}
