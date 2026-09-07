import {useEventListener} from "@vueuse/core"

import {SHORTCUTS_MAP} from "@shared/constants/shortcuts"
import {acceleratorsMatch} from "@shared/utils/shortcuts/acceleratorsMatch"
import {formatEventToAccelerator} from "@shared/utils/shortcuts/formatEventToAccelerator"

import type {ShortcutAction} from "@shared/types/shortcuts"

/**
 * Return `false` from a handler to leave the keystroke unhandled — the default
 * action runs and the shortcut is not consumed.
 */
export type ShortcutHandler = (event: KeyboardEvent) => void | boolean

export type ShortcutScopeMap = Partial<Record<ShortcutAction, ShortcutHandler>>

/**
 * Bind a map of `ShortcutAction` keys to handlers. The accelerator for each action is
 * resolved from `SHORTCUTS_MAP`, so the keystroke and the shortcut label in the UI stay
 * in sync from a single source of truth.
 * @example useShortcutsScope({"editor:save": () => save(), "editor:close": () => close()})
 */
export function useShortcutsScope(map: ShortcutScopeMap): void {
  const bindings = Object.entries(map) as [ShortcutAction, ShortcutHandler][]

  useEventListener(window, "keydown", (event: KeyboardEvent) => {
    const pressed = formatEventToAccelerator(event)
    if (!pressed) return

    for (const [action, handler] of bindings) {
      if (acceleratorsMatch(pressed, SHORTCUTS_MAP[action].accelerator)) {
        if (handler(event) === false) return
        event.preventDefault()
        return
      }
    }
  })
}
