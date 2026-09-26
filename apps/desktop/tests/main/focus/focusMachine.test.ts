import {describe, expect, it} from "vitest"

import {advance, createFocusSession, endsAt, leave, transition} from "../../../src/main/focus/focusMachine"

import type {FocusCommand, FocusPhase, FocusSession, FocusSessionTask} from "../../../src/shared/types/focus"

const T0 = new Date("2026-09-26T10:00:00.000Z")

function at(seconds: number) {
  return new Date(T0.getTime() + seconds * 1000)
}

function makeTask(overrides: Partial<FocusSessionTask> = {}): FocusSessionTask {
  return {taskId: "t1", title: "Task", focusedSeconds: 0, isDone: false, ...overrides}
}

function makeSession(overrides: Partial<FocusSession> = {}): FocusSession {
  return {...createFocusSession(), ...overrides}
}

function sessionIn(phase: FocusPhase, overrides: Partial<FocusSession> = {}): FocusSession {
  const tasks =
    phase === "collect"
      ? [makeTask({taskId: "t1"}), makeTask({taskId: "t2"}), makeTask({taskId: "t3"})]
      : [makeTask({taskId: "t1", isDone: true}), makeTask({taskId: "t2"}), makeTask({taskId: "t3"})]
  const currentTaskId = phase === "focus" || phase === "pause" || phase === "break" ? "t2" : null
  const runStartedAt = phase === "focus" || phase === "break" ? T0.toISOString() : null

  return makeSession({phase, tasks, currentTaskId, runStartedAt, ...overrides})
}

function run(session: FocusSession, steps: [FocusCommand, number][]) {
  const writes: {taskId: string; seconds: number; isDone: boolean}[] = []
  let current = session
  for (const [command, seconds] of steps) {
    const step = transition(current, command, at(seconds))
    writes.push(...step.writes)
    current = step.session
  }
  return {session: current, writes}
}

