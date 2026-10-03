import {globalShortcut} from "electron"

import {logger} from "@daily/core"

import {HOTKEY_REQUESTS} from "@shared/constants/quickTask"
import {QuickTaskError} from "@shared/errors/quickTask/QuickTaskError"
import {QuickTaskErrorCode} from "@shared/errors/quickTask/QuickTaskErrorCode"
import {isValidAccelerator} from "@shared/utils/shortcuts/isValidAccelerator"

import type {HotkeyRebindResult} from "@shared/types/quickTask"

let current: string | null = null

/** Binds the global shortcut that runs `onPress`, replacing the previous binding. Returns whether the OS accepted it. */
export function registerHotkey(accelerator: string, onPress: () => void): boolean {
  if (!isValidAccelerator(accelerator)) return false

  unregisterHotkey()

  if (!globalShortcut.register(accelerator, onPress)) {
    logger.error(logger.CONTEXT.APP, `Quick task hotkey unavailable: ${accelerator}`)
    return false
  }

  current = accelerator
  return true
}

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

export function unregisterHotkey() {
  if (!current) return

  globalShortcut.unregister(current)
  current = null
}

/** The accelerator currently registered with the OS, or null when none is. */
export function getActiveHotkey(): string | null {
  return current
}

/** Moves the shortcut to `accelerator`. A failure restores the previous binding and reports which accelerator is active now. */
export function rebindHotkey(accelerator: string, onPress: () => void): HotkeyRebindResult {
  if (!isValidAccelerator(accelerator)) return {ok: false, reason: "invalid", active: current}

  const previous = current

  if (!registerHotkey(accelerator, onPress)) {
    if (previous) registerHotkey(previous, onPress)
    return {ok: false, reason: "unavailable", active: current}
  }

  return {ok: true}
}
