import type {HOTKEY_REQUESTS, QUICK_TASK_FORWARDED_CHANNELS} from "@shared/constants/quickTask"

export type HotkeyRequest = (typeof HOTKEY_REQUESTS)[keyof typeof HOTKEY_REQUESTS]
export type QuickTaskForwardedChannel = (typeof QUICK_TASK_FORWARDED_CHANNELS)[number]

/** One JSON line on the stdio channel between Daily and the Quick task process. Both directions use the same four shapes. */
export type ChannelMessage =
  | {kind: "request"; id: number; channel: string; args: unknown[]}
  | {kind: "response"; id: number; ok: true; result?: unknown}
  | {kind: "response"; id: number; ok: false; error: string}
  | {kind: "event"; channel: string; args: unknown[]}
