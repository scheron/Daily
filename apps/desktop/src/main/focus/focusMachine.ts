import {clamp} from "@daily/std"

import {FOCUS_DURATIONS} from "@shared/constants/focus"

import type {Task} from "@daily/protocol"
import type {FocusCommand, FocusMode, FocusSession} from "@shared/types/focus"

export type FocusWrite = {taskId: Task["id"]; seconds: number; isDone: boolean}
export type FocusStep = {session: FocusSession; writes: FocusWrite[]}

export function createFocusSession(mode: FocusMode = "pomodoro-25"): FocusSession {
  return {
    phase: "collect",
    mode,
    tasks: [],
    currentTaskId: null,
    runStartedAt: null,
    intervalFocusedSeconds: 0,
    completedIntervals: 0,
    isDetached: false,
  }
}

/** The session after `command`, and the focus time each task earned by it. A command the phase does not allow returns the same session. */
export function transition(session: FocusSession, command: FocusCommand, now: Date): FocusStep {
  if (command.type === "detach" || command.type === "attach") {
    const isDetached = command.type === "detach"
    return keep(session.isDetached === isDetached ? session : {...session, isDetached})
  }

  switch (session.phase) {
    case "collect":
      return inCollect(session, command, now)
    case "focus":
      return inFocus(session, command, now)
    case "pause":
      if (command.type === "resume") return keep({...session, phase: "focus", runStartedAt: now.toISOString()})
      if (command.type === "stop") return keep(toSummary(session))
      return keep(session)
    case "break":
      return keep(command.type === "skip-break" ? startInterval(session, now) : session)
    case "summary":
      return keep(command.type === "close" ? {...createFocusSession(session.mode), isDetached: session.isDetached} : session)
  }
}

/** Ends the pomodoro interval or the break whose deadline `now` has reached. Before the deadline, and in timer mode, returns the same session. */
export function advance(session: FocusSession, now: Date): FocusStep {
  const deadline = endsAt(session)
  if (!deadline || now < deadline) return keep(session)
  if (session.phase === "break") return keep(startInterval(session, now))

  const {session: ended, writes} = endStretch(session, deadline, false)
  const onBreak: FocusSession = {
    ...ended,
    phase: "break",
    runStartedAt: now.toISOString(),
    intervalFocusedSeconds: 0,
    completedIntervals: session.completedIntervals + 1,
  }
  return {session: onBreak, writes}
}

/** When the running pomodoro interval or break ends, or `null` when nothing is due: a pause, a timer, no session running. */
export function endsAt(session: FocusSession): Date | null {
  const durations = FOCUS_DURATIONS[session.mode]
  if (!durations || !session.runStartedAt) return null

  const seconds = session.phase === "focus" ? durations.focusSeconds - session.intervalFocusedSeconds : durations.breakSeconds
  return new Date(Date.parse(session.runStartedAt) + seconds * 1000)
}

export function retitle(session: FocusSession, taskId: Task["id"], title: string): FocusSession {
  const index = indexOfTask(session, taskId)
  if (index === -1 || session.tasks[index].title === title) return session

  return {...session, tasks: session.tasks.with(index, {...session.tasks[index], title})}
}

/**
 * The session without `taskId`. When it was the current task, the next unfinished one takes over, or the summary when none is left;
 * a focus stretch running on it is written first, unless the task was deleted. The summary is a record and keeps every task.
 */
export function leave(session: FocusSession, taskId: Task["id"], now: Date, isDeleted: boolean): FocusStep {
  const index = indexOfTask(session, taskId)
  if (index === -1 || session.phase === "summary") return keep(session)
  if (session.currentTaskId !== taskId) return keep({...session, tasks: session.tasks.toSpliced(index, 1)})

  const {session: ended, writes} = session.phase === "focus" ? endStretch(session, now, false) : keep(session)
  return {session: toNextTask({...ended, tasks: ended.tasks.toSpliced(index, 1)}, now), writes: isDeleted ? [] : writes}
}

function inCollect(session: FocusSession, command: FocusCommand, now: Date): FocusStep {
  switch (command.type) {
    case "add": {
      if (indexOfTask(session, command.taskId) !== -1) return keep(session)
      const task = {taskId: command.taskId, title: "", focusedSeconds: 0, isDone: false}
      return keep({...session, tasks: session.tasks.toSpliced(clamp(command.index, 0, session.tasks.length), 0, task)})
    }
    case "remove": {
      const index = indexOfTask(session, command.taskId)
      return keep(index === -1 ? session : {...session, tasks: session.tasks.toSpliced(index, 1)})
    }
    case "move": {
      const index = indexOfTask(session, command.taskId)
      if (index === -1) return keep(session)
      const rest = session.tasks.toSpliced(index, 1)
      const target = clamp(command.index, 0, rest.length)
      return keep(target === index ? session : {...session, tasks: rest.toSpliced(target, 0, session.tasks[index])})
    }
    case "set-mode":
      return keep(command.mode === session.mode ? session : {...session, mode: command.mode})
    case "start":
      if (!session.tasks.length) return keep(session)
      return keep({...startInterval(session, now), currentTaskId: firstUnfinishedId(session), completedIntervals: 0})
    default:
      return keep(session)
  }
}

function inFocus(session: FocusSession, command: FocusCommand, now: Date): FocusStep {
  switch (command.type) {
    case "pause": {
      const {session: ended, writes} = endStretch(session, now, false)
      return {session: {...ended, phase: "pause"}, writes}
    }
    case "done": {
      const {session: ended, writes} = endStretch(session, now, true)
      return {session: toNextTask(ended, now), writes}
    }
    case "stop": {
      const {session: ended, writes} = endStretch(session, now, false)
      return {session: toSummary(ended), writes}
    }
    default:
      return keep(session)
  }
}

function endStretch(session: FocusSession, end: Date, isDone: boolean): FocusStep {
  const taskId = session.currentTaskId as Task["id"]
  const seconds = Math.max(0, Math.round((end.getTime() - Date.parse(session.runStartedAt as string)) / 1000))
  const tasks = session.tasks.map((task) => (task.taskId === taskId ? {...task, focusedSeconds: task.focusedSeconds + seconds, isDone} : task))

  return {
    session: {...session, tasks, runStartedAt: null, intervalFocusedSeconds: session.intervalFocusedSeconds + seconds},
    writes: seconds > 0 || isDone ? [{taskId, seconds, isDone}] : [],
  }
}

function startInterval(session: FocusSession, now: Date): FocusSession {
  return {...session, phase: "focus", runStartedAt: now.toISOString(), intervalFocusedSeconds: 0}
}

function toNextTask(session: FocusSession, now: Date): FocusSession {
  const currentTaskId = firstUnfinishedId(session)
  if (!currentTaskId) return toSummary(session)

  return session.phase === "focus" ? {...session, currentTaskId, runStartedAt: now.toISOString()} : {...session, currentTaskId}
}

function toSummary(session: FocusSession): FocusSession {
  return {...session, phase: "summary", currentTaskId: null, runStartedAt: null}
}

function indexOfTask(session: FocusSession, taskId: Task["id"]): number {
  return session.tasks.findIndex((task) => task.taskId === taskId)
}

function firstUnfinishedId(session: FocusSession): Task["id"] | null {
  return session.tasks.find((task) => !task.isDone)?.taskId ?? null
}

function keep(session: FocusSession): FocusStep {
  return {session, writes: []}
}
