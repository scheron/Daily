import {logger} from "@daily/core"

import {QuickCaptureHelperError} from "@shared/errors/quickCapture/QuickCaptureHelperError"
import {QuickCaptureHelperErrorCode} from "@shared/errors/quickCapture/QuickCaptureHelperErrorCode"
import {HelperChannel} from "./HelperChannel"
import {HELPER_READY_EVENT} from "./helperProtocol"

import type {ChildProcess} from "node:child_process"
import type {HotkeyRequest} from "./helperProtocol"

type HelperChild = Pick<ChildProcess, "stdin" | "stdout" | "stderr" | "on" | "kill" | "pid">

type QuickCaptureHelperOptions = {
  spawn: () => HelperChild
  handleRequest: (channel: string, args: unknown[]) => Promise<unknown>
  onReady: () => void | Promise<void>
  onAvailabilityChange?: (isAvailable: boolean) => void
  now?: () => number
}

type ReadyWaiter = {resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>}

const RESTART_DELAYS_MS = [500, 2000, 5000]
const MAX_QUICK_FAILURES = RESTART_DELAYS_MS.length + 1
const QUICK_FAILURE_MS = 5000
const READY_WAIT_MS = 5000

/** Daily's side of the quick-capture helper: spawns the second process, serves its requests, forwards events to it, restarts it when it dies, and lets it go on quit. */
export class QuickCaptureHelper {
  private child: HelperChild | null = null
  private channel: HelperChannel | null = null
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private isReady = false
  private readonly readyWaiters = new Set<ReadyWaiter>()
  private startedAt = 0
  private quickFailures = 0
  private isStopped = true
  private readonly now: () => number

  constructor(private readonly options: QuickCaptureHelperOptions) {
    this.now = options.now ?? Date.now
  }

  /** Spawns the helper unless it is already running or waiting to be restarted. Also revives a helper that gave up after repeated quick failures. */
  start() {
    if (!this.isStopped) return

    this.isStopped = false
    this.quickFailures = 0
    this.spawn()
  }

  /** Lets the helper go: closes its stdin and kills the process right away, so no helper outlives Daily whatever state it is in. The helper is not restarted. */
  stop() {
    this.isStopped = true

    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null

    const child = this.child
    this.child = null
    this.channel?.close(new QuickCaptureHelperError(QuickCaptureHelperErrorCode.Stopped, "Quick Capture helper stopped"))
    this.channel = null
    this.rejectReadyWaiters()
    if (child) {
      child.stdin?.end()
      child.kill()
    }
    this.setReady(false)
  }

  /** Resolves once the running helper has said it is ready and its setup (`onReady`) has settled. Rejects when it is stopped or gives up first, or does not get ready within the wait. */
  whenReady(timeoutMs = READY_WAIT_MS): Promise<void> {
    if (this.isReady) return Promise.resolve()

    return new Promise((resolve, reject) => {
      const waiter: ReadyWaiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          this.readyWaiters.delete(waiter)
          reject(new QuickCaptureHelperError(QuickCaptureHelperErrorCode.NotReady, "Quick Capture helper did not become ready in time"))
        }, timeoutMs),
      }

      this.readyWaiters.add(waiter)
      if (this.isStopped) this.rejectReadyWaiters()
    })
  }

  /** Whether a helper process is up, ready or not. */
  isRunning(): boolean {
    return this.channel !== null
  }

  /** Asks the helper to run `channel`. Rejects when the helper is not running, dies before it answers, or answers with an error. */
  request(channel: HotkeyRequest, args: unknown[] = []): Promise<unknown> {
    if (!this.channel)
      return Promise.reject(new QuickCaptureHelperError(QuickCaptureHelperErrorCode.NotRunning, "Quick Capture helper is not running"))
    return this.channel.request(channel, args)
  }

  /** Sends an event to the helper; dropped when it is not running. */
  emit(channel: string, ...args: unknown[]) {
    this.channel?.emit(channel, ...args)
  }

  private spawn() {
    this.startedAt = this.now()

    let child: HelperChild
    try {
      child = this.options.spawn()
    } catch (error) {
      logger.error(logger.CONTEXT.APP, "Quick Capture helper failed to spawn", error)
      this.onExit(null)
      return
    }

    this.child = child

    const channel = new HelperChannel(
      (line) => {
        if (child.stdin?.writable) child.stdin.write(line)
        else throw new QuickCaptureHelperError(QuickCaptureHelperErrorCode.NotWritable, "Quick Capture helper is not writable")
      },
      {
        onRequest: this.options.handleRequest,
        onEvent: (name) => {
          if (name !== HELPER_READY_EVENT) return

          void new Promise<void>((resolve) => resolve(this.options.onReady()))
            .catch((error) => logger.error(logger.CONTEXT.APP, "Quick Capture helper setup failed", error))
            .then(() => {
              if (this.channel !== channel) return

              this.setReady(true)
              this.resolveReadyWaiters()
            })
        },
        onInvalid: (line) => logger.warn(logger.CONTEXT.APP, `Quick Capture helper wrote a line that is not a message: ${line.slice(0, 200)}`),
      },
    )
    this.channel = channel

    child.stdout?.setEncoding("utf8")
    child.stdout?.on("data", (chunk: string) => channel.receive(chunk))
    child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk))
    child.stdin?.on("error", () => undefined)
    child.on("error", (error) => logger.error(logger.CONTEXT.APP, "Quick Capture helper process error", error))
    child.on("exit", (code, signal) => {
      if (this.child !== child) return
      logger.warn(logger.CONTEXT.APP, `Quick Capture helper exited (code ${code}, signal ${signal})`)
      this.onExit(channel)
    })
  }

  private onExit(channel: HelperChannel | null) {
    channel?.close(new QuickCaptureHelperError(QuickCaptureHelperErrorCode.Exited, "Quick Capture helper exited"))
    this.child = null
    this.channel = null
    this.scheduleRestart()
    this.setReady(false)
  }

  private scheduleRestart() {
    if (this.isStopped) return

    this.quickFailures = this.now() - this.startedAt < QUICK_FAILURE_MS ? this.quickFailures + 1 : 0

    if (this.quickFailures >= MAX_QUICK_FAILURES) {
      this.isStopped = true
      this.rejectReadyWaiters()
      logger.error(
        logger.CONTEXT.APP,
        "Quick Capture helper keeps failing; the global shortcut is unavailable until it is started again, which happens the next time the main window opens",
      )
      return
    }

    this.restartTimer = setTimeout(
      () => {
        this.restartTimer = null
        if (!this.isStopped) this.spawn()
      },
      RESTART_DELAYS_MS[Math.max(this.quickFailures - 1, 0)],
    )
  }

  private setReady(isReady: boolean) {
    if (this.isReady === isReady) return

    this.isReady = isReady
    this.options.onAvailabilityChange?.(isReady)
  }

  private resolveReadyWaiters() {
    for (const waiter of this.readyWaiters) {
      clearTimeout(waiter.timer)
      waiter.resolve()
    }
    this.readyWaiters.clear()
  }

  private rejectReadyWaiters() {
    for (const waiter of this.readyWaiters) {
      clearTimeout(waiter.timer)
      waiter.reject(new QuickCaptureHelperError(QuickCaptureHelperErrorCode.NotReady, "Quick Capture helper is not running"))
    }
    this.readyWaiters.clear()
  }
}
