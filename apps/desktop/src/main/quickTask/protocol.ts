export const QUICK_TASK_PROCESS_FLAG = "--quick-task"

export const PROCESS_READY_EVENT = "process:ready"

/** What Daily asks the Quick task process to do: manage the global shortcut, or toggle the panel as a press of it would. */
export const HOTKEY_REQUESTS = {
  register: "hotkey:register",
  rebind: "hotkey:rebind",
  active: "hotkey:active",
  toggle: "panel:toggle",
} as const

/** The channels the panel's renderers call that the Quick task process hands to Daily. Nothing else is forwarded. */
export const QUICK_TASK_FORWARDED_CHANNELS = ["settings:load", "tasks:get-all", "tasks:create", "branches:get-many", "tags:get-many"] as const

/** The Daily events the Quick task process re-emits to its windows. */
export const QUICK_TASK_FORWARDED_EVENTS = ["storage:changed", "settings:changed"] as const

export type HotkeyRequest = (typeof HOTKEY_REQUESTS)[keyof typeof HOTKEY_REQUESTS]
export type QuickTaskForwardedChannel = (typeof QUICK_TASK_FORWARDED_CHANNELS)[number]
export type QuickTaskForwardedEvent = (typeof QUICK_TASK_FORWARDED_EVENTS)[number]

/** One JSON line on the stdio channel between Daily and the Quick task process. Both directions use the same four shapes. */
export type ChannelMessage =
  | {kind: "request"; id: number; channel: string; args: unknown[]}
  | {kind: "response"; id: number; ok: true; result?: unknown}
  | {kind: "response"; id: number; ok: false; error: string}
  | {kind: "event"; channel: string; args: unknown[]}
