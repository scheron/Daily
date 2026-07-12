import type {LogContext} from "../types/logger"

export const ENV = {
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",

  logging: {
    enabled: process.env.NODE_ENV === "development",
    minLevel: "INFO" as const,
    contexts: [] as LogContext[],
  },
} as const
