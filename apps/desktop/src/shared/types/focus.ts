import type {ISODateTime, Task} from "@daily/protocol"

export type FocusMode = "pomodoro-25" | "pomodoro-50" | "timer"
export type FocusPhase = "collect" | "focus" | "pause" | "break" | "summary"

export type FocusSessionTask = {
  taskId: Task["id"]
  /** The first line of the task's text, as plain text. Main refreshes it when the task changes. */
  title: string
  focusedSeconds: number
  isDone: boolean
}

export type FocusSession = {
  phase: FocusPhase
  mode: FocusMode
  tasks: FocusSessionTask[]
  currentTaskId: Task["id"] | null
  /** Set in `focus` and `break` only, and null elsewhere. */
  runStartedAt: ISODateTime | null
  /** The focus time in the current interval, before `runStartedAt`. */
  intervalFocusedSeconds: number
  completedIntervals: number
  isDetached: boolean
}

export type FocusCommand =
  | {type: "add"; taskId: Task["id"]; index: number}
  | {type: "remove"; taskId: Task["id"]}
  | {type: "move"; taskId: Task["id"]; index: number}
  | {type: "set-mode"; mode: FocusMode}
  | {type: "start"}
  | {type: "pause"}
  | {type: "resume"}
  | {type: "done"}
  | {type: "stop"}
  | {type: "skip-break"}
  | {type: "close"}
  | {type: "detach"}
  | {type: "attach"}