describe("focusMachine", () => {
  const commands: FocusCommand[] = [
    {type: "add", taskId: "t9", index: 0},
    {type: "remove", taskId: "t2"},
    {type: "move", taskId: "t3", index: 0},
    {type: "set-mode", mode: "timer"},
    {type: "start"},
    {type: "pause"},
    {type: "resume"},
    {type: "done"},
    {type: "stop"},
    {type: "skip-break"},
    {type: "close"},
    {type: "detach"},
    {type: "attach"},
  ]

  const accepted: Record<FocusPhase, FocusCommand["type"][]> = {
    collect: ["add", "remove", "move", "set-mode", "start", "detach", "attach"],
    focus: ["pause", "done", "stop", "detach", "attach"],
    pause: ["resume", "stop", "detach", "attach"],
    break: ["skip-break", "detach", "attach"],
    summary: ["close", "detach", "attach"],
  }

  const cases = (Object.keys(accepted) as FocusPhase[]).flatMap((phase) =>
    commands.map((command) => ({phase, command, isAccepted: accepted[phase].includes(command.type)})),
  )

  it.each(cases)("in $phase, $command.type is accepted: $isAccepted", ({phase, command, isAccepted}) => {
    const session = sessionIn(phase, {isDetached: command.type === "attach"})

    const step = transition(session, command, at(60))

    if (isAccepted) expect(step.session).not.toEqual(session)
    else expect(step).toEqual({session, writes: []})
  })

  it("makes the first unfinished task in the list's order current", () => {
    const {session: started} = run(sessionIn("collect"), [
      [{type: "move", taskId: "t3", index: 0}, 0],
      [{type: "start"}, 0],
    ])
    expect(started.currentTaskId).toBe("t3")

    const afterDone = transition(started, {type: "done"}, at(30)).session
    expect(afterDone.currentTaskId).toBe("t1")
  })

  it("adds at the index, ignores a task already listed, moves to the index in the resulting list, and starts only with a task", () => {
    const {session} = run(makeSession(), [
      [{type: "add", taskId: "a", index: 0}, 0],
      [{type: "add", taskId: "b", index: 5}, 0],
      [{type: "add", taskId: "c", index: 1}, 0],
      [{type: "add", taskId: "a", index: 2}, 0],
      [{type: "move", taskId: "b", index: 0}, 0],
      [{type: "remove", taskId: "c"}, 0],
    ])
    expect(session.tasks.map((task) => task.taskId)).toEqual(["b", "a"])

    const empty = makeSession()
    expect(transition(empty, {type: "start"}, at(0))).toEqual({session: empty, writes: []})
  })

  it("keeps the interval running across Done, and writes each task its part of it", () => {
    const started = transition(sessionIn("collect"), {type: "start"}, at(0)).session
    const afterDone = transition(started, {type: "done"}, at(600))

    expect(afterDone.writes).toEqual([{taskId: "t1", seconds: 600, isDone: true}])
    expect(afterDone.session.runStartedAt).toBe(at(600).toISOString())
    expect(endsAt(afterDone.session)).toEqual(at(1500))

    const intervalEnd = advance(afterDone.session, at(1500))
    expect(intervalEnd.writes).toEqual([{taskId: "t2", seconds: 900, isDone: false}])
    expect(intervalEnd.session).toMatchObject({phase: "break", currentTaskId: "t2", completedIntervals: 1, intervalFocusedSeconds: 0})
  })

  it("adds pauses and resumes up, and moves the interval's end by the paused time", () => {
    const started = transition(sessionIn("collect"), {type: "start"}, at(0)).session
    const {session, writes} = run(started, [
      [{type: "pause"}, 40],
      [{type: "resume"}, 100],
    ])

    expect(writes).toEqual([{taskId: "t1", seconds: 40, isDone: false}])
    expect(endsAt(session)).toEqual(at(100 + 1500 - 40))

    const paused = transition(session, {type: "pause"}, at(130))
    expect(paused.writes).toEqual([{taskId: "t1", seconds: 30, isDone: false}])
    expect(paused.session.tasks[0].focusedSeconds).toBe(70)
    expect(paused.session.intervalFocusedSeconds).toBe(70)
  })

  it("counts a stretch to the nearest second, and writes no time for a stretch that rounds to zero unless it is Done", () => {
    const started = transition(sessionIn("collect"), {type: "start"}, at(0)).session

    expect(transition(started, {type: "pause"}, at(40.6)).writes).toEqual([{taskId: "t1", seconds: 41, isDone: false}])
    expect(transition(started, {type: "pause"}, at(0.4)).writes).toEqual([])
    expect(transition(started, {type: "done"}, at(0.4)).writes).toEqual([{taskId: "t1", seconds: 0, isDone: true}])
  })

  it("counts an interval that ends late only up to its deadline, and starts the break when the end fires", () => {
    const started = transition(sessionIn("collect"), {type: "start"}, at(0)).session

    const {session, writes} = advance(started, at(1507))

    expect(writes).toEqual([{taskId: "t1", seconds: 1500, isDone: false}])
    expect(session).toMatchObject({phase: "break", runStartedAt: at(1507).toISOString()})
  })

  it("never breaks in timer mode", () => {
    const started = transition(sessionIn("collect", {mode: "timer"}), {type: "start"}, at(0)).session

    expect(endsAt(started)).toBeNull()
    expect(advance(started, at(3 * 60 * 60))).toEqual({session: started, writes: []})
  })

  it("ends a break into a fresh interval on the same task, and does nothing before a deadline", () => {
    const onBreak = sessionIn("break", {completedIntervals: 1})

    expect(advance(onBreak, at(299))).toEqual({session: onBreak, writes: []})

    const {session, writes} = advance(onBreak, at(300))
    expect(writes).toEqual([])
    expect(session).toMatchObject({
      phase: "focus",
      currentTaskId: "t2",
      runStartedAt: at(300).toISOString(),
      intervalFocusedSeconds: 0,
      completedIntervals: 1,
    })
    expect(endsAt(session)).toEqual(at(300 + 1500))
  })

  it("goes to the summary on the last Done and on Stop, writing only focus time", () => {
    const lastTask = sessionIn("focus", {tasks: [makeTask({taskId: "t1", isDone: true}), makeTask({taskId: "t2"})]})
    const afterDone = transition(lastTask, {type: "done"}, at(90))
    expect(afterDone.writes).toEqual([{taskId: "t2", seconds: 90, isDone: true}])
    expect(afterDone.session).toMatchObject({phase: "summary", currentTaskId: null, runStartedAt: null})
    expect(afterDone.session.tasks.map((task) => [task.taskId, task.focusedSeconds, task.isDone])).toEqual([
      ["t1", 0, true],
      ["t2", 90, true],
    ])

    const stoppedInFocus = transition(sessionIn("focus"), {type: "stop"}, at(45))
    expect(stoppedInFocus.writes).toEqual([{taskId: "t2", seconds: 45, isDone: false}])
    expect(stoppedInFocus.session).toMatchObject({phase: "summary", currentTaskId: null, runStartedAt: null})

    const stoppedInPause = transition(sessionIn("pause"), {type: "stop"}, at(45))
    expect(stoppedInPause.writes).toEqual([])
    expect(stoppedInPause.session.phase).toBe("summary")
  })

  it("keeps the summary as a record: a task that leaves elsewhere stays in it", () => {
    const summary = sessionIn("summary")

    expect(leave(summary, "t2", at(0), false)).toEqual({session: summary, writes: []})
    expect(leave(summary, "t3", at(0), true)).toEqual({session: summary, writes: []})
  })

  it("closes the summary into an empty collect that keeps the mode and the window", () => {
    const summary = sessionIn("summary", {mode: "pomodoro-50", completedIntervals: 3, isDetached: true})

    expect(transition(summary, {type: "close"}, at(0)).session).toEqual({
      phase: "collect",
      mode: "pomodoro-50",
      tasks: [],
      currentTaskId: null,
      runStartedAt: null,
      intervalFocusedSeconds: 0,
      completedIntervals: 0,
      isDetached: true,
    })
  })
})
