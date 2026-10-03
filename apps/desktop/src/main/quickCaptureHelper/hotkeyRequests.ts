import {QuickCaptureHelperError} from "@shared/errors/quickCapture/QuickCaptureHelperError"
import {QuickCaptureHelperErrorCode} from "@shared/errors/quickCapture/QuickCaptureHelperErrorCode"
import {HOTKEY_REQUESTS} from "./helperProtocol"
import {getActiveHotkey, rebindHotkey, registerHotkey} from "./hotkey"

/** Answers Daily's requests: set it at start, rebind it with rollback, report which one is active, and toggle the panel as a press of it would. */
export function createHotkeyRequestHandler(onPress: () => void) {
  return async (channel: string, args: unknown[]): Promise<unknown> => {
    if (channel === HOTKEY_REQUESTS.active) return getActiveHotkey()
    if (channel === HOTKEY_REQUESTS.toggle) {
      onPress()
      return undefined
    }

    if (channel !== HOTKEY_REQUESTS.register && channel !== HOTKEY_REQUESTS.rebind) {
      throw new QuickCaptureHelperError(QuickCaptureHelperErrorCode.UnknownRequest, `Unknown request: ${channel}`)
    }

    const [accelerator] = args
    if (typeof accelerator !== "string") {
      throw new QuickCaptureHelperError(QuickCaptureHelperErrorCode.AcceleratorMissing, `Request ${channel} needs an accelerator`)
    }

    return channel === HOTKEY_REQUESTS.register ? registerHotkey(accelerator, onPress) : rebindHotkey(accelerator, onPress)
  }
}
