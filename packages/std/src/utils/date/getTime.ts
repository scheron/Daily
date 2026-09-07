import {DateTime} from "luxon"

/**
 * Returns the current local time formatted as HH:mm:ss.
 * @returns {string} The current time
 * @example getTime() // "14:30:05"
 */
export function getTime(): string {
  return DateTime.now().toFormat("HH:mm:ss")
}
