import type {Changeset, StorageController} from "@daily/core"
import type {Task} from "@daily/protocol"
import type {TaskTimer, TaskTimerCommand} from "@shared/types/taskTimer"

type TimerEntry = {
  taskId: Task["id"]
  elapsedMs: number
  startedAt: number | null
  creditedSeconds: number
  stopRequested: boolean
  taskDone: boolean
}

type PendingStart = {cancelled: boolean}

export class TaskTimersController {
  private _entries: TimerEntry[] = []
  private _starting = new Map<Task["id"], PendingStart>()
  private _writes = new Map<Task["id"], Promise<void>>()
  private _isFlushingQuit = false

  constructor(
    private _storage: Pick<StorageController, "getTask" | "addTaskSpentTime">,
    private _broadcast: (timers: TaskTimer[]) => void,
    private _reportSaveFailure: (error: unknown) => void,
  ) {}

  getTimers(): TaskTimer[] {
    const now = performance.now()
    return this._entries.map((entry) => ({
      taskId: entry.taskId,
      elapsedMs: elapsedAt(entry, now),
      isRunning: entry.startedAt !== null,
    }))
  }

  async dispatch({type, taskId}: TaskTimerCommand): Promise<boolean> {
    if (this._isFlushingQuit) return false
    if (type === "start") return this._start(taskId)

    const entry = this._entries.find((candidate) => candidate.taskId === taskId)
    if (!entry) return false

    switch (type) {
      case "pause":
        this._pause(entry, performance.now())
        await this._credit(entry)
        return true
      case "resume":
        if (entry.startedAt !== null || entry.taskDone || entry.stopRequested || this._writes.has(taskId)) return false
        entry.startedAt = performance.now()
        this._publish()
        return true
      case "stop":
        await this._stop(entry, performance.now())
        return true
      case "promote":
        if (this._entries[0] !== entry) {
          this._entries = [entry, ...this._entries.filter((candidate) => candidate !== entry)]
          this._publish()
        }
        return true
    }
    return false
  }

  pauseAll() {
    const now = performance.now()
    const running = this._entries.filter(({startedAt}) => startedAt !== null)
    for (const entry of running) {
      this._pause(entry, now)
      void this._credit(entry).catch(this._reportSaveFailure)
    }
  }

  applyStorageChange(changeset: Changeset) {
    for (const taskId of changeset.tasks?.removed ?? []) this._discard(taskId)
    for (const task of changeset.tasks?.upserted ?? []) {
      if (task.deletedAt) {
        this._discard(task.id)
        continue
      }

      const isDone = task.status === "done"
      if (isDone) this._cancelStart(task.id)
      const entry = this._entries.find(({taskId}) => taskId === task.id)
      if (!entry || entry.taskDone === isDone) continue

      entry.taskDone = isDone
      if (isDone) this._complete(entry)
    }
  }

  /** Holds the first quit until timer credits are saved, then retries it on a later Electron turn. */
  holdQuit(event: {preventDefault(): void}, retryQuit: () => void): boolean {
    if (!this._isFlushingQuit && !this._entries.length && !this._writes.size) return false

    event.preventDefault()
    if (!this._isFlushingQuit) {
      this._isFlushingQuit = true
      for (const start of this._starting.values()) start.cancelled = true
      void this._flushForQuit(retryQuit)
    }
    return true
  }

  private async _start(taskId: Task["id"]) {
    if (this._starting.has(taskId) || this._writes.has(taskId) || this._entries.some((entry) => entry.taskId === taskId)) return false

    const pending: PendingStart = {cancelled: false}
    this._starting.set(taskId, pending)
    try {
      const task = await this._storage.getTask(taskId)
      if (pending.cancelled || this._isFlushingQuit || !task || task.deletedAt || task.status === "done") return false

      this._entries.push({
        taskId,
        elapsedMs: 0,
        startedAt: performance.now(),
        creditedSeconds: 0,
        stopRequested: false,
        taskDone: false,
      })
      this._publish()
      return true
    } finally {
      this._starting.delete(taskId)
    }
  }

  private _cancelStart(taskId: Task["id"]) {
    const pending = this._starting.get(taskId)
    if (pending) pending.cancelled = true
  }

  private _discard(taskId: Task["id"]) {
    this._cancelStart(taskId)
    const entry = this._entries.find((candidate) => candidate.taskId === taskId)
    if (entry) this._remove(entry)
  }

  private _pause(entry: TimerEntry, now: number) {
    if (entry.startedAt === null) return

    entry.elapsedMs = elapsedAt(entry, now)
    entry.startedAt = null
    this._publish()
  }

  private _stop(entry: TimerEntry, now: number): Promise<void> {
    entry.stopRequested = true
    this._pause(entry, now)
    return this._credit(entry)
  }

  private _complete(entry: TimerEntry) {
    entry.stopRequested = true
    this._pause(entry, performance.now())

    const pending = this._writes.get(entry.taskId)
    if (pending) {
      void pending.catch(this._reportSaveFailure)
      return
    }

    // The completed task's IPC reply arrives before the timer publishes its updated Spent.
    setImmediate(() => {
      if (!entry.stopRequested || !this._entries.includes(entry) || this._writes.has(entry.taskId)) return
      void this._credit(entry).catch(this._reportSaveFailure)
    })
  }

  private _credit(entry: TimerEntry): Promise<void> {
    const {taskId, elapsedMs} = entry
    const pending = this._writes.get(taskId)
    if (pending) return pending

    const totalSeconds = Math.floor(elapsedMs / 1_000)
    const secondsToCredit = totalSeconds - entry.creditedSeconds
    if (!secondsToCredit) {
      if (entry.stopRequested) this._remove(entry)
      return Promise.resolve()
    }

    // The pending write is visible to storage observers before the credit can publish a changeset.
    const write = Promise.resolve()
      .then(async () => {
        if (!this._entries.includes(entry)) return

        await this._storage.addTaskSpentTime(taskId, secondsToCredit)
        entry.creditedSeconds = totalSeconds
        if (entry.stopRequested) this._remove(entry)
      })
      .finally(() => {
        this._writes.delete(taskId)
        entry.stopRequested = false
      })
    this._writes.set(taskId, write)
    return write
  }

  private _remove(entry: TimerEntry) {
    if (!this._entries.includes(entry)) return

    this._entries = this._entries.filter((candidate) => candidate !== entry)
    this._publish()
  }

  private async _flushForQuit(retryQuit: () => void) {
    const now = performance.now()
    const writes = new Set([...this._writes.values(), ...this._entries.map((entry) => this._stop(entry, now))])
    const results = await Promise.allSettled(writes)
    const failure = results.find((result) => result.status === "rejected")
    if (failure) {
      this._isFlushingQuit = false
      this._reportSaveFailure(failure.reason)
      return
    }

    // Electron finishes the prevented before-quit event before it can accept a second quit.
    setImmediate(() => {
      this._isFlushingQuit = false
      retryQuit()
    })
  }

  private _publish() {
    this._broadcast(this.getTimers())
  }
}

function elapsedAt({elapsedMs, startedAt}: TimerEntry, now: number) {
  return startedAt === null ? elapsedMs : elapsedMs + (now - startedAt)
}
