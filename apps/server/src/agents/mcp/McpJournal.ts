import {randomUUID} from "node:crypto"
import {mkdir, open, readdir, stat, unlink} from "node:fs/promises"
import {join} from "node:path"

import type {ToolErrorCode} from "@daily/tools"

type JournalCode = "OK" | ToolErrorCode
type JournalTiming = {queueMs?: number; executionMs?: number}
type JournalCall = (code: JournalCode, timing?: JournalTiming) => void
type JournalRecord = {id: string; at: string} & (
  | {event: "start"; tool: string; searchLength?: number}
  | ({event: "end"; code: JournalCode; elapsedMs: number} & JournalTiming)
)
type Segment = {name: string; day: string; index: number; size: number}

const DAYS_TO_KEEP = 7
const DAY_MS = 86_400_000
const MAX_BYTES = 8 * 1024 * 1024
const MAX_SEGMENT_BYTES = 1024 * 1024
const MAX_PENDING = 64
const MAX_WAIT_MS = 100
const MAINTENANCE_MS = 3_600_000
const WARNING_INTERVAL_MS = 60_000
const SEGMENT_NAME = /^mcp-(\d{4}-\d{2}-\d{2})-(\d+)\.ndjson$/

export class McpJournal {
  private readonly _dir: string
  private readonly _maintenance: NodeJS.Timeout
  private _tail = Promise.resolve()
  private _pending = 0
  private _closing: Promise<void> | null = null
  private _lastWarning = -Infinity

  constructor(dataDir: string) {
    this._dir = join(dataDir, "mcp-journal")
    this._enqueue(() => this._prune(Date.now(), 0))
    this._maintenance = setInterval(() => this._enqueue(() => this._prune(Date.now(), 0)), MAINTENANCE_MS).unref()
  }

  /** Resolves after a durable start or after the journal's bounded admission wait. */
  async begin(tool: string, searchLength: number | null): Promise<JournalCall | null> {
    const id = randomUUID()
    const started = performance.now()
    const at = new Date().toISOString()
    const start = this._enqueue(() => this._append({event: "start", id, at, tool, ...(searchLength !== null && {searchLength})}))
    if (!start) return null

    if ((await this._wait(start)) === false) return null
    const journal = this
    return function finish(code, timing) {
      const at = new Date().toISOString()
      const elapsedMs = Math.round(performance.now() - started)
      journal._enqueue(async () => {
        if (await start) {
          await journal._append({
            event: "end",
            id,
            at,
            code,
            elapsedMs,
            ...(timing?.queueMs !== undefined && {queueMs: Math.round(timing.queueMs)}),
            ...(timing?.executionMs !== undefined && {executionMs: Math.round(timing.executionMs)}),
          })
        }
      })
    }
  }

  close(): Promise<void> {
    if (this._closing) return this._closing

    clearInterval(this._maintenance)
    this._closing = this._wait(this._tail).then(() => {})
    return this._closing
  }

  private _enqueue(write: () => Promise<unknown>): Promise<boolean> | null {
    if (this._closing) return null
    if (this._pending === MAX_PENDING) {
      this._warn()
      return null
    }

    ++this._pending
    const result = this._tail.then(async () => {
      try {
        await write()
        return true
      } catch {
        this._warn()
        return false
      } finally {
        --this._pending
      }
    })
    this._tail = result.then(() => {})
    return result
  }

  private _wait<T>(write: Promise<T>): Promise<T | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._warn()
        resolve(null)
      }, MAX_WAIT_MS)
      void write.then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
    })
  }

  private _warn(): void {
    const now = performance.now()
    if (now - this._lastWarning < WARNING_INTERVAL_MS) return
    this._lastWarning = now
    console.warn("MCP journal degraded")
  }

  private async _append(record: JournalRecord): Promise<void> {
    const now = Date.now()
    const day = new Date(now).toISOString().slice(0, 10)
    const line = `${JSON.stringify(record)}\n`
    const bytes = Buffer.byteLength(line) + 1
    await mkdir(this._dir, {recursive: true, mode: 0o700})
    const current = (await this._prune(now, bytes)).findLast((segment) => segment.day === day)
    const reuse = current !== undefined && current.size + bytes <= MAX_SEGMENT_BYTES
    const name = reuse ? current.name : `mcp-${day}-${(current?.index ?? 0) + 1}.ndjson`
    const file = await open(join(this._dir, name), "a+", 0o600)
    try {
      let prefix = ""
      if (reuse && current.size > 0) {
        // A killed writer may leave a partial final line in the active segment.
        const tail = Buffer.alloc(1)
        await file.read(tail, 0, 1, current.size - 1)
        if (tail[0] !== 10) prefix = "\n"
      }
      await file.appendFile(prefix + line)
      await file.datasync()
    } finally {
      await file.close()
    }
  }

  private async _prune(now: number, reserveBytes: number): Promise<Segment[]> {
    const oldestDay = new Date(now - (DAYS_TO_KEEP - 1) * DAY_MS).toISOString().slice(0, 10)
    let entries
    try {
      entries = await readdir(this._dir, {withFileTypes: true})
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return []
      throw error
    }

    const segments: Segment[] = []
    for (const entry of entries) {
      const match = entry.isFile() && SEGMENT_NAME.exec(entry.name)
      if (!match) continue

      const [, day, index] = match
      const path = join(this._dir, entry.name)
      if (day < oldestDay) {
        await unlink(path)
        continue
      }
      const {size} = await stat(path)
      segments.push({name: entry.name, day, index: Number(index), size})
    }

    segments.sort((left, right) => left.day.localeCompare(right.day) || left.index - right.index)
    let bytes = segments.reduce((sum, segment) => sum + segment.size, reserveBytes)
    while (bytes > MAX_BYTES && segments.length > 0) {
      const [oldest] = segments.splice(0, 1)
      await unlink(join(this._dir, oldest.name))
      bytes -= oldest.size
    }
    return segments
  }
}
