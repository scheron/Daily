import {toLocaleDateTime} from "@daily/std"

import type {RequestLogEntry} from "@daily/protocol"

/** The parts of one log line; the screen styles them and Copy joins them with spaces, so both read the same. */
export function formatLogEntry(entry: RequestLogEntry) {
  const time = entry.firstAt === entry.at ? toLocaleDateTime(entry.at) : `${toLocaleDateTime(entry.firstAt)} – ${toLocaleDateTime(entry.at)}`
  const tail = [entry.device, entry.error].filter(Boolean).join(" ")

  return {
    time,
    level: entry.level.toUpperCase(),
    source: entry.source,
    request: `${entry.method} ${entry.path}`,
    status: entry.status === null ? "—" : String(entry.status),
    duration: `${entry.durationMs} ms`,
    tail,
  }
}

export function formatLogText(entries: RequestLogEntry[]): string {
  return entries
    .map(formatLogEntry)
    .map((line) => [line.time, line.level, line.source, line.request, line.status, line.duration, line.tail].filter(Boolean).join(" "))
    .join("\n")
}
