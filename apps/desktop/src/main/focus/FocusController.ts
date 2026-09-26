import {app, BrowserWindow, Notification, powerMonitor} from "electron"

import {logger} from "@daily/core"

import {toTaskTitle} from "@shared/utils/tasks/toTaskTitle"
import {advance, createFocusSession, endsAt, leave, retitle, transition} from "./focusMachine"

import type {Changeset, StorageController} from "@daily/core"
import type {Task} from "@daily/protocol"
import type {FocusCommand, FocusSession} from "@shared/types/focus"
import type {FocusStep, FocusWrite} from "./focusMachine"

/** Holds the app's one focus session, runs its clock, and writes the focus time and Done it earns into the tasks. */
export class FocusController {
  private session = createFocusSession()
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null
  private pendingWrites: Promise<void> = Promise.resolve()

  constructor(
    private storage: StorageController,
    private broadcast: (session: FocusSession) => void,
  ) {
    powerMonitor.on("suspend", () => void this.dispatch({type: "pause"}))
    powerMonitor.on("resume", () => this.scheduleDeadline())
  }

  getSession(): FocusSession {
    return this.session
  }

  /** Runs `command` and resolves with the session once the time and status it earned are written. An `add` of a task that is missing or resolved changes nothing. */
  async dispatch(command: FocusCommand): Promise<FocusSession> {
    if (command.type === "add") await this.add(command)
    else this.apply(transition(this.session, command, new Date()))

    await this.pendingWrites
    return this.session
  }

  /**
   * Holds a quit while a running focus stretch is written, then quits again. Returns whether it held this quit, so the caller leaves its own
   * teardown to the next one. The second quit waits for a later task: the write settles in microtasks that Electron drains before the held
   * `before-quit` returns, and a quit from there is overwritten by the held one, which closes the windows and leaves the app running.
   */
  holdQuit(event: {preventDefault(): void}): boolean {
    if (this.session.phase !== "focus") return false

    event.preventDefault()
    void this.dispatch({type: "pause"}).then(() => setImmediate(() => app.quit()))
    return true
  }

  /** Follows a change from any source: a session task deleted, done or discarded elsewhere leaves the session, and an edited one takes its new title. */
  applyStorageChange(changeset: Changeset) {
    const now = new Date()

    for (const taskId of changeset.tasks?.removed ?? []) this.apply(leave(this.session, taskId, now, true))
    for (const task of changeset.tasks?.upserted ?? []) this.apply(this.follow(task, now))
  }

  private async add(command: Extract<FocusCommand, {type: "add"}>) {
    const task = await this.storage.getTask(command.taskId)
    if (!task || task.deletedAt || isResolved(task)) return

    const step = transition(this.session, command, new Date())
    this.apply({...step, session: retitle(step.session, task.id, toTaskTitle(task.content))})
  }

  private follow(task: Task, now: Date): FocusStep {
    const entry = this.session.tasks.find((candidate) => candidate.taskId === task.id)
    if (!entry) return {session: this.session, writes: []}
    if (task.deletedAt) return leave(this.session, task.id, now, true)
    if (!entry.isDone && isResolved(task)) return leave(this.session, task.id, now, false)

    return {session: retitle(this.session, task.id, toTaskTitle(task.content)), writes: []}
  }

  private apply({session, writes}: FocusStep) {
    if (session === this.session) return

    this.session = session
    this.scheduleDeadline()
    this.broadcast(session)
    for (const write of writes) this.pendingWrites = this.pendingWrites.then(() => this.write(write))
  }

  private scheduleDeadline() {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer)
    this.deadlineTimer = null

    const deadline = endsAt(this.session)
    if (deadline) this.deadlineTimer = setTimeout(() => this.onDeadline(), Math.max(0, deadline.getTime() - Date.now()))
  }

  private onDeadline() {
    const step = advance(this.session, new Date())
    if (step.session === this.session) return this.scheduleDeadline()

    this.apply(step)
    if (!BrowserWindow.getFocusedWindow()) void this.notify(step.session)
  }

  private async notify(session: FocusSession) {
    const {focus} = await this.storage.loadSettings()
    if (!focus.shouldNotify) return

    const silent = !focus.shouldPlaySound

    if (session.phase === "break") {
      const minutes = ((endsAt(session) as Date).getTime() - Date.parse(session.runStartedAt as string)) / 60_000
      new Notification({title: "Focus interval done", body: `Take a ${minutes}-minute break.`, silent}).show()
      return
    }

    const current = session.tasks.find((task) => task.taskId === session.currentTaskId)
    new Notification({title: "Break over", body: `Back to: ${current?.title}`, silent}).show()
  }

  private async write({taskId, seconds, isDone}: FocusWrite) {
    try {
      const task = await this.storage.getTask(taskId)
      if (!task) return

      const spentTime = task.spentTime + seconds
      await this.storage.updateTask(taskId, isDone ? {spentTime, status: "done"} : {spentTime}, {kind: "manual"})
    } catch (error) {
      logger.error(logger.CONTEXT.TASKS, "Failed to write focus time", error)
    }
  }
}

function isResolved(task: Task): boolean {
  return task.status === "done" || task.status === "discarded"
}
