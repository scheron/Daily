export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

export const LOG_CONTEXT = {
  APP: "APP",
  DB: "DB",
  STORAGE: "STORAGE",
  TASKS: "TASKS",
  TAGS: "TAGS",
  BRANCHES: "BRANCHES",
  FILES: "FILES",
  SYNC_ENGINE: "SYNC",
  SYNC_PULL: "SYNC_PULL",
  SYNC_PUSH: "SYNC_PUSH",
  IPC: "IPC",
  SETTINGS: "SETTINGS",
  SHELL: "SHELL",
  AI: "AI",
} as const

export type LogContext = (typeof LOG_CONTEXT)[keyof typeof LOG_CONTEXT]
