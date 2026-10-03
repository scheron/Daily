import {QuickTaskError} from "@shared/errors/quickTask/QuickTaskError"
import {QuickTaskErrorCode} from "@shared/errors/quickTask/QuickTaskErrorCode"
import {getActiveHotkey, rebindHotkey, registerHotkey} from "./hotkey"
import {HOTKEY_REQUESTS} from "./protocol"

/** Answers Daily's requests: set it at start, rebind it with rollback, report which one is active, and toggle the panel as a press of it would. */
export function createHotkeyRequestHandler(onPress: () => void) {
  return async (channel: string, args: unknown[]): Promise<unknown> => {
    if (channel === HOTKEY_REQUESTS.active) return getActiveHotkey()
    if (channel === HOTKEY_REQUESTS.toggle) {
      onPress()
      return undefined
    }

    if (channel !== HOTKEY_REQUESTS.register && channel !== HOTKEY_REQUESTS.rebind) {
      throw new QuickTaskError(QuickTaskErrorCode.UnknownRequest, `Unknown request: ${channel}`)
    }

    const [accelerator] = args
    if (typeof accelerator !== "string") {
      throw new QuickTaskError(QuickTaskErrorCode.AcceleratorMissing, `Request ${channel} needs an accelerator`)
    }

    return channel === HOTKEY_REQUESTS.register ? registerHotkey(accelerator, onPress) : rebindHotkey(accelerator, onPress)
  }
}
