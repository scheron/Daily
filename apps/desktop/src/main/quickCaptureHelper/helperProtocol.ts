export const QUICK_CAPTURE_HELPER_FLAG = "--quick-capture-helper"

export const HELPER_READY_EVENT = "helper:ready"

/** What Daily asks the helper process to do about the global shortcut. */
export const HOTKEY_REQUESTS = {
  register: "hotkey:register",
  rebind: "hotkey:rebind",
  active: "hotkey:active",
} as const

/** The channels the panel's renderers call that the helper process hands to Daily. Nothing else is forwarded. */
export const QUICK_CAPTURE_FORWARDED_CHANNELS = ["settings:load", "tasks:get-all", "tasks:create", "branches:get-many", "tags:get-many"] as const

/** The Daily events the helper process re-emits to its windows. */
export const QUICK_CAPTURE_FORWARDED_EVENTS = ["storage:changed", "settings:changed"] as const

export type HotkeyRequest = (typeof HOTKEY_REQUESTS)[keyof typeof HOTKEY_REQUESTS]
export type QuickCaptureForwardedChannel = (typeof QUICK_CAPTURE_FORWARDED_CHANNELS)[number]
export type QuickCaptureForwardedEvent = (typeof QUICK_CAPTURE_FORWARDED_EVENTS)[number]

/** One JSON line on the stdio channel between Daily and the helper process. Both directions use the same four shapes. */
export type HelperMessage =
  | {kind: "request"; id: number; channel: string; args: unknown[]}
  | {kind: "response"; id: number; ok: true; result?: unknown}
  | {kind: "response"; id: number; ok: false; error: string}
  | {kind: "event"; channel: string; args: unknown[]}
