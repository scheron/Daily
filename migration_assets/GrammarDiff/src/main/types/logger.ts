export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

export const LOG_CONTEXT = {
  APP: "APP",
  DB: "DB",
  STORAGE: "STORAGE",
  WINDOW: "WINDOW",
  TRAY: "TRAY",
  HOTKEY: "HOTKEY",
  IPC: "IPC",
  SETTINGS: "SETTINGS",
  AI: "AI",
  RENDERER: "RENDERER",
} as const

export type LogContext = (typeof LOG_CONTEXT)[keyof typeof LOG_CONTEXT]
