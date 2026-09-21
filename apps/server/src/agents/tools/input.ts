import {DateTime} from "luxon"

import {isBoolean, isNumber, isString} from "@daily/std"

import {AgentToolError} from "../../errors/agent/AgentToolError"
import {AgentToolErrorCode} from "../../errors/agent/AgentToolErrorCode"

import type {ISODate, ISOTime} from "@daily/protocol"

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/

/** A string field, or `undefined` when it was not sent. Throws `INVALID_INPUT` naming `field` when it was sent as something else. */
export function readString(input: Record<string, unknown>, field: string): string | undefined {
  const value = input[field]
  if (value === undefined) return undefined
  if (!isString(value)) invalid(field, "must be a string")

  return value
}

/** A string field that must be sent and non-empty. */
export function requireString(input: Record<string, unknown>, field: string): string {
  const value = readString(input, field)
  if (value === undefined || value.length === 0) invalid(field, "is required")

  return value
}

/** An integer field within `options.min`/`options.max`, or `undefined` when it was not sent. */
export function readInteger(input: Record<string, unknown>, field: string, options: {min?: number; max?: number} = {}): number | undefined {
  const value = input[field]
  if (value === undefined) return undefined
  if (!isNumber(value) || !Number.isInteger(value)) invalid(field, "must be an integer")
  if (options.min !== undefined && value < options.min) invalid(field, `must be at least ${options.min}`)
  if (options.max !== undefined && value > options.max) invalid(field, `must be at most ${options.max}`)

  return value
}

/** A boolean field, or `undefined` when it was not sent. */
export function readBoolean(input: Record<string, unknown>, field: string): boolean | undefined {
  const value = input[field]
  if (value === undefined) return undefined
  if (!isBoolean(value)) invalid(field, "must be a boolean")

  return value
}

/** One of `values`, or `undefined` when it was not sent. */
export function readEnum<T extends string>(input: Record<string, unknown>, field: string, values: readonly T[]): T | undefined {
  const value = readString(input, field)
  if (value === undefined) return undefined
  if (!(values as readonly string[]).includes(value)) invalid(field, `must be one of ${values.join(", ")}`)

  return value as T
}

/** A `YYYY-MM-DD` field, or `undefined` when it was not sent. */
export function readISODate(input: Record<string, unknown>, field: string): ISODate | undefined {
  const value = readString(input, field)
  if (value === undefined) return undefined
  if (!ISO_DATE_PATTERN.test(value) || !DateTime.fromISO(value).isValid) invalid(field, "must be an ISO date (YYYY-MM-DD)")

  return value
}

/** An `HH:mm` or `HH:mm:ss` field, normalised to `HH:mm:ss`, or `undefined` when it was not sent. */
export function readISOTime(input: Record<string, unknown>, field: string): ISOTime | undefined {
  const value = readString(input, field)
  if (value === undefined) return undefined
  if (!ISO_TIME_PATTERN.test(value)) invalid(field, "must be an ISO time (HH:mm or HH:mm:ss)")

  return value.length === 5 ? `${value}:00` : value
}

function invalid(field: string, reason: string): never {
  throw new AgentToolError(AgentToolErrorCode.INVALID_INPUT, `"${field}" ${reason}`)
}
