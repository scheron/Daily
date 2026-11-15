import {fork} from "node:child_process"
import {dirname, join, resolve} from "node:path"
import {fileURLToPath} from "node:url"

import {ToolErrorCode} from "@daily/tools"

import {MAX_SEARCH_REPLY_BYTES, searchFailure} from "./searchProtocol"

import type {ChildProcess} from "node:child_process"
import type {ServerStore} from "../../store/instance"
import type {AgentIdentity} from "../AgentWorkspace"
import type {AgentToolCall} from "../runAgentTool"
import type {SearchRequest, SearchOutcome as WorkerOutcome} from "./searchProtocol"

export type SearchOutcome = WorkerOutcome & {timing?: {queueMs: number; executionMs?: number}}

type SearchSubmission = {outcome: Promise<SearchOutcome>; cancel(): void}
type SearchRunnerOptions = {workerPath?: string; deadlineMs?: number}
type QueuedSearch = {
  agentKey: string
  request: SearchRequest
  admittedAt: number
  startedAt: number | null
  deadline: number
  timer: NodeJS.Timeout
  settled: boolean
  resolve(outcome: SearchOutcome): void
}
type ActiveSearch = {job: QueuedSearch; child: ChildProcess; exited: Promise<void>}

const MAX_PENDING = 8
const MAX_AGENT_PENDING = 2
const DEADLINE_MS = 5000
const MAX_QUERY_LENGTH = 2048
const MAX_INPUT_BYTES = 16 * 1024
const MAX_OLD_SPACE_MIB = 192
const DEFAULT_WORKER_PATH = join(dirname(fileURLToPath(import.meta.url)), "searchWorker.js")

const OVERLOADED = searchFailure(ToolErrorCode.SEARCH_OVERLOADED, "The search queue is full. Wait for an earlier search to finish, then try again.")
const TIMED_OUT = searchFailure(ToolErrorCode.SEARCH_TIMEOUT, "Search timed out. Try again with a project or date filter to narrow the search.")
const CANCELLED = searchFailure(ToolErrorCode.SEARCH_CANCELLED, "Search was cancelled. Submit it again if you still need the results.")
const WORKER_FAILED = searchFailure(ToolErrorCode.INTERNAL, "The search worker could not complete the search. Try again.")
const INPUT_TOO_LARGE = searchFailure(
  ToolErrorCode.SEARCH_BUDGET_EXCEEDED,
  "The search input is too large. Shorten the phrase or filter values and try again.",
)

export function isSearchedRead(call: AgentToolCall): call is AgentToolCall & {input: {search: string}} {
  return call.name === "list_tasks" && typeof call.input.search === "string"
}

export class SearchRunner {
  private readonly _dataDir: string
  private readonly _workerPath: string
  private readonly _deadlineMs: number
  private readonly _queue: QueuedSearch[] = []
  private _active: ActiveSearch | null = null
  private _closed = false

  constructor(store: ServerStore, options: SearchRunnerOptions = {}) {
    this._dataDir = resolve(store.dataDir)
    this._workerPath = options.workerPath ?? DEFAULT_WORKER_PATH
    this._deadlineMs = options.deadlineMs ?? DEADLINE_MS
  }

  submit(agentKey: string, agent: AgentIdentity, call: AgentToolCall): SearchSubmission {
    if (this._closed) return completedSubmission(CANCELLED)
    if (!isSearchedRead(call)) {
      return completedSubmission(searchFailure(ToolErrorCode.INVALID_INPUT, "The search runner needs a task search phrase."))
    }
    if (call.input.search.length > MAX_QUERY_LENGTH) return completedSubmission(INPUT_TOO_LARGE)
    if (this._queue.length >= MAX_PENDING || this._queue.filter((job) => job.agentKey === agentKey).length >= MAX_AGENT_PENDING) {
      return completedSubmission(OVERLOADED)
    }

    let input: unknown
    try {
      input = JSON.stringify(call.input)
    } catch {
      return completedSubmission(INPUT_TOO_LARGE)
    }
    if (typeof input !== "string" || Buffer.byteLength(input) > MAX_INPUT_BYTES) return completedSubmission(INPUT_TOO_LARGE)

    const {promise, resolve} = Promise.withResolvers<SearchOutcome>()
    const admittedAt = performance.now()
    const job: QueuedSearch = {
      agentKey,
      request: {dataDir: this._dataDir, agent, input},
      admittedAt,
      startedAt: null,
      deadline: admittedAt + this._deadlineMs,
      timer: setTimeout(() => this._stop(job, TIMED_OUT), this._deadlineMs),
      settled: false,
      resolve,
    }
    this._queue.push(job)
    this._startNext()
    return {outcome: promise, cancel: () => this._stop(job, CANCELLED)}
  }

