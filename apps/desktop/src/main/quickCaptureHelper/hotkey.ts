import {globalShortcut} from "electron"

import {logger} from "@daily/core"

import {isValidAccelerator} from "@shared/utils/shortcuts/isValidAccelerator"

import type {HotkeyRebindResult} from "@shared/types/quickCapture"

let current: string | null = null

/** Binds the global shortcut that runs `onPress`, replacing the previous binding. Returns whether the OS accepted it. */
export function registerHotkey(accelerator: string, onPress: () => void): boolean {
  if (!isValidAccelerator(accelerator)) return false

  unregisterHotkey()

  if (!globalShortcut.register(accelerator, onPress)) {
    logger.error(logger.CONTEXT.APP, `Quick Capture hotkey unavailable: ${accelerator}`)
    return false
  }

  current = accelerator
  return true
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
