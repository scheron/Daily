import {ENV} from "@/config"
import {LOG_CONTEXT} from "@/types/logger"

import type {LogContext, LogLevel} from "@/types/logger"

class Logger {
  static readonly CONTEXT = LOG_CONTEXT
  private readonly allowedContexts: Set<LogContext> | null

  constructor(
    private enabled: boolean,
    private minLevel: LogLevel,
    contexts?: LogContext[],
  ) {
    const normalized = contexts?.filter(Boolean)
    this.allowedContexts = normalized?.length ? new Set(normalized) : null
  }

  get CONTEXT(): typeof LOG_CONTEXT {
    return Logger.CONTEXT
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

  storage(operation: string, context: LogContext, id?: string): void {
    const message = id ? `${operation} ${context}: ${id}` : `${operation} ${context}`
    this.log("INFO", context, message)
  }

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
    if (this.allowedContexts && (!context || !this.allowedContexts.has(context))) return

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
}

export const logger = new Logger(ENV.logging?.enabled ?? false, ENV.logging?.minLevel ?? "INFO", ENV.logging?.contexts)
