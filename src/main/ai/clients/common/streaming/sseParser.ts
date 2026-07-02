import {notNull} from "@shared/utils/common/validators"

const EVENT_SEP = "\n\n"

export function consumeSseEvents(buffer: string): {events: string[]; remainder: string} {
  const events: string[] = []
  let remainder = buffer

  while (true) {
    const sepIdx = remainder.indexOf(EVENT_SEP)
    if (sepIdx === -1) break

    const raw = remainder.slice(0, sepIdx)
    remainder = remainder.slice(sepIdx + EVENT_SEP.length)

    // Each event may have multiple lines; we want only the first data: line
    // (OpenAI-compat puts one data: per event). Strip comments (lines starting
    // with ':') and skip events that have no data line.
    let payload: string | null = null
    for (const line of raw.split("\n")) {
      if (line.startsWith(":")) continue
      if (line.startsWith("data:")) {
        payload = line.slice(5).trimStart()
        break
      }
    }
    if (notNull(payload)) events.push(payload)
  }

  return {events, remainder}
}
