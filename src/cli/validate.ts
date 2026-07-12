import {DateTime} from "luxon"

import {CliError} from "@shared/errors/cli/CliError"
import {CliErrorCode} from "@shared/errors/cli/CliErrorCode"

export function assertValidDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !DateTime.fromISO(value).isValid) {
    throw new CliError(CliErrorCode.INVALID_DATE, `Invalid date (expected YYYY-MM-DD): ${value}`)
  }
  return value
}

export function assertValidTime(value: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
    throw new CliError(CliErrorCode.INVALID_TIME, `Invalid time (expected HH:MM): ${value}`)
  }
  return `${value}:00`
}

export function assertPositiveMinutes(value: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw new CliError(CliErrorCode.INVALID_MINUTES, `Invalid minutes (expected a positive integer): ${value}`)
  }
  return n
}

export function assertDeleteTarget(taskId: string | undefined, force: boolean | undefined): void {
  if (!taskId && !force) {
    throw new CliError(CliErrorCode.INVALID_ARGUMENT, "Nothing to delete: pass <taskId>, or --force to empty the trash")
  }
}