  async close(): Promise<void> {
    this._closed = true
    for (const job of this._queue.splice(0)) this._stop(job, CANCELLED)
    if (!this._active) return

    const {job, exited} = this._active
    this._stop(job, CANCELLED)
    await exited
  }

  private _startNext(): void {
    if (this._active || this._closed) return

    while (this._queue.length) {
      const next = this._queue.shift()!
      if (performance.now() >= next.deadline) {
        this._settle(next, TIMED_OUT)
        continue
      }

      if (this._start(next)) return
    }
  }

  private _start(job: QueuedSearch): boolean {
    job.startedAt = performance.now()
    let child: ChildProcess
    try {
      child = fork(this._workerPath, [], {
        env: process.versions.electron ? {ELECTRON_RUN_AS_NODE: "1"} : {},
        execArgv: [`--max-old-space-size=${MAX_OLD_SPACE_MIB}`],
        serialization: "advanced",
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      })
    } catch {
      this._settle(job, WORKER_FAILED)
      return false
    }

    const {promise: exited, resolve: resolveExit} = Promise.withResolvers<void>()
    this._active = {job, child, exited}
    let outcome: WorkerOutcome | null = null
    child.on("message", (message) => {
      if (isSearchOutcome(message)) outcome = message
      else this._stop(job, WORKER_FAILED)
    })
    child.on("error", () => this._stop(job, WORKER_FAILED))
    child.once("close", (code) => {
      this._active = null
      this._settle(job, performance.now() >= job.deadline ? TIMED_OUT : ((code === 0 ? outcome : null) ?? WORKER_FAILED))
      resolveExit()
      this._startNext()
    })

    try {
      child.send(job.request, (error) => {
        if (error) this._stop(job, WORKER_FAILED)
      })
    } catch {
      this._stop(job, WORKER_FAILED)
    }
    return true
  }

  private _stop(job: QueuedSearch, outcome: WorkerOutcome): void {
    if (job.settled) return

    const index = this._queue.indexOf(job)
    if (index !== -1) this._queue.splice(index, 1)
    this._settle(job, outcome)
    if (this._active?.job === job) this._active.child.kill("SIGKILL")
  }

  private _settle(job: QueuedSearch, outcome: WorkerOutcome): void {
    if (job.settled) return

    job.settled = true
    clearTimeout(job.timer)
    const settledAt = performance.now()
    const timing =
      job.startedAt === null
        ? {queueMs: settledAt - job.admittedAt}
        : {queueMs: job.startedAt - job.admittedAt, executionMs: settledAt - job.startedAt}
    job.resolve({...outcome, timing})
  }
}

function completedSubmission(outcome: SearchOutcome): SearchSubmission {
  return {outcome: Promise.resolve(outcome), cancel() {}}
}

function isSearchOutcome(message: unknown): message is WorkerOutcome {
  if (!message || typeof message !== "object" || !("ok" in message)) return false
  if (message.ok === true) return "text" in message && typeof message.text === "string" && Buffer.byteLength(message.text) <= MAX_SEARCH_REPLY_BYTES
  if (message.ok !== false || !("error" in message) || !message.error || typeof message.error !== "object") return false

  const {error} = message
  return (
    "code" in error &&
    Object.values(ToolErrorCode).some((code) => code === error.code) &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.length <= 1024
  )
}
