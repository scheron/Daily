import {QuickTaskError} from "@shared/errors/quickTask/QuickTaskError"
import {QuickTaskErrorCode} from "@shared/errors/quickTask/QuickTaskErrorCode"

import type {ChannelMessage} from "./protocol"

type StdioChannelHandlers = {
  onRequest: (channel: string, args: unknown[]) => Promise<unknown>
  onEvent: (channel: string, args: unknown[]) => void
  onInvalid?: (line: string) => void
}

type Pending = {resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>}

const DEFAULT_TIMEOUT_MS = 30_000

/** One end of the JSON-lines channel between Daily and the Quick task process: frames lines, correlates requests with responses, and carries events. */
export class StdioChannel {
  private buffer = ""
  private nextId = 1
  private readonly pending = new Map<number, Pending>()

  constructor(
    private readonly write: (line: string) => void,
    private readonly handlers: StdioChannelHandlers,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  /** Feeds a chunk read from the peer; complete lines are dispatched, a partial line waits for the rest. */
  receive(chunk: string) {
    this.buffer += chunk

    let newline = this.buffer.indexOf("\n")
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      if (line.trim()) this.dispatch(line)
      newline = this.buffer.indexOf("\n")
    }
  }

  /** Asks the peer to run `channel`. Rejects when the peer answers with an error, when it takes longer than the timeout, or when the channel closes first. */
  request(channel: string, args: unknown[] = []): Promise<unknown> {
    const id = this.nextId++

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new QuickTaskError(QuickTaskErrorCode.RequestTimedOut, `Request "${channel}" timed out`))
      }, this.timeoutMs)

      this.pending.set(id, {resolve, reject, timer})

      try {
        this.send({kind: "request", id, channel, args})
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error as Error)
      }
    })
  }

  /** Tells the peer something happened; there is no answer. */
  emit(channel: string, ...args: unknown[]) {
    try {
      this.send({kind: "event", channel, args})
    } catch {
      return
    }
  }

  /** Rejects every request still waiting and forgets a half-received line. Called when the peer is gone. */
  close(reason: Error) {
    this.buffer = ""

    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      this.pending.delete(id)
      pending.reject(reason)
    }
  }

  private dispatch(line: string) {
    let message: unknown
    try {
      message = JSON.parse(line)
    } catch {
      this.handlers.onInvalid?.(line)
      return
    }

    if (!isMessage(message)) {
      this.handlers.onInvalid?.(line)
      return
    }

    if (message.kind === "event") this.handlers.onEvent(message.channel, message.args)
    else if (message.kind === "request") void this.answer(message)
    else this.settle(message)
  }

  private async answer(message: Extract<ChannelMessage, {kind: "request"}>) {
    try {
      const result = await this.handlers.onRequest(message.channel, message.args)
      this.send({kind: "response", id: message.id, ok: true, result})
    } catch (error) {
      try {
        this.send({kind: "response", id: message.id, ok: false, error: error instanceof Error ? error.message : String(error)})
      } catch {
        return
      }
    }
  }

  private settle(message: Extract<ChannelMessage, {kind: "response"}>) {
    const pending = this.pending.get(message.id)
    if (!pending) return

    clearTimeout(pending.timer)
    this.pending.delete(message.id)

    if (message.ok) pending.resolve(message.result)
    else pending.reject(new QuickTaskError(QuickTaskErrorCode.RequestFailed, message.error))
  }

  private send(message: ChannelMessage) {
    this.write(JSON.stringify(message) + "\n")
  }
}

function isMessage(value: unknown): value is ChannelMessage {
  if (typeof value !== "object" || value === null) return false

  const message = value as Record<string, unknown>

  if (message.kind === "event") return typeof message.channel === "string" && Array.isArray(message.args)
  if (message.kind === "request") return Number.isInteger(message.id) && typeof message.channel === "string" && Array.isArray(message.args)
  if (message.kind === "response")
    return Number.isInteger(message.id) && (message.ok === true || (message.ok === false && typeof message.error === "string"))

  return false
}
