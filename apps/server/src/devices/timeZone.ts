/**
 * Reports whether a value is usable as a Mac's IANA time zone: a bounded, zone-shaped string.
 * Does not call `Intl` to check the zone is known — the server's ICU need not know every zone a
 * Mac reports, and a zone it does not know is still the honest answer to store. Read by the
 * revision probe, which ignores an unusable value, and by agent approval, which refuses one.
 */
export function isUsableTimeZone(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64 && /^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value)
}
