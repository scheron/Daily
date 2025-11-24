import {ENV} from "@/config"

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"
export type LogContext = string

export const LogContext = {
  APP: "APP",
  DB: "DB",
  STORAGE: "STORAGE",
  TASKS: "TASKS",
  TAGS: "TAGS",
  FILES: "FILES",
  SYNC: "SYNC",
  PULL: "PULL",
  PUSH: "PUSH",
  IPC: "IPC",
  SETTINGS: "SETTINGS",
} as const

class Logger {
  constructor(
    private enabled: boolean,
    private minLevel: LogLevel,
  ) {}

  private levelPriority: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  }

  private colors = {
    DEBUG: "\x1b[36m", // Cyan
    INFO: "\x1b[32m", // Green
    WARN: "\x1b[33m", // Yellow
    ERROR: "\x1b[31m", // Red
    RESET: "\x1b[0m",
    DIM: "\x1b[2m",
    BOLD: "\x1b[1m",
  }

  private log(level: LogLevel, context: LogContext | undefined, message: string, data?: any): void {
    if (!this.enabled) return
    if (this.levelPriority[level] < this.levelPriority[this.minLevel]) return

    const timestamp = new Date().toLocaleTimeString("en-US", {hour12: false})

    const color = this.colors[level]
    const reset = this.colors.RESET
    const dim = this.colors.DIM

    const parts: string[] = []

    parts.push(`${dim}${timestamp}${reset}`)

    parts.push(`${color}${level.padEnd(5)}${reset}`)

    if (context) {
      parts.push(`${dim}[${context}]${reset}`)
    }

    parts.push(message)

    const logLine = parts.join(" ")

    const consoleMethod = level === "ERROR" ? console.error : level === "WARN" ? console.warn : console.log

    if (data !== undefined) {
      if (typeof data === "object" && data !== null && !(data instanceof Error)) {
        consoleMethod(logLine)
        console.dir(data, {depth: 3, colors: true})
      } else {
        consoleMethod(logLine, data)
      }
    } else {
      consoleMethod(logLine)
    }
  }

  debug(context: LogContext, message: string, data?: any): void {
    this.log("DEBUG", context, message, data)
  }

  info(context: LogContext, message: string, data?: any): void {
    this.log("INFO", context, message, data)
  }

  warn(context: LogContext, message: string, data?: any): void {
    this.log("WARN", context, message, data)
  }

  error(context: LogContext, message: string, error?: any): void {
    const errorData = error instanceof Error ? {message: error.message, stack: error.stack} : error
    this.log("ERROR", context, message, errorData)
  }

  lifecycle(message: string): void {
    this.log("INFO", "APP", message)
  }

  storage(operation: string, entity: string, id?: string): void {
    const message = id ? `${operation} ${entity}: ${id}` : `${operation} ${entity}`
    this.log("INFO", entity.toUpperCase(), message)
  }
}

export const logger = new Logger(ENV.logging?.enabled ?? false, ENV.logging?.minLevel ?? "INFO")
