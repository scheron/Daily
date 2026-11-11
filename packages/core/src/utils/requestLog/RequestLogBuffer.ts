import {SYNC_PROTOCOL_PATHS} from "@daily/protocol"

import type {RequestLogEntry} from "@daily/protocol"

const CAPACITY = 1000

/**
 * An in-memory ring of the most recent requests, oldest first. A revision poll that repeats with the
 * same outcome folds into one entry instead of adding a line per poll.
 */
export class RequestLogBuffer {
  private readonly _entries: RequestLogEntry[] = []

  /**
   * Appends `entry`, or folds it into the series it continues: consecutive `GET /v1/revision` from one
   * device with the same level, status and error. The folded entry keeps its `firstAt`, takes the new
   * `at` and moves to the end. Polls by other devices do not break a series; any other request does.
   */
  add(entry: RequestLogEntry): void {
    const index = isRevisionPoll(entry) ? this._findSeries(entry) : -1

    if (index === -1) {
      this._entries.push(entry)
      if (this._entries.length > CAPACITY) this._entries.shift()
      return
    }

    const [series] = this._entries.splice(index, 1)
    this._entries.push({...series, at: entry.at, durationMs: entry.durationMs})
  }

  list(): RequestLogEntry[] {
    return [...this._entries]
  }

  private _findSeries(poll: RequestLogEntry): number {
    for (let index = this._entries.length - 1; index >= 0; index--) {
      const candidate = this._entries[index]
      if (!isRevisionPoll(candidate)) return -1
      if (candidate.device !== poll.device) continue

      return hasSameOutcome(candidate, poll) ? index : -1
    }

    return -1
  }
}

function isRevisionPoll(entry: RequestLogEntry): boolean {
  return entry.method === "GET" && entry.path === SYNC_PROTOCOL_PATHS.revision
}

function hasSameOutcome(a: RequestLogEntry, b: RequestLogEntry): boolean {
  return a.level === b.level && a.status === b.status && a.error === b.error
}
