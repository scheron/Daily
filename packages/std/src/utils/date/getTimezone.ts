/**
 * Returns the current IANA timezone identifier.
 * @returns {string} The timezone
 * @example getTimezone() // "Europe/Berlin"
 */
export function getTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}
