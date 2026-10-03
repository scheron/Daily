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
